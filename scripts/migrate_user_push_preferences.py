#!/usr/bin/env python3
"""Cria a tabela user_push_preferences se não existir. Rode uma vez: python scripts/migrate_user_push_preferences.py"""
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
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS user_push_preferences (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                trigger_key VARCHAR(64) NOT NULL,
                enabled BOOLEAN NOT NULL DEFAULT true,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
                UNIQUE(user_id, trigger_key)
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_push_preferences_user_id ON user_push_preferences(user_id)"))
        conn.commit()
    print("Tabela user_push_preferences criada ou já existia.")

if __name__ == "__main__":
    main()
