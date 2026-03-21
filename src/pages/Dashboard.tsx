import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useBot } from "@/modules/bot/BotProvider";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SafirionConnectCard } from "@/components/SafirionConnectCard";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DashboardSkeleton } from "@/components/skeletons/PageSkeletons";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  BarChart3,
  Play,
  Settings,
  Zap,
  Smile,
  Frown,
  Pause,
  Bell,
  RotateCcw,
} from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useHideBalance } from "@/contexts/HideBalanceContext";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { formatBrl } from "@/lib/utils";
import type { OperationLog } from "@/modules/bot/schemas";

/** Agrupa operações em ciclos de martingale (cada ciclo começa em MG0 e vai até o fechamento). Retorna entradas, wins e losses por ciclo. */
function cycleStats(ops: OperationLog[]): { entradas: number; wins: number; losses: number } {
  const cycles: OperationLog[][] = [];
  let current: OperationLog[] = [];
  for (const op of ops) {
    if (op.martingaleLevel === 0 && current.length > 0) {
      cycles.push(current);
      current = [];
    }
    current.push(op);
  }
  if (current.length > 0) cycles.push(current);

  const wins = cycles.filter((c) => c[c.length - 1].result === "win").length;
  const losses = cycles.filter((c) => c[c.length - 1].result === "loss").length;
  // Empate não conta como entrada (como se não tivesse feito nada)
  const entradas = cycles.filter((c) => {
    const last = c[c.length - 1].result;
    return last === "win" || last === "loss";
  }).length;
  return { entradas, wins, losses };
}

export default function DashboardPage() {
  const { status, stopReason, operations, totalProfit, currentBalance, config, stopBot, resetBot, showLiveWidget, setShowLiveWidget, initializing } = useBot();
  const { isAuthenticated: isBrokerConnected } = useAuth();
  const navigate = useNavigate();
  const { status: pushStatus, error: pushError, enable: enablePush } = usePushNotifications();
  const { hideBalance } = useHideBalance();
  const isRunning = status === "running";
  const isStopped = status === "stopped";
  const stoppedByTarget = isStopped && (stopReason === "stop_gain" || stopReason === "stop_loss");

  const location = useLocation();

  // Força atualização quando navega para o dashboard após iniciar robô
  useEffect(() => {
    if (location.pathname === "/" && isBrokerConnected) {
      // Pequeno delay para garantir que o status seja atualizado após navegação
      const timer = setTimeout(() => {
        // O WebSocket já deve ter atualizado, mas isso força uma verificação
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [location.pathname, isBrokerConnected]);

  // Build chart data: um ponto por CICLO COMPLETO de martingale.
  // Entradas intermediárias de gale (nível > 0 ainda em andamento) não geram ponto no gráfico —
  // só o resultado final do ciclo (win em qualquer nível, ou loss na última tentativa).
  const chartData = (() => {
    const startBalance = currentBalance != null ? currentBalance - totalProfit : null;
    const points: { op: number; balance: number; profit: number }[] = startBalance != null
      ? [{ op: 0, balance: startBalance, profit: 0 }]
      : [];
    let cumulativeProfit = 0;
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      if (op.result === "pending") continue; // ignora operações ainda abertas
      const next = operations[i + 1];
      // Ciclo termina quando:
      // 1) resultado é "win" (qualquer nível encerra o ciclo)
      // 2) próxima operação começa em nível 0 (este foi o último gale)
      // 3) não há próxima operação (última op da sessão)
      const isLastOfCycle = op.result === "win" || !next || next.martingaleLevel === 0;
      cumulativeProfit += op.profit;
      if (isLastOfCycle) {
        points.push({ op: points.length, balance: op.balanceAfter, profit: cumulativeProfit });
      }
    }
    return points;
  })();

  // WIN/LOSS/Entradas por ciclo de martingale (1 ciclo = 1 entrada; resultado do ciclo = última op do ciclo)
  const { entradas, wins, losses } = cycleStats(operations);
  const winRate = entradas > 0 ? ((wins / entradas) * 100).toFixed(1) : "0.0";

  const getStrategyName = (strategy?: string) => {
    if (!strategy) return "—";

    // built-in
    const builtIn: Record<string, string> = {
      otc: "Sniper",
      supertrend: "Titan",
    };

    if (builtIn[strategy]) return builtIn[strategy];

    // custom:uuid
    if (strategy.startsWith("custom:")) {
      const custom = config?.customStrategies?.find((cs) => `custom:${cs.id}` === strategy);
      return custom ? custom.name : "Custom";
    }

    // fallback: retorna o nome bruto capitalizado se não reconhecido
    return strategy.charAt(0).toUpperCase() + strategy.slice(1);
  };

  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const renderCellResult = (op: OperationLog) => {
    if (op.result === "pending") {
      const durationMs = (op.duration || 1) * 60 * 1000;
      const tsMs = op.timestamp.getTime();
      // Próxima fronteira da vela (ex: M1 → próximo minuto cheio, M5 → próximo múltiplo de 5min)
      const endTime = Math.ceil((tsMs + 1) / durationMs) * durationMs;
      const diff = Math.max(0, Math.floor((endTime - now.getTime()) / 1000));

      if (diff === 0) return <span className="animate-pulse">Aguardando...</span>;

      const minutes = Math.floor(diff / 60);
      const seconds = diff % 60;
      return (
        <span className="font-mono text-warning font-semibold">
          {minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, "0")}` : `${seconds}s`}
        </span>
      );
    }

    const configs = {
      win: { label: "WIN", style: "border-success/40 text-success bg-success/5" },
      loss: { label: "LOSS", style: "border-destructive/40 text-destructive bg-destructive/5" },
      draw: { label: "EMPATE", style: "border-blue-500/40 text-blue-500 bg-blue-500/10" },
    };

    const config = configs[op.result as keyof typeof configs];
    if (!config) return "—";

    return (
      <Badge variant="outline" className={`text-[10px] font-bold ${config.style} px-2 py-0.5`}>
        {config.label}
      </Badge>
    );
  };

  const stats = [
    {
      title: "Saldo Atual",
      value: hideBalance ? "R$ ••••••" : `R$ ${formatBrl(currentBalance)}`,
      icon: DollarSign,
      color: "text-white",
    },
    {
      title: "Lucro/Prejuízo",
      value: `R$ ${formatBrl(totalProfit)}`,
      icon: totalProfit >= 0 ? TrendingUp : TrendingDown,
      color: totalProfit >= 0 ? "text-success" : "text-destructive",
    },
    {
      title: "Win Rate",
      value: `${winRate}%`,
      icon: Target,
      color: "text-white",
    },
    {
      title: "Entradas",
      value: `${entradas}`,
      icon: BarChart3,
      color: "text-white",
    },
    {
      title: "Wins",
      value: `${wins}`,
      icon: Smile,
      color: "text-success",
    },
    {
      title: "Loss",
      value: `${losses}`,
      icon: Frown,
      color: "text-destructive",
    },
  ];

  if (initializing) return <DashboardSkeleton />;

  // PRIORIDADE 1: Dashboard quando o robô está operando (sempre mostra primeiro)
  if (isRunning) {
    return (
      <div className="space-y-5 animate-fade-in">
        {/* Área de operação + status em linha */}
        <div className="space-y-5">
          <div className="space-y-5">
            {/* Card Área de operação / Status */}
            <Card className="relative rounded-xl border border-border bg-card overflow-hidden border-neon">
              {/* Badge REAL/DEMO — canto superior direito, pequeno */}
              {config?.accountMode === "PRACTICE" ? (
                <div className="absolute top-2.5 right-3 inline-flex items-center gap-1 rounded-md border border-yellow-500/50 bg-yellow-500/10 px-1.5 py-0.5">
                  <span className="h-1 w-1 rounded-full bg-yellow-400" />
                  <span className="text-[10px] font-bold tracking-wide text-yellow-400">DEMO</span>
                </div>
              ) : (
                <div className="absolute top-2.5 right-3 inline-flex items-center gap-1 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-1.5 py-0.5">
                  <span className="h-1 w-1 rounded-full bg-emerald-400" />
                  <span className="text-[10px] font-bold tracking-wide text-emerald-400">REAL</span>
                </div>
              )}
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <img
                      src="/bot.gif"
                      alt="Nexus Bot"
                      className="hidden sm:block h-10 w-10 object-contain"
                    />
                    <div>
                      <h2 className="font-display-ai text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" />
                        Área de operação
                      </h2>
                      <p className="font-display-ai text-base font-semibold text-foreground mt-1 tracking-wide">
                        Operações 100% automáticas
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="inline-flex items-center gap-2 rounded-lg bg-primary/15 border border-primary/30 px-3 py-2 shadow-[0_0_12px_hsl(var(--primary)_/_0.15)]">
                      <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                      <span className="text-sm font-semibold text-primary">Robô operando</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className={`rounded-lg text-xs font-semibold px-3 py-2 gap-1.5 ${showLiveWidget ? "border-primary text-primary bg-primary/10" : "border-border"}`}
                      onClick={() => setShowLiveWidget((v) => !v)}
                      title="Widget de marketing ao vivo"
                    >
                      📡 {showLiveWidget ? "Widget Ativo" : "Live Widget"}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="rounded-lg text-xs font-semibold px-3 py-2 gap-1.5"
                      onClick={stopBot}
                    >
                      <Pause className="h-3.5 w-3.5" />
                      Parar robô
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
              {stats.map((stat) => (
                <Card
                  key={stat.title}
                  className="rounded-xl border border-border bg-card overflow-hidden transition-colors hover:border-border"
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                          {stat.title}
                        </p>
                        <p className={`text-lg font-bold tabular-nums tracking-tight ${stat.color}`}>
                          {stat.value}
                        </p>
                      </div>
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${stat.color === "text-success" ? "bg-success/15" : stat.color === "text-destructive" ? "bg-destructive/15" : "bg-primary/15"
                          }`}
                      >
                        <stat.icon className={`h-4 w-4 ${stat.color}`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Gráfico */}
            {chartData.length > 0 && (
              <Card className="rounded-xl border border-border bg-card overflow-hidden">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2 text-foreground">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Performance da sessão
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  <div className="h-64 rounded-lg bg-muted/20 border border-border/50">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="profitGradLive" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(142, 76%, 46%)" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="hsl(142, 76%, 46%)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="op"
                          tick={{ fontSize: 10, fill: "hsl(218, 11%, 55%)" }}
                          axisLine={{ stroke: "hsl(222, 22%, 14%)" }}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "hsl(218, 11%, 55%)" }}
                          axisLine={{ stroke: "hsl(222, 22%, 14%)" }}
                          tickFormatter={(v) => `R$ ${formatBrl(Number(v))}`}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "hsl(222, 28%, 8%)",
                            border: "1px solid hsl(222, 22%, 14%)",
                            borderRadius: "8px",
                            fontSize: "12px",
                          }}
                          formatter={(value: number) => [`R$ ${formatBrl(value)}`, "Lucro acumulado"]}
                        />
                        <Area
                          type="monotone"
                          dataKey="profit"
                          stroke="hsl(142, 76%, 46%)"
                          strokeWidth={2}
                          fill="url(#profitGradLive)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Histórico de operações */}
            <Card className="rounded-xl border border-border bg-card overflow-hidden">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2 text-foreground">
                  <Activity className="h-4 w-4 text-primary" />
                  Histórico de operações
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {operations.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-10">
                    Aguardando primeiras entradas do robô...
                  </p>
                ) : (
                  <div className="overflow-auto max-h-[26rem] rounded-lg border border-border/50">
                    <Table className="table-fixed w-full">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent border-b border-border">
                          <TableHead className="w-[64px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3">
                            Horário
                          </TableHead>
                          <TableHead className="w-[120px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3">
                            Ativo
                          </TableHead>
                          <TableHead className="w-[170px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3">
                            Estratégia
                          </TableHead>
                          <TableHead className="w-[72px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3 text-center">
                            Direção
                          </TableHead>
                          <TableHead className="w-[96px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3 text-right">
                            Entrada
                          </TableHead>
                          <TableHead className="w-[72px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3 text-center">
                            Gale
                          </TableHead>
                          <TableHead className="w-[88px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3 text-center">
                            Resultado
                          </TableHead>
                          <TableHead className="w-[96px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3 text-right">
                            Lucro
                          </TableHead>
                          <TableHead className="w-[112px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3 text-right">
                            Saldo
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...operations]
                          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                          .slice(0, 40)
                          .map((op) => (
                            <TableRow key={op.id} className="animate-fade-in hover:bg-muted/30">
                              <TableCell className="w-[64px] text-xs font-medium tabular-nums text-muted-foreground py-2.5">
                                {op.timestamp.toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </TableCell>
                              <TableCell className="w-[120px] text-xs font-medium py-2.5">
                                {op.asset}
                              </TableCell>
                              <TableCell className="w-[170px] text-[11px] text-muted-foreground py-2.5">
                                {getStrategyName(op.strategy)}
                              </TableCell>
                              <TableCell className="w-[72px] py-2.5 text-center">
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] font-medium ${op.direction === "call" ? "border-success/40 text-success" : "border-destructive/40 text-destructive"
                                    }`}
                                >
                                  {op.direction === "call" ? "CALL ↑" : "PUT ↓"}
                                </Badge>
                              </TableCell>
                              <TableCell className="w-[96px] text-xs font-medium tabular-nums text-right py-2.5">
                                R$ {formatBrl(op.entryValue)}
                              </TableCell>
                              <TableCell className="w-[72px] py-2.5 text-center">
                                {op.martingaleLevel > 0 ? (
                                  <Badge variant="secondary" className="text-[10px] font-medium">MG{op.martingaleLevel}</Badge>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="w-[90px] py-2.5 text-center">
                                {renderCellResult(op)}
                              </TableCell>
                              <TableCell
                                className={`w-[96px] text-xs font-semibold tabular-nums text-right py-2.5 ${op.result === "pending"
                                    ? "text-muted-foreground"
                                    : op.result === "draw"
                                      ? "text-blue-500"
                                      : op.profit >= 0
                                        ? "text-success"
                                        : "text-destructive"
                                  }`}
                              >
                                {op.result === "pending"
                                  ? "—"
                                  : op.result === "draw"
                                    ? "R$ 0"
                                    : `${op.profit >= 0 ? "+" : ""}R$ ${formatBrl(op.profit)}`}
                              </TableCell>
                              <TableCell className="w-[112px] text-xs font-medium tabular-nums text-right py-2.5">
                                R$ {formatBrl(op.balanceAfter)}
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // PRIORIDADE 2: Não conectado na corretora — sempre mostra o card de login
  if (!isBrokerConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in px-4">
        <div className="relative mb-6">
          <img
            src="/bot.gif"
            alt="Nexus Bot"
            className="h-20 w-20 object-contain"
          />
        </div>
        <p className="text-sm text-muted-foreground mb-8">Conecte à corretora para começar</p>
        <div className="w-full max-w-md">
          <SafirionConnectCard />
        </div>
      </div>
    );
  }

  // PRIORIDADE 3: Estado: conectado na corretora mas robô não ligado
  if (!isRunning && isBrokerConnected && (status === "idle" || status === "stopped")) {
    return (
      <div className="space-y-5 animate-fade-in">
        {/* Stop Gain / Stop Loss no topo quando parou por meta; senão aguardando ligação */}
        {stoppedByTarget && stopReason === "stop_gain" && (
          <Card className="rounded-xl border border-primary/40 bg-primary/10 overflow-hidden">
            <CardContent className="flex items-center gap-4 py-5 px-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                <Smile className="h-7 w-7" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold tracking-tight text-primary">Stop Gain atingido</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  O robô parou porque a meta de lucro foi alcançada. Parabéns!
                </p>
              </div>
              <Button size="sm" className="gap-1.5 rounded-lg shrink-0" onClick={resetBot}>
                <RotateCcw className="h-3.5 w-3.5" />
                Resetar
              </Button>
            </CardContent>
          </Card>
        )}
        {stoppedByTarget && stopReason === "stop_loss" && (
          <Card className="rounded-xl border border-destructive/40 bg-destructive/10 overflow-hidden">
            <CardContent className="flex items-center gap-4 py-5 px-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-destructive/20 text-destructive">
                <Frown className="h-7 w-7" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold tracking-tight text-destructive">Stop Loss atingido</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  O robô parou para proteger a banca. Revise a estratégia e inicie quando quiser.
                </p>
              </div>
              <Button size="sm" className="gap-1.5 rounded-lg shrink-0" onClick={resetBot}>
                <RotateCcw className="h-3.5 w-3.5" />
                Resetar
              </Button>
            </CardContent>
          </Card>
        )}
        {!stoppedByTarget && (
          <Card className="rounded-xl border border-primary/30 bg-card overflow-hidden">
            <CardContent className="flex flex-col items-center justify-center py-12 px-4">
              <div className="relative mb-6">
                <img
                  src="/bot.gif"
                  alt="Nexus Bot"
                  className="h-24 w-24 object-contain"
                />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground mb-2">
                Aguardando ligação do robô
              </h2>
              <p className="text-sm text-muted-foreground text-center mb-6 max-w-md">
                Você está conectado à corretora. Configure e ligue o robô para começar a operar automaticamente.
              </p>
              <Button
                size="lg"
                className="gap-2 rounded-lg"
                onClick={() => navigate("/bot-config")}
              >
                <Play className="h-4 w-4" />
                Configurar e ligar robô
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Mostra histórico se houver operações anteriores */}
        {operations.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-foreground">Dashboard</h1>
                <p className="text-muted-foreground text-sm mt-0.5">Monitoramento em tempo real</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
              {stats.map((stat) => (
                <Card key={stat.title} className="rounded-xl border border-border bg-card overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{stat.title}</p>
                        <p className={`text-lg font-bold tabular-nums tracking-tight ${stat.color}`}>{stat.value}</p>
                      </div>
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${stat.color === "text-success" ? "bg-success/15" : stat.color === "text-destructive" ? "bg-destructive/15" : "bg-primary/15"
                          }`}
                      >
                        <stat.icon className={`h-4 w-4 ${stat.color}`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {chartData.length > 0 && (
              <Card className="rounded-xl border border-border bg-card overflow-hidden">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2 text-foreground">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Performance
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  <div className="h-64 rounded-lg bg-muted/20 border border-border/50 overflow-hidden">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(142, 76%, 46%)" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="hsl(142, 76%, 46%)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="op" tick={{ fontSize: 10, fill: "hsl(218, 11%, 55%)" }} axisLine={{ stroke: "hsl(222, 22%, 14%)" }} />
                        <YAxis tick={{ fontSize: 10, fill: "hsl(218, 11%, 55%)" }} axisLine={{ stroke: "hsl(222, 22%, 14%)" }} tickFormatter={(v) => `R$ ${formatBrl(Number(v))}`} />
                        <Tooltip
                          contentStyle={{ background: "hsl(222, 28%, 8%)", border: "1px solid hsl(222, 22%, 14%)", borderRadius: "8px", fontSize: "12px" }}
                          formatter={(value: number) => [`R$ ${formatBrl(value)}`, "Lucro"]}
                        />
                        <Area type="monotone" dataKey="profit" stroke="hsl(142, 76%, 46%)" strokeWidth={2} fill="url(#profitGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="rounded-xl border border-border bg-card overflow-hidden">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2 text-foreground">
                  <Activity className="h-4 w-4 text-primary" />
                  Histórico de operações
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="overflow-auto max-h-[26rem] rounded-lg border border-border/50">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent border-b border-border">
                        <TableHead className="w-[70px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3">
                          Horário
                        </TableHead>
                        <TableHead className="w-[120px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3">
                          Ativo
                        </TableHead>
                        <TableHead className="w-[170px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3">
                          Estratégia
                        </TableHead>
                        <TableHead className="w-[72px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3 text-center">
                          Direção
                        </TableHead>
                        <TableHead className="w-[96px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3 text-right">
                          Entrada
                        </TableHead>
                        <TableHead className="w-[72px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3 text-center">
                          Gale
                        </TableHead>
                        <TableHead className="w-[88px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3 text-center">
                          Resultado
                        </TableHead>
                        <TableHead className="w-[96px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3 text-right">
                          Lucro
                        </TableHead>
                        <TableHead className="w-[112px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3 text-right">
                          Saldo
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...operations]
                        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                        .slice(0, 50)
                        .map((op) => (
                          <TableRow key={op.id} className="animate-fade-in hover:bg-muted/30">
                            <TableCell className="w-[70px] text-xs font-medium tabular-nums text-muted-foreground py-2.5">
                              {op.timestamp.toLocaleTimeString("pt-BR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </TableCell>
                            <TableCell className="w-[120px] text-xs font-medium py-2.5">
                              {op.asset}
                            </TableCell>
                            <TableCell className="w-[170px] text-[11px] text-muted-foreground py-2.5">
                              {getStrategyName(op.strategy)}
                            </TableCell>
                            <TableCell className="w-[72px] py-2.5 text-center">
                              <Badge variant="outline" className={`text-[10px] font-medium ${op.direction === "call" ? "border-success/40 text-success" : "border-destructive/40 text-destructive"}`}>
                                {op.direction === "call" ? "CALL ↑" : "PUT ↓"}
                              </Badge>
                            </TableCell>
                            <TableCell className="w-[96px] text-xs font-medium tabular-nums text-right py-2.5">
                              R$ {formatBrl(op.entryValue)}
                            </TableCell>
                            <TableCell className="w-[72px] py-2.5 text-center">
                              {op.martingaleLevel > 0 ? <Badge variant="secondary" className="text-[10px] font-medium">MG{op.martingaleLevel}</Badge> : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="w-[88px] py-2.5 text-center">
                              {renderCellResult(op)}
                            </TableCell>
                            <TableCell
                              className={`w-[96px] text-xs font-semibold tabular-nums text-right py-2.5 ${op.result === "pending"
                                  ? "text-muted-foreground"
                                  : op.result === "draw"
                                    ? "text-blue-500"
                                    : op.profit >= 0
                                      ? "text-success"
                                      : "text-destructive"
                                }`}
                            >
                              {op.result === "pending"
                                ? "—"
                                : op.result === "draw"
                                  ? "R$ 0"
                                  : `${op.profit >= 0 ? "+" : ""}R$ ${formatBrl(op.profit)}`}
                            </TableCell>
                            <TableCell className="w-[112px] text-xs font-medium tabular-nums text-right py-2.5">
                              R$ {formatBrl(op.balanceAfter)}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    );
  }


  return (
    <div className="space-y-5 animate-fade-in">
      {/* Stop Gain / Stop Loss */}
      {stoppedByTarget && stopReason === "stop_gain" && (
        <Card className="rounded-xl border border-primary/40 bg-primary/10 overflow-hidden">
          <CardContent className="flex items-center gap-4 py-5 px-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
              <Smile className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold tracking-tight text-primary">Stop Gain atingido</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                O robô parou porque a meta de lucro foi alcançada. Parabéns!
              </p>
            </div>
            <Button size="sm" className="gap-1.5 rounded-lg shrink-0" onClick={resetBot}>
              <RotateCcw className="h-3.5 w-3.5" />
              Resetar
            </Button>
          </CardContent>
        </Card>
      )}
      {stoppedByTarget && stopReason === "stop_loss" && (
        <Card className="rounded-xl border border-destructive/40 bg-destructive/10 overflow-hidden">
          <CardContent className="flex items-center gap-4 py-5 px-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-destructive/20 text-destructive">
              <Frown className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold tracking-tight text-destructive">Stop Loss atingido</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                O robô parou para proteger a banca. Revise a estratégia e inicie quando quiser.
              </p>
            </div>
            <Button size="sm" className="gap-1.5 rounded-lg shrink-0" onClick={resetBot}>
              <RotateCcw className="h-3.5 w-3.5" />
              Resetar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Card de conexão só quando o robô nunca foi iniciado (idle) */}
      {status === "idle" && <SafirionConnectCard />}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Monitoramento em tempo real</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-lg text-xs font-medium px-3 gap-1.5"
            onClick={() => {
              enablePush(
                () => toast.success("Notificações ativadas! Você receberá avisos no celular."),
                (msg) => toast.error(msg)
              );
            }}
            title={pushStatus === "subscribed" ? "Notificações ativadas" : "Receber notificações no celular (PWA)"}
          >
            <Bell className="h-3.5 w-3.5" />
            {pushStatus === "subscribed" ? "Notificações ativas" : "Ativar notificações"}
          </Button>
          {isStopped && (
            <Badge
              variant="secondary"
              className="h-8 px-3 inline-flex items-center text-xs font-medium rounded-lg"
            >
              Sessão encerrada
            </Badge>
          )}
          {status !== "running" && (
            <Button
              size="sm"
              className="h-8 rounded-lg text-xs font-semibold px-3 gap-1.5"
              onClick={() => navigate("/bot-config")}
            >
              <Play className="h-3.5 w-3.5" />
              Ligar robô
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {stats.map((stat) => (
          <Card key={stat.title} className="rounded-xl border border-border bg-card overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{stat.title}</p>
                  <p className={`text-lg font-bold tabular-nums tracking-tight ${stat.color}`}>{stat.value}</p>
                </div>
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${stat.color === "text-success" ? "bg-success/15" : stat.color === "text-destructive" ? "bg-destructive/15" : "bg-primary/15"
                    }`}
                >
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {chartData.length > 0 && (
        <Card className="rounded-xl border border-border bg-card overflow-hidden">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2 text-foreground">
              <BarChart3 className="h-4 w-4 text-primary" />
              Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="h-64 rounded-lg bg-muted/20 border border-border/50 overflow-hidden">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142, 76%, 46%)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(142, 76%, 46%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="op" tick={{ fontSize: 10, fill: "hsl(218, 11%, 55%)" }} axisLine={{ stroke: "hsl(222, 22%, 14%)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(218, 11%, 55%)" }} axisLine={{ stroke: "hsl(222, 22%, 14%)" }} tickFormatter={(v) => `R$ ${formatBrl(Number(v))}`} />
                  <Tooltip
                    contentStyle={{ background: "hsl(222, 28%, 8%)", border: "1px solid hsl(222, 22%, 14%)", borderRadius: "8px", fontSize: "12px" }}
                    formatter={(value: number) => [`R$ ${formatBrl(value)}`, "Lucro"]}
                  />
                  <Area type="monotone" dataKey="profit" stroke="hsl(142, 76%, 46%)" strokeWidth={2} fill="url(#profitGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-xl border border-border bg-card overflow-hidden">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2 text-foreground">
            <Activity className="h-4 w-4 text-primary" />
            Histórico de operações
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {operations.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-10">Aguardando operações...</p>
          ) : (
            <div className="overflow-auto max-h-[26rem] rounded-lg border border-border/50">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-border">
                    <TableHead className="w-[70px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3">
                      Horário
                    </TableHead>
                    <TableHead className="w-[120px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3">
                      Ativo
                    </TableHead>
                    <TableHead className="w-[170px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3">
                      Estratégia
                    </TableHead>
                    <TableHead className="w-[72px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3 text-center">
                      Direção
                    </TableHead>
                    <TableHead className="w-[96px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3 text-right">
                      Entrada
                    </TableHead>
                    <TableHead className="w-[72px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3 text-center">
                      Gale
                    </TableHead>
                    <TableHead className="w-[88px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3 text-center">
                      Resultado
                    </TableHead>
                    <TableHead className="w-[96px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3 text-right">
                      Lucro
                    </TableHead>
                    <TableHead className="w-[112px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-3 text-right">
                      Saldo
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...operations]
                    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                    .slice(0, 50)
                    .map((op) => (
                      <TableRow key={op.id} className="animate-fade-in hover:bg-muted/30">
                        <TableCell className="w-[70px] text-xs font-medium tabular-nums text-muted-foreground py-2.5">
                          {op.timestamp.toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="w-[120px] text-xs font-medium py-2.5">
                          {op.asset}
                        </TableCell>
                        <TableCell className="w-[170px] text-[11px] text-muted-foreground py-2.5">
                          {getStrategyName(op.strategy)}
                        </TableCell>
                        <TableCell className="w-[72px] py-2.5 text-center">
                          <Badge variant="outline" className={`text-[10px] font-medium ${op.direction === "call" ? "border-success/40 text-success" : "border-destructive/40 text-destructive"}`}>
                            {op.direction === "call" ? "CALL ↑" : "PUT ↓"}
                          </Badge>
                        </TableCell>
                        <TableCell className="w-[96px] text-xs font-medium tabular-nums text-right py-2.5">
                          R$ {formatBrl(op.entryValue)}
                        </TableCell>
                        <TableCell className="w-[72px] py-2.5 text-center">
                          {op.martingaleLevel > 0 ? <Badge variant="secondary" className="text-[10px] font-medium">MG{op.martingaleLevel}</Badge> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="w-[88px] py-2.5 text-center">
                          {renderCellResult(op)}
                        </TableCell>
                        <TableCell
                          className={`w-[96px] text-xs font-semibold tabular-nums text-right py-2.5 ${op.result === "pending"
                              ? "text-muted-foreground"
                              : op.result === "draw"
                                ? "text-blue-500"
                                : op.profit >= 0
                                  ? "text-success"
                                  : "text-destructive"
                            }`}
                        >
                          {op.result === "pending"
                            ? "—"
                            : op.result === "draw"
                              ? "R$ 0"
                              : `${op.profit >= 0 ? "+" : ""}R$ ${formatBrl(op.profit)}`}
                        </TableCell>
                        <TableCell className="w-[112px] text-xs font-medium tabular-nums text-right py-2.5">
                          R$ {formatBrl(op.balanceAfter)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
