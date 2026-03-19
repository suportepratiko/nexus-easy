#!/usr/bin/env python3
"""Define role=admin para um usuário por e-mail. Uso: python scripts/set_admin_role.py cletoguii@gmail.com"""
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
    user = os.environ.get("POSTGRES_USER", "app")
    password = os.environ.get("POSTGRES_PASSWORD", "app_secret")
    host = os.environ.get("POSTGRES_HOST", "localhost")
    port = os.environ.get("POSTGRES_PORT", "5432")
    db = os.environ.get("POSTGRES_DB", "app_db")
    os.environ["DATABASE_URL"] = f"postgresql://{user}:{password}@{host}:{port}/{db}"

from sqlalchemy import create_engine, text

EMAIL = (sys.argv[1] if len(sys.argv) > 1 else "").strip().lower() or "cletoguii@gmail.com"

def main():
    url = os.environ.get("DATABASE_URL", "postgresql://app:app_secret@localhost:5432/app_db")
    engine = create_engine(url, pool_pre_ping=True)
    with engine.connect() as conn:
        r = conn.execute(text("UPDATE users SET role = 'admin' WHERE email = :e RETURNING email"), {"e": EMAIL})
        conn.commit()
        row = r.fetchone()
    if row:
        print(f"Role da conta {EMAIL} definido como 'admin'.")
    else:
        print(f"Usuário não encontrado: {EMAIL}")
        sys.exit(1)

if __name__ == "__main__":
    main()
