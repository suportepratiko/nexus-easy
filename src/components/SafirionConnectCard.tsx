import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { useBot } from "@/modules/bot/BotProvider";
import { getBotStatus } from "@/lib/api";
import { Loader2, Settings, LogOut, AlertCircle } from "lucide-react";

function translateBrokerError(msg: string | null | undefined): string {
  if (!msg) return "Erro desconhecido.";
  const lower = msg.toLowerCase();
  if (
    lower.includes("invalid_credentials") ||
    lower.includes("wrong credentials") ||
    lower.includes("wrong login") ||
    lower.includes("ensure that your login") ||
    lower.includes("invalid email") ||
    lower.includes("incorrect password") ||
    lower.includes("2fa") ||
    lower.includes("two-factor")
  ) {
    return "E-mail ou senha inválidos. Verifique suas credenciais e tente novamente.";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "A conexão com a corretora demorou demais. Tente novamente.";
  }
  if (lower.includes("backend") || lower.includes("inacessível") || lower.includes("fetch")) {
    return "Servidor temporariamente indisponível. Tente novamente em instantes.";
  }
  // JSON bruto (ex: {"code":"...","message":"..."})
  if (msg.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(msg);
      const code = (parsed.code || "").toString().toLowerCase();
      const message = (parsed.message || "").toString().toLowerCase();
      if (code.includes("invalid") || message.includes("wrong") || message.includes("credentials")) {
        return "E-mail ou senha inválidos. Verifique suas credenciais e tente novamente.";
      }
      return parsed.message || parsed.code || "Erro ao conectar na corretora.";
    } catch {
      return "E-mail ou senha inválidos. Verifique suas credenciais e tente novamente.";
    }
  }
  return msg;
}

/**
 * Card de login na corretora Safirion para Dashboard e Configurar Robô.
 * Formulário inline: título, email, senha, botão. Após sucesso, mostra estado conectado + CTA para configurar robô.
 */
export function SafirionConnectCard() {
  const navigate = useNavigate();
  const { isAuthenticated, login, logout, reconnect, setTokenExpired, error, loading } = useAuth();
  const { resetBot } = useBot();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  // true enquanto tentamos o auto-reconnect na primeira carga (novo dispositivo)
  // Usa sessionStorage para não repetir após desconect manual na mesma sessão.
  const [autoConnecting, setAutoConnecting] = useState(
    () => !isAuthenticated && !sessionStorage.getItem("broker_auto_tried")
  );

  // Ao montar sem token E sem tentativa prévia, tenta reconectar automaticamente.
  // Se o usuário desconectou manualmente (logout apagou a senha + marca a flag),
  // o auto-reconnect não roda e o formulário é exibido direto.
  useEffect(() => {
    if (isAuthenticated) { setAutoConnecting(false); return; }
    if (sessionStorage.getItem("broker_auto_tried")) { setAutoConnecting(false); return; }
    sessionStorage.setItem("broker_auto_tried", "1");
    let cancelled = false;
    reconnect()
      .catch(() => { /* sem credenciais salvas → exibe formulário */ })
      .finally(() => { if (!cancelled) setAutoConnecting(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Se o token expirou (401), tenta reconectar automaticamente com credenciais salvas no backend.
  // Só desloga se a reconexão também falhar.
  useEffect(() => {
    if (!isAuthenticated) return;
    getBotStatus().catch(async (e: any) => {
      if (e?.status === 401) {
        try {
          await reconnect();
        } catch {
          if (setTokenExpired) setTokenExpired();
        }
      }
    });
  }, [isAuthenticated, reconnect, setTokenExpired]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    try {
      await login({ email: email.trim(), password, remember });
      setEmail("");
      setPassword("");
    } catch {
      // erro tratado pelo useAuth
    }
  };

  const handleLogout = async () => {
    // Marca que o usuário desconectou manualmente — impede o auto-reconnect
    sessionStorage.setItem("broker_auto_tried", "1");
    // 1. Mata WS, para robô no backend e zera estado local
    resetBot();
    // 2. Desloga da corretora (também apaga senha salva no servidor)
    await logout();
  };

  // Estado: tentando reconectar automaticamente (novo dispositivo)
  if (autoConnecting) {
    return (
      <Card className="rounded-xl border border-border bg-card animate-fade-in">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-10">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Conectando à corretora…</p>
        </CardContent>
      </Card>
    );
  }

  // Estado: já conectado — tema escuro, destaque verde
  if (isAuthenticated) {
    return (
      <Card className="rounded-xl border border-primary/30 bg-card animate-fade-in">
        <CardHeader className="pb-3 pt-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <CardTitle className="text-base font-semibold tracking-tight text-foreground">
                Conectado à Safirion Broker
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm text-muted-foreground">
                Sua conta da corretora está vinculada. Agora é só definir a estratégia do robô.
              </CardDescription>
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Conectado
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 pb-4">
          <div className="mt-3 flex flex-col sm:flex-row gap-3">
            <Button
              size="lg"
              className="flex-1 gap-2 rounded-lg"
              onClick={() => navigate("/bot-config")}
            >
              <Settings className="h-4 w-4" />
              Configurar Robô
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="gap-2 text-muted-foreground hover:text-foreground shrink-0 rounded-lg"
              onClick={handleLogout}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Desconectar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Estado: não conectado — formulário de login, tema escuro
  return (
    <Card className="rounded-xl border border-border bg-card animate-fade-in">
      <CardHeader className="pb-4 pt-6 space-y-4">
        <div className="flex justify-center">
          <img
            src="/logo-big.png"
            alt="Nexus Bot"
            className="h-10 w-auto drop-shadow-sm"
          />
        </div>
        <div className="text-center">
          <CardTitle className="text-lg font-semibold tracking-tight text-foreground">
            Logue na Safirion Broker
          </CardTitle>
          <CardDescription className="mt-1 text-sm">
            Use o e-mail e a senha da sua conta na corretora para conectar e operar.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pb-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{translateBrokerError(error)}</span>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="safirion-email" className="text-sm font-medium text-foreground">
              E-mail
            </Label>
            <Input
              id="safirion-email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={loading}
              className="h-10 rounded-lg border-input bg-background focus-visible:ring-2"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="safirion-password" className="text-sm font-medium text-foreground">
              Senha
            </Label>
            <Input
              id="safirion-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={loading}
              className="h-10 rounded-lg border-input bg-background focus-visible:ring-2"
            />
          </div>

          <div className="flex items-center space-x-2 py-1">
            <Checkbox
              id="remember"
              checked={remember}
              onCheckedChange={(checked) => setRemember(!!checked)}
            />
            <Label
              htmlFor="remember"
              className="text-xs font-medium text-muted-foreground cursor-pointer select-none"
            >
              Lembrar meus dados de acesso (Sessão Persistente)
            </Label>
          </div>

          <div className="space-y-2">
            <Button
              type="submit"
              size="lg"
              disabled={loading || !email.trim() || !password}
              className="w-full h-10 rounded-lg font-medium"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Conectando…
                </>
              ) : (
                "Conectar na corretora"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full h-10 rounded-lg font-medium text-sm"
              onClick={() => window.open("https://trade.safirion.com/register?aff=813912&aff_model=revenue&afftrack=nexusauto", "_blank", "noopener,noreferrer")}
            >
              Criar conta na corretora
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
