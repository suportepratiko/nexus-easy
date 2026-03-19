#!/usr/bin/env node
/**
 * Inicia o backend FastAPI usando o venv do projeto.
 * Carrega .env da raiz e repassa ao processo Python.
 */
const { spawn } = require("child_process");
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
