import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Button } from "@/components/ui/button";
import { Bell, Loader2, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

const STORAGE_KEY = "pwa-notification-banner-dismissed";

/** Detecta mobile (qualquer browser, incluindo PWA e browser normal). */
function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Exibido em mobile quando notificações ainda não foram ativadas. */
export function PwaNotificationBanner() {
  const { status, enable } = usePushNotifications();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const autoPromptDone = useRef(false);

  useEffect(() => {
    if (!isMobile()) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const t = Number(raw);
        // Após denegar, não pede de novo em 30 dias; demais estados: 1 dia
        if (!Number.isNaN(t) && Date.now() - t < 24 * 60 * 60 * 1000) setDismissed(true);
      }
    } catch {
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    if (!isMobile() || dismissed) {
      setVisible(false);
      return;
    }
    if (status === "subscribed" || status === "denied" || status === "unsupported") {
      setVisible(false);
      return;
    }
    setVisible(true);
  }, [status, dismissed]);

  // Auto-ativa quando: permissão ainda não pedida ("prompt") OU concedida mas sem subscription ("granted")
  useEffect(() => {
    if (!visible || (status !== "prompt" && status !== "granted") || loading || autoPromptDone.current) return;
    autoPromptDone.current = true;
    const t = setTimeout(() => {
      setLoading(true);
      enable(
        () => {
          toast.success("Notificações ativadas! Você receberá avisos do robô.");
          setVisible(false);
          setLoading(false);
        },
        (msg) => {
          toast.error(msg);
          setLoading(false);
          autoPromptDone.current = false; // permite tentar de novo pelo botão
        }
      );
    }, 1000);
    return () => clearTimeout(t);
  }, [visible, status, loading, enable]);

  const handleEnable = () => {
    setLoading(true);
    enable(
      () => {
        toast.success("Notificações ativadas! Você receberá avisos do robô.");
        setVisible(false);
        setLoading(false);
      },
      (msg) => {
        toast.error(msg);
        setLoading(false);
      }
    );
  };

  const handleDismiss = () => {
    setDismissed(true);
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      //
    }
  };

  if (!visible) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-3 bg-primary/15 border-b border-primary/20 text-foreground"
      role="banner"
      aria-label="Ativar notificações no app"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Bell className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <p className="text-sm font-medium truncate">
          Ative as notificações para receber avisos de operações e do robô no celular.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" onClick={handleEnable} disabled={loading} className="h-8">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            "Ativar notificações"
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={handleDismiss}
          aria-label="Fechar aviso"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
