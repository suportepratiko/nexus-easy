#!/usr/bin/env python3
"""Adiciona colunas is_active e expires_at na tabela users se não existirem. Rode uma vez: python scripts/migrate_add_user_columns.py"""
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
    url = os.environ["DATABASE_URL"]
    engine = create_engine(url, pool_pre_ping=True)
    with engine.connect() as conn:
        for col, sql in [
            ("is_active", "ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true"),
            ("expires_at", "ALTER TABLE users ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE"),
        ]:
            try:
                conn.execute(text(sql))
                conn.commit()
                print(f"Coluna {col} adicionada.")
            except Exception as e:
                msg = str(e).lower()
                if "already exists" in msg or "duplicate_column" in msg:
                    print(f"Coluna {col} já existe.")
                else:
                    print(f"Erro em {col}: {e}")
                    sys.exit(1)
    print("Migração concluída. Pode fazer login.")

if __name__ == "__main__":
    main()
