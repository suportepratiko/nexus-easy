-- Tabela de usuários da plataforma (user / admin)
-- Rodar com: psql "$DATABASE_URL" -f scripts/init_db.sql
-- Ou: docker exec -i app_postgres psql -U app -d app_db < scripts/init_db.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para login por email
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Conta admin: admin@nexus.com / gemeos123
-- Hash: crypt('gemeos123', gen_salt('bf')) (compatível com passlib/bcrypt)
INSERT INTO users (email, password_hash, role)
VALUES ('admin@nexus.com', crypt('gemeos123', gen_salt('bf')), 'admin')
ON CONFLICT (email) DO NOTHING;
