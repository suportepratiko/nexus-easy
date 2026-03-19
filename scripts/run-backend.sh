#!/usr/bin/env bash
# Roda o backend FastAPI a partir da raiz do projeto (para importar safirionapi).
set -e
cd "$(dirname "$0")/.."
export PYTHONPATH="${PWD}:${PYTHONPATH}"
if [ ! -d "backend/venv" ] && [ -z "${VIRTUAL_ENV}" ]; then
  echo "Crie um venv e instale as deps: python -m venv backend/venv && backend/venv/bin/pip install -r backend/requirements.txt"
  exit 1
fi
PYTHON="${VIRTUAL_ENV}/bin/python"
[ -f backend/venv/bin/python ] && PYTHON="backend/venv/bin/python"
exec "$PYTHON" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
