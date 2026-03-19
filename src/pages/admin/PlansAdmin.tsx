import { useEffect, useMemo, useState } from "react";
import { AdminRoute } from "@/components/AdminRoute";
import { usePlatformAuth } from "@/contexts/PlatformAuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBrl } from "@/lib/utils";
import { toast } from "sonner";
import { Layers, CreditCard, Users, Plus, Pencil, Trash2, CalendarDays } from "lucide-react";
import { getPlatformToken } from "@/lib/api/platformAuth";

type PeriodStat = { period_type: string; label: string; count: number };
import {
  createPlan,
  deletePlan,
  getPlans,
  updatePlan,
  type Plan,
  type PlanPeriodInput,
  type PlanPeriodType,
} from "@/lib/api/plans";

const PERIOD_LABELS: Record<PlanPeriodType, string> = {
  monthly: "Mensal — 1 mês",
  quarterly: "Trimestral — 3 meses",
  semiannual: "Semestral — 6 meses",
  annual: "Anual — 1 ano",
};

type PlanFormState = {
  name: string;
  description: string;
  periods: Record<
    PlanPeriodType,
    {
      enabled: boolean;
      price: string;
      checkout_url: string;
    }
  >;
};

const emptyPlanForm: PlanFormState = {
  name: "",
  description: "",
  periods: {
    monthly: { enabled: false, price: "", checkout_url: "" },
    quarterly: { enabled: false, price: "", checkout_url: "" },
    semiannual: { enabled: false, price: "", checkout_url: "" },
    annual: { enabled: false, price: "", checkout_url: "" },
  },
};

function buildPeriodsPayload(form: PlanFormState): PlanPeriodInput[] {
  const entries: PlanPeriodInput[] = [];
  (Object.keys(form.periods) as PlanPeriodType[]).forEach((key) => {
    const p = form.periods[key];
    if (!p.enabled) return;
    const price = parseFloat(p.price.replace(",", ".") || "0");
    entries.push({
      period_type: key,
      price: Number.isFinite(price) ? price : 0,
      is_active: true,
      checkout_url: p.checkout_url || null,
    });
  });
  return entries;
}

export default function PlansAdminPage() {
  const { user } = usePlatformAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [periodStats, setPeriodStats] = useState<PeriodStat[]>([]);

  const [form, setForm] = useState<PlanFormState>(emptyPlanForm);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<Plan | null>(null);

  const filteredPlans = useMemo(() => {
    if (!search.trim()) return plans;
    const term = search.toLowerCase();
    return plans.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.description ?? "").toLowerCase().includes(term) ||
        p.code.toLowerCase().includes(term),
    );
  }, [plans, search]);

  const stats = useMemo(() => {
    const total = plans.length;
    const active = plans.filter((p) => p.is_active).length;
    const totalUsers = plans.reduce((sum, p) => sum + (p.users_count ?? 0), 0);
    return { total, active, totalUsers };
  }, [plans]);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    void reloadPlans();
  }, [user]);

  async function reloadPlans() {
    try {
      setLoading(true);
      const data = await getPlans();
      setPlans(data);
    } catch (e) {
      toast.error("Erro ao carregar planos", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
    // Carrega stats de usuários por período
    try {
      const token = getPlatformToken();
      if (token) {
        const res = await fetch("/api/platform/admin/plans/period-stats", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setPeriodStats(await res.json());
      }
    } catch { /* silencia */ }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyPlanForm);
    setDialogOpen(true);
  }

  function openEdit(plan: Plan) {
    const base: PlanFormState = structuredClone(emptyPlanForm);
    base.name = plan.name;
    base.description = plan.description ?? "";
    for (const period of plan.periods) {
      const key = period.period_type as PlanPeriodType;
      if (!base.periods[key]) continue;
      base.periods[key].enabled = period.is_active;
      base.periods[key].price = String(period.price).replace(".", ",");
      base.periods[key].checkout_url = period.checkout_url ?? "";
    }
    setForm(base);
    setEditing(plan);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Informe um nome para o plano.");
      return;
    }
    const periodsPayload = buildPeriodsPayload(form);
    if (periodsPayload.length === 0) {
      toast.error("Selecione pelo menos um período e valor para o plano.");
      return;
    }
    try {
      if (editing) {
        const updated = await updatePlan(editing.id, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          periods: periodsPayload,
        });
        setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        toast.success("Plano atualizado com sucesso.");
      } else {
        const created = await createPlan({
          name: form.name.trim(),
          description: form.description.trim() || null,
          periods: periodsPayload,
        });
        setPlans((prev) => [created, ...prev]);
        toast.success("Plano criado com sucesso.");
      }
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyPlanForm);
    } catch (e) {
      toast.error("Erro ao salvar plano", { description: (e as Error).message });
    }
  }

  async function handleDeleteConfirm() {
    if (!planToDelete) return;
    try {
      await deletePlan(planToDelete.id);
      setPlans((prev) => prev.filter((p) => p.id !== planToDelete.id));
      setPlanToDelete(null);
      toast.success("Plano removido.");
    } catch (e) {
      toast.error("Erro ao excluir plano", { description: (e as Error).message });
    }
  }

  if (!user || user.role !== "admin") {
    return (
      <AdminRoute>
        <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
      </AdminRoute>
    );
  }

  const totalPeriodsAtivos = plans.reduce(
    (sum, p) => sum + p.periods.filter((pp) => pp.is_active).length,
    0,
  );

  const periodColors: Record<string, string> = {
    monthly:   "text-sky-400",
    quarterly: "text-green-400",
    semiannual:"text-amber-400",
    annual:    "text-purple-400",
  };

  const cardBaseClass = "border-border/60 bg-card/80";
  const cards = [
    {
      title: "Total de planos",
      value: stats.total,
      icon: Layers,
      valueClass: "text-foreground",
      iconClass: "text-muted-foreground",
    },
    {
      title: "Planos ativos",
      value: stats.active,
      icon: CreditCard,
      valueClass: "text-green-600 dark:text-green-400",
      iconClass: "text-green-600 dark:text-green-400",
    },
    {
      title: "Usuários por planos",
      value: stats.totalUsers,
      icon: Users,
      valueClass: "text-sky-600 dark:text-sky-400",
      iconClass: "text-sky-600 dark:text-sky-400",
      subtitle: `${totalPeriodsAtivos} períodos ativos no total`,
    },
  ];

  return (
    <AdminRoute>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground tracking-tight">Planos</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Defina os planos personalizados que os usuários podem contratar.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            Novo plano
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map(({ title, value, icon: Icon, valueClass, iconClass, subtitle }) => (
            <Card key={title} className={`glass-card ${cardBaseClass}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
                <Icon className={`h-7 w-7 shrink-0 ${iconClass}`} />
              </CardHeader>
              <CardContent>
                <span className={`text-2xl font-bold tabular-nums ${valueClass}`}>{value}</span>
                {subtitle && (
                  <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
                )}
              </CardContent>
            </Card>
          ))}

          {/* Card — Usuários ativos por período */}
          <Card className={`glass-card ${cardBaseClass}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Ativos por período</CardTitle>
              <CalendarDays className="h-7 w-7 shrink-0 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {periodStats.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum dado disponível.</p>
              ) : (
                <div className="space-y-1.5 mt-0.5">
                  {periodStats.map((s) => (
                    <div key={s.period_type} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{s.label}</span>
                      <span className={`text-sm font-bold tabular-nums ${periodColors[s.period_type] ?? "text-foreground"}`}>
                        {s.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="glass-card">
          <CardHeader className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base">Lista de planos</CardTitle>
                <CardDescription>Gerencie períodos, preços e URLs de checkout.</CardDescription>
              </div>
              <Input
                placeholder="Buscar por nome, código ou descrição"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:w-64 h-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-border/60 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60">
                    <TableHead className="text-xs font-medium text-muted-foreground">Nome</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Períodos ativos</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Usuários</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Status</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground text-right w-[120px]">
                      Ações
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPlans.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Nenhum plano cadastrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPlans.map((plan) => (
                      <TableRow key={plan.id} className="border-border/40">
                        <TableCell className="text-sm text-foreground">{plan.name}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-wrap gap-1">
                            {plan.periods
                              .filter((p) => p.is_active)
                              .sort((a, b) => {
                                const order: Record<string, number> = { monthly: 0, quarterly: 1, semiannual: 2, annual: 3 };
                                return (order[a.period_type] ?? 99) - (order[b.period_type] ?? 99);
                              })
                              .map((p) => (
                                <Badge key={p.id} variant="outline" className="text-[11px]">
                                  {PERIOD_LABELS[p.period_type as PlanPeriodType] ?? p.period_type} · R${" "}
                                  {formatBrl(Number(p.price))}
                                </Badge>
                              ))}
                            {plan.periods.filter((p) => p.is_active).length === 0 && (
                              <span className="text-[11px] text-muted-foreground">Nenhum período ativo</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-foreground">{plan.users_count}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              plan.is_active
                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                                : "bg-muted/40 text-muted-foreground border-border/60"
                            }
                          >
                            {plan.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEdit(plan)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setPlanToDelete(plan)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <AlertDialog open={!!planToDelete} onOpenChange={(open) => !open && setPlanToDelete(null)}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir plano</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir o plano <strong>{planToDelete?.name}</strong>? Esta ação não pode ser
                desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void handleDeleteConfirm();
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={dialogOpen} onOpenChange={(open) => (!open ? (setDialogOpen(false), setEditing(null)) : null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar plano" : "Novo plano"}</DialogTitle>
              <DialogDescription>
                Defina o nome, descrição, períodos de recorrência, valores e URLs de checkout.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Nome do plano *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex.: Plano Básico"
                />
              </div>
              <div className="space-y-2">
                <Label>Descrição (opcional)</Label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Breve descrição do plano"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none min-h-[80px]"
                />
              </div>

              <Tabs defaultValue="periods">
                <TabsList>
                  <TabsTrigger value="periods">Períodos e preços</TabsTrigger>
                </TabsList>
                <TabsContent value="periods" className="mt-3 space-y-3">
                  {(Object.keys(form.periods) as PlanPeriodType[]).map((key) => {
                    const p = form.periods[key];
                    return (
                      <div
                        key={key}
                        className="flex flex-col md:flex-row md:items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2"
                      >
                        <div className="flex-1 space-y-1">
                          <Label className="text-sm font-medium">{PERIOD_LABELS[key]}</Label>
                          <p className="text-[11px] text-muted-foreground">
                            Ative este período e informe o valor e a URL de checkout.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground">Ativo</Label>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-border bg-background"
                            checked={p.enabled}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                periods: {
                                  ...prev.periods,
                                  [key]: { ...prev.periods[key], enabled: e.target.checked },
                                },
                              }))
                            }
                          />
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">R$</span>
                            <Input
                              type="text"
                              inputMode="decimal"
                              className="w-24 h-8 text-sm"
                              disabled={!p.enabled}
                              value={p.price}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  periods: {
                                    ...prev.periods,
                                    [key]: { ...prev.periods[key], price: e.target.value },
                                  },
                                }))
                              }
                            />
                          </div>
                          <Input
                            className="flex-1 h-8 text-xs"
                            placeholder="URL de checkout"
                            disabled={!p.enabled}
                            value={p.checkout_url}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                periods: {
                                  ...prev.periods,
                                  [key]: { ...prev.periods[key], checkout_url: e.target.value },
                                },
                              }))
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </TabsContent>
              </Tabs>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void handleSave()}>{editing ? "Salvar alterações" : "Criar plano"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminRoute>
  );
}

