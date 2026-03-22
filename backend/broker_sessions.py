from __future__ import annotations

import logging
import threading
import uuid
from dataclasses import dataclass, field
from multiprocessing import Pipe, Process
from multiprocessing.connection import Connection
from typing import Any


def _extract_email(value: Any) -> str | None:
    """Busca recursivamente um campo de e-mail em dict/list retornados pela corretora."""
    if isinstance(value, dict):
        for k, v in value.items():
            if isinstance(k, str) and "email" in k.lower() and isinstance(v, str) and v.strip():
                return v.strip().lower()
        for v in value.values():
            out = _extract_email(v)
            if out:
                return out
    elif isinstance(value, list):
        for item in value:
            out = _extract_email(item)
            if out:
                return out
    return None


def _normalize_balances(raw: Any) -> list[dict[str, Any]]:
    if isinstance(raw, dict) and "msg" in raw:
        items = raw["msg"]
    else:
        items = raw if isinstance(raw, list) else [raw]
    # Retorna REAL (type=1) e PRACTICE/demo (type=4)
    return [b for b in items if isinstance(b, dict) and b.get("type") in (1, 4)]


def _worker(session_token: str, login_email: str, password: str, conn: Connection):
    # Configurar logging dentro do processo filho, senão logging.info não aparece no terminal.
    logging.basicConfig(
        level=logging.ERROR,
        format="%(asctime)s [%(levelname)s] subprocess(%(process)d): %(message)s",
    )
    s = None
    try:
        from safirionapi.stable_api import Safirion
        from backend import bot_runner

        typed_email = (login_email or "").strip().lower()
        s = Safirion(login_email, password)
        ok, reason = s.connect()
        if not ok:
            conn.send(
                {
                    "ok": False,
                    "error": str(reason or "E-mail ou senha incorretos na corretora."),
                    "status": 401,
                }
            )
            return

        profile_data = None
        profile_email = None
        balances_ok = False
        try:
            profile_data = s.get_profile_ansyc()
            if profile_data:
                profile_email = _extract_email(profile_data)
        except Exception:
            profile_data = None

        try:
            raw_balances = s.get_balances()
            balances_ok = bool(_normalize_balances(raw_balances))
        except Exception:
            balances_ok = False

        if profile_email and typed_email and profile_email != typed_email:
            conn.send(
                {
                    "ok": False,
                    "error": (
                        f"As credenciais informadas não correspondem à conta da corretora "
                        f"(perfil={profile_email}, digitado={typed_email})."
                    ),
                    "status": 401,
                }
            )
            return

        if not profile_data and not balances_ok:
            conn.send(
                {
                    "ok": False,
                    "error": "Falha ao validar sessão na corretora. Verifique login/senha.",
                    "status": 401,
                }
            )
            return

        # NÃO define conta aqui — quem escolhe REAL/PRACTICE é o start_bot via accountMode do usuário.

        resolved_email = profile_email or typed_email
        conn.send({"ok": True, "data": {"email": resolved_email}})

        while True:
            try:
                message = conn.recv()
            except EOFError:
                break

            action = str(message.get("action") or "")
            payload = message.get("payload")

            try:
                if action == "get_balances":
                    raw = s.get_balances()
                    conn.send({"ok": True, "data": {"balances": _normalize_balances(raw)}})
                elif action == "get_profile":
                    prof = s.get_profile_ansyc()
                    conn.send({"ok": True, "data": prof})
                elif action == "start_bot":
                    cfg = payload if isinstance(payload, dict) else {}
                    if resolved_email:
                        cfg["session_email"] = resolved_email
                    bot_runner.start_bot(session_token, s, cfg)
                    conn.send({"ok": True, "data": {"message": "Robô iniciado.", "status": "running"}})
                elif action == "stop_bot":
                    bot_runner.stop_bot(session_token)
                    conn.send({"ok": True, "data": {"message": "Robô parado.", "status": "stopped"}})
                elif action == "reset_bot":
                    bot_runner.reset_bot(session_token)
                    conn.send({"ok": True, "data": {"message": "Robô resetado.", "status": "idle"}})
                elif action == "bot_status":
                    state = bot_runner.get_bot_state(session_token)
                    conn.send({"ok": True, "data": state})
                elif action == "shutdown":
                    bot_runner.stop_bot(session_token)
                    conn.send({"ok": True, "data": {"message": "Encerrado"}})
                    break
                else:
                    conn.send({"ok": False, "error": f"Ação inválida: {action}", "status": 400})
            except Exception as e:
                conn.send({"ok": False, "error": str(e), "status": 500})
    except Exception as e:
        try:
            conn.send({"ok": False, "error": str(e), "status": 500})
        except Exception:
            pass
    finally:
        try:
            if s is not None and hasattr(s, "api") and s.api and getattr(s.api, "websocket_client", None):
                s.api.websocket_client.wss.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


@dataclass
class BrokerSessionHandle:
    token: str
    email: str
    process: Process
    conn: Connection
    platform_user_id: int | None = None
    lock: threading.Lock = field(default_factory=threading.Lock)


class BrokerSessionsManager:
    _REAPER_INTERVAL = 30  # segundos entre cada varredura de sessões zumbi

    def __init__(self):
        self._sessions: dict[str, BrokerSessionHandle] = {}
        self._lock = threading.Lock()
        # Thread de limpeza automática de sessões mortas
        self._reaper = threading.Thread(target=self._reap_dead_sessions, daemon=True)
        self._reaper.start()

    def _reap_dead_sessions(self) -> None:
        """Remove sessões cujo subprocess morreu inesperadamente."""
        import time as _time
        while True:
            _time.sleep(self._REAPER_INTERVAL)
            try:
                with self._lock:
                    dead = [t for t, h in self._sessions.items() if not h.process.is_alive()]
                for token in dead:
                    logging.warning("broker_sessions: sessão zumbi detectada token=%s*** — removendo", token[:6])
                    self.close_session(token)
            except Exception as e:
                logging.error("broker_sessions: erro no reaper: %s", e)

    def get_session_by_user(self, platform_user_id: int, email: str) -> str | None:
        """Retorna token de sessão ativa para o mesmo usuário da plataforma + mesmo email da corretora."""
        norm = email.strip().lower()
        with self._lock:
            for token, handle in self._sessions.items():
                if (
                    handle.platform_user_id == platform_user_id
                    and handle.email == norm
                    and handle.process.is_alive()
                ):
                    return token
        return None

    def create_session(self, email: str, password: str, platform_user_id: int | None = None) -> tuple[str, str]:
        # Reutiliza sessão apenas se for o MESMO usuário da plataforma com o MESMO email da corretora.
        # Isso evita que usuários diferentes compartilhem acidentalmente a mesma sessão.
        if platform_user_id is not None:
            existing = self.get_session_by_user(platform_user_id, email)
            if existing:
                with self._lock:
                    resolved = self._sessions[existing].email
                logging.info("broker_sessions: sessão reutilizada user_id=%s email=%s token=%s***", platform_user_id, resolved, existing[:6])
                return existing, resolved

        token = str(uuid.uuid4())
        parent_conn, child_conn = Pipe()
        process = Process(target=_worker, args=(token, email, password, child_conn), daemon=True)
        process.start()
        child_conn.close()

        if not parent_conn.poll(60):
            process.terminate()
            raise RuntimeError("Timeout ao autenticar na corretora.")

        init = parent_conn.recv()
        if not init.get("ok"):
            process.terminate()
            msg = str(init.get("error") or "Falha ao autenticar na corretora.")
            raise RuntimeError(msg)

        resolved_email = str((init.get("data") or {}).get("email") or email).strip().lower()
        handle = BrokerSessionHandle(token=token, email=resolved_email, process=process, conn=parent_conn, platform_user_id=platform_user_id)
        with self._lock:
            self._sessions[token] = handle
        return token, resolved_email

    def _get(self, token: str) -> BrokerSessionHandle:
        with self._lock:
            h = self._sessions.get(token)
        if not h:
            raise KeyError("Sessão da corretora inválida ou expirada.")
        if not h.process.is_alive():
            self.close_session(token)
            raise KeyError("Sessão da corretora encerrada.")
        return h

    def call(self, token: str, action: str, payload: dict[str, Any] | None = None, timeout_sec: int = 30) -> Any:
        h = self._get(token)
        with h.lock:
            h.conn.send({"action": action, "payload": payload or {}})
            if not h.conn.poll(timeout_sec):
                raise RuntimeError(f"Timeout na ação '{action}' da sessão da corretora.")
            res = h.conn.recv()
        if not res.get("ok"):
            raise RuntimeError(str(res.get("error") or "Falha na sessão da corretora."))
        return res.get("data")

    def get_email(self, token: str) -> str | None:
        try:
            return self._get(token).email
        except Exception:
            return None

    def close_session(self, token: str) -> None:
        with self._lock:
            h = self._sessions.pop(token, None)
        if not h:
            return
        try:
            if h.process.is_alive():
                try:
                    with h.lock:
                        h.conn.send({"action": "shutdown", "payload": {}})
                        if h.conn.poll(3):
                            h.conn.recv()
                except Exception:
                    pass
                h.process.join(timeout=2)
                if h.process.is_alive():
                    h.process.terminate()
        finally:
            try:
                h.conn.close()
            except Exception:
                pass

    def get_all_sessions(self) -> list[dict]:
        """Retorna lista de sessões ativas com email e status do processo."""
        with self._lock:
            return [
                {
                    "token": token,
                    "email": h.email,
                    "alive": h.process.is_alive(),
                    "platform_user_id": h.platform_user_id,
                }
                for token, h in self._sessions.items()
            ]

    def close_all(self) -> None:
        with self._lock:
            tokens = list(self._sessions.keys())
        for t in tokens:
            self.close_session(t)
        logging.info("broker_sessions: todas as sessões foram encerradas (%d).", len(tokens))

