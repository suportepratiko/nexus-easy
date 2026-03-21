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

# 2) Cria o venv do backend e instala dependências python
COPY backend ./backend
COPY scripts ./scripts
RUN npm run setup:backend

# 3) Copia o restante do código
COPY . .

# 4) Build do frontend (gera dist/ com SW compilado para produção)
RUN npm run build

EXPOSE 8000

# Roda backend + frontend em produção (vite preview serve o dist/).
# Backend escuta em 8001, frontend em 8000.
CMD ["npm", "start"]
