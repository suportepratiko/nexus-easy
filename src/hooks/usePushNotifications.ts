import { useState, useCallback, useEffect } from "react";
import { getPushVapidPublic, savePushSubscription } from "@/lib/api/pwa";

export type PushStatus = "unsupported" | "prompt" | "granted" | "denied" | "subscribed" | "error";

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>("prompt");
  const [error, setError] = useState<string | null>(null);

  // Estado inicial
  useEffect(() => {
    if (!("Notification" in window) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") { setStatus("denied"); return; }
    if (Notification.permission === "granted") {
      navigator.serviceWorker?.ready
        .then((r) => r.pushManager?.getSubscription())
        .then((sub) => setStatus(sub ? "subscribed" : "granted"))
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

      // 2) Pega o SW — com timeout pois serviceWorker.ready pode travar indefinidamente
      const swReady = Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("SW timeout")), 8000)),
      ]);
      // Tenta pegar SW ativo já registrado (mais rápido, evita o timeout)
      let reg: ServiceWorkerRegistration;
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        const active = regs.find((r) => r.active);
        reg = active ?? await swReady;
      } catch {
        reg = await swReady;
      }

      // 3) Subscribe push
      const old = await reg.pushManager.getSubscription();
      if (old) await old.unsubscribe();

      const { publicKey } = await getPushVapidPublic();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToArray(publicKey.trim()),
      });
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
