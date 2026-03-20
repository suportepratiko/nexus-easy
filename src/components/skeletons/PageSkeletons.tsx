import { Skeleton } from "@/components/ui/skeleton";

/* ─── Bloco reutilizável ─────────────────────────────────────── */
function SkeletonCard({ className = "" }: { className?: string }) {
  return <div className={`rounded-xl border border-border bg-card p-4 ${className}`}>{/* inner */}</div>;
}

/* ════════════════════════════════════════════════════════════════
   1. DASHBOARD (Operações)
   ════════════════════════════════════════════════════════════════ */
export function DashboardSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-6 animate-pulse">
      {/* Card de status do robô */}
      <div className="rounded-xl border border-border bg-card p-5 flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
      </div>

      {/* 6 cards de estatísticas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-2.5 w-14" />
          </div>
        ))}
      </div>

      {/* Gráfico */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-[180px] w-full rounded-lg" />
      </div>

      {/* Tabela de operações */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16 hidden sm:block" />
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-5 w-10 ml-auto rounded-full" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   2. BOT CONFIG (Configurar Robô)
   ════════════════════════════════════════════════════════════════ */
export function BotConfigSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-36 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      {/* Linha 1 — 3 cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Gestão de banca */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <Skeleton className="h-4 w-36" />
          <div className="rounded-lg border border-border p-3 flex items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-24" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        </div>

        {/* Modalidade */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <Skeleton className="h-4 w-40" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border p-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-9 rounded-full" />
              </div>
            ))}
          </div>
        </div>

        {/* Estratégias */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-full rounded-md" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-4 w-8 ml-auto rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Linha 2 — 3 cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Martingale */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <Skeleton className="h-4 w-36" />
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        </div>

        {/* Stop Gain */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-full rounded-md" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>

        {/* Stop Loss */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-full rounded-md" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   3. CREATE STRATEGY (Criar estratégia — modo lista)
   ════════════════════════════════════════════════════════════════ */
export function CreateStrategySkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3.5 w-72" />
        </div>
        <Skeleton className="h-9 w-44 rounded-lg" />
      </div>

      {/* Card de estratégias salvas */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-52" />
              </div>
              <Skeleton className="h-5 w-8 rounded-full" />
              <div className="flex gap-1.5">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-8 w-8 rounded-md" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   4. RANKING
   ════════════════════════════════════════════════════════════════ */
export function RankingSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-6 animate-pulse">
      {/* Header */}
      <div className="space-y-1.5">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3.5 w-64" />
      </div>

      {/* Premiação — 3 cards */}
      <div className="grid grid-cols-3 gap-3">
        {[{ h: "h-32" }, { h: "h-40" }, { h: "h-28" }].map(({ h }, i) => (
          <div key={i} className={`rounded-xl border border-border bg-card p-4 flex flex-col items-center justify-center gap-2 ${h}`}>
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>

      {/* Classificação */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border">
          <Skeleton className="h-4 w-36" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-5 w-6 rounded" />
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <Skeleton className="h-3.5 flex-1 max-w-[160px]" />
              <Skeleton className="h-3 w-14 ml-auto" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   5. NOTIFICATIONS (Notificações)
   ════════════════════════════════════════════════════════════════ */
export function NotificationsSkeleton() {
  return (
    <div className="p-4 md:p-6 max-w-2xl space-y-6 animate-pulse">
      {/* Header */}
      <div className="space-y-1.5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3.5 w-80" />
      </div>

      {/* Card gatilhos */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border space-y-1">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-64" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-start justify-between gap-4 px-5 py-4">
              <div className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
              <Skeleton className="h-5 w-9 rounded-full shrink-0 mt-1" />
            </div>
          ))}
        </div>
      </div>

      {/* Card info PWA */}
      <div className="rounded-xl border border-border bg-primary/5 p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  );
}
