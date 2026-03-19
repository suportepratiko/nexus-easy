#!/usr/bin/env python3
"""
Regenera chaves VAPID (Node web-push) e opcionalmente limpa subscriptions.

Uso (na raiz do projeto):
  node scripts/ensure-vapid.cjs   # só garante chaves
  python scripts/regenerate_vapid_and_clear_push.py --clear  # regenera + limpa subscriptions
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)

def main():
    ap = argparse.ArgumentParser(description="Regenerar VAPID (Node) e opcionalmente limpar push subscriptions")
    ap.add_argument("--clear", action="store_true", help="Limpar tabela push_subscriptions e regenerar chaves")
    args = ap.parse_args()

    vapid_file = ROOT / ".vapid_webpush.json"
    ensure_script = ROOT / "scripts" / "ensure-vapid.cjs"

    if args.clear:
        # Regenerar: remover chave antiga para force new keys
        if vapid_file.exists():
            vapid_file.unlink()
            print("Chave antiga removida.")
        if ensure_script.exists():
            subprocess.run(["node", str(ensure_script), str(ROOT)], cwd=str(ROOT), check=True)
            print("Nova chave VAPID (web-push) gerada em .vapid_webpush.json")

        # Carregar .env
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
        from sqlalchemy import text
        from backend.database import get_engine
        engine = get_engine()
        with engine.connect() as conn:
            result = conn.execute(text("DELETE FROM push_subscriptions"))
            conn.commit()
            print(f"Tabela push_subscriptions limpa ({result.rowcount} registros). Ative notificações de novo no PWA.")
    else:
        if not vapid_file.exists() and ensure_script.exists():
            subprocess.run(["node", str(ensure_script), str(ROOT)], cwd=str(ROOT), check=True)
            print("Chave VAPID gerada em .vapid_webpush.json")
        print("Dica: use --clear para regenerar chaves e limpar subscriptions.")

if __name__ == "__main__":
    main()
