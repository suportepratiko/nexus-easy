import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePlatformAuth } from "@/contexts/PlatformAuthContext";
import { getPublicRanking, type PublicRankingItem } from "@/lib/api/ranking";
import { formatBrl } from "@/lib/utils";
import { Smartphone, Banknote, Medal, Zap, Users, User, Crown } from "lucide-react";
import { RankingSkeleton } from "@/components/skeletons/PageSkeletons";
import { cn } from "@/lib/utils";

const PREMIOS_MES = [
  { posicao: 1, label: "1º lugar", premio: "iPhone 17 Pro Max", icon: Smartphone, gradient: "bg-gradient-to-br from-amber-400 to-yellow-600" },
  { posicao: 2, label: "2º lugar", premio: "R$ 3.000,00", icon: Banknote, gradient: "bg-gradient-to-br from-slate-300 to-slate-500" },
  { posicao: 3, label: "3º lugar", premio: "R$ 1.500,00", icon: Medal, gradient: "bg-gradient-to-br from-amber-600 to-amber-800" },
];

function formatPeriod(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    return s.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

export default function RankingPage() {
  const { user } = usePlatformAuth();
  const isAdmin = (user?.role ?? "").toLowerCase() === "admin";
  const [data, setData] = useState<{ items: PublicRankingItem[]; period_start: string; period_end: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    try {
      const res = await getPublicRanking("current_month");
      setData({ items: res.items, period_start: res.period_start, period_end: res.period_end });
    } catch (e) {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!data) return;
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [data]);

  if (loading && !data) return <RankingSkeleton />;

  const items = data?.items ?? [];
  const periodLabel = data ? formatPeriod(data.period_start, data.period_end) : "";

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Ranking do mês
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {periodLabel ? `Números zerados a cada virada do mês · ${periodLabel}` : "Acompanhe os melhores resultados."}
        </p>
      </header>

      {/* Premiação do mês — top 3 */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Premiação do mês
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PREMIOS_MES.map((p, i) => (
            <Card
              key={p.posicao}
              className={cn(
                "rounded-xl border overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-lg border-white/20 text-white",
                p.gradient
              )}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20">
                    <p.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-medium opacity-90">{p.label}</p>
                    <p className="font-bold text-lg">{p.premio}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Lista do ranking */}
      <section>
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Classificação
          </h2>
          {data && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Zap className="h-3.5 w-3.5 text-primary animate-pulse" />
              Atualização automática
            </span>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="divide-y divide-border">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Users className="h-12 w-12 mb-3 opacity-50" />
                <p className="text-sm">Nenhum resultado no período.</p>
              </div>
            ) : (
              items.map((row, index) => (
                <div
                  key={`${row.position}-${row.name}-${row.total_profit}`}
                  className={cn(
                    "flex items-center gap-4 px-4 py-3 sm:py-4 transition-all duration-300 hover:bg-muted/50",
                    index <= 2 && "bg-primary/5"
                  )}
                  style={{
                    animation: "rankingRowIn 0.4s ease-out both",
                    animationDelay: `${Math.min(index * 40, 400)}ms`,
                  }}
                >
                  <div className="flex w-10 shrink-0 justify-center">
                    {row.position === 1 && <span className="text-2xl">🥇</span>}
                    {row.position === 2 && <span className="text-2xl">🥈</span>}
                    {row.position === 3 && <span className="text-2xl">🥉</span>}
                    {row.position > 3 && (
                      <span className="text-sm font-bold text-muted-foreground tabular-nums">
                        #{row.position}
                      </span>
                    )}
                  </div>
                  <div className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center bg-muted border border-border text-muted-foreground">
                    <User className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-foreground truncate">{row.name}</p>
                      {isAdmin && row.is_fake && (
                        <Crown className="h-4 w-4 shrink-0 text-amber-500" title="Conta fictícia (visível só para admin)" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {row.operations_count} operação{row.operations_count !== 1 ? "ões" : ""}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "text-right shrink-0 font-bold tabular-nums",
                      row.total_profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                    )}
                  >
                    {row.total_profit >= 0 ? "+" : ""}R$ {formatBrl(row.total_profit)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <style>{`
        @keyframes rankingRowIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
