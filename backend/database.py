"""
Conexão e modelos para PostgreSQL (auth da plataforma).
"""
from __future__ import annotations

import os
import logging
from sqlalchemy import (
    create_engine,
    text,
    Column,
    String,
    DateTime,
    Boolean,
    ForeignKey,
    Float,
    Integer,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.sql import func

Base = declarative_base()

# Usar ENUM no PostgreSQL para role
class UserRole:
    USER = "user"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default=UserRole.USER)
    is_active = Column(Boolean, nullable=False, server_default=text("true"))
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    name = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    cpf = Column(String(20), nullable=True)
    plan = Column(String(80), nullable=True)
    plan_period = Column(String(32), nullable=True)  # monthly | quarterly | semiannual | annual
    # Versão do token: incrementada a cada login e ao marcar vencido; só o token com versão atual é válido (uma sessão por conta).
    token_version = Column(Integer, nullable=False, server_default=text("0"))
    # Configuração persistida do robô por usuário (json completo da última estratégia salva no app).
    bot_config = Column(JSONB, nullable=True)
    # Credenciais da corretora (SESSÃO PERSISTENTE)
    broker_email = Column(String(255), nullable=True)
    broker_password = Column(String(255), nullable=True)


class Webhook(Base):
    __tablename__ = "webhooks"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    name = Column(String(255), nullable=False)
    secret = Column(String(255), nullable=False, unique=True, index=True)
    is_active = Column(Boolean, nullable=False, server_default=text("false"))
    # JSON com mapeamento de campos (estrutura flexível, usada por outro serviço)
    field_mappings = Column(JSONB, nullable=True)
    # Identificador de plano (string livre nesta fase)
    plan_id = Column(String(80), nullable=True)
    # Status de usuário que este webhook controla: "active" ou "expired"
    user_status = Column(String(20), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class WebhookPayload(Base):
    __tablename__ = "webhook_payloads"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    webhook_id = Column(UUID(as_uuid=True), ForeignKey("webhooks.id", ondelete="CASCADE"), nullable=False, index=True)
    payload = Column(JSONB, nullable=False)
    headers = Column(JSONB, nullable=True)
    method = Column(String(16), nullable=False)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(255), nullable=True)
    processed = Column(Boolean, nullable=False, server_default=text("false"), index=True)
    processed_at = Column(DateTime(timezone=True), nullable=True)
    error = Column(String(512), nullable=True)
    process_details = Column(JSONB, nullable=True)
    response_body = Column(JSONB, nullable=True)
    # Flag para diferenciar testes (webhook inativo) de produção (webhook ativo)
    is_test = Column(Boolean, nullable=False, server_default=text("true"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Plan(Base):
    __tablename__ = "plans"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    # Nome visível do plano (ex.: Basic, Pro, Expert)
    name = Column(String(255), nullable=False)
    # Código/slug único usado para ligar usuários e webhooks a este plano
    code = Column(String(80), nullable=False, unique=True, index=True)
    description = Column(String(500), nullable=True)
    is_active = Column(Boolean, nullable=False, server_default=text("true"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PlanPeriod(Base):
    __tablename__ = "plan_periods"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    plan_id = Column(UUID(as_uuid=True), ForeignKey("plans.id", ondelete="CASCADE"), nullable=False, index=True)
    # monthly | quarterly | semiannual | annual
    period_type = Column(String(32), nullable=False)
    # Valor em centavos (ex.: 9900 = R$ 99,00)
    price_cents = Column(String(20), nullable=False)
    checkout_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, nullable=False, server_default=text("false"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CustomStrategy(Base):
    """Estratégia customizada criada pelo usuário via Gemini (opções binárias)."""
    __tablename__ = "custom_strategies"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    # Código Python da estratégia (função analyze que recebe candles e retorna "call"|"put"|None)
    code = Column(String(8000), nullable=False)
    # M1 ou M5: timeframe das velas e expiração
    timeframe = Column(String(4), nullable=False)
    description = Column(String(500), nullable=True)
    config = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PushSubscription(Base):
    """Subscription Web Push por usuário (PWA). Um usuário pode ter vários dispositivos."""
    __tablename__ = "push_subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint = Column(String(1024), nullable=False)
    p256dh = Column(String(255), nullable=False)
    auth = Column(String(255), nullable=False)
    user_agent = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ExtraLink(Base):
    """Links extras da sidebar do usuário (Sala Premium, Indicador, etc.)."""
    __tablename__ = "extra_links"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    key = Column(String(64), nullable=False, unique=True)
    label = Column(String(100), nullable=False)
    url = Column(String(2000), nullable=False, server_default=text("''"))
    icon = Column(String(64), nullable=False, server_default=text("'Link'"))
    is_active = Column(Boolean, nullable=False, server_default=text("true"))
    sort_order = Column(Integer, nullable=False, server_default=text("0"))
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PwaMessageTemplate(Base):
    """Templates de mensagem para gatilhos automáticos (abertura, fechamento, stop)."""
    __tablename__ = "pwa_message_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    trigger_key = Column(String(64), nullable=False, unique=True)  # operation_opened, operation_finished, stop_target
    title_template = Column(String(200), nullable=False)
    body_template = Column(String(500), nullable=False)
    is_active = Column(Boolean, nullable=False, server_default=text("true"))
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class UserPushPreferences(Base):
    """Preferências do usuário por gatilho de notificação PWA (só gatilhos automáticos; mensagem personalizada não pode ser desativada)."""
    __tablename__ = "user_push_preferences"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    trigger_key = Column(String(64), nullable=False)  # operation_opened | operation_finished | stop_target
    enabled = Column(Boolean, nullable=False, server_default=text("true"))
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    __table_args__ = (UniqueConstraint("user_id", "trigger_key", name="uq_user_push_prefs_user_trigger"),)


class PwaCustomMessage(Base):
    """Registro de mensagens personalizadas enviadas pelo admin (para estatísticas e histórico)."""
    __tablename__ = "pwa_custom_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    title = Column(String(200), nullable=False)
    body = Column(String(1000), nullable=False)
    url = Column(String(500), nullable=True)  # link opcional ao clicar na notificação
    sent_count = Column(Integer, nullable=False, server_default=text("0"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SmtpConfig(Base):
    """Configuração SMTP para envio de emails."""
    __tablename__ = "smtp_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    name = Column(String(100), nullable=False)
    host = Column(String(255), nullable=False)
    port = Column(Integer, nullable=False, default=587)
    secure = Column(Boolean, nullable=False, server_default=text("false"))  # True = SSL/TLS
    auth_user = Column(String(255), nullable=False)
    auth_password = Column(String(500), nullable=False)  # Armazenada criptografada
    from_email = Column(String(255), nullable=False)
    from_name = Column(String(100), nullable=True)
    is_active = Column(Boolean, nullable=False, server_default=text("true"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class EmailTemplate(Base):
    """Templates de email por gatilho/evento."""
    __tablename__ = "email_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    # Identificador do gatilho: welcome, password_reset, expiry_warning, expired, plan_activated
    event_type = Column(String(64), nullable=False, unique=True, index=True)
    name = Column(String(150), nullable=False)
    subject = Column(String(255), nullable=False)
    html_content = Column(String(50000), nullable=False)
    is_active = Column(Boolean, nullable=False, server_default=text("true"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class EmailLog(Base):
    """Histórico de emails enviados."""
    __tablename__ = "email_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    to_email = Column(String(255), nullable=False, index=True)
    event_type = Column(String(64), nullable=False)
    subject = Column(String(255), nullable=True)
    status = Column(String(20), nullable=False)  # sent | failed
    error = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UserOperation(Base):
    """
    Operação executada pelo robô para um determinado usuário (identificado por e-mail da corretora).
    Usado para relatórios e ranking de performance no painel admin.
    """

    __tablename__ = "user_operations"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    # E-mail usado na corretora Safirion (também utilizado para correlacionar com o usuário da plataforma).
    user_email = Column(String(255), nullable=False, index=True)
    # Momento em que a operação foi registrada/fechada.
    timestamp = Column(DateTime(timezone=True), nullable=False)
    asset = Column(String(64), nullable=True)
    direction = Column(String(10), nullable=True)  # "call" | "put"
    result = Column(String(10), nullable=True)  # "win" | "loss"
    entry_value = Column(Float, nullable=True)
    profit = Column(Float, nullable=True)
    balance_after = Column(Float, nullable=True)
    # Lucro total acumulado no robô após esta operação (ajuda em gráficos futuros).
    total_profit_after = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


def get_engine():
    url = os.environ.get("DATABASE_URL") or "postgresql://app:app_secret@localhost:5432/app_db"

    # Alguns painéis/env vars configuram `postgres://` (sem o "ql"), mas o SQLAlchemy
    # espera `postgresql://`. Normalizamos para evitar crash no boot.
    if url.startswith("postgres://"):
        logging.warning("[database] DATABASE_URL com esquema `postgres://`. Convertendo para `postgresql://`.")
        url = url.replace("postgres://", "postgresql://", 1)

    return create_engine(
        url,
        pool_pre_ping=True,
        pool_size=20,           # conexões permanentes (suficiente para 100+ users)
        max_overflow=30,        # conexões extras sob carga (total máx = 50)
        pool_timeout=30,        # segundos esperando conexão livre
        pool_recycle=1800,      # recicla conexões a cada 30min (evita stale)
    )


def get_session_factory():
    return sessionmaker(autocommit=False, autoflush=False, bind=get_engine())


SessionLocal = get_session_factory()


def init_db() -> None:
    """
    Inicializa as tabelas necessárias no banco de dados.
    Seguro para ser chamado múltiplas vezes (create_all é idempotente).
    """
    engine = get_engine()

    # Necessário para a função `gen_random_uuid()` usada nos defaults dos UUIDs.
    # Em um banco "zerado", a extensão pode não estar habilitada.
    try:
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
    except Exception as e:
        # Se a permissão não permitir criar extensão, manter log e seguir.
        # As tabelas podem falhar depois por causa de `gen_random_uuid()`.
        logging.warning("[database] Falha ao criar extensão pgcrypto: %s", e)

    Base.metadata.create_all(bind=engine)
    # Compatibilidade com esquemas já existentes: garante colunas novas sem precisar dropar tabela.
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE webhook_payloads ADD COLUMN IF NOT EXISTS process_details JSONB"))
        conn.execute(text("ALTER TABLE webhook_payloads ADD COLUMN IF NOT EXISTS response_body JSONB"))
        conn.execute(text("ALTER TABLE webhook_payloads ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT true"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_period VARCHAR(32)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS bot_config JSONB"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS broker_email VARCHAR(255)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS broker_password VARCHAR(255)"))
        conn.execute(text("ALTER TABLE custom_strategies ADD COLUMN IF NOT EXISTS config JSONB"))
        # Email system — garante colunas mesmo que tabela já existia sem elas
        conn.execute(text("ALTER TABLE smtp_configs ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true"))
        conn.execute(text("ALTER TABLE smtp_configs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()"))
        conn.execute(text("ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true"))
        conn.execute(text("ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS smtp_configs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(100) NOT NULL,
                host VARCHAR(255) NOT NULL,
                port INTEGER NOT NULL DEFAULT 587,
                secure BOOLEAN NOT NULL DEFAULT false,
                auth_user VARCHAR(255) NOT NULL,
                auth_password VARCHAR(500) NOT NULL,
                from_email VARCHAR(255) NOT NULL,
                from_name VARCHAR(100),
                is_active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now()
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS email_templates (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                event_type VARCHAR(64) NOT NULL UNIQUE,
                name VARCHAR(150) NOT NULL,
                subject VARCHAR(255) NOT NULL,
                html_content TEXT NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now()
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS email_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                to_email VARCHAR(255) NOT NULL,
                event_type VARCHAR(64) NOT NULL,
                subject VARCHAR(255),
                status VARCHAR(20) NOT NULL,
                error VARCHAR(500),
                created_at TIMESTAMPTZ DEFAULT now()
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS extra_links (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                key VARCHAR(64) NOT NULL UNIQUE,
                label VARCHAR(100) NOT NULL,
                url VARCHAR(2000) NOT NULL DEFAULT '',
                icon VARCHAR(64) NOT NULL DEFAULT 'Link',
                is_active BOOLEAN NOT NULL DEFAULT true,
                sort_order INTEGER NOT NULL DEFAULT 0,
                updated_at TIMESTAMPTZ DEFAULT now()
            )
        """))
        conn.execute(text("ALTER TABLE extra_links ADD COLUMN IF NOT EXISTS icon VARCHAR(64) NOT NULL DEFAULT 'Link'"))

        # ── Indexes para performance com muitos usuários ──
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_user_ops_timestamp ON user_operations (\"timestamp\" DESC)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_user_ops_email_ts ON user_operations (user_email, \"timestamp\" DESC)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_webhook_payloads_processed ON webhook_payloads (processed)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs (created_at DESC)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_users_plan_expires ON users (plan_expires_at)"))

