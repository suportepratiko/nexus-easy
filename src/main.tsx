import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Sempre tema escuro
document.documentElement.classList.add("dark");
document.documentElement.classList.remove("light");

// Registra Service Worker para PWA e push
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(<App />);
