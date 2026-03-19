#!/usr/bin/env node
/**
 * Cria o venv do backend e instala as dependências (rode uma vez).
 * Uso: npm run setup:backend
 */
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.resolve(__dirname, "..");
const isWin = process.platform === "win32";
const venvDir = path.join(root, "backend", "venv");
const venvPython = path.join(
  venvDir,
  isWin ? "Scripts" : "bin",
  isWin ? "python.exe" : "python"
);
const requirements = path.join(root, "backend", "requirements.txt");

console.log("[setup] Verificando backend...");

if (fs.existsSync(venvPython)) {
  console.log("[setup] Venv já existe. Instalando/atualizando dependências...");
} else {
  console.log("[setup] Criando venv em backend/venv ...");
  const py = isWin ? "python" : "python3";
  try {
    execSync(`${py} -m venv backend/venv`, { cwd: root, stdio: "inherit" });
  } catch (e) {
    console.error("[setup] Erro ao criar venv.");
    console.error("");
    console.error("Em Debian/Ubuntu instale o pacote do venv:");
    console.error("  sudo apt update");
    console.error("  sudo apt install python3-venv");
    console.error("  # ou, se usar Python 3.10: sudo apt install python3.10-venv");
    console.error("");
    console.error("Depois rode de novo: npm run setup:backend");
    process.exit(1);
  }
}

if (!fs.existsSync(requirements)) {
  console.error("[setup] Arquivo backend/requirements.txt não encontrado.");
  process.exit(1);
}

function runPipInstall() {
  execSync(`"${venvPython}" -m pip install -r backend/requirements.txt`, {
    cwd: root,
    stdio: "inherit",
  });
}

console.log("[setup] Instalando dependências do backend...");
try {
  runPipInstall();
} catch (e) {
  const msg = (e.message || e.stderr || "").toString();
  if (msg.includes("No module named pip") || msg.includes("No module named 'pip'")) {
    console.error("[setup] Este venv foi criado sem pip. Recriando o venv...");
    const py = isWin ? "python" : "python3";
    try {
      if (fs.existsSync(venvDir)) {
        fs.rmSync(venvDir, { recursive: true });
      }
      execSync(`${py} -m venv backend/venv`, { cwd: root, stdio: "inherit" });
      runPipInstall();
    } catch (e2) {
      console.error("[setup] Erro ao recriar venv. Instale: apt install python3-venv e rode de novo.");
      process.exit(1);
    }
  } else {
    throw e;
  }
}

console.log("[setup] Pronto. Agora rode: npm run dev");
console.log("[setup] (Opcional) Para criar o usuário admin no banco: PYTHONPATH=" + root + " " + venvPython + " scripts/init_db.py");
