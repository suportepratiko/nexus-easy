"""
Backend FastAPI: proxy para a API da corretora Safirion + auth da plataforma (PostgreSQL).
"""
from __future__ import annotations

import os
import sys
import uuid
import logging
import threading
import time
from pathlib import Path
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

# Garantir que a raiz do projeto está no path para importar safirionapi
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

# Carregar .env da raiz do projeto (DATABASE_URL, etc.)
try:
    from dotenv import load_dotenv
    load_dotenv(_ROOT / ".env")
except ImportError:
    pass

from fastapi import FastAPI, HTTPException, Depends, Request, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel
import jwt
import json
import asyncio
from typing import Dict, List, Any
from sqlalchemy.orm import Session
from passlib.hash import bcrypt
from cryptography.fernet import Fernet
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Importações da safirionapi (após path ajustado)
try:
    from safirionapi.stable_api import Safirion
except ImportError as e:
    logging.warning("safirionapi não disponível: %s. Endpoints da corretora desabilitados.", e)
    Safirion = None

from backend.database import (
    get_engine,
    SessionLocal,
    User,
    UserRole,
    Webhook,
    WebhookPayload,
    Plan,
    PlanPeriod,
    UserOperation,
    CustomStrategy,
    PushSubscription,
    PwaMessageTemplate,
    PwaCustomMessage,
    UserPushPreferences,
    SmtpConfig,
    EmailTemplate,
    EmailLog,
    ExtraLink,
    init_db,
)
from backend.broker_sessions import BrokerSessionsManager
from backend.email_service import (
    EMAIL_EVENT_TYPES,
    EMAIL_TEMPLATE_VARIABLES,
    encrypt_smtp_password,
    decrypt_smtp_password,
    send_email,
    test_smtp_connection,
    trigger_email,
)

# Configuração de log mais verbosa para acompanhar o robô em detalhe
logging.basicConfig(
    level=logging.ERROR,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logging.getLogger().setLevel(logging.ERROR)

# Silenciar loggers verbosos de bibliotecas externas
for _noisy in (
    "uvicorn", "uvicorn.access", "uvicorn.error",
    "fastapi", "sqlalchemy", "sqlalchemy.engine",
    "httpx", "httpcore", "websockets", "asyncio",
    "multipart", "python_multipart",
):
    logging.getLogger(_noisy).setLevel(logging.CRITICAL)

# Garantir que as tabelas necessárias existam (idempotente)
try:
    init_db()
except Exception as e:  # pragma: no cover - apenas log de inicialização
    logging.error("Falha ao inicializar o banco de dados: %s", e)

# Sessões de corretora isoladas por processo (1 processo por login Safirion).
_broker_sessions = BrokerSessionsManager()

JWT_SECRET = os.environ.get("JWT_SECRET", "nexus-dev-secret-change-in-production")
if JWT_SECRET in ("nexus-dev-secret-change-in-production", "", "change-me"):
    logging.warning("⚠️  JWT_SECRET está com valor padrão inseguro! Defina JWT_SECRET no .env antes de ir para produção.")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Criptografia para senhas da corretora (Fernet / AES-128-CBC)
_BROKER_ENC_KEY = os.environ.get("BROKER_ENC_KEY", "")
if not _BROKER_ENC_KEY:
    raise RuntimeError(
        "❌  BROKER_ENC_KEY não definida no .env. "
        "Gere uma chave com: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\" "
        "e adicione ao .env antes de iniciar o servidor."
    )
try:
    _fernet = Fernet(_BROKER_ENC_KEY.encode())
except Exception as e:
    raise RuntimeError(f"❌  BROKER_ENC_KEY inválida: {e}. Gere uma nova chave Fernet válida.")

def _encrypt_password(plain: str) -> str:
    """Criptografa a senha antes de salvar no banco."""
    if _fernet:
        return "enc:" + _fernet.encrypt(plain.encode()).decode()
    return plain  # fallback sem criptografia (sem chave configurada)

def _decrypt_password(stored: str) -> str:
    """Descriptografa a senha lida do banco."""
    if _fernet and stored.startswith("enc:"):
        return _fernet.decrypt(stored[4:].encode()).decode()
    return stored  # plaintext legado ou sem chave


# ---------- WebSocket Management ----------

class ConnectionManager:
    _MAX_CONNECTIONS_PER_TOKEN = 10  # limite de conexões simultâneas por token

    def __init__(self):
        # Mapeia token_corretora -> lista de websocket ativos
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, token: str):
        await websocket.accept()
        async with self._lock:
            if token not in self.active_connections:
                self.active_connections[token] = []
            conns = self.active_connections[token]
            # Remove conexões mortas e limita total por token
            if len(conns) >= self._MAX_CONNECTIONS_PER_TOKEN:
                oldest = conns.pop(0)
                try:
                    await oldest.close()
                except Exception:
                    pass
            conns.append(websocket)

    async def disconnect(self, websocket: WebSocket, token: str):
        async with self._lock:
            if token in self.active_connections:
                if websocket in self.active_connections[token]:
                    self.active_connections[token].remove(websocket)
                if not self.active_connections[token]:
                    del self.active_connections[token]

    async def broadcast(self, token: str, data: Any):
        async with self._lock:
            conns = list(self.active_connections.get(token, []))
        # Enviar fora do lock para não bloquear outros
        disconnected = []
        for connection in conns:
            try:
                await connection.send_json(data)
            except Exception:
                disconnected.append(connection)
        if disconnected:
            async with self._lock:
                for conn in disconnected:
                    if token in self.active_connections and conn in self.active_connections[token]:
                        self.active_connections[token].remove(conn)
                    if token in self.active_connections and not self.active_connections[token]:
                        del self.active_connections[token]

manager = ConnectionManager()


class LoginRequest(BaseModel):
    email: str
    password: str
    remember: bool | None = False


class LoginResponse(BaseModel):
    token: str
    message: str


# ---------- Platform Auth (PostgreSQL) ----------

class PlatformLoginRequest(BaseModel):
    email: str
    password: str


class PlatformLoginResponse(BaseModel):
    token: str
    user: dict


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_access_token(email: str, role: str, token_version: int | None = None) -> str:
    expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {"sub": email, "role": role, "exp": expire}
    if token_version is not None:
        payload["v"] = token_version
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    # Ler header direto do request (proxy/casing podem alterar o nome)
    authorization = request.headers.get("Authorization") or request.headers.get("authorization")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token ausente.")
    token = authorization.replace("Bearer ", "").strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Token inválido.")
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(status_code=401, detail="Usuário não encontrado.")
        # Uma sessão por conta: token deve ter a versão atual (novo login ou vencido invalida as demais)
        token_v = payload.get("v")
        if token_v is None:
            token_v = 0  # Token antigo sem "v" = versão 0
        user_v = getattr(user, "token_version", 0) or 0
        if user_v != token_v:
            raise HTTPException(
                status_code=401,
                detail="Sua sessão foi encerrada devido a sua assinatura ter vencido ou outro fez login nesta conta. Faça login novamente.",
            )
        # Bloquear acesso se assinatura estiver vencida (mesmo com token válido)
        now = datetime.now(timezone.utc)
        expires_at = getattr(user, "expires_at", None)
        if expires_at is not None:
            exp_aware = expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=timezone.utc)
            if exp_aware < now:
                raise HTTPException(
                    status_code=401,
                    detail="Sua assinatura está vencida. Entre em contato para renovar seu acesso.",
                )
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido.")


def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    """Exige role admin. Usuário comum recebe 403."""
    if (getattr(current_user, "role", None) or "").lower() != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado. Apenas administradores.")
    return current_user


class BalanceItem(BaseModel):
    id: int
    amount: float
    currency: str | None = None
    type: int | None = None


def get_session_token(authorization: str | None) -> str | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return authorization.replace("Bearer ", "").strip()


def get_safirion(token: str) -> Safirion:
    # Mantido por compatibilidade com tipagem/fluxos legados.
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Acesso direto à sessão Safirion foi desativado. Use o gerenciador de sessões.",
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # Encerrar sessões/processos de corretora ao desligar.
    _broker_sessions.close_all()


# Rate limiter global
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="API Safirion (Proxy)",
    description="Backend que integra a API da corretora Safirion ao frontend.",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Origens permitidas — lê do .env e adiciona locais de dev
_ALLOWED_ORIGINS_ENV = os.environ.get("ALLOWED_ORIGINS", "")
_ALLOWED_ORIGINS = [o.strip() for o in _ALLOWED_ORIGINS_ENV.split(",") if o.strip()] or [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:8080",
    "http://localhost:5173",
    "http://127.0.0.1:8080",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Internal-Secret"],
)

# Middleware de headers de segurança
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
        return response

app.add_middleware(SecurityHeadersMiddleware)


@app.get("/health")
def health():
    """Health check para Docker e load balancers."""
    return {"status": "ok", "safirion_available": Safirion is not None}


# ---------- Platform Auth (login na plataforma: user/admin) ----------

@app.post("/api/platform/auth/login", response_model=PlatformLoginResponse)
@limiter.limit("10/minute")
def platform_login(request: Request, body: PlatformLoginRequest, db: Session = Depends(get_db)):
    """Login na plataforma (email/senha no PostgreSQL). Uma sessão por conta: novo login invalida o anterior."""
    user = db.query(User).filter(User.email == body.email.strip().lower()).first()
    if not user or not bcrypt.verify(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")
    # Impedir login de usuário com assinatura vencida
    now = datetime.now(timezone.utc)
    expires_at = getattr(user, "expires_at", None)
    if expires_at is not None:
        exp_aware = expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=timezone.utc)
        if exp_aware < now:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Sua assinatura está vencida. Entre em contato para renovar seu acesso.",
            )
    # Multi-dispositivo: não invalida sessões anteriores. Todos os tokens com mesma versão funcionam.
    current_v = getattr(user, "token_version", 0) or 0
    token = create_access_token(user.email, user.role, token_version=current_v)
    return PlatformLoginResponse(
        token=token,
        user={"email": user.email, "role": user.role},
    )


@app.get("/api/platform/auth/me")
def platform_me(current_user: User = Depends(get_current_user)):
    """Retorna o usuário atual (requer Bearer token)."""
    return {
        "email": current_user.email,
        "role": current_user.role,
        "name": getattr(current_user, "name", None) or None,
        "phone": getattr(current_user, "phone", None) or None,
        "cpf": getattr(current_user, "cpf", None) or None,
    }


class UpdateProfileBody(BaseModel):
    name: str | None = None
    phone: str | None = None
    cpf: str | None = None


@app.patch("/api/platform/profile")
def update_profile(
    body: UpdateProfileBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Atualiza nome, telefone e CPF do usuário logado."""
    if body.name is not None:
        current_user.name = body.name.strip() or None
    if body.phone is not None:
        current_user.phone = body.phone.strip() or None
    if body.cpf is not None:
        current_user.cpf = body.cpf.strip() or None
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return {
        "email": current_user.email,
        "role": current_user.role,
        "name": getattr(current_user, "name", None) or None,
        "phone": getattr(current_user, "phone", None) or None,
        "cpf": getattr(current_user, "cpf", None) or None,
    }


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


class ForgotPasswordBody(BaseModel):
    email: str


@app.post("/api/platform/auth/forgot-password")
@limiter.limit("3/minute")
def forgot_password(body: ForgotPasswordBody, request: Request, db: Session = Depends(get_db)):
    """Envia email com senha temporária para recuperação de acesso."""
    import secrets, string
    email = body.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    # Sempre retorna 200 para não vazar se email existe
    if not user:
        return {"message": "Se o e-mail estiver cadastrado, você receberá as instruções em breve."}
    # Gera senha temporária legível
    alphabet = string.ascii_letters + string.digits
    temp_password = "".join(secrets.choice(alphabet) for _ in range(10))
    user.password_hash = bcrypt.hash(temp_password)
    db.commit()
    try:
        from backend.email_service import trigger_email
        trigger_email("password_reset", user, extra_vars={"senha_temp": temp_password}, db=db)
    except Exception as e:
        logging.warning("Falha ao enviar email de recuperação: %s", e)
    return {"message": "Se o e-mail estiver cadastrado, você receberá as instruções em breve."}


@app.get("/api/platform/plans/public")
def get_plans_public(db: Session = Depends(get_db)):
    """Retorna planos ativos publicamente (sem autenticação) para landing page."""
    from backend.database import Plan as PlanModel, PlanPeriod as PlanPeriodModel
    ORDER = ["monthly", "quarterly", "semiannual", "annual"]
    plans = db.query(PlanModel).filter(PlanModel.is_active == True).all()
    result = []
    for p in plans:
        raw_periods = (
            db.query(PlanPeriodModel)
            .filter(PlanPeriodModel.plan_id == p.id, PlanPeriodModel.is_active == True)
            .all()
        )
        periods = sorted(
            raw_periods,
            key=lambda x: ORDER.index(x.period_type) if x.period_type in ORDER else 99,
        )
        if not periods:
            continue
        result.append({
            "id": str(p.id),
            "name": p.name,
            "code": p.code,
            "description": p.description,
            "periods": [
                {
                    "period_type": pp.period_type,
                    "price": float(pp.price_cents) if pp.price_cents else 0,
                    "checkout_url": pp.checkout_url,
                }
                for pp in periods
            ],
        })
    return result


@app.post("/api/platform/auth/change-password")
def change_password(
    body: ChangePasswordBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Troca a senha do usuário logado."""
    import bcrypt
    if not bcrypt.checkpw(body.current_password.encode(), current_user.password_hash.encode()):
        raise HTTPException(status_code=400, detail="Senha atual incorreta.")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="A nova senha deve ter pelo menos 6 caracteres.")
    hashed = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
    current_user.password_hash = hashed
    db.add(current_user)
    db.commit()
    return {"message": "Senha alterada com sucesso."}


# ---------- Admin: Métricas em tempo real ----------

# Rastreamento de usuários online via heartbeat (in-memory, sem banco)
_online_users: dict[str, float] = {}  # email -> último timestamp de heartbeat
_online_lock = threading.Lock()
_ONLINE_TIMEOUT_SEC = 90  # usuário considerado offline após 90s sem heartbeat


def _cleanup_online_users() -> None:
    cutoff = time.time() - _ONLINE_TIMEOUT_SEC
    with _online_lock:
        stale = [e for e, ts in _online_users.items() if ts < cutoff]
        for e in stale:
            del _online_users[e]


@app.post("/api/platform/heartbeat")
def heartbeat(current_user: User = Depends(get_current_user)):
    """Registra que o usuário está online. Chamado periodicamente pelo frontend."""
    _cleanup_online_users()
    with _online_lock:
        _online_users[current_user.email] = time.time()
    return {"ok": True}


@app.get("/api/platform/admin/metrics")
def admin_metrics(db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    """Retorna métricas em tempo real da plataforma."""
    import time as _time

    _cleanup_online_users()

    # Usuários online
    with _online_lock:
        online_emails = list(_online_users.keys())
    online_count = len(online_emails)

    # Sessões da corretora ativas (usuários conectados à corretora)
    all_sessions = _broker_sessions.get_all_sessions()
    broker_sessions_count = sum(1 for s in all_sessions if s["alive"])

    # Robôs rodando (sessões com bot ativo)
    # Precisamos checar o status do bot em cada sessão de processo ativo
    running_bots = []
    for sess in all_sessions:
        if not sess["alive"]:
            continue
        try:
            result = _broker_sessions.call(sess["token"], "bot_status", timeout_sec=3)
            if result and result.get("running"):
                email = sess["email"]
                # Busca usuário da plataforma pelo email da corretora (broker_email)
                db_user = db.query(User).filter(User.broker_email == email).first()
                running_bots.append({
                    "email": email,
                    "platform_email": db_user.email if db_user else None,
                    "account_mode": result.get("account_mode", "REAL"),
                    "total_profit": round(result.get("total_profit") or 0, 2),
                    "operations": len(result.get("operations") or []),
                })
        except Exception:
            pass

    # Total de usuários na plataforma
    total_users = db.query(User).filter(User.role != "admin").count()
    active_users = db.query(User).filter(User.role != "admin", User.is_active == True).count()

    # Operações de hoje
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    ops_today = db.query(UserOperation).filter(UserOperation.timestamp >= today_start).count()
    wins_today = db.query(UserOperation).filter(
        UserOperation.timestamp >= today_start,
        UserOperation.result == "win",
    ).count()
    losses_today = db.query(UserOperation).filter(
        UserOperation.timestamp >= today_start,
        UserOperation.result == "loss",
    ).count()

    # Lucro total hoje
    from sqlalchemy import func as sqlfunc
    profit_today_row = db.query(sqlfunc.sum(UserOperation.profit)).filter(
        UserOperation.timestamp >= today_start
    ).scalar()
    profit_today = round(float(profit_today_row or 0), 2)

    return {
        "online_users": online_count,
        "online_emails": online_emails,
        "broker_sessions": broker_sessions_count,
        "running_bots": len(running_bots),
        "running_bots_detail": running_bots,
        "total_users": total_users,
        "active_users": active_users,
        "ops_today": ops_today,
        "wins_today": wins_today,
        "losses_today": losses_today,
        "profit_today": profit_today,
        "win_rate_today": round(wins_today / ops_today * 100, 1) if ops_today > 0 else 0,
    }


# ---------- Admin (apenas role=admin) ----------

def _serialize_dt(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if hasattr(dt, "isoformat"):
        return dt.isoformat()
    return str(dt)


class AdminUserItem(BaseModel):
    id: str
    email: str
    role: str
    is_active: bool
    expires_at: str | None = None
    created_at: str | None = None
    name: str | None = None
    phone: str | None = None
    cpf: str | None = None
    plan: str | None = None


class AdminUsersResponse(BaseModel):
    users: list[AdminUserItem]
    total: int
    active: int
    inactive: int
    expiring_in_7_days: int


class AdminUserRankingItem(BaseModel):
    position: int
    email: str
    name: str | None = None
    total_profit: float
    operations_count: int
    last_operation_at: datetime | None = None


class AdminUserRankingResponse(BaseModel):
    items: list[AdminUserRankingItem]
    total_users: int
    period_start: datetime
    period_end: datetime


def _user_to_item(u: User, now: datetime, seven_days_later: datetime) -> tuple[AdminUserItem, bool, bool]:
    try:
        is_active = getattr(u, "is_active", True)
        if isinstance(is_active, str):
            is_active = is_active.lower() in ("true", "1", "yes")
        exp = getattr(u, "expires_at", None)
        created = getattr(u, "created_at", None)
        expiring = bool(exp and now <= exp <= seven_days_later)
        item = AdminUserItem(
            id=str(getattr(u, "id", "")),
            email=(u.email or "").strip() or "(sem email)",
            role=getattr(u, "role", "user") or "user",
            is_active=bool(is_active),
            expires_at=_serialize_dt(exp) if exp is not None else None,
            created_at=_serialize_dt(created) if created is not None else None,
            name=getattr(u, "name", None) or None,
            phone=getattr(u, "phone", None) or None,
            cpf=getattr(u, "cpf", None) or None,
            plan=getattr(u, "plan", None) or None,
        )
        return item, is_active, expiring
    except Exception:
        # Fallback: usuário criado por webhook ou dado estranho nunca fica de fora da lista
        uid = str(getattr(u, "id", ""))
        em = getattr(u, "email", None)
        return (
            AdminUserItem(
                id=uid,
                email=str(em).strip() if em else "(sem email)",
                role="user",
                is_active=True,
                expires_at=None,
                created_at=None,
                name=getattr(u, "name", None) or None,
                phone=getattr(u, "phone", None) or None,
                cpf=getattr(u, "cpf", None) or None,
                plan=getattr(u, "plan", None) or None,
            ),
            True,
            False,
        )


@app.get("/api/platform/admin/users")
def admin_list_users(
    search: str | None = None,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """Lista usuários (apenas admin). search: filtra por nome, email, telefone ou cpf. Retorno 100% JSON-serializable."""
    try:
        now = datetime.now(timezone.utc)
        seven_days_later = now + timedelta(days=7)
        q = db.query(User).order_by(User.email)
        if search and search.strip():
            term = f"%{search.strip().lower()}%"
            from sqlalchemy import or_
            q = q.filter(
                or_(
                    User.email.ilike(term),
                    User.name.ilike(term),
                    User.phone.ilike(term),
                    User.cpf.ilike(term),
                )
            )
        rows = q.all()
        plans_by_code: dict[str, str] = {p.code: p.name for p in db.query(Plan).all()}
        period_labels: dict[str, str] = {
            "monthly": "Mensal",
            "quarterly": "Trimestral",
            "semiannual": "Semestral",
            "annual": "Anual",
        }

        def infer_period_from_dates(created: datetime | None, expires: datetime | None) -> str | None:
            if not created or not expires or expires <= created:
                return None
            delta = (expires - created).total_seconds() / 86400
            if 25 <= delta <= 35:
                return "Mensal"
            if 85 <= delta <= 95:
                return "Trimestral"
            if 175 <= delta <= 190:
                return "Semestral"
            if 360 <= delta <= 370:
                return "Anual"
            return None

        def plan_display(plan_code: str | None, plan_period: str | None, u: User) -> str | None:
            if not plan_code:
                return None
            name = plans_by_code.get(plan_code) or plan_code
            period_label: str | None = None
            if plan_period:
                period_label = period_labels.get((plan_period or "").lower()) or (plan_period or "").capitalize()
            else:
                period_label = infer_period_from_dates(getattr(u, "created_at", None), getattr(u, "expires_at", None))
            if period_label:
                return f"{name} ({period_label})"
            return name

        users_out: list[dict] = []
        active = 0
        inactive = 0
        expiring_in_7 = 0
        for u in rows:
            try:
                item, is_act, expiring = _user_to_item(u, now, seven_days_later)
                d = item.model_dump()
                exp = getattr(u, "expires_at", None)
                d["status_display"] = "Vencido" if (exp and exp < now) else "Ativo"
                d["plan_display"] = plan_display(getattr(u, "plan", None), getattr(u, "plan_period", None), u)
                d["plan_period"] = getattr(u, "plan_period", None)
                users_out.append(d)
                if d["status_display"] == "Ativo":
                    active += 1
                else:
                    inactive += 1
                if expiring:
                    expiring_in_7 += 1
            except Exception as e:
                logging.warning("admin_list_users skip user %s: %s", getattr(u, "id", ""), e)
                continue
        return {
            "users": users_out,
            "total": len(users_out),
            "active": active,
            "inactive": inactive,
            "expiring_in_7_days": expiring_in_7,
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("admin_list_users failed: %s", e)
        raise HTTPException(status_code=500, detail="Erro ao listar usuários.")


@app.get("/api/platform/admin/users/ranking", response_model=AdminUserRankingResponse)
@app.post("/api/platform/admin/users/ranking", response_model=AdminUserRankingResponse)
def admin_user_ranking(
    preset: str = "current_month",
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int | None = 100,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """
    Ranking de usuários por lucro no período.
    - preset: today, 7d, 30d, 3m, current_month, custom.
    - start/end: usados quando preset=custom (ISO 8601).
    """
    now = datetime.utcnow()

    preset_normalized = (preset or "current_month").lower()

    if preset_normalized == "today":
        period_start = datetime(now.year, now.month, now.day)
        period_end = now
    elif preset_normalized == "7d":
        period_end = now
        period_start = now - timedelta(days=7)
    elif preset_normalized == "30d":
        period_end = now
        period_start = now - timedelta(days=30)
    elif preset_normalized in ("3m", "3months"):
        period_end = now
        period_start = now - timedelta(days=90)
    elif preset_normalized in ("current_month", "month"):
        period_start = datetime(now.year, now.month, 1)
        if now.month == 12:
            period_end = datetime(now.year + 1, 1, 1) - timedelta(microseconds=1)
        else:
            period_end = datetime(now.year, now.month + 1, 1) - timedelta(microseconds=1)
    elif preset_normalized == "custom" and start and end:
        period_start = start
        period_end = end
    else:
        # Fallback: mês atual
        period_start = datetime(now.year, now.month, 1)
        if now.month == 12:
            period_end = datetime(now.year + 1, 1, 1) - timedelta(microseconds=1)
        else:
            period_end = datetime(now.year, now.month + 1, 1) - timedelta(microseconds=1)

    from sqlalchemy import func as sa_func

    q = (
        db.query(
            UserOperation.user_email.label("email"),
            sa_func.coalesce(sa_func.sum(UserOperation.profit), 0.0).label("total_profit"),
            sa_func.count(UserOperation.id).label("operations_count"),
            sa_func.max(UserOperation.timestamp).label("last_operation_at"),
        )
        .filter(UserOperation.timestamp >= period_start, UserOperation.timestamp <= period_end)
        .group_by(UserOperation.user_email)
        .order_by(sa_func.coalesce(sa_func.sum(UserOperation.profit), 0.0).desc())
    )

    if limit and limit > 0:
        q = q.limit(limit)

    rows = q.all()
    emails = [r.email for r in rows if r.email]

    # Busca por broker_email (UserOperation.user_email = email da corretora) e por email (plataforma)
    users_by_broker: dict[str, User] = {}
    users_by_email: dict[str, User] = {}
    if emails:
        db_users = db.query(User).filter(
            (User.broker_email.in_(emails)) | (User.email.in_(emails))
        ).all()
        for u in db_users:
            if getattr(u, "broker_email", None):
                users_by_broker[(u.broker_email or "").strip().lower()] = u
            if u.email:
                users_by_email[u.email.strip().lower()] = u

    items: list[AdminUserRankingItem] = []
    for idx, row in enumerate(rows, start=1):
        key = (row.email or "").strip().lower()
        u = users_by_broker.get(key) or users_by_email.get(key)
        name = (getattr(u, "name", None) or "").strip() if u else ""
        if not name and row.email:
            name = (row.email or "").split("@")[0] or row.email
        items.append(
            AdminUserRankingItem(
                position=idx,
                email=row.email,
                name=name or (row.email or "").split("@")[0] if row.email else "—",
                total_profit=float(row.total_profit or 0.0),
                operations_count=int(row.operations_count or 0),
                last_operation_at=row.last_operation_at,
            )
        )

    return AdminUserRankingResponse(
        items=items,
        total_users=len(items),
        period_start=period_start,
        period_end=period_end,
    )


class AdminCreateUserBody(BaseModel):
    email: str
    password: str
    name: str | None = None
    phone: str | None = None
    cpf: str | None = None
    plan: str | None = None
    plan_period: str | None = None
    role: str = "user"
    expires_at: datetime | None = None


class AdminUpdateUserBody(BaseModel):
    email: str | None = None
    password: str | None = None
    name: str | None = None
    phone: str | None = None
    cpf: str | None = None
    plan: str | None = None
    plan_period: str | None = None
    role: str | None = None
    is_active: bool | None = None
    expires_at: datetime | None = None


@app.post("/api/platform/admin/users", status_code=status.HTTP_201_CREATED)
def admin_create_user(
    body: AdminCreateUserBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """Cria usuário (apenas admin)."""
    email = body.email.strip().lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="E-mail já cadastrado.")
    role = (body.role or "user").lower()
    if role not in ("user", "admin"):
        role = "user"
    plain_password = body.password.strip() if body.password and body.password.strip() else "Senha123!"
    password_hash = bcrypt.hash(plain_password)
    user = User(
        email=email,
        password_hash=password_hash,
        role=role,
        name=body.name.strip() or None if body.name else None,
        phone=body.phone.strip() or None if body.phone else None,
        cpf=body.cpf.strip() or None if body.cpf else None,
        plan=body.plan.strip() or None if body.plan else None,
        plan_period=body.plan_period.strip() or None if body.plan_period else None,
        expires_at=body.expires_at,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    # Gatilho de email: boas-vindas (inclui senha padrão para novo usuário)
    try:
        trigger_email("welcome", user, extra_vars={"senha_padrao": plain_password}, db=db)
    except Exception as _e:
        logging.warning("Falha ao disparar email de boas-vindas: %s", _e)
    now = datetime.utcnow()
    item, _, _ = _user_to_item(user, now, now + timedelta(days=7))
    return item


def _parse_user_id(user_id: str):
    try:
        uuid.UUID(user_id)
        return user_id
    except (ValueError, TypeError):
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")


def _get_user_by_id(db: Session, user_id: str) -> User | None:
    """Busca usuário por id (string UUID). Compatível com PostgreSQL UUID."""
    uid_str = _parse_user_id(user_id)
    from sqlalchemy.dialects.postgresql import UUID as PG_UUID
    from sqlalchemy import cast, String
    try:
        return db.query(User).filter(cast(User.id, String) == uid_str).first()
    except Exception:
        return db.query(User).filter(User.id == uid_str).first()


@app.patch("/api/platform/admin/users/{user_id}")
def admin_update_user(
    user_id: str,
    body: AdminUpdateUserBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """Atualiza usuário (apenas admin)."""
    user = _get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    if body.email is not None:
        email = body.email.strip().lower()
        other = db.query(User).filter(User.email == email, User.id != user.id).first()
        if other:
            raise HTTPException(status_code=400, detail="E-mail já em uso.")
        user.email = email
    if body.password is not None and body.password.strip():
        user.password_hash = bcrypt.hash(body.password)
    if body.name is not None:
        user.name = body.name.strip() or None
    if body.phone is not None:
        user.phone = body.phone.strip() or None
    if body.cpf is not None:
        user.cpf = body.cpf.strip() or None
    if body.plan is not None:
        user.plan = body.plan.strip() or None
    if body.plan_period is not None:
        user.plan_period = body.plan_period.strip() or None
    if body.role is not None:
        r = body.role.lower()
        if r in ("user", "admin"):
            user.role = r
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.expires_at is not None:
        user.expires_at = body.expires_at
        # Ao mudar para vencido (data no passado), invalidar sessão atual para deslogar na hora
        now = datetime.now(timezone.utc)
        exp = body.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < now:
            user.token_version = (getattr(user, "token_version", 0) or 0) + 1
    db.commit()
    db.refresh(user)
    now = datetime.utcnow()
    item, _, _ = _user_to_item(user, now, now + timedelta(days=7))
    return item


@app.delete("/api/platform/admin/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Remove usuário (apenas admin). Não permite excluir a si mesmo."""
    if str(current_user.id) == user_id:
        raise HTTPException(status_code=400, detail="Não é possível excluir sua própria conta.")
    user = _get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    db.delete(user)
    db.commit()
    return None


# ---------- Auth Safirion (corretora) ----------

@app.post("/api/auth/login", response_model=LoginResponse)
@limiter.limit("5/minute")
def login(request: Request, body: LoginRequest, db: Session = Depends(get_db)):
    """Autentica na corretora Safirion e retorna um token de sessão."""
    if Safirion is None:
        logging.warning("Login corretora: Safirion não disponível (import falhou).")
        raise HTTPException(status_code=503, detail="Integração Safirion não disponível.")
    
    # Sempre salva o broker_email (necessário para notificações PWA).
    # Se "remember", salva a senha também (para auto-reconectar).
    p_user_id: int | None = None
    try:
        current_p_user = get_current_user(request, db)
        p_user_id = current_p_user.id
        current_p_user.broker_email = body.email.strip().lower()
        if body.remember:
            current_p_user.broker_password = _encrypt_password(body.password)
        db.commit()
        logging.info("Login corretora: broker_email salvo para user_id=%s", p_user_id)
    except Exception:
        pass # Ignora erro se não estiver logado na plataforma ou se falhar ao salvar

    logging.info("Login corretora: tentativa para %s", body.email)
    try:
        token, resolved_email = _broker_sessions.create_session(
            body.email.strip().lower(),
            body.password,
            platform_user_id=p_user_id,
        )
        logging.info("Login corretora: OK para %s", body.email)
        logging.info("Login corretora: sessão criada token=%s email=%s", token[:6] + "***", resolved_email)
        return LoginResponse(token=token, message="Conectado com sucesso.")
    except RuntimeError as e:
        logging.warning("Login corretora: falhou para %s — %s", body.email, e)
        raw = str(e)
        try:
            import json as _json
            parsed = _json.loads(raw)
            code = parsed.get("code", "")
            if code == "invalid_credentials":
                detail = "E-mail ou senha incorretos. Verifique suas credenciais e tente novamente."
            elif code == "account_blocked":
                detail = "Conta bloqueada. Entre em contato com o suporte da corretora."
            elif code == "too_many_attempts" or code == "rate_limited":
                detail = "Muitas conexões simultâneas do servidor. Aguarde 60 minutos e tente novamente. Isso ocorre quando vários usuários conectam ao mesmo tempo pelo mesmo servidor."
            else:
                detail = parsed.get("message") or parsed.get("detail") or "Erro ao conectar na corretora."
        except Exception:
            # Detecta rate limit direto na string bruta
            if "number of requests" in raw.lower() or "exceeded" in raw.lower():
                detail = "Muitas conexões simultâneas do servidor. Aguarde 60 minutos e tente novamente."
            else:
                detail = "Erro ao conectar na corretora."
        raise HTTPException(status_code=401, detail=detail)
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Login Safirion failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/auth/reconnect", response_model=LoginResponse)
def reconnect(current_user: User = Depends(get_current_user)):
    """Tenta conectar na corretora usando as credenciais salvas no banco de dados."""
    import random as _random, time as _time
    if not current_user.broker_email or not current_user.broker_password:
        raise HTTPException(status_code=400, detail="Sem credenciais salvas para reconectar.")

    if Safirion is None:
        raise HTTPException(status_code=503, detail="Integração Safirion não disponível.")

    # Escalonar reconexões: se há várias sessões ativas, adiciona delay aleatório
    # para evitar que todos reconectem ao mesmo tempo (rate limit por IP na corretora).
    active_sessions = len(_broker_sessions._sessions)
    if active_sessions > 2:
        delay = min(active_sessions * _random.uniform(0.8, 2.0), 30)
        logging.info("AUTO-RECONECT: %d sessões ativas — aguardando %.1fs antes de reconectar %s", active_sessions, delay, current_user.broker_email)
        _time.sleep(delay)

    logging.info("Login corretora (AUTO-RECONECT): tentativa para %s", current_user.broker_email)
    try:
        token, resolved_email = _broker_sessions.create_session(
            current_user.broker_email,
            _decrypt_password(current_user.broker_password),
            platform_user_id=current_user.id,
        )
        logging.info("Login corretora (AUTO-RECONECT): OK para %s", current_user.broker_email)
        return LoginResponse(token=token, message="Reconectado com sucesso.")
    except RuntimeError as e:
        raw = str(e)
        logging.warning("Login corretora (AUTO-RECONECT): falhou para %s — %s", current_user.broker_email, raw)
        if "rate_limited" in raw or "number of requests" in raw.lower() or "exceeded" in raw.lower():
            raise HTTPException(status_code=429, detail="Muitas conexões simultâneas do servidor. Aguarde alguns minutos e tente reconectar manualmente.")
        raise HTTPException(status_code=401, detail="Credenciais salvas inválidas ou expiradas.")
    except Exception as e:
        logging.warning("Login corretora (AUTO-RECONECT): falhou para %s — %s", current_user.broker_email, e)
        raise HTTPException(status_code=401, detail="Credenciais salvas inválidas ou expiradas.")


@app.post("/api/auth/logout")
def logout(request: Request, db: Session = Depends(get_db)):
    """Invalida a sessão atual e apaga a senha salva da corretora (para que o auto-reconnect não relogue automaticamente)."""
    auth = request.headers.get("Authorization") or request.headers.get("authorization")
    token = get_session_token(auth)
    if token:
        _broker_sessions.close_session(token)
    # Apaga a senha salva para impedir auto-reconnect em outro dispositivo.
    # O broker_email é mantido (necessário para notificações PWA).
    try:
        user = get_current_user(request, db)
        user.broker_password = None
        db.commit()
    except Exception:
        pass
    return {"message": "Logout realizado."}


# ---------- Dados da corretora (requer login) ----------

@app.get("/api/balances")
def get_balances(request: Request):
    """Retorna saldos da conta (requer Bearer token)."""
    auth = request.headers.get("Authorization") or request.headers.get("authorization")
    token = get_session_token(auth)
    if not token:
        raise HTTPException(status_code=401, detail="Token ausente.")
    try:
        return _broker_sessions.call(token, "get_balances", timeout_sec=20)
    except KeyError:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada. Faça login novamente.")
    except RuntimeError as e:
        msg = str(e).lower()
        if "sessão" in msg or "session" in msg:
            raise HTTPException(status_code=401, detail=str(e))
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logging.exception("get_balances failed")
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/profile")
def get_profile(request: Request):
    """Retorna perfil do usuário (requer Bearer token)."""
    auth = request.headers.get("Authorization") or request.headers.get("authorization")
    token = get_session_token(auth)
    if not token:
        raise HTTPException(status_code=401, detail="Token ausente.")
    try:
        return _broker_sessions.call(token, "get_profile", timeout_sec=20)
    except KeyError:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada. Faça login novamente.")
    except RuntimeError as e:
        msg = str(e).lower()
        if "sessão" in msg or "session" in msg:
            raise HTTPException(status_code=401, detail=str(e))
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logging.exception("get_profile failed")
        raise HTTPException(status_code=502, detail=str(e))


# ---------- Robô real (compra/venda na corretora) ----------

class BotConfigBody(BaseModel):
    entryValue: float = 10.0
    payout: float = 87.0
    stopGainMode: str = "gross_value"
    stopGainValue: float = 100.0
    stopLossMode: str = "gross_value"
    stopLossValue: float = 50.0
    martingale: str = "none"
    bankroll: float = 1000.0
    # Modalidade: "digital" e/ou "binary". Se ausente, default ["binary"].
    assetModality: list[str] | None = None
    # Mercado: "open" e/ou "otc". Se ausente, default ["open", "otc"].
    marketType: list[str] | None = None
    # Estratégias: "otc", "supertrend" ou "custom:uuid". Se ausente, default ["otc"].
    strategies: list[str] | None = None
    # Estratégias customizadas (id, name, code, timeframe) — para execução no bot.
    customStrategies: list[dict] | None = None
    # Se True, entra na próxima vela M1 após o gatilho; se None/False, entra imediatamente.
    waitNextCandle: bool | None = None
    # Conta da corretora: "REAL" ou "PRACTICE" (demo).
    accountMode: str = "REAL"


class PlatformBotConfigResponse(BaseModel):
    config: dict | None = None


@app.get("/api/platform/bot-config", response_model=PlatformBotConfigResponse)
def get_platform_bot_config(current_user: User = Depends(get_current_user)):
    """Retorna a última configuração do robô salva para o usuário autenticado."""
    cfg = getattr(current_user, "bot_config", None)
    if isinstance(cfg, dict):
        return PlatformBotConfigResponse(config=cfg)
    return PlatformBotConfigResponse(config=None)


@app.put("/api/platform/bot-config", response_model=PlatformBotConfigResponse)
def save_platform_bot_config(
    body: BotConfigBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Salva a configuração do robô no banco para o usuário autenticado."""
    current_user.bot_config = body.model_dump()
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return PlatformBotConfigResponse(config=current_user.bot_config if isinstance(current_user.bot_config, dict) else None)


# ---------- Estratégias customizadas (Gemini) ----------

class GeminiDraftBody(BaseModel):
    prompt: str
    timeframe: str  # "M1" | "M5"


class GeminiDraftResponse(BaseModel):
    description: str
    explanation: str = ""
    code: str
    confirmation_question: str


class CreateStrategyBody(BaseModel):
    name: str
    code: str
    timeframe: str
    description: str | None = None
    config: dict | list | None = None


class UpdateStrategyBody(BaseModel):
    name: str | None = None
    code: str | None = None
    timeframe: str | None = None
    description: str | None = None
    config: dict | list | None = None


class StrategyOut(BaseModel):
    id: str
    name: str
    code: str
    timeframe: str
    description: str | None
    config: Any | None = None
    created_at: str | None


@app.post("/api/platform/strategies/gemini-draft", response_model=GeminiDraftResponse)
def gemini_strategy_draft(
    body: GeminiDraftBody,
    current_user: User = Depends(get_current_user),
):
    """Chama Gemini para gerar rascunho da estratégia. Usuário confirma depois. Nunca falha com 502 por timeout: usa fallback."""
    import logging
    if body.timeframe not in ("M1", "M5"):
        raise HTTPException(status_code=400, detail="timeframe deve ser M1 ou M5")
    from backend.gemini_strategy import call_gemini_for_draft
    try:
        draft = call_gemini_for_draft(body.prompt.strip(), body.timeframe)
    except Exception as e:
        error_msg = str(e)
        if "quota" in error_msg.lower() or "429" in error_msg:
            raise HTTPException(
                status_code=429,
                detail="Quota da API Gemini excedida. Por favor, aguarde alguns minutos antes de tentar novamente ou verifique sua conta/billing na Gemini API.",
            ) from e
        logging.warning("gemini_strategy_draft: erro não-quota, usando fallback: %s", e)
        draft = None
    if not draft:
        from backend.gemini_strategy import DEFAULT_STRATEGY
        draft = DEFAULT_STRATEGY
        logging.info("gemini_strategy_draft: sem rascunho, retornando estratégia padrão para o front sempre receber algo.")
    return GeminiDraftResponse(
        description=draft.get("description", ""),
        explanation=draft.get("explanation", draft.get("description", "")),
        code=draft.get("code", ""),
        confirmation_question=draft.get("confirmation_question", "É dessa forma que você imaginou?"),
    )


@app.post("/api/platform/strategies", response_model=StrategyOut, status_code=status.HTTP_201_CREATED)
def create_custom_strategy(
    body: CreateStrategyBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cria estratégia customizada após confirmação do usuário."""
    import logging
    if body.timeframe not in ("M1", "M5"):
        raise HTTPException(status_code=400, detail="timeframe deve ser M1 ou M5")
    if not body.name or not body.name.strip():
        raise HTTPException(status_code=400, detail="Nome é obrigatório.")
    if not (body.code or "").strip():
        raise HTTPException(status_code=400, detail="Código da estratégia é obrigatório.")

    try:
        strategy = CustomStrategy(
            user_id=current_user.id,
            name=body.name.strip()[:120],
            code=(body.code or "").strip()[:8000],
            timeframe=body.timeframe,
            description=(body.description or "").strip()[:500] or None,
            config=body.config,
        )
        db.add(strategy)
        db.commit()
        db.refresh(strategy)
        logging.info("create_custom_strategy: estratégia criada id=%s name=%s user_id=%s", strategy.id, strategy.name, current_user.id)
        return StrategyOut(
            id=str(strategy.id),
            name=strategy.name,
            code=strategy.code,
            timeframe=strategy.timeframe,
            description=strategy.description,
            config=strategy.config,
            created_at=strategy.created_at.isoformat() if strategy.created_at else None,
        )
    except Exception as e:
        db.rollback()
        logging.exception("create_custom_strategy: falha ao persistir: %s", e)
        raise HTTPException(status_code=500, detail="Erro ao salvar estratégia. Tente novamente.") from e


@app.get("/api/platform/strategies", response_model=list[StrategyOut])
def list_custom_strategies(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lista estratégias customizadas do usuário."""
    rows = db.query(CustomStrategy).filter(CustomStrategy.user_id == current_user.id).order_by(CustomStrategy.created_at.desc()).all()
    return [
        StrategyOut(
            id=str(s.id),
            name=s.name,
            code=s.code,
            timeframe=s.timeframe,
            description=s.description,
            config=s.config,
            created_at=s.created_at.isoformat() if s.created_at else None,
        )
        for s in rows
    ]


@app.patch("/api/platform/strategies/{strategy_id}", response_model=StrategyOut)
def update_custom_strategy(
    strategy_id: str,
    body: UpdateStrategyBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Atualiza estratégia customizada do usuário."""
    from uuid import UUID
    import logging
    try:
        uid = UUID(strategy_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID inválido.")
    
    strategy = db.query(CustomStrategy).filter(
        CustomStrategy.id == uid,
        CustomStrategy.user_id == current_user.id,
    ).first()
    
    if not strategy:
        raise HTTPException(status_code=404, detail="Estratégia não encontrada.")
    
    if body.name is not None:
        strategy.name = body.name.strip()[:120]
    if body.code is not None:
        strategy.code = body.code.strip()[:8000]
    if body.timeframe is not None:
        strategy.timeframe = body.timeframe
    if body.description is not None:
        strategy.description = body.description.strip()[:500]
    if body.config is not None:
        strategy.config = body.config
        
    try:
        db.commit()
        db.refresh(strategy)
        logging.info("update_custom_strategy: estratégia atualizada id=%s", strategy.id)
        return StrategyOut(
            id=str(strategy.id),
            name=strategy.name,
            code=strategy.code,
            timeframe=strategy.timeframe,
            description=strategy.description,
            config=strategy.config,
            created_at=strategy.created_at.isoformat() if strategy.created_at else None,
        )
    except Exception as e:
        db.rollback()
        logging.exception("update_custom_strategy: falha ao atualizar: %s", e)
        raise HTTPException(status_code=500, detail="Erro ao atualizar estratégia.")


@app.delete("/api/platform/strategies/{strategy_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_custom_strategy(
    strategy_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove estratégia customizada do usuário."""
    from uuid import UUID
    try:
        uid = UUID(strategy_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID inválido.")
    strategy = db.query(CustomStrategy).filter(
        CustomStrategy.id == uid,
        CustomStrategy.user_id == current_user.id,
    ).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Estratégia não encontrada.")
    db.delete(strategy)
    db.commit()


@app.post("/api/bot/start")
def bot_start(body: BotConfigBody, request: Request):
    """Inicia o robô real na corretora (requer token Safirion)."""
    token = get_session_token(request.headers.get("Authorization") or request.headers.get("authorization"))
    if not token:
        raise HTTPException(status_code=401, detail="Token Safirion ausente. Conecte na corretora.")
    config = body.model_dump()
    logging.info("bot_start: payload recebido do frontend | accountMode='%s' | config=%s", config.get("accountMode"), config)
    email = _broker_sessions.get_email(token)
    if email:
        config["session_email"] = email
    try:
        return _broker_sessions.call(token, "start_bot", payload=config, timeout_sec=20)
    except KeyError:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada. Faça login novamente.")
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/bot/stop")
def bot_stop(request: Request):
    """Para o robô (parada manual)."""
    token = get_session_token(request.headers.get("Authorization") or request.headers.get("authorization"))
    if not token:
        raise HTTPException(status_code=401, detail="Token Safirion ausente.")
    try:
        return _broker_sessions.call(token, "stop_bot", timeout_sec=20)
    except KeyError:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada. Faça login novamente.")
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/bot/reset")
def bot_reset(request: Request):
    """Reseta o estado do robô (limpa stop_reason, operações) sem iniciar."""
    token = get_session_token(request.headers.get("Authorization") or request.headers.get("authorization"))
    if not token:
        raise HTTPException(status_code=401, detail="Token Safirion ausente.")
    try:
        return _broker_sessions.call(token, "reset_bot", timeout_sec=10)
    except KeyError:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada. Faça login novamente.")
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/bot/status")
def bot_status(request: Request):
    """Retorna estado atual do robô (saldo, lucro, operações, stop_reason)."""
    token = get_session_token(request.headers.get("Authorization") or request.headers.get("authorization"))
    if not token:
        raise HTTPException(status_code=401, detail="Token Safirion ausente.")
    try:
        # Puxa estado do processo do robô.
        state = _broker_sessions.call(token, "bot_status", timeout_sec=10)
    except KeyError:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada. Faça login novamente.")
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    if not state:
        return {
            "status": "idle",
            "running": False,
            "operations": [],
            "current_balance": 0,
            "total_profit": 0,
            "stop_reason": None,
            "error": None,
        }
    return {
        "status": "running" if state.get("running") else "stopped",
        "running": state.get("running", False),
        "config": state.get("config"),
        "start_balance": state.get("start_balance", 0),
        "current_balance": state.get("current_balance", 0),
        "total_profit": state.get("total_profit", 0),
        "operations": state.get("operations", []),
        "stop_reason": state.get("stop_reason"),
        "error": state.get("error"),
    }


@app.websocket("/ws/bot")
async def websocket_endpoint(websocket: WebSocket, token: str = None):
    """
    WebSocket para monitorar o robô em tempo real.
    Recebe 'token' (token de sessão da corretora) via Query Params.
    """
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(websocket, token)
    logging.info("WebSocket: cliente conectado ao token %s", token[:8])

    try:
        # Loop de atualização periódica no servidor (Polling Interno -> Push Externo)
        while True:
            try:
                # Fazemos a chamada bloqueante em um threadpool para não travar o loop async
                state = await asyncio.to_thread(_broker_sessions.call, token, "bot_status", timeout_sec=10)
                
                if not state:
                    data = {"status": "idle", "running": False}
                else:
                    # Envia apenas as últimas 50 operações para reduzir payload do WS
                    ops = state.get("operations") or []
                    data = {
                        "status": "running" if state.get("running") else "stopped",
                        "running": state.get("running", False),
                        "config": state.get("config"),
                        "start_balance": state.get("start_balance", 0),
                        "current_balance": state.get("current_balance", 0),
                        "total_profit": state.get("total_profit", 0),
                        "operations": ops[-50:],
                        "stop_reason": state.get("stop_reason"),
                        "error": state.get("error"),
                    }
                
                await websocket.send_json(data)
                
                # Frequência dinâmica baseada no estado
                wait_sec = 0.5 if state and state.get("running") else 2.0
                await asyncio.sleep(wait_sec)
                
            except KeyError:
                await websocket.send_json({"error": "Sessão expirada", "status": "expired"})
                break
            except Exception as e:
                await asyncio.sleep(1)
                continue
                
    except WebSocketDisconnect:
        logging.info("WebSocket: cliente desconectado do token %s", token[:8])
    except Exception as e:
        logging.warning("WebSocket: erro inesperado no token %s: %s", token[:8], e)
    finally:
        await manager.disconnect(websocket, token)


# ---------- Webhooks de pagamento / assinatura ----------


class WebhookOut(BaseModel):
    id: str
    name: str
    secret: str
    is_active: bool
    field_mappings: dict | None = None
    plan_id: str | None = None
    user_status: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class WebhookCreateBody(BaseModel):
    name: str
    is_active: bool = False
    field_mappings: dict | None = None
    plan_id: str | None = None
    user_status: str | None = None


class WebhookUpdateBody(BaseModel):
    name: str | None = None
    is_active: bool | None = None
    field_mappings: dict | None = None
    plan_id: str | None = None
    user_status: str | None = None


class WebhookPayloadOut(BaseModel):
    id: str
    webhook_id: str
    webhook_name: str | None = None
    payload: dict | list | None
    headers: dict | None
    method: str
    ip_address: str | None
    user_agent: str | None
    processed: bool
    processed_at: datetime | None
    error: str | None
    process_details: dict | list | None
    response_body: dict | list | None
    processed_action: str | None = None
    is_test: bool
    created_at: datetime | None


def _webhook_to_out(w: Webhook) -> WebhookOut:
    return WebhookOut(
        id=str(getattr(w, "id", "")),
        name=w.name,
        secret=w.secret,
        is_active=bool(getattr(w, "is_active", False)),
        field_mappings=getattr(w, "field_mappings", None),
        plan_id=getattr(w, "plan_id", None),
        user_status=getattr(w, "user_status", None),
        created_at=getattr(w, "created_at", None),
        updated_at=getattr(w, "updated_at", None),
    )


def _payload_to_out(p: WebhookPayload, webhook_name: str | None = None) -> WebhookPayloadOut:
    proc_details = getattr(p, "process_details", None)
    action = None
    if isinstance(proc_details, dict):
        raw_action = proc_details.get("action")
        if isinstance(raw_action, str) and raw_action.strip():
            action = raw_action.strip()
    return WebhookPayloadOut(
        id=str(getattr(p, "id", "")),
        webhook_id=str(getattr(p, "webhook_id", "")),
        webhook_name=webhook_name,
        payload=getattr(p, "payload", None),
        headers=getattr(p, "headers", None),
        method=p.method,
        ip_address=getattr(p, "ip_address", None),
        user_agent=getattr(p, "user_agent", None),
        processed=bool(getattr(p, "processed", False)),
        processed_at=getattr(p, "processed_at", None),
        error=getattr(p, "error", None),
        process_details=getattr(p, "process_details", None),
        response_body=getattr(p, "response_body", None),
        processed_action=action,
        is_test=bool(getattr(p, "is_test", True)),
        created_at=getattr(p, "created_at", None),
    )


@app.get("/api/platform/admin/webhooks", response_model=list[WebhookOut])
def admin_list_webhooks(db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    """Lista todos os webhooks (apenas admin)."""
    rows = db.query(Webhook).order_by(Webhook.created_at.desc()).all()
    return [_webhook_to_out(w) for w in rows]


@app.get("/api/platform/admin/webhooks/{webhook_id}", response_model=WebhookOut)
def admin_get_webhook(
    webhook_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    webhook = db.query(Webhook).filter(Webhook.id == webhook_id).first()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook não encontrado.")
    return _webhook_to_out(webhook)


@app.post("/api/platform/admin/webhooks", response_model=WebhookOut, status_code=status.HTTP_201_CREATED)
def admin_create_webhook(
    body: WebhookCreateBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    # Secret criptograficamente seguro (48 bytes de entropia → 64 chars URL-safe)
    import secrets as _secrets
    secret = _secrets.token_urlsafe(48)
    while db.query(Webhook).filter(Webhook.secret == secret).first():
        secret = _secrets.token_urlsafe(48)

    webhook = Webhook(
        name=body.name.strip(),
        secret=secret,
        is_active=bool(body.is_active),
        field_mappings=body.field_mappings or None,
        plan_id=body.plan_id.strip() if body.plan_id else None,
        user_status=body.user_status.strip() if body.user_status else None,
    )
    db.add(webhook)
    db.commit()
    db.refresh(webhook)
    return _webhook_to_out(webhook)


@app.patch("/api/platform/admin/webhooks/{webhook_id}", response_model=WebhookOut)
def admin_update_webhook(
    webhook_id: str,
    body: WebhookUpdateBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    webhook = db.query(Webhook).filter(Webhook.id == webhook_id).first()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook não encontrado.")

    if body.name is not None:
        webhook.name = body.name.strip()
    if body.is_active is not None:
        webhook.is_active = bool(body.is_active)
    # Importante: só atualizar mapeamentos se explicitamente enviados
    if "field_mappings" in body.model_fields_set:
        webhook.field_mappings = body.field_mappings or None
    if body.plan_id is not None:
        webhook.plan_id = body.plan_id.strip() or None
    if body.user_status is not None:
        webhook.user_status = body.user_status.strip() or None

    db.commit()
    db.refresh(webhook)
    return _webhook_to_out(webhook)


@app.delete("/api/platform/admin/webhooks/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_webhook(
    webhook_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    webhook = db.query(Webhook).filter(Webhook.id == webhook_id).first()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook não encontrado.")
    db.delete(webhook)
    db.commit()
    return None


@app.get("/api/platform/admin/webhook-payloads", response_model=list[WebhookPayloadOut])
def admin_list_webhook_payloads(
    webhook_id: str | None = None,
    processed: bool | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """Lista payloads de webhooks com filtros básicos."""
    if limit < 1:
        limit = 1
    if limit > 500:
        limit = 500

    q = db.query(WebhookPayload).order_by(WebhookPayload.created_at.desc())
    if webhook_id:
        q = q.filter(WebhookPayload.webhook_id == webhook_id)
    if processed is not None:
        q = q.filter(WebhookPayload.processed == processed)

    rows = q.limit(limit).all()
    webhook_ids = list({str(getattr(p, "webhook_id", "")) for p in rows if getattr(p, "webhook_id", None)})
    webhook_names: dict[str, str] = {}
    if webhook_ids:
        ws = db.query(Webhook).filter(Webhook.id.in_(webhook_ids)).all()
        webhook_names = {str(getattr(w, "id", "")): w.name for w in ws}
    return [_payload_to_out(p, webhook_name=webhook_names.get(str(getattr(p, "webhook_id", "")))) for p in rows]


@app.delete("/api/platform/admin/webhook-payloads/{payload_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_webhook_payload(
    payload_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    payload = db.query(WebhookPayload).filter(WebhookPayload.id == payload_id).first()
    if not payload:
        raise HTTPException(status_code=404, detail="Payload não encontrado.")
    db.delete(payload)
    db.commit()
    return None


@app.post("/api/webhook/{secret}", status_code=status.HTTP_202_ACCEPTED)
async def public_webhook_receiver(secret: str, request: Request, db: Session = Depends(get_db)):
    """
    Endpoint público que recebe notificações de plataformas externas.

    - Localiza o Webhook pelo secret.
    - Armazena payload completo (body, headers, IP, user agent).
    - Marca is_test = not webhook.is_active no momento do recebimento.
    - Se webhook ativo, processa mapeamento e faz upsert de usuário (cria/atualiza sem duplicar).
    """
    webhook = db.query(Webhook).filter(Webhook.secret == secret).first()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook não encontrado.")

    try:
        body = await request.json()
    except Exception:
        body = None

    headers = {k: v for k, v in request.headers.items()}
    ip = request.client.host if request.client else None
    user_agent = headers.get("user-agent") or headers.get("User-Agent")

    payload = WebhookPayload(
        webhook_id=webhook.id,
        payload=body,
        headers=headers,
        method=request.method,
        ip_address=ip,
        user_agent=user_agent,
        processed=False,
        is_test=not bool(webhook.is_active),
    )
    db.add(payload)
    db.flush()

    def _safe_str(v: object | None) -> str:
        return str(v).strip() if v is not None else ""

    def _norm(v: object | None) -> str:
        return _safe_str(v).strip().lower()

    def _extract_by_path(data: object, path: str) -> object | None:
        if not path or not isinstance(data, (dict, list)):
            return None
        current: object = data
        for part in path.split("."):
            part = part.strip()
            if not part:
                return None
            if isinstance(current, dict):
                current = current.get(part)
            elif isinstance(current, list):
                try:
                    idx = int(part)
                except Exception:
                    return None
                if idx < 0 or idx >= len(current):
                    return None
                current = current[idx]
            else:
                return None
            if current is None:
                return None
        return current

    def _find_first(data: object, keys: list[str]) -> object | None:
        wanted = {k.lower() for k in keys}
        if isinstance(data, dict):
            for k, v in data.items():
                if str(k).lower() in wanted and v not in (None, ""):
                    return v
                nested = _find_first(v, keys)
                if nested not in (None, ""):
                    return nested
        elif isinstance(data, list):
            for item in data:
                nested = _find_first(item, keys)
                if nested not in (None, ""):
                    return nested
        return None

    def _map_value(raw: object | None, rules: list[dict] | None) -> object | None:
        if raw is None:
            return None
        if not isinstance(rules, list):
            return raw
        raw_text = _safe_str(raw)
        raw_norm = _norm(raw)
        for r in rules:
            if not isinstance(r, dict):
                continue
            rv = _safe_str(r.get("payload_value"))
            if not rv:
                continue
            if raw_text == rv or raw_norm == rv.lower():
                return r.get("meaning")
        return raw

    def _norm_period_token(v: object | None) -> str:
        s = _norm(v)
        if s in ("month", "months", "mes", "meses", "monthly", "mensal"):
            return "month"
        if s in ("day", "days", "dia", "dias", "daily", "diario"):
            return "day"
        if s in ("year", "years", "ano", "anos", "annual", "anual"):
            return "year"
        if s in ("quarterly", "trimestral"):
            return "quarterly"
        if s in ("semiannual", "semestral"):
            return "semiannual"
        return s

    def _months_from_raw_payload(period_type_norm: str, period_value_raw: object) -> int | None:
        """Calcula meses a partir do tipo e valor BRUTOS do payload (ex.: MONTH + 12 = 12 meses).
        Assim evita-se confundir intervalCount=12 (12 meses) com 'annual' + count 12 (12 anos)."""
        try:
            count = int(float(_safe_str(period_value_raw))) if _safe_str(period_value_raw) else 1
        except Exception:
            count = 1
        if count <= 0:
            count = 1
        if period_type_norm == "month":
            return count  # 12 -> 12 meses
        if period_type_norm == "year":
            return 12 * count  # 1 -> 12 meses
        if period_type_norm == "quarterly":
            return 3 * count
        if period_type_norm == "semiannual":
            return 6 * count
        return None

    def _period_to_days(period_name: str, count_raw: object | None) -> int | None:
        period = _norm(period_name)
        try:
            count = int(float(_safe_str(count_raw))) if _safe_str(count_raw) else 1
        except Exception:
            count = 1
        if count <= 0:
            count = 1
        if period in ("monthly", "mensal", "mes", "month"):
            return 31 * count
        if period in ("quarterly", "trimestral"):
            return 91 * count
        if period in ("semiannual", "semestral"):
            return 182 * count
        if period in ("annual", "anual", "year"):
            return 365 * count
        if period in ("day", "dia", "days"):
            return count
        return None

    def _months_from_period(period_name: str, count_raw: object | None) -> int | None:
        period = _norm(period_name)
        try:
            count = int(float(_safe_str(count_raw))) if _safe_str(count_raw) else 1
        except Exception:
            count = 1
        if count <= 0:
            count = 1
        if period in ("monthly", "mensal", "mes", "month"):
            return 1 * count
        if period in ("quarterly", "trimestral"):
            return 3 * count
        if period in ("semiannual", "semestral"):
            return 6 * count
        if period in ("annual", "anual", "year"):
            return 12 * count
        return None

    def _add_months(dt: datetime, months: int) -> datetime:
        y = dt.year + (dt.month - 1 + months) // 12
        m = (dt.month - 1 + months) % 12 + 1
        # último dia do mês alvo
        if m == 12:
            ny, nm = y + 1, 1
        else:
            ny, nm = y, m + 1
        first_next = datetime(ny, nm, 1, dt.hour, dt.minute, dt.second, dt.microsecond, tzinfo=dt.tzinfo)
        last_day = (first_next - timedelta(days=1)).day
        d = min(dt.day, last_day)
        return dt.replace(year=y, month=m, day=d)

    def _resolve_plan_code(candidate: str | None) -> str | None:
        val = _safe_str(candidate)
        if not val:
            return None
        by_code = db.query(Plan).filter(Plan.code == val).first()
        if by_code:
            return by_code.code
        by_id = db.query(Plan).filter(Plan.id == val).first()
        if by_id:
            return by_id.code
        return val

    try:
        # Sem payload JSON não há processamento de mapeamento.
        if not isinstance(body, dict):
            payload.processed = False
            payload.error = "Payload inválido: esperado objeto JSON."
            payload.process_details = {"action": "ignored_invalid_payload"}
            payload.response_body = {"status": "ignored", "reason": "invalid_payload"}
            db.commit()
            return {
                "status": "accepted",
                "webhook_id": str(webhook.id),
                "payload_id": str(payload.id),
                "is_test": payload.is_test,
            }

        field_mappings = webhook.field_mappings if isinstance(webhook.field_mappings, dict) else {}
        fields = field_mappings.get("fields") if isinstance(field_mappings.get("fields"), dict) else field_mappings
        fields = fields if isinstance(fields, dict) else {}

        # Se desativado: apenas salvar para mapeamento (modo teste), sem alterar usuários.
        if payload.is_test:
            payload.processed = True
            payload.processed_at = datetime.utcnow()
            payload.process_details = {
                "action": "test_received",
                "webhook_name": webhook.name,
            }
            payload.response_body = {
                "status": "received_in_test_mode",
                "message": "Webhook desativado: payload salvo para mapeamento.",
            }
            db.commit()
            return {
                "status": "accepted",
                "webhook_id": str(webhook.id),
                "payload_id": str(payload.id),
                "is_test": payload.is_test,
            }

        # Mapeamentos básicos
        name_path = _safe_str(fields.get("full_name") or fields.get("name"))
        email_path = _safe_str(fields.get("email"))
        phone_path = _safe_str(fields.get("phone"))
        cpf_path = _safe_str(fields.get("cpf_cnpj") or fields.get("cpf"))
        period_type_path = _safe_str(fields.get("recurrence_period"))
        period_value_path = _safe_str(fields.get("recurrence_value"))

        raw_name = _extract_by_path(body, name_path) if name_path else _find_first(body, ["name", "nome", "client_name", "customer_name"])
        raw_email = _extract_by_path(body, email_path) if email_path else _find_first(body, ["email", "user_email", "customer_email"])
        raw_phone = _extract_by_path(body, phone_path) if phone_path else _find_first(body, ["phone", "telefone", "mobile"])
        raw_cpf = _extract_by_path(body, cpf_path) if cpf_path else _find_first(body, ["cpf", "cnpj", "document", "tax_id"])
        raw_period_type = _extract_by_path(body, period_type_path) if period_type_path else _find_first(body, ["intervalType", "interval_type", "period", "recurrence"])
        raw_period_value = _extract_by_path(body, period_value_path) if period_value_path else _find_first(body, ["intervalCount", "interval_count", "count", "period_value"])

        email = _norm(raw_email) or None
        phone = _safe_str(raw_phone) or None
        cpf = _safe_str(raw_cpf) or None
        name = _safe_str(raw_name) or None

        if not email and not cpf:
            payload.processed = False
            payload.error = "Não foi possível identificar usuário (email/cpf ausente)."
            payload.process_details = {"action": "failed_missing_identifier"}
            payload.response_body = {"status": "error", "detail": payload.error}
            db.commit()
            return {
                "status": "accepted",
                "webhook_id": str(webhook.id),
                "payload_id": str(payload.id),
                "is_test": payload.is_test,
            }

        period_type_mapped = _map_value(
            raw_period_type,
            field_mappings.get("period_interpretations") if isinstance(field_mappings, dict) else None,
        )
        period_value_mapped = _map_value(
            raw_period_value,
            field_mappings.get("recurrence_value_interpretations") if isinstance(field_mappings, dict) else None,
        )

        # Status: prioridade do webhook configurado; fallback via payload mapeado.
        status_value = _norm(webhook.user_status) if webhook.user_status else ""
        if status_value not in ("active", "expired"):
            status_value = _norm(
                _map_value(
                    _extract_by_path(body, _safe_str(fields.get("user_status"))),
                    field_mappings.get("user_status_interpretations") if isinstance(field_mappings, dict) else None,
                )
            )
        if status_value not in ("active", "expired"):
            status_value = "active"

        # Regras de período -> plano/período
        selected_plan_code = _resolve_plan_code(webhook.plan_id or None)
        selected_period = None
        period_rules = field_mappings.get("period_rules") if isinstance(field_mappings.get("period_rules"), list) else []
        raw_period_type_norm = _norm_period_token(raw_period_type)
        mapped_period_type_norm = _norm_period_token(period_type_mapped)
        raw_period_value_norm = _norm(raw_period_value)
        mapped_period_value_norm = _norm(period_value_mapped)

        for rule in period_rules:
            if not isinstance(rule, dict):
                continue
            t = _norm_period_token(rule.get("interval_type_value"))
            v = _norm(rule.get("interval_count_value"))
            type_match = bool(t) and t in (raw_period_type_norm, mapped_period_type_norm)
            value_match = bool(v) and v in (raw_period_value_norm, mapped_period_value_norm)
            if type_match and value_match:
                selected_period = _safe_str(rule.get("period")) or None
                plan_period_code = _safe_str(rule.get("plan_period_code"))
                if ":" in plan_period_code:
                    selected_plan_code = _resolve_plan_code(plan_period_code.split(":")[0]) or selected_plan_code
                elif plan_period_code:
                    selected_plan_code = _resolve_plan_code(plan_period_code) or selected_plan_code
                break

        # Se ainda não tiver plano, tenta a partir do código enviado no payload.
        if not selected_plan_code:
            selected_plan_code = _resolve_plan_code(
                _safe_str(_extract_by_path(body, "plan.code"))
                or _safe_str(_extract_by_path(body, "plan_id"))
                or _safe_str(_find_first(body, ["plan", "plan_code", "plano"]))
                or None
            )

        # Upsert usuário: tenta por email e cpf, com resolução de conflito.
        user_by_email = db.query(User).filter(User.email == email).first() if email else None
        user_by_cpf = db.query(User).filter(User.cpf == cpf).first() if cpf else None
        user_obj = user_by_email or user_by_cpf

        if email and cpf and user_by_email and user_by_cpf and str(user_by_email.id) != str(user_by_cpf.id):
            payload.processed = False
            payload.error = "Conflito de identidade: email e CPF pertencem a usuários diferentes."
            payload.process_details = {
                "action": "failed_identity_conflict",
                "webhook_name": webhook.name,
                "email": email,
                "cpf": cpf,
            }
            payload.response_body = {"status": "error", "detail": payload.error}
            db.commit()
            return {
                "status": "accepted",
                "webhook_id": str(webhook.id),
                "payload_id": str(payload.id),
                "is_test": payload.is_test,
            }

        action = "updated"
        if user_obj is None:
            # Sem email não é possível criar novo usuário (users.email é obrigatório/único).
            if not email:
                payload.processed = False
                payload.error = "Não foi possível criar usuário novo sem email."
                payload.process_details = {"action": "failed_missing_email_for_create", "webhook_name": webhook.name}
                payload.response_body = {"status": "error", "detail": payload.error}
                db.commit()
                return {
                    "status": "accepted",
                    "webhook_id": str(webhook.id),
                    "payload_id": str(payload.id),
                    "is_test": payload.is_test,
                }
            action = "created"
            generated_password = "Senha123!"
            user_obj = User(
                email=email,
                password_hash=bcrypt.hash(generated_password),
                role=UserRole.USER,
                is_active=True,
            )
            db.add(user_obj)
            db.flush()

        if email:
            user_obj.email = email
        if name:
            user_obj.name = name
        if phone:
            user_obj.phone = phone
        if cpf:
            user_obj.cpf = cpf
        if selected_plan_code:
            user_obj.plan = selected_plan_code
        if selected_period:
            user_obj.plan_period = selected_period

        now = datetime.now(timezone.utc)
        if status_value == "expired":
            user_obj.is_active = False
            user_obj.expires_at = now - timedelta(days=1)
            # Invalidar sessão para deslogar na hora quem estiver logado
            user_obj.token_version = (getattr(user_obj, "token_version", 0) or 0) + 1
        else:
            user_obj.is_active = True
            # Base para somar o período: se ainda está ativo (vencimento no futuro), soma a partir da data atual de vencimento
            base_dt = now
            current_exp = getattr(user_obj, "expires_at", None)
            if current_exp is not None:
                exp_aware = current_exp if getattr(current_exp, "tzinfo", None) else current_exp.replace(tzinfo=timezone.utc)
                if exp_aware > now:
                    base_dt = exp_aware  # renovação antes de vencer: somar período à data de vencimento existente
            # Prioridade: calcular meses pelo tipo/valor BRUTOS do payload (MONTH+12 = 12 meses, não 12 anos)
            months = _months_from_raw_payload(raw_period_type_norm, raw_period_value)
            if months is None:
                # Fallback: label mapeado (ex.: "annual" = 12 meses; "annual"+count 1 = 12)
                period_base = selected_period or _safe_str(period_type_mapped)
                months = _months_from_period(period_base, period_value_mapped)
            if months:
                user_obj.expires_at = _add_months(base_dt, months)
            else:
                days = _period_to_days(
                    selected_period or _safe_str(period_type_mapped),
                    period_value_mapped or raw_period_value,
                )
                if days:
                    user_obj.expires_at = base_dt + timedelta(days=days)

        payload.processed = True
        payload.processed_at = now
        payload.error = None
        payload.process_details = {
            "action": action,
            "webhook_name": webhook.name,
            "user_id": str(getattr(user_obj, "id", "")),
            "user_email": user_obj.email,
            "user_name": user_obj.name,
            "user_phone": user_obj.phone,
            "user_cpf": user_obj.cpf,
            "user_status": status_value,
            "plan": selected_plan_code,
            "period": selected_period,
            "period_type_raw": _safe_str(raw_period_type),
            "period_value_raw": _safe_str(raw_period_value),
            "period_type_mapped": _safe_str(period_type_mapped),
            "period_value_mapped": _safe_str(period_value_mapped),
        }
        payload.response_body = {
            "status": "ok",
            "action": action,
            "message": "Usuário processado via webhook.",
            "user": {
                "id": str(getattr(user_obj, "id", "")),
                "email": user_obj.email,
                "name": user_obj.name,
                "phone": user_obj.phone,
                "cpf": user_obj.cpf,
                "plan": user_obj.plan,
                "is_active": bool(user_obj.is_active),
                "expires_at": user_obj.expires_at.isoformat() if user_obj.expires_at else None,
            },
        }
        db.commit()
        # Gatilhos de email automáticos por status
        try:
            if status_value == "expired":
                trigger_email("expired", user_obj, db=db)
            elif action == "created":
                trigger_email("welcome", user_obj, extra_vars={"senha_padrao": "Senha123!"}, db=db)
            else:
                trigger_email("plan_activated", user_obj, db=db)
        except Exception as _email_exc:
            logging.warning("Falha ao disparar email via webhook: %s", _email_exc)
        # Confirma que o usuário está persistido (mesma DB que admin/usuários usa)
        verify_count = db.query(User).filter(User.email == user_obj.email).count()
        logging.info(
            "webhook processed | webhook=%s payload_id=%s action=%s email=%s plan=%s status=%s users_with_email=%s",
            webhook.name,
            str(getattr(payload, "id", "")),
            action,
            user_obj.email,
            user_obj.plan,
            status_value,
            verify_count,
        )
    except Exception as e:
        logging.exception(
            "webhook processing failed | webhook=%s payload_id=%s",
            webhook.name,
            str(getattr(payload, "id", "")),
        )
        db.rollback()
        # Tenta registrar o erro no payload (best effort)
        try:
            payload.error = str(e)
            payload.processed = False
            payload.process_details = {"action": "failed_exception"}
            payload.response_body = {"status": "error", "detail": str(e)}
            db.add(payload)
            db.commit()
        except Exception:
            pass

    return {
        "status": "accepted",
        "webhook_id": str(webhook.id),
        "payload_id": str(payload.id),
        "is_test": payload.is_test,
    }


# ---------- Planos de assinatura ----------


class PlanPeriodIn(BaseModel):
    period_type: str  # monthly, quarterly, semiannual, annual
    price: float
    is_active: bool = False
    checkout_url: str | None = None


class PlanCreateBody(BaseModel):
    name: str
    description: str | None = None
    periods: list[PlanPeriodIn]


class PlanUpdateBody(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None
    periods: list[PlanPeriodIn] | None = None


class PlanPeriodOut(BaseModel):
    id: str
    period_type: str
    price: float
    is_active: bool
    checkout_url: str | None


class PlanOut(BaseModel):
    id: str
    name: str
    code: str
    description: str | None
    is_active: bool
    created_at: datetime | None
    updated_at: datetime | None
    periods: list[PlanPeriodOut]
    users_count: int


def _slugify_name(name: str) -> str:
    base = (
        name.lower()
        .strip()
        .replace("ç", "c")
        .replace("ã", "a")
        .replace("õ", "o")
        .replace("á", "a")
        .replace("é", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ú", "u")
    )
    slug = "".join(ch if ch.isalnum() else "-" for ch in base)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-") or "plano"


def _plan_to_out(db: Session, plan: Plan) -> PlanOut:
    periods = (
        db.query(PlanPeriod)
        .filter(PlanPeriod.plan_id == plan.id)
        .order_by(PlanPeriod.period_type)
        .all()
    )
    users_count = db.query(User).filter(User.plan == plan.code).count()
    period_items: list[PlanPeriodOut] = []
    for p in periods:
        try:
            value = float(p.price_cents)
        except (TypeError, ValueError):
            value = 0.0
        period_items.append(
            PlanPeriodOut(
                id=str(getattr(p, "id", "")),
                period_type=p.period_type,
                price=value,
                is_active=bool(getattr(p, "is_active", False)),
                checkout_url=getattr(p, "checkout_url", None),
            )
        )
    return PlanOut(
        id=str(getattr(plan, "id", "")),
        name=plan.name,
        code=plan.code,
        description=getattr(plan, "description", None),
        is_active=bool(getattr(plan, "is_active", True)),
        created_at=getattr(plan, "created_at", None),
        updated_at=getattr(plan, "updated_at", None),
        periods=period_items,
        users_count=users_count,
    )


@app.get("/api/platform/admin/plans/period-stats")
def admin_plans_period_stats(db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    """Retorna contagem de usuários ativos agrupados por período de plano."""
    from sqlalchemy import func as sqlfunc
    rows = (
        db.query(User.plan_period, sqlfunc.count(User.id).label("count"))
        .filter(User.is_active == True, User.plan_period != None)
        .group_by(User.plan_period)
        .all()
    )
    period_labels = {
        "monthly": "Mensal",
        "quarterly": "Trimestral",
        "semiannual": "Semestral",
        "annual": "Anual",
    }
    result = []
    for period_type, count in sorted(rows, key=lambda r: ["monthly","quarterly","semiannual","annual"].index(r[0]) if r[0] in ["monthly","quarterly","semiannual","annual"] else 99):
        result.append({
            "period_type": period_type,
            "label": period_labels.get(period_type, period_type.capitalize()),
            "count": count,
        })
    return result


@app.get("/api/platform/admin/plans", response_model=list[PlanOut])
def admin_list_plans(db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    """Lista todos os planos de assinatura com períodos e contagem de usuários."""
    rows = db.query(Plan).order_by(Plan.created_at.desc()).all()
    return [_plan_to_out(db, p) for p in rows]


@app.get("/api/platform/admin/plans/{plan_id}", response_model=PlanOut)
def admin_get_plan(
    plan_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plano não encontrado.")
    return _plan_to_out(db, plan)


@app.post("/api/platform/admin/plans", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
def admin_create_plan(
    body: PlanCreateBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Nome do plano é obrigatório.")
    base_code = _slugify_name(body.name)
    code = base_code
    suffix = 1
    while db.query(Plan).filter(Plan.code == code).first() is not None:
        suffix += 1
        code = f"{base_code}-{suffix}"

    plan = Plan(
        name=body.name.strip(),
        code=code,
        description=body.description.strip() or None if body.description else None,
        is_active=True,
    )
    db.add(plan)
    db.flush()

    for p in body.periods:
        try:
            price_str = str(round(float(p.price), 2))
        except (TypeError, ValueError):
            price_str = "0"
        period = PlanPeriod(
            plan_id=plan.id,
            period_type=p.period_type,
            price_cents=price_str,
            checkout_url=p.checkout_url.strip() or None if p.checkout_url else None,
            is_active=bool(p.is_active),
        )
        db.add(period)

    db.commit()
    db.refresh(plan)
    return _plan_to_out(db, plan)


@app.patch("/api/platform/admin/plans/{plan_id}", response_model=PlanOut)
def admin_update_plan(
    plan_id: str,
    body: PlanUpdateBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plano não encontrado.")

    if body.name is not None and body.name.strip():
        plan.name = body.name.strip()
    if body.description is not None:
        plan.description = body.description.strip() or None
    if body.is_active is not None:
        plan.is_active = bool(body.is_active)

    if body.periods is not None:
        db.query(PlanPeriod).filter(PlanPeriod.plan_id == plan.id).delete()
        for p in body.periods:
            try:
                price_str = str(round(float(p.price), 2))
            except (TypeError, ValueError):
                price_str = "0"
            period = PlanPeriod(
                plan_id=plan.id,
                period_type=p.period_type,
                price_cents=price_str,
                checkout_url=p.checkout_url.strip() or None if p.checkout_url else None,
                is_active=bool(p.is_active),
            )
            db.add(period)

    db.commit()
    db.refresh(plan)
    return _plan_to_out(db, plan)


@app.delete("/api/platform/admin/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_plan(
    plan_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plano não encontrado.")
    db.query(PlanPeriod).filter(PlanPeriod.plan_id == plan.id).delete()
    db.delete(plan)
    db.commit()
    return None


# ---------- Admin: prompt Gemini (system prompt para geração de estratégias) ----------
class GeminiPromptResponse(BaseModel):
    prompt: str


class GeminiPromptUpdateBody(BaseModel):
    prompt: str


@app.get("/api/platform/admin/gemini-prompt", response_model=GeminiPromptResponse)
def admin_get_gemini_prompt(_admin: User = Depends(get_current_admin)):
    """Retorna o prompt de sistema usado pelo Gemini (apenas admin)."""
    from backend.gemini_strategy import get_system_prompt
    return GeminiPromptResponse(prompt=get_system_prompt())


@app.put("/api/platform/admin/gemini-prompt", response_model=GeminiPromptResponse)
def admin_update_gemini_prompt(
    body: GeminiPromptUpdateBody,
    _admin: User = Depends(get_current_admin),
):
    """Atualiza o prompt de sistema do Gemini (apenas admin)."""
    from backend.gemini_strategy import set_system_prompt
    if not (body.prompt or "").strip():
        raise HTTPException(status_code=400, detail="O prompt não pode ser vazio.")
    set_system_prompt(body.prompt.strip())
    from backend.gemini_strategy import get_system_prompt
    return GeminiPromptResponse(prompt=get_system_prompt())


# ---------- PWA Push: subscription e VAPID público ----------
class PushSubscriptionBody(BaseModel):
    endpoint: str
    keys: dict  # p256dh, auth
    user_agent: str | None = None


@app.get("/api/platform/push-vapid-public")
def get_push_vapid_public():
    """Retorna a chave pública VAPID (base64url) para o frontend inscrever no push."""
    from backend.push_service import VAPID_PUBLIC_KEY
    if not VAPID_PUBLIC_KEY:
        raise HTTPException(status_code=503, detail="Push não configurado (VAPID).")
    return {"publicKey": (VAPID_PUBLIC_KEY or "").strip()}


@app.post("/api/platform/push-subscription", status_code=status.HTTP_204_NO_CONTENT)
def save_push_subscription(
    body: PushSubscriptionBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Salva ou atualiza a subscription Web Push do usuário (PWA)."""
    endpoint = (body.endpoint or "").strip()
    keys = body.keys or {}
    p256dh = keys.get("p256dh") or keys.get("p256dh")
    auth = keys.get("auth")
    if not endpoint or not p256dh or not auth:
        raise HTTPException(status_code=400, detail="endpoint e keys.p256dh e keys.auth são obrigatórios.")
    ua = (body.user_agent or "")[:512]
    existing = db.query(PushSubscription).filter(
        PushSubscription.user_id == current_user.id,
        PushSubscription.endpoint == endpoint,
    ).first()
    if existing:
        existing.p256dh = p256dh
        existing.auth = auth
        existing.user_agent = ua or existing.user_agent
    else:
        sub = PushSubscription(
            user_id=current_user.id,
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
            user_agent=ua or None,
        )
        db.add(sub)
    db.commit()
    return None


# ---------- Preferências de notificações por gatilho (usuário logado) ----------
PWA_TRIGGERS = ["operation_opened", "operation_finished", "stop_gain", "stop_loss"]


class NotificationPreferenceItem(BaseModel):
    trigger_key: str
    label: str
    enabled: bool


class NotificationPreferencesOut(BaseModel):
    triggers: list[NotificationPreferenceItem]


class NotificationPreferencesUpdateBody(BaseModel):
    triggers: dict[str, bool]  # trigger_key -> enabled


def _get_trigger_label(key: str) -> str:
    labels = {
        "operation_opened": "Operação aberta",
        "operation_finished": "Operação finalizada",
        "stop_gain": "Stop Gain",
        "stop_loss": "Stop Loss",
    }
    return labels.get(key, key)


@app.get("/api/platform/notifications/preferences", response_model=NotificationPreferencesOut)
def get_notification_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Preferências do usuário por gatilho (só gatilhos automáticos). Mensagem personalizada do admin não pode ser desativada."""
    rows = (
        db.query(UserPushPreferences)
        .filter(UserPushPreferences.user_id == current_user.id)
        .all()
    )
    by_key = {r.trigger_key: r.enabled for r in rows}
    triggers = [
        NotificationPreferenceItem(
            trigger_key=key,
            label=_get_trigger_label(key),
            enabled=by_key.get(key, True),
        )
        for key in PWA_TRIGGERS
    ]
    return NotificationPreferencesOut(triggers=triggers)


@app.put("/api/platform/notifications/preferences", response_model=NotificationPreferencesOut)
def update_notification_preferences(
    body: NotificationPreferencesUpdateBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Atualiza preferências por gatilho. Apenas chaves em PWA_TRIGGERS são consideradas."""
    for key in PWA_TRIGGERS:
        enabled = body.triggers.get(key, True)
        row = (
            db.query(UserPushPreferences)
            .filter(
                UserPushPreferences.user_id == current_user.id,
                UserPushPreferences.trigger_key == key,
            )
            .first()
        )
        if row:
            row.enabled = bool(enabled)
        else:
            db.add(
                UserPushPreferences(
                    user_id=current_user.id,
                    trigger_key=key,
                    enabled=bool(enabled),
                )
            )
    db.commit()
    return get_notification_preferences(current_user=current_user, db=db)


# ---------- Ranking público (usuário logado): top 5 fake + até 5 reais = top 10 ----------
# Números sempre do mês atual (zeram na virada do mês). Avatar unissex igual para todos.
# Fakes sempre no top 5; colocações dos fakes mudam (shuffle) a cada período.
_AVATAR_UNISEX_URL = "https://ui-avatars.com/api/?name=User&background=6366f1&color=fff&size=128"
_FAKE_COUNT = 5
_TOP_TOTAL = 10
# Pool de nomes realistas (~95% masculinos) para os 5 fake.
_FAKE_NAMES_MALE = [
    "Lucas Mendes", "Rafael Costa", "Fernando Santos", "Bruno Oliveira", "Gustavo Lima",
    "Marcos Pereira", "André Souza", "Ricardo Alves", "Paulo Ferreira", "Daniel Martins",
    "Thiago Rodrigues", "Felipe Carvalho", "Leonardo Nascimento", "Eduardo Ribeiro",
    "Rodrigo Silva", "Caio Barbosa", "Vinicius Rocha", "Matheus Dias", "Pedro Henrique",
]
_FAKE_NAMES_FEMALE = [
    "Camila Costa", "Juliana Santos",
]


def _fake_ranking_entries(real_max_profit: float, real_max_ops: int, seed: int) -> list[dict]:
    """Gera 5 entradas fake (sempre no top 5). Valores e nomes variam com o seed; ordem = maior lucro primeiro."""
    import random
    rng = random.Random(seed)
    base = max(0.0, real_max_profit) + 500.0
    # Lucros em ordem decrescente: 1º fake = maior lucro, 5º = menor entre os fakes
    spread = [base + (_FAKE_COUNT - i) * 800 + rng.uniform(0, 400) for i in range(1, _FAKE_COUNT + 1)]
    ops_base = max(real_max_ops, 10) + rng.randint(2, 8)
    entries = []
    used_names = set()
    for i in range(_FAKE_COUNT):
        pool = _FAKE_NAMES_MALE if rng.random() < 0.95 else _FAKE_NAMES_FEMALE
        name = rng.choice([n for n in pool if n not in used_names] or pool)
        used_names.add(name)
        entries.append({
            "name": name,
            "avatar_url": _AVATAR_UNISEX_URL,
            "total_profit": round(spread[i], 2),
            "operations_count": max(12, ops_base + (_FAKE_COUNT - i) * 3 + rng.randint(-2, 5)),
            "is_fake": True,
        })
    # Sem shuffle: ordem = maior lucro primeiro (top ranking = maior lucro). Posições 1–5.
    for i, e in enumerate(entries):
        e["position"] = i + 1
    return entries


class PublicRankingItem(BaseModel):
    position: int
    name: str
    avatar_url: str | None = None
    total_profit: float
    operations_count: int
    is_fake: bool = False


class PublicRankingResponse(BaseModel):
    items: list[PublicRankingItem]
    period_start: datetime
    period_end: datetime


@app.get("/api/platform/ranking", response_model=PublicRankingResponse)
@limiter.limit("30/minute")
def get_public_ranking(
    request: Request,
    preset: str = "current_month",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Ranking do mês: ordenado por maior lucro; top 5 sempre fake (nomes/valores variam a cada 30 min), depois até 5 reais."""
    from sqlalchemy import func as sa_func
    now = datetime.utcnow()
    if (preset or "").lower() == "current_month" or not preset:
        period_start = datetime(now.year, now.month, 1)
        if now.month == 12:
            period_end = datetime(now.year + 1, 1, 1) - timedelta(microseconds=1)
        else:
            period_end = datetime(now.year, now.month + 1, 1) - timedelta(microseconds=1)
    else:
        period_start = datetime(now.year, now.month, 1)
        period_end = now

    q = (
        db.query(
            UserOperation.user_email.label("email"),
            sa_func.coalesce(sa_func.sum(UserOperation.profit), 0.0).label("total_profit"),
            sa_func.count(UserOperation.id).label("operations_count"),
        )
        .filter(UserOperation.timestamp >= period_start, UserOperation.timestamp <= period_end)
        .group_by(UserOperation.user_email)
        .order_by(sa_func.coalesce(sa_func.sum(UserOperation.profit), 0.0).desc())
        .limit(_TOP_TOTAL - _FAKE_COUNT)
    )
    rows = q.all()
    real_max_profit = float(rows[0].total_profit) if rows else 0.0
    real_max_ops = int(rows[0].operations_count) if rows else 0

    # Seed para rotacionar fakes: muda a cada 30 min (colocações dos fakes sempre variando)
    seed = int(now.timestamp()) // (30 * 60)
    fake_entries = _fake_ranking_entries(real_max_profit, real_max_ops, seed)
    fake_items = [PublicRankingItem(**e) for e in fake_entries]

    emails = [r.email for r in rows if r.email]
    users_by_broker: dict[str, User] = {}
    users_by_email: dict[str, User] = {}
    if emails:
        db_users = db.query(User).filter(
            (User.broker_email.in_(emails)) | (User.email.in_(emails))
        ).all()
        for u in db_users:
            if getattr(u, "broker_email", None):
                users_by_broker[(u.broker_email or "").strip().lower()] = u
            if u.email:
                users_by_email[u.email.strip().lower()] = u

    real_items = []
    for row in rows:
        key = (row.email or "").strip().lower()
        u = users_by_broker.get(key) or users_by_email.get(key)
        display_name = (getattr(u, "name", None) or "").strip() if u else ""
        if not display_name and row.email:
            display_name = (row.email or "").split("@")[0] or row.email
        if not display_name:
            display_name = "Usuário"
        real_items.append(
            PublicRankingItem(
                position=0,  # será reatribuído após ordenar
                name=display_name,
                avatar_url=_AVATAR_UNISEX_URL,
                total_profit=float(row.total_profit or 0.0),
                operations_count=int(row.operations_count or 0),
                is_fake=False,
            )
        )

    # Top ranking = maior lucro sempre. Ordenar todos por total_profit desc e reatribuir posições.
    all_items = sorted(
        fake_items + real_items,
        key=lambda x: (x.total_profit, -getattr(x, "operations_count", 0)),
        reverse=True,
    )
    for i, item in enumerate(all_items):
        item.position = i + 1
    is_admin = (getattr(current_user, "role", None) or "").strip().lower() == "admin"

    def _serialize(item: PublicRankingItem) -> dict:
        d = {
            "position": item.position,
            "name": item.name,
            "avatar_url": item.avatar_url,
            "total_profit": item.total_profit,
            "operations_count": item.operations_count,
        }
        if is_admin:
            d["is_fake"] = item.is_fake
        return d

    return {
        "items": [_serialize(x) for x in all_items],
        "period_start": period_start,
        "period_end": period_end,
    }


# ---------- Admin: PWA Notificações (templates, envio, estatísticas) ----------
class PwaTemplateOut(BaseModel):
    trigger_key: str
    title_template: str
    body_template: str
    is_active: bool


class PwaTemplateUpdateBody(BaseModel):
    title_template: str | None = None
    body_template: str | None = None
    is_active: bool | None = None


class PwaSendBody(BaseModel):
    title: str
    body: str
    url: str | None = None  # link opcional para redirecionar ao clicar no push


class PwaStatsOut(BaseModel):
    subscribers_count: int
    custom_messages_sent: int


class PwaHistoryItem(BaseModel):
    id: str
    title: str
    body: str
    url: str | None
    sent_count: int
    created_at: datetime

    class Config:
        from_attributes = True


def _ensure_pwa_templates(db: Session) -> None:
    """Garante que existem os templates padrão (Stop Gain e Stop Loss separados)."""
    for key, title, body in [
        ("operation_opened",  "Operação aberta",    "{{direction}} em {{asset}} — R$ {{entry_value}}"),
        ("operation_finished","Operação finalizada", "{{result}} | {{direction}} {{asset}} — {{profit_label}}: R$ {{profit}}"),
        ("stop_gain",         "✅ Stop Gain",         "Meta atingida! Lucro da sessão: R$ {{profit}} em {{entries}} entradas ({{wins}}✓ / {{losses}}✗)"),
        ("stop_loss",         "🛑 Stop Loss",         "Limite atingido. Resultado da sessão: R$ {{profit}} em {{entries}} entradas ({{wins}}✓ / {{losses}}✗)"),
    ]:
        t = db.query(PwaMessageTemplate).filter(PwaMessageTemplate.trigger_key == key).first()
        if not t:
            t = PwaMessageTemplate(trigger_key=key, title_template=title, body_template=body)
            db.add(t)
    db.commit()


def _send_push_to_user(db: Session, user_id: Any, title: str, body: str, data: dict | None = None) -> int:
    """Envia push para todas as subscriptions do usuário. Retorna quantidade enviada com sucesso."""
    from backend.push_service import send_push_subscription
    import json
    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user_id).all()
    payload = json.dumps({"title": title, "body": body, "data": data or {}, "tag": "nexus"})
    sent = 0
    to_delete = []
    for sub in subs:
        ok, status = send_push_subscription(sub.endpoint, sub.p256dh, sub.auth, payload)
        if ok:
            sent += 1
        elif status in (404, 410):
            # Subscription expirada ou inválida — remover do banco
            logging.info("_send_push_to_user: removendo subscription expirada (status=%s) endpoint=%s", status, (sub.endpoint or "")[:60])
            to_delete.append(sub)
    for sub in to_delete:
        try:
            db.delete(sub)
        except Exception:
            pass
    if to_delete:
        try:
            db.commit()
        except Exception:
            pass
    return sent


@app.get("/api/platform/admin/pwa/templates", response_model=list[PwaTemplateOut])
def admin_pwa_list_templates(db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    _ensure_pwa_templates(db)
    rows = db.query(PwaMessageTemplate).order_by(PwaMessageTemplate.trigger_key).all()
    return [
        PwaTemplateOut(trigger_key=r.trigger_key, title_template=r.title_template, body_template=r.body_template, is_active=r.is_active)
        for r in rows
    ]


@app.put("/api/platform/admin/pwa/templates/{trigger_key}", response_model=PwaTemplateOut)
def admin_pwa_update_template(
    trigger_key: str,
    body: PwaTemplateUpdateBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    _ensure_pwa_templates(db)
    t = db.query(PwaMessageTemplate).filter(PwaMessageTemplate.trigger_key == trigger_key).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template não encontrado.")
    if body.title_template is not None:
        t.title_template = body.title_template.strip()
    if body.body_template is not None:
        t.body_template = body.body_template.strip()
    if body.is_active is not None:
        t.is_active = body.is_active
    db.commit()
    db.refresh(t)
    return PwaTemplateOut(trigger_key=t.trigger_key, title_template=t.title_template, body_template=t.body_template, is_active=t.is_active)


@app.post("/api/platform/admin/pwa/send", status_code=status.HTTP_200_OK)
def admin_pwa_send_custom(
    body: PwaSendBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """Envia mensagem personalizada para todos os usuários que têm PWA com notificações ativas."""
    from backend.push_service import send_push_subscription
    from concurrent.futures import ThreadPoolExecutor
    import json
    title = (body.title or "").strip() or "Nexus Bot"
    body_text = (body.body or "").strip()
    url = (body.url or "").strip() or "/"
    if url and not url.startswith("/") and not url.startswith("http"):
        url = "/" + url
    subs = db.query(PushSubscription).all()
    payload = json.dumps({"title": title, "body": body_text, "data": {"url": url}, "tag": "nexus-custom"})

    # Envia em paralelo com thread pool (não bloqueia o servidor)
    def _send(sub):
        try:
            return send_push_subscription(sub.endpoint, sub.p256dh, sub.auth, payload)
        except Exception:
            return False

    with ThreadPoolExecutor(max_workers=min(20, len(subs) or 1)) as pool:
        results = list(pool.map(_send, subs))
    sent = sum(1 for r in results if r)

    rec = PwaCustomMessage(title=title, body=body_text, url=url if url != "/" else None, sent_count=sent)
    db.add(rec)
    db.commit()
    return {"sent": sent, "total_subscribers": len(subs)}


@app.get("/api/platform/admin/pwa/stats", response_model=PwaStatsOut)
def admin_pwa_stats(db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    """Estatísticas: quantos instalaram PWA e ativaram notificação; quantas mensagens personalizadas foram enviadas."""
    from sqlalchemy import func, distinct
    sub_count = db.query(func.count(distinct(PushSubscription.user_id))).scalar()
    subscribers_count = int(sub_count) if sub_count is not None else 0
    r = db.query(func.coalesce(func.sum(PwaCustomMessage.sent_count), 0)).scalar()
    custom_messages_sent = int(r) if r is not None else 0
    return PwaStatsOut(subscribers_count=subscribers_count, custom_messages_sent=custom_messages_sent)


@app.get("/api/platform/admin/pwa/history", response_model=list[PwaHistoryItem])
def admin_pwa_history(
    limit: int = 50,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """Histórico de mensagens personalizadas enviadas (mais recentes primeiro)."""
    from sqlalchemy import desc
    rows = (
        db.query(PwaCustomMessage)
        .order_by(desc(PwaCustomMessage.created_at))
        .limit(min(limit, 100))
        .all()
    )
    return [
        PwaHistoryItem(
            id=str(r.id),
            title=r.title,
            body=r.body,
            url=r.url,
            sent_count=r.sent_count,
            created_at=r.created_at,
        )
        for r in rows
    ]


@app.delete("/api/platform/admin/pwa/history/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_pwa_delete_history_item(
    message_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """Remove uma mensagem do histórico."""
    from uuid import UUID
    try:
        uid = UUID(message_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID inválido.")
    row = db.query(PwaCustomMessage).filter(PwaCustomMessage.id == uid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada.")
    db.delete(row)
    db.commit()
    return None


@app.delete("/api/platform/admin/pwa/history", status_code=status.HTTP_204_NO_CONTENT)
def admin_pwa_delete_history_all(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """Remove todas as mensagens do histórico."""
    db.query(PwaCustomMessage).delete()
    db.commit()
    return None


# ---------- Internal: disparo de push por gatilho (chamado pelo bot ou backend) ----------
INTERNAL_PUSH_SECRET = os.environ.get("INTERNAL_PUSH_SECRET", "change-me-internal")


class PushEventBody(BaseModel):
    email: str  # broker_email do usuário (corretora)
    event: str  # operation_opened | operation_finished | stop_gain | stop_loss
    data: dict | None = None


@app.post("/api/internal/push-event", status_code=status.HTTP_204_NO_CONTENT)
def internal_push_event(
    body: PushEventBody,
    request: Request,
    db: Session = Depends(get_db),
):
    """Chamado internamente (ex.: pelo bot) para disparar push. Requer header X-Internal-Secret."""
    if request.headers.get("X-Internal-Secret") != INTERNAL_PUSH_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")
    user = db.query(User).filter(User.broker_email == body.email.strip().lower()).first()
    if not user:
        logging.warning("internal_push_event: nenhum usuário com broker_email=%s — notificação ignorada", body.email)
        return None
    t = db.query(PwaMessageTemplate).filter(
        PwaMessageTemplate.trigger_key == body.event,
        PwaMessageTemplate.is_active == True,
    ).first()
    if not t:
        logging.warning("internal_push_event: template não encontrado ou inativo para event=%s", body.event)
        return None
    data = body.data or {}
    title = t.title_template
    body_text = t.body_template
    for k, v in data.items():
        title = title.replace("{{" + k + "}}", str(v))
        body_text = body_text.replace("{{" + k + "}}", str(v))
    pref = (
        db.query(UserPushPreferences)
        .filter(
            UserPushPreferences.user_id == user.id,
            UserPushPreferences.trigger_key == body.event,
        )
        .first()
    )
    if pref is not None and not pref.enabled:
        logging.info("internal_push_event: notificação desativada pelo usuário user_id=%s event=%s", user.id, body.event)
        return None
    sent = _send_push_to_user(db, user.id, title, body_text, {"url": "/"})
    logging.info("internal_push_event: event=%s user_id=%s enviado=%d", body.event, user.id, sent)
    return None


# ---------- Admin: Email (SMTP + Templates + Logs) ----------

class SmtpConfigCreate(BaseModel):
    name: str
    host: str
    port: int = 587
    secure: bool = False
    auth_user: str
    auth_password: str
    from_email: str
    from_name: str | None = None

class SmtpConfigUpdate(BaseModel):
    name: str | None = None
    host: str | None = None
    port: int | None = None
    secure: bool | None = None
    auth_user: str | None = None
    auth_password: str | None = None
    from_email: str | None = None
    from_name: str | None = None
    is_active: bool | None = None

class SmtpConfigOut(BaseModel):
    id: str
    name: str
    host: str
    port: int
    secure: bool
    auth_user: str
    from_email: str
    from_name: str | None = None
    is_active: bool
    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_obj(cls, obj):
        return cls(
            id=str(obj.id), name=obj.name, host=obj.host, port=obj.port,
            secure=bool(obj.secure), auth_user=obj.auth_user,
            from_email=obj.from_email, from_name=obj.from_name,
            is_active=bool(obj.is_active),
        )

class EmailTemplateCreate(BaseModel):
    event_type: str
    name: str
    subject: str
    html_content: str

class EmailTemplateUpdate(BaseModel):
    name: str | None = None
    subject: str | None = None
    html_content: str | None = None
    is_active: bool | None = None

class EmailTemplateOut(BaseModel):
    id: str
    event_type: str
    name: str
    subject: str
    html_content: str
    is_active: bool
    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_obj(cls, obj):
        return cls(
            id=str(obj.id), event_type=obj.event_type, name=obj.name,
            subject=obj.subject, html_content=obj.html_content,
            is_active=bool(obj.is_active),
        )

class EmailLogOut(BaseModel):
    id: str
    to_email: str
    event_type: str
    subject: str | None
    status: str
    error: str | None
    created_at: str
    class Config:
        from_attributes = True

class SendTestEmailBody(BaseModel):
    to_email: str
    subject: str = "Email de teste — Nexus Bot"
    html_content: str = "<h1>Teste de conexão SMTP</h1><p>Se você recebeu este email, a configuração está correta!</p>"

class TriggerEmailBody(BaseModel):
    event_type: str
    user_email: str


@app.get("/api/platform/admin/email/event-types")
def admin_email_event_types(_admin: User = Depends(get_current_admin)):
    return EMAIL_EVENT_TYPES

@app.get("/api/platform/admin/email/template-variables")
def admin_email_template_variables(_admin: User = Depends(get_current_admin)):
    return EMAIL_TEMPLATE_VARIABLES

# --- SMTP Config ---
@app.get("/api/platform/admin/email/smtp")
def admin_smtp_list(db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    return [SmtpConfigOut.from_orm_obj(s) for s in db.query(SmtpConfig).order_by(SmtpConfig.created_at.desc()).all()]

@app.post("/api/platform/admin/email/smtp", status_code=201)
def admin_smtp_create(body: SmtpConfigCreate, db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    config = SmtpConfig(
        name=body.name,
        host=body.host,
        port=body.port,
        secure=body.secure,
        auth_user=body.auth_user,
        auth_password=encrypt_smtp_password(body.auth_password),
        from_email=body.from_email,
        from_name=body.from_name,
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return SmtpConfigOut.from_orm_obj(config)

@app.put("/api/platform/admin/email/smtp/{config_id}")
def admin_smtp_update(config_id: str, body: SmtpConfigUpdate, db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    config = db.query(SmtpConfig).filter(SmtpConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Configuração não encontrada.")
    if body.name is not None: config.name = body.name
    if body.host is not None: config.host = body.host
    if body.port is not None: config.port = body.port
    if body.secure is not None: config.secure = body.secure
    if body.auth_user is not None: config.auth_user = body.auth_user
    if body.auth_password is not None: config.auth_password = encrypt_smtp_password(body.auth_password)
    if body.from_email is not None: config.from_email = body.from_email
    if body.from_name is not None: config.from_name = body.from_name
    if body.is_active is not None: config.is_active = body.is_active
    db.commit()
    db.refresh(config)
    return SmtpConfigOut.from_orm_obj(config)

@app.delete("/api/platform/admin/email/smtp/{config_id}", status_code=204)
def admin_smtp_delete(config_id: str, db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    config = db.query(SmtpConfig).filter(SmtpConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Configuração não encontrada.")
    db.delete(config)
    db.commit()

@app.post("/api/platform/admin/email/smtp/test-connection")
def admin_smtp_test_connection(body: SmtpConfigCreate, _admin: User = Depends(get_current_admin)):
    ok, msg = test_smtp_connection({
        "host": body.host,
        "port": body.port,
        "secure": body.secure,
        "auth_user": body.auth_user,
        "auth_password": body.auth_password,
    })
    return {"success": ok, "message": msg}

@app.post("/api/platform/admin/email/smtp/{config_id}/send-test")
def admin_smtp_send_test(config_id: str, body: SendTestEmailBody, db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    config = db.query(SmtpConfig).filter(SmtpConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Configuração não encontrada.")
    smtp_dict = {"host": config.host, "port": config.port, "secure": config.secure,
                 "auth_user": config.auth_user, "auth_password": config.auth_password,
                 "from_email": config.from_email, "from_name": config.from_name}
    ok, err = send_email(smtp_dict, body.to_email, body.subject, body.html_content)
    return {"success": ok, "error": err}

# --- Email Templates ---
@app.get("/api/platform/admin/email/templates")
def admin_email_templates_list(db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    return [EmailTemplateOut.from_orm_obj(t) for t in db.query(EmailTemplate).order_by(EmailTemplate.created_at.desc()).all()]

@app.post("/api/platform/admin/email/templates", status_code=201)
def admin_email_template_create(body: EmailTemplateCreate, db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    if body.event_type not in EMAIL_EVENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Tipo de evento inválido: {body.event_type}")
    existing = db.query(EmailTemplate).filter(EmailTemplate.event_type == body.event_type).first()
    if existing:
        raise HTTPException(status_code=409, detail="Já existe um template para este evento. Edite o existente.")
    tmpl = EmailTemplate(event_type=body.event_type, name=body.name, subject=body.subject, html_content=body.html_content)
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)
    return EmailTemplateOut.from_orm_obj(tmpl)

@app.put("/api/platform/admin/email/templates/{template_id}")
def admin_email_template_update(template_id: str, body: EmailTemplateUpdate, db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    tmpl = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template não encontrado.")
    if body.name is not None: tmpl.name = body.name
    if body.subject is not None: tmpl.subject = body.subject
    if body.html_content is not None: tmpl.html_content = body.html_content
    if body.is_active is not None: tmpl.is_active = body.is_active
    db.commit()
    db.refresh(tmpl)
    return EmailTemplateOut.from_orm_obj(tmpl)

@app.delete("/api/platform/admin/email/templates/{template_id}", status_code=204)
def admin_email_template_delete(template_id: str, db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    tmpl = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template não encontrado.")
    db.delete(tmpl)
    db.commit()

# --- Trigger manual ---
@app.post("/api/platform/admin/email/trigger")
def admin_email_trigger(body: TriggerEmailBody, db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    user = db.query(User).filter(User.email == body.user_email.strip().lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    ok = trigger_email(body.event_type, user, db=db)
    return {"success": ok}

# --- Logs ---
@app.get("/api/platform/admin/email/logs")
def admin_email_logs(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    total = db.query(EmailLog).count()
    logs = db.query(EmailLog).order_by(EmailLog.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "items": [
            {
                "id": str(l.id),
                "to_email": l.to_email,
                "event_type": l.event_type,
                "subject": l.subject,
                "status": l.status,
                "error": l.error,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in logs
        ],
    }

@app.delete("/api/platform/admin/email/logs", status_code=204)
def admin_email_logs_clear(db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    db.query(EmailLog).delete()
    db.commit()


# ---------- Extra Links (Sala Premium, Indicador) ----------

DEFAULT_EXTRA_LINKS = [
    {"key": "sala_premium", "label": "Sala Premium", "sort_order": 0},
    {"key": "indicador",    "label": "Indicador",    "sort_order": 1},
]

def _ensure_extra_links(db: Session) -> None:
    for item in DEFAULT_EXTRA_LINKS:
        exists = db.query(ExtraLink).filter(ExtraLink.key == item["key"]).first()
        if not exists:
            db.add(ExtraLink(key=item["key"], label=item["label"], url="", sort_order=item["sort_order"]))
    db.commit()


@app.get("/api/platform/extra-links")
def get_extra_links(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    """Retorna links extras ativos para exibir na sidebar do usuário."""
    _ensure_extra_links(db)
    rows = db.query(ExtraLink).filter(ExtraLink.is_active == True).order_by(ExtraLink.sort_order).all()
    return [{"key": r.key, "label": r.label, "url": r.url, "icon": r.icon} for r in rows]


@app.get("/api/platform/admin/extra-links")
def admin_get_extra_links(db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    _ensure_extra_links(db)
    rows = db.query(ExtraLink).order_by(ExtraLink.sort_order).all()
    return [
        {"key": r.key, "label": r.label, "url": r.url, "icon": r.icon, "is_active": r.is_active, "sort_order": r.sort_order}
        for r in rows
    ]


class ExtraLinkCreate(BaseModel):
    label: str
    url: str = ""
    icon: str = "Link"


class ExtraLinkUpdate(BaseModel):
    label: str | None = None
    url: str | None = None
    icon: str | None = None
    is_active: bool | None = None


@app.post("/api/platform/admin/extra-links", status_code=201)
def admin_create_extra_link(
    body: ExtraLinkCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    import re, secrets as _sec
    key = re.sub(r"[^a-z0-9_]", "_", body.label.strip().lower())[:48] + "_" + _sec.token_hex(4)
    max_order = db.query(ExtraLink).count()
    link = ExtraLink(key=key, label=body.label.strip(), url=body.url.strip(), icon=body.icon, sort_order=max_order)
    db.add(link)
    db.commit()
    db.refresh(link)
    return {"key": link.key, "label": link.label, "url": link.url, "icon": link.icon, "is_active": link.is_active, "sort_order": link.sort_order}


@app.patch("/api/platform/admin/extra-links/{key}")
def admin_update_extra_link(
    key: str,
    body: ExtraLinkUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    link = db.query(ExtraLink).filter(ExtraLink.key == key).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link não encontrado.")
    if body.label is not None:
        link.label = body.label.strip()
    if body.url is not None:
        link.url = body.url.strip()
    if body.icon is not None:
        link.icon = body.icon
    if body.is_active is not None:
        link.is_active = body.is_active
    db.commit()
    return {"key": link.key, "label": link.label, "url": link.url, "icon": link.icon, "is_active": link.is_active}


class ExtraLinkReorder(BaseModel):
    keys: list[str]  # lista de keys na nova ordem desejada


@app.post("/api/platform/admin/extra-links/reorder")
def admin_reorder_extra_links(
    body: ExtraLinkReorder,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """Reordena os links extras. 'keys' deve conter todas as keys na nova ordem."""
    for idx, key in enumerate(body.keys):
        db.query(ExtraLink).filter(ExtraLink.key == key).update({"sort_order": idx})
    db.commit()
    return {"ok": True}


@app.delete("/api/platform/admin/extra-links/{key}", status_code=204)
def admin_delete_extra_link(
    key: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    link = db.query(ExtraLink).filter(ExtraLink.key == key).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link não encontrado.")
    db.delete(link)
    db.commit()
