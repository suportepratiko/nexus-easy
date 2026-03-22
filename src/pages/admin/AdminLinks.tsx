import { useEffect, useRef, useState } from "react";
import * as LucideIcons from "lucide-react";
import { ExternalLink, Link2, Loader2, Save, Plus, Trash2, Pencil, X, Check, GripVertical } from "lucide-react";
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
import { BRAND_ICONS } from "@/lib/brandIcons";

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

function getLucideIcon(name: string): { Icon: React.ElementType; color?: string } {
  const brand = BRAND_ICONS[name];
  if (brand) return { Icon: brand.icon, color: brand.color };
  const icon = (LucideIcons as Record<string, unknown>)[name];
  if (typeof icon === "function" || (typeof icon === "object" && icon !== null)) {
    return { Icon: icon as React.ElementType };
  }
  return { Icon: LucideIcons.Link };
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
  reorder: (keys: string[]) =>
    fetch("/api/platform/admin/extra-links/reorder", { method: "POST", headers: api.headers(), body: JSON.stringify({ keys }) }).then((r) => { if (!r.ok) throw new Error(); }),
};

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { Icon } = getLucideIcon(value);
  const filtered = AVAILABLE_ICONS.filter((n) => n.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-background text-sm hover:bg-accent transition-colors w-full"
      >
        <Icon className="h-4 w-4 shrink-0" />
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
              const { Icon: I } = getLucideIcon(name);
              return (
                <button
                  key={name}
                  type="button"
                  title={name}
                  onClick={() => { onChange(name); setOpen(false); setSearch(""); }}
                  className={`flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-primary/10 ${value === name ? "bg-primary/15" : "text-muted-foreground"}`}
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
  dragHandleProps,
}: {
  link: ExtraLink;
  onSaved: (updated: ExtraLink) => void;
  onDeleted: (key: string) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<LinkFormState>({ label: link.label, url: link.url, icon: link.icon, is_active: link.is_active });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { Icon, color: iconColor } = getLucideIcon(form.icon);

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
            <div
              {...dragHandleProps}
              className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0 touch-none"
            >
              <GripVertical className="h-4 w-4" />
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-4 w-4" style={iconColor ? { color: iconColor } : { color: "hsl(var(--primary))" }} />
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
  const dragIndexRef = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  if (!user || user.role !== "admin") return <Navigate to="/" replace />;

  useEffect(() => {
    api.get()
      .then(setLinks)
      .catch(() => toast.error("Erro ao carregar links"))
      .finally(() => setLoading(false));
  }, []);

  const handleDragStart = (index: number) => {
    dragIndexRef.current = index;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOver(index);
  };

  const handleDrop = async (dropIndex: number) => {
    const dragIndex = dragIndexRef.current;
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragOver(null);
      dragIndexRef.current = null;
      return;
    }
    const reordered = [...links];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    setLinks(reordered);
    setDragOver(null);
    dragIndexRef.current = null;
    try {
      await api.reorder(reordered.map((l) => l.key));
    } catch {
      toast.error("Falha ao salvar nova ordem.");
    }
  };

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
          Gerencie os links da seção <span className="font-medium text-foreground">Extras</span> na sidebar dos usuários. Arraste para reordenar.
        </p>
      </div>

      <div className="space-y-3">
        {links.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum link cadastrado ainda.</p>
        )}
        {links.map((link, index) => (
          <div
            key={link.key}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={() => setDragOver(null)}
            onDrop={() => handleDrop(index)}
            onDragEnd={() => { setDragOver(null); dragIndexRef.current = null; }}
            className={`transition-all duration-150 rounded-xl ${dragOver === index && dragIndexRef.current !== index ? "ring-2 ring-primary/50 scale-[1.01]" : ""}`}
          >
            <LinkCard
              link={link}
              onSaved={(updated) => setLinks((prev) => prev.map((l) => l.key === updated.key ? updated : l))}
              onDeleted={(key) => setLinks((prev) => prev.filter((l) => l.key !== key))}
              dragHandleProps={{}}
            />
          </div>
        ))}
        <NewLinkForm onCreated={(created) => setLinks((prev) => [...prev, created])} />
      </div>
    </div>
  );
}
