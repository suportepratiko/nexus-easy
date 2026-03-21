import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Button } from "@/components/ui/button";
import { Bell, Loader2, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function PwaNotificationBanner() {
  const { status, enable } = usePushNotifications();
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const tried = useRef(false);

  // Auto-pede permissão ao entrar no app (funciona no Android, desktop, etc.)
  useEffect(() => {
    if (!isMobile() || tried.current) return;
    if (status !== "prompt" && status !== "granted") return;
    tried.current = true;

    // Pequeno delay para garantir que o SW já foi registrado pelo vite-plugin-pwa
    const t = setTimeout(() => {
      setLoading(true);
      enable(
        () => {
          toast.success("Notificações ativadas!");
          setLoading(false);
        },
        () => {
          // Falhou (ex: iOS sem gesto) — banner fica visível para o usuário clicar
          setLoading(false);
        },
      );
    }, 800);
    return () => clearTimeout(t);
  }, [status, enable]);

  const handleClick = () => {
    setLoading(true);
    enable(
      () => { toast.success("Notificações ativadas!"); setLoading(false); },
      (msg) => { toast.error(msg); setLoading(false); },
    );
  };

  // Não mostra em desktop, se já inscrito, se negado, ou se dispensou
  if (!isMobile()) return null;
  if (status === "subscribed" || status === "denied" || status === "unsupported") return null;
  if (dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-primary/15 border-b border-primary/20 text-foreground">
      <div className="flex items-center gap-2 min-w-0">
        <Bell className="h-5 w-5 shrink-0 text-primary" />
        <p className="text-sm font-medium truncate">
          Ative as notificações para receber avisos do robô.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" onClick={handleClick} disabled={loading} className="h-8">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ativar"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => setDismissed(true)}
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
