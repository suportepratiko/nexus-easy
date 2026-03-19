import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePlatformAuth } from "@/contexts/PlatformAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Mail, Lock, Eye, EyeOff, Loader2, Zap, Shield, TrendingUp,
  AlertTriangle, CheckCircle2, KeyRound,
} from "lucide-react";

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading, login, error, clearError } = usePlatformAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Recuperação de senha
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user?.email) navigate("/", { replace: true });
  }, [authLoading, user?.email, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!email.trim() || !password) return;
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate("/", { replace: true });
    } catch {
      // error já vem do context
    } finally {
      setLoading(false);
    }
  };

  const openForgot = () => {
    setForgotEmail(email.trim());
    setForgotSent(false);
    setForgotError(null);
    setForgotOpen(true);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) { setForgotError("Informe seu e-mail."); return; }
    setForgotLoading(true);
    setForgotError(null);
    try {
      const res = await fetch("/api/platform/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.detail ?? "Erro ao solicitar recuperação.");
      }
      setForgotSent(true);
    } catch (err: unknown) {
      setForgotError(err instanceof Error ? err.message : "Erro ao solicitar recuperação.");
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <>
      <div className="min-h-screen flex bg-slate-950 text-slate-50">
        {/* Painel esquerdo — hero */}
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "linear-gradient(120deg, rgba(15,118,110,0.22), transparent 60%), url('/trade.jpg')",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
            aria-hidden
          />
          <div className="absolute inset-0 bg-slate-950/90" aria-hidden />

          <div className="relative z-10 flex flex-col justify-between p-10 xl:p-16 w-full">
            <div className="space-y-4 max-w-xl">
              <p className="text-primary text-xs font-semibold tracking-[0.3em] uppercase">
                Plataforma de automação
              </p>
              <h1 className="text-3xl xl:text-4xl font-semibold leading-tight">
                Controle total das suas operações.{" "}
                <span className="text-primary">Sem complicação.</span>
              </h1>
              <p className="mt-2 text-slate-300 text-sm xl:text-base max-w-lg">
                Conecte sua conta da corretora, defina suas estratégias e deixe o Nexus Bot
                executar as entradas com disciplina, gestão e inteligência em tempo real.
              </p>
            </div>

            <div className="space-y-5 mt-10">
              {[
                { icon: Zap,        title: "Operação automatizada",  desc: "Robô executando entradas com suas configurações de risco e estratégia." },
                { icon: Shield,     title: "Acesso seguro",          desc: "Seus dados sempre protegidos com controle total de acesso." },
                { icon: TrendingUp, title: "Painel em tempo real",   desc: "Acompanhe resultados, ranking de usuários e histórico de operações." },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex gap-4 items-start">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 border border-primary/40">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-50">{title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Painel direito — formulário */}
        <div className="flex-1 relative flex items-center justify-center px-4 py-10 sm:p-8">
          <div className="absolute inset-0 bg-grid-ai-subtle opacity-30 pointer-events-none" aria-hidden />
          <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-slate-950/80 pointer-events-none" aria-hidden />

          <div className="relative w-full max-w-md">
            <div className="bg-slate-900/90 border border-slate-700/70 rounded-2xl shadow-2xl shadow-black/40 p-8 backdrop-blur">
              <div className="flex items-center justify-center mb-8">
                <img src="/logos/logo.png" alt="Nexus Bot" className="h-14 w-full object-contain" />
              </div>

              <h2 className="text-2xl font-semibold text-slate-50">Entrar</h2>
              <p className="text-slate-400 mt-1 mb-6 text-sm">
                Use seu e-mail e senha para acessar o painel do Nexus Bot.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (() => {
                  const isExpired = error.includes("assinatura está vencida") || error.includes("vencida");
                  const isSession = error.includes("sessão foi encerrada") || error.includes("Sua sessão");
                  return (
                    <div className={`rounded-lg text-sm p-3 flex items-start gap-2 ${
                      isExpired
                        ? "bg-red-600 text-white"
                        : isSession
                          ? "bg-amber-400 text-gray-900 dark:bg-amber-500 dark:text-gray-900"
                          : "bg-red-900/50 text-red-200 border border-red-500/40"
                    }`}>
                      <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
                      {isExpired ? (
                        <span>
                          Sua assinatura está vencida.{" "}
                          <button
                            type="button"
                            className="underline font-semibold hover:opacity-80 transition-opacity whitespace-nowrap"
                            onClick={() => navigate("/planos")}
                          >
                            Renovar agora →
                          </button>
                        </span>
                      ) : (
                        <span>{error}</span>
                      )}
                    </div>
                  );
                })()}

                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-slate-200 text-sm">E-mail</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="voce@exemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 h-11 rounded-lg border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500 focus-visible:ring-primary"
                      autoComplete="email"
                      disabled={loading || authLoading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password" className="text-slate-200 text-sm">Senha</Label>
                    <button
                      type="button"
                      className="text-xs text-primary hover:text-primary/80 transition-colors"
                      onClick={openForgot}
                    >
                      Esqueceu a senha?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10 h-11 rounded-lg border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500 focus-visible:ring-primary"
                      autoComplete="current-password"
                      disabled={loading || authLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 rounded-lg bg-primary hover:bg-primary/90 text-slate-950 font-semibold tracking-wide transition-colors"
                  disabled={loading || authLoading}
                >
                  {loading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Entrando…</>
                  ) : "Entrar"}
                </Button>
              </form>

              <div className="mt-6 space-y-3">
                <p className="text-center text-xs text-slate-500">Não tem uma conta ainda?</p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-lg border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
                  onClick={() => navigate("/planos")}
                >
                  Ver planos e assinar
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal — Recuperação de senha */}
      <Dialog open={forgotOpen} onOpenChange={(o) => { setForgotOpen(o); if (!o) { setForgotSent(false); setForgotError(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Recuperar senha
            </DialogTitle>
            <DialogDescription>
              Informe seu e-mail cadastrado. Enviaremos uma senha temporária para você acessar a plataforma.
            </DialogDescription>
          </DialogHeader>

          {forgotSent ? (
            <div className="py-4 text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
              <p className="text-sm text-slate-300 font-medium">Solicitação enviada!</p>
              <p className="text-xs text-slate-400">
                Se o e-mail <strong className="text-slate-200">{forgotEmail}</strong> estiver cadastrado,
                você receberá uma senha temporária em breve.
              </p>
              <p className="text-xs text-slate-500">Verifique também a caixa de spam.</p>
              <Button className="w-full mt-2" onClick={() => setForgotOpen(false)}>
                Fechar e entrar
              </Button>
            </div>
          ) : (
            <form onSubmit={handleForgot} className="space-y-4 pt-1">
              {forgotError && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                  {forgotError}
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="forgot-email">E-mail cadastrado</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="voce@exemplo.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="pl-10"
                    autoComplete="email"
                    disabled={forgotLoading}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={forgotLoading}>
                {forgotLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando…</> : "Enviar senha temporária"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
