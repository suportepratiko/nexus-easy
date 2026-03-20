import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useBot } from "@/modules/bot/BotProvider";
import { useAuth } from "@/contexts/AuthContext";
import type { StrategyConfig, CalculationMode, MartingaleLevel, AssetModality, MarketType } from "@/modules/bot/schemas";
import { StrategyConfigSchema } from "@/modules/bot/schemas";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { SafirionConnectCard } from "@/components/SafirionConnectCard";
import {
  Play,
  Square,
  TrendingUp,
  TrendingDown,
  Layers,
  DollarSign,
  Percent,
  Hash,
  Sparkles,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getBalances, getPlatformBotConfig, savePlatformBotConfig } from "@/lib/api";
import { listCustomStrategies } from "@/lib/api/strategies";
import type { CustomStrategy } from "@/lib/api/strategies";
import { formatBrl } from "@/lib/utils";
import { BotConfigSkeleton } from "@/components/skeletons/PageSkeletons";

const MODE_OPTIONS: { value: CalculationMode; label: string; icon: typeof DollarSign }[] = [
  { value: "gross_value", label: "Valor (R$)", icon: DollarSign },
  { value: "percentage", label: "Porcentagem (%)", icon: Percent },
  { value: "entries", label: "Nº de Entradas", icon: Hash },
];

const MARTINGALE_OPTIONS: { value: MartingaleLevel; label: string; description: string }[] = [
  { value: "none", label: "Sem Martingale", description: "Entrada fixa" },
  { value: "1x", label: "1 Martingale", description: "Dobra 1x após loss" },
  { value: "2x", label: "2 Martingales", description: "Dobra até 2x" },
  { value: "3x", label: "3 Martingales", description: "Dobra até 3x" },
];

const MODALITY_OPTIONS: { value: AssetModality; label: string }[] = [
  { value: "digital", label: "Digital" },
  { value: "binary", label: "Binárias" },
];

const MARKET_OPTIONS: { value: MarketType; label: string }[] = [
  { value: "open", label: "Mercado aberto" },
  { value: "otc", label: "Mercado OTC" },
];

const STRATEGY_OPTIONS: { value: StrategyType; label: string; description: string }[] = [
  { value: "otc", label: "Sniper", description: "" },
  { value: "supertrend", label: "Titan", description: "" },
];

export default function BotConfigPage() {
  const navigate = useNavigate();
  const { startBot, stopBot, status, error: botError, initializing } = useBot();
  const { isAuthenticated: isBrokerConnected } = useAuth();
  const isRunning = status === "running";

  const [bankroll, setBankroll] = useState("1000");
  const [entryValue, setEntryValue] = useState("10");
  const [payout, setPayout] = useState("87");
  const [stopGainMode, setStopGainMode] = useState<CalculationMode>("gross_value");
  const [stopGainValue, setStopGainValue] = useState("100");
  const [stopLossMode, setStopLossMode] = useState<CalculationMode>("gross_value");
  const [stopLossValue, setStopLossValue] = useState("50");
  const [martingale, setMartingale] = useState<MartingaleLevel>("none");
  const [assetModality, setAssetModality] = useState<AssetModality[]>(["binary"]);
  const [marketType, setMarketType] = useState<MarketType[]>(["open", "otc"]);
  const [strategies, setStrategies] = useState<string[]>(["otc"]);
  const [strategySearch, setStrategySearch] = useState("");
  const [customStrategiesList, setCustomStrategiesList] = useState<CustomStrategy[]>([]);
  const [realBalance, setRealBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [waitNextCandle, setWaitNextCandle] = useState(true);

  const toggleModality = (value: AssetModality) => {
    if (isRunning) return;
    setAssetModality((prev) => {
      const next = prev.includes(value) ? prev.filter((m) => m !== value) : [...prev, value];
      return next.length >= 1 ? next : prev;
    });
  };
  const toggleMarketType = (value: MarketType) => {
    if (isRunning) return;
    setMarketType((prev) => {
      const next = prev.includes(value) ? prev.filter((m) => m !== value) : [...prev, value];
      return next.length >= 1 ? next : prev;
    });
  };

  const toggleStrategy = (value: string) => {
    if (isRunning) return;
    setStrategies((prev) => {
      const next = prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value];
      return next.length >= 1 ? next : prev;
    });
  };

  // Buscar estratégias customizadas do usuário
  useEffect(() => {
    let cancelled = false;
    listCustomStrategies()
      .then((list) => {
        if (!cancelled) setCustomStrategiesList(list ?? []);
      })
      .catch(() => {
        if (!cancelled) setCustomStrategiesList([]);
      });
    return () => { cancelled = true; };
  }, []);

  // Buscar banca real da corretora quando conectado
  useEffect(() => {
    if (!isBrokerConnected) {
      setRealBalance(null);
      return;
    }
    let cancelled = false;
    setBalanceLoading(true);
    getBalances()
      .then((res) => {
        if (cancelled) return;
        const list = res?.balances;
        if (Array.isArray(list) && list.length > 0) {
          // Somar apenas conta real (type === 1). Ignorar demo/prática.
          const total = list
            .filter((b: { type?: number }) => b?.type === 1)
            .reduce((sum: number, b: { amount?: number }) => sum + (Number(b?.amount) || 0), 0);
          setRealBalance(total);
        } else {
          setRealBalance(null);
        }
      })
      .catch(() => {
        if (!cancelled) setRealBalance(null);
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false);
      });
    return () => { cancelled = true; };
  }, [isBrokerConnected]);

  // Carregar configuração salva no backend (por usuário)
  useEffect(() => {
    let cancelled = false;
    getPlatformBotConfig()
      .then((res) => {
        if (cancelled || !res?.config) return;
        const parsed = StrategyConfigSchema.safeParse(res.config);
        if (!parsed.success) return;
        const cfg = parsed.data;
        setBankroll(String(cfg.bankroll));
        setEntryValue(String(cfg.entryValue));
        setPayout(String(cfg.payout));
        setStopGainMode(cfg.stopGainMode);
        setStopGainValue(String(cfg.stopGainValue));
        setStopLossMode(cfg.stopLossMode);
        setStopLossValue(String(cfg.stopLossValue));
        setMartingale(cfg.martingale);
        if (cfg.assetModality?.length) setAssetModality(cfg.assetModality);
        if (cfg.marketType?.length) setMarketType(cfg.marketType);
        if (cfg.strategies?.length) {
          const valid = (cfg.strategies as string[]).filter((s) =>
            ["otc", "supertrend"].includes(s) || (typeof s === "string" && s.startsWith("custom:"))
          );
          setStrategies(valid.length ? valid : ["otc"]);
        }
        setWaitNextCandle((cfg as any).waitNextCandle ?? true);
      })
      .catch(() => {
        // ignore load errors; mantém defaults locais da tela
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const buildConfig = (): StrategyConfig | null => {
    const customStrategiesPayload = strategies
      .filter((s) => typeof s === "string" && s.startsWith("custom:"))
      .map((id) => {
        const uuid = id.replace("custom:", "");
        const custom = customStrategiesList.find((c) => c.id === uuid);
        return custom ? { id: custom.id, name: custom.name, code: custom.code, timeframe: custom.timeframe } : null;
      })
      .filter((c): c is { id: string; name: string; code: string; timeframe: "M1" | "M5" } => c !== null);

    const parsed = StrategyConfigSchema.safeParse({
      bankroll: Number(bankroll),
      entryValue: Number(entryValue),
      payout: Number(payout),
      stopGainMode,
      stopGainValue: Number(stopGainValue),
      stopLossMode,
      stopLossValue: Number(stopLossValue),
      martingale,
      assetModality,
      marketType,
      strategies,
      customStrategies: customStrategiesPayload,
      waitNextCandle,
    });

    if (!parsed.success) {
      toast.error("Configuração inválida. Verifique os campos.");
      return null;
    }

    return parsed.data;
  };

  const handleStart = () => {
    const cfg = buildConfig();
    if (!cfg) return;
    if (realBalance !== null && realBalance > 0) {
      cfg.bankroll = realBalance;
    }
    // Verifica se o saldo é suficiente para pelo menos uma entrada
    if (realBalance !== null && cfg.entryValue > realBalance) {
      toast.error(
        `Saldo insuficiente. Sua banca atual é R$ ${realBalance.toFixed(2)} e o valor de entrada é R$ ${cfg.entryValue.toFixed(2)}. Reduza o valor de entrada ou recarregue sua conta.`,
        { duration: 6000 }
      );
      return;
    }
    startBot(cfg);
    toast.success("Robô iniciado. Operando na corretora.");
    navigate("/");
  };

  const handleSave = async () => {
    const cfg = buildConfig();
    if (!cfg) return;
    try {
      await savePlatformBotConfig(cfg);
      toast.success("Estratégia salva no banco com sucesso!");
    } catch {
      toast.error("Falha ao salvar estratégia no banco.");
    }
  };

  const handleStop = () => {
    stopBot();
    toast.info("Robô parado.");
  };

  // Banca efetiva usada para cálculos (saldo real da corretora, se disponível; senão, bankroll configurado)
  const effectiveBankroll = (realBalance !== null && realBalance > 0 ? realBalance : Number(bankroll)) || 0;
  const stopGainPercent = Number(stopGainValue) || 0;
  const stopLossPercent = Number(stopLossValue) || 0;
  const stopGainTargetValue =
    stopGainMode === "percentage" && effectiveBankroll > 0 && stopGainPercent > 0
      ? (effectiveBankroll * stopGainPercent) / 100
      : null;
  const stopLossTargetValue =
    stopLossMode === "percentage" && effectiveBankroll > 0 && stopLossPercent > 0
      ? (effectiveBankroll * stopLossPercent) / 100
      : null;

  if (initializing) return <BotConfigSkeleton />;

  // Se não estiver conectado na corretora, mostra apenas o card de login (igual à Dashboard)
  if (!isBrokerConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in px-4">
        <div className="max-w-md w-full">
          <SafirionConnectCard />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {botError && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {botError}
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Configurar Robô
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Defina sua estratégia de operação
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            size="lg"
            onClick={handleSave}
            disabled={isRunning}
          >
            Salvar Estratégia
          </Button>
          {isRunning ? (
            <Button
              variant="destructive"
              size="lg"
              onClick={handleStop}
              className="gap-2 glow-destructive"
            >
              <Square className="h-4 w-4" />
              Parar Robô
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={handleStart}
              className="gap-2 glow-primary"
            >
              <Play className="h-4 w-4" />
              Iniciar Robô
            </Button>
          )}
        </div>
      </div>

      {/* Linha 1: 3 cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Bank management */}
        <Card className="glass-card">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <DollarSign className="h-5 w-5 text-primary" />
              Gestão de Banca
            </CardTitle>
            <CardDescription>Defina o valor de entrada</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isBrokerConnected && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                  Banca real (corretora)
                </p>
                {balanceLoading ? (
                  <p className="text-lg font-semibold tabular-nums text-foreground">Carregando…</p>
                ) : realBalance !== null ? (
                  <p className="text-lg font-semibold tabular-nums text-foreground">
                    R$ {formatBrl(realBalance)}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Não foi possível carregar o saldo.</p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="entry">Valor de Entrada (R$)</Label>
              <Input
                id="entry"
                type="number"
                value={entryValue}
                onChange={(e) => setEntryValue(e.target.value)}
                disabled={isRunning}
                className="font-mono"
              />
            </div>
          </CardContent>
        </Card>

        {/* Modalidade, mercado e entrada */}
        <Card className="glass-card">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Layers className="h-5 w-5 text-primary" />
              Modalidade e Mercado
            </CardTitle>
            <CardDescription>Escolha onde o robô pode operar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-6 text-xs">
              <div className="space-y-2">
                <p className="font-medium text-muted-foreground">Modalidade</p>
                <div className="space-y-2">
                  {MODALITY_OPTIONS.map((opt) => {
                    const checked = assetModality.includes(opt.value);
                    const disabled =
                      isRunning || (checked && assetModality.length === 1);
                    return (
                      <div
                        key={opt.value}
                        className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2"
                      >
                        <span className="text-[12px] text-foreground">
                          {opt.label}
                        </span>
                        <Switch
                          checked={checked}
                          onCheckedChange={() => toggleModality(opt.value)}
                          disabled={disabled}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <p className="font-medium text-muted-foreground">Mercado</p>
                <div className="space-y-2">
                  {MARKET_OPTIONS.map((opt) => {
                    const checked = marketType.includes(opt.value);
                    const disabled =
                      isRunning || (checked && marketType.length === 1);
                    return (
                      <div
                        key={opt.value}
                        className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2"
                      >
                        <span className="text-[12px] text-foreground">
                          {opt.label}
                        </span>
                        <Switch
                          checked={checked}
                          onCheckedChange={() => toggleMarketType(opt.value)}
                          disabled={disabled}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2.5">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-foreground">
                  Entrada na próxima vela
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Se ligado, o robô espera a abertura da próxima vela para entrar após o gatilho.
                </p>
              </div>
              <Switch
                checked={waitNextCandle}
                onCheckedChange={(v) => !isRunning && setWaitNextCandle(Boolean(v))}
                disabled={isRunning}
              />
            </div>
          </CardContent>
        </Card>

        {/* Estratégias */}
        <Card className="glass-card">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Layers className="h-5 w-5 text-primary" />
              Estratégias do robô
            </CardTitle>
            <CardDescription>Ative uma ou mais estratégias para buscar entradas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome..."
                value={strategySearch}
                onChange={(e) => setStrategySearch(e.target.value)}
                className="pl-8 h-9"
                disabled={isRunning}
              />
            </div>
            <div className="overflow-y-auto max-h-[220px] rounded-lg border border-border/60 pr-1 space-y-2">
              {STRATEGY_OPTIONS.filter(
                (opt) => !strategySearch.trim() || opt.label.toLowerCase().includes(strategySearch.trim().toLowerCase())
              ).map((opt) => {
                const checked = strategies.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${checked
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40 hover:bg-accent/20"
                      } ${isRunning ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleStrategy(opt.value)}
                      disabled={isRunning || (checked && strategies.length === 1)}
                      className="h-4 w-4 rounded-sm shrink-0"
                    />
                    <span className="text-sm font-medium text-foreground truncate flex-1 min-w-0">{opt.label}</span>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">M1</Badge>
                  </label>
                );
              })}
              {customStrategiesList
                .filter(
                  (c) =>
                    !strategySearch.trim() ||
                    c.name.toLowerCase().includes(strategySearch.trim().toLowerCase())
                )
                .map((custom) => {
                  const value = `custom:${custom.id}`;
                  const checked = strategies.includes(value);
                  return (
                    <label
                      key={value}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${checked
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40 hover:bg-accent/20"
                        } ${isRunning ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleStrategy(value)}
                        disabled={isRunning || (checked && strategies.length === 1)}
                        className="h-4 w-4 rounded-sm shrink-0"
                      />
                      <span className="text-sm font-medium text-foreground truncate flex items-center gap-1.5 min-w-0 flex-1">
                        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                        {custom.name}
                      </span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">{custom.timeframe}</Badge>
                    </label>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Linha 2: 3 cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Martingale */}
        <Card className="glass-card">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Layers className="h-5 w-5 text-primary" />
              Estratégia Martingale
            </CardTitle>
            <CardDescription>Defina o nível de martingale</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {MARTINGALE_OPTIONS.map((opt) => {
                const isSelected = martingale === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => !isRunning && setMartingale(opt.value)}
                    disabled={isRunning}
                    className={`p-4 rounded-lg border text-left transition-all duration-200 ${isSelected
                        ? "border-primary bg-primary/10 glow-primary"
                        : "border-border hover:border-primary/40 hover:bg-accent/30"
                      } ${isRunning ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {opt.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Stop Gain */}
        <Card className="glass-card">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-success" />
              Meta Diária (Stop Gain)
            </CardTitle>
            <CardDescription>Quando parar ao atingir o lucro</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Modo de Cálculo</Label>
              <Select
                value={stopGainMode}
                onValueChange={(v) => setStopGainMode(v as CalculationMode)}
                disabled={isRunning}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODE_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      <span className="flex items-center gap-2">
                        <m.icon className="h-3.5 w-3.5" />
                        {m.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sg-value">Valor Alvo</Label>
              <Input
                id="sg-value"
                type="number"
                value={stopGainValue}
                onChange={(e) => setStopGainValue(e.target.value)}
                disabled={isRunning}
                className="font-mono"
              />
              {stopGainTargetValue !== null && (
                <p className="text-xs text-muted-foreground">
                  Isso equivale a aproximadamente R$ {formatBrl(stopGainTargetValue)} de lucro sobre a banca atual.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stop Loss */}
        <Card className="glass-card">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingDown className="h-5 w-5 text-destructive" />
              Limite de Perda (Stop Loss)
            </CardTitle>
            <CardDescription>Quando parar para proteger a banca</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Modo de Cálculo</Label>
              <Select
                value={stopLossMode}
                onValueChange={(v) => setStopLossMode(v as CalculationMode)}
                disabled={isRunning}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODE_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      <span className="flex items-center gap-2">
                        <m.icon className="h-3.5 w-3.5" />
                        {m.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sl-value">Valor Limite</Label>
              <Input
                id="sl-value"
                type="number"
                value={stopLossValue}
                onChange={(e) => setStopLossValue(e.target.value)}
                disabled={isRunning}
                className="font-mono"
              />
              {stopLossTargetValue !== null && (
                <p className="text-xs text-muted-foreground">
                  Isso equivale a aproximadamente R$ {formatBrl(stopLossTargetValue)} de perda máxima na banca atual.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
