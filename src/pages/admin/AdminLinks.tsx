import { useEffect, useState } from "react";
import * as LucideIcons from "lucide-react";
import { ExternalLink, Link2, Loader2, Save, Plus, Trash2, Pencil, X, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
  icon: string;
  is_active: boolean;
  sort_order: number;
}

// SVGs customizados para marcas não disponíveis no Lucide
const BRAND_ICONS: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  WhatsApp: (props) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  ),
  Telegram: (props) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  ),
  Instagram: (props) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  ),
  YouTube: (props) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  ),
  TikTok: (props) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
    </svg>
  ),
};

// Ícones disponíveis para seleção (nome = chave Lucide ou marca)
const AVAILABLE_ICONS = [
  // Redes sociais (topo)
  "WhatsApp", "Telegram", "Instagram", "YouTube", "TikTok",
  // Lucide
  "Link", "ExternalLink", "Crown", "BarChart2", "Star", "Zap", "Flame",
  "Trophy", "Gift", "Globe", "BookOpen", "Video", "Headphones", "Music",
  "MessageCircle", "Users", "TrendingUp", "DollarSign", "Wallet", "ShoppingBag",
  "Sparkles", "Rocket", "Target", "Award", "Bell", "Heart", "Shield",
  "Gem", "Layers", "Radio", "Play", "Tv", "Megaphone", "Bot",
];

function getLucideIcon(name: string): React.ElementType {
  // Verifica marcas customizadas primeiro
  if (BRAND_ICONS[name]) return BRAND_ICONS[name];
  const icon = (LucideIcons as Record<string, unknown>)[name];
  if (typeof icon === "function" || (typeof icon === "object" && icon !== null)) {
    return icon as React.ElementType;
  }
  return LucideIcons.Link;
}

const api = {
  headers: () => ({ Authorization: `Bearer ${getPlatformToken()}`, "Content-Type": "application/json" }),
  get: () => fetch("/api/platform/admin/extra-links", { headers: api.headers() }).then((r) => r.json()),
  create: (data: { label: string; url: string; icon: string }) =>
    fetch("/api/platform/admin/extra-links", { method: "POST", headers: api.headers(), body: JSON.stringify(data) }).then((r) => { if (!r.ok) throw new Error(); return r.json(); }),
  update: (key: string, data: Partial<ExtraLink>) =>
    fetch(`/api/platform/admin/extra-links/${key}`, { method: "PATCH", headers: api.headers(), body: JSON.stringify(data) }).then((r) => { if (!r.ok) throw new Error(); return r.json(); }),
  remove: (key: string) =>
    fetch(`/api/platform/admin/extra-links/${key}`, { method: "DELETE", headers: api.headers() }).then((r) => { if (!r.ok) throw new Error(); }),
};

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const Icon = getLucideIcon(value);
  const filtered = AVAILABLE_ICONS.filter((n) => n.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-background text-sm hover:bg-accent transition-colors w-full"
      >
        <Icon className="h-4 w-4 text-primary shrink-0" />
        <span className="flex-1 text-left text-muted-foreground">{value}</span>
        <LucideIcons.ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-50 top-10 left-0 w-72 rounded-xl border border-border bg-popover shadow-xl p-3 space-y-2">
          <Input
            autoFocus
            placeholder="Buscar ícone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs"
          />
          <div className="grid grid-cols-6 gap-1 max-h-48 overflow-y-auto">
            {filtered.map((name) => {
              const I = getLucideIcon(name);
              return (
                <button
                  key={name}
                  type="button"
                  title={name}
                  onClick={() => { onChange(name); setOpen(false); setSearch(""); }}
                  className={`flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-primary/10 hover:text-primary ${value === name ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
                >
                  <I className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface LinkFormState {
  label: string;
  url: string;
  icon: string;
  is_active: boolean;
}

function LinkCard({
  link,
  onSaved,
  onDeleted,
}: {
  link: ExtraLink;
  onSaved: (updated: ExtraLink) => void;
  onDeleted: (key: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<LinkFormState>({ label: link.label, url: link.url, icon: link.icon, is_active: link.is_active });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const Icon = getLucideIcon(form.icon);

  const handleSave = async () => {
    if (!form.label.trim()) { toast.error("Nome é obrigatório."); return; }
    if (form.url && !/^https?:\/\//i.test(form.url)) { toast.error("URL deve começar com http:// ou https://"); return; }
    setSaving(true);
    try {
      const updated = await api.update(link.key, form);
      onSaved({ ...link, ...updated });
      setEditing(false);
      toast.success("Link salvo!");
    } catch { toast.error("Falha ao salvar."); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.remove(link.key);
      onDeleted(link.key);
      toast.success("Link removido.");
    } catch { toast.error("Falha ao remover."); setDeleting(false); setConfirmDelete(false); }
  };

  const handleToggle = async (v: boolean) => {
    setForm((f) => ({ ...f, is_active: v }));
    try { await api.update(link.key, { is_active: v }); onSaved({ ...link, is_active: v }); }
    catch { setForm((f) => ({ ...f, is_active: !v })); toast.error("Falha ao atualizar."); }
  };

  return (
    <Card className="rounded-xl border border-border">
      <CardContent className="p-4">
        {!editing ? (
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{link.label}</p>
              <p className="text-xs text-muted-foreground truncate">{link.url || "Sem URL configurada"}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Switch checked={form.is_active} onCheckedChange={handleToggle} />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setForm({ label: link.label, url: link.url, icon: link.icon, is_active: link.is_active }); setEditing(true); }}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {confirmDelete ? (
                <div className="flex items-center gap-1">
                  <Button variant="destructive" size="icon" className="h-8 w-8" onClick={handleDelete} disabled={deleting}>
                    {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setConfirmDelete(false)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Ícone</Label>
                <IconPicker value={form.icon} onChange={(v) => setForm((f) => ({ ...f, icon: v }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nome na sidebar</Label>
                <Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Ex: Sala Premium" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">URL de destino</Label>
                <div className="relative">
                  <Input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://..." className="h-9 pr-8" />
                  {form.url && /^https?:\/\//i.test(form.url) && (
                    <a href={form.url} target="_blank" rel="noopener noreferrer" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
                <span className="text-xs text-muted-foreground">{form.is_active ? "Visível na sidebar" : "Oculto"}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}><X className="h-3.5 w-3.5 mr-1" /> Cancelar</Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Salvando…</> : <><Save className="h-3.5 w-3.5 mr-1" />Salvar</>}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NewLinkForm({ onCreated }: { onCreated: (link: ExtraLink) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ label: string; url: string; icon: string }>({ label: "", url: "", icon: "Link" });
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!form.label.trim()) { toast.error("Nome é obrigatório."); return; }
    if (form.url && !/^https?:\/\//i.test(form.url)) { toast.error("URL deve começar com http:// ou https://"); return; }
    setSaving(true);
    try {
      const created = await api.create(form);
      onCreated(created);
      setForm({ label: "", url: "", icon: "Link" });
      setOpen(false);
      toast.success("Link criado!");
    } catch { toast.error("Falha ao criar link."); }
    finally { setSaving(false); }
  };

  if (!open) {
    return (
      <Button variant="outline" className="w-full gap-2 border-dashed" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Adicionar link
      </Button>
    );
  }

  return (
    <Card className="rounded-xl border border-primary/30 bg-primary/5">
      <CardContent className="p-4 space-y-4">
        <p className="text-sm font-semibold">Novo link</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Ícone</Label>
            <IconPicker value={form.icon} onChange={(v) => setForm((f) => ({ ...f, icon: v }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Nome na sidebar</Label>
            <Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Ex: Grupo VIP" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">URL de destino</Label>
            <Input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://..." className="h-9" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}><X className="h-3.5 w-3.5 mr-1" />Cancelar</Button>
          <Button size="sm" onClick={handleCreate} disabled={saving}>
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Criando…</> : <><Plus className="h-3.5 w-3.5 mr-1" />Criar link</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminLinksPage() {
  const { user } = usePlatformAuth();
  const [links, setLinks] = useState<ExtraLink[]>([]);
  const [loading, setLoading] = useState(true);

  if (!user || user.role !== "admin") return <Navigate to="/" replace />;

  useEffect(() => {
    api.get()
      .then(setLinks)
      .catch(() => toast.error("Erro ao carregar links"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /><span>Carregando…</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="space-y-1">
        <h1 className="text-xl font-bold">Links Extras</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie os links da seção <span className="font-medium text-foreground">Extras</span> na sidebar dos usuários. Cada link abre em nova aba.
        </p>
      </div>

      <div className="space-y-3">
        {links.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum link cadastrado ainda.</p>
        )}
        {links.map((link) => (
          <LinkCard
            key={link.key}
            link={link}
            onSaved={(updated) => setLinks((prev) => prev.map((l) => l.key === updated.key ? updated : l))}
            onDeleted={(key) => setLinks((prev) => prev.filter((l) => l.key !== key))}
          />
        ))}
        <NewLinkForm onCreated={(created) => setLinks((prev) => [...prev, created])} />
      </div>
    </div>
  );
}
