import { useEffect } from "react";
import { getPlatformToken } from "@/lib/api";

/** Envia heartbeat a cada 30s para registrar que o usuário está online. */
export function useHeartbeat() {
  useEffect(() => {
    const send = () => {
      const token = getPlatformToken();
      if (!token) return;
      fetch("/api/platform/heartbeat", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    };

    send(); // imediato ao montar
    const id = setInterval(send, 30_000);
    return () => clearInterval(id);
  }, []);
}
