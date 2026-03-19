/**
 * Página de Administração de Emails
 *
 * Permite que administradores gerenciem:
 * - Templates de email HTML
 * - Configurações SMTP para envio de emails
 *
 * Apenas administradores podem acessar esta página.
 */

import { EmailPreview } from "@/shared/components/email/EmailPreview";
import { EmailVariablesList } from "@/shared/components/email/EmailVariablesList";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select } from "@/shared/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Textarea } from "@/shared/components/ui/textarea";
import { trpc } from "@/shared/lib/trpc";
import { useAuth } from "@/shared/providers/auth-provider";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  CheckCircle2,
  Code,
  Edit,
  Eye,
  Mail,
  Plus,
  Search,
  Send,
  Server,
  Shield,
  Trash2,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

// Enum de tipos de eventos de email
enum EmailTemplateEventType {
  USER_CREATED = "USER_CREATED",
  USER_UPDATED = "USER_UPDATED",
  PASSWORD_RESET_REQUEST = "PASSWORD_RESET_REQUEST",
  PASSWORD_RESET_SUCCESS = "PASSWORD_RESET_SUCCESS",
}

const EmailTemplateEventTypeLabels: Record<EmailTemplateEventType, string> = {
  [EmailTemplateEventType.USER_CREATED]: "Usuário Criado",
  [EmailTemplateEventType.USER_UPDATED]: "Usuário Atualizado",
  [EmailTemplateEventType.PASSWORD_RESET_REQUEST]: "Solicitação de Recuperação de Senha",
  [EmailTemplateEventType.PASSWORD_RESET_SUCCESS]: "Senha Atualizada",
};

// Schemas de validação
const createEmailTemplateSchema = z.object({
  name: z.string().min(1, "Nome do template é obrigatório"),
  eventType: z.nativeEnum(EmailTemplateEventType, {
    errorMap: () => ({ message: "Tipo de evento inválido" }),
  }),
  subject: z.string().min(1, "Assunto é obrigatório"),
  htmlContent: z.string().min(1, "Conteúdo HTML é obrigatório"),
});

const updateEmailTemplateSchema = createEmailTemplateSchema.extend({
  id: z.string(),
  isActive: z.boolean().optional(),
});

const createSmtpConfigSchema = z.object({
  name: z.string().min(1, "Nome da configuração é obrigatório"),
  host: z.string().min(1, "Host SMTP é obrigatório"),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean().default(false),
  authUser: z.string().min(1, "Usuário de autenticação é obrigatório"),
  authPassword: z.string().min(1, "Senha de autenticação é obrigatória"),
  fromEmail: z.string().email("Email remetente inválido"),
  fromName: z.string().optional(),
});

const updateSmtpConfigSchema = createSmtpConfigSchema.omit({ authPassword: true }).extend({
  id: z.string(),
  authPassword: z.string().optional(),
});

type CreateEmailTemplateFormData = z.infer<typeof createEmailTemplateSchema>;
type UpdateEmailTemplateFormData = z.infer<typeof updateEmailTemplateSchema>;
type CreateSmtpConfigFormData = z.infer<typeof createSmtpConfigSchema>;
type UpdateSmtpConfigFormData = z.infer<typeof updateSmtpConfigSchema>;

interface EmailTemplate {
  id: string;
  name: string;
  eventType: EmailTemplateEventType;
  subject: string;
  htmlContent: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SmtpConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  authUser: string;
  fromEmail: string;
  fromName: string | null;
  createdAt: string;
  updatedAt: string;
}

export function EmailAdminPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState("templates");
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<EmailTemplate | null>(null);
  const [editingConfig, setEditingConfig] = useState<SmtpConfig | null>(null);
  const [deletingConfig, setDeletingConfig] = useState<SmtpConfig | null>(null);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [isTemplateDeleteDialogOpen, setIsTemplateDeleteDialogOpen] = useState(false);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [isConfigDeleteDialogOpen, setIsConfigDeleteDialogOpen] = useState(false);
  const [templateSearchTerm, setTemplateSearchTerm] = useState("");
  const [testEmailDialogOpen, setTestEmailDialogOpen] = useState(false);
  const [testingTemplate, setTestingTemplate] = useState<EmailTemplate | null>(null);
  const [testConnectionDialogOpen, setTestConnectionDialogOpen] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Verificar se o usuário atual é admin
  useEffect(() => {
    if (currentUser && currentUser.role !== "admin") {
      navigate("/dashboard");
    }
  }, [currentUser, navigate]);

  // Queries
  const {
    data: templates,
    isLoading: templatesLoading,
    error: templatesError,
    refetch: refetchTemplates,
  } = trpc.email.getEmailTemplates.useQuery(undefined, {
    enabled: currentUser?.role === "admin",
    staleTime: 300000, // 5 minutos
    gcTime: 600000, // 10 minutos
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const {
    data: smtpConfig,
    isLoading: configsLoading,
    error: configsError,
    refetch: refetchConfigs,
  } = trpc.email.getSmtpConfig.useQuery(undefined, {
    enabled: currentUser?.role === "admin",
    staleTime: 300000, // 5 minutos
    gcTime: 600000, // 10 minutos
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Mutations para Templates
  const createTemplateMutation = trpc.email.createEmailTemplate.useMutation({
    onSuccess: () => {
      setIsTemplateDialogOpen(false);
      setEditingTemplate(null);
      refetchTemplates();
      resetTemplateForm();
    },
    onError: (error) => {
      alert(`Erro ao criar template: ${error.message}`);
    },
  });

  const updateTemplateMutation = trpc.email.updateEmailTemplate.useMutation({
    onSuccess: () => {
      setIsTemplateDialogOpen(false);
      setEditingTemplate(null);
      refetchTemplates();
      resetTemplateForm();
    },
    onError: (error) => {
      alert(`Erro ao atualizar template: ${error.message}`);
    },
  });

  const deleteTemplateMutation = trpc.email.deleteEmailTemplate.useMutation({
    onSuccess: () => {
      setIsTemplateDeleteDialogOpen(false);
      setDeletingTemplate(null);
      refetchTemplates();
    },
    onError: (error) => {
      alert(`Erro ao deletar template: ${error.message}`);
    },
  });

  const sendTestEmailMutation = trpc.email.sendTestEmail.useMutation({
    onSuccess: () => {
      setTestEmailDialogOpen(false);
      setTestingTemplate(null);
      resetTestEmailForm();
      alert("Email de teste enviado com sucesso!");
    },
    onError: (error) => {
      alert(`Erro ao enviar email de teste: ${error.message}`);
    },
  });

  const testConnectionMutation = trpc.email.testSmtpConnection.useMutation({
    onSuccess: (result) => {
      setConnectionTestResult(result);
    },
    onError: (error) => {
      setConnectionTestResult({
        success: false,
        message: error.message,
      });
    },
  });

  // Mutations para SMTP Configs
  const createConfigMutation = trpc.email.createSmtpConfig.useMutation({
    onSuccess: () => {
      setIsConfigDialogOpen(false);
      setEditingConfig(null);
      refetchConfigs();
      resetConfigForm();
    },
    onError: (error) => {
      alert(`Erro ao criar configuração SMTP: ${error.message}`);
    },
  });

  const updateConfigMutation = trpc.email.updateSmtpConfig.useMutation({
    onSuccess: () => {
      setIsConfigDialogOpen(false);
      setEditingConfig(null);
      refetchConfigs();
      resetConfigForm();
    },
    onError: (error) => {
      alert(`Erro ao atualizar configuração SMTP: ${error.message}`);
    },
  });

  const deleteConfigMutation = trpc.email.deleteSmtpConfig.useMutation({
    onSuccess: () => {
      setIsConfigDeleteDialogOpen(false);
      setDeletingConfig(null);
      refetchConfigs();
    },
    onError: (error) => {
      alert(`Erro ao deletar configuração SMTP: ${error.message}`);
    },
  });

  // Forms para Templates
  const {
    register: registerTemplate,
    handleSubmit: handleSubmitTemplate,
    formState: { errors: templateErrors },
    reset: resetTemplateForm,
    setValue: setTemplateValue,
    watch: watchTemplate,
  } = useForm<CreateEmailTemplateFormData>({
    resolver: zodResolver(createEmailTemplateSchema),
  });

  const templateHtmlContent = watchTemplate("htmlContent");

  // Form para envio de teste
  const {
    register: registerTestEmail,
    handleSubmit: handleSubmitTestEmail,
    formState: { errors: testEmailErrors },
    reset: resetTestEmailForm,
  } = useForm<{ to: string; smtpPassword?: string }>({
    resolver: zodResolver(
      z.object({
        to: z.string().email("Email inválido"),
        smtpPassword: z.string().optional(),
      })
    ),
  });

  // Form para teste de conexão
  const {
    register: registerTestConnection,
    handleSubmit: handleSubmitTestConnection,
    formState: { errors: testConnectionErrors },
    reset: resetTestConnectionForm,
  } = useForm<{ smtpPassword?: string }>({
    resolver: zodResolver(
      z.object({
        smtpPassword: z.string().optional(),
      })
    ),
  });

  // Forms para SMTP Configs
  const {
    register: registerConfig,
    handleSubmit: handleSubmitConfig,
    formState: { errors: configErrors },
    reset: resetConfigForm,
    setValue: setConfigValue,
    watch: watchConfig,
  } = useForm<CreateSmtpConfigFormData>({
    resolver: zodResolver(createSmtpConfigSchema),
    defaultValues: {
      port: 587,
      secure: false,
    },
  });

  const configSecure = watchConfig("secure");

  // Populate forms when editing
  useEffect(() => {
    if (editingTemplate) {
      setTemplateValue("name", editingTemplate.name);
      setTemplateValue("eventType", editingTemplate.eventType);
      setTemplateValue("subject", editingTemplate.subject);
      setTemplateValue("htmlContent", editingTemplate.htmlContent);
      setIsTemplateDialogOpen(true);
    }
  }, [editingTemplate, setTemplateValue]);

  useEffect(() => {
    if (editingConfig) {
      setConfigValue("name", editingConfig.name);
      setConfigValue("host", editingConfig.host);
      setConfigValue("port", editingConfig.port);
      setConfigValue("secure", editingConfig.secure);
      setConfigValue("authUser", editingConfig.authUser);
      setConfigValue("fromEmail", editingConfig.fromEmail);
      setConfigValue("fromName", editingConfig.fromName || "");
      setConfigValue("authPassword", ""); // Não preencher senha por segurança
      setIsConfigDialogOpen(true);
    }
  }, [editingConfig, setConfigValue]);

  // Handlers para Templates
  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    resetTemplateForm();
    setIsTemplateDialogOpen(true);
  };

  const handleEditTemplate = (template: EmailTemplate) => {
    setEditingTemplate(template);
  };

  const handleDeleteTemplate = (template: EmailTemplate) => {
    setDeletingTemplate(template);
    setIsTemplateDeleteDialogOpen(true);
  };

  const handleSendTestEmail = (template: EmailTemplate) => {
    setTestingTemplate(template);
    resetTestEmailForm();
    setTestEmailDialogOpen(true);
  };

  const onSubmitTestEmail = (data: { to: string; smtpPassword?: string }) => {
    if (!testingTemplate) return;

    sendTestEmailMutation.mutate({
      templateId: testingTemplate.id,
      to: data.to,
      smtpPassword: data.smtpPassword || undefined,
    });
  };

  const handleTestConnection = () => {
    setConnectionTestResult(null);
    resetTestConnectionForm();
    setTestConnectionDialogOpen(true);
  };

  const onSubmitTestConnection = (data: { smtpPassword?: string }) => {
    testConnectionMutation.mutate({
      smtpPassword: data.smtpPassword || undefined,
    });
  };

  const onSubmitTemplate = (data: CreateEmailTemplateFormData) => {
    if (editingTemplate) {
      updateTemplateMutation.mutate({
        id: editingTemplate.id,
        ...data,
        isActive: editingTemplate.isActive,
      });
    } else {
      createTemplateMutation.mutate(data);
    }
  };

  const handleConfirmDeleteTemplate = () => {
    if (!deletingTemplate) return;
    deleteTemplateMutation.mutate({ id: deletingTemplate.id });
  };

  // Handlers para SMTP Config
  const handleCreateConfig = () => {
    setEditingConfig(null);
    resetConfigForm();
    setIsConfigDialogOpen(true);
  };

  const handleEditConfig = () => {
    if (smtpConfig) {
      setEditingConfig(smtpConfig);
    }
  };

  const handleDeleteConfig = () => {
    if (smtpConfig) {
      setDeletingConfig(smtpConfig);
      setIsConfigDeleteDialogOpen(true);
    }
  };

  const onSubmitConfig = (data: CreateSmtpConfigFormData) => {
    if (editingConfig) {
      const updateData: UpdateSmtpConfigFormData = {
        id: editingConfig.id,
        name: data.name,
        host: data.host,
        port: data.port,
        secure: data.secure,
        authUser: data.authUser,
        fromEmail: data.fromEmail,
        fromName: data.fromName,
      };

      // Só incluir senha se foi fornecida
      if (data.authPassword) {
        updateData.authPassword = data.authPassword;
      }

      updateConfigMutation.mutate(updateData);
    } else {
      createConfigMutation.mutate(data);
    }
  };

  const handleConfirmDeleteConfig = () => {
    if (!deletingConfig) return;
    deleteConfigMutation.mutate({ id: deletingConfig.id });
  };

  // Handlers para configurações rápidas
  const handleQuickConfig587 = () => {
    setEditingConfig(null);
    resetConfigForm();
    setConfigValue("name", "Pratiko SMTP - STARTTLS (Porta 587)");
    setConfigValue("host", "mail.pratiko.app.br");
    setConfigValue("port", 587);
    setConfigValue("secure", false); // STARTTLS
    setConfigValue("authUser", "noreply@pratiko.app.br");
    setConfigValue("authPassword", "Tcadmin55!");
    setConfigValue("fromEmail", "noreply@pratiko.app.br");
    setConfigValue("fromName", "Pratikogram");
    setIsConfigDialogOpen(true);
  };

  const handleQuickConfig465 = () => {
    setEditingConfig(null);
    resetConfigForm();
    setConfigValue("name", "Pratiko SMTP - SMTPS (Porta 465)");
    setConfigValue("host", "mail.pratiko.app.br");
    setConfigValue("port", 465);
    setConfigValue("secure", true); // SMTPS (SSL/TLS encapsulado)
    setConfigValue("authUser", "noreply@pratiko.app.br");
    setConfigValue("authPassword", "Tcadmin55!");
    setConfigValue("fromEmail", "noreply@pratiko.app.br");
    setConfigValue("fromName", "Pratikogram");
    setIsConfigDialogOpen(true);
  };

  if (currentUser?.role !== "admin") {
    return null;
  }

  // Filtrar templates e configs
  const filteredTemplates =
    templates?.filter((template) => {
      if (!templateSearchTerm.trim()) return true;
      const search = templateSearchTerm.toLowerCase();
      return (
        template.name.toLowerCase().includes(search) ||
        template.subject.toLowerCase().includes(search)
      );
    }) || [];

  // SMTP agora tem apenas uma configuração padrão

  return (
    <div className="w-full px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 space-y-4 sm:space-y-6" style={{ maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1 w-full sm:w-auto">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3 flex-wrap">
            <Shield className="h-6 w-6 sm:h-8 sm:w-8 text-telegram-blue flex-shrink-0" />
            <span className="break-words">Administração de Emails</span>
          </h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">
            Gerencie templates de email e configurações SMTP. Apenas administradores podem acessar
            esta página.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="templates">
            <Mail className="h-4 w-4 mr-2" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="smtp">
            <Server className="h-4 w-4 mr-2" />
            SMTP
          </TabsTrigger>
        </TabsList>

        {/* Tab: Templates */}
        <TabsContent value="templates" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Templates de Email
                  </CardTitle>
                  <CardDescription>
                    {templateSearchTerm
                      ? `${filteredTemplates.length} de ${templates?.length || 0} template${(templates?.length || 0) !== 1 ? "s" : ""} encontrado${filteredTemplates.length !== 1 ? "s" : ""}`
                      : `Total de ${templates?.length || 0} template${templates?.length !== 1 ? "s" : ""} cadastrado${templates?.length !== 1 ? "s" : ""}`}
                  </CardDescription>
                </div>
                <Button onClick={handleCreateTemplate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Template
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Campo de Busca */}
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-telegram-text-secondary" />
                  <Input
                    type="text"
                    placeholder="Buscar por nome ou assunto..."
                    value={templateSearchTerm}
                    onChange={(e) => setTemplateSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {templatesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-telegram-blue border-t-transparent" />
                    <p className="text-telegram-text-secondary">Carregando templates...</p>
                  </div>
                </div>
              ) : templatesError ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
                    <p className="text-red-500">Erro ao carregar templates</p>
                    <p className="text-sm text-telegram-text-secondary mt-2">
                      {templatesError.message}
                    </p>
                  </div>
                </div>
              ) : !templates || templates.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <Mail className="mx-auto mb-4 h-12 w-12 text-telegram-text-secondary" />
                    <p className="text-telegram-text-secondary">Nenhum template encontrado</p>
                  </div>
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <Search className="mx-auto mb-4 h-12 w-12 text-telegram-text-secondary" />
                    <p className="text-telegram-text-secondary">
                      Nenhum template encontrado com "{templateSearchTerm}"
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTemplates.map((template) => (
                    <div
                      key={template.id}
                      className="border border-telegram-gray-medium rounded-lg p-4 hover:bg-telegram-gray-light transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-telegram-text">{template.name}</h3>
                            {template.isActive && (
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Ativo
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-telegram-text-secondary mb-1">
                            <strong>Tipo de Evento:</strong>{" "}
                            {EmailTemplateEventTypeLabels[template.eventType] || template.eventType}
                          </p>
                          <p className="text-sm text-telegram-text-secondary mb-1">
                            <strong>Assunto:</strong> {template.subject}
                          </p>
                          <p className="text-xs text-telegram-text-secondary">
                            Criado em:{" "}
                            {new Date(template.createdAt).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSendTestEmail(template)}
                            className="h-8 text-telegram-blue hover:bg-telegram-blue hover:text-white"
                          >
                            <Send className="h-4 w-4 mr-1" />
                            Enviar Teste
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditTemplate(template)}
                            className="h-8"
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Editar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteTemplate(template)}
                            className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Deletar
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: SMTP */}
        <TabsContent value="smtp" className="space-y-6">
          {/* Card de Configurações Rápidas */}
          <Card className="border-telegram-blue/20 bg-gradient-to-br from-telegram-blue/5 to-transparent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-telegram-blue" />
                Configurações Rápidas - Pratikogram
              </CardTitle>
              <CardDescription>
                Configure rapidamente as duas rotas SMTP disponíveis: STARTTLS (porta 587) e SMTPS
                (porta 465)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-telegram-gray-medium rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-telegram-text">STARTTLS (Porta 587)</h3>
                      <p className="text-sm text-telegram-text-secondary">
                        Protocolo: STARTTLS obrigatório
                      </p>
                    </div>
                    <div className="px-2 py-1 rounded bg-blue-100 text-blue-800 text-xs font-medium">
                      Porta 587
                    </div>
                  </div>
                  <div className="space-y-1 text-xs text-telegram-text-secondary">
                    <p>
                      <strong>Servidor:</strong> mail.pratiko.app.br
                    </p>
                    <p>
                      <strong>Usuário:</strong> noreply@pratiko.app.br
                    </p>
                    <p className="text-xs italic mt-2">
                      Recomendado para sistemas corporativos e automações que exigem handshake
                      criptográfico dinâmico
                    </p>
                  </div>
                  <Button
                    onClick={handleQuickConfig587}
                    className="w-full"
                    variant="outline"
                    size="sm"
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    Usar Esta Configuração
                  </Button>
                </div>
                <div className="border border-telegram-gray-medium rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-telegram-text">SMTPS (Porta 465)</h3>
                      <p className="text-sm text-telegram-text-secondary">
                        Protocolo: TLS encapsulado (SSL)
                      </p>
                    </div>
                    <div className="px-2 py-1 rounded bg-green-100 text-green-800 text-xs font-medium">
                      Porta 465
                    </div>
                  </div>
                  <div className="space-y-1 text-xs text-telegram-text-secondary">
                    <p>
                      <strong>Servidor:</strong> mail.pratiko.app.br
                    </p>
                    <p>
                      <strong>Usuário:</strong> noreply@pratiko.app.br
                    </p>
                    <p className="text-xs italic mt-2">
                      Conexão segura desde o início, ideal para workloads que exigem máxima
                      segurança
                    </p>
                  </div>
                  <Button
                    onClick={handleQuickConfig465}
                    className="w-full"
                    variant="outline"
                    size="sm"
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    Usar Esta Configuração
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    Configuração SMTP
                  </CardTitle>
                  <CardDescription>
                    Configure a única configuração SMTP padrão do sistema
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {smtpConfig && (
                    <Button onClick={handleTestConnection} variant="outline">
                      <Wifi className="h-4 w-4 mr-2" />
                      Testar Conexão
                    </Button>
                  )}
                  <Button onClick={smtpConfig ? handleEditConfig : handleCreateConfig}>
                    {smtpConfig ? (
                      <>
                        <Edit className="h-4 w-4 mr-2" />
                        Editar Configuração
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Criar Configuração
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {configsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-telegram-blue border-t-transparent" />
                    <p className="text-telegram-text-secondary">Carregando configuração...</p>
                  </div>
                </div>
              ) : configsError ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
                    <p className="text-red-500">Erro ao carregar configuração SMTP</p>
                    <p className="text-sm text-telegram-text-secondary mt-2">
                      {configsError.message}
                    </p>
                  </div>
                </div>
              ) : !smtpConfig ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <Server className="mx-auto mb-4 h-12 w-12 text-telegram-text-secondary" />
                    <p className="text-telegram-text-secondary mb-4">
                      Nenhuma configuração SMTP encontrada
                    </p>
                    <Button onClick={handleCreateConfig}>
                      <Plus className="h-4 w-4 mr-2" />
                      Criar Configuração SMTP
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="border border-telegram-gray-medium rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-telegram-text">{smtpConfig.name}</h3>
                      </div>
                      <p className="text-sm text-telegram-text-secondary mb-1">
                        <strong>Host:</strong> {smtpConfig.host}:{smtpConfig.port}{" "}
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-telegram-blue/10 text-telegram-blue ml-2">
                          {smtpConfig.port === 465
                            ? "SMTPS (TLS Encapsulado)"
                            : smtpConfig.port === 587
                              ? "STARTTLS"
                              : smtpConfig.secure
                                ? "SSL"
                                : "STARTTLS"}
                        </span>
                      </p>
                      <p className="text-sm text-telegram-text-secondary mb-1">
                        <strong>Usuário:</strong> {smtpConfig.authUser}
                      </p>
                      <p className="text-sm text-telegram-text-secondary mb-1">
                        <strong>De:</strong> {smtpConfig.fromEmail}
                        {smtpConfig.fromName && ` (${smtpConfig.fromName})`}
                      </p>
                      <p className="text-xs text-telegram-text-secondary">
                        Criado em:{" "}
                        {new Date(smtpConfig.createdAt).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleEditConfig}
                        className="h-8"
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDeleteConfig}
                        className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Deletar
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog de Template */}
      <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
        <DialogContent className="w-[calc(100%-1rem)] sm:max-w-[1000px] max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Editar Template" : "Novo Template de Email"}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? "Altere as informações do template. Clique em salvar quando terminar."
                : "Crie um novo template de email HTML."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitTemplate(onSubmitTemplate)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="template-name">Nome do Template</Label>
                <Input
                  id="template-name"
                  {...registerTemplate("name")}
                  placeholder="Ex: Boas-vindas, Recuperação de senha, etc."
                />
                {templateErrors.name && (
                  <p className="text-sm text-red-500">{templateErrors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-event-type">Tipo de Evento</Label>
                <Select id="template-event-type" {...registerTemplate("eventType")}>
                  <option value="">Selecione o tipo de evento</option>
                  {Object.entries(EmailTemplateEventTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
                {templateErrors.eventType && (
                  <p className="text-sm text-red-500">{templateErrors.eventType.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-subject">Assunto do Email</Label>
              <Input
                id="template-subject"
                {...registerTemplate("subject")}
                placeholder="Ex: Bem-vindo ao Pratikogram!"
              />
              {templateErrors.subject && (
                <p className="text-sm text-red-500">{templateErrors.subject.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="template-html">Conteúdo HTML</Label>
                <div className="text-xs text-telegram-text-secondary">
                  <EmailVariablesList />
                </div>
              </div>
              <Tabs defaultValue="editor" className="w-full">
                <TabsList className="grid w-full max-w-md grid-cols-2">
                  <TabsTrigger value="editor">
                    <Code className="h-4 w-4 mr-2" />
                    Editor
                  </TabsTrigger>
                  <TabsTrigger value="preview">
                    <Eye className="h-4 w-4 mr-2" />
                    Visualização
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="editor" className="space-y-2">
                  <Textarea
                    id="template-html"
                    {...registerTemplate("htmlContent")}
                    placeholder="Digite o HTML do template aqui..."
                    className="min-h-[400px] font-mono text-sm"
                  />
                  {templateErrors.htmlContent && (
                    <p className="text-sm text-red-500">{templateErrors.htmlContent.message}</p>
                  )}
                  <p className="text-xs text-telegram-text-secondary">
                    Use variáveis para personalização (ex: {"{{nome}}"}, {"{{email}}"}, {"{{data}}"}
                    )
                  </p>
                </TabsContent>
                <TabsContent value="preview" className="space-y-2">
                  <EmailPreview htmlContent={templateHtmlContent || ""} />
                </TabsContent>
              </Tabs>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsTemplateDialogOpen(false);
                  setEditingTemplate(null);
                  resetTemplateForm();
                }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}
              >
                {createTemplateMutation.isPending || updateTemplateMutation.isPending
                  ? "Salvando..."
                  : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Exclusão de Template */}
      <Dialog open={isTemplateDeleteDialogOpen} onOpenChange={setIsTemplateDeleteDialogOpen}>
        <DialogContent className="w-[calc(100%-1rem)] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja deletar o template <strong>{deletingTemplate?.name}</strong>?
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsTemplateDeleteDialogOpen(false);
                setDeletingTemplate(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDeleteTemplate}
              disabled={deleteTemplateMutation.isPending}
            >
              {deleteTemplateMutation.isPending ? "Deletando..." : "Deletar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Configuração SMTP */}
      <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
        <DialogContent className="w-[calc(100%-1rem)] sm:max-w-[600px] max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingConfig ? "Editar Configuração SMTP" : "Nova Configuração SMTP"}
            </DialogTitle>
            <DialogDescription>
              {editingConfig
                ? "Altere as informações da configuração SMTP. Deixe a senha em branco para não alterá-la."
                : "Configure as credenciais SMTP para envio de emails."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitConfig(onSubmitConfig)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="config-name">Nome da Configuração</Label>
              <Input
                id="config-name"
                {...registerConfig("name")}
                placeholder="Ex: Gmail, SendGrid, etc."
              />
              {configErrors.name && (
                <p className="text-sm text-red-500">{configErrors.name.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="config-host">Host SMTP</Label>
                <Input id="config-host" {...registerConfig("host")} placeholder="smtp.gmail.com" />
                {configErrors.host && (
                  <p className="text-sm text-red-500">{configErrors.host.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="config-port">Porta</Label>
                <Input
                  id="config-port"
                  type="number"
                  {...registerConfig("port", { valueAsNumber: true })}
                  placeholder="587"
                />
                {configErrors.port && (
                  <p className="text-sm text-red-500">{configErrors.port.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="config-secure"
                  checked={configSecure}
                  onChange={(e) => {
                    const newSecure = e.target.checked;
                    setConfigValue("secure", newSecure);
                    // Ajustar porta automaticamente baseado no protocolo
                    const currentPort = watchConfig("port");
                    if (newSecure && currentPort === 587) {
                      setConfigValue("port", 465);
                    } else if (!newSecure && currentPort === 465) {
                      setConfigValue("port", 587);
                    }
                  }}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="config-secure" className="cursor-pointer">
                  Usar SMTPS/SSL (TLS encapsulado) - Porta 465
                </Label>
              </div>
              <p className="text-xs text-telegram-text-secondary ml-6">
                {configSecure
                  ? "✓ SMTPS: Conexão segura desde o início (porta 465)"
                  : "✓ STARTTLS: Handshake criptográfico dinâmico (porta 587)"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="config-auth-user">Usuário de Autenticação</Label>
                <Input
                  id="config-auth-user"
                  {...registerConfig("authUser")}
                  placeholder="seu-email@gmail.com"
                />
                {configErrors.authUser && (
                  <p className="text-sm text-red-500">{configErrors.authUser.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="config-auth-password">
                  Senha {editingConfig && "(deixe em branco para não alterar)"}
                </Label>
                <Input
                  id="config-auth-password"
                  type="password"
                  {...registerConfig("authPassword", {
                    required: !editingConfig,
                  })}
                  placeholder="••••••••"
                />
                {configErrors.authPassword && (
                  <p className="text-sm text-red-500">{configErrors.authPassword.message}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="config-from-email">Email Remetente</Label>
                <Input
                  id="config-from-email"
                  type="email"
                  {...registerConfig("fromEmail")}
                  placeholder="noreply@exemplo.com"
                />
                {configErrors.fromEmail && (
                  <p className="text-sm text-red-500">{configErrors.fromEmail.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="config-from-name">Nome do Remetente (opcional)</Label>
                <Input
                  id="config-from-name"
                  {...registerConfig("fromName")}
                  placeholder="Pratikogram"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsConfigDialogOpen(false);
                  setEditingConfig(null);
                  resetConfigForm();
                }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createConfigMutation.isPending || updateConfigMutation.isPending}
              >
                {createConfigMutation.isPending || updateConfigMutation.isPending
                  ? "Salvando..."
                  : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Exclusão de Config SMTP */}
      <Dialog open={isConfigDeleteDialogOpen} onOpenChange={setIsConfigDeleteDialogOpen}>
        <DialogContent className="w-[calc(100%-1rem)] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja deletar a configuração SMTP{" "}
              <strong>{deletingConfig?.name}</strong>? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsConfigDeleteDialogOpen(false);
                setDeletingConfig(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDeleteConfig}
              disabled={deleteConfigMutation.isPending}
            >
              {deleteConfigMutation.isPending ? "Deletando..." : "Deletar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Envio de Email de Teste */}
      <Dialog open={testEmailDialogOpen} onOpenChange={setTestEmailDialogOpen}>
        <DialogContent className="w-[calc(100%-1rem)] sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-telegram-blue" />
              Enviar Email de Teste
            </DialogTitle>
            <DialogDescription>
              Envie um email de teste usando o template <strong>{testingTemplate?.name}</strong>. A
              senha SMTP é opcional - o sistema tentará usar a senha em cache ou descriptografar do
              banco.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitTestEmail(onSubmitTestEmail)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="test-email-to">Email de Destino</Label>
              <Input
                id="test-email-to"
                type="email"
                {...registerTestEmail("to")}
                placeholder="seu-email@exemplo.com"
              />
              {testEmailErrors.to && (
                <p className="text-sm text-red-500">{testEmailErrors.to.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="test-email-password">
                Senha SMTP <span className="text-xs text-telegram-text-secondary">(opcional)</span>
              </Label>
              <Input
                id="test-email-password"
                type="password"
                {...registerTestEmail("smtpPassword")}
                placeholder="Deixe em branco para usar senha em cache ou descriptografada"
              />
              {testEmailErrors.smtpPassword && (
                <p className="text-sm text-red-500">{testEmailErrors.smtpPassword.message}</p>
              )}
              <p className="text-xs text-telegram-text-secondary">
                Se deixar em branco, o sistema tentará usar a senha em cache (válida por 30 minutos)
                ou descriptografar do banco. Informe a senha apenas se necessário.
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setTestEmailDialogOpen(false);
                  setTestingTemplate(null);
                  resetTestEmailForm();
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={sendTestEmailMutation.isPending}>
                {sendTestEmailMutation.isPending ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Enviar Teste
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog de Teste de Conexão SMTP */}
      <Dialog open={testConnectionDialogOpen} onOpenChange={setTestConnectionDialogOpen}>
        <DialogContent className="w-[calc(100%-1rem)] sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wifi className="h-5 w-5 text-telegram-blue" />
              Testar Conexão SMTP
            </DialogTitle>
            <DialogDescription>
              Teste a conexão com o servidor SMTP ativo sem enviar email. A senha SMTP é opcional.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitTestConnection(onSubmitTestConnection)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="test-connection-password">
                Senha SMTP <span className="text-xs text-telegram-text-secondary">(opcional)</span>
              </Label>
              <Input
                id="test-connection-password"
                type="password"
                {...registerTestConnection("smtpPassword")}
                placeholder="Deixe em branco para usar senha em cache ou descriptografada"
              />
              {testConnectionErrors.smtpPassword && (
                <p className="text-sm text-red-500">{testConnectionErrors.smtpPassword.message}</p>
              )}
              <p className="text-xs text-telegram-text-secondary">
                Se deixar em branco, o sistema tentará usar a senha em cache (válida por 30 minutos)
                ou descriptografar do banco.
              </p>
            </div>

            {connectionTestResult && (
              <div
                className={`rounded-lg border p-4 ${
                  connectionTestResult.success
                    ? "border-green-200 bg-green-50"
                    : "border-red-200 bg-red-50"
                }`}
              >
                <div className="flex items-start gap-2">
                  {connectionTestResult.success ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p
                      className={`font-medium ${
                        connectionTestResult.success ? "text-green-800" : "text-red-800"
                      }`}
                    >
                      {connectionTestResult.success ? "Conexão bem-sucedida!" : "Falha na conexão"}
                    </p>
                    <p
                      className={`text-sm mt-1 ${
                        connectionTestResult.success ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {connectionTestResult.message}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setTestConnectionDialogOpen(false);
                  setConnectionTestResult(null);
                  resetTestConnectionForm();
                }}
              >
                Fechar
              </Button>
              <Button type="submit" disabled={testConnectionMutation.isPending}>
                {testConnectionMutation.isPending ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Testando...
                  </>
                ) : (
                  <>
                    <Wifi className="h-4 w-4 mr-2" />
                    Testar Conexão
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
