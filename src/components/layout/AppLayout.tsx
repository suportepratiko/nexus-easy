import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { PwaNotificationBanner } from "@/components/PwaNotificationBanner";
import { InstallAppBanner } from "@/components/InstallAppBanner";
import { useBot } from "@/modules/bot/BotProvider";
import { usePlatformAuth } from "@/contexts/PlatformAuthContext";
import { useSoundOnOperation } from "@/contexts/SoundOnOperationContext";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LogOut, Volume2, VolumeX, User, Bell, Shield } from "lucide-react";
import { BotLiveWidget } from "@/components/BotLiveWidget";

export function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { status, showLiveWidget, setShowLiveWidget } = useBot();
  const { user, logout } = usePlatformAuth();
  const { soundEnabled, setSoundEnabled } = useSoundOnOperation();
  const isRunning = status === "running";

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full flex-row items-stretch bg-background relative">
        <div className="absolute inset-0 bg-grid-ai-subtle pointer-events-none opacity-40" aria-hidden />
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 relative min-h-screen flex-shrink-0">
          <header className="relative h-14 flex items-center justify-between border-b border-border px-4 bg-card/80 backdrop-blur-md sticky top-0 z-40">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            </div>
            <div className="flex items-center gap-2">
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => setSoundEnabled(!soundEnabled)}
                      aria-label={soundEnabled ? "Desativar som ao abrir operação" : "Ativar som ao abrir operação"}
                    >
                      {soundEnabled ? (
                        <Volume2 className="h-4 w-4" aria-hidden />
                      ) : (
                        <VolumeX className="h-4 w-4" aria-hidden />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {soundEnabled ? "Som ao abrir operação: ativado" : "Som ao abrir operação: desativado"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {user && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full bg-primary/10 hover:bg-primary/20 border border-primary/20 hover:border-primary/40 text-primary"
                      aria-label="Menu do usuário"
                    >
                      <User className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <div className="px-2 py-2 border-b border-border mb-1">
                      <p className="text-xs font-semibold text-foreground truncate">{user.email?.split("@")[0]}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                      {user.role === "admin" && (
                        <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-medium text-primary bg-primary/10 rounded px-1.5 py-0.5">
                          <Shield className="h-2.5 w-2.5" />
                          Admin
                        </span>
                      )}
                    </div>
                    <DropdownMenuItem onClick={() => navigate("/meu-perfil")} className="gap-2 cursor-pointer">
                      <User className="h-4 w-4" />
                      Meu Perfil
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/notificacoes")} className="gap-2 cursor-pointer">
                      <Bell className="h-4 w-4" />
                      Notificações
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="gap-2 cursor-pointer text-destructive focus:text-destructive">
                      <LogOut className="h-4 w-4" />
                      Sair
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </header>
          <PwaNotificationBanner />
          <InstallAppBanner />
          {/* Widget ao vivo: renderizado aqui para nunca desmontar (PiP persiste entre estados do robô) */}
          {showLiveWidget && <BotLiveWidget onClose={() => setShowLiveWidget(false)} />}
          <main className="flex-1 p-4 md:p-6 overflow-auto relative">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
