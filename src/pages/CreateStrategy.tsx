import { useState, useId, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createCustomStrategy,
  updateCustomStrategy,
  listCustomStrategies,
  deleteCustomStrategy,
} from "@/lib/api/strategies";
import type { CustomStrategy } from "@/lib/api/strategies";
import {
  Pencil,
  Plus,
  Trash2,
  Save,
  Info,
  TrendingUp,
  TrendingDown,
  Code2,
  List,
  Eye,
  Settings,
  X,
  Loader2,
  Copy,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  generateStrategyCode,
  generateStrategyDescription,
  RULE_TYPE_LABELS,
  RULE_TYPE_HINT,
  PRICE_TYPE_LABELS,
  type ManualStrategyConfig,
  type StrategyRule,
  type RuleType,
  type Timeframe,
  type CandlePriceType,
} from "@/lib/strategyBuilder";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function newRuleId() {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const DEFAULT_RSI = { period: 14, threshold: 30 };
const DEFAULT_RSI_PUT = { period: 14, threshold: 70 };
const DEFAULT_EMA = { fast: 9, slow: 20 };
const DEFAULT_MACD = { fast: 12, slow: 26, signal: 9 };
const DEFAULT_CANDLE_COMPARE = { priceType: "close" as CandlePriceType, barsAgo: 2, currentGreater: true };
const DEFAULT_BOLLINGER = { period: 20, stdMult: 2 };
const DEFAULT_CANDLE_COLOR = { candleIndex: 0, green: true };
const DEFAULT_ENGULFMENT = { bullish: true };
const DEFAULT_WICK_SIZE = { side: "upper" as const, compareType: "body_ratio" as const, ratio: 1.5 };
const DEFAULT_BREAKOUT = { period: 20, boundary: "high" as const };
const DEFAULT_CONSECUTIVE = { count: 3, green: true };
const DEFAULT_MA_COMPARE = {
  maType: "ema" as const,
  period: 20,
  comparison: "above" as const,
  target: "price" as const,
  targetPriceType: "close" as CandlePriceType,
  targetMaType: "ema" as const,
  targetMaPeriod: 50,
};

/** Traduz uma regra para português legível */
function ruleToHuman(rule: StrategyRule): string {
  const p = rule.params as any;
  switch (rule.type) {
    case "rsi":
      return `RSI(${p.period ?? 14}) ${rule.signal === "call" ? `abaixo de ${p.threshold ?? 30} (sobrevendido)` : `acima de ${p.threshold ?? 70} (sobrecomprado)`}`;
    case "candle_body":
      return rule.signal === "call" ? "Vela atual VERDE (fechamento > abertura)" : "Vela atual VERMELHA (fechamento < abertura)";
    case "ema_cross":
      return `EMA(${p.fast ?? 9}) ${rule.signal === "call" ? "acima" : "abaixo"} da EMA(${p.slow ?? 20})`;
    case "sma_cross":
      return `SMA(${p.fast ?? 9}) ${rule.signal === "call" ? "acima" : "abaixo"} da SMA(${p.slow ?? 20})`;
    case "macd":
      return `MACD histograma ${rule.signal === "call" ? "positivo (momentum de alta)" : "negativo (momentum de baixa)"}`;
    case "candle_color": {
      const idx = p.candleIndex ?? 0;
      const pos = idx === 0 ? "atual" : `${idx} atrás`;
      return `Vela ${pos} deve ser ${p.green ? "VERDE" : "VERMELHA"}`;
    }
    case "candle_sequence": {
      const seq: boolean[] = p.sequence ?? [true];
      const labels = seq.map((g: boolean) => g ? "VERDE" : "VERMELHA").join(" › ");
      return `Sequência: ${labels} (${seq.length} velas)`;
    }
    case "candle_compare": {
      const barsAgo = p.barsAgo ?? 2;
      return `Preço de ${PRICE_TYPE_LABELS[p.priceType as CandlePriceType] ?? "fechamento"} atual ${p.currentGreater ? "maior" : "menor"} que ${barsAgo} vela(s) atrás`;
    }
    case "engulfment":
      return rule.signal === "call"
        ? "Engolfo de Alta (vela verde engole a vermelha anterior)"
        : "Engolfo de Baixa (vela vermelha engole a verde anterior)";
    case "bollinger":
      return rule.signal === "call"
        ? `Preço tocou/cruzou a banda INFERIOR de Bollinger(${p.period ?? 20})`
        : `Preço tocou/cruzou a banda SUPERIOR de Bollinger(${p.period ?? 20})`;
    case "wick_size":
      return `Pavio ${p.side === "upper" ? "superior" : "inferior"} ${p.compareType === "body_ratio" ? `${p.ratio ?? 1.5}x maior que o corpo` : "maior que o pavio anterior"}`;
    case "breakout":
      return `Preço rompeu a ${p.boundary === "high" ? "máxima" : "mínima"} das últimas ${p.period ?? 20} velas`;
    case "consecutive":
      return `${p.count ?? 3} velas consecutivas ${p.green ? "VERDES" : "VERMELHAS"}`;
    case "ma_compare": {
      const comp = p.comparison === "above" ? "acima" : "abaixo";
      if (p.target === "price")
        return `Preço de ${PRICE_TYPE_LABELS[(p.targetPriceType ?? "close") as CandlePriceType]} está ${comp} da ${p.maType?.toUpperCase() ?? "EMA"}(${p.period ?? 20})`;
      return `${p.maType?.toUpperCase() ?? "EMA"}(${p.period ?? 20}) está ${comp} da ${p.targetMaType?.toUpperCase() ?? "EMA"}(${p.targetMaPeriod ?? 50})`;
    }
    default:
      return rule.type;
  }
}

/** Espelha regras para o sinal oposto usando defaults inteligentes */
function mirrorRulesAsOpposite(rules: StrategyRule[], targetSignal: "call" | "put"): StrategyRule[] {
  return rules.map((r) => ({
    ...r,
    id: newRuleId(),
    signal: targetSignal,
    params: defaultParamsFor(r.type, targetSignal),
  }));
}

function defaultParamsFor(type: RuleType, signal: "call" | "put"): StrategyRule["params"] {
  switch (type) {
    case "rsi":
      return signal === "call" ? { ...DEFAULT_RSI } : { ...DEFAULT_RSI_PUT };
    case "ema_cross":
    case "sma_cross":
      return { ...DEFAULT_EMA };
    case "macd":
      return { ...DEFAULT_MACD };
    case "candle_body":
      return {};
    case "candle_compare":
      return { ...DEFAULT_CANDLE_COMPARE, currentGreater: signal === "call" };
    case "candle_color":
      return { ...DEFAULT_CANDLE_COLOR, green: signal === "call" };
    case "engulfment":
      return { bullish: signal === "call" };
    case "bollinger":
      return { ...DEFAULT_BOLLINGER };
    case "wick_size":
      return { ...DEFAULT_WICK_SIZE, side: signal === "call" ? "lower" : "upper" };
    case "breakout":
      return { ...DEFAULT_BREAKOUT, boundary: signal === "call" ? "high" : "low" };
    case "consecutive":
      return { ...DEFAULT_CONSECUTIVE, green: signal === "call" };
    case "candle_sequence":
      return { sequence: signal === "call" ? [false, false, true] : [true, true, false] };
    case "ma_compare":
      return { ...DEFAULT_MA_COMPARE, comparison: signal === "call" ? "above" : "below" };
    default:
      return {};
  }
}


export default function CreateStrategyPage() {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  const [strategies, setStrategies] = useState<CustomStrategy[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // Editor State
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [timeframe, setTimeframe] = useState<Timeframe>("M1");
  const [description, setDescription] = useState("");
  const [callRules, setCallRules] = useState<StrategyRule[]>([]);
  const [putRules, setPutRules] = useState<StrategyRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [showCode, setShowCode] = useState(false);

  // Modals
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [detailStrategy, setDetailStrategy] = useState<CustomStrategy | null>(null);

  const loadStrategies = useCallback(async () => {
    setLoadingList(true);
    try {
      const list = await listCustomStrategies();
      setStrategies(list ?? []);
    } catch {
      setStrategies([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadStrategies();
  }, [loadStrategies]);

  const handleStartCreate = () => {
    setEditId(null);
    setName("");
    setDescription("");
    setCallRules([]);
    setPutRules([]);
    setTimeframe("M1");
    setIsCreating(true);
  };

  const handleStartEdit = (s: CustomStrategy) => {
    setEditId(s.id);
    setName(s.name);
    setDescription(s.description || "");
    setTimeframe(s.timeframe);

    // Carregar regras do config se disponível
    try {
      if (s.config) {
        // Garantir que é um objeto, se for string tenta dar parse
        const conf = typeof s.config === "string" ? JSON.parse(s.config) : s.config;
        if (conf && typeof conf === "object") {
          setCallRules(conf.callRules || []);
          setPutRules(conf.putRules || []);
        } else {
          setCallRules([]);
          setPutRules([]);
        }
      } else {
        setCallRules([]);
        setPutRules([]);
      }
    } catch (e) {
      console.error("Erro ao carregar config da estratégia:", e);
      setCallRules([]);
      setPutRules([]);
    }

    setIsCreating(true);
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
  };

  const addRule = (signal: "call" | "put") => {
    const rule: StrategyRule = {
      id: newRuleId(),
      signal,
      type: "candle_body",
      params: defaultParamsFor("candle_body", signal),
    };
    if (signal === "call") setCallRules((r) => [...r, rule]);
    else setPutRules((r) => [...r, rule]);
  };

  const removeRule = (signal: "call" | "put", id: string) => {
    if (signal === "call") setCallRules((r) => r.filter((x) => x.id !== id));
    else setPutRules((r) => r.filter((x) => x.id !== id));
  };

  const updateRule = (signal: "call" | "put", id: string, updates: Partial<StrategyRule>) => {
    const upd = (r: StrategyRule) => (r.id === id ? { ...r, ...updates } : r);
    if (signal === "call") setCallRules((list) => list.map(upd));
    else setPutRules((list) => list.map(upd));
  };

  const config: ManualStrategyConfig = {
    name: name.trim() || "Estratégia manual",
    timeframe,
    description: description.trim() || undefined,
    callRules,
    putRules,
  };

  const code = callRules.length > 0 || putRules.length > 0 ? generateStrategyCode(config) : "";
  const canSave = name.trim().length > 0 && (callRules.length > 0 || putRules.length > 0) && code.length > 0;

  const handleSave = async () => {
    if (!canSave) {
      toast.error("Preencha o nome e adicione pelo menos uma regra.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: config.name,
        code,
        timeframe,
        description: description.trim() || generateStrategyDescription(config),
        config: {
          ...config,
          callRules,
          putRules
        },
      };

      if (editId) {
        await updateCustomStrategy(editId, payload);
        toast.success("Estratégia atualizada!");
      } else {
        await createCustomStrategy(payload);
        toast.success("Estratégia criada!");
      }

      await loadStrategies();
      setIsCreating(false);
    } catch (e: any) {
      toast.error(e?.detail ?? "Erro ao salvar estratégia.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteCustomStrategy(deleteId);
      await loadStrategies();
      setDeleteId(null);
      toast.success("Estratégia removida.");
    } catch (e: any) {
      toast.error("Erro ao remover estratégia.");
    } finally {
      setDeleting(false);
    }
  };

  if (isCreating) {
    return (
      <div className="space-y-8 pb-12 animate-in fade-in duration-500">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              {editId ? "Editar Estratégia" : "Construtor de Estratégia"}
            </h1>
            <p className="text-muted-foreground mt-2 max-w-xl">
              {editId
                ? "Modifique a lógica da sua estratégia. As alterações serão salvas ao clicar em Salvar."
                : "Crie sua própria lógica de operação sem precisar programar. Combine indicadores, padrões de velas e comportamentos de preço de forma intuitiva."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={handleCancelCreate} className="hover:bg-destructive/10 hover:text-destructive">
              <X className="h-4 w-4 mr-2" /> Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="shadow-md bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6"
            >
              {saving ? "Salvando..." : <><Save className="h-4 w-4 mr-2" /> {editId ? "Salvar Alterações" : "Salvar Estratégia"}</>}
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <Card className="border-border shadow-sm overflow-hidden">
              <div className="h-1 bg-primary" />
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Info className="h-5 w-5 text-primary" />
                  Configurações Básicas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="manual-name" className="text-sm font-semibold">Nome da Estratégia</Label>
                  <Input
                    id="manual-name"
                    placeholder="Ex: Minha Estratégia V1"
                    className="bg-muted/30"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Gráfico (Timeframe)</Label>
                  <div className="flex p-1 bg-muted/50 rounded-lg gap-1">
                    <button
                      type="button"
                      onClick={() => setTimeframe("M1")}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${timeframe === "M1" ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      M1 (1 min)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimeframe("M5")}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${timeframe === "M5" ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      M5 (5 min)
                    </button>
                  </div>
                </div>

              </CardContent>
            </Card>

            {/* Resumo em português */}
            {(callRules.length > 0 || putRules.length > 0) && (
              <Card className="border-border shadow-sm">
                <div className="h-1 bg-gradient-to-r from-emerald-500 to-red-500 rounded-t-lg" />
                <CardHeader className="py-3 pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    O robô vai operar assim
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {callRules.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Compra (Call)</p>
                      {callRules.map((r, i) => (
                        <div key={r.id} className="flex items-start gap-2">
                          {i > 0 && <span className="text-[10px] font-bold text-muted-foreground mt-0.5 shrink-0 w-5 text-center">E</span>}
                          {i === 0 && <span className="text-[10px] font-bold text-emerald-600 mt-0.5 shrink-0 w-5 text-center">▸</span>}
                          <p className="text-[11px] text-muted-foreground">{ruleToHuman(r)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {putRules.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-bold text-red-600 uppercase tracking-wider">Venda (Put)</p>
                      {putRules.map((r, i) => (
                        <div key={r.id} className="flex items-start gap-2">
                          {i > 0 && <span className="text-[10px] font-bold text-muted-foreground mt-0.5 shrink-0 w-5 text-center">E</span>}
                          {i === 0 && <span className="text-[10px] font-bold text-red-500 mt-0.5 shrink-0 w-5 text-center">▸</span>}
                          <p className="text-[11px] text-muted-foreground">{ruleToHuman(r)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Aviso de estratégia unilateral */}
                  {(callRules.length > 0) !== (putRules.length > 0) && (
                    <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        Estratégia só opera em um sentido. Adicione condições para {callRules.length === 0 ? "COMPRA" : "VENDA"} também.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {code && (
              <Card className="border-border shadow-sm border-dashed">
                <CardHeader className="py-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Code2 className="h-4 w-4 text-muted-foreground" />
                      Lógica Gerada
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setShowCode(!showCode)} className="h-7 text-[10px] uppercase font-bold tracking-widest">
                      {showCode ? "Ocultar" : "Ver Código"}
                    </Button>
                  </div>
                </CardHeader>
                {showCode && (
                  <CardContent>
                    <pre className="rounded-lg bg-black/5 p-4 text-[10px] overflow-x-auto whitespace-pre-wrap font-mono border border-border/50">
                      {code}
                    </pre>
                  </CardContent>
                )}
              </Card>
            )}
          </div>

          <div className="lg:col-span-2 space-y-8">
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-2 rounded-full bg-emerald-500/10 text-emerald-600 shrink-0">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-emerald-700 dark:text-emerald-400">Compra (Call)</h3>
                      {callRules.length > 0 && (
                        <span className="text-[11px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                          {callRules.length} condição{callRules.length > 1 ? "ões" : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Sinal dado quando <strong>TODAS</strong> as condições forem verdadeiras.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {callRules.length > 0 && putRules.length === 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPutRules(mirrorRulesAsOpposite(callRules, "put"))}
                      className="text-xs gap-1.5 border-dashed"
                      title="Copia estas condições invertidas para VENDA"
                    >
                      <Copy className="h-3.5 w-3.5" /> Espelhar para PUT
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={() => addRule("call")}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                  >
                    <Plus className="h-4 w-4 mr-1.5" /> Adicionar
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {callRules.length === 0 ? (
                  <div className="border-2 border-dashed border-emerald-200 dark:border-emerald-900/50 rounded-xl p-6 text-center bg-emerald-50/30 dark:bg-emerald-950/20">
                    <TrendingUp className="h-8 w-8 mx-auto text-emerald-300 dark:text-emerald-800 mb-2" />
                    <p className="text-sm font-medium text-muted-foreground mb-1">Nenhuma condição de compra ainda</p>
                    <p className="text-xs text-muted-foreground mb-3">Clique em <strong>Adicionar</strong> para definir quando o robô deve comprar (Call).</p>
                    <p className="text-xs text-muted-foreground/60">Sugestão: comece com <em>Direção da vela + RSI</em> para uma estratégia simples.</p>
                  </div>
                ) : (
                  callRules.map((rule, idx) => (
                    <div key={rule.id}>
                      {idx > 0 && (
                        <div className="flex items-center gap-2 py-1">
                          <div className="flex-1 h-px bg-border/50" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/60 px-2.5 py-0.5 rounded-full border border-border/60">
                            E (AND)
                          </span>
                          <div className="flex-1 h-px bg-border/50" />
                        </div>
                      )}
                      <RuleEditor
                        rule={rule}
                        onUpdate={(u) => updateRule("call", rule.id, u)}
                        onRemove={() => removeRule("call", rule.id)}
                      />
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-2 rounded-full bg-red-500/10 text-red-600 shrink-0">
                    <TrendingDown className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-red-700 dark:text-red-400">Venda (Put)</h3>
                      {putRules.length > 0 && (
                        <span className="text-[11px] font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full">
                          {putRules.length} condição{putRules.length > 1 ? "ões" : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Sinal dado quando <strong>TODAS</strong> as condições forem verdadeiras.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {putRules.length > 0 && callRules.length === 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setCallRules(mirrorRulesAsOpposite(putRules, "call"))}
                      className="text-xs gap-1.5 border-dashed"
                      title="Copia estas condições invertidas para COMPRA"
                    >
                      <Copy className="h-3.5 w-3.5" /> Espelhar para CALL
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={() => addRule("put")}
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white shadow-sm"
                  >
                    <Plus className="h-4 w-4 mr-1.5" /> Adicionar
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {putRules.length === 0 ? (
                  <div className="border-2 border-dashed border-red-200 dark:border-red-900/50 rounded-xl p-6 text-center bg-red-50/30 dark:bg-red-950/20">
                    <TrendingDown className="h-8 w-8 mx-auto text-red-300 dark:text-red-800 mb-2" />
                    <p className="text-sm font-medium text-muted-foreground mb-1">Nenhuma condição de venda ainda</p>
                    <p className="text-xs text-muted-foreground mb-3">Clique em <strong>Adicionar</strong> para definir quando o robô deve vender (Put).</p>
                    {callRules.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPutRules(mirrorRulesAsOpposite(callRules, "put"))}
                        className="text-xs gap-1.5 border-dashed mx-auto"
                      >
                        <Copy className="h-3.5 w-3.5" /> Espelhar condições de CALL invertidas
                      </Button>
                    )}
                  </div>
                ) : (
                  putRules.map((rule, idx) => (
                    <div key={rule.id}>
                      {idx > 0 && (
                        <div className="flex items-center gap-2 py-1">
                          <div className="flex-1 h-px bg-border/50" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/60 px-2.5 py-0.5 rounded-full border border-border/60">
                            E (AND)
                          </span>
                          <div className="flex-1 h-px bg-border/50" />
                        </div>
                      )}
                      <RuleEditor
                        rule={rule}
                        onUpdate={(u) => updateRule("put", rule.id, u)}
                        onRemove={() => removeRule("put", rule.id)}
                      />
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Minhas estratégias
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Crie suas próprias estratégias manuais ou gerencie as existentes.
          </p>
        </div>
        <Button
          onClick={handleStartCreate}
          className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
        >
          <Plus className="h-4 w-4" />
          Criar nova estratégia
        </Button>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <List className="h-4 w-4" />
            Estratégias criadas
          </CardTitle>
          <CardDescription>
            Suas estratégias aparecem em Configurar Robô para uso no robô.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingList ? (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 rounded-lg border border-border px-4 py-3">
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-52" />
                  </div>
                  <Skeleton className="h-5 w-8 rounded-full" />
                  <div className="flex gap-1.5">
                    {Array.from({ length: 4 }).map((_, j) => <Skeleton key={j} className="h-8 w-8 rounded-md" />)}
                  </div>
                </div>
              ))}
            </div>
          ) : strategies.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 py-10 text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Nenhuma estratégia personalizada ainda.
              </p>
              <Button onClick={handleStartCreate} className="gap-2">
                <Plus className="h-4 w-4" />
                Criar primeira estratégia
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {strategies.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 hover:border-primary/30 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {s.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px]">
                      {s.timeframe}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => handleStartEdit(s)}
                      title="Editar lógica"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => setDetailStrategy(s)}
                      title="Ver detalhes"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => navigate("/bot-config")}
                      title="Usar no robô"
                    >
                      <Settings className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteId(s.id)}
                      title="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!detailStrategy} onOpenChange={(open) => !open && setDetailStrategy(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="pr-8">
              {detailStrategy?.name ?? "Detalhes da estratégia"}
            </DialogTitle>
          </DialogHeader>
          {detailStrategy && (
            <div className="space-y-6 overflow-y-auto pr-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Timeframe</p>
                  <p className="text-sm font-medium">{detailStrategy.timeframe}</p>
                </div>
                {detailStrategy.created_at && (
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Criada em</p>
                    <p className="text-sm font-medium">
                      {new Date(detailStrategy.created_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Código completo</h3>
                <pre className="text-xs font-mono bg-muted/40 border border-border rounded-lg p-4 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
                  {detailStrategy.code}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => !deleting && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir estratégia?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A estratégia será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Excluindo...
                </>
              ) : (
                "Excluir"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div >
  );
}

function RuleEditor({
  rule,
  onUpdate,
  onRemove,
}: {
  rule: StrategyRule;
  onUpdate: (u: any) => void;
  onRemove: () => void;
}) {
  const typeId = useId();
  const onTypeChange = (type: RuleType) => {
    onUpdate({ type, params: defaultParamsFor(type, rule.signal) });
  };

  const params = rule.params as any;

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4 hover:border-primary/30 transition-colors shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1.5 flex-1">
          <Label htmlFor={typeId} className="text-xs font-semibold text-primary uppercase tracking-wider">
            Selecione a Regra de Operação
          </Label>
          <Select
            value={rule.type}
            onValueChange={(v) => onTypeChange(v as RuleType)}
          >
            <SelectTrigger id={typeId} className="w-full bg-background border-border/70 shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              position="popper"
              side="bottom"
              align="start"
              avoidCollisions={true}
              className="max-h-[60vh] overflow-y-auto w-[var(--radix-select-trigger-width)]"
            >
              <SelectGroup>
                <SelectLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-2 py-1.5">
                  Velas
                </SelectLabel>
                {(["candle_body", "consecutive", "candle_sequence", "wick_size", "breakout", "candle_compare", "engulfment", "candle_color"] as RuleType[]).map((t) => (
                  <SelectItem key={t} value={t} className="py-2.5">
                    {RULE_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-2 py-1.5 mt-1">
                  Indicadores
                </SelectLabel>
                {(["rsi", "bollinger", "ema_cross", "sma_cross", "macd", "ma_compare"] as RuleType[]).map((t) => (
                  <SelectItem key={t} value={t} className="py-2.5">
                    {RULE_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="self-end sm:self-center text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Remover
        </Button>
      </div>

      <div className="rounded-lg border border-primary/10 bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground flex items-start gap-2">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
        <span>{RULE_TYPE_HINT[rule.type]}</span>
      </div>

      <div className="pt-2 border-t border-border/30">
        {rule.type === "rsi" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium italic">Período (Qtd. de Velas)</Label>
              <Input
                type="number"
                min={5}
                max={30}
                value={params.period ?? 14}
                onChange={(e) =>
                  onUpdate({
                    params: { ...params, period: Number(e.target.value) || 14 },
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                {rule.signal === "call" ? "Comprar se RSI for abaixo de:" : "Vender se RSI for acima de:"}
              </Label>
              <Input
                type="number"
                min={1}
                max={99}
                value={params.threshold !== undefined ? params.threshold : (rule.signal === "call" ? 30 : 70)}
                onChange={(e) =>
                  onUpdate({
                    params: { ...params, threshold: Number(e.target.value) },
                  })
                }
              />
            </div>
          </div>
        )}

        {(rule.type === "ema_cross" || rule.type === "sma_cross") && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Média rápida (Ex: 9)</Label>
              <Input
                type="number"
                min={2}
                max={50}
                value={params.fast ?? 9}
                onChange={(e) =>
                  onUpdate({
                    params: { ...params, fast: Number(e.target.value) || 9 },
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Média lenta (Ex: 20)</Label>
              <Input
                type="number"
                min={2}
                max={100}
                value={params.slow ?? 20}
                onChange={(e) =>
                  onUpdate({
                    params: { ...params, slow: Number(e.target.value) || 20 },
                  })
                }
              />
            </div>
          </div>
        )}

        {rule.type === "macd" && (
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Per. Rápido</Label>
              <Input
                type="number"
                value={params.fast ?? 12}
                onChange={(e) => onUpdate({ params: { ...params, fast: Number(e.target.value) || 12 } })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Per. Lento</Label>
              <Input
                type="number"
                value={params.slow ?? 26}
                onChange={(e) => onUpdate({ params: { ...params, slow: Number(e.target.value) || 26 } })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Sinal</Label>
              <Input
                type="number"
                value={params.signal ?? 9}
                onChange={(e) => onUpdate({ params: { ...params, signal: Number(e.target.value) || 9 } })}
              />
            </div>
          </div>
        )}

        {rule.type === "candle_compare" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Preço da Vela Atual</Label>
                <Select
                  value={params.priceType ?? "close"}
                  onValueChange={(v) =>
                    onUpdate({ params: { ...params, priceType: v as CandlePriceType } })
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" avoidCollisions={true}>
                    {(Object.keys(PRICE_TYPE_LABELS) as CandlePriceType[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {PRICE_TYPE_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Comparar com Vela:</Label>
                <Select
                  value={String(params.barsAgo !== undefined ? params.barsAgo : 2)}
                  onValueChange={(v) =>
                    onUpdate({ params: { ...params, barsAgo: Number(v) } })
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" avoidCollisions={true}>
                    {[1, 2, 3, 4, 5, 10].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        Vela [{n}] ({n} {n === 1 ? "atrás" : "atrás"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Comparativo</Label>
                <Select
                  value={params.currentGreater === false ? "less" : "greater"}
                  onValueChange={(v) =>
                    onUpdate({ params: { ...params, currentGreater: v === "greater" } })
                  }
                >
                  <SelectTrigger className="bg-background font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" avoidCollisions={true}>
                    <SelectItem value="greater">Deve ser Maior {">"}</SelectItem>
                    <SelectItem value="less">Deve ser Menor {"<"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {rule.type === "candle_color" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Posição da Vela</Label>
              <Select
                value={String(params.candleIndex ?? 0)}
                onValueChange={(v) =>
                  onUpdate({ params: { ...params, candleIndex: Number(v) || 0 } })
                }
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" avoidCollisions={true}>
                  <SelectItem value="0">Vela Atual (em formação)</SelectItem>
                  <SelectItem value="1">Vela [1] (anterior)</SelectItem>
                  <SelectItem value="2">Vela [2] (duas atrás)</SelectItem>
                  <SelectItem value="3">Vela [3] (três atrás)</SelectItem>
                  <SelectItem value="4">Vela [4] (quatro atrás)</SelectItem>
                  <SelectItem value="5">Vela [5] (cinco atrás)</SelectItem>
                  <SelectItem value="6">Vela [6] (seis atrás)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Cor Obrigatória</Label>
              <Select
                value={params.green === false ? "red" : "green"}
                onValueChange={(v) =>
                  onUpdate({ params: { ...params, green: v === "green" } })
                }
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" avoidCollisions={true}>
                  <SelectItem value="green" className="text-emerald-600 font-bold">Verde (Vela de Alta)</SelectItem>
                  <SelectItem value="red" className="text-red-600 font-bold">Vermelha (Vela de Baixa)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {rule.type === "candle_sequence" && (() => {
          const seq: boolean[] = (params as any).sequence ?? [true];
          return (
            <div className="space-y-3">
              <Label className="text-xs font-medium">
                Monte a sequência de cores — da mais antiga (esquerda) para a mais recente (direita)
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                {seq.map((green: boolean, i: number) => (
                  <button
                    key={i}
                    type="button"
                    title={green ? "Verde — clique para trocar" : "Vermelha — clique para trocar"}
                    onClick={() => {
                      const next = [...seq];
                      next[i] = !next[i];
                      onUpdate({ params: { ...params, sequence: next } });
                    }}
                    className={`w-10 h-10 rounded-lg border-2 font-bold text-xs transition-all ${green ? "bg-emerald-600/20 border-emerald-500 text-emerald-400 hover:bg-emerald-600/40" : "bg-red-600/20 border-red-500 text-red-400 hover:bg-red-600/40"}`}
                  >
                    {green ? "V" : "R"}
                  </button>
                ))}
                {seq.length < 8 && (
                  <button
                    type="button"
                    title="Adicionar vela à sequência"
                    onClick={() => onUpdate({ params: { ...params, sequence: [...seq, true] } })}
                    className="w-10 h-10 rounded-lg border-2 border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-primary transition-all text-lg"
                  >
                    +
                  </button>
                )}
                {seq.length > 1 && (
                  <button
                    type="button"
                    title="Remover última vela"
                    onClick={() => onUpdate({ params: { ...params, sequence: seq.slice(0, -1) } })}
                    className="w-10 h-10 rounded-lg border-2 border-dashed border-muted-foreground/40 text-muted-foreground hover:border-red-500 hover:text-red-400 transition-all text-lg"
                  >
                    −
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Clique em cada vela para alternar entre Verde (V) e Vermelha (R). Sequência atual: <span className="font-mono">{seq.map((g: boolean) => g ? "🟢" : "🔴").join(" › ")}</span>
              </p>
            </div>
          );
        })()}

        {rule.type === "wick_size" && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Qual pavio observar?</Label>
              <Select
                value={params.side}
                onValueChange={(v) => onUpdate({ params: { ...params, side: v as any } })}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" avoidCollisions={true}>
                  <SelectItem value="upper">Pavio Superior (Máxima)</SelectItem>
                  <SelectItem value="lower">Pavio Inferior (Mínima)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Tipo de Regra do Pavio</Label>
              <Select
                value={params.compareType}
                onValueChange={(v) => onUpdate({ params: { ...params, compareType: v as any } })}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" avoidCollisions={true}>
                  <SelectItem value="body_ratio">Proporção com o corpo</SelectItem>
                  <SelectItem value="larger_than_previous">Maior que pavio anterior</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {params.compareType === "body_ratio" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium italic">Qtd. vezes maior (Ex: 1.5)</Label>
                <Input
                  type="number"
                  step={0.1}
                  value={params.ratio}
                  onChange={(e) => onUpdate({ params: { ...params, ratio: Number(e.target.value) || 1 } })}
                />
              </div>
            )}
          </div>
        )}

        {rule.type === "breakout" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Analisar as últimas (velas):</Label>
              <Input
                type="number"
                value={params.period}
                onChange={(e) => onUpdate({ params: { ...params, period: Number(e.target.value) || 20 } })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Borda a ser rompida:</Label>
              <Select
                value={params.boundary}
                onValueChange={(v) => onUpdate({ params: { ...params, boundary: v as any } })}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" avoidCollisions={true}>
                  <SelectItem value="high">Topo (Máxima do período)</SelectItem>
                  <SelectItem value="low">Fundo (Mínima do período)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {rule.type === "consecutive" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Qtd. de Velas Iguais</Label>
              <Input
                type="number"
                min={2}
                max={10}
                value={params.count !== undefined ? params.count : 3}
                onChange={(e) => onUpdate({ params: { ...params, count: Number(e.target.value) || 3 } })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Cor da Sequência</Label>
              <Select
                value={params.green === false ? "red" : "green"}
                onValueChange={(v) =>
                  onUpdate({ params: { ...params, green: v === "green" } })
                }
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" avoidCollisions={true}>
                  <SelectItem value="green" className="text-emerald-600 font-semibold">Todas Verdes</SelectItem>
                  <SelectItem value="red" className="text-red-600 font-semibold">Todas Vermelhas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {rule.type === "bollinger" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Período SMA</Label>
              <Input
                type="number"
                value={params.period ?? 20}
                onChange={(e) => onUpdate({ params: { ...params, period: Number(e.target.value) || 20 } })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Desvio (Std Dev)</Label>
              <Input
                type="number"
                step={0.1}
                value={params.stdMult ?? 2}
                onChange={(e) => onUpdate({ params: { ...params, stdMult: Number(e.target.value) || 2 } })}
              />
            </div>
          </div>
        )}

        {rule.type === "engulfment" && (
          <div className="py-2 text-sm italic text-muted-foreground bg-muted/10 rounded-lg px-4 border border-dashed text-center">
            Esta regra não possui parâmetros. O robô irá verificar se a vela atual engoliu a vela anterior.
          </div>
        )}

        {rule.type === "ma_compare" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Tipo de Média</Label>
                <Select
                  value={params.maType}
                  onValueChange={(v) => onUpdate({ params: { ...params, maType: v as any } })}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" avoidCollisions={true}>
                    <SelectItem value="ema">EMA (Exponencial)</SelectItem>
                    <SelectItem value="sma">SMA (Simples)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Período</Label>
                <Input
                  type="number"
                  min={2}
                  max={200}
                  value={params.period}
                  onChange={(e) => onUpdate({ params: { ...params, period: Number(e.target.value) || 20 } })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Condição</Label>
                <Select
                  value={params.comparison}
                  onValueChange={(v) => onUpdate({ params: { ...params, comparison: v as any } })}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" avoidCollisions={true}>
                    <SelectItem value="above">Preço ACIMA da média</SelectItem>
                    <SelectItem value="below">Preço ABAIXO da média</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Comparar com</Label>
                <Select
                  value={params.target}
                  onValueChange={(v) => onUpdate({ params: { ...params, target: v as any } })}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" avoidCollisions={true}>
                    <SelectItem value="price">Preço do Candle</SelectItem>
                    <SelectItem value="ma">Outra Média Móvel</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {params.target === "price" ? (
                <div className="space-y-1.5 flex-1">
                  <Label className="text-xs font-medium">Preço de Referência</Label>
                  <Select
                    value={params.targetPriceType || "close"}
                    onValueChange={(v) => onUpdate({ params: { ...params, targetPriceType: v as any } })}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" avoidCollisions={true}>
                      {(Object.keys(PRICE_TYPE_LABELS) as CandlePriceType[]).map((k) => (
                        <SelectItem key={k} value={k}>{PRICE_TYPE_LABELS[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-xs font-medium">Tipo (2ª Média)</Label>
                    <Select
                      value={params.targetMaType}
                      onValueChange={(v) => onUpdate({ params: { ...params, targetMaType: v as any } })}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" avoidCollisions={true}>
                        <SelectItem value="ema">EMA</SelectItem>
                        <SelectItem value="sma">SMA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24 space-y-1.5">
                    <Label className="text-xs font-medium">Período</Label>
                    <Input
                      type="number"
                      min={2}
                      max={200}
                      value={params.targetMaPeriod}
                      onChange={(e) => onUpdate({ params: { ...params, targetMaPeriod: Number(e.target.value) || 50 } })}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
