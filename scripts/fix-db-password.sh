#!/bin/sh
# Ajusta a senha do usuário "app" no Postgres para "app_secret" (igual ao .env).
# Use se o login der "password authentication failed for user app".
# Requer um container Postgres rodando (docker compose up -d ou outro).

CONTAINER="${POSTGRES_CONTAINER:-app_postgres}"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "Container ${CONTAINER} não está rodando."
  echo "Liste os containers: docker ps"
  echo "Se o Postgres tiver outro nome, use: POSTGRES_CONTAINER=nome_do_container ./scripts/fix-db-password.sh"
  exit 1
fi

echo "Ajustando senha do usuário 'app' no container ${CONTAINER}..."
docker exec -i "$CONTAINER" psql -U postgres -c "ALTER USER app PASSWORD 'app_secret';" 2>/dev/null || \
docker exec -i "$CONTAINER" psql -U postgres -c "ALTER USER app WITH PASSWORD 'app_secret';"

if [ $? -eq 0 ]; then
  echo "Senha alterada. Reinicie o backend (npm run dev) e tente logar de novo."
else
  echo "Erro. O usuário 'app' pode não existir. Crie com:"
  echo "  docker exec -i $CONTAINER psql -U postgres -c \"CREATE USER app WITH PASSWORD 'app_secret'; CREATE DATABASE app_db OWNER app;\""
  exit 1
fi
