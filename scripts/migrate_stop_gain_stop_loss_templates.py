#!/usr/bin/env python3
"""Migra templates PWA: stop_target -> stop_gain e stop_loss. Copia preferências do usuário."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)

_env = ROOT / ".env"
if _env.exists():
    for line in _env.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().replace('"', "").replace("'", ""))

if "DATABASE_URL" not in os.environ:
    u = os.environ.get("POSTGRES_USER", "app")
    p = os.environ.get("POSTGRES_PASSWORD", "app_secret")
    h = os.environ.get("POSTGRES_HOST", "localhost")
    pt = os.environ.get("POSTGRES_PORT", "5432")
    db = os.environ.get("POSTGRES_DB", "app_db")
    os.environ["DATABASE_URL"] = f"postgresql://{u}:{p}@{h}:{pt}/{db}"

from sqlalchemy import create_engine, text

def main():
    engine = create_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
    with engine.begin() as conn:
        # Templates: obter stop_target se existir para copiar texto
        row = conn.execute(
            text("SELECT title_template, body_template FROM pwa_message_templates WHERE trigger_key = 'stop_target'")
        ).fetchone()
        title_stop = "Stop Gain"
        body_stop_gain = "Meta de lucro atingida. O robô parou."
        body_stop_loss = "Limite de perda atingido. O robô parou."
        if row:
            title_stop = row[0] or title_stop
            body_stop_gain = body_stop_loss = (row[1] or body_stop_gain)

        # Inserir stop_gain e stop_loss se não existirem
        for key, title, body in [
            ("stop_gain", title_stop, body_stop_gain),
            ("stop_loss", "Stop Loss", body_stop_loss),
        ]:
            conn.execute(
                text("""
                    INSERT INTO pwa_message_templates (id, trigger_key, title_template, body_template, is_active, updated_at)
                    SELECT gen_random_uuid(), :key, :title, :body, true, now()
                    WHERE NOT EXISTS (SELECT 1 FROM pwa_message_templates WHERE trigger_key = :key)
                """),
                {"key": key, "title": title, "body": body},
            )
        # Remover stop_target
        conn.execute(text("DELETE FROM pwa_message_templates WHERE trigger_key = 'stop_target'"))

        # Preferências: copiar stop_target para stop_gain e stop_loss (só se ainda não existir), depois remover stop_target
        conn.execute(text("""
            INSERT INTO user_push_preferences (id, user_id, trigger_key, enabled, updated_at)
            SELECT gen_random_uuid(), a.user_id, 'stop_gain', a.enabled, now()
            FROM user_push_preferences a
            WHERE a.trigger_key = 'stop_target'
            AND NOT EXISTS (SELECT 1 FROM user_push_preferences b WHERE b.user_id = a.user_id AND b.trigger_key = 'stop_gain')
        """))
        conn.execute(text("""
            INSERT INTO user_push_preferences (id, user_id, trigger_key, enabled, updated_at)
            SELECT gen_random_uuid(), a.user_id, 'stop_loss', a.enabled, now()
            FROM user_push_preferences a
            WHERE a.trigger_key = 'stop_target'
            AND NOT EXISTS (SELECT 1 FROM user_push_preferences b WHERE b.user_id = a.user_id AND b.trigger_key = 'stop_loss')
        """))
        conn.execute(text("DELETE FROM user_push_preferences WHERE trigger_key = 'stop_target'"))

    print("Migração stop_gain/stop_loss concluída.")

if __name__ == "__main__":
    main()
