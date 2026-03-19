import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, TrendingUp, Activity, Clock, Loader2, ChevronsUpDown, ChevronUp, ChevronDown, Search } from "lucide-react";
import {
  getAdminUserRanking,
  type AdminUserRankingItem,
  type AdminUserRankingResponse,
} from "@/lib/api/admin";

type Preset =
  | "today"
  | "7d"
  | "30d"
  | "3m"
  | "current_month"
  | "custom";

type SortField = "total_profit" | "operations_count";
type SortDir = "asc" | "desc";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  try {
    const d = new Date(value);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatBrl(value: number): string {
  try {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 2,
    });
  } catch {
    return `R$ ${value.toFixed(2)}`;
  }
}

export default function UserRankingPage() {
  const [preset, setPreset] = useState<Preset>("current_month");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [data, setData] = useState<AdminUserRankingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");

  const isCustom = preset === "custom";

  const canLoadCustom = !isCustom || (customStart.trim() !== "" && customEnd.trim() !== "");

  const loadRanking = () => {
    if (isCustom && !canLoadCustom) return;
    setLoading(true);
    setError(null);

    const params: Parameters<typeof getAdminUserRanking>[0] = { preset };
    if (isCustom) {
      // Enviar datas como ISO simples (YYYY-MM-DDT00:00 / T23:59:59) para o backend tratar como datetime.
      params.start = `${customStart}T00:00:00`;
      params.end = `${customEnd}T23:59:59`;
    }

    getAdminUserRanking(params)
      .then((res) => {
        setData(res);
      })
      .catch((e: { detail?: string; message?: string }) => {
        setError(e?.detail ?? e?.message ?? "Erro ao carregar ranking.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // Carregamento inicial + recarga ao trocar de preset (exceto custom sem datas).
    if (!isCustom || canLoadCustom) {
      loadRanking();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  useEffect(() => {
    if (!data) return;
    // Atualização quase em tempo real enquanto a página está aberta.
    const interval = setInterval(() => {
      loadRanking();
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, preset, customStart, customEnd]);

  const items: AdminUserRankingItem[] = data?.items ?? [];

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.name?.toLowerCase().includes(q) ||
        it.email?.toLowerCase().includes(q),
    );
  }, [items, search]);

  const sortedItems = useMemo(() => {
    if (!sortField) return filteredItems;
    return [...filteredItems].sort((a, b) => {
      const diff = (a[sortField] ?? 0) - (b[sortField] ?? 0);
      return sortDir === "asc" ? diff : -diff;
    });
  }, [filteredItems, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
  const pagedItems = useMemo(
    () => sortedItems.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [sortedItems, currentPage, pageSize],
  );

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
    setCurrentPage(1);
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronsUpDown className="inline h-3.5 w-3.5 ml-1 opacity-40" />;
    return sortDir === "desc"
      ? <ChevronDown className="inline h-3.5 w-3.5 ml-1 text-primary" />
      : <ChevronUp className="inline h-3.5 w-3.5 ml-1 text-primary" />;
  }

  const stats = useMemo(() => {
    if (!items.length) {
      return {
        totalUsers: 0,
        totalOperations: 0,
        bestProfit: 0,
        avgProfitPerUser: 0,
      };
    }
    const totalUsers = items.length;
    const totalOperations = items.reduce((sum, it) => sum + (it.operations_count || 0), 0);
    const bestProfit = Math.max(...items.map((it) => it.total_profit || 0));
    const totalProfit = items.reduce((sum, it) => sum + (it.total_profit || 0), 0);
    const avgProfitPerUser = totalUsers > 0 ? totalProfit / totalUsers : 0;
    return { totalUsers, totalOperations, bestProfit, avgProfitPerUser };
  }, [items]);

  const periodLabel = useMemo(() => {
    if (!data) return "";
    const start = new Date(data.period_start);
    const end = new Date(data.period_end);
    const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" };
    return `${start.toLocaleDateString("pt-BR", opts)} — ${end.toLocaleDateString("pt-BR", opts)}`;
  }, [data]);

  const cardBaseClass = "border-border/60 bg-card/80";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Ranking de usuários</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Acompanhe quem mais está lucrando e o volume de operações por período.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className={`glass-card ${cardBaseClass}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Usuários ranqueados</CardTitle>
            <Trophy className="h-7 w-7 shrink-0 text-amber-500" />
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold tabular-nums">{stats.totalUsers}</span>
          </CardContent>
        </Card>
        <Card className={`glass-card ${cardBaseClass}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Maior lucro</CardTitle>
            <TrendingUp className="h-7 w-7 shrink-0 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold tabular-nums">
              {formatBrl(stats.bestProfit)}
            </span>
          </CardContent>
        </Card>
        <Card className={`glass-card ${cardBaseClass}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Operações no período</CardTitle>
            <Activity className="h-7 w-7 shrink-0 text-sky-500" />
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold tabular-nums">{stats.totalOperations}</span>
          </CardContent>
        </Card>
        <Card className={`glass-card ${cardBaseClass}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Média de lucro por usuário</CardTitle>
            <Clock className="h-7 w-7 shrink-0 text-violet-500" />
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold tabular-nums">
              {formatBrl(stats.avgProfitPerUser)}
            </span>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-base">Ranking por período</CardTitle>
              <p className="text-xs text-muted-foreground">
                {periodLabel ? `Período: ${periodLabel}` : "Selecione um período para ver o ranking."}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Buscar por nome ou e-mail…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                  className="h-9 pl-9"
                  autoComplete="off"
                />
              </div>
              <div className="flex-1 min-w-[180px]">
                <Select
                  value={preset}
                  onValueChange={(v: Preset) => setPreset(v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Hoje</SelectItem>
                    <SelectItem value="7d">Últimos 7 dias</SelectItem>
                    <SelectItem value="30d">Últimos 30 dias</SelectItem>
                    <SelectItem value="3m">Últimos 3 meses</SelectItem>
                    <SelectItem value="current_month">Mês atual</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isCustom && (
                <div className="flex flex-1 items-center gap-2">
                  <div className="flex-1 space-y-1">
                    <span className="text-[11px] text-muted-foreground">Início</span>
                    <Input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <span className="text-[11px] text-muted-foreground">Fim</span>
                    <Input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="mt-4 sm:mt-6 h-9"
                    disabled={!canLoadCustom || loading}
                    onClick={loadRanking}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aplicar"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && !data && (
            <div className="flex items-center justify-center min-h-[220px] gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Carregando ranking…</span>
            </div>
          )}
          {error && !loading && (
            <div className="text-sm text-destructive mb-4">{error}</div>
          )}
          {!loading && items.length === 0 && !error && (
            <div className="text-sm text-muted-foreground py-6">
              Nenhuma operação registrada no período selecionado.
            </div>
          )}
          {items.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Posição</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead
                        className="cursor-pointer select-none hover:text-foreground"
                        onClick={() => toggleSort("total_profit")}
                      >
                        Lucro total <SortIcon field="total_profit" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer select-none hover:text-foreground"
                        onClick={() => toggleSort("operations_count")}
                      >
                        Operações <SortIcon field="operations_count" />
                      </TableHead>
                      <TableHead>Última operação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedItems.map((item) => {
                      const profitClass =
                        item.total_profit > 0
                          ? "text-emerald-500"
                          : item.total_profit < 0
                            ? "text-red-500"
                            : "text-muted-foreground";
                      const isTop3 = item.position <= 3;
                      return (
                        <TableRow key={item.position}>
                          <TableCell>
                            <Badge
                              className={
                                isTop3
                                  ? "bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-semibold"
                                  : "bg-muted text-foreground/80"
                              }
                            >
                              #{item.position}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-foreground">
                                {item.name || "—"}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {item.email}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={`text-sm font-semibold ${profitClass}`}>
                              {formatBrl(item.total_profit)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm tabular-nums">{item.operations_count}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(item.last_operation_at)}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Paginação */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Exibindo</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}
                  >
                    <SelectTrigger className="h-8 w-[70px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[10, 25, 50, 100].map((n) => (
                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span>de {sortedItems.length} usuários</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>«</Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>‹</Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === "…" ? (
                        <span key={`ellipsis-${i}`} className="px-2 text-muted-foreground text-sm">…</span>
                      ) : (
                        <Button
                          key={p}
                          variant={p === currentPage ? "default" : "outline"}
                          size="icon"
                          className="h-8 w-8 text-xs"
                          onClick={() => setCurrentPage(p as number)}
                        >
                          {p}
                        </Button>
                      )
                    )}
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}>›</Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>»</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

