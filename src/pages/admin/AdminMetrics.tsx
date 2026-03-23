import { useEffect, useState, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { usePlatformAuth } from "@/contexts/PlatformAuthContext";
import { getPlatformToken } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users, Bot, TrendingUp, TrendingDown, Activity,
  RefreshCw, Wifi, BarChart3, CircleDollarSign, Percent,
} from "lucide-react";

interface Metrics {
  online_users: number;
  online_emails: string[];
  broker_sessions: number;
  running_bots: number;
  running_bots_detail: {
    email: string;
    platform_email: string | null;
    account_mode: string;
    total_profit: number;
    operations: number;
  }[];
  total_users: number;
  active_users: number;
  ops_today: number;
  wins_today: number;
  losses_today: number;
  profit_today: number;
  win_rate_today: number;
}

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  color = "text-primary",
  pulse = false,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color?: string;
  pulse?: boolean;
}) {
  return (
    <Card className="rounded-xl border border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 leading-tight">{title}</p>
            <p className={`text-2xl font-bold tabular-nums leading-none ${color}`}>{value}</p>
            {sub && <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{sub}</p>}
          </div>
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 ${color}`}>
            <Icon className={`h-4 w-4 ${pulse ? "animate-pulse" : ""}`} />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminMetricsPage() {
  const { user } = usePlatformAuth();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  if (!user || user.role !== "admin") return <Navigate to="/" replace />;

  const fetchMetrics = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const token = getPlatformToken();
      const r = await fetch("/api/platform/admin/metrics", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        setMetrics(await r.json());
        setLastUpdate(new Date());
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  if (!metrics) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] gap-2 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" /><span>Carregando métricas…</span>
      </div>
    );
  }

  const profitColor = metrics.profit_today >= 0 ? "text-green-500" : "text-red-500";
  const profitSign = metrics.profit_today >= 0 ? "+" : "";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Métricas em Tempo Real
          </h1>
          <p className="text-sm text-muted-foreground">
            Clique em Atualizar para recarregar os dados
            {lastUpdate && (
              <span className="ml-2 text-[11px]">
                — última atualização: {lastUpdate.toLocaleTimeString("pt-BR")}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => fetchMetrics(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* Cards principais */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          title="Usuários Online"
          value={metrics.online_users}
          sub="últimos 90s"
          icon={Wifi}
          color="text-green-500"
          pulse={metrics.online_users > 0}
        />
        <StatCard
          title="Robôs Rodando"
          value={metrics.running_bots}
          sub={`${metrics.broker_sessions} conectados à corretora`}
          icon={Bot}
          color="text-primary"
          pulse={metrics.running_bots > 0}
        />
        <StatCard
          title="Total de Usuários"
          value={metrics.total_users}
          sub={`${metrics.active_users} ativos`}
          icon={Users}
          color="text-primary"
        />
        <StatCard
          title="Operações Hoje"
          value={metrics.ops_today}
          sub={`${metrics.wins_today}W / ${metrics.losses_today}L`}
          icon={BarChart3}
          color="text-primary"
        />
        <StatCard
          title="Win Rate Hoje"
          value={`${metrics.win_rate_today}%`}
          sub={metrics.ops_today > 0 ? `${metrics.ops_today} ops` : "sem operações"}
          icon={Percent}
          color={metrics.win_rate_today >= 50 ? "text-green-500" : "text-red-500"}
        />
        <StatCard
          title="Lucro Total Hoje"
          value={`${profitSign}R$ ${Math.abs(metrics.profit_today).toFixed(2).replace(".", ",")}`}
          sub="todas as contas REAL"
          icon={metrics.profit_today >= 0 ? TrendingUp : TrendingDown}
          color={profitColor}
        />
      </div>

      {/* Robôs ativos — detalhamento */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Bot className="h-4 w-4" />
          Robôs em execução ({metrics.running_bots})
        </h2>
        {metrics.running_bots_detail.length === 0 ? (
          <Card className="rounded-xl border border-border">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Nenhum robô em execução no momento.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {metrics.running_bots_detail.map((bot) => (
              <Card key={bot.email} className="rounded-xl border border-border">
                <CardContent className="p-4 flex items-center gap-4">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{bot.platform_email ?? bot.email}</p>
                    {bot.platform_email && (
                      <p className="text-xs text-muted-foreground truncate">Corretora: {bot.email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-right">
                    <div>
                      <p className="text-xs text-muted-foreground">Operações</p>
                      <p className="text-sm font-bold tabular-nums">{bot.operations}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Lucro</p>
                      <p className={`text-sm font-bold tabular-nums ${bot.total_profit >= 0 ? "text-green-500" : "text-red-500"}`}>
                        {bot.total_profit >= 0 ? "+" : ""}R$ {Math.abs(bot.total_profit).toFixed(2).replace(".", ",")}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-bold ${bot.account_mode === "PRACTICE" ? "border-yellow-500/50 text-yellow-500 bg-yellow-500/10" : "border-green-500/50 text-green-500 bg-green-500/10"}`}
                    >
                      {bot.account_mode === "PRACTICE" ? "DEMO" : "REAL"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Usuários online */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Wifi className="h-4 w-4" />
          Usuários online agora ({metrics.online_users})
        </h2>
        <Card className="rounded-xl border border-border">
          {metrics.online_emails.length === 0 ? (
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Nenhum usuário online no momento.
            </CardContent>
          ) : (
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {metrics.online_emails.slice(0, 10).map((email, i) => (
                  <div key={email} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-xs text-muted-foreground w-5 shrink-0 tabular-nums">{i + 1}</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                    <span className="text-sm text-foreground">{email}</span>
                  </div>
                ))}
                {metrics.online_emails.length > 10 && (
                  <div className="px-4 py-2.5 text-xs text-muted-foreground">
                    +{metrics.online_emails.length - 10} outros online
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
