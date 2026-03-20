import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { TrendingUp, Settings, Link2, User, Headphones, Shield, Users, Webhook, Package, Trophy, Sparkles, FileText, Bell, Wrench, Mail, ExternalLink } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useBot } from "@/modules/bot/BotProvider";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformAuth } from "@/contexts/PlatformAuthContext";
import { formatBrl } from "@/lib/utils";
import { getBalances, getPlatformToken } from "@/lib/api";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Operações", url: "/", icon: TrendingUp },
  { title: "Configurar Robô", url: "/bot-config", icon: Settings },
  { title: "Criar estratégia", url: "/criar-estrategia", icon: Wrench },
  { title: "Ranking", url: "/ranking", icon: Trophy },
  { title: "Notificações", url: "/notificacoes", icon: Bell },
];

const adminNavItems = [
  { title: "Usuários", url: "/admin/usuarios", icon: Users },
  { title: "Ranking", url: "/admin/ranking", icon: Trophy },
  { title: "Planos", url: "/admin/planos", icon: Package },
  { title: "Webhooks", url: "/admin/webhooks", icon: Webhook },
  { title: "Notificações PWA", url: "/admin/notificacoes-pwa", icon: Bell },
  { title: "Email Marketing", url: "/admin/email", icon: Mail },
  { title: "Links Extras", url: "/admin/links", icon: Link2 },
];

function getExtraIcon(name: string): React.ElementType {
  const icon = (LucideIcons as Record<string, unknown>)[name];
  if (typeof icon === "function" || (typeof icon === "object" && icon !== null)) return icon as React.ElementType;
  return LucideIcons.Link;
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const contentRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith("/admin");

  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, []);
  const { status, currentBalance } = useBot();
  const { user } = usePlatformAuth();
  const { isAuthenticated: isSafirionConnected, logout: logoutSafirion, loading } = useAuth();
  const isRunning = status === "running";
  const [sidebarBalance, setSidebarBalance] = useState<number | null>(null);

  useEffect(() => {
    if (isAdminRoute || !isSafirionConnected) {
      setSidebarBalance(null);
      return;
    }
    if (isRunning) return;
    getBalances()
      .then((r) => {
        const total = (r.balances ?? [])
          .filter((b) => b.type === 1)
          .reduce((sum, b) => sum + (Number((b as { balance?: number }).balance ?? b.amount) || 0), 0);
        setSidebarBalance(total);
      })
      .catch(() => setSidebarBalance(null));
  }, [isAdminRoute, isSafirionConnected, isRunning]);

  const [extraLinks, setExtraLinks] = useState<{ key: string; label: string; url: string; icon: string }[]>([]);

  useEffect(() => {
    const token = getPlatformToken();
    if (!token) return;
    fetch("/api/platform/extra-links", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : [])
      .then(setExtraLinks)
      .catch(() => {});
  }, []);

  const displayName = user?.email?.split("@")[0] || "Usuário";
  const saldoNum = isRunning ? currentBalance : (sidebarBalance ?? (isSafirionConnected ? 0 : null));
  const saldoTexto =
    saldoNum !== null && saldoNum > 0
      ? `R$ ${formatBrl(saldoNum)}`
      : isSafirionConnected
        ? (saldoNum === 0 ? "R$ 0,00" : "—")
        : "Conecte para ver";

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border bg-sidebar overflow-hidden"
    >
      {/* Grid de fundo sutil (estilo I.A.) */}
      <div className="absolute inset-0 bg-grid-ai pointer-events-none opacity-60" aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.02] via-transparent to-transparent pointer-events-none" aria-hidden />

      <SidebarHeader className="relative p-0 border-b border-sidebar-border/80">
        <div className="p-4 pb-3">
          <img
            src="/logos/logo.png"
            alt="Nexus Bot"
            className="h-12 w-full object-contain"
          />
        </div>
        {!collapsed && (
          <div className="px-4 pb-4 space-y-3">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 border-neon">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                Saldo disponível
              </p>
              <p className="font-display-ai text-lg font-bold tabular-nums text-primary truncate tracking-wide">
                {saldoTexto}
              </p>
            </div>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent ref={contentRef} className="relative px-2 pt-2 overflow-y-auto overflow-x-hidden">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 mb-1.5">
            Menu principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className={`text-base rounded-lg py-5 hover:bg-primary/10 hover:text-primary hover:border-primary/20 border border-transparent transition-all duration-200 ${collapsed ? "px-0 justify-center flex items-center" : "px-4"}`}
                      activeClassName="bg-primary/15 text-primary border-primary/30 font-semibold shadow-[0_0_12px_hsl(var(--primary)_/_0.12)]"
                    >
                      <item.icon className={`h-4 w-4 shrink-0 ${collapsed ? "" : "mr-3"}`} />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {extraLinks.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 mb-1.5">
              {!collapsed && "Extras"}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {extraLinks.map((item) => {
                  const Icon = getExtraIcon(item.icon ?? "Link");
                  return (
                    <SidebarMenuItem key={item.key}>
                      <a
                        href={item.url || "#"}
                        target={item.url ? "_blank" : undefined}
                        rel="noopener noreferrer"
                        className={`w-full flex items-center text-sm text-sidebar-foreground rounded-lg border border-transparent transition-all duration-200 hover:bg-primary/10 hover:text-primary hover:border-primary/20 ${collapsed ? "size-8 justify-center p-2" : "px-4 py-2.5"}`}
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${collapsed ? "" : "mr-3"}`} />
                        {!collapsed && (
                          <span className="flex-1 flex items-center justify-between gap-1">
                            {item.label}
                            <ExternalLink className="h-3 w-3 opacity-40" />
                          </span>
                        )}
                      </a>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {user?.role === "admin" && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 mb-1.5 flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {adminNavItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end
                        className={`text-base rounded-lg py-5 hover:bg-primary/10 hover:text-primary hover:border-primary/20 border border-transparent transition-all duration-200 ${collapsed ? "px-0 justify-center flex items-center" : "px-4"}`}
                        activeClassName="bg-primary/15 text-primary border-primary/30 font-semibold shadow-[0_0_12px_hsl(var(--primary)_/_0.12)]"
                      >
                        <item.icon className={`h-4 w-4 shrink-0 ${collapsed ? "" : "mr-3"}`} />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="relative p-2 border-t border-sidebar-border/80 space-y-2">
        {isSafirionConnected && (
          <button
            type="button"
            onClick={() => !loading && logoutSafirion()}
            className="w-full flex items-center justify-between rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-[11px] text-primary hover:bg-primary/15 hover:border-primary/40 transition-colors"
          >
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              {!collapsed && <span className="font-semibold">Safirion conectada</span>}
            </span>
            {!collapsed && (
              <span className="flex items-center gap-1 text-[11px] text-primary/90">
                <Link2 className="h-3 w-3" />
                Desconectar
              </span>
            )}
          </button>
        )}
        {!collapsed && (
          <>
            <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2">
              Ajuda
            </SidebarGroupLabel>
            <div className="rounded-xl bg-primary/10 border border-primary/25 p-3 border-neon">
              <div className="flex items-center gap-2 mb-0.5">
                <Headphones className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold text-foreground">Suporte 24/7</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Precisa de ajuda? Fale conosco.
              </p>
            </div>
          </>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
