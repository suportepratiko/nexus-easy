import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Button } from "@/components/ui/button";
import { Bell, Loader2, X } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

const DISMISSED_KEY = "pwa-notif-dismissed-until";

function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isDismissed(): boolean {
  try {
    const v = localStorage.getItem(DISMISSED_KEY);
    return !!v && Number(v) > Date.now();
  } catch { return false; }
}

function dismiss() {
  try {
    // Não mostra de novo por 24h
    localStorage.setItem(DISMISSED_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
  } catch { /* */ }
}

/** Banner que aparece em mobile quando notificações ainda não foram ativadas. */
export function PwaNotificationBanner() {
  const { status, enable } = usePushNotifications();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isMobile()) return;
    if (isDismissed()) return;
    if (status === "subscribed" || status === "denied" || status === "unsupported") return;
    setVisible(true);
  }, [status]);

  // Clique no botão — é aqui que o gesto do usuário dispara requestPermission
  const handleEnable = () => {
    setLoading(true);
    enable(
      () => {
        toast.success("Notificações ativadas!");
        setVisible(false);
        setLoading(false);
      },
      (msg) => {
        toast.error(msg);
        setLoading(false);
      },
    );
  };

  const handleDismiss = () => {
    dismiss();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-3 bg-primary/15 border-b border-primary/20 text-foreground"
      role="banner"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Bell className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <p className="text-sm font-medium truncate">
          Ative as notificações para receber avisos do robô.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" onClick={handleEnable} disabled={loading} className="h-8">
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            : "Ativar"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={handleDismiss}
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
