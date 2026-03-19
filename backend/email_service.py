"""
Serviço de envio de emails via SMTP.
Suporta templates com variáveis dinâmicas e gatilhos automáticos.
"""
from __future__ import annotations

import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timezone
from typing import Optional

from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

# Eventos disponíveis para templates
EMAIL_EVENT_TYPES = {
    "welcome":          "Boas-vindas (acesso liberado)",
    "password_reset":   "Recuperação de senha",
    "expiry_warning":   "Aviso de vencimento próximo",
    "expired":          "Assinatura vencida",
    "plan_activated":   "Plano ativado/renovado",
    "manual":           "Envio manual (admin)",
}

# Variáveis disponíveis em templates (substituídas em {{variavel}})
EMAIL_TEMPLATE_VARIABLES = {
    "{{nome}}":            "Nome do usuário",
    "{{email}}":           "Email do usuário",
    "{{plano}}":           "Nome do plano",
    "{{vencimento}}":      "Data de vencimento (dd/mm/aaaa)",
    "{{senha_padrao}}":    "Senha padrão para novos usuários (Senha123!)",
    "{{senha_temp}}":      "Senha temporária (reset de senha)",
    "{{link_acesso}}":     "Link de acesso à plataforma",
    "{{dias_restantes}}":  "Dias restantes até o vencimento",
    "{{ano}}":             "Ano atual",
}

# Senha padrão para novos usuários criados pelo admin/webhook
DEFAULT_NEW_USER_PASSWORD = "Senha123!"


def _get_fernet() -> Optional[Fernet]:
    import os
    key = os.environ.get("BROKER_ENC_KEY", "")
    if not key:
        return None
    try:
        return Fernet(key.encode())
    except Exception:
        return None


def encrypt_smtp_password(plain: str) -> str:
    f = _get_fernet()
    if f:
        return "enc:" + f.encrypt(plain.encode()).decode()
    return plain


def decrypt_smtp_password(stored: str) -> str:
    f = _get_fernet()
    if f and stored.startswith("enc:"):
        return f.decrypt(stored[4:].encode()).decode()
    return stored


def render_template(html: str, variables: dict) -> str:
    """Substitui {{variavel}} pelo valor correspondente no template."""
    result = html
    for key, value in variables.items():
        result = result.replace(f"{{{{{key}}}}}", str(value) if value is not None else "")
    return result


def _smtp_connect(host: str, port: int, secure: bool, auth_user: str, auth_password: str, timeout: int = 15):
    """
    Tenta conectar ao servidor SMTP com a combinação adequada de porta/SSL.
    Retorna o objeto server pronto para uso (dentro de context manager).
    Levanta exceção se falhar.
    """
    # SSL direto (porta 465 ou qualquer porta com secure=True)
    if secure:
        ctx = ssl.create_default_context()
        server = smtplib.SMTP_SSL(host, port, context=ctx, timeout=timeout)
        server.login(auth_user, auth_password)
        return server

    # STARTTLS (porta 587) — tenta primeiro
    try:
        server = smtplib.SMTP(host, port, timeout=timeout)
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(auth_user, auth_password)
        return server
    except smtplib.SMTPException as starttls_err:
        # Se STARTTLS falhar, tenta SSL na porta 465 como fallback
        logger.warning("STARTTLS falhou em %s:%s (%s), tentando SSL porta 465", host, port, starttls_err)
        ctx = ssl.create_default_context()
        server = smtplib.SMTP_SSL(host, 465, context=ctx, timeout=timeout)
        server.login(auth_user, auth_password)
        return server


def send_email(
    smtp_config: dict,
    to_email: str,
    subject: str,
    html_content: str,
) -> tuple[bool, Optional[str]]:
    """
    Envia um email via SMTP.
    Retorna (sucesso, mensagem_de_erro).
    """
    host = smtp_config["host"].strip()
    port = int(smtp_config["port"])
    secure = smtp_config.get("secure", False)
    auth_user = smtp_config["auth_user"]
    auth_password = decrypt_smtp_password(smtp_config["auth_password"])
    from_email = smtp_config["from_email"]
    from_name = smtp_config.get("from_name") or from_email

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    try:
        server = _smtp_connect(host, port, secure, auth_user, auth_password, timeout=15)
        with server:
            server.sendmail(from_email, to_email, msg.as_string())
        logger.info("Email enviado para %s (assunto: %s)", to_email, subject)
        return True, None
    except Exception as e:
        logger.error("Falha ao enviar email para %s: %s", to_email, e)
        return False, str(e)


def test_smtp_connection(smtp_config: dict) -> tuple[bool, str]:
    """Testa a conexão SMTP sem enviar email."""
    host = smtp_config["host"].strip()
    port = int(smtp_config["port"])
    secure = smtp_config.get("secure", False)
    auth_user = smtp_config["auth_user"]
    auth_password = decrypt_smtp_password(smtp_config.get("auth_password", ""))

    try:
        server = _smtp_connect(host, port, secure, auth_user, auth_password, timeout=10)
        server.quit()
        return True, "Conexão SMTP estabelecida com sucesso."
    except Exception as e:
        return False, str(e)


def trigger_email(event_type: str, user: object, extra_vars: dict | None = None, db=None) -> bool:
    """
    Dispara um email automático para um usuário baseado no evento.
    Busca o template e a config SMTP do banco e envia.
    """
    if db is None:
        return False

    from backend.database import EmailTemplate, SmtpConfig, EmailLog

    # Buscar template ativo
    template = db.query(EmailTemplate).filter(
        EmailTemplate.event_type == event_type,
        EmailTemplate.is_active == True,
    ).first()
    if not template:
        logger.info("Nenhum template ativo para evento '%s'", event_type)
        return False

    # Buscar config SMTP ativa
    smtp = db.query(SmtpConfig).filter(SmtpConfig.is_active == True).first()
    if not smtp:
        logger.warning("Nenhuma configuração SMTP ativa. Email não enviado.")
        return False

    # Montar variáveis do template
    expires_at = getattr(user, "expires_at", None)
    vencimento = expires_at.strftime("%d/%m/%Y") if expires_at else ""
    dias_restantes = ""
    if expires_at:
        delta = expires_at.replace(tzinfo=None) - datetime.utcnow()
        dias_restantes = str(max(0, delta.days))

    variables = {
        "nome": getattr(user, "name", "") or getattr(user, "email", ""),
        "email": getattr(user, "email", ""),
        "plano": getattr(user, "plan", "") or "",
        "vencimento": vencimento,
        "dias_restantes": dias_restantes,
        "link_acesso": "https://nexusbot.pratiko.app.br",
        "ano": str(datetime.now().year),
        "senha_padrao": DEFAULT_NEW_USER_PASSWORD,
    }
    if extra_vars:
        variables.update(extra_vars)

    subject = render_template(template.subject, variables)
    html = render_template(template.html_content, variables)

    smtp_dict = {
        "host": smtp.host,
        "port": smtp.port,
        "secure": smtp.secure,
        "auth_user": smtp.auth_user,
        "auth_password": smtp.auth_password,
        "from_email": smtp.from_email,
        "from_name": smtp.from_name,
    }

    success, error = send_email(smtp_dict, user.email, subject, html)

    # Registrar no log
    log = EmailLog(
        to_email=user.email,
        event_type=event_type,
        subject=subject,
        status="sent" if success else "failed",
        error=error,
    )
    db.add(log)
    db.commit()

    return success
