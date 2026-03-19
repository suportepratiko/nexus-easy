"""
Web Push PWA — envio via Node.js 'web-push' (referência, evita BadJwtToken).

Fluxo:
- Chaves VAPID em .vapid_webpush.json (geradas por web-push.generateVAPIDKeys()).
- GET /api/platform/push-vapid-public devolve essa chave pública.
- Envio: subprocess para node scripts/webpush-send.cjs com subscription + payload.
"""
from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
_VAPID_FILE = _ROOT / ".vapid_webpush.json"
_SCRIPT_SEND = _ROOT / "scripts" / "webpush-send.cjs"
_SCRIPT_ENSURE = _ROOT / "scripts" / "ensure-vapid.cjs"

VAPID_PUBLIC_KEY: str | None = None


def _ensure_vapid_file() -> bool:
    if _VAPID_FILE.exists():
        try:
            data = json.loads(_VAPID_FILE.read_text(encoding="utf-8"))
            if data.get("publicKey") and data.get("privateKey"):
                return True
        except Exception:
            pass
    if not _SCRIPT_ENSURE.exists():
        logging.warning("push_service: scripts/ensure-vapid.cjs não encontrado")
        return False
    try:
        subprocess.run(
            ["node", str(_SCRIPT_ENSURE), str(_ROOT)],
            cwd=str(_ROOT),
            check=True,
            capture_output=True,
            timeout=10,
        )
    except Exception as e:
        logging.warning("push_service: não foi possível gerar VAPID (node scripts/ensure-vapid.cjs): %s", e)
        return False
    return _VAPID_FILE.exists()


def _load_public_key() -> None:
    global VAPID_PUBLIC_KEY
    if not _ensure_vapid_file():
        return
    try:
        data = json.loads(_VAPID_FILE.read_text(encoding="utf-8"))
        VAPID_PUBLIC_KEY = (data.get("publicKey") or "").strip()
        if VAPID_PUBLIC_KEY:
            logging.info("push_service: VAPID carregado de %s", _VAPID_FILE)
    except Exception as e:
        logging.warning("push_service: erro ao ler %s: %s", _VAPID_FILE, e)


_load_public_key()


def is_configured() -> bool:
    return bool(VAPID_PUBLIC_KEY and _SCRIPT_SEND.exists())


def send_push_subscription(
    endpoint: str,
    p256dh: str,
    auth: str,
    payload: str | bytes,
    vapid_private_key: str | None = None,
) -> tuple[bool, int | None]:
    """
    Envia notificação via Node.js web-push.
    Retorna (sucesso, status_http_ou_None).
    status=410 significa que a subscription expirou e deve ser removida do banco.
    """
    if not VAPID_PUBLIC_KEY or not _SCRIPT_SEND.exists():
        logging.warning("push_service: VAPID ou scripts/webpush-send.cjs não disponível")
        return False, None
    if isinstance(payload, bytes):
        payload = payload.decode("utf-8", errors="replace")
    payload = payload or ""
    inp = json.dumps({
        "subscription": {
            "endpoint": endpoint.strip(),
            "keys": {"p256dh": (p256dh or "").strip(), "auth": (auth or "").strip()},
        },
        "payload": payload,
    })
    try:
        node = "node"
        proc = subprocess.run(
            [node, str(_SCRIPT_SEND)],
            input=inp,
            capture_output=True,
            text=True,
            cwd=str(_ROOT),
            timeout=30,
            env={**__import__("os").environ},
        )
        if proc.returncode == 0:
            return True, 200
        err = (proc.stderr or proc.stdout or "").strip()
        if not err:
            err = str(proc.returncode)
        # Detecta status HTTP na saída (ex: "status: 410")
        http_status: int | None = None
        for line in err.splitlines():
            line = line.strip()
            if line.startswith("status:"):
                try:
                    http_status = int(line.split(":", 1)[1].strip())
                except ValueError:
                    pass
        logging.warning(
            "push_service: webpush-send falhou | endpoint=%s | status=%s | %s",
            (endpoint or "")[:70],
            http_status,
            err.replace("\n", " "),
        )
        return False, http_status
    except subprocess.TimeoutExpired:
        logging.warning("push_service: webpush-send timeout")
        return False, None
    except Exception as e:
        logging.warning("push_service: erro ao enviar push: %s", e)
        return False, None
