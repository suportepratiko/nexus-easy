import { useState, useEffect } from "react";
import { isPwaStandalone, getInstallPlatform, type InstallPlatform } from "@/lib/pwa";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Smartphone, X, ChevronDown } from "lucide-react";

const STORAGE_KEY = "pwa-install-banner-dismissed";
const DISMISS_DAYS = 7;

function AndroidSteps() {
  return (
    <ol className="list-decimal list-inside space-y-3 text-sm text-muted-foreground">
      <li>Abra o <strong className="text-foreground">Chrome</strong> (ou o navegador que você está usando).</li>
      <li>Toque no ícone de <strong className="text-foreground">menu</strong> (três pontinhos) no canto superior direito.</li>
      <li>Toque em <strong className="text-foreground">&quot;Instalar app&quot;</strong> ou <strong className="text-foreground">&quot;Adicionar à tela inicial&quot;</strong>.</li>
      <li>Confirme em <strong className="text-foreground">&quot;Instalar&quot;</strong>.</li>
      <li>O ícone do app aparecerá na tela inicial ou na gaveta de aplicativos.</li>
    </ol>
  );
}

function IosSteps() {
  return (
    <ol className="list-decimal list-inside space-y-3 text-sm text-muted-foreground">
      <li>Abra o site no <strong className="text-foreground">Safari</strong> (no iPhone/iPad o &quot;Instalar app&quot; só funciona pelo Safari).</li>
      <li>Toque no ícone de <strong className="text-foreground">Compartilhar</strong> (quadrado com seta para cima) na barra inferior ou superior.</li>
      <li>Role e toque em <strong className="text-foreground">&quot;Adicionar à Tela de Início&quot;</strong>.</li>
      <li>Toque em <strong className="text-foreground">&quot;Adicionar&quot;</strong> no canto superior direito.</li>
      <li>O ícone do app aparecerá na tela inicial.</li>
    </ol>
  );
}

function OtherSteps() {
  return (
    <div className="space-y-3 text-sm text-muted-foreground">
      <p>
        No <strong className="text-foreground">Chrome</strong> (computador ou Android): use o menu (⋮) e procure por &quot;Instalar Nexus Bot&quot; ou &quot;Adicionar à tela inicial&quot;.
      </p>
      <p>
        No <strong className="text-foreground">iPhone/iPad</strong>: use o Safari, toque em Compartilhar e depois em &quot;Adicionar à Tela de Início&quot;.
      </p>
    </div>
  );
}

function TutorialContent({ platform }: { platform: InstallPlatform }) {
  switch (platform) {
    case "android":
      return <AndroidSteps />;
    case "ios":
      return <IosSteps />;
    default:
      return <OtherSteps />;
  }
}

/** Banner para usuário no navegador (não PWA) com opção de ver tutorial de instalação Android/iOS. */
export function InstallAppBanner() {
  const [visible, setVisible] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>("other");

  useEffect(() => {
    if (isPwaStandalone()) {
      setVisible(false);
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const t = Number(raw);
        if (!Number.isNaN(t) && Date.now() - t < DISMISS_DAYS * 24 * 60 * 60 * 1000) {
          setVisible(false);
          return;
        }
      }
    } catch {
      //
    }
    setVisible(true);
    setPlatform(getInstallPlatform());
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      //
    }
  };

  if (!visible) return null;

  const title =
    platform === "android"
      ? "Instalar no Android"
      : platform === "ios"
        ? "Instalar no iPhone ou iPad"
        : "Instalar o app";

  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 bg-muted/50 border-b border-border text-foreground"
      role="banner"
      aria-label="Instalar o app"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Smartphone className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">
          Instale o app para usar no celular como um aplicativo e receber notificações.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="secondary" size="sm" className="h-8 gap-1">
              Como instalar
              <ChevronDown className="h-4 w-4" aria-hidden />
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>
                Siga os passos abaixo de acordo com seu aparelho.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6">
              <TutorialContent platform={platform} />
            </div>
          </SheetContent>
        </Sheet>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={handleDismiss}
          aria-label="Fechar aviso"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
