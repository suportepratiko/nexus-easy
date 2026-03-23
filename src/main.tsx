import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Sempre tema escuro
document.documentElement.classList.add("dark");
document.documentElement.classList.remove("light");

createRoot(document.getElementById("root")!).render(<App />);

// Auto-update PWA: quando um novo Service Worker estiver pronto, ativa e recarrega
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });

  navigator.serviceWorker.ready.then((reg) => {
    // Verifica imediatamente ao abrir o app
    reg.update();
    // E continua verificando a cada 60 segundos enquanto o app está aberto
    setInterval(() => reg.update(), 60_000);

    reg.addEventListener("updatefound", () => {
      const newSW = reg.installing;
      if (!newSW) return;
      newSW.addEventListener("statechange", () => {
        if (newSW.state === "installed" && navigator.serviceWorker.controller) {
          // Novo SW instalado e pronto — envia skipWaiting para ativar imediatamente
          newSW.postMessage({ type: "SKIP_WAITING" });
        }
      });
    });
  });
}
