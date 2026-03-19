#!/usr/bin/env python3
"""
Cria a tabela users e insere a conta admin.
Rodar na raiz do projeto: python scripts/init_db.py
Requer: DATABASE_URL no .env ou variáveis POSTGRES_* (docker).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Raiz do projeto
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)

# Carregar .env se existir
_env = ROOT / ".env"
if _env.exists():
    for line in _env.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().replace('"', "").replace("'", ""))

# DATABASE_URL pode ser montada a partir de POSTGRES_*
if "DATABASE_URL" not in os.environ:
    user = os.environ.get("POSTGRES_USER", "app")
    password = os.environ.get("POSTGRES_PASSWORD", "app_secret")
    host = os.environ.get("POSTGRES_HOST", "localhost")
    port = os.environ.get("POSTGRES_PORT", "5432")
    db = os.environ.get("POSTGRES_DB", "app_db")
    os.environ["DATABASE_URL"] = f"postgresql://{user}:{password}@{host}:{port}/{db}"

from sqlalchemy import create_engine, text
from passlib.hash import bcrypt

from backend.database import Base, User, get_engine

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@nexus.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "gemeos123")
ADMIN_FORCE_UPDATE = os.environ.get("ADMIN_FORCE_UPDATE", "false").lower() in ("1", "true", "yes", "y")

# bcrypt limita a senha a <= 72 bytes (comportamento do próprio algoritmo).
# Em painéis, às vezes a variável pode vir com valor inesperadamente grande.
_ADMIN_PASSWORD_BYTES = ADMIN_PASSWORD.encode("utf-8", errors="ignore")
_MAX_BCRYPT_BYTES = 72
if len(_ADMIN_PASSWORD_BYTES) > _MAX_BCRYPT_BYTES:
    print(
        f"Aviso: ADMIN_PASSWORD com {len(_ADMIN_PASSWORD_BYTES)} bytes (>{_MAX_BCRYPT_BYTES}). "
        f"Usando senha padrão segura (ADMIN_PASSWORD='gemeos123') para permitir seed do admin."
    )
    ADMIN_PASSWORD = "gemeos123"


def main():
    engine = get_engine()
    print("Conectando ao PostgreSQL...")
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    print("Conexão OK.")

    print("Criando tabela users...")

    # Necessário para `gen_random_uuid()` (usado como default de UUIDs).
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))

    Base.metadata.create_all(bind=engine)

    # Migração: adicionar colunas is_active e expires_at se não existirem
    with engine.connect() as conn:
        for col, sql in [
            ("is_active", "ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true"),
            ("expires_at", "ALTER TABLE users ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE"),
        ]:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception as e:
                msg = str(e).lower()
                if "already exists" in msg or "duplicate_column" in msg:
                    pass  # coluna já existe
                else:
                    print(f"Aviso: migração {col}: {e}")

    from sqlalchemy.orm import sessionmaker
    from backend.database import User, UserRole

    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = Session()

    password_hash = bcrypt.hash(ADMIN_PASSWORD)
    existing = session.query(User).filter(User.email == ADMIN_EMAIL).first()
    if existing:
        if ADMIN_FORCE_UPDATE:
            existing.password_hash = password_hash
            existing.role = UserRole.ADMIN
            session.commit()
            print(f"Conta admin atualizada: {ADMIN_EMAIL} (role=admin, hash compatível com login)")
        else:
            print(f"Conta admin já existe: {ADMIN_EMAIL}. Mantendo credenciais existentes.")
    else:
        admin = User(email=ADMIN_EMAIL, password_hash=password_hash, role=UserRole.ADMIN)
        session.add(admin)
        session.commit()
        print(f"Conta admin criada: {ADMIN_EMAIL} (role=admin)")
    session.close()


if __name__ == "__main__":
    main()
