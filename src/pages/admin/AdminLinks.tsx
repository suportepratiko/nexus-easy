import { useEffect, useState } from "react";
import { ExternalLink, Link2, Loader2, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getPlatformToken } from "@/lib/api";
import { toast } from "sonner";
import { usePlatformAuth } from "@/contexts/PlatformAuthContext";
import { Navigate } from "react-router-dom";

interface ExtraLink {
  key: string;
  label: string;
  url: string;
  is_active: boolean;
}

const LINK_DESCRIPTIONS: Record<string, string> = {
  sala_premium: "Link da sala VIP/Premium. Exibido na sidebar de todos os usuários ativos.",
  indicador:    "Link do indicador de sinais. Exibido na sidebar de todos os usuários ativos.",
};

const LINK_ICONS: Record<string, string> = {
  sala_premium: "👑",
  indicador:    "📊",
};

async function fetchLinks(): Promise<ExtraLink[]> {
  const token = getPlatformToken();
  const res = await fetch("/api/platform/admin/extra-links", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Falha ao carregar links");
  return res.json();
}

async function updateLink(key: string, data: Partial<ExtraLink>): Promise<void> {
  const token = getPlatformToken();
  const res = await fetch(`/api/platform/admin/extra-links/${key}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Falha ao salvar");
}

export default function AdminLinksPage() {
  const { user } = usePlatformAuth();
  const [links, setLinks] = useState<ExtraLink[]>([]);
  const [editing, setEditing] = useState<Record<string, { label: string; url: string; is_active: boolean }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  if (!user || user.role !== "admin") return <Navigate to="/" replace />;

  useEffect(() => {
    fetchLinks()
      .then((data) => {
        setLinks(data);
        const init: typeof editing = {};
        data.forEach((l) => { init[l.key] = { label: l.label, url: l.url, is_active: l.is_active }; });
        setEditing(init);
      })
      .catch(() => toast.error("Erro ao carregar links"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (key: string) => {
    const e = editing[key];
    if (!e) return;
    if (e.url && !/^https?:\/\//i.test(e.url)) {
      toast.error("O link deve começar com http:// ou https://");
      return;
    }
    setSaving(key);
    try {
      await updateLink(key, { label: e.label, url: e.url, is_active: e.is_active });
      toast.success("Link salvo com sucesso!");
      setLinks((prev) => prev.map((l) => l.key === key ? { ...l, ...e } : l));
    } catch {
      toast.error("Falha ao salvar link.");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando…</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="space-y-1">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          Links Extras
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure os links da seção <span className="font-medium text-foreground">Extras</span> na sidebar dos usuários.
          Cada link abre em nova aba ao ser clicado.
        </p>
      </div>

      <div className="grid gap-4">
        {links.map((link) => {
          const e = editing[link.key] ?? { label: link.label, url: link.url, is_active: link.is_active };
          return (
            <Card key={link.key} className="rounded-xl border border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="text-lg">{LINK_ICONS[link.key] ?? "🔗"}</span>
                  {e.label || link.label}
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${e.is_active ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                    {e.is_active ? "Ativo" : "Inativo"}
                  </span>
                </CardTitle>
                <p className="text-xs text-muted-foreground">{LINK_DESCRIPTIONS[link.key]}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome exibido na sidebar</Label>
                    <Input
                      value={e.label}
                      onChange={(ev) => setEditing((p) => ({ ...p, [link.key]: { ...e, label: ev.target.value } }))}
                      placeholder="Ex: Sala Premium"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">URL de destino</Label>
                    <div className="relative">
                      <Input
                        value={e.url}
                        onChange={(ev) => setEditing((p) => ({ ...p, [link.key]: { ...e, url: ev.target.value } }))}
                        placeholder="https://..."
                        className="h-9 pr-9"
                      />
                      {e.url && /^https?:\/\//i.test(e.url) && (
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                          title="Abrir link"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={e.is_active}
                      onCheckedChange={(v) => setEditing((p) => ({ ...p, [link.key]: { ...e, is_active: v } }))}
                    />
                    <span className="text-sm text-muted-foreground">
                      {e.is_active ? "Visível na sidebar" : "Oculto na sidebar"}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleSave(link.key)}
                    disabled={saving === link.key}
                    className="gap-1.5"
                  >
                    {saving === link.key ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…</>
                    ) : (
                      <><Save className="h-3.5 w-3.5" /> Salvar</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
