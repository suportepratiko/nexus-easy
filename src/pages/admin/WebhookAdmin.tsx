import { useEffect, useMemo, useState } from "react";
import { AdminRoute } from "@/components/AdminRoute";
import { usePlatformAuth } from "@/contexts/PlatformAuthContext";
import {
  createWebhook,
  deleteWebhook,
  deleteWebhookPayload,
  getWebhookPayloads,
  getWebhooks,
  type Webhook,
  type WebhookPayload,
  type WebhookUserStatus,
  updateWebhook,
} from "@/lib/api/webhooks";
import { getPlans, type Plan, type PlanPeriodType } from "@/lib/api/plans";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Copy, Plus, RefreshCw, Trash2, Settings2, History, ChevronsUpDown, CheckCircle2, Check, Webhook } from "lucide-react";
import { cn } from "@/lib/utils";

type MainTab = "webhooks" | "history";
type MappingFieldKey =
  | "full_name"
  | "email"
  | "phone"
  | "cpf_cnpj"
  | "recurrence_period"
  | "recurrence_value";

type PeriodMeaning = "monthly" | "quarterly" | "semiannual" | "annual";

type PeriodInterpretation = { payload_value: string; meaning: "month" | "day" | "year" };
type RecurrenceValueInterpretation = { payload_value: string; meaning: string };
type UserStatusInterpretation = { payload_value: string; meaning: "active" | "expired" };
type PeriodRule = {
  interval_type_value: string;
  interval_count_value: string;
  period: PeriodMeaning;
  plan_period_code: string;
};

type MappingState = {
  fields: Record<MappingFieldKey, string>;
  period_interpretations: PeriodInterpretation[];
  recurrence_value_interpretations: RecurrenceValueInterpretation[];
  user_status_interpretations: UserStatusInterpretation[];
  period_rules: PeriodRule[];
};

const defaultMappingState: MappingState = {
  fields: {
    full_name: "",
    email: "",
    phone: "",
    cpf_cnpj: "",
    recurrence_period: "",
    recurrence_value: "",
  },
  period_interpretations: [
    { payload_value: "MONTHS", meaning: "month" },
    { payload_value: "MESES", meaning: "month" },
    { payload_value: "DAYS", meaning: "day" },
    { payload_value: "DIAS", meaning: "day" },
    { payload_value: "YEARS", meaning: "year" },
    { payload_value: "ANOS", meaning: "year" },
  ],
  recurrence_value_interpretations: [
    { payload_value: "1", meaning: "1" },
    { payload_value: "01", meaning: "1" },
    { payload_value: "3", meaning: "3" },
    { payload_value: "6", meaning: "6" },
    { payload_value: "12", meaning: "12" },
  ],
  user_status_interpretations: [
    { payload_value: "active", meaning: "active" },
    { payload_value: "expired", meaning: "expired" },
  ],
  period_rules: [
    { interval_type_value: "MONTHS", interval_count_value: "1", period: "monthly", plan_period_code: "" },
    { interval_type_value: "MONTHS", interval_count_value: "3", period: "quarterly", plan_period_code: "" },
    { interval_type_value: "MONTHS", interval_count_value: "6", period: "semiannual", plan_period_code: "" },
    { interval_type_value: "MONTHS", interval_count_value: "12", period: "annual", plan_period_code: "" },
  ],
};

type WebhookFormState = {
  name: string;
  is_active: boolean;
  user_status: WebhookUserStatus | "";
};

const emptyForm: WebhookFormState = { name: "", is_active: false, user_status: "" };

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  try {
    return format(new Date(value), "dd/MM/yyyy, HH:mm", { locale: ptBR });
  } catch {
    return value;
  }
}

function getPublicUrl(secret: string) {
  if (typeof window === "undefined") return `/api/webhook/${secret}`;
  return `${window.location.origin}/api/webhook/${secret}`;
}

function WebhookStatusBadge({ isActive }: { isActive: boolean }) {
  return isActive
    ? <Badge className="bg-emerald-500/90 text-white hover:bg-emerald-500">Produção</Badge>
    : <Badge className="bg-amber-500/90 text-black hover:bg-amber-500">Teste</Badge>;
}

function flattenPaths(value: unknown, prefix = ""): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    const out: string[] = [];
    value.forEach((item, idx) => {
      out.push(...flattenPaths(item, `${prefix}[${idx}]`));
    });
    return out;
  }
  if (typeof value === "object") {
    const out: string[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const next = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === "object") {
        out.push(...flattenPaths(v, next));
      } else {
        out.push(next);
      }
    }
    return out;
  }
  return prefix ? [prefix] : [];
}

function getValueByPath(payload: unknown, path: string): string {
  if (!path.trim() || !payload || typeof payload !== "object") return "";
  let current: unknown = payload;
  const parts = path.split(".");
  for (const part of parts) {
    if (!current || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[part];
  }
  if (current === null || current === undefined) return "";
  if (typeof current === "object") return JSON.stringify(current);
  return String(current);
}

function toJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function findFirstDeepValue(source: unknown, keys: string[]): string {
  const normKeys = keys.map((k) => k.toLowerCase());
  const queue: unknown[] = [source];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    for (const [k, v] of Object.entries(current as Record<string, unknown>)) {
      const keyLower = k.toLowerCase();
      if (normKeys.some((needle) => keyLower.includes(needle))) {
        if (v === null || v === undefined) return "";
        if (typeof v === "object") return JSON.stringify(v);
        return String(v);
      }
      if (v && typeof v === "object") queue.push(v);
    }
  }
  return "";
}

function periodTypeLabel(period: PlanPeriodType) {
  if (period === "monthly") return "Mensal";
  if (period === "quarterly") return "Trimestral";
  if (period === "semiannual") return "Semestral";
  return "Anual";
}

function periodMeaningLabel(value: PeriodMeaning) {
  if (value === "monthly") return "Mensal";
  if (value === "quarterly") return "Trimestral";
  if (value === "semiannual") return "Semestral";
  return "Anual";
}

function normalizeMapping(value: unknown): MappingState {
  if (!value || typeof value !== "object") return defaultMappingState;
  const obj = value as Record<string, unknown>;
  const fieldsInput = (obj.fields ?? obj) as Record<string, unknown>;
  const fields: Record<MappingFieldKey, string> = {
    full_name: String(fieldsInput.full_name ?? fieldsInput.name ?? ""),
    email: String(fieldsInput.email ?? ""),
    phone: String(fieldsInput.phone ?? ""),
    cpf_cnpj: String(fieldsInput.cpf_cnpj ?? fieldsInput.cpf ?? ""),
    recurrence_period: String(fieldsInput.recurrence_period ?? ""),
    recurrence_value: String(fieldsInput.recurrence_value ?? ""),
  };

  const period_interpretations = Array.isArray(obj.period_interpretations)
    ? (obj.period_interpretations as PeriodInterpretation[])
    : defaultMappingState.period_interpretations;
  const recurrence_value_interpretations = Array.isArray(obj.recurrence_value_interpretations)
    ? (obj.recurrence_value_interpretations as RecurrenceValueInterpretation[])
    : defaultMappingState.recurrence_value_interpretations;
  const user_status_interpretations = Array.isArray(obj.user_status_interpretations)
    ? (obj.user_status_interpretations as UserStatusInterpretation[])
    : defaultMappingState.user_status_interpretations;
  const period_rules = Array.isArray(obj.period_rules)
    ? (obj.period_rules as PeriodRule[])
    : defaultMappingState.period_rules;

  return { fields, period_interpretations, recurrence_value_interpretations, user_status_interpretations, period_rules };
}

function PayloadPathPicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-10 bg-background"
        >
          <span className="truncate text-left">{value || "Selecione um campo do payload"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Digite para buscar..." />
          <CommandList>
            <CommandEmpty>Nenhum campo encontrado.</CommandEmpty>
            <CommandGroup>
              {options.map((path) => (
                <CommandItem
                  key={path}
                  value={path}
                  onSelect={(currentValue) => {
                    onChange(currentValue === value ? "" : currentValue);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === path ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{path}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function WebhookAdminPage() {
  const { user } = usePlatformAuth();
  const [tab, setTab] = useState<MainTab>("webhooks");
  const [loading, setLoading] = useState(false);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [search, setSearch] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [form, setForm] = useState<WebhookFormState>(emptyForm);
  const [editing, setEditing] = useState<Webhook | null>(null);
  const [mapping, setMapping] = useState<MappingState>(defaultMappingState);
  const [payloads, setPayloads] = useState<WebhookPayload[]>([]);
  const [selectedPayload, setSelectedPayload] = useState<WebhookPayload | null>(null);
  const [historyPayloads, setHistoryPayloads] = useState<WebhookPayload[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);

  const filteredWebhooks = useMemo(() => {
    if (!search.trim()) return webhooks;
    const term = search.toLowerCase();
    return webhooks.filter((w) => w.name.toLowerCase().includes(term));
  }, [webhooks, search]);

  const filteredHistory = useMemo(() => {
    let list = historyPayloads;
    if (historySearch.trim()) {
      const term = historySearch.toLowerCase();
      list = list.filter((p) => {
        try {
          return JSON.stringify(p.payload).toLowerCase().includes(term);
        } catch {
          return false;
        }
      });
    }
    return list;
  }, [historyPayloads, historySearch]);

  const historyTotalPages = Math.max(1, Math.ceil(filteredHistory.length / historyPageSize));
  const paginatedHistory = useMemo(() => {
    const start = (historyPage - 1) * historyPageSize;
    return filteredHistory.slice(start, start + historyPageSize);
  }, [filteredHistory, historyPage, historyPageSize]);

  const payloadPaths = useMemo(() => {
    if (!selectedPayload) return [];
    return flattenPaths(selectedPayload.payload).slice(0, 500);
  }, [selectedPayload]);

  const planPeriodOptions = useMemo(() => {
    const options: Array<{ code: string; label: string }> = [];
    plans.forEach((plan) => {
      (plan.periods ?? []).forEach((period) => {
        if (!period.is_active) return;
        options.push({
          code: `${plan.code}:${period.period_type}`,
          label: `${plan.name} (${periodTypeLabel(period.period_type)})`,
        });
      });
    });
    return options;
  }, [plans]);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    void reloadWebhooks();
    void reloadHistory();
    void reloadPlans();
  }, [user]);

  useEffect(() => {
    if (tab !== "history") return;
    setHistoryPage((p) => Math.min(p, Math.max(1, Math.ceil(filteredHistory.length / historyPageSize))));
  }, [filteredHistory.length, historyPageSize, tab]);

  useEffect(() => {
    if (tab !== "history") return;
    if (filteredHistory.length === 0) {
      setSelectedPayload(null);
      return;
    }
    if (!selectedPayload || !filteredHistory.some((p) => p.id === selectedPayload.id)) {
      setSelectedPayload(filteredHistory[0]);
    }
  }, [tab, filteredHistory, selectedPayload]);

  // Atualização em tempo real do histórico quando a aba Histórico está ativa
  useEffect(() => {
    if (tab !== "history") return;
    const interval = setInterval(() => {
      void reloadHistory();
    }, 4000);
    return () => clearInterval(interval);
  }, [tab]);

  async function reloadWebhooks() {
    try {
      setLoading(true);
      setWebhooks(await getWebhooks());
    } catch (e) {
      toast.error("Erro ao carregar webhooks", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function reloadPlans() {
    try {
      setPlans(await getPlans());
    } catch {
      setPlans([]);
    }
  }

  async function reloadPayloadsForWebhook(webhookId: string) {
    try {
      const data = await getWebhookPayloads({ webhookId, limit: 200 });
      // Em "Configurar", só exibimos payloads de TESTE para mapeamento.
      const testPayloads = data.filter((p) => p.is_test);
      setPayloads(testPayloads);
      setSelectedPayload(testPayloads[0] ?? null);
    } catch (e) {
      toast.error("Erro ao carregar payloads deste webhook", { description: (e as Error).message });
    }
  }

  async function reloadHistory() {
    try {
      setHistoryPayloads(await getWebhookPayloads({ limit: 100 }));
    } catch (e) {
      toast.error("Erro ao carregar histórico de payloads", { description: (e as Error).message });
    }
  }

  function openCreateDialog() {
    setForm(emptyForm);
    setCreateDialogOpen(true);
  }

  function openConfigDialog(webhook: Webhook) {
    setEditing(webhook);
    setForm({
      name: webhook.name,
      is_active: webhook.is_active,
      user_status: (webhook.user_status as WebhookUserStatus | null) ?? "",
    });
    setMapping(normalizeMapping(webhook.field_mappings));
    setConfigDialogOpen(true);
    void reloadPayloadsForWebhook(webhook.id);
  }

  async function handleCreateSubmit() {
    if (!form.name.trim()) {
      toast.error("Informe um nome para o webhook.");
      return;
    }
    try {
      const created = await createWebhook({ name: form.name.trim(), is_active: false });
      setCreateDialogOpen(false);
      setWebhooks((prev) => [created, ...prev]);
      toast.success("Webhook criado com sucesso.");
    } catch (e) {
      toast.error("Erro ao criar webhook", { description: (e as Error).message });
    }
  }

  async function handleDeleteWebhook() {
    if (!editing) return;
    try {
      await deleteWebhook(editing.id);
      setDeleteDialogOpen(false);
      setWebhooks((prev) => prev.filter((w) => w.id !== editing.id));
      setEditing(null);
      toast.success("Webhook excluído.");
    } catch (e) {
      toast.error("Erro ao excluir webhook", { description: (e as Error).message });
    }
  }

  async function handleDeletePayload(id: string, isHistory: boolean) {
    try {
      await deleteWebhookPayload(id);
      if (isHistory) {
        setHistoryPayloads((prev) => prev.filter((p) => p.id !== id));
      } else {
        setPayloads((prev) => {
          const next = prev.filter((p) => p.id !== id);
          if (selectedPayload?.id === id) {
            setSelectedPayload(next[0] ?? null);
          }
          return next;
        });
      }
      toast.success("Payload excluído.");
    } catch (e) {
      toast.error("Erro ao excluir payload", { description: (e as Error).message });
    }
  }

  async function handleSaveConfig() {
    if (!editing) return;
    if (!form.name.trim()) {
      toast.error("Informe um nome para o webhook.");
      return;
    }

    const fieldMappings = {
      version: 2,
      fields: mapping.fields,
      period_interpretations: mapping.period_interpretations,
      recurrence_value_interpretations: mapping.recurrence_value_interpretations,
      period_rules: mapping.period_rules,
    };

    try {
      const updated = await updateWebhook(editing.id, {
        name: form.name.trim(),
        is_active: form.is_active,
        user_status: form.user_status || null,
        field_mappings: fieldMappings,
      });
      setWebhooks((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
      setEditing(updated);
      setConfigDialogOpen(false);
      toast.success("Configuração de mapeamento salva.");
    } catch (e) {
      toast.error("Erro ao salvar mapeamento", { description: (e as Error).message });
    }
  }

  function renderFieldSelect(label: string, key: MappingFieldKey, hint?: string) {
    const mapped = !!mapping.fields[key];
    return (
      <Card className="border-border/60 bg-card/70">
        <CardContent className="pt-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>{label}</Label>
            <Badge variant="outline" className={mapped ? "border-emerald-500/60 text-emerald-400" : "text-muted-foreground"}>
              <CheckCircle2 className="w-3 h-3 mr-1" />
              {mapped ? "Mapeado" : "Pendente"}
            </Badge>
          </div>
          <PayloadPathPicker
            value={mapping.fields[key] ?? ""}
            options={payloadPaths}
            onChange={(next) => setMapping((prev) => ({ ...prev, fields: { ...prev.fields, [key]: next } }))}
          />
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          {!!selectedPayload && !!mapping.fields[key] && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2 text-xs">
              <span className="font-medium text-emerald-400">Preview do valor:</span>{" "}
              <span className="text-foreground/90">{getValueByPath(selectedPayload.payload, mapping.fields[key]) || "—"}</span>
              <p className="mt-1 text-[11px] text-muted-foreground">Campo mapeado: {mapping.fields[key]}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  function renderWebhookTable() {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <Input
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Button variant="outline" size="icon" onClick={() => reloadWebhooks()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="rounded-xl border bg-card/40 overflow-hidden">
          <div className="min-w-full overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium">Ativo</th>
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">Status webhook</th>
                  <th className="px-4 py-3 font-medium">URL</th>
                  <th className="px-4 py-3 font-medium">Criado em</th>
                  <th className="px-4 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredWebhooks.map((w) => {
                  const url = getPublicUrl(w.secret);
                  return (
                    <tr key={w.id} className="border-t border-border/60 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Switch
                          checked={w.is_active}
                          onCheckedChange={async (checked) => {
                            try {
                              const updated = await updateWebhook(w.id, { is_active: checked });
                              setWebhooks((prev) => prev.map((x) => (x.id === w.id ? updated : x)));
                            } catch (e) {
                              toast.error("Erro ao atualizar status", { description: (e as Error).message });
                            }
                          }}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium">{w.name}</td>
                      <td className="px-4 py-3"><WebhookStatusBadge isActive={w.is_active} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 max-w-xs">
                          <span className="truncate text-xs text-muted-foreground">{url}</span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("URL copiada."))}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(w.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => openConfigDialog(w)}>
                            <Settings2 className="w-4 h-4 mr-1" /> Configurar
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              setEditing(w);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  const periodLabels: Record<string, string> = {
    monthly: "Mensal", quarterly: "Trimestral", semiannual: "Semestral", annual: "Anual",
    mensal: "Mensal", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual",
  };

  function resolvePlanLabel(planCode: string | null | undefined, period: string | null | undefined): string {
    if (!planCode) return "—";
    const plan = plans.find((p) => p.code === planCode || p.id === planCode || p.name === planCode);
    const planName = plan ? plan.name : planCode;
    const periodLabel = period ? (periodLabels[period.toLowerCase()] ?? period) : null;
    return periodLabel ? `${planName} (${periodLabel})` : planName;
  }

  function renderHistory() {
    const current = selectedPayload;
    const payloadObj = toJsonObject(current?.payload);
    const processObj = toJsonObject(current?.process_details);
    const responseObj = toJsonObject(current?.response_body);

    const beforeRows = current
      ? [
          { label: "Nome", value: findFirstDeepValue(payloadObj, ["name", "nome", "clientname"]) || "—" },
          { label: "Email", value: findFirstDeepValue(payloadObj, ["email"]) || "—" },
          { label: "Telefone", value: findFirstDeepValue(payloadObj, ["phone", "telefone"]) || "—" },
          { label: "CPF/CNPJ", value: findFirstDeepValue(payloadObj, ["cpf", "cnpj", "document"]) || "—" },
          { label: "Status do usuário", value: findFirstDeepValue(payloadObj, ["status", "user_status"]) || "—" },
          {
            label: "Plano (período)",
            value: resolvePlanLabel(
              findFirstDeepValue(payloadObj, ["plan", "plan_id", "product_name"]),
              findFirstDeepValue(payloadObj, ["intervaltype", "period", "recurrence"]),
            ),
          },
        ]
      : [];

    const afterRows = current
      ? [
          { label: "Nome", value: findFirstDeepValue(processObj, ["name", "nome"]) || findFirstDeepValue(responseObj, ["name", "nome"]) || beforeRows.find((r) => r.label === "Nome")?.value || "—" },
          { label: "Email", value: findFirstDeepValue(processObj, ["email"]) || findFirstDeepValue(responseObj, ["email"]) || beforeRows.find((r) => r.label === "Email")?.value || "—" },
          { label: "Telefone", value: findFirstDeepValue(processObj, ["phone", "telefone"]) || findFirstDeepValue(responseObj, ["phone", "telefone"]) || beforeRows.find((r) => r.label === "Telefone")?.value || "—" },
          { label: "CPF/CNPJ", value: findFirstDeepValue(processObj, ["cpf", "cnpj", "document"]) || findFirstDeepValue(responseObj, ["cpf", "cnpj", "document"]) || beforeRows.find((r) => r.label === "CPF/CNPJ")?.value || "—" },
          {
            label: "Status do usuário",
            value: findFirstDeepValue(processObj, ["user_status", "status"]) || findFirstDeepValue(responseObj, ["user_status", "status"]) || "—",
          },
          {
            label: "Plano (período)",
            value: resolvePlanLabel(
              findFirstDeepValue(processObj, ["plan", "plan_id"]) || findFirstDeepValue(responseObj, ["plan", "plan_id"]),
              findFirstDeepValue(processObj, ["period", "period_type"]),
            ),
          },
        ]
      : [];

    const responseSent = current
      ? {
          payload_id: current.id,
          webhook_id: current.webhook_id,
          received_at: current.created_at,
          mode: current.is_test ? "test" : "production",
          processed: current.processed,
          processed_at: current.processed_at,
          processing_summary: {
            has_error: !!current.error,
            error: current.error,
            process_details: current.process_details ?? null,
          },
          response_body: current.response_body ?? null,
        }
      : null;

    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-semibold flex items-center gap-2"><History className="w-5 h-5 text-primary" />Histórico de payloads</h2>
          <Button variant="outline" size="icon" onClick={() => reloadHistory()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar por qualquer valor no payload recebido..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            className="max-w-md"
          />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,2.25fr)] gap-4">
          <Card className="border bg-card/40 h-full min-h-[72vh] flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Payloads recebidos</CardTitle>
              <CardDescription className="text-xs">{filteredHistory.length} item(ns) encontrado(s)</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
                {paginatedHistory.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPayload(p)}
                    className={`w-full text-left rounded-xl border-2 px-4 py-3 transition-all ${
                      current?.id === p.id
                        ? "border-primary/60 bg-primary/10 shadow-sm"
                        : "border-border/60 bg-card/60 hover:border-muted-foreground/30 hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-xs font-medium text-muted-foreground tabular-nums">
                        {formatDate(p.created_at)}
                      </span>
                      <Badge
                        variant="secondary"
                        className={
                          p.is_test
                            ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                            : "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                        }
                      >
                        {p.is_test ? "Teste" : "Produção"}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                      <Webhook className="h-4 w-4 shrink-0 text-primary/70" />
                      <span className="font-medium text-foreground/90">{p.webhook_name ?? "—"}</span>
                    </div>
                    <div className="mt-2 flex items-center">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                          p.processed_action === "created"
                            ? "bg-primary/15 text-primary"
                            : p.processed_action === "updated"
                              ? "bg-blue-500/15 text-blue-400"
                              : "bg-muted/50 text-muted-foreground"
                        }`}
                      >
                        <Settings2 className="h-3.5 w-3.5 shrink-0" />
                        {p.processed_action === "created"
                          ? "Usuário criado"
                          : p.processed_action === "updated"
                            ? "Usuário atualizado"
                            : "—"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="history-page-size" className="text-xs text-muted-foreground whitespace-nowrap">Por página</Label>
                  <select
                    id="history-page-size"
                    value={historyPageSize}
                    onChange={(e) => {
                      setHistoryPageSize(Number(e.target.value));
                      setHistoryPage(1);
                    }}
                    className={cn(
                      "h-8 rounded-md border border-input bg-background px-2 text-xs",
                      "focus:outline-none focus:ring-2 focus:ring-ring"
                    )}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    disabled={historyPage <= 1}
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </Button>
                  <span className="min-w-[6rem] text-center">
                    Página {historyPage} de {historyTotalPages}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    disabled={historyPage >= historyTotalPages}
                    onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border bg-card/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">1. O que foi processado</CardTitle>
                <CardDescription className="text-xs">Antes como estava e agora como está.</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {!current ? (
                  <p className="text-xs text-muted-foreground">Selecione um payload na coluna da esquerda.</p>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    <div className="rounded-lg border p-3 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">ANTES</p>
                      {beforeRows.map((row) => (
                        <div key={row.label} className="text-xs flex justify-between gap-2">
                          <span className="text-muted-foreground">{row.label}</span>
                          <span className="font-medium text-right break-all">{row.value}</span>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-lg border p-3 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">AGORA</p>
                      {afterRows.map((row) => (
                        <div key={row.label} className="text-xs flex justify-between gap-2">
                          <span className="text-muted-foreground">{row.label}</span>
                          <span className="font-medium text-right break-all">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border bg-card/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">2. Resposta enviada</CardTitle>
                <CardDescription className="text-xs">Detalhe completo da resposta/processamento enviado por nós.</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {!current ? (
                  <p className="text-xs text-muted-foreground">Selecione um payload para ver a resposta.</p>
                ) : (
                  <pre className="bg-muted/60 rounded-md p-3 max-h-56 overflow-auto whitespace-pre-wrap break-all text-xs">
                    {JSON.stringify(responseSent, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>

            <Card className="border bg-card/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">3. Payload completo recebido</CardTitle>
                <CardDescription className="text-xs">JSON original recebido do webhook. Os payloads permanecem salvos.</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {!current ? (
                  <p className="text-xs text-muted-foreground">Selecione um payload para visualizar.</p>
                ) : (
                  <pre className="bg-muted/60 rounded-md p-3 max-h-[42vh] overflow-auto whitespace-pre-wrap break-all text-xs">
                    {JSON.stringify(current.payload, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <AdminRoute>
        <div className="p-6 text-sm text-muted-foreground">Carregando...</div>
      </AdminRoute>
    );
  }

  return (
    <AdminRoute>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Administração de Webhooks</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Mapeie campos do payload de forma inteligente e defina regras de período vinculadas aos planos.
            </p>
          </div>
          <Button onClick={openCreateDialog} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            Novo Webhook
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(value) => setTab(value as MainTab)}>
          <TabsList>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>
          <TabsContent value="webhooks" className="mt-4 glass-card p-4">{renderWebhookTable()}</TabsContent>
          <TabsContent value="history" className="mt-4 glass-card p-4">{renderHistory()}</TabsContent>
        </Tabs>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Novo Webhook</DialogTitle>
              <DialogDescription>Crie o webhook pelo nome. O mapeamento inteligente é feito em "Configurar".</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Label htmlFor="webhook-name">Nome</Label>
              <Input
                id="webhook-name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder='Ex.: "[APROVADO] Plano Pro"'
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
              <Button onClick={() => void handleCreateSubmit()}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-[1180px] max-h-[94vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Configurar Webhook</DialogTitle>
              <DialogDescription>Mapeie os campos essenciais do payload e defina regras de período.</DialogDescription>
            </DialogHeader>
            {editing && (
              <div className="space-y-3 py-1 overflow-y-auto pr-1 max-h-[80vh]">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4 items-end">
                  <div className="space-y-2">
                    <Label>Nome do webhook</Label>
                    <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>URL do Webhook</Label>
                    <div className="flex items-center gap-2">
                      <Input readOnly value={getPublicUrl(editing.secret)} />
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => navigator.clipboard.writeText(getPublicUrl(editing.secret)).then(() => toast.success("URL copiada."))}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,2.4fr)] gap-4">
                  <Card className="border bg-card/40">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Payloads recebidos</CardTitle>
                    <CardDescription className="text-xs">
                      Aqui aparecem apenas payloads de teste (webhook desativado) para mapear campos.
                    </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] text-muted-foreground">{payloads.length} payload(s)</span>
                        <Button size="icon" variant="ghost" onClick={() => void reloadPayloadsForWebhook(editing.id)}>
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="max-h-[380px] overflow-y-auto space-y-3 pr-1">
                        {payloads.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setSelectedPayload(p)}
                            className={`w-full text-left rounded-xl border-2 px-3 py-2.5 text-xs transition-all ${
                              selectedPayload?.id === p.id
                                ? "border-primary/60 bg-primary/10"
                                : "border-border/60 bg-card/60 hover:border-muted-foreground/30 hover:bg-muted/30"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-xs text-muted-foreground tabular-nums">{formatDate(p.created_at)}</span>
                              <div className="flex items-center gap-1">
                                <Badge
                                  variant="secondary"
                                  className={
                                    p.is_test
                                      ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                                      : "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                                  }
                                >
                                  {p.is_test ? "Teste" : "Produção"}
                                </Badge>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-destructive hover:text-destructive"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void handleDeletePayload(p.id, false);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                            <div className="mt-2 flex items-center gap-1.5">
                              <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">
                                {p.processed_action === "created"
                                  ? "Usuário criado"
                                  : p.processed_action === "updated"
                                    ? "Usuário atualizado"
                                    : "—"}
                              </span>
                            </div>
                          </button>
                        ))}
                        {payloads.length === 0 && (
                          <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                            Nenhum payload de teste encontrado para este webhook.
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border bg-card/40">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Mapeamento inteligente</CardTitle>
                      <CardDescription className="text-xs">Sem JSON manual: mapeie por campos, interpretações e regras.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {renderFieldSelect("Nome completo", "full_name")}
                        {renderFieldSelect("Email", "email")}
                        {renderFieldSelect("Telefone", "phone")}
                        {renderFieldSelect("CPF/CNPJ", "cpf_cnpj")}
                      </div>
                      <Card className="border-border/60 bg-card/70">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">Período recorrência</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <PayloadPathPicker
                            value={mapping.fields.recurrence_period}
                            options={payloadPaths}
                            onChange={(next) =>
                              setMapping((prev) => ({ ...prev, fields: { ...prev.fields, recurrence_period: next } }))
                            }
                          />
                          {!!selectedPayload && !!mapping.fields.recurrence_period && (
                            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2 text-xs">
                              <span className="font-medium text-emerald-400">Preview do valor:</span>{" "}
                              <span className="text-foreground/90">
                                {getValueByPath(selectedPayload.payload, mapping.fields.recurrence_period) || "—"}
                              </span>
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground">Quando valor = ... significa</p>
                          <div className="rounded-md border overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-muted/50">
                                <tr>
                                  <th className="text-left px-3 py-2">Valor no payload</th>
                                  <th className="text-left px-3 py-2">Significado</th>
                                  <th className="w-10" />
                                </tr>
                              </thead>
                              <tbody>
                                {mapping.period_interpretations.map((row, idx) => (
                                  <tr key={`${row.payload_value}-${idx}`} className="border-t">
                                    <td className="px-3 py-2">
                                      <Input
                                        value={row.payload_value}
                                        onChange={(e) =>
                                          setMapping((prev) => {
                                            const next = [...prev.period_interpretations];
                                            next[idx] = { ...next[idx], payload_value: e.target.value };
                                            return { ...prev, period_interpretations: next };
                                          })
                                        }
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <select
                                        className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                                        value={row.meaning}
                                        onChange={(e) =>
                                          setMapping((prev) => {
                                            const next = [...prev.period_interpretations];
                                            next[idx] = { ...next[idx], meaning: e.target.value as "month" | "day" | "year" };
                                            return { ...prev, period_interpretations: next };
                                          })
                                        }
                                      >
                                        <option value="month">Mês</option>
                                        <option value="day">Dia</option>
                                        <option value="year">Ano</option>
                                      </select>
                                    </td>
                                    <td className="px-2 py-2">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-destructive"
                                        onClick={() =>
                                          setMapping((prev) => ({
                                            ...prev,
                                            period_interpretations: prev.period_interpretations.filter((_, i) => i !== idx),
                                          }))
                                        }
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <Button
                            variant="outline"
                            onClick={() =>
                              setMapping((prev) => ({
                                ...prev,
                                period_interpretations: [...prev.period_interpretations, { payload_value: "", meaning: "month" }],
                              }))
                            }
                          >
                            + Adicionar
                          </Button>
                        </CardContent>
                      </Card>

                      <Card className="border-border/60 bg-card/70">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">Valor do período recorrência</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <PayloadPathPicker
                            value={mapping.fields.recurrence_value}
                            options={payloadPaths}
                            onChange={(next) =>
                              setMapping((prev) => ({ ...prev, fields: { ...prev.fields, recurrence_value: next } }))
                            }
                          />
                          {!!selectedPayload && !!mapping.fields.recurrence_value && (
                            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2 text-xs">
                              <span className="font-medium text-emerald-400">Preview do valor:</span>{" "}
                              <span className="text-foreground/90">
                                {getValueByPath(selectedPayload.payload, mapping.fields.recurrence_value) || "—"}
                              </span>
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground">Quando valor = ... significa</p>
                          <div className="rounded-md border overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-muted/50">
                                <tr>
                                  <th className="text-left px-3 py-2">Valor no payload</th>
                                  <th className="text-left px-3 py-2">Significado</th>
                                  <th className="w-10" />
                                </tr>
                              </thead>
                              <tbody>
                                {mapping.recurrence_value_interpretations.map((row, idx) => (
                                  <tr key={`${row.payload_value}-${idx}`} className="border-t">
                                    <td className="px-3 py-2">
                                      <Input
                                        value={row.payload_value}
                                        onChange={(e) =>
                                          setMapping((prev) => {
                                            const next = [...prev.recurrence_value_interpretations];
                                            next[idx] = { ...next[idx], payload_value: e.target.value };
                                            return { ...prev, recurrence_value_interpretations: next };
                                          })
                                        }
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <Input
                                        value={row.meaning}
                                        onChange={(e) =>
                                          setMapping((prev) => {
                                            const next = [...prev.recurrence_value_interpretations];
                                            next[idx] = { ...next[idx], meaning: e.target.value };
                                            return { ...prev, recurrence_value_interpretations: next };
                                          })
                                        }
                                        placeholder="Ex.: 1, 3, 6, 12"
                                      />
                                    </td>
                                    <td className="px-2 py-2">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-destructive"
                                        onClick={() =>
                                          setMapping((prev) => ({
                                            ...prev,
                                            recurrence_value_interpretations: prev.recurrence_value_interpretations.filter((_, i) => i !== idx),
                                          }))
                                        }
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <Button
                            variant="outline"
                            onClick={() =>
                              setMapping((prev) => ({
                                ...prev,
                                recurrence_value_interpretations: [...prev.recurrence_value_interpretations, { payload_value: "", meaning: "" }],
                              }))
                            }
                          >
                            + Adicionar
                          </Button>
                        </CardContent>
                      </Card>

                      <Card className="border-border/60 bg-card/70">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">Status do Usuário</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <select
                            className="w-full h-10 rounded-md border border-input bg-background px-2 text-sm"
                            value={form.user_status}
                            onChange={(e) => setForm((prev) => ({ ...prev, user_status: e.target.value as WebhookUserStatus }))}
                          >
                            <option value="">Selecione o status</option>
                            <option value="active">Ativo</option>
                            <option value="expired">Vencido</option>
                          </select>
                          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                            <p className="text-primary font-medium">Status definido:</p>
                            <p className="font-semibold mt-1">
                              {form.user_status === "" ? "Nenhum" : form.user_status === "active" ? "Ativo" : "Vencido"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {form.user_status === ""
                                ? "Selecione um status para este webhook."
                                : `O usuário será marcado como ${form.user_status === "active" ? "ativo" : "vencido"} quando este webhook processar.`}
                            </p>
                          </div>
                        </CardContent>
                      </Card>

                      <div className="space-y-2">
                        <Label>Regras de período</Label>
                        <div className="rounded-md border overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="text-left px-3 py-2">Tipo (intervalType)</th>
                                <th className="text-left px-3 py-2">Valor (intervalCount)</th>
                                <th className="text-left px-3 py-2">Período</th>
                                <th className="text-left px-3 py-2">Plano</th>
                                <th className="w-10" />
                              </tr>
                            </thead>
                            <tbody>
                              {mapping.period_rules.map((row, idx) => (
                                <tr key={`${row.interval_type_value}-${row.interval_count_value}-${idx}`} className="border-t">
                                  <td className="px-3 py-2">
                                    <Input
                                      className="h-8 text-xs"
                                      value={row.interval_type_value}
                                      onChange={(e) =>
                                        setMapping((prev) => {
                                          const next = [...prev.period_rules];
                                          next[idx] = { ...next[idx], interval_type_value: e.target.value };
                                          return { ...prev, period_rules: next };
                                        })
                                      }
                                    />
                                  </td>
                                  <td className="px-3 py-2 w-[110px]">
                                    <Input
                                      className="h-8 text-xs max-w-[90px]"
                                      value={row.interval_count_value}
                                      onChange={(e) =>
                                        setMapping((prev) => {
                                          const next = [...prev.period_rules];
                                          next[idx] = { ...next[idx], interval_count_value: e.target.value };
                                          return { ...prev, period_rules: next };
                                        })
                                      }
                                    />
                                  </td>
                                  <td className="px-3 py-2 min-w-[170px]">
                                    <select
                                      className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                                      value={row.period}
                                      onChange={(e) =>
                                        setMapping((prev) => {
                                          const next = [...prev.period_rules];
                                          next[idx] = { ...next[idx], period: e.target.value as PeriodMeaning };
                                          return { ...prev, period_rules: next };
                                        })
                                      }
                                    >
                                      <option value="monthly">{periodMeaningLabel("monthly")}</option>
                                      <option value="quarterly">{periodMeaningLabel("quarterly")}</option>
                                      <option value="semiannual">{periodMeaningLabel("semiannual")}</option>
                                      <option value="annual">{periodMeaningLabel("annual")}</option>
                                    </select>
                                  </td>
                                  <td className="px-3 py-2 min-w-[180px]">
                                    <select
                                      className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                                      value={row.plan_period_code}
                                      onChange={(e) =>
                                        setMapping((prev) => {
                                          const next = [...prev.period_rules];
                                          next[idx] = { ...next[idx], plan_period_code: e.target.value };
                                          return { ...prev, period_rules: next };
                                        })
                                      }
                                    >
                                      <option value="">Nenhum</option>
                                      {planPeriodOptions.map((opt) => (
                                        <option key={opt.code} value={opt.code}>{opt.label}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-2 py-2">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-destructive"
                                      onClick={() =>
                                        setMapping((prev) => ({
                                          ...prev,
                                          period_rules: prev.period_rules.filter((_, i) => i !== idx),
                                        }))
                                      }
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() =>
                            setMapping((prev) => ({
                              ...prev,
                              period_rules: [
                                ...prev.period_rules,
                                { interval_type_value: "", interval_count_value: "", period: "monthly", plan_period_code: "" },
                              ],
                            }))
                          }
                        >
                          + Adicionar regra
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>Fechar</Button>
              <Button onClick={() => void handleSaveConfig()}>Salvar mapeamento</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Excluir webhook</DialogTitle>
              <DialogDescription>Tem certeza que deseja excluir este webhook?</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => void handleDeleteWebhook()}>Excluir</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminRoute>
  );
}

