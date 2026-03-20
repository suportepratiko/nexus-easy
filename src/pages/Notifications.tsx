import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getNotificationPreferences, updateNotificationPreferences, type NotificationPreferenceItem } from "@/lib/api/notifications";
import { toast } from "sonner";
import { Loader2, MessageSquare, Smartphone } from "lucide-react";
import { NotificationsSkeleton } from "@/components/skeletons/PageSkeletons";

/** Na UI do usuário, Stop Gain e Stop Loss aparecem como um único item. */
const STOP_GROUP_KEYS = ["stop_gain", "stop_loss"];

function buildDisplayRows(triggers: NotificationPreferenceItem[]): NotificationPreferenceItem[] {
  const byKey = Object.fromEntries(triggers.map((t) => [t.trigger_key, t]));
  const stopGain = byKey.stop_gain ?? { trigger_key: "stop_gain", label: "Stop Gain / Stop Loss", enabled: true };
  const stopLoss = byKey.stop_loss ?? { trigger_key: "stop_loss", label: "Stop Loss", enabled: true };
  const stopEnabled = stopGain.enabled && stopLoss.enabled;
  return [
    ...triggers.filter((t) => !STOP_GROUP_KEYS.includes(t.trigger_key)),
    { ...stopGain, label: "Stop Gain / Stop Loss", enabled: stopEnabled },
  ];
}

export default function NotificationsPage() {
  const [triggers, setTriggers] = useState<NotificationPreferenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  const displayRows = useMemo(() => buildDisplayRows(triggers), [triggers]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getNotificationPreferences();
      setTriggers(res.triggers ?? []);
    } catch (e) {
      toast.error("Falha ao carregar preferências.");
      setTriggers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleToggle = async (triggerKey: string, enabled: boolean) => {
    const isStopGroup = triggerKey === "stop_gain";
    const next = triggers.map((t) => {
      if (t.trigger_key === triggerKey) return { ...t, enabled };
      if (isStopGroup && t.trigger_key === "stop_loss") return { ...t, enabled };
      return t;
    });
    setTriggers(next);
    setUpdatingKey(isStopGroup ? "stop_gain" : triggerKey);
    try {
      const payload = next.reduce((acc, t) => ({ ...acc, [t.trigger_key]: t.enabled }), {} as Record<string, boolean>);
      await updateNotificationPreferences(payload);
      toast.success(enabled ? "Notificações ativadas." : "Notificações desativadas.");
    } catch (e) {
      setTriggers(triggers);
      toast.error("Falha ao salvar. Tente de novo.");
    } finally {
      setUpdatingKey(null);
    }
  };

  if (loading) return <NotificationsSkeleton />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Notificações
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Escolha quais notificações automáticas do PWA deseja receber no celular ou no navegador.
        </p>
      </div>

      <Card className="rounded-xl border border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-4 w-4 text-primary" />
            Notificações por gatilho
          </CardTitle>
          <CardDescription>
            Ative ou desative as notificações para cada tipo de evento. As mensagens personalizadas enviadas pelo admin são sempre recebidas e não podem ser desativadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {displayRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum gatilho disponível.</p>
          ) : (
            <ul className="space-y-4">
              {displayRows.map((t) => (
                <li
                  key={t.trigger_key}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-border bg-muted/20 px-4 py-4 sm:py-3"
                >
                  <div className="min-w-0 flex-1">
                    <Label htmlFor={`switch-${t.trigger_key}`} className="text-base font-medium cursor-pointer">
                      {t.label}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t.trigger_key === "operation_opened" && "Quando uma nova operação é aberta pelo robô."}
                      {t.trigger_key === "operation_finished" && "Quando uma operação é finalizada (resultado e lucro)."}
                      {(t.trigger_key === "stop_gain" || t.trigger_key === "stop_loss") && "Quando o stop gain ou o stop loss é atingido."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {updatingKey === t.trigger_key && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    <Switch
                      id={`switch-${t.trigger_key}`}
                      checked={t.enabled}
                      onCheckedChange={(checked) => handleToggle(t.trigger_key, checked)}
                      disabled={updatingKey !== null}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border border-primary/20 bg-primary/5">
        <CardContent className="flex flex-row gap-4 items-start p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-foreground">Mensagens personalizadas</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Avisos e mensagens enviadas pelo administrador (ex.: &quot;Enviar para todos&quot;) são sempre entregues e não podem ser desativadas nesta tela.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
