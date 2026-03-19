#!/usr/bin/env node
/**
 * Inicia o backend FastAPI usando o venv do projeto.
 * Carrega .env da raiz e repassa ao processo Python.
 */
const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.resolve(__dirname, "..");
const isWin = process.platform === "win32";
const venvPython = path.join(
  root,
  "backend",
  "venv",
  isWin ? "Scripts" : "bin",
  isWin ? "python.exe" : "python"
);

if (!fs.existsSync(venvPython)) {
  console.error("[backend] ERRO: venv do backend não encontrado.");
  console.error("[backend] Rode: npm run setup:backend");
  process.exit(1);
}

function sleepSync(ms) {
  // Atomics.wait permite "sleep síncrono" em Node.js sem async/await.
  // Ideal para retries de start em ambiente (ex.: EasyPanel).
  const sab = new SharedArrayBuffer(4);
  const int32 = new Int32Array(sab);
  Atomics.wait(int32, 0, 0, ms);
}

// Carregar .env e repassar ao backend (garante DATABASE_URL etc.)
const envPath = path.join(root, ".env");
const env = { ...process.env, PYTHONPATH: root };
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (t && !t.startsWith("#") && t.includes("=")) {
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      env[k] = v;
    }
  }
}

// Garante que tabelas e admin existem no banco recém-criado.
// Script é idempotente e não apaga dados.
const seedAttempts = 10;
for (let i = 1; i <= seedAttempts; i++) {
  try {
    console.log(`[backend] seed init_db.py (tentativa ${i}/${seedAttempts}) ...`);
    execSync(`"${venvPython}" scripts/init_db.py`, { cwd: root, env, stdio: "inherit" });
    console.log("[backend] seed init_db.py concluído.");
    break;
  } catch (e) {
    if (i === seedAttempts) {
      console.error("[backend] Falha definitiva ao executar seed init_db.py:", e?.message ?? e);
      process.exit(1);
    }
    console.warn("[backend] Seed falhou; aguardando para nova tentativa...");
    sleepSync(2000 * i);
  }
}

console.error("[backend] API em http://localhost:8001 (frontend em 8000) ...");

const child = spawn(
  venvPython,
  ["-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8001", "--reload", "--reload-dir", "backend", "--reload-dir", "safirionapi"],
  {
    stdio: "inherit",
    cwd: root,
    env,
  }
);

child.on("error", (err) => {
  console.error("[backend] Erro:", err.message);
  console.error("[backend] Confira: npm run setup:backend");
  process.exit(1);
});

child.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.error("[backend] Processo encerrado com código", code);
  }
  process.exit(code ?? 0);
});
