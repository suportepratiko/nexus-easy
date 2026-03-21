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
    if (!reg) {
      const msg = "Não foi possível iniciar o service worker. Tente fechar e reabrir o app.";
      setError(msg);
      setStatus("error");
      onError?.(msg);
      return;
    }
    if (permission !== "granted") {
      const result = await Notification.requestPermission();
      if (result !== "granted") {
        setStatus("denied");
        const msg = "Permissão negada. Habilite nas configurações do dispositivo.";
        setError(msg);
        onError?.(msg);
        return;
      }
    }
    try {
      // Sempre cancelar subscription antiga para forçar nova com a chave atual (evita BadJwtToken)
      const pm = reg.pushManager;
      if (!pm) throw new Error("PushManager não disponível. Abra o app pelo ícone na tela de início.");
      const existing = await pm.getSubscription();
      if (existing) await existing.unsubscribe();
      const { publicKey } = await getPushVapidPublic();
      const key = urlB64ToUint8Array(publicKey.trim());
      const sub = await pm.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await savePushSubscription(sub, navigator.userAgent);
      setStatus("subscribed");
      onSuccess?.();
    } catch (e) {
      let msg = "Falha ao ativar notificações push.";
      if (e && typeof e === "object") {
        if ("detail" in e) {
          msg = String((e as { detail: string }).detail);
        } else if ("message" in e) {
          const raw = String((e as { message: string }).message);
          // Mensagem amigável para erros conhecidos
          if (raw.toLowerCase().includes("pushmanager")) {
            msg = "Abra o app pelo ícone na tela de início para ativar notificações.";
          } else if (raw.toLowerCase().includes("permission")) {
            msg = "Permissão negada. Habilite nas configurações do dispositivo.";
          } else {
            msg = raw;
          }
        }
      }
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
