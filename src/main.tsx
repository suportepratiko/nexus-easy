import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

// Sempre tema escuro
document.documentElement.classList.add("dark");
document.documentElement.classList.remove("light");

createRoot(document.getElementById("root")!).render(<App />);

// Registra o SW e atualiza automaticamente sem pedir confirmação ao usuário
const updateSW = registerSW({
  immediate: true, // verifica atualização imediatamente ao abrir o app
  onNeedRefresh() {
    // Nova versão disponível — ativa e recarrega silenciosamente
    updateSW(true);
  },
  onOfflineReady() {
    // App pronto para uso offline — sem ação necessária
  },
  onRegisteredSW(_swUrl, reg) {
    // Verifica atualização a cada 60s enquanto o app está aberto
    if (reg) setInterval(() => reg.update(), 60_000);
  },
});
