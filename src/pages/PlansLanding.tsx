import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bot, Zap, Shield, TrendingUp, BarChart3, Clock, CheckCircle2,
  ArrowRight, Star, Loader2, ChevronRight,
} from "lucide-react";

type Period = { period_type: string; price: number; checkout_url: string | null };
type Plan = { id: string; name: string; code: string; description: string | null; periods: Period[] };

const PERIOD_LABELS: Record<string, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

const PERIOD_MONTHS: Record<string, number> = {
  monthly: 1, quarterly: 3, semiannual: 6, annual: 12,
};

const BENEFITS = [
  { icon: Bot,        title: "Robô 100% automatizado",    desc: "Opere no piloto automático com estratégias configuráveis e martingale inteligente." },
  { icon: Zap,        title: "Entradas em tempo real",    desc: "O robô analisa o mercado e executa as entradas na hora certa, sem atraso." },
  { icon: BarChart3,  title: "Dashboard ao vivo",         desc: "Acompanhe Win Rate, lucro da sessão, histórico de operações e gráfico de performance." },
  { icon: TrendingUp, title: "Estratégias personalizadas",desc: "Crie suas próprias estratégias com indicadores como RSI, EMA, MACD, Bollinger e mais." },
  { icon: Shield,     title: "Stop Gain e Stop Loss",     desc: "Proteja seu capital com metas automáticas de lucro e limite de perda configuráveis." },
  { icon: Clock,      title: "Suporte 24/7",              desc: "Atendimento sempre disponível para tirar dúvidas e garantir seu sucesso." },
];

function formatPrice(price: number) {
  return price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function monthlyPrice(price: number, type: string) {
  const months = PERIOD_MONTHS[type] ?? 1;
  return formatPrice(price / months);
}

export default function PlansLanding() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/platform/plans/public")
      .then(r => r.json())
      .then(setPlans)
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#090909] text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#090909]/95 backdrop-blur">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 h-16">
          <img src="/logos/logo.png" alt="Nexus Bot" className="h-9 object-contain" />
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-300 hover:text-white"
            onClick={() => navigate("/login")}
          >
            Já tenho conta <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden pt-20 pb-24 px-4 text-center">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/8 via-transparent to-transparent pointer-events-none" />
        <div className="relative max-w-3xl mx-auto space-y-6">
          <Badge className="bg-primary/15 text-primary border-primary/30 px-4 py-1 text-sm">
            🤖 Robô Automático de Opções Binárias
          </Badge>
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
            Opere no piloto automático.{" "}
            <span className="text-primary">Lucre com inteligência.</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed">
            O Nexus Bot conecta à sua corretora, analisa o mercado em tempo real e executa
            entradas automáticas com gestão de risco — sem você precisar fazer nada.
          </p>
          <div className="flex flex-wrap justify-center gap-6 pt-2 text-sm text-slate-400">
            {["Funciona 24h", "Stop Gain/Loss automático", "Martingale inteligente", "Sem necessidade de experiência"].map(f => (
              <span key={f} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" /> {f}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 px-4 bg-[#0d0d0d]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold">Por que o Nexus Bot?</h2>
            <p className="text-slate-400 mt-3">Tudo que você precisa para operar de forma profissional e automatizada.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {BENEFITS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-[#111] border border-white/5 rounded-xl p-6 hover:border-primary/30 transition-colors">
                <div className="h-11 w-11 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-white mb-2">{title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="py-20 px-4" id="planos">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold">Escolha seu plano</h2>
            <p className="text-slate-400 mt-3">Acesso completo ao robô.</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <p>Nenhum plano disponível no momento. Entre em contato conosco.</p>
            </div>
          ) : (
            <div className="space-y-10">
              {plans.map((plan, planIdx) => (
                <div key={plan.id}>
                  <div className="flex items-center justify-center gap-3 mb-8">
                    <Star className={`h-5 w-5 ${planIdx === 0 ? "text-primary" : "text-slate-500"}`} />
                    <h3 className="text-2xl font-bold">{plan.name}</h3>
                    {plan.description && (
                      <span className="text-slate-400 text-sm">— {plan.description}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap justify-center gap-6">
                    {plan.periods.map((period) => {
                      const isAnnual = (PERIOD_MONTHS[period.period_type] ?? 1) > 1;
                      const perMonth = monthlyPrice(period.price, period.period_type);
                      const isPopular = period.period_type === "annual";
                      return (
                        <div
                          key={period.period_type}
                          className={`relative rounded-2xl border p-8 flex flex-col gap-5 transition-all w-full max-w-xs ${
                            isPopular
                              ? "border-primary bg-primary/5 shadow-xl shadow-primary/10"
                              : "border-white/8 bg-[#111] hover:border-white/20"
                          }`}
                        >
                          {isPopular && (
                            <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary text-black text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
                              Melhor custo-benefício
                            </span>
                          )}
                          <div>
                            <p className="text-slate-400 text-sm font-medium uppercase tracking-wide">
                              {PERIOD_LABELS[period.period_type] ?? period.period_type}
                            </p>
                            <div className="flex items-end gap-1 mt-2">
                              <p className="text-4xl font-extrabold text-white">{perMonth}</p>
                              <span className="text-slate-400 text-sm mb-1">/mês</span>
                            </div>
                            {isAnnual && (
                              <p className="text-slate-500 text-xs mt-1">
                                {formatPrice(period.price)} cobrado anualmente
                              </p>
                            )}
                          </div>
                          <ul className="space-y-3 text-sm text-slate-300 flex-1">
                            {[
                              "Robô 100% automático",
                              "Operações automatizadas",
                              "Gerenciamento completo automático",
                              "Stop Gain e Stop Loss automático",
                              "Histórico de operações",
                              "Ranking com premiações",
                            ].map(f => (
                              <li key={f} className="flex items-center gap-2.5">
                                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                                {f}
                              </li>
                            ))}
                          </ul>
                          <Button
                            size="lg"
                            className={`w-full font-semibold mt-2 ${
                              isPopular
                                ? "bg-primary text-black hover:bg-primary/90"
                                : "bg-white/10 hover:bg-white/20 text-white"
                            }`}
                            onClick={() => {
                              if (period.checkout_url) {
                                window.open(period.checkout_url, "_blank");
                              } else {
                                navigate("/login");
                              }
                            }}
                          >
                            Assinar agora <ChevronRight className="ml-1 h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA Footer */}
      <section className="py-16 px-4 bg-[#0d0d0d] border-t border-white/5">
        <div className="max-w-2xl mx-auto text-center space-y-5">
          <h2 className="text-2xl font-bold">Já tem uma conta?</h2>
          <p className="text-slate-400">Acesse a plataforma e ligue o robô agora mesmo.</p>
          <Button
            size="lg"
            className="bg-primary text-black hover:bg-primary/90 font-semibold px-8"
            onClick={() => navigate("/login")}
          >
            Entrar na plataforma <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      <footer className="py-6 text-center text-xs text-slate-600 border-t border-white/5">
        © {new Date().getFullYear()} Nexus Bot. Todos os direitos reservados.
      </footer>
    </div>
  );
}
