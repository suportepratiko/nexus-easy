import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { usePlatformAuth } from "@/contexts/PlatformAuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getPwaStats,
  getPwaTemplates,
  getPwaHistory,
  sendPwaCustomMessage,
  updatePwaTemplate,
  deletePwaHistoryItem,
  deletePwaHistoryAll,
  type PwaStats,
  type PwaTemplate,
  type PwaHistoryItem,
} from "@/lib/api/adminPwa";
import { toast } from "sonner";
import {
  Send,
  Users,
  MessageSquare,
  Loader2,
  Smartphone,
  FileText,
  Plus,
  History,
  Link2,
  Calendar,
  Trash2,
  Play,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  RotateCcw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const TRIGGER_LABELS: Record<string, string> = {
  operation_opened: "Abertura de operação",
  operation_finished: "Operação finalizada",
  stop_gain: "Stop Gain",
  stop_loss: "Stop Loss",
};

const TRIGGER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  operation_opened: Play,
  operation_finished: CheckCircle,
  stop_gain: TrendingUp,
  stop_loss: TrendingDown,
};

export default function AdminPwaNotificationsPage() {
  const { user } = usePlatformAuth();
  const [stats, setStats] = useState<PwaStats | null>(null);
  const [templates, setTemplates] = useState<PwaTemplate[]>([]);
  const [history, setHistory] = useState<PwaHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalBody, setModalBody] = useState("");
  const [modalUrl, setModalUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState<Record<string, { title: string; body: string }>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, t, h] = await Promise.all([
        getPwaStats(),
        getPwaTemplates(),
        getPwaHistory(50),
      ]);
      setStats(s);
      const ORDER = ["operation_opened", "operation_finished", "stop_gain", "stop_loss"];
      setTemplates([...t].sort((a, b) => ORDER.indexOf(a.trigger_key) - ORDER.indexOf(b.trigger_key)));
      setHistory(h);
      setEditing(
        t.reduce((acc, x) => {
          acc[x.trigger_key] = { title: x.title_template, body: x.body_template };
          return acc;
        }, {} as Record<string, { title: string; body: string }>)
      );
    } catch (e) {
      toast.error("Falha ao carregar dados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const isAdmin = (user?.role ?? "").toLowerCase() === "admin";
  if (!user || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  const handleSendFromModal = async () => {
    const title = modalTitle.trim() || "Nexus Bot";
    const body = modalBody.trim();
    if (!body) {
      toast.error("Digite a mensagem.");
      return;
    }
    const url = modalUrl.trim() || undefined;
    setSending(true);
    try {
      const res = await sendPwaCustomMessage(title, body, url || null);
      toast.success(`Enviado para ${res.sent} de ${res.total_subscribers} inscritos.`);
      setModalOpen(false);
      setModalTitle("");
      setModalBody("");
      setModalUrl("");
      load();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "detail" in e
          ? String((e as { detail: string }).detail)
          : "Erro ao enviar.";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    setDeletingId(id);
    try {
      await deletePwaHistoryItem(id);
      toast.success("Mensagem removida do histórico.");
      load();
    } catch (e) {
      toast.error("Falha ao remover.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    setDeletingAll(true);
    try {
      await deletePwaHistoryAll();
      setDeleteAllOpen(false);
      toast.success("Histórico apagado.");
      load();
    } catch (e) {
      toast.error("Falha ao apagar histórico.");
    } finally {
      setDeletingAll(false);
    }
  };

  const handleResend = (item: PwaHistoryItem) => {
    setModalTitle(item.title);
    setModalBody(item.body);
    setModalUrl(item.url ?? "");
    setModalOpen(true);
  };

  const handleSaveTemplate = async (triggerKey: string) => {
    const e = editing[triggerKey];
    if (!e) return;
    setSavingKey(triggerKey);
    try {
      await updatePwaTemplate(triggerKey, { title_template: e.title, body_template: e.body });
      toast.success("Template salvo.");
      load();
    } catch (err) {
      toast.error("Falha ao salvar template.");
    } finally {
      setSavingKey(null);
    }
  };

  const handleSaveAll = async () => {
    setSavingAll(true);
    try {
      await Promise.all(
        templates.map((t) => {
          const e = editing[t.trigger_key];
          if (!e) return Promise.resolve();
          return updatePwaTemplate(t.trigger_key, { title_template: e.title, body_template: e.body });
        })
      );
      toast.success("Todos os templates salvos!");
      load();
    } catch {
      toast.error("Falha ao salvar um ou mais templates.");
    } finally {
      setSavingAll(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho: título sem ícone + botão Nova mensagem à direita */}
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Notificações PWA
          </h1>
          <p className="text-sm text-muted-foreground">
            Envie mensagens personalizadas e edite os templates dos gatilhos automáticos (abertura, fechamento e stop).
          </p>
        </div>
        <Button
          onClick={() => setModalOpen(true)}
          className="shrink-0 w-full sm:w-auto gap-2"
        >
          <Plus className="h-4 w-4" />
          Nova mensagem
        </Button>
      </header>

      {/* Cards de estatísticas — compactos */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="rounded-xl border border-border bg-card">
          <CardContent className="p-5 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Inscritos
              </p>
              <p className="text-2xl font-bold tabular-nums text-foreground mt-0.5">
                {stats?.subscribers_count ?? 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PWA + notificações ativas
              </p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Smartphone className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border border-border bg-card">
          <CardContent className="p-5 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Enviadas
              </p>
              <p className="text-2xl font-bold tabular-nums text-foreground mt-0.5">
                {stats?.custom_messages_sent ?? 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Mensagens personalizadas
              </p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MessageSquare className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Abas: Histórico e Templates */}
      <Card className="rounded-xl border border-border bg-card overflow-hidden">
        <CardContent className="p-0">
          <Tabs defaultValue="history" className="w-full">
            <TabsList className="w-full justify-start h-11 rounded-none border-b border-border bg-transparent p-0 gap-0 [&>button]:rounded-none [&>button]:border-b-2 [&>button]:border-transparent [&>button[data-state=active]]:border-primary [&>button[data-state=active]]:bg-transparent [&>button]:shadow-none">
              <TabsTrigger
                value="history"
                className="gap-2 px-6 py-3 text-sm font-medium data-[state=active]:bg-muted/50"
              >
                <History className="h-4 w-4" />
                Histórico
              </TabsTrigger>
              <TabsTrigger
                value="templates"
                className="gap-2 px-6 py-3 text-sm font-medium data-[state=active]:bg-muted/50"
              >
                <FileText className="h-4 w-4" />
                Templates
              </TabsTrigger>
            </TabsList>

            <TabsContent value="history" className="mt-0 focus-visible:outline-none p-6">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <History className="h-10 w-10 mb-3 opacity-50" />
                  <p className="text-sm font-medium">Nenhuma mensagem enviada ainda</p>
                  <p className="text-xs mt-1">Use &quot;Nova mensagem&quot; para enviar sua primeira notificação.</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-end mb-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteAllOpen(true)}
                      className="gap-2 text-muted-foreground hover:text-destructive hover:border-destructive/50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Apagar tudo
                    </Button>
                  </div>
                  <ul className="space-y-3">
                    {history.map((item) => (
                      <li
                        key={item.id}
                        className="rounded-lg border border-border bg-muted/20 p-4 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="font-medium text-foreground truncate">{item.title}</p>
                            <p className="text-sm text-muted-foreground line-clamp-2">{item.body}</p>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })}
                              </span>
                              <span>· {item.sent_count} destinatários</span>
                              {item.url && (
                                <span className="flex items-center gap-1 text-primary">
                                  <Link2 className="h-3.5 w-3.5" />
                                  {item.url}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary"
                              onClick={() => handleResend(item)}
                              title="Reenviar esta mensagem"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteItem(item.id)}
                              disabled={deletingId !== null}
                              title="Remover do histórico"
                            >
                              {deletingId === item.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </TabsContent>

            <TabsContent value="templates" className="mt-0 focus-visible:outline-none p-6">
              <div className="rounded-xl bg-muted/30 border border-border p-5 mb-6 space-y-4">
                <p className="text-sm font-semibold text-foreground">Variáveis disponíveis por evento</p>
                <div className="grid gap-4 lg:grid-cols-3">
                  {[
                    {
                      label: "Abertura de operação",
                      color: "text-blue-400",
                      vars: [
                        { key: "{{asset}}",       desc: "Ativo negociado (ex: EURUSD-OTC)" },
                        { key: "{{direction}}",   desc: "Compra ou Venda" },
                        { key: "{{entry_value}}", desc: "Valor da entrada (ex: 200.00)" },
                      ],
                    },
                    {
                      label: "Operação finalizada",
                      color: "text-emerald-400",
                      vars: [
                        { key: "{{asset}}",         desc: "Ativo negociado" },
                        { key: "{{direction}}",     desc: "Compra ou Venda" },
                        { key: "{{result}}",        desc: "Win ou Loss" },
                        { key: "{{profit_label}}", desc: "Lucro ou Prejuízo" },
                        { key: "{{profit}}",        desc: "Valor absoluto (ex: 176.00)" },
                        { key: "{{profit_signed}}", desc: "Com sinal (ex: +176.00 / -50.00)" },
                        { key: "{{entry_value}}",   desc: "Valor da entrada" },
                      ],
                    },
                    {
                      label: "Stop Gain / Stop Loss",
                      color: "text-amber-400",
                      vars: [
                        { key: "{{profit}}",  desc: "Lucro/prejuízo total da sessão" },
                        { key: "{{entries}}", desc: "Total de entradas realizadas" },
                        { key: "{{wins}}",    desc: "Número de operações ganhas" },
                        { key: "{{losses}}",  desc: "Número de operações perdidas" },
                      ],
                    },
                  ].map(({ label, color, vars }) => (
                    <div key={label} className="rounded-lg bg-muted/50 border border-border p-4 space-y-3">
                      <p className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{label}</p>
                      <div className="space-y-2">
                        {vars.map(({ key, desc }) => (
                          <div key={key} className="flex items-start gap-2">
                            <code className="shrink-0 rounded bg-background border border-border px-1.5 py-0.5 text-xs font-mono text-foreground">{key}</code>
                            <span className="text-xs text-muted-foreground leading-5">{desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
                {templates.map((t) => {
                  const Icon = TRIGGER_ICONS[t.trigger_key] ?? Users;
                  return (
                  <Card key={t.trigger_key} className="rounded-xl border border-border min-w-0">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </span>
                        <h3 className="font-semibold text-foreground text-sm truncate">
                          {TRIGGER_LABELS[t.trigger_key] ?? t.trigger_key}
                        </h3>
                      </div>
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Título</Label>
                          <Input
                            value={editing[t.trigger_key]?.title ?? t.title_template}
                            onChange={(e) =>
                              setEditing((prev) => ({
                                ...prev,
                                [t.trigger_key]: {
                                  ...(prev[t.trigger_key] ?? {
                                    title: t.title_template,
                                    body: t.body_template,
                                  }),
                                  title: e.target.value,
                                },
                              }))
                            }
                            placeholder="Título"
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Corpo</Label>
                          <Textarea
                            value={editing[t.trigger_key]?.body ?? t.body_template}
                            onChange={(e) =>
                              setEditing((prev) => ({
                                ...prev,
                                [t.trigger_key]: {
                                  ...(prev[t.trigger_key] ?? {
                                    title: t.title_template,
                                    body: t.body_template,
                                  }),
                                  body: e.target.value,
                                },
                              }))
                            }
                            placeholder="Mensagem"
                            className="min-h-[80px] resize-y"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
              <div className="flex justify-end mt-4">
                <Button
                  onClick={handleSaveAll}
                  disabled={savingAll}
                  className="gap-2 px-8"
                >
                  {savingAll ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</>
                  ) : (
                    "Salvar todos os templates"
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Modal Nova mensagem */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle>Nova mensagem</DialogTitle>
            <DialogDescription>
              A mensagem será enviada para todos os usuários que ativaram notificações no PWA. Se informar um link, ao clicar na notificação o usuário será redirecionado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="modal-title">Título</Label>
              <Input
                id="modal-title"
                value={modalTitle}
                onChange={(e) => setModalTitle(e.target.value)}
                placeholder="Ex: Aviso importante"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="modal-body">Mensagem</Label>
              <Textarea
                id="modal-body"
                value={modalBody}
                onChange={(e) => setModalBody(e.target.value)}
                placeholder="Texto da notificação..."
                className="min-h-[100px] resize-y"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="modal-url" className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                Link ao clicar (opcional)
              </Label>
              <Input
                id="modal-url"
                value={modalUrl}
                onChange={(e) => setModalUrl(e.target.value)}
                placeholder="/ ou https://..."
              />
              <p className="text-xs text-muted-foreground">
                Caminho (ex: /dashboard) ou URL completa. Se vazio, abre a página inicial.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={sending}>
              Cancelar
            </Button>
            <Button onClick={handleSendFromModal} disabled={sending}>
              {sending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando…
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Enviar para todos
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar todo o histórico?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as mensagens do histórico serão removidas. As estatísticas de envio serão atualizadas. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingAll}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteAll(); }}
              disabled={deletingAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingAll ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Apagando…
                </>
              ) : (
                "Apagar tudo"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
