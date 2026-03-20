import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function ChatwootWidget() {
  const { pathname } = useLocation();

  // Oculta em rotas administrativas
  const isAdmin = pathname.startsWith("/admin");

  useEffect(() => {
    // Injeta o script apenas uma vez
    if (document.getElementById("chatwoot-sdk")) return;

    // Configurações antes do SDK
    (window as any).chatwootSettings = {
      hideMessageBubble: true,
    };

    const script = document.createElement("script");
    script.id = "chatwoot-sdk";
    script.src = "https://chat.pratiko.app.br/packs/js/sdk.js";
    script.async = true;
    script.onload = () => {
      (window as any).chatwootSDK.run({
        websiteToken: "LMa7MQp3YdcTuFdpRLfuBGjx",
        baseUrl: "https://chat.pratiko.app.br",
      });

      const btn = document.getElementById("chatwoot-custom-launcher");
      if (btn) {
        btn.addEventListener("click", () => {
          (window as any).$chatwoot?.toggle();
        });
      }
    };

    document.body.appendChild(script);
  }, []);

  if (isAdmin) return null;

  return (
    <img
      src="https://app.nexusautobot.com.br/chatbot/suporte.gif"
      id="chatwoot-custom-launcher"
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        width: "70px",
        height: "70px",
        cursor: "pointer",
        zIndex: 999999,
      }}
      alt="Suporte"
    />
  );
}
