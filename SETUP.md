# Setup do projeto

## 1. PostgreSQL (Docker)

### Subir o banco

```bash
# Na raiz do projeto
cp .env.example .env
# Edite .env se quiser (usuário, senha, porta)

docker compose up -d
```

### Verificar

```bash
docker compose ps
# Conexão: postgresql://app:app_secret@localhost:5432/app_db
```

### Criar tabela e conta admin

**Opção A — Script SQL (recomendado se tiver `psql` ou acesso ao container):**

```bash
# Com variáveis do .env
export $(grep -v '^#' .env | xargs)
psql "$DATABASE_URL" -f scripts/init_db.sql

# Ou usando o container
docker exec -i app_postgres psql -U app -d app_db < scripts/init_db.sql
```

**Opção B — Script Python (exige dependências do backend):**

```bash
python -m venv backend/venv
source backend/venv/bin/activate   # Windows: backend\venv\Scripts\activate
pip install -r backend/requirements.txt
export PYTHONPATH="${PWD}"
python scripts/init_db.py
```

Conta admin:

- **E-mail:** `admin@nexus.com`
- **Senha:** `gemeos123`
- **Perfil:** admin

**Se o login falhar** com admin@nexus.com / gemeos123 (mensagem "E-mail ou senha incorretos" ou "Falha no login"):
1. Confirme que o **backend está rodando** em http://localhost:8000 e que o **.env** do front tem `VITE_API_URL=http://localhost:8000`.
2. O admin pode ter sido criado só com o SQL; o hash do PostgreSQL nem sempre é compatível. Rode o script Python **uma vez** para corrigir:
   ```bash
   cd /app
   source backend/venv/bin/activate   # ou: backend\venv\Scripts\activate
   pip install -r backend/requirements.txt
   export PYTHONPATH="${PWD}"
   python scripts/init_db.py
   ```
   Depois tente logar de novo.

### Dicas

- Para conectar com um cliente (DBeaver, pgAdmin, etc.): host `localhost`, porta `5432`, usuário e senha do `.env`.
- Para usar em aplicações: defina `DATABASE_URL=postgresql://app:app_secret@localhost:5432/app_db` (ou os valores do seu `.env`).

---

## 2. Backend da API Safirion (FastAPI)

O backend expõe a API da corretora Safirion para o frontend (login, saldos, perfil, etc.).

### Pré-requisitos

- Python 3.10+
- Venv recomendado

### Instalação e execução

```bash
# Na raiz do projeto
python -m venv backend/venv
source backend/venv/bin/activate   # Linux/macOS
# ou: backend\venv\Scripts\activate  # Windows

pip install -r backend/requirements.txt
export PYTHONPATH="${PWD}:${PYTHONPATH}"
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Ou use o script:

```bash
chmod +x scripts/run-backend.sh
./scripts/run-backend.sh
```

- API: http://localhost:8000  
- Docs: http://localhost:8000/docs  

### Variáveis de ambiente (opcional)

- O backend usa por padrão o host da corretora definido na `safirionapi`. Para override: `SAFIRION_HOST=ws.trade.safirion.com`.

---

## 3. Frontend (Vite + React)

### Instalação

```bash
npm install
```

### Variáveis de ambiente

No `.env` (copie de `.env.example`):

```env
VITE_API_URL=http://localhost:8000
```

Assim o frontend aponta para o backend da API Safirion.

### Execução

```bash
npm run dev
```

Acesse http://localhost:8080 (ou a porta que o Vite mostrar).

---

## Subir a aplicação (front + backend)

**Primeira vez** (cria o venv e instala as dependências do backend):

```bash
npm run setup:backend
```

**Sempre que for usar:**

```bash
npm run dev
```

Isso sobe o frontend (porta 8080) e o backend (porta 8000). O Vite faz **proxy** das chamadas `/api` e `/health` para o backend, então não é preciso configurar `VITE_API_URL` em desenvolvimento.

Se aparecer "Backend não está rodando", no terminal onde rodou `npm run dev` deve aparecer a linha `[backend] Iniciando em http://localhost:8000`. Se não aparecer, rode de novo `npm run setup:backend` e depois `npm run dev`.

Outros comandos:
- `npm run dev:front` — só o frontend
- `npm run backend` — só o backend

---

## Resumo rápido

| Serviço    | Comando / URL                          |
|-----------|-----------------------------------------|
| PostgreSQL| `docker compose up -d` → `localhost:5432` |
| **Tudo**  | `npm run dev` → front (8080) + back (8000) |
| Só front  | `npm run dev:front` → http://localhost:8080 |
| Só back   | `npm run backend` → http://localhost:8000 |
