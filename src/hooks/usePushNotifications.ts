import { useState, useCallback, useEffect } from "react";
import { getPushVapidPublic, savePushSubscription } from "@/lib/api/pwa";

export type PushStatus = "unsupported" | "prompt" | "granted" | "denied" | "subscribed" | "error";

/** Obtém ou registra o Service Worker. */
async function getServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    // serviceWorker.ready resolve imediatamente se o SW já está ativo (PWA instalado)
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((r) => setTimeout(() => r(null), 5000)),
    ]) as ServiceWorkerRegistration | null;
    if (reg) return reg;
  } catch (_) { /* continua */ }
  // Fallback: registra manualmente
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (err) {
    console.error("[push] SW register erro:", err);
    return null;
  }
}

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>("prompt");
  const [error, setError] = useState<string | null>(null);

  // Verifica estado inicial (sem pedir permissão)
  useEffect(() => {
    if (!("Notification" in window) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    if (Notification.permission === "granted") {
      // Verifica se tem subscription ativa
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager?.getSubscription())
        .then((sub) => { if (sub) setStatus("subscribed"); })
        .catch(() => { /* ignora */ });
    }
  }, []);

  /**
   * Ativa notificações push.
   * IMPORTANTE: deve ser chamado a partir de um clique/toque do usuário.
   * No iOS, requestPermission() precisa estar dentro do contexto do gesto.
   */
  const enable = useCallback(async (
    onSuccess?: () => void,
    onError?: (message: string) => void,
  ) => {
    setError(null);

    // 1. Suporte básico
    if (!("Notification" in window) || !("PushManager" in window)) {
      const msg = "Seu navegador não suporta notificações push.";
      setStatus("unsupported");
      setError(msg);
      onError?.(msg);
      return;
    }

    // 2. Já bloqueado
    if (Notification.permission === "denied") {
      const msg = "Notificações bloqueadas. Habilite nas configurações do dispositivo.";
      setStatus("denied");
      setError(msg);
      onError?.(msg);
      return;
    }

    // 3. Pede permissão AGORA (ainda dentro do contexto do gesto do usuário)
    //    No iOS isso deve acontecer antes de qualquer await pesado.
    if (Notification.permission !== "granted") {
      let result: NotificationPermission;
      try {
        result = await Notification.requestPermission();
      } catch {
        result = "denied";
      }
      if (result !== "granted") {
        setStatus("denied");
        const msg = "Permissão negada.";
        setError(msg);
        onError?.(msg);
        return;
      }
    }

    // 4. Obtém o Service Worker (após permissão concedida)
    const reg = await getServiceWorker();
    if (!reg) {
      const msg = "Não foi possível iniciar o service worker. Feche e reabra o app.";
      setStatus("error");
      setError(msg);
      onError?.(msg);
      return;
    }

    // 5. Inscreve no push
    try {
      const pm = reg.pushManager;
      if (!pm) {
        const msg = "PushManager não disponível. Abra o app pelo ícone na tela de início.";
        setStatus("error");
        setError(msg);
        onError?.(msg);
        return;
      }
      // Cancela subscription antiga (evita BadJwtToken)
      const existing = await pm.getSubscription();
      if (existing) await existing.unsubscribe();
      const { publicKey } = await getPushVapidPublic();
      const sub = await pm.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(publicKey.trim()),
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

function urlB64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}
