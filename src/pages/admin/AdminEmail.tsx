import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { usePlatformAuth } from "@/contexts/PlatformAuthContext";
import { getPlatformToken } from "@/lib/api/platformAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import {
  Mail, Server, Plus, Edit2, Trash2, Send, Wifi, WifiOff, CheckCircle2,
  AlertCircle, FileText, Clock, Eye, Code2, Zap, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import {
  listSmtp, createSmtp, updateSmtp, deleteSmtp, testSmtpConnection, sendTestEmail,
  listTemplates, createTemplate, updateTemplate, deleteTemplate, triggerEmail, getEmailLogs,
  clearEmailLogs, getEventTypes, getTemplateVariables,
  type SmtpConfig, type EmailTemplate, type EmailLog,
} from "@/lib/api/email";

const DEFAULT_TEMPLATES: Record<string, { subject: string; html: string }> = {
  welcome: {
    subject: "Bem-vindo ao Nexus Bot, {{nome}}! 🚀",
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:40px auto;background:#111;border-radius:12px;overflow:hidden;border:1px solid #1a1a1a">
  <div style="background:linear-gradient(135deg,#00ff88,#00cc66);padding:40px;text-align:center">
    <h1 style="color:#000;margin:0;font-size:28px;font-weight:800">Nexus Bot</h1>
    <p style="color:#003322;margin:8px 0 0;font-size:14px">Robô Automático de Opções Binárias</p>
  </div>
  <div style="padding:40px">
    <h2 style="color:#fff;margin:0 0 16px">Olá, {{nome}}! 👋</h2>
    <p style="color:#aaa;line-height:1.6">Seu acesso ao <strong style="color:#00ff88">Nexus Bot</strong> foi liberado com sucesso!</p>
    <div style="background:#1a1a1a;border-radius:8px;padding:20px;margin:24px 0;border-left:4px solid #00ff88">
      <p style="color:#fff;margin:0 0 8px"><strong>Plano:</strong> <span style="color:#00ff88">{{plano}}</span></p>
      <p style="color:#fff;margin:0 0 8px"><strong>Validade:</strong> {{vencimento}}</p>
      <p style="color:#fff;margin:0 0 8px"><strong>E-mail de acesso:</strong> <span style="color:#00ff88">{{email}}</span></p>
      <p style="color:#fff;margin:0"><strong>Senha inicial:</strong> <span style="color:#00ff88;font-family:monospace;font-size:15px;letter-spacing:1px">{{senha_padrao}}</span></p>
    </div>
    <p style="color:#aaa;line-height:1.6;font-size:13px">⚠️ Por segurança, recomendamos que você altere sua senha após o primeiro acesso.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="{{link_acesso}}/login" style="background:#00ff88;color:#000;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px">Acessar Plataforma →</a>
    </div>
  </div>
  <div style="background:#0a0a0a;padding:20px;text-align:center">
    <p style="color:#555;font-size:12px;margin:0">© {{ano}} Nexus Bot. Todos os direitos reservados.</p>
  </div>
</div></body></html>`,
  },
  expiry_warning: {
    subject: "⚠️ Sua assinatura vence em {{dias_restantes}} dias — Nexus Bot",
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:40px auto;background:#111;border-radius:12px;overflow:hidden;border:1px solid #1a1a1a">
  <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:40px;text-align:center">
    <h1 style="color:#000;margin:0;font-size:28px;font-weight:800">Nexus Bot</h1>
    <p style="color:#7c3a00;margin:8px 0 0;font-size:14px">⚠️ Aviso de Vencimento de Assinatura</p>
  </div>
  <div style="padding:40px">
    <h2 style="color:#fff;margin:0 0 16px">Olá, {{nome}}!</h2>
    <p style="color:#aaa;line-height:1.6">Sua assinatura do <strong style="color:#f59e0b">Nexus Bot</strong> está prestes a vencer.</p>
    <div style="background:#1a1a1a;border-radius:8px;padding:20px;margin:24px 0;border-left:4px solid #f59e0b">
      <p style="color:#fff;margin:0 0 8px"><strong>Plano:</strong> <span style="color:#f59e0b">{{plano}}</span></p>
      <p style="color:#fff;margin:0 0 8px"><strong>Vence em:</strong> <span style="color:#f59e0b;font-weight:700">{{dias_restantes}} dias</span> ({{vencimento}})</p>
      <p style="color:#fff;margin:0"><strong>E-mail de acesso:</strong> {{email}}</p>
    </div>
    <p style="color:#aaa;line-height:1.6">Renove agora para não perder acesso ao robô automático e continuar operando.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="{{link_acesso}}/login" style="background:#f59e0b;color:#000;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px">Renovar Agora →</a>
    </div>
  </div>
  <div style="background:#0a0a0a;padding:20px;text-align:center">
    <p style="color:#555;font-size:12px;margin:0">© {{ano}} Nexus Bot. Todos os direitos reservados.</p>
  </div>
</div></body></html>`,
  },
  expired: {
    subject: "❌ Sua assinatura Nexus Bot venceu — Renove já!",
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:40px auto;background:#111;border-radius:12px;overflow:hidden;border:1px solid #1a1a1a">
  <div style="background:linear-gradient(135deg,#ef4444,#dc2626);padding:40px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:28px;font-weight:800">Nexus Bot</h1>
    <p style="color:#fecaca;margin:8px 0 0;font-size:14px">Assinatura Vencida</p>
  </div>
  <div style="padding:40px">
    <h2 style="color:#fff;margin:0 0 16px">Olá, {{nome}}!</h2>
    <p style="color:#aaa;line-height:1.6">Sua assinatura do <strong style="color:#ef4444">Nexus Bot</strong> venceu e seu acesso foi <strong style="color:#ef4444">suspenso</strong>.</p>
    <div style="background:#1a1a1a;border-radius:8px;padding:20px;margin:24px 0;border-left:4px solid #ef4444">
      <p style="color:#fff;margin:0 0 8px"><strong>Plano:</strong> <span style="color:#ef4444">{{plano}}</span></p>
      <p style="color:#fff;margin:0 0 8px"><strong>Venceu em:</strong> {{vencimento}}</p>
      <p style="color:#fff;margin:0"><strong>E-mail de acesso:</strong> {{email}}</p>
    </div>
    <p style="color:#aaa;line-height:1.6">Renove sua assinatura para voltar a usar o robô automático e operar normalmente.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="{{link_acesso}}/login" style="background:#ef4444;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px">Renovar Assinatura →</a>
    </div>
  </div>
  <div style="background:#0a0a0a;padding:20px;text-align:center">
    <p style="color:#555;font-size:12px;margin:0">© {{ano}} Nexus Bot. Todos os direitos reservados.</p>
  </div>
</div></body></html>`,
  },
  plan_activated: {
    subject: "✅ Plano ativado/renovado com sucesso — Nexus Bot",
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:40px auto;background:#111;border-radius:12px;overflow:hidden;border:1px solid #1a1a1a">
  <div style="background:linear-gradient(135deg,#00ff88,#00cc66);padding:40px;text-align:center">
    <h1 style="color:#000;margin:0;font-size:28px;font-weight:800">Nexus Bot</h1>
    <p style="color:#003322;margin:8px 0 0;font-size:14px">✅ Plano Ativado / Renovado com Sucesso!</p>
  </div>
  <div style="padding:40px">
    <h2 style="color:#fff;margin:0 0 16px">Olá, {{nome}}!</h2>
    <p style="color:#aaa;line-height:1.6">Seu plano no <strong style="color:#00ff88">Nexus Bot</strong> foi ativado/renovado com sucesso. Você já pode operar normalmente!</p>
    <div style="background:#1a1a1a;border-radius:8px;padding:20px;margin:24px 0;border-left:4px solid #00ff88">
      <p style="color:#fff;margin:0 0 8px"><strong>Plano:</strong> <span style="color:#00ff88">{{plano}}</span></p>
      <p style="color:#fff;margin:0 0 8px"><strong>Nova validade:</strong> <span style="color:#00ff88">{{vencimento}}</span></p>
      <p style="color:#fff;margin:0"><strong>E-mail de acesso:</strong> {{email}}</p>
    </div>
    <div style="text-align:center;margin:32px 0">
      <a href="{{link_acesso}}/login" style="background:#00ff88;color:#000;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px">Acessar Plataforma →</a>
    </div>
  </div>
  <div style="background:#0a0a0a;padding:20px;text-align:center">
    <p style="color:#555;font-size:12px;margin:0">© {{ano}} Nexus Bot. Todos os direitos reservados.</p>
  </div>
</div></body></html>`,
  },
  password_reset: {
    subject: "🔑 Recuperação de senha — Nexus Bot",
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:40px auto;background:#111;border-radius:12px;overflow:hidden;border:1px solid #1a1a1a">
  <div style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:40px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:28px;font-weight:800">Nexus Bot</h1>
    <p style="color:#c7d2fe;margin:8px 0 0;font-size:14px">🔑 Recuperação de Senha</p>
  </div>
  <div style="padding:40px">
    <h2 style="color:#fff;margin:0 0 16px">Olá, {{nome}}!</h2>
    <p style="color:#aaa;line-height:1.6">Recebemos uma solicitação de recuperação de senha para sua conta.</p>
    <div style="background:#1a1a1a;border-radius:8px;padding:20px;margin:24px 0;border-left:4px solid #6366f1">
      <p style="color:#fff;margin:0 0 8px"><strong>E-mail de acesso:</strong> <span style="color:#6366f1">{{email}}</span></p>
      <p style="color:#aaa;margin:8px 0 4px;font-size:13px">Sua nova senha temporária:</p>
      <p style="margin:0;text-align:center"><code style="color:#6366f1;font-size:22px;font-weight:700;letter-spacing:3px;background:#0d0d2b;padding:8px 16px;border-radius:6px;display:inline-block">{{senha_temp}}</code></p>
    </div>
    <p style="color:#f59e0b;line-height:1.6;font-size:13px">⚠️ Por segurança, acesse a plataforma e altere sua senha imediatamente após o login.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="{{link_acesso}}/login" style="background:#6366f1;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px">Acessar Plataforma →</a>
    </div>
  </div>
  <div style="background:#0a0a0a;padding:20px;text-align:center">
    <p style="color:#555;font-size:12px;margin:0">© {{ano}} Nexus Bot. Todos os direitos reservados.</p>
  </div>
</div></body></html>`,
  },
};

function translateSmtpError(msg: string | null | undefined): string {
  if (!msg) return "Erro desconhecido.";
  const m = msg.toLowerCase();
  if (m.includes("name or service not known") || m.includes("errno -2") || m.includes("nodename nor servname"))
    return "Servidor SMTP não encontrado. Verifique se o Host está correto (ex: smtp.gmail.com).";
  if (m.includes("connection refused") || m.includes("errno 111"))
    return "Conexão recusada. Verifique o Host e a Porta do servidor SMTP.";
  if (m.includes("timed out") || m.includes("timeout"))
    return "Tempo de conexão esgotado. O servidor SMTP não respondeu — verifique o Host e a Porta.";
  if (m.includes("authentication") || m.includes("535") || m.includes("invalid credentials") || m.includes("username and password"))
    return "Autenticação falhou. Verifique o Usuário e a Senha SMTP.";
  if (m.includes("starttls") || m.includes("ssl") || m.includes("tls"))
    return "Erro de SSL/TLS. Tente alternar a opção SSL/TLS ou mudar a porta (587 sem SSL, 465 com SSL).";
  if (m.includes("550") || m.includes("relay"))
    return "O servidor recusou o envio (relay negado). Verifique se o email remetente é permitido.";
  if (m.includes("recipient") || m.includes("554"))
    return "Destinatário inválido ou rejeitado pelo servidor.";
  return msg;
}

export default function AdminEmailPage() {
  const { user } = usePlatformAuth();
  const token = getPlatformToken();

  const [smtpList, setSmtpList] = useState<SmtpConfig[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [eventTypes, setEventTypes] = useState<Record<string, string>>({});
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // SMTP form
  const [smtpDialog, setSmtpDialog] = useState(false);
  const [editingSmtp, setEditingSmtp] = useState<SmtpConfig | null>(null);
  const [smtpForm, setSmtpForm] = useState({ name: "", host: "", port: 587, secure: false, auth_user: "", auth_password: "", from_email: "", from_name: "" });
  const [testingConn, setTestingConn] = useState(false);
  const [testEmailDialog, setTestEmailDialog] = useState<SmtpConfig | null>(null);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [deleteSmtpId, setDeleteSmtpId] = useState<string | null>(null);

  // Template form
  const [tmplDialog, setTmplDialog] = useState(false);
  const [editingTmpl, setEditingTmpl] = useState<EmailTemplate | null>(null);
  const [tmplForm, setTmplForm] = useState({ event_type: "", name: "", subject: "", html_content: "" });
  const [previewHtml, setPreviewHtml] = useState(false);
  const [deleteTmplId, setDeleteTmplId] = useState<string | null>(null);

  // Trigger manual
  const [triggerDialog, setTriggerDialog] = useState(false);
  const [triggerEvent, setTriggerEvent] = useState("");
  const [triggerEmail2, setTriggerEmail2] = useState("");

  useEffect(() => {
    const t = getPlatformToken();
    if (!t) {
      setPageLoading(false);
      setPageError("Token de autenticação não encontrado. Faça login novamente.");
      return;
    }
    setPageLoading(true);
    setPageError(null);
    Promise.allSettled([
      listSmtp(t).then(setSmtpList),
      listTemplates(t).then(setTemplates),
      getEventTypes(t).then(setEventTypes),
      getTemplateVariables(t).then(setTemplateVars),
      getEmailLogs(t).then(r => { setLogs(r.items); setLogsTotal(r.total); }),
    ]).then((results) => {
      // Mostrar erro apenas se SMTP (índice 0) falhou — as outras chamadas são secundárias
      const smtpResult = results[0];
      if (smtpResult.status === "rejected") {
        const err = smtpResult.reason as { detail?: string; message?: string };
        setPageError(err?.detail ?? err?.message ?? "Erro ao carregar configurações SMTP.");
      }
    }).finally(() => setPageLoading(false));
  }, []);

  if (!user || user.role !== "admin") return <Navigate to="/" replace />;

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center min-h-[320px] gap-2 text-muted-foreground">
        <span className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full" />
        <span>Carregando configurações de email…</span>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] gap-4">
        <p className="text-destructive text-sm">{pageError}</p>
        <button
          className="text-sm underline text-muted-foreground"
          onClick={() => window.location.reload()}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const refreshLogs = () => {
    const t = getPlatformToken();
    if (!t) return;
    getEmailLogs(t).then(r => { setLogs(r.items); setLogsTotal(r.total); });
  };

  const openSmtpCreate = () => {
    setEditingSmtp(null);
    setSmtpForm({ name: "", host: "", port: 587, secure: false, auth_user: "", auth_password: "", from_email: "", from_name: "" });
    setSmtpDialog(true);
  };

  const openSmtpEdit = (s: SmtpConfig) => {
    setEditingSmtp(s);
    setSmtpForm({ name: s.name, host: s.host, port: s.port, secure: s.secure, auth_user: s.auth_user, auth_password: "", from_email: s.from_email, from_name: s.from_name || "" });
    setSmtpDialog(true);
  };

  const saveSmtp = async () => {
    const t = getPlatformToken(); if (!t) return; const token = t;
    if (smtpForm.host.includes("@")) {
      toast.error("O campo 'Host SMTP' deve ser o endereço do servidor (ex: smtp.gmail.com), não um e-mail.");
      return;
    }
    if (!smtpForm.host.trim() || !smtpForm.auth_user.trim() || !smtpForm.from_email.trim()) {
      toast.error("Preencha os campos obrigatórios: Host, Usuário e Email remetente.");
      return;
    }
    setLoading(true);
    try {
      if (editingSmtp) {
        const updated = await updateSmtp(token, editingSmtp.id, smtpForm);
        setSmtpList(l => l.map(s => s.id === updated.id ? updated : s));
      } else {
        const created = await createSmtp(token, smtpForm);
        setSmtpList(l => [...l, created]);
      }
      setSmtpDialog(false);
      toast.success(editingSmtp ? "SMTP atualizado!" : "SMTP configurado!");
    } catch (e: unknown) {
      toast.error((e as { detail?: string }).detail || "Erro ao salvar.");
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    const t = getPlatformToken(); if (!t) return; const token = t;
    if (smtpForm.host.includes("@")) {
      toast.error("O campo 'Host SMTP' está com um e-mail. Use o endereço do servidor (ex: smtp.gmail.com).");
      return;
    }
    setTestingConn(true);
    try {
      const res = await testSmtpConnection(token, smtpForm);
      if (res.success) toast.success("✅ " + res.message);
      else toast.error("❌ " + translateSmtpError(res.message));
    } catch (e: unknown) {
      toast.error(translateSmtpError((e as { detail?: string }).detail || "Erro ao testar."));
    } finally {
      setTestingConn(false);
    }
  };

  const handleSendTest = async () => {
    const tk = getPlatformToken();
    if (!tk || !testEmailDialog) return;
    try {
      const res = await sendTestEmail(tk, testEmailDialog.id, testEmailTo);
      if (res.success) { toast.success("Email de teste enviado!"); setTestEmailDialog(null); }
      else toast.error(translateSmtpError(res.error || "Falha ao enviar."));
    } catch (e: unknown) {
      toast.error(translateSmtpError((e as { detail?: string }).detail || "Erro."));
    }
  };

  const handleDeleteSmtp = async () => {
    const tk = getPlatformToken();
    if (!tk || !deleteSmtpId) return;
    await deleteSmtp(tk, deleteSmtpId);
    setSmtpList(l => l.filter(s => s.id !== deleteSmtpId));
    setDeleteSmtpId(null);
    toast.success("Configuração removida.");
  };

  const openTmplCreate = (eventType?: string) => {
    setEditingTmpl(null);
    const def = eventType && DEFAULT_TEMPLATES[eventType];
    setTmplForm({ event_type: eventType || "", name: eventTypes[eventType || ""] || "", subject: def ? def.subject : "", html_content: def ? def.html : "" });
    setTmplDialog(true);
  };

  const openTmplEdit = (t: EmailTemplate) => {
    setEditingTmpl(t);
    setTmplForm({ event_type: t.event_type, name: t.name, subject: t.subject, html_content: t.html_content });
    setTmplDialog(true);
  };

  const saveTmpl = async () => {
    const t = getPlatformToken(); if (!t) return; const token = t;
    setLoading(true);
    try {
      if (editingTmpl) {
        const updated = await updateTemplate(token, editingTmpl.id, tmplForm);
        setTemplates(l => l.map(t => t.id === updated.id ? updated : t));
      } else {
        const created = await createTemplate(token, tmplForm);
        setTemplates(l => [...l, created]);
      }
      setTmplDialog(false);
      toast.success(editingTmpl ? "Template atualizado!" : "Template criado!");
    } catch (e: unknown) {
      toast.error((e as { detail?: string }).detail || "Erro ao salvar.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTmpl = async () => {
    const tk = getPlatformToken();
    if (!tk || !deleteTmplId) return;
    await deleteTemplate(tk, deleteTmplId);
    setTemplates(l => l.filter(t => t.id !== deleteTmplId));
    setDeleteTmplId(null);
    toast.success("Template removido.");
  };

  const handleTrigger = async () => {
    const t = getPlatformToken(); if (!t) return; const token = t;
    try {
      const res = await triggerEmail(token, triggerEvent, triggerEmail2);
      if (res.success) { toast.success("Email disparado com sucesso!"); setTriggerDialog(false); refreshLogs(); }
      else toast.error("Nenhum template ativo ou SMTP configurado.");
    } catch (e: unknown) {
      toast.error((e as { detail?: string }).detail || "Erro.");
    }
  };

  const handleClearLogs = async () => {
    const t = getPlatformToken(); if (!t) return; const token = t;
    await clearEmailLogs(token);
    setLogs([]);
    setLogsTotal(0);
    toast.success("Logs limpos.");
  };

  const toggleSmtpActive = async (s: SmtpConfig) => {
    const t = getPlatformToken(); if (!t) return; const token = t;
    const updated = await updateSmtp(token, s.id, { is_active: !s.is_active });
    setSmtpList(l => l.map(x => x.id === updated.id ? updated : x));
  };

  const toggleTmplActive = async (tmpl: EmailTemplate) => {
    const tk = getPlatformToken(); if (!tk) return;
    const updated = await updateTemplate(tk, tmpl.id, { is_active: !tmpl.is_active });
    setTemplates(l => l.map(x => x.id === updated.id ? updated : x));
  };

  const missingTemplates = Object.keys(eventTypes).filter(k => k !== "manual" && !templates.find(t => t.event_type === k));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Mail className="w-6 h-6 text-primary" /> Email Marketing</h1>
          <p className="text-muted-foreground text-sm mt-1">Configure SMTP, templates e gatilhos automáticos de email.</p>
        </div>
        <Button onClick={() => setTriggerDialog(true)} variant="outline" className="gap-2">
          <Zap className="w-4 h-4" /> Disparar Email Manual
        </Button>
      </div>

      <Tabs defaultValue="smtp">
        <TabsList>
          <TabsTrigger value="smtp"><Server className="w-4 h-4 mr-1" />SMTP</TabsTrigger>
          <TabsTrigger value="templates"><FileText className="w-4 h-4 mr-1" />Templates</TabsTrigger>
          <TabsTrigger value="logs"><Clock className="w-4 h-4 mr-1" />Logs</TabsTrigger>
        </TabsList>

        {/* ===== ABA SMTP ===== */}
        <TabsContent value="smtp" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Configure o servidor de envio de emails.</p>
            <Button onClick={openSmtpCreate} className="gap-2"><Plus className="w-4 h-4" />Adicionar SMTP</Button>
          </div>
          {smtpList.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Server className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Nenhuma configuração SMTP. Adicione uma para começar a enviar emails.</p>
            </CardContent></Card>
          ) : smtpList.map(s => (
            <Card key={s.id} className={s.is_active ? "border-primary/30" : "opacity-60"}>
              <CardContent className="py-4 flex items-center gap-4 flex-wrap">
                <div className={`p-2 rounded-full ${s.is_active ? "bg-primary/10" : "bg-muted"}`}>
                  {s.is_active ? <Wifi className="w-5 h-5 text-primary" /> : <WifiOff className="w-5 h-5 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-sm text-muted-foreground">{s.host}:{s.port} · {s.from_email} · {s.secure ? "SSL/TLS" : "STARTTLS"}</p>
                </div>
                <Switch checked={s.is_active} onCheckedChange={() => toggleSmtpActive(s)} />
                <Button size="sm" variant="outline" onClick={() => { setTestEmailDialog(s); setTestEmailTo(""); }} className="gap-1">
                  <Send className="w-3 h-3" />Testar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => openSmtpEdit(s)}><Edit2 className="w-4 h-4" /></Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteSmtpId(s.id)}><Trash2 className="w-4 h-4" /></Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ===== ABA TEMPLATES ===== */}
        <TabsContent value="templates" className="space-y-4 mt-4">
          {missingTemplates.length > 0 && (
            <Card className="border-yellow-500/30 bg-yellow-500/5">
              <CardContent className="py-3 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-yellow-400">Templates faltando</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {missingTemplates.map(k => (
                      <Button key={k} size="sm" variant="outline" className="h-7 text-xs gap-1 border-yellow-500/40" onClick={() => openTmplCreate(k)}>
                        <Plus className="w-3 h-3" />{eventTypes[k]}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Templates HTML com suporte a variáveis dinâmicas.</p>
            <Button onClick={() => openTmplCreate()} className="gap-2"><Plus className="w-4 h-4" />Novo Template</Button>
          </div>

          {templates.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Nenhum template criado ainda.</p>
            </CardContent></Card>
          ) : templates.map(t => (
            <Card key={t.id} className={t.is_active ? "border-primary/30" : "opacity-60"}>
              <CardContent className="py-4 flex items-center gap-4 flex-wrap">
                <div className={`p-2 rounded-full ${t.is_active ? "bg-primary/10" : "bg-muted"}`}>
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{t.name}</p>
                    <Badge variant="secondary" className="text-xs">{eventTypes[t.event_type] || t.event_type}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{t.subject}</p>
                </div>
                <Switch checked={t.is_active} onCheckedChange={() => toggleTmplActive(t)} />
                <Button size="sm" variant="ghost" onClick={() => openTmplEdit(t)}><Edit2 className="w-4 h-4" /></Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteTmplId(t.id)}><Trash2 className="w-4 h-4" /></Button>
              </CardContent>
            </Card>
          ))}

          {/* Variáveis disponíveis */}
          <Card className="border-border/40">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Code2 className="w-4 h-4" />Variáveis disponíveis nos templates</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(templateVars).map(([k, v]) => (
                  <div key={k} className="bg-muted/40 rounded px-3 py-2 text-xs">
                    <code className="text-primary font-mono">{k}</code>
                    <p className="text-muted-foreground mt-0.5">{v}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== ABA LOGS ===== */}
        <TabsContent value="logs" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Total de emails registrados: <strong>{logsTotal}</strong></p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={refreshLogs} className="gap-1"><RotateCcw className="w-3 h-3" />Atualizar</Button>
              <Button size="sm" variant="destructive" onClick={handleClearLogs}>Limpar Logs</Button>
            </div>
          </div>
          {logs.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Nenhum email enviado ainda.</p>
            </CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border/50">
                      <th className="text-left p-3 text-muted-foreground font-medium">Para</th>
                      <th className="text-left p-3 text-muted-foreground font-medium">Evento</th>
                      <th className="text-left p-3 text-muted-foreground font-medium">Assunto</th>
                      <th className="text-left p-3 text-muted-foreground font-medium">Status</th>
                      <th className="text-left p-3 text-muted-foreground font-medium">Data</th>
                    </tr></thead>
                    <tbody>{logs.map(l => (
                      <tr key={l.id} className="border-b border-border/30 hover:bg-muted/20">
                        <td className="p-3 font-mono text-xs">{l.to_email}</td>
                        <td className="p-3"><Badge variant="secondary" className="text-xs">{eventTypes[l.event_type] || l.event_type}</Badge></td>
                        <td className="p-3 text-muted-foreground max-w-xs truncate">{l.subject}</td>
                        <td className="p-3">
                          {l.status === "sent"
                            ? <span className="flex items-center gap-1 text-green-500"><CheckCircle2 className="w-3 h-3" />Enviado</span>
                            : <span className="flex items-center gap-1 text-red-500" title={l.error || ""}><AlertCircle className="w-3 h-3" />Falhou</span>
                          }
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{l.created_at ? new Date(l.created_at).toLocaleString("pt-BR") : "—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ===== DIALOG SMTP ===== */}
      <Dialog open={smtpDialog} onOpenChange={setSmtpDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSmtp ? "Editar SMTP" : "Nova Configuração SMTP"}</DialogTitle>
            <DialogDescription>Configure o servidor de email para envios automáticos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nome</Label><Input value={smtpForm.name} onChange={e => setSmtpForm(f => ({...f, name: e.target.value}))} placeholder="Ex: Gmail, Hostinger" /></div>
              <div><Label>Host SMTP</Label><Input value={smtpForm.host} onChange={e => setSmtpForm(f => ({...f, host: e.target.value}))} placeholder="smtp.gmail.com" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Porta</Label><Input type="number" value={smtpForm.port} onChange={e => setSmtpForm(f => ({...f, port: Number(e.target.value)}))} /></div>
              <div className="flex items-center gap-2 pt-6"><Switch checked={smtpForm.secure} onCheckedChange={v => setSmtpForm(f => ({...f, secure: v}))} /><Label>SSL/TLS (porta 465)</Label></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Usuário</Label><Input value={smtpForm.auth_user} onChange={e => setSmtpForm(f => ({...f, auth_user: e.target.value}))} placeholder="seu@email.com" /></div>
              <div><Label>Senha {editingSmtp && <span className="text-xs text-muted-foreground">(deixe em branco para manter)</span>}</Label><Input type="password" value={smtpForm.auth_password} onChange={e => setSmtpForm(f => ({...f, auth_password: e.target.value}))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email remetente</Label><Input value={smtpForm.from_email} onChange={e => setSmtpForm(f => ({...f, from_email: e.target.value}))} placeholder="noreply@nexusbot.com" /></div>
              <div><Label>Nome remetente</Label><Input value={smtpForm.from_name} onChange={e => setSmtpForm(f => ({...f, from_name: e.target.value}))} placeholder="Nexus Bot" /></div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleTestConnection} disabled={testingConn}>
              {testingConn ? "Testando..." : <><Wifi className="w-4 h-4 mr-1" />Testar Conexão</>}
            </Button>
            <Button onClick={saveSmtp} disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG TESTE DE EMAIL ===== */}
      <Dialog open={!!testEmailDialog} onOpenChange={() => setTestEmailDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Enviar Email de Teste</DialogTitle></DialogHeader>
          <Label>Destinatário</Label>
          <Input value={testEmailTo} onChange={e => setTestEmailTo(e.target.value)} placeholder="seu@email.com" type="email" />
          <DialogFooter>
            <Button onClick={handleSendTest} className="gap-2"><Send className="w-4 h-4" />Enviar Teste</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG TEMPLATE ===== */}
      <Dialog open={tmplDialog} onOpenChange={setTmplDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTmpl ? "Editar Template" : "Novo Template de Email"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Gatilho / Evento</Label>
                <select
                  className="w-full mt-1 bg-background border border-input rounded-md px-3 py-2 text-sm"
                  value={tmplForm.event_type}
                  disabled={!!editingTmpl}
                  onChange={e => {
                    const et = e.target.value;
                    const def = DEFAULT_TEMPLATES[et];
                    setTmplForm(f => ({
                      ...f, event_type: et,
                      name: eventTypes[et] || f.name,
                      subject: def ? def.subject : f.subject,
                      html_content: def ? def.html : f.html_content,
                    }));
                  }}
                >
                  <option value="">Selecione...</option>
                  {Object.entries(eventTypes).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div><Label>Nome do Template</Label><Input value={tmplForm.name} onChange={e => setTmplForm(f => ({...f, name: e.target.value}))} /></div>
            </div>
            <div><Label>Assunto</Label><Input value={tmplForm.subject} onChange={e => setTmplForm(f => ({...f, subject: e.target.value}))} placeholder="Assunto do email (pode usar {{nome}}, etc.)" /></div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Conteúdo HTML</Label>
                <Button size="sm" variant="ghost" className="gap-1 h-7 text-xs" onClick={() => setPreviewHtml(!previewHtml)}>
                  {previewHtml ? <Code2 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {previewHtml ? "Ver código" : "Preview"}
                </Button>
              </div>
              {previewHtml ? (
                <div className="border border-border rounded-md overflow-hidden h-80">
                  <iframe srcDoc={tmplForm.html_content} className="w-full h-full" title="preview" />
                </div>
              ) : (
                <Textarea value={tmplForm.html_content} onChange={e => setTmplForm(f => ({...f, html_content: e.target.value}))} className="font-mono text-xs h-80 resize-none" />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveTmpl} disabled={loading}>{loading ? "Salvando..." : "Salvar Template"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG TRIGGER MANUAL ===== */}
      <Dialog open={triggerDialog} onOpenChange={setTriggerDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Disparar Email Manual</DialogTitle><DialogDescription>Envia um email usando o template do evento selecionado.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Evento</Label>
              <select className="w-full mt-1 bg-background border border-input rounded-md px-3 py-2 text-sm" value={triggerEvent} onChange={e => setTriggerEvent(e.target.value)}>
                <option value="">Selecione...</option>
                {Object.entries(eventTypes).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div><Label>Email do usuário</Label><Input value={triggerEmail2} onChange={e => setTriggerEmail2(e.target.value)} placeholder="usuario@email.com" type="email" /></div>
          </div>
          <DialogFooter>
            <Button onClick={handleTrigger} disabled={!triggerEvent || !triggerEmail2} className="gap-2"><Zap className="w-4 h-4" />Disparar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== CONFIRM DELETE SMTP ===== */}
      <AlertDialog open={!!deleteSmtpId} onOpenChange={() => setDeleteSmtpId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Remover SMTP?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSmtp} className="bg-destructive text-destructive-foreground">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== CONFIRM DELETE TEMPLATE ===== */}
      <AlertDialog open={!!deleteTmplId} onOpenChange={() => setDeleteTmplId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Remover Template?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTmpl} className="bg-destructive text-destructive-foreground">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
