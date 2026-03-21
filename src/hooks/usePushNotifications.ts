import { useState, useCallback, useEffect } from "react";
import { getPushVapidPublic, savePushSubscription } from "@/lib/api/pwa";

export type PushStatus = "unsupported" | "prompt" | "granted" | "denied" | "subscribed" | "error";

/** Aguarda SW ativo; resolve com timeout de segurança. */
function waitForActive(reg: ServiceWorkerRegistration, timeoutMs = 6000): Promise<ServiceWorkerRegistration> {
  if (reg.active) return Promise.resolve(reg);
  return new Promise<ServiceWorkerRegistration>((resolve) => {
    const sw = reg.installing || reg.waiting;
    if (!sw) { setTimeout(() => resolve(reg), 500); return; }
    const onStateChange = () => {
      if (sw.state === "activated" || sw.state === "active" as ServiceWorkerState) {
        sw.removeEventListener("statechange", onStateChange);
        resolve(reg);
      }
    };
    sw.addEventListener("statechange", onStateChange);
    setTimeout(() => resolve(reg), timeoutMs);
  });
}

/**
 * Garante que existe um SW ativo para usar o PushManager.
 *
 * Estratégia:
 * 1) navigator.serviceWorker.ready — em PWA instalado resolve imediatamente.
 *    Timeout de 4s para não travar num browser sem SW.
 * 2) getRegistrations() — pega qualquer SW já registrado na origem.
 * 3) Registro manual de /sw.js como último recurso.
 */
async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;

  // 1) serviceWorker.ready — mais confiável em PWA instalado (SW já ativo)
  try {
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((r) => setTimeout(() => r(null), 4000)),
    ]) as ServiceWorkerRegistration | null;
    if (ready?.active) return ready;
  } catch (err) {
    console.warn("[push] serviceWorker.ready:", err);
  }

  // 2) Busca qualquer registration ativa na origem (funciona quando .ready falha)
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    const active = regs.find((r) => r.active);
    if (active) return active;
    // Ainda há registrations em ativação — espera a primeira
    if (regs.length > 0) return waitForActive(regs[0]);
  } catch (err) {
    console.warn("[push] getRegistrations:", err);
  }

  // 3) Sem SW algum — registra manualmente
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return waitForActive(reg);
  } catch (err) {
    console.error("[push] register falhou:", err);
    return null;
  }
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
    if (!reg || !reg.pushManager) {
      // iOS < 16.4 não suporta push mesmo com SW registrado
      const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const msg = isIos
        ? "Notificações push requerem iOS 16.4+ e o app instalado via 'Adicionar à Tela de Início'."
        : "Não foi possível iniciar o service worker. Tente recarregar o app.";
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
