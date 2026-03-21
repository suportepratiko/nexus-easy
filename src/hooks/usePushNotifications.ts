import { useState, useCallback, useEffect } from "react";
import { getPushVapidPublic, savePushSubscription } from "@/lib/api/pwa";

export type PushStatus = "unsupported" | "prompt" | "granted" | "denied" | "subscribed" | "error";

/** Espera um registration ficar ativo (installing/waiting → activated). */
function waitForActive(reg: ServiceWorkerRegistration): Promise<ServiceWorkerRegistration> {
  if (reg.active) return Promise.resolve(reg);
  return new Promise<ServiceWorkerRegistration>((resolve) => {
    const sw = reg.installing || reg.waiting;
    if (!sw) { resolve(reg); return; }
    sw.addEventListener("statechange", () => {
      if (sw.state === "activated") resolve(reg);
    });
    setTimeout(() => resolve(reg), 5000);
  });
}

/** Garante que o SW está registrado e ativo. Tenta múltiplas estratégias. */
async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;

  // 1) Se já existe registration ativo, usa ele
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing?.active) return existing;
  if (existing) return waitForActive(existing);

  // 2) Espera um pouco — o vite-plugin-pwa auto-register pode estar rodando
  await new Promise((r) => setTimeout(r, 1500));
  const delayed = await navigator.serviceWorker.getRegistration("/");
  if (delayed?.active) return delayed;
  if (delayed) return waitForActive(delayed);

  // 3) Tenta registrar manualmente
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return waitForActive(reg);
  } catch (err) {
    console.error("[push] SW register falhou:", err);
  }

  // 4) Último recurso: navigator.serviceWorker.ready (espera qualquer SW ativar)
  try {
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((r) => setTimeout(() => r(null), 8000)),
    ]);
    if (ready) return ready;
  } catch (err) {
    console.error("[push] SW ready falhou:", err);
  }

  return null;
}

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>("prompt");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!("Notification" in window) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const reg = await ensureServiceWorker();
        if (!reg || cancelled) return;
        const sub = await reg.pushManager?.getSubscription?.();
        if (cancelled) return;
        if (Notification.permission === "granted" && sub) {
          setStatus("subscribed");
        } else if (Notification.permission === "granted") {
          setStatus("granted");
        }
      } catch {
        if (!cancelled) setStatus("prompt");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async (onSuccess?: () => void, onError?: (message: string) => void) => {
    setError(null);
    if (!("Notification" in window) || !("PushManager" in window)) {
      setStatus("unsupported");
      const msg = "Seu navegador não suporta notificações push.";
      setError(msg);
      onError?.(msg);
      return;
    }
    const permission = Notification.permission;
    if (permission === "denied") {
      setStatus("denied");
      const msg = "Notificações foram bloqueadas. Habilite nas configurações do navegador.";
      setError(msg);
      onError?.(msg);
      return;
    }
    const reg = await ensureServiceWorker();
    if (!reg) {
      const msg = "Falha ao registrar service worker.";
      setError(msg);
      setStatus("error");
      onError?.(msg);
      return;
    }
    if (permission !== "granted") {
      const result = await Notification.requestPermission();
      if (result !== "granted") {
        setStatus("denied");
        const msg = "Permissão negada.";
        setError(msg);
        onError?.(msg);
        return;
      }
    }
    try {
      // Sempre cancelar subscription antiga para forçar nova com a chave atual do backend (evita BadJwtToken)
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();
      const { publicKey } = await getPushVapidPublic();
      const key = urlB64ToUint8Array(publicKey.trim());
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await savePushSubscription(sub, navigator.userAgent);
      setStatus("subscribed");
      onSuccess?.();
    } catch (e) {
      const msg = e && typeof e === "object" && "detail" in e ? String((e as { detail: string }).detail) : "Push não configurado ou falha ao ativar.";
      setError(msg);
      setStatus("error");
      onError?.(msg);
    }
  }, []);

  return { status, error, enable };
}

function urlB64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}
