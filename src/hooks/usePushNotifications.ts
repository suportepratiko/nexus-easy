import { useState, useCallback, useEffect } from "react";
import { getPushVapidPublic, savePushSubscription } from "@/lib/api/pwa";

export type PushStatus = "unsupported" | "prompt" | "granted" | "denied" | "subscribed" | "error";

async function _getSW(): Promise<ServiceWorkerRegistration> {
  const swReady = Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error("SW timeout")), 8000)),
  ]);
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    const active = regs.find((r) => r.active);
    return active ?? await swReady;
  } catch {
    return await swReady;
  }
}

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>("prompt");
  const [error, setError] = useState<string | null>(null);

  // Estado inicial + auto-sync: se já tem permissão e subscription válida,
  // re-salva no banco para garantir que este dispositivo está registrado.
  useEffect(() => {
    if (!("Notification" in window) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") { setStatus("denied"); return; }
    if (Notification.permission === "granted") {
      _getSW()
        .then((reg) => reg.pushManager?.getSubscription())
        .then(async (sub) => {
          if (sub) {
            // Subscription local válida → re-salva no banco (garante que este
            // dispositivo continua registrado mesmo após o usuário abrir em outro device)
            try { await savePushSubscription(sub, navigator.userAgent); } catch { /* silencioso */ }
            setStatus("subscribed");
          } else {
            setStatus("granted");
          }
        })
        .catch(() => setStatus("granted"));
    }
  }, []);

  const enable = useCallback(async (
    onSuccess?: () => void,
    onError?: (msg: string) => void,
  ) => {
    setError(null);
    try {
      // 1) Pede permissão (deve ser a primeira coisa — iOS exige contexto de gesto)
      if (Notification.permission !== "granted") {
        const result = await Notification.requestPermission();
        if (result !== "granted") {
          setStatus("denied");
          const msg = "Permissão negada.";
          setError(msg);
          onError?.(msg);
          return;
        }
        setStatus("granted");
      }

      // 2) Pega o SW
      const reg = await _getSW();

      // 3) Reutiliza subscription existente se possível; só recria se não existir
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const { publicKey } = await getPushVapidPublic();
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64ToArray(publicKey.trim()),
        });
      }

      // 4) Sempre re-salva no banco (garante registro atualizado deste dispositivo)
      await savePushSubscription(sub, navigator.userAgent);
      setStatus("subscribed");
      onSuccess?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao ativar notificações.";
      setStatus("error");
      setError(msg);
      onError?.(msg);
    }
  }, []);

  return { status, error, enable };
}

function b64ToArray(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
