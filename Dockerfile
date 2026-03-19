FROM node:20-bookworm-slim
WORKDIR /app

# Dependências do backend (FastAPI/Uvicorn) e para pip instalar módulos nativos
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  python3-venv \
  python3-pip \
  build-essential \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# 1) Instala dependências do frontend
COPY package*.json ./
RUN npm ci

# A partir daqui, pode tratar como produção (sem impactar o que já foi instalado).
ENV NODE_ENV=production

# 2) Cria o venv do backend e instala dependências python
COPY backend ./backend
COPY scripts ./scripts
RUN npm run setup:backend

# 3) Copia o restante do código
COPY . .

EXPOSE 8000

# Roda backend + frontend (Vite dev) juntos no mesmo container.
# Observação: o backend escuta em 8001 e o frontend em 8000.
CMD ["sh", "-c", "node scripts/start-backend.cjs & npx vite --host 0.0.0.0 --port 8000 --strictPort"]

