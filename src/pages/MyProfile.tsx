import { useState } from "react";
import { usePlatformAuth } from "@/contexts/PlatformAuthContext";
import { updateProfile, changePassword } from "@/lib/api/platformAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { User, Mail, Shield, Phone, FileText, Lock, Pencil, Check, X } from "lucide-react";

export default function MyProfilePage() {
  const { user, logout, refreshUser } = usePlatformAuth();
  const { toast } = useToast();

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: user?.name ?? "",
  });
  const [savingProfile, setSavingProfile] = useState(false);

  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [savingPassword, setSavingPassword] = useState(false);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await updateProfile({ name: profileForm.name });
      await refreshUser();
      toast({ title: "Perfil atualizado com sucesso!" });
      setEditingProfile(false);
    } catch (e: unknown) {
      const err = e as { detail?: string };
      toast({ title: "Erro ao salvar perfil", description: err?.detail ?? "Tente novamente.", variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (passwordForm.next !== passwordForm.confirm) {
      toast({ title: "As senhas não coincidem.", variant: "destructive" });
      return;
    }
    if (passwordForm.next.length < 6) {
      toast({ title: "A nova senha deve ter pelo menos 6 caracteres.", variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword(passwordForm.current, passwordForm.next);
      toast({ title: "Senha alterada com sucesso!" });
      setChangingPassword(false);
      setPasswordForm({ current: "", next: "", confirm: "" });
      // forçar re-login após troca de senha
      setTimeout(() => logout(), 1500);
    } catch (e: unknown) {
      const err = e as { detail?: string };
      toast({ title: "Erro ao trocar senha", description: err?.detail ?? "Senha atual incorreta.", variant: "destructive" });
    } finally {
      setSavingPassword(false);
    }
  };

  const cancelEditProfile = () => {
    setProfileForm({ name: user?.name ?? "" });
    setEditingProfile(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Meu Perfil</h1>
        <p className="text-muted-foreground text-sm mt-1">Gerencie suas informações pessoais e segurança</p>
      </div>

      {/* Avatar + email */}
      <Card className="border-border bg-card">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 border border-primary/30 shrink-0">
              <span className="text-2xl font-bold text-primary uppercase">
                {(user?.name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
              </span>
            </div>
            <div>
              <p className="font-bold text-lg text-foreground leading-tight">
                {user?.name || user?.email?.split("@")[0] || "—"}
              </p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              {user?.role === "admin" && (
                <Badge variant="outline" className="mt-1.5 border-primary/40 text-primary text-xs gap-1">
                  <Shield className="h-3 w-3" />
                  Administrador
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dados pessoais */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Dados pessoais
          </CardTitle>
          {!editingProfile && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => setEditingProfile(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {editingProfile ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="name">Nome completo</Label>
                <Input
                  id="name"
                  placeholder="Seu nome completo"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              {/* Campos somente leitura */}
              {[
                { label: "E-mail", value: user?.email ?? "" },
                { label: "WhatsApp / Telefone", value: user?.phone ?? "" },
                { label: "CPF", value: user?.cpf ?? "" },
              ].map(({ label, value }) => (
                <div key={label} className="space-y-1.5">
                  <Label className="text-muted-foreground">{label}</Label>
                  <Input value={value || "—"} disabled className="opacity-60 cursor-not-allowed" />
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <Button onClick={handleSaveProfile} disabled={savingProfile} className="gap-1.5">
                  <Check className="h-4 w-4" />
                  {savingProfile ? "Salvando..." : "Salvar"}
                </Button>
                <Button variant="ghost" onClick={cancelEditProfile} disabled={savingProfile} className="gap-1.5">
                  <X className="h-4 w-4" />
                  Cancelar
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              {[
                { icon: User, label: "Nome completo", value: user?.name || "—" },
                { icon: Mail, label: "E-mail", value: user?.email || "—" },
                { icon: Phone, label: "WhatsApp / Telefone", value: user?.phone || "—" },
                { icon: FileText, label: "CPF", value: user?.cpf || "—" },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    <p className="text-sm font-medium text-foreground">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trocar senha */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            Segurança
          </CardTitle>
          {!changingPassword && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => setChangingPassword(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Trocar senha
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {changingPassword ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cur-pass">Senha atual</Label>
                <Input
                  id="cur-pass"
                  type="password"
                  placeholder="••••••••"
                  value={passwordForm.current}
                  onChange={(e) => setPasswordForm((p) => ({ ...p, current: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-pass">Nova senha</Label>
                <Input
                  id="new-pass"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={passwordForm.next}
                  onChange={(e) => setPasswordForm((p) => ({ ...p, next: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-pass">Confirmar nova senha</Label>
                <Input
                  id="confirm-pass"
                  type="password"
                  placeholder="Repita a nova senha"
                  value={passwordForm.confirm}
                  onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">Após trocar a senha você será deslogado automaticamente.</p>
              <div className="flex gap-2 pt-1">
                <Button onClick={handleChangePassword} disabled={savingPassword} className="gap-1.5">
                  <Check className="h-4 w-4" />
                  {savingPassword ? "Salvando..." : "Confirmar"}
                </Button>
                <Button variant="ghost" onClick={() => { setChangingPassword(false); setPasswordForm({ current: "", next: "", confirm: "" }); }} disabled={savingPassword} className="gap-1.5">
                  <X className="h-4 w-4" />
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Clique em "Trocar senha" para alterar sua senha de acesso.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
