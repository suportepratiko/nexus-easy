import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Users,
  UserCheck,
  UserX,
  CalendarClock,
  Loader2,
  Crown,
  Search,
  UserPlus,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  type AdminUserItem,
  type AdminCreateUserPayload,
  type AdminUpdateUserPayload,
} from "@/lib/api/admin";
import { getPlans, type Plan, type PlanPeriodType } from "@/lib/api/plans";

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    const d = new Date(value);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatDateOnly(value: string | null): string {
  if (!value) return "—";
  try {
    const d = new Date(value);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

const periodLabels: Record<PlanPeriodType, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function toDateOnly(isoOrNull: string | null | undefined): string {
  if (!isoOrNull) return "";
  try {
    const d = new Date(isoOrNull);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

const emptyUserForm = {
  email: "",
  password: "",
  name: "",
  phone: "",
  cpf: "",
  plan: "",
  plan_period: "",
  role: "user",
  expires_at: "",
};

export default function AdminUsersPage() {
  const [data, setData] = useState<{
    users: AdminUserItem[];
    total: number;
    active: number;
    inactive: number;
    expiring_in_7_days: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [userToDelete, setUserToDelete] = useState<AdminUserItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editUser, setEditUser] = useState<AdminUserItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyUserForm);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    getPlans().then(setPlans).catch(() => setPlans([]));
  }, []);

  const planOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    plans.forEach((plan) => {
      (plan.periods ?? []).forEach((period) => {
        if (!period.is_active) return;
        const label = periodLabels[period.period_type]
          ? `${plan.name} (${periodLabels[period.period_type]})`
          : `${plan.name} (${period.period_type})`;
        opts.push({ value: `${plan.code}:${period.period_type}`, label });
      });
    });
    return opts;
  }, [plans]);

  const loadUsers = useCallback(() => {
    setLoading(true);
    setError(null);
    getAdminUsers(search.trim() || undefined)
      .then((res) => {
        setData({
          users: res.users,
          total: res.total,
          active: res.active,
          inactive: res.inactive,
          expiring_in_7_days: res.expiring_in_7_days,
        });
      })
      .catch((e: { detail?: string; message?: string }) => {
        setError(e?.detail ?? e?.message ?? "Erro ao carregar usuários.");
      })
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    setCurrentPage(1);
    const t = setTimeout(() => loadUsers(), 300);
    return () => clearTimeout(t);
  }, [loadUsers]);

  // Atualiza a lista ao voltar para a aba (ex.: após criar usuário via webhook)
  useEffect(() => {
    const onFocus = () => loadUsers();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadUsers]);

  const handleDeleteConfirm = () => {
    if (!userToDelete) return;
    setDeleteLoading(true);
    deleteAdminUser(userToDelete.id)
      .then(() => {
        setUserToDelete(null);
        loadUsers();
      })
      .catch((e: { detail?: string }) => {
        setError(e?.detail ?? "Erro ao excluir.");
      })
      .finally(() => setDeleteLoading(false));
  };

  const openCreate = () => {
    setSearch("");
    setForm(emptyUserForm);
    setFormError(null);
    setCreateOpen(true);
  };

  const openEdit = (u: AdminUserItem) => {
    setEditUser(u);
    const planPeriod = (u as { plan_period?: string }).plan_period ?? "";
    setForm({
      email: u.email,
      password: "",
      name: u.name ?? "",
      phone: u.phone ?? "",
      cpf: u.cpf ?? "",
      plan: u.plan ?? "",
      plan_period: planPeriod,
      role: u.role,
      expires_at: toDateOnly(u.expires_at ?? null),
    });
    setFormError(null);
  };

  const closeForm = () => {
    setCreateOpen(false);
    setEditUser(null);
    setForm(emptyUserForm);
    setFormError(null);
  };

  const handleCreate = () => {
    if (!form.email.trim()) {
      setFormError("E-mail é obrigatório.");
      return;
    }
    if (!form.password.trim()) {
      setFormError("Senha é obrigatória.");
      return;
    }
    setFormLoading(true);
    setFormError(null);
    const payload: AdminCreateUserPayload = {
      email: form.email.trim(),
      password: form.password,
      name: form.name.trim() || undefined,
      phone: form.phone.trim() || undefined,
      cpf: form.cpf.trim() || undefined,
      plan: form.plan.trim() || undefined,
      plan_period: form.plan_period.trim() || undefined,
      role: form.role,
      expires_at: form.expires_at.trim() || undefined,
    };
    createAdminUser(payload)
      .then(() => {
        closeForm();
        setSearch("");
        loadUsers();
      })
      .catch((e: { detail?: string }) => {
        setFormError(e?.detail ?? "Erro ao criar usuário.");
      })
      .finally(() => setFormLoading(false));
  };

  const handleUpdate = () => {
    if (!editUser) return;
    if (!form.email.trim()) {
      setFormError("E-mail é obrigatório.");
      return;
    }
    setFormLoading(true);
    setFormError(null);
    const payload: AdminUpdateUserPayload = {
      email: form.email.trim(),
      name: form.name.trim() || undefined,
      phone: form.phone.trim() || undefined,
      cpf: form.cpf.trim() || undefined,
      plan: form.plan.trim() || undefined,
      plan_period: form.plan_period.trim() || undefined,
      role: form.role,
      expires_at: form.expires_at.trim() || null,
    };
    updateAdminUser(editUser.id, payload)
      .then(() => {
        closeForm();
        setSearch("");
        loadUsers();
      })
      .catch((e: { detail?: string }) => {
        setFormError(e?.detail ?? "Erro ao atualizar.");
      })
      .finally(() => setFormLoading(false));
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[320px] gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando usuários…</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <Card className="glass-card border-destructive/50">
        <CardContent className="pt-6">
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const cardBaseClass = "border-border/60 bg-card/80";
  const cards = [
    { title: "Total de usuários", value: data?.total ?? 0, icon: Users, valueClass: "text-foreground", iconClass: "text-muted-foreground" },
    { title: "Usuários ativos", value: data?.active ?? 0, icon: UserCheck, valueClass: "text-green-600 dark:text-green-400", iconClass: "text-green-600 dark:text-green-400" },
    { title: "Usuários inativos", value: data?.inactive ?? 0, icon: UserX, valueClass: "text-red-600 dark:text-red-400", iconClass: "text-red-600 dark:text-red-400" },
    { title: "A vencer em 7 dias", value: data?.expiring_in_7_days ?? 0, icon: CalendarClock, valueClass: "text-amber-600 dark:text-amber-400", iconClass: "text-amber-600 dark:text-amber-400" },
  ];

  const allUsers = data?.users ?? [];
  const totalPages = Math.max(1, Math.ceil(allUsers.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const users = allUsers.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Visão geral dos usuários cadastrados na plataforma.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 shrink-0">
          <UserPlus className="h-4 w-4" />
          Criar usuário
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ title, value, icon: Icon, valueClass, iconClass }) => (
          <Card key={title} className={`glass-card ${cardBaseClass}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
              <Icon className={`h-7 w-7 shrink-0 ${iconClass}`} />
            </CardHeader>
            <CardContent>
              <span className={`text-2xl font-bold tabular-nums ${valueClass}`}>{value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="glass-card">
        <CardHeader className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base">Lista de usuários</CardTitle>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="admin-users-search"
                name="admin-users-search"
                type="text"
                autoComplete="new-password"
                placeholder="Buscar por nome, e-mail, telefone ou CPF"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border/60 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/60">
                  <TableHead className="text-xs font-medium text-muted-foreground">Nome</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">E-mail</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Telefone</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">CPF</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Plano</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Vencimento</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Status</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right w-[120px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Nenhum usuário encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => (
                    <TableRow key={u.id} className="border-border/40">
                      <TableCell className="text-sm text-foreground">{u.name || "—"}</TableCell>
                      <TableCell className="font-medium text-foreground text-sm">
                        <span className="inline-flex items-center gap-1.5">
                          {u.email}
                          {u.role === "admin" && (
                            <Crown className="h-4 w-4 text-amber-500 dark:text-amber-400 shrink-0" title="Admin" />
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.phone || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.cpf || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.plan_display ?? u.plan ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.expires_at ? formatDateOnly(u.expires_at) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            (u.status_display ?? (u.is_active ? "Ativo" : "Inativo")) === "Ativo"
                              ? "bg-success/15 text-success border-success/30"
                              : "bg-destructive/15 text-destructive border-destructive/30"
                          }
                        >
                          {u.status_display ?? (u.is_active ? "Ativo" : "Inativo")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(u)}
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setUserToDelete(u)}
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginação */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Exibir</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>por página</span>
            </div>

            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span>
                {allUsers.length === 0
                  ? "0 usuários"
                  : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, allUsers.length)} de ${allUsers.length}`}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage(1)}
              >
                «
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                ‹
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === "..." ? (
                    <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">…</span>
                  ) : (
                    <Button
                      key={item}
                      variant={item === safePage ? "default" : "outline"}
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setCurrentPage(item as number)}
                    >
                      {item}
                    </Button>
                  )
                )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                ›
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage(totalPages)}
              >
                »
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal de confirmação de exclusão */}
      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{userToDelete?.email}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteConfirm();
              }}
              disabled={deleteLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal Criar / Editar usuário */}
      <Dialog open={createOpen || !!editUser} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editUser ? "Editar usuário" : "Criar usuário"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {formError && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{formError}</p>
            )}
            <div className="grid gap-2">
              <Label htmlFor="form-name">Nome</Label>
              <Input
                id="form-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nome completo"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="form-email">E-mail *</Label>
              <Input
                id="form-email"
                type="email"
                autoComplete="new-password"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@exemplo.com"
                disabled={!!editUser}
              />
            </div>
            {!editUser && (
              <div className="grid gap-2">
                <Label htmlFor="form-password">Senha *</Label>
                <Input
                  id="form-password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="form-phone">Telefone</Label>
              <Input
                id="form-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: formatPhone(e.target.value) }))}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="form-cpf">CPF</Label>
              <Input
                id="form-cpf"
                value={form.cpf}
                onChange={(e) => setForm((f) => ({ ...f, cpf: formatCPF(e.target.value) }))}
                placeholder="000.000.000-00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="form-plan">Plano</Label>
              <select
                id="form-plan"
                value={form.plan && form.plan_period ? `${form.plan}:${form.plan_period}` : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) {
                    setForm((f) => ({ ...f, plan: "", plan_period: "" }));
                    return;
                  }
                  const [code, period] = v.split(":");
                  setForm((f) => ({ ...f, plan: code || "", plan_period: period || "" }));
                }}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">Selecione um plano</option>
                {planOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="form-expires">Data de vencimento</Label>
              <Input
                id="form-expires"
                type="date"
                value={form.expires_at}
                onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="form-role">Perfil</Label>
              <select
                id="form-role"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="user">Usuário</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm} disabled={formLoading}>
              Cancelar
            </Button>
            <Button onClick={editUser ? handleUpdate : handleCreate} disabled={formLoading}>
              {formLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : editUser ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
