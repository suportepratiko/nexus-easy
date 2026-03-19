/**
 * Página de Administração de Webhooks
 *
 * Permite que administradores gerenciem webhooks de pagamento:
 * - Criar novos webhooks
 * - Listar todos os webhooks
 * - Editar webhooks existentes
 * - Configurar mapeamento de campos
 * - Visualizar payloads recebidos
 *
 * Apenas administradores podem acessar esta página.
 */

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Combobox } from "@/shared/components/ui/combobox";
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
import { Switch } from "@/shared/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Textarea } from "@/shared/components/ui/textarea";
import { Separator } from "@/shared/components/ui/separator";
import { trpc } from "@/shared/lib/trpc";
import { useAuth } from "@/shared/providers/auth-provider";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit,
  ExternalLink,
  Info,
  LayoutGrid,
  Link as LinkIcon,
  List,
  History,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Trash2,
  Webhook as WebhookIcon,
  X,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import {
  DEFAULT_PERIOD_RULES,
  DEFAULT_TYPE_INTERPRETATIONS,
  DEFAULT_COUNT_INTERPRETATIONS,
  type BillingPeriod,
  type PeriodConfig,
  type PeriodRule,
  type PeriodTypeInterpretation,
  type PeriodCountInterpretation,
  type TypeMeaning,
  type CountMeaning,
} from "@/shared/utils/webhook-period";

const DEFAULT_PERIOD_CONFIG: PeriodConfig = {
  typeInterpretations: [...DEFAULT_TYPE_INTERPRETATIONS],
  countInterpretations: [...DEFAULT_COUNT_INTERPRETATIONS],
  periodRules: [...DEFAULT_PERIOD_RULES],
};

function splitMappingsAndConfig(
  m: Record<string, unknown> | null | undefined
): { mappings: Record<string, string>; periodConfig: PeriodConfig } {
  if (!m || typeof m !== "object") {
    return { mappings: {}, periodConfig: DEFAULT_PERIOD_CONFIG };
  }
  const { __periodRules, __periodConfig, ...rest } = m as Record<string, unknown> & {
    __periodRules?: PeriodRule[];
    __periodConfig?: PeriodConfig;
  };
  const mappings: Record<string, string> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (typeof v === "string") mappings[k] = v;
  }
  const UNIT_MEANINGS: TypeMeaning[] = ["month", "day", "year"];
  let periodConfig: PeriodConfig = DEFAULT_PERIOD_CONFIG;
  if (__periodConfig && typeof __periodConfig === "object") {
    const rawType = Array.isArray(__periodConfig.typeInterpretations)
      ? __periodConfig.typeInterpretations
      : [];
    const typeInterpretations = rawType.filter(
      (r) => typeof r.meaning === "string" && UNIT_MEANINGS.includes(r.meaning as TypeMeaning)
    );
    periodConfig = {
      typeInterpretations:
        typeInterpretations.length > 0 ? typeInterpretations : DEFAULT_PERIOD_CONFIG.typeInterpretations,
      countInterpretations: Array.isArray(__periodConfig.countInterpretations)
        ? __periodConfig.countInterpretations
        : DEFAULT_PERIOD_CONFIG.countInterpretations,
      periodRules:
        Array.isArray(__periodConfig.periodRules) && __periodConfig.periodRules.length > 0
          ? __periodConfig.periodRules
          : DEFAULT_PERIOD_CONFIG.periodRules,
    };
  } else if (Array.isArray(__periodRules) && __periodRules.length > 0) {
    periodConfig = { ...DEFAULT_PERIOD_CONFIG, periodRules: __periodRules };
  }
  return { mappings, periodConfig };
}

const createWebhookSchema = z.object({
  name: z.string().min(1, "Nome do webhook é obrigatório"),
});

const updateWebhookSchema = z.object({
  name: z.string().min(1, "Nome do webhook é obrigatório").optional(),
  isActive: z.boolean().optional(),
  planId: z.string().optional().nullable(),
  userStatus: z.enum(["active", "expired"]).optional().nullable(),
});

type CreateWebhookFormData = z.infer<typeof createWebhookSchema>;
type UpdateWebhookFormData = z.infer<typeof updateWebhookSchema>;

type Webhook = {
  id: string;
  name: string;
  secret: string;
  isActive: boolean;
  fieldMappings: Record<string, string> | null;
  planId: string | null;
  userStatus: "active" | "expired" | null;
  createdAt: string;
  updatedAt: string;
};

type WebhookPayload = {
  id: string;
  webhookId: string;
  payload: unknown;
  headers: Record<string, string> | null;
  method: string;
  ipAddress: string | null;
  userAgent: string | null;
  processed: boolean;
  processedAt: string | null;
  error: string | null;
  createdAt: string;
};

type ViewMode = "list" | "cards";

const VIEW_MODE_STORAGE_KEY = "webhook-view-mode";

export function WebhookAdminPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [deletingWebhook, setDeletingWebhook] = useState<Webhook | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPayload, setSelectedPayload] = useState<unknown>(null);
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});
  const [periodConfig, setPeriodConfig] = useState<PeriodConfig>(DEFAULT_PERIOD_CONFIG);
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [selectedHistoryPayload, setSelectedHistoryPayload] = useState<WebhookPayload | null>(null);
  const [mainTab, setMainTab] = useState<"webhooks" | "history">("webhooks");
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    // Carregar preferência do localStorage ou usar "list" como padrão
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY) as ViewMode;
      return saved === "cards" || saved === "list" ? saved : "list";
    }
    return "list";
  });

  // Salvar preferência no localStorage quando mudar
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    }
  }, [viewMode]);

  // Verificar se o usuário atual é admin
  useEffect(() => {
    if (currentUser && currentUser.role !== "admin") {
      navigate("/dashboard");
    }
  }, [currentUser, navigate]);

  const {
    data: webhooks,
    isLoading,
    error,
    refetch,
  } = trpc.webhook.getAllWebhooks.useQuery(undefined, {
    enabled: currentUser?.role === "admin",
    staleTime: 30000,
    gcTime: 60000,
  });

  const { data: plans } = trpc.plan.getAllPlans.useQuery(undefined, {
    enabled: currentUser?.role === "admin",
  });

  const createWebhookMutation = trpc.webhook.createWebhook.useMutation({
    onSuccess: () => {
      setIsCreateDialogOpen(false);
      refetch();
      resetCreate();
    },
    onError: (error) => {
      alert(`Erro ao criar webhook: ${error.message}`);
    },
  });

  const updateWebhookMutation = trpc.webhook.updateWebhook.useMutation({
    onSuccess: async (updatedWebhook) => {
      // ✅ CRÍTICO: Aguardar refetch e atualizar editingWebhook ANTES de fechar o modal
      // Isso garante que os mapeamentos salvos sejam preservados na UI
      const refreshedWebhooks = await refetch();

      // ✅ Buscar o webhook atualizado da lista recarregada
      const updatedWebhookFromList = refreshedWebhooks.data?.find(
        (w) => w.id === updatedWebhook.id
      );

      if (updatedWebhookFromList) {
        setEditingWebhook(updatedWebhookFromList as Webhook);
        if (isConfigDialogOpen) {
          const { mappings, periodConfig: pc } = splitMappingsAndConfig(
            updatedWebhookFromList.fieldMappings as Record<string, unknown>
          );
          setFieldMappings(mappings);
          setPeriodConfig(pc);
        }
      } else if (updatedWebhook) {
        setEditingWebhook(updatedWebhook as Webhook);
        if (isConfigDialogOpen) {
          const { mappings, periodConfig: pc } = splitMappingsAndConfig(
            updatedWebhook.fieldMappings as Record<string, unknown>
          );
          setFieldMappings(mappings);
          setPeriodConfig(pc);
        }
      }

      resetEdit();
      setIsEditDialogOpen(false);

      // ✅ Fechar modal de configuração automaticamente após salvar mapeamento
      setIsConfigDialogOpen(false);
      setSelectedPayload(null);
    },
    onError: (error) => {
      alert(`Erro ao atualizar webhook: ${error.message}`);
    },
  });

  const deleteWebhookMutation = trpc.webhook.deleteWebhook.useMutation({
    onSuccess: () => {
      setIsDeleteDialogOpen(false);
      setDeletingWebhook(null);
      refetch();
    },
    onError: (error) => {
      alert(`Erro ao deletar webhook: ${error.message}`);
    },
  });

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    formState: { errors: errorsEdit },
    setValue: setValueEdit,
    watch: watchEdit,
    reset: resetEdit,
    control: controlEdit,
  } = useForm<UpdateWebhookFormData>({
    resolver: zodResolver(updateWebhookSchema),
  });

  const {
    register: registerCreate,
    handleSubmit: handleSubmitCreate,
    formState: { errors: errorsCreate },
    reset: resetCreate,
  } = useForm<CreateWebhookFormData>({
    resolver: zodResolver(createWebhookSchema),
  });

  const watchedIsActive = watchEdit("isActive");

  // Popula o formulário quando o modal de edição abre
  useEffect(() => {
    if (isEditDialogOpen && editingWebhook) {
      resetEdit({
        name: editingWebhook.name,
        isActive: editingWebhook.isActive,
        planId: editingWebhook.planId || null,
        userStatus: editingWebhook.userStatus || null,
      });
      const { mappings, periodConfig: pc } = splitMappingsAndConfig(
        editingWebhook.fieldMappings as Record<string, unknown>
      );
      setFieldMappings(mappings);
      setPeriodConfig(pc);
    } else if (!isEditDialogOpen) {
      resetEdit();
      setFieldMappings({});
      setPeriodConfig(DEFAULT_PERIOD_CONFIG);
      setSelectedPayload(null);
    }
  }, [isEditDialogOpen, editingWebhook, resetEdit]);

  useEffect(() => {
    if (isConfigDialogOpen && editingWebhook) {
      const { mappings, periodConfig: pc } = splitMappingsAndConfig(
        editingWebhook.fieldMappings as Record<string, unknown>
      );
      setFieldMappings(mappings);
      setPeriodConfig(pc);
    } else if (!isConfigDialogOpen) {
      setSelectedPayload(null);
    }
  }, [isConfigDialogOpen, editingWebhook]);

  const handleCreate = () => {
    resetCreate();
    setIsCreateDialogOpen(true);
  };

  const handleEdit = (webhook: Webhook) => {
    setEditingWebhook(webhook);
    setIsEditDialogOpen(true);
  };

  const handleConfig = (webhook: Webhook) => {
    setEditingWebhook(webhook);
    const { mappings, periodConfig: pc } = splitMappingsAndConfig(
      webhook.fieldMappings as Record<string, unknown>
    );
    setFieldMappings(mappings);
    setPeriodConfig(pc);
    setSelectedPayload(null);
    setIsConfigDialogOpen(true);
  };

  const handleDelete = (webhook: Webhook) => {
    setDeletingWebhook(webhook);
    setIsDeleteDialogOpen(true);
  };

  const onSubmitCreate = (data: CreateWebhookFormData) => {
    createWebhookMutation.mutate({
      name: data.name,
      isActive: false,
    });
  };

  const onSubmitEdit = (data: UpdateWebhookFormData) => {
    if (!editingWebhook) return;

    updateWebhookMutation.mutate({
      id: editingWebhook.id,
      name: data.name,
      isActive: data.isActive,
      planId: data.planId || null,
      userStatus: data.userStatus || null,
    });
  };

  const onSubmitConfig = () => {
    if (!editingWebhook) return;

    const mappingsToSave =
      Object.keys(fieldMappings).length > 0 ? { ...fieldMappings } : {};
    (mappingsToSave as Record<string, unknown>).__periodConfig = periodConfig;

    updateWebhookMutation.mutate({
      id: editingWebhook.id,
      fieldMappings: mappingsToSave as Record<string, string>,
      isActive: true,
    });
  };

  const handleConfirmDelete = () => {
    if (!deletingWebhook) return;

    deleteWebhookMutation.mutate({
      id: deletingWebhook.id,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getWebhookUrl = (secret: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/api/webhook/${secret}`;
  };


  if (currentUser?.role !== "admin") {
    return null;
  }

  // Filtrar webhooks baseado no termo de busca
  const filteredWebhooks =
    webhooks?.filter((webhook) => {
      if (!searchTerm.trim()) return true;
      const search = searchTerm.toLowerCase();
      return webhook.name.toLowerCase().includes(search);
    }) || [];

  return (
    <div className="w-full px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 space-y-4 sm:space-y-6" style={{ maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1 w-full sm:w-auto">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3 flex-wrap">
            <WebhookIcon className="h-6 w-6 sm:h-8 sm:w-8 text-telegram-blue flex-shrink-0" />
            <span className="break-words">Administração de Webhooks</span>
          </h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">
            Gerencie webhooks de pagamento. Configure mapeamentos de campos e gerencie payloads recebidos.
          </p>
        </div>
        <div className="flex flex-row items-center gap-3 w-full sm:w-auto">
          {/* Toggle de visualização - Lista primeiro */}
          <div className="flex items-center gap-1 rounded-lg border bg-card p-1 flex-shrink-0">
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("list")}
              className="h-8 w-8 p-0"
              title="Modo Lista"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "cards" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("cards")}
              className="h-8 w-8 p-0"
              title="Modo Cards"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          <Button onClick={handleCreate} className="flex-1 sm:w-auto flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" />
            Novo Webhook
          </Button>
        </div>
      </div>

      {/* Tabs - Webhooks e Histórico */}
      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "webhooks" | "history")} className="space-y-6">
        <div className="border-b border-telegram-gray-medium">
          <TabsList className="grid w-full max-w-md grid-cols-2 bg-transparent h-auto p-0 gap-0">
            <TabsTrigger
              value="webhooks"
              className="flex items-center gap-2 px-6 py-3 rounded-t-lg border-b-2 border-transparent data-[state=active]:border-telegram-blue data-[state=active]:bg-white data-[state=active]:text-telegram-blue data-[state=active]:shadow-none transition-all hover:text-telegram-blue/80 text-telegram-text-secondary"
            >
              <WebhookIcon className="h-4 w-4" />
              <span className="font-medium">Webhooks</span>
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="flex items-center gap-2 px-6 py-3 rounded-t-lg border-b-2 border-transparent data-[state=active]:border-telegram-blue data-[state=active]:bg-white data-[state=active]:text-telegram-blue data-[state=active]:shadow-none transition-all hover:text-telegram-blue/80 text-telegram-text-secondary"
            >
              <History className="h-4 w-4" />
              <span className="font-medium">Histórico</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="webhooks" className="mt-0">
          {/* Card de Listagem */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <WebhookIcon className="h-5 w-5" />
                    Lista de Webhooks
                  </CardTitle>
                  {searchTerm && (
                    <CardDescription>
                      {`${filteredWebhooks.length} de ${webhooks?.length || 0} webhook${(webhooks?.length || 0) !== 1 ? "s" : ""} encontrado${filteredWebhooks.length !== 1 ? "s" : ""}`}
                    </CardDescription>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Campo de Busca */}
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-telegram-text-secondary" />
                  <Input
                    type="text"
                    placeholder="Buscar webhooks..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-telegram-blue border-t-transparent" />
                    <p className="text-telegram-text-secondary">Carregando webhooks...</p>
                  </div>
                </div>
              ) : error ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
                    <p className="text-red-500">Erro ao carregar webhooks</p>
                    <p className="text-sm text-telegram-text-secondary mt-2">{error.message}</p>
                  </div>
                </div>
              ) : !webhooks || webhooks.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <WebhookIcon className="mx-auto mb-4 h-12 w-12 text-telegram-text-secondary" />
                    <p className="text-telegram-text-secondary">Nenhum webhook encontrado</p>
                  </div>
                </div>
              ) : filteredWebhooks.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <Search className="mx-auto mb-4 h-12 w-12 text-telegram-text-secondary" />
                    <p className="text-telegram-text-secondary">
                      Nenhum webhook encontrado com "{searchTerm}"
                    </p>
                  </div>
                </div>
              ) : viewMode === "list" ? (
                <div className="overflow-x-auto -webkit-overflow-scrolling-touch touch-pan-x" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <table className="w-full border-collapse min-w-[800px]">
                    <thead>
                      <tr className="border-b border-telegram-gray-medium">
                        <th className="text-left p-4 font-semibold text-telegram-text w-20">Ativo</th>
                        <th className="text-left p-4 font-semibold text-telegram-text">Nome</th>
                        <th className="text-left p-4 font-semibold text-telegram-text w-32">Status</th>
                        <th className="text-left p-4 font-semibold text-telegram-text">URL</th>
                        <th className="text-left p-4 font-semibold text-telegram-text">Criado em</th>
                        <th className="text-right p-4 font-semibold text-telegram-text">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredWebhooks.map((webhook) => (
                        <tr
                          key={webhook.id}
                          className="border-b border-telegram-gray-medium hover:bg-telegram-gray-light transition-colors"
                        >
                          <td className="p-4">
                            <Switch
                              checked={webhook.isActive}
                              onCheckedChange={(checked) => {
                                updateWebhookMutation.mutate({
                                  id: webhook.id,
                                  isActive: checked,
                                });
                              }}
                              disabled={updateWebhookMutation.isPending}
                            />
                          </td>
                          <td className="p-4">
                            <div className="font-semibold text-telegram-text">{webhook.name}</div>
                          </td>
                          <td className="p-4">
                            <Badge
                              variant={webhook.isActive ? "default" : "secondary"}
                              className={`text-xs font-medium ${webhook.isActive
                                ? "bg-green-100 text-green-700 border-green-300 hover:bg-green-100"
                                : "bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-100"
                                }`}
                            >
                              {webhook.isActive ? (
                                <>
                                  <Power className="h-3 w-3 mr-1" />
                                  Produção
                                </>
                              ) : (
                                <>
                                  <PowerOff className="h-3 w-3 mr-1" />
                                  Teste
                                </>
                              )}
                            </Badge>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2 max-w-md">
                              <LinkIcon className="h-3 w-3 text-telegram-text-secondary flex-shrink-0" />
                              <code className="text-xs text-telegram-text truncate font-mono">
                                {getWebhookUrl(webhook.secret)}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 flex-shrink-0"
                                onClick={() => copyToClipboard(getWebhookUrl(webhook.secret))}
                                title="Copiar URL"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                          <td className="p-4 text-telegram-text-secondary text-sm">
                            {new Date(webhook.createdAt).toLocaleDateString("pt-BR")}
                          </td>
                          <td className="p-4">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleConfig(webhook)}
                                className="h-8 px-3 text-xs"
                                title="Configurar"
                              >
                                <Settings className="h-3 w-3 mr-1" />
                                Configurar
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEdit(webhook)}
                                className="h-8 w-8 p-0"
                                title="Editar"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDelete(webhook)}
                                className="h-8 w-8 p-0 border-red-600 text-red-600 hover:text-red-700 hover:bg-red-50 hover:border-red-700"
                                title="Deletar"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredWebhooks.map((webhook) => (
                    <Card key={webhook.id} className="group hover:shadow-lg transition-all duration-200 border-2 hover:border-telegram-blue/50">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-lg font-semibold truncate mb-1">
                              {webhook.name}
                            </CardTitle>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={webhook.isActive ? "default" : "secondary"}
                                className={`text-xs font-medium ${webhook.isActive
                                  ? "bg-green-100 text-green-700 border-green-300 hover:bg-green-100"
                                  : "bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-100"
                                  }`}
                              >
                                {webhook.isActive ? (
                                  <>
                                    <Power className="h-3 w-3 mr-1" />
                                    Produção
                                  </>
                                ) : (
                                  <>
                                    <PowerOff className="h-3 w-3 mr-1" />
                                    Teste
                                  </>
                                )}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {/* Toggle Ativo/Inativo */}
                        <div className="flex items-center justify-between p-3 bg-telegram-gray-light rounded-lg mb-3">
                          <div className="flex-1">
                            <Label className="text-sm font-medium text-telegram-text">
                              {webhook.isActive ? "Modo Produção" : "Modo Teste"}
                            </Label>
                            <p className="text-xs text-telegram-text-secondary mt-0.5">
                              {webhook.isActive
                                ? "Processando payloads automaticamente"
                                : "Apenas salvando payloads para teste"}
                            </p>
                          </div>
                          <Switch
                            checked={webhook.isActive}
                            onCheckedChange={(checked) => {
                              updateWebhookMutation.mutate({
                                id: webhook.id,
                                isActive: checked,
                              });
                            }}
                            disabled={updateWebhookMutation.isPending}
                          />
                        </div>

                        {/* URL do Webhook */}
                        <div className="space-y-2">
                          <Label className="text-xs font-medium text-telegram-text-secondary">
                            URL do Webhook
                          </Label>
                          <div className="flex items-center gap-2 p-2 bg-white border border-telegram-gray-medium rounded-md">
                            <LinkIcon className="h-3 w-3 text-telegram-text-secondary flex-shrink-0" />
                            <code className="text-xs text-telegram-text flex-1 truncate">
                              {getWebhookUrl(webhook.secret)}
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 flex-shrink-0"
                              onClick={() => copyToClipboard(getWebhookUrl(webhook.secret))}
                              title="Copiar URL"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="pt-0">
                        <div className="flex items-center justify-between pt-3 border-t border-telegram-gray-medium">
                          <div className="text-xs text-telegram-text-secondary">
                            Criado em {new Date(webhook.createdAt).toLocaleDateString("pt-BR")}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleConfig(webhook)}
                              className="h-8 px-3 text-xs"
                              title="Configurar"
                            >
                              <Settings className="h-3 w-3 mr-1" />
                              Configurar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(webhook)}
                              className="h-8 w-8 p-0"
                              title="Editar"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(webhook)}
                              className="h-8 w-8 p-0 border-red-600 text-red-600 hover:text-red-700 hover:bg-red-50 hover:border-red-700"
                              title="Deletar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dialog de Criação */}
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogContent className="w-[calc(100%-1rem)] sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Criar Novo Webhook</DialogTitle>
                <DialogDescription>
                  Crie um novo webhook para receber dados de plataformas de pagamento.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmitCreate(onSubmitCreate)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="create-name">
                    Nome <span className="text-red-500">*</span>
                  </Label>
                  <Input id="create-name" {...registerCreate("name")} />
                  {errorsCreate.name && (
                    <p className="text-sm text-red-500">{errorsCreate.name.message}</p>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsCreateDialogOpen(false);
                      resetCreate();
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createWebhookMutation.isPending}>
                    {createWebhookMutation.isPending ? "Criando..." : "Criar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Dialog de Edição */}
          <Dialog
            open={isEditDialogOpen}
            onOpenChange={(open) => {
              setIsEditDialogOpen(open);
              if (!open) {
                resetEdit();
                setEditingWebhook(null);
              }
            }}
          >
            <DialogContent className="w-[calc(100%-1rem)] sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Editar Webhook</DialogTitle>
                <DialogDescription>
                  Altere as configurações do webhook. Clique em salvar quando terminar.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmitEdit(onSubmitEdit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Nome</Label>
                  <Input id="edit-name" {...registerEdit("name")} />
                  {errorsEdit.name && (
                    <p className="text-sm text-red-500">{errorsEdit.name.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="edit-isActive">Status</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-telegram-text-secondary">
                        {watchedIsActive ? "Produção" : "Teste"}
                      </span>
                      <Controller
                        name="isActive"
                        control={controlEdit}
                        render={({ field }) => (
                          <Switch
                            id="edit-isActive"
                            checked={field.value ?? false}
                            onCheckedChange={field.onChange}
                          />
                        )}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-telegram-text-secondary">
                    {watchedIsActive
                      ? "Modo produção: payloads serão processados e usuários atualizados"
                      : "Modo teste: payloads serão salvos mas não processados"}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-planId">Planos</Label>
                  <Select
                    id="edit-planId"
                    value={watchEdit("planId") || ""}
                    onChange={(e) => {
                      const newPlanId = e.target.value || null;
                      setValueEdit("planId", newPlanId);
                    }}
                  >
                    <option value="">Sem plano padrão</option>
                    {plans?.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-telegram-text-secondary">
                    Usado apenas se o campo "Plano" não estiver mapeado no payload
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-userStatus">Status do Usuário (Fallback)</Label>
                  <Select
                    id="edit-userStatus"
                    value={watchEdit("userStatus") || ""}
                    onChange={(e) => {
                      const newStatus = e.target.value || null;
                      setValueEdit("userStatus", newStatus as "active" | "expired" | null);
                    }}
                  >
                    <option value="">Sem status padrão</option>
                    <option value="active">Ativo</option>
                    <option value="expired">Vencido</option>
                  </Select>
                  <p className="text-xs text-telegram-text-secondary">
                    Usado apenas se o campo "Status do Usuário" não estiver mapeado no payload
                  </p>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      resetEdit();
                      setIsEditDialogOpen(false);
                      setEditingWebhook(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={updateWebhookMutation.isPending}>
                    {updateWebhookMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Dialog de Configuração - Layout Único */}
          <Dialog
            open={isConfigDialogOpen}
            onOpenChange={(open) => {
              setIsConfigDialogOpen(open);
              if (!open) {
                setSelectedPayload(null);
                setFieldMappings({});
                setPeriodConfig(DEFAULT_PERIOD_CONFIG);
                setEditingWebhook(null);
              }
            }}
          >
            <DialogContent className="w-[calc(100%-1rem)] sm:max-w-[1200px] max-h-[95vh] sm:max-h-[90vh] p-0 overflow-hidden flex flex-col">
              <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-4 border-b border-telegram-gray-medium">
                <DialogTitle className="text-xl sm:text-2xl font-bold">Configurar Webhook</DialogTitle>
                <DialogDescription className="text-sm sm:text-base mt-2">
                  Configure o mapeamento de campos do payload. Use o modo teste para receber e analisar payloads.
                </DialogDescription>

                {/* URL do Webhook - Movido para cá */}
                {editingWebhook && (
                  <Card className="mt-4 border-2 border-telegram-blue/20 bg-gradient-to-br from-telegram-blue/5 to-transparent">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <LinkIcon className="h-4 w-4 text-telegram-blue" />
                        URL do Webhook
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center gap-2 p-2 bg-white border border-telegram-gray-medium rounded-lg">
                        <LinkIcon className="h-3 w-3 text-telegram-text-secondary flex-shrink-0" />
                        <code className="text-xs text-telegram-text flex-1 truncate font-mono">
                          {getWebhookUrl(editingWebhook.secret)}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(getWebhookUrl(editingWebhook.secret))}
                          className="h-6 px-2 flex-shrink-0"
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copiar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </DialogHeader>

              {editingWebhook && (
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6 p-6 overflow-hidden">
                  {/* Lado Esquerdo - Payloads Recebidos */}
                  <div className="flex flex-col space-y-4 overflow-hidden border-r border-telegram-gray-medium pr-6">
                    <div>
                      <Label className="text-base font-semibold mb-2 block">
                        Payloads Recebidos
                      </Label>
                      <p className="text-xs text-telegram-text-secondary mb-3">
                        Selecione um payload para mapear os campos
                      </p>
                    </div>
                    <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                      <WebhookPayloadsList
                        webhookId={editingWebhook.id}
                        webhookIsActive={editingWebhook.isActive}
                        onSelectPayload={setSelectedPayload}
                        selectedPayload={selectedPayload}
                      />
                    </div>
                  </div>

                  {/* Lado Direito - Mapeamento de Campos */}
                  <div className="flex flex-col space-y-4 overflow-hidden min-h-0">
                    <div>
                      <Label className="text-base font-semibold mb-2 block">
                        Mapeamento de Campos
                      </Label>
                      <p className="text-xs text-telegram-text-secondary">
                        Mapeie os campos do payload para os campos do sistema. Os campos Nome Completo, Email, Telefone e CPF são obrigatórios.
                      </p>
                    </div>
                    <div className="flex-1 overflow-y-auto pr-2 min-h-0 space-y-4">
                      {selectedPayload ? (
                        <>
                          <FieldMappingEditor
                            payload={selectedPayload}
                            mappings={fieldMappings}
                            onMappingsChange={setFieldMappings}
                            plans={plans || []}
                            periodConfig={periodConfig}
                            onPeriodConfigChange={setPeriodConfig}
                          />

                          {/* Regras de período (type + count → period) */}
                          <Card className="border-2">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm">Regras de período</CardTitle>
                              <CardDescription className="text-xs">
                                Afirme quando cada combinação (tipo + valor) = mensal, trimestral, semestral ou anual. Ex.: MONTHS + 1 = mensal. A adição de dias (vencimento) vem do período: mensal 31, trimestral 91, semestral 182, anual 365. O plano exato (mensal/trimestral/etc.) é escolhido por esse período.
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              <div className="rounded-md border overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b bg-muted/50">
                                      <th className="text-left p-2 font-medium">Tipo (intervalType)</th>
                                      <th className="text-left p-2 font-medium">Valor (intervalCount)</th>
                                      <th className="text-left p-2 font-medium">Período</th>
                                      <th className="text-left p-2 font-medium">Plano</th>
                                      <th className="w-10 p-2" />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {periodConfig.periodRules.map((r, i) => (
                                      <tr key={i} className="border-b last:border-0">
                                        <td className="p-2">
                                          <Input
                                            value={r.intervalType}
                                            onChange={(e) => {
                                              const next = [...periodConfig.periodRules];
                                              next[i] = { ...next[i], intervalType: e.target.value };
                                              setPeriodConfig({ ...periodConfig, periodRules: next });
                                            }}
                                            placeholder="ex.: MONTHS"
                                            className="h-8 font-mono text-xs"
                                          />
                                        </td>
                                        <td className="p-2">
                                          <Input
                                            type="number"
                                            min={1}
                                            value={r.intervalCount}
                                            onChange={(e) => {
                                              const v = parseInt(e.target.value, 10);
                                              if (!Number.isNaN(v)) {
                                                const next = [...periodConfig.periodRules];
                                                next[i] = { ...next[i], intervalCount: v };
                                                setPeriodConfig({ ...periodConfig, periodRules: next });
                                              }
                                            }}
                                            className="h-8 w-20"
                                          />
                                        </td>
                                        <td className="p-2">
                                          <Select
                                            value={r.period}
                                            onChange={(e) => {
                                              const v = e.target.value as BillingPeriod;
                                              const next = [...periodConfig.periodRules];
                                              next[i] = { ...next[i], period: v };
                                              setPeriodConfig({ ...periodConfig, periodRules: next });
                                            }}
                                          >
                                            <option value="mensal">Mensal</option>
                                            <option value="trimestral">Trimestral</option>
                                            <option value="semestral">Semestral</option>
                                            <option value="anual">Anual</option>
                                          </Select>
                                        </td>
                                        <td className="p-2">
                                          <Select
                                            value={r.planId || ""}
                                            onChange={(e) => {
                                              const v = e.target.value || null;
                                              const next = [...periodConfig.periodRules];
                                              next[i] = { ...next[i], planId: v };
                                              setPeriodConfig({ ...periodConfig, periodRules: next });
                                            }}
                                          >
                                            <option value="">Nenhum</option>
                                            {plans?.map((p) => (
                                              <option key={p.id} value={p.id}>
                                                {p.name} {p.toggleOptionValue ? `(${p.toggleOptionValue})` : p.durationDays ? `(${p.durationDays} dias)` : ""}
                                              </option>
                                            ))}
                                          </Select>
                                        </td>
                                        <td className="p-2">
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-destructive hover:text-destructive"
                                            onClick={() =>
                                              setPeriodConfig({
                                                ...periodConfig,
                                                periodRules: periodConfig.periodRules.filter((_, j) => j !== i),
                                              })
                                            }
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setPeriodConfig({
                                    ...periodConfig,
                                    periodRules: [
                                      ...periodConfig.periodRules,
                                      { intervalType: "MONTHS", intervalCount: 1, period: "mensal" },
                                    ],
                                  })
                                }
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                Adicionar regra
                              </Button>
                            </CardContent>
                          </Card>
                        </>
                      ) : (
                        <Card className="border-2 border-dashed border-telegram-gray-medium bg-telegram-gray-light/50">
                          <CardContent className="p-8 text-center">
                            <div className="flex flex-col items-center gap-3">
                              <div className="w-16 h-16 rounded-full bg-telegram-gray-medium flex items-center justify-center">
                                <Info className="h-8 w-8 text-telegram-text-secondary" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-telegram-text mb-1">
                                  Selecione um payload
                                </p>
                                <p className="text-xs text-telegram-text-secondary">
                                  Selecione um payload recebido ao lado para começar o mapeamento
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Footer com Botões */}
              <div className="flex justify-end gap-2 px-6 pb-6 pt-4 border-t border-telegram-gray-medium">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsConfigDialogOpen(false);
                    setSelectedPayload(null);
                    setFieldMappings({});
                    setPeriodConfig(DEFAULT_PERIOD_CONFIG);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => {
                    // Validar campos obrigatórios
                    const requiredFields = ["name", "email", "whatsapp", "cpf"];
                    const missingFields = requiredFields.filter((field) => !fieldMappings[field]);

                    if (missingFields.length > 0) {
                      const fieldLabels: Record<string, string> = {
                        name: "Nome Completo",
                        email: "Email",
                        whatsapp: "Telefone",
                        cpf: "CPF",
                      };
                      const missingLabels = missingFields.map((f) => fieldLabels[f]).join(", ");
                      alert(`Por favor, mapeie todos os campos obrigatórios: ${missingLabels}`);
                      return;
                    }

                    // onSubmitConfig() já fecha o modal via onSuccess da mutation
                    onSubmitConfig();
                  }}
                  disabled={updateWebhookMutation.isPending || !selectedPayload}
                  className="min-w-[180px]"
                >
                  {updateWebhookMutation.isPending ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Salvar Mapeamento
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

        </TabsContent>

        <TabsContent value="history" className="mt-0">
          <WebhookHistoryList
            webhookId={""} // Vazio para buscar todos os webhooks
            searchTerm={historySearchTerm}
            onSearchChange={setHistorySearchTerm}
            selectedPayload={selectedHistoryPayload}
            onSelectPayload={setSelectedHistoryPayload}
            fieldMappings={null}
            allWebhooks={webhooks || []}
          />
        </TabsContent>
      </Tabs>

      {/* Dialog de Confirmação de Exclusão */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="w-[calc(100%-1rem)] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja deletar o webhook <strong>{deletingWebhook?.name}</strong>? Esta
              ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setDeletingWebhook(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteWebhookMutation.isPending}
            >
              {deleteWebhookMutation.isPending ? "Deletando..." : "Deletar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Componente para listar payloads
function WebhookPayloadsList({
  webhookId,
  webhookIsActive,
  onSelectPayload,
  selectedPayload,
}: {
  webhookId: string;
  webhookIsActive: boolean;
  onSelectPayload: (payload: unknown) => void;
  selectedPayload: unknown | null;
}) {
  const utils = trpc.useUtils();

  // Quando webhook estiver ativo, não buscar payloads (modo produção não mostra na lista de teste)
  const { data: payloads, isLoading, refetch, isFetching } = trpc.webhook.getWebhookPayloads.useQuery(
    { webhookId, limit: 50, processed: false },
    {
      enabled: !!webhookId && !webhookIsActive, // Apenas buscar quando webhook estiver inativo (modo teste)
      refetchOnWindowFocus: !webhookIsActive,
    }
  );

  const deletePayloadMutation = trpc.webhook.deleteWebhookPayload.useMutation({
    onSuccess: () => {
      // Invalidar cache e refetch
      utils.webhook.getWebhookPayloads.invalidate({ webhookId });
    },
  });

  // Quando webhook estiver ativo (modo produção), não mostrar payloads de teste
  if (webhookIsActive) {
    return (
      <>
        <div className="flex items-center justify-end mb-3 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-7 px-3 text-xs"
            title="Atualizar lista de payloads"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
        <Card className="border-2 border-dashed border-telegram-gray-medium bg-telegram-gray-light/50">
          <CardContent className="p-8 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <Power className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-telegram-text mb-1">
                  Webhook em Modo Produção
                </p>
                <p className="text-xs text-telegram-text-secondary">
                  Os payloads recebidos são processados automaticamente.
                  Desative o webhook para voltar ao modo teste e visualizar payloads aqui.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  const isEmpty = !payloads || payloads.length === 0;

  if (isLoading) {
    return (
      <>
        <div className="flex items-center justify-end mb-3 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-7 px-3 text-xs"
            title="Atualizar lista de payloads"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-telegram-blue border-t-transparent" />
            <p className="text-sm text-telegram-text-secondary">Carregando payloads...</p>
          </div>
        </div>
      </>
    );
  }

  if (isEmpty) {
    return (
      <>
        <div className="flex items-center justify-end mb-3 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-7 px-3 text-xs"
            title="Atualizar lista de payloads"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
        <Card className="border-2 border-dashed border-telegram-gray-medium bg-telegram-gray-light/50">
          <CardContent className="p-8 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-telegram-gray-medium flex items-center justify-center">
                <Info className="h-8 w-8 text-telegram-text-secondary" />
              </div>
              <div>
                <p className="text-sm font-medium text-telegram-text mb-1">
                  Nenhum payload recebido ainda
                </p>
                <p className="text-xs text-telegram-text-secondary">
                  Envie um payload de teste para a URL do webhook acima
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  const isSelected = (payloadData: unknown) => {
    return JSON.stringify(payloadData) === JSON.stringify(selectedPayload);
  };

  const handleDelete = (e: React.MouseEvent, payloadId: string) => {
    e.stopPropagation(); // Evitar selecionar o payload ao clicar no botão
    if (confirm("Tem certeza que deseja excluir este payload?")) {
      deletePayloadMutation.mutate({ id: payloadId });
    }
  };

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-end mb-3 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-7 px-3 text-xs"
            title="Atualizar lista de payloads"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
        <style>{`
        .webhook-payloads-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .webhook-payloads-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .webhook-payloads-scroll::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.15);
          border-radius: 3px;
        }
        .webhook-payloads-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.25);
        }
        `}</style>
        <div
          className="space-y-2 flex-1 overflow-y-auto pr-1 webhook-payloads-scroll"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(0, 0, 0, 0.15) transparent',
          }}
        >
          {payloads.map((payload) => {
            const isCurrentlySelected = isSelected(payload.payload);
            return (
              <Card
                key={payload.id}
                className={`cursor-pointer transition-all duration-200 ${isCurrentlySelected
                  ? "border-2 border-telegram-blue bg-telegram-blue/5 shadow-md"
                  : "border hover:border-telegram-blue/50 hover:shadow-sm"
                  }`}
                onClick={() => {
                  onSelectPayload(payload.payload);
                }}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="text-xs font-semibold text-telegram-text">
                          {new Date(payload.createdAt).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                        {payload.processed ? (
                          <Badge variant="default" className="text-xs bg-green-100 text-green-700 border-green-300 px-1.5 py-0">
                            Processado
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700 border-orange-300 px-1.5 py-0">
                            Teste
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-telegram-text-secondary truncate">
                        {payload.ipAddress && `IP: ${payload.ipAddress.substring(0, 15)}...`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isCurrentlySelected && (
                        <div className="w-6 h-6 rounded-full bg-telegram-blue flex items-center justify-center">
                          <CheckCircle2 className="h-4 w-4 text-white" />
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleDelete(e, payload.id)}
                        disabled={deletePayloadMutation.isPending}
                        className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        title="Excluir payload"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {/* Preview do payload */}
                  {isCurrentlySelected && (
                    <div className="mt-2 pt-2 border-t border-telegram-gray-medium">
                      <div className="text-xs font-semibold text-telegram-text-secondary mb-2">
                        Preview do Payload:
                      </div>
                      <div className="bg-white p-3 rounded border border-telegram-gray-medium max-h-80 overflow-y-auto overflow-x-hidden">
                        <pre className="text-xs font-mono text-telegram-text whitespace-pre-wrap break-words break-all">
                          {JSON.stringify(payload.payload, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}

// Função auxiliar para extrair valor do payload
function getNestedValue(obj: unknown, path: string): unknown {
  if (!path) return null;
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return null;
    }
  }
  return current;
}

const TYPE_MEANING_OPTS: { value: TypeMeaning; label: string }[] = [
  { value: "month", label: "Mês" },
  { value: "day", label: "Dia" },
  { value: "year", label: "Ano" },
];

const COUNT_MEANING_OPTS: { value: CountMeaning; label: string }[] = [
  { value: 1, label: "1" },
  { value: 3, label: "3" },
  { value: 6, label: "6" },
  { value: 12, label: "12" },
  { value: "mensal", label: "Mensal" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
];

function InterpretationsTable({
  title,
  rows,
  meaningType,
  onRowsChange,
}: {
  title: string;
  rows: PeriodTypeInterpretation[] | PeriodCountInterpretation[];
  meaningType: "type" | "count";
  onRowsChange: (rows: PeriodTypeInterpretation[] | PeriodCountInterpretation[]) => void;
}) {
  const opts = meaningType === "type" ? TYPE_MEANING_OPTS : COUNT_MEANING_OPTS;
  const getMeaning = (r: PeriodTypeInterpretation | PeriodCountInterpretation) =>
    r.meaning;
  const setMeaning = (
    idx: number,
    v: TypeMeaning | CountMeaning,
    list: (PeriodTypeInterpretation | PeriodCountInterpretation)[]
  ) => {
    const next = [...list];
    next[idx] = { ...next[idx], meaning: v };
    onRowsChange(next);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-telegram-text-secondary">{title}</p>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-2 font-medium">Valor no payload</th>
              <th className="text-left p-2 font-medium">Significado</th>
              <th className="w-10 p-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="p-2">
                  <Input
                    value={r.payloadValue}
                    onChange={(e) => {
                      const next = [...rows];
                      next[i] = { ...next[i], payloadValue: e.target.value };
                      onRowsChange(next);
                    }}
                    placeholder="ex.: MONTHS, 1"
                    className="h-8 font-mono text-xs"
                  />
                </td>
                <td className="p-2">
                  <Select
                    value={String(getMeaning(r))}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const opt = opts.find((o) => String(o.value) === raw);
                      if (opt) setMeaning(i, opt.value, rows);
                    }}
                  >
                    {opts.map((o) => (
                      <option key={String(o.value)} value={String(o.value)}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="p-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => onRowsChange(rows.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          if (meaningType === "type") {
            onRowsChange([...rows, { payloadValue: "", meaning: "month" }]);
          } else {
            onRowsChange([...rows, { payloadValue: "", meaning: 1 }]);
          }
        }}
      >
        <Plus className="h-4 w-4 mr-1" />
        Adicionar
      </Button>
    </div>
  );
}

// Componente para editar mapeamento de campos
function FieldMappingEditor({
  payload,
  mappings,
  onMappingsChange,
  plans,
  periodConfig,
  onPeriodConfigChange,
}: {
  payload: unknown;
  mappings: Record<string, string>;
  onMappingsChange: (mappings: Record<string, string>) => void;
  plans: Array<{ id: string; name: string; durationDays: number | null; toggleOptionValue?: string | null }>;
  periodConfig: PeriodConfig;
  onPeriodConfigChange: (c: PeriodConfig) => void;
}) {
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [selectedUserStatus, setSelectedUserStatus] = useState<"active" | "expired" | null>(
    (mappings.userStatus as "active" | "expired") || null
  );

  useEffect(() => {
    if (payload) {
      const fields = extractFieldsFromPayload(payload);
      setAvailableFields(fields);
    }
  }, [payload]);

  const extractFieldsFromPayload = (obj: unknown): string[] => {
    const fields: string[] = [];
    const traverse = (o: unknown, path = ""): void => {
      if (o === null || o === undefined) return;
      if (typeof o !== "object") {
        fields.push(path);
        return;
      }
      if (Array.isArray(o)) {
        o.forEach((item, index) => {
          traverse(item, path ? `${path}[${index}]` : `[${index}]`);
        });
        return;
      }
      for (const [key, value] of Object.entries(o as Record<string, unknown>)) {
        const newPath = path ? `${path}.${key}` : key;
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          traverse(value, newPath);
        } else {
          fields.push(newPath);
        }
      }
    };
    traverse(obj);
    return fields;
  };

  const targetFields = [
    {
      key: "name",
      label: "Nome Completo",
      description: "Nome completo do usuário no payload",
      required: true,
      type: "payload" as const
    },
    {
      key: "email",
      label: "Email",
      description: "Email do usuário no payload",
      required: true,
      type: "payload" as const
    },
    {
      key: "whatsapp",
      label: "Telefone",
      description: "Telefone/WhatsApp do usuário no payload",
      required: true,
      type: "payload" as const
    },
    {
      key: "cpf",
      label: "CPF",
      description: "CPF do usuário no payload",
      required: true,
      type: "payload" as const
    },
    {
      key: "period",
      label: "Período recorrência",
      description: "Mapeie o campo do payload (ex.: subscription.intervalType) e, em 'Interpretações', use só unidade: Mês, Dia ou Ano (ex.: MONTHS → Mês, DAYS → Dia). Cálculo exato via tipo + valor nas Regras de período.",
      required: false,
      type: "payload" as const
    },
    {
      key: "periodCount",
      label: "Valor do período recorrência",
      description: "Mapeie o campo do payload (ex.: subscription.intervalCount) e, em 'Interpretações', afirme quando valor = X significa Y (ex.: 1 → 1, 3 → 3 ou 1 → Mensal se só count). Opcional. Universal: pode haver só valor, sem tipo.",
      required: false,
      type: "payload" as const
    },
    {
      key: "userStatus",
      label: "Status do Usuário",
      description: "Selecione o status que será aplicado ao usuário quando o webhook processar",
      required: false,
      type: "status" as const
    },
  ];


  const getMappedValue = (fieldKey: string): unknown => {
    const mappedPath = mappings[fieldKey];
    if (!mappedPath || !payload) return null;
    return getNestedValue(payload, mappedPath);
  };

  // Atualizar mappings quando userStatus mudar
  useEffect(() => {
    const newMappings = { ...mappings };
    if (selectedUserStatus) {
      newMappings.userStatus = selectedUserStatus;
    } else {
      delete newMappings.userStatus;
    }
    onMappingsChange(newMappings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserStatus]);

  return (
    <div className="space-y-4">
      {targetFields.map((field) => {
        const mappedValue = field.type === "payload" ? getMappedValue(field.key) : null;
        const isMapped = field.type === "payload"
          ? !!mappings[field.key]
          : !!selectedUserStatus;

        return (
          <Card key={field.key} className="border-2">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className={`text-sm font-semibold ${field.required && !isMapped ? "text-red-600" : ""}`}>
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </Label>
                {isMapped ? (
                  <Badge variant="default" className="text-xs bg-green-100 text-green-700 border-green-300">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {field.type === "status" ? "Status Definido" : "Mapeado"}
                  </Badge>
                ) : field.required ? (
                  <Badge variant="secondary" className="text-xs bg-red-100 text-red-700 border-red-300">
                    Obrigatório
                  </Badge>
                ) : null}
              </div>

              {field.type === "status" ? (
                <>
                  <Select
                    value={selectedUserStatus || ""}
                    onChange={(e) => {
                      setSelectedUserStatus((e.target.value || null) as "active" | "expired" | null);
                    }}
                    className="w-full"
                  >
                    <option value="">Selecione o status</option>
                    <option value="active">Ativo</option>
                    <option value="expired">Vencido</option>
                  </Select>
                  {selectedUserStatus && (
                    <Card className="bg-telegram-blue/5 border-telegram-blue/20">
                      <CardContent className="p-3">
                        <div className="flex items-start gap-2">
                          <Info className="h-4 w-4 text-telegram-blue mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-telegram-blue mb-1">
                              Status definido:
                            </div>
                            <div className="text-sm font-medium text-telegram-text">
                              {selectedUserStatus === "active" ? "Ativo" : "Vencido"}
                            </div>
                            <div className="text-xs text-telegram-text-secondary mt-1">
                              {selectedUserStatus === "active"
                                ? "O usuário será marcado como ativo quando o webhook processar"
                                : "O usuário será marcado como vencido quando o webhook processar"}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : (
                <>
                  {/* Combobox com busca integrada */}
                  <Combobox
                    options={availableFields.map((fieldPath) => ({
                      value: fieldPath,
                      label: fieldPath,
                    }))}
                    value={mappings[field.key] || ""}
                    onValueChange={(value) => {
                      const newMappings = { ...mappings };
                      if (value) {
                        newMappings[field.key] = value;
                      } else {
                        delete newMappings[field.key];
                      }
                      onMappingsChange(newMappings);
                    }}
                    placeholder="Selecione um campo do payload"
                    searchPlaceholder="Digite para buscar..."
                    className="w-full"
                  />

                  {/* Preview do valor mapeado */}
                  {mappings[field.key] && mappedValue !== null && (
                    <Card className="bg-telegram-blue/5 border-telegram-blue/20">
                      <CardContent className="p-3">
                        <div className="flex items-start gap-2">
                          <Info className="h-4 w-4 text-telegram-blue mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-telegram-blue mb-1">
                              Preview do valor:
                            </div>
                            <div className="text-sm font-mono text-telegram-text break-all bg-white px-2 py-1 rounded border">
                              {String(mappedValue)}
                            </div>
                            <div className="text-xs text-telegram-text-secondary mt-1">
                              Campo mapeado: <code className="bg-telegram-gray-light px-1 rounded">{mappings[field.key]}</code>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Interpretações: "quando valor = X → significa Y" (só Período / Valor) */}
                  {field.key === "period" && (
                    <InterpretationsTable
                      title="Quando valor = ... significa"
                      rows={periodConfig.typeInterpretations}
                      meaningType="type"
                      onRowsChange={(rows) =>
                        onPeriodConfigChange({ ...periodConfig, typeInterpretations: rows })
                      }
                    />
                  )}
                  {field.key === "periodCount" && (
                    <InterpretationsTable
                      title="Quando valor = ... significa"
                      rows={periodConfig.countInterpretations}
                      meaningType="count"
                      onRowsChange={(rows) =>
                        onPeriodConfigChange({ ...periodConfig, countInterpretations: rows })
                      }
                    />
                  )}
                </>
              )}

              <p className="text-xs text-telegram-text-secondary">{field.description}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// Componente para listar histórico de payloads
function WebhookHistoryList({
  webhookId,
  searchTerm,
  onSearchChange,
  selectedPayload,
  onSelectPayload,
  fieldMappings,
  allWebhooks,
}: {
  webhookId: string;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  selectedPayload: WebhookPayload | null;
  onSelectPayload: (payload: WebhookPayload | null) => void;
  fieldMappings: Record<string, string> | null;
  allWebhooks?: Webhook[];
}) {
  const utils = trpc.useUtils();

  // ✅ Estado de paginação
  const [currentPage, setCurrentPage] = React.useState(1);
  const [itemsPerPage, setItemsPerPage] = React.useState(10); // Padrão: 10

  // Se webhookId estiver vazio, buscar payloads de todos os webhooks
  const allPayloadsQuery = trpc.webhook.getAllWebhookPayloads.useQuery(
    { limit: 200 },
    {
      enabled: !webhookId,
    }
  );

  const singleWebhookQuery = trpc.webhook.getWebhookPayloads.useQuery(
    { webhookId, limit: 100 },
    {
      enabled: !!webhookId,
    }
  );

  const isLoading = webhookId ? singleWebhookQuery.isLoading : allPayloadsQuery.isLoading;
  const isFetching = webhookId ? singleWebhookQuery.isFetching : allPayloadsQuery.isFetching;
  const allPayloads = (webhookId ? singleWebhookQuery.data : allPayloadsQuery.data) || [];

  const refetch = React.useCallback(() => {
    if (webhookId) {
      singleWebhookQuery.refetch();
      utils.webhook.getWebhookPayloads.invalidate({ webhookId });
    } else {
      allPayloadsQuery.refetch();
      utils.webhook.getAllWebhookPayloads.invalidate();
    }
  }, [webhookId, allPayloadsQuery, singleWebhookQuery, utils]);

  // Filtrar payloads baseado na busca
  const filteredPayloads = React.useMemo(() => {
    if (!allPayloads || !searchTerm.trim()) return allPayloads || [];
    const term = searchTerm.toLowerCase().trim();
    return allPayloads.filter((payload) => {
      const payloadStr = JSON.stringify(payload.payload).toLowerCase();
      const ipStr = payload.ipAddress?.toLowerCase() || "";
      const errorStr = payload.error?.toLowerCase() || "";
      const dateStr = new Date(payload.createdAt).toLocaleString("pt-BR").toLowerCase();

      return payloadStr.includes(term) ||
        ipStr.includes(term) ||
        errorStr.includes(term) ||
        dateStr.includes(term);
    });
  }, [allPayloads, searchTerm]);

  // ✅ Calcular paginação
  const totalItems = filteredPayloads.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPayloads = filteredPayloads.slice(startIndex, endIndex);

  // ✅ Resetar para primeira página quando mudar busca ou itens por página
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, itemsPerPage]);

  // Função auxiliar para extrair valores do payload usando mapeamentos
  const getExtractedData = (payload: unknown, webhookMappings: Record<string, string> | null) => {
    if (!webhookMappings || !payload) return {};
    const extracted: Record<string, unknown> = {};
    for (const [targetField, sourcePath] of Object.entries(webhookMappings)) {
      if (targetField === "__periodConfig" || targetField === "__periodRules") continue;
      if (targetField === "planId" || targetField === "userStatus") {
        extracted[targetField] = sourcePath;
        continue;
      }
      if (typeof sourcePath !== "string") continue;
      const value = getNestedValue(payload, sourcePath);
      if (value !== null && value !== undefined) {
        extracted[targetField] = value;
      }
    }
    return extracted;
  };

  // Encontrar o webhook do payload selecionado
  const getWebhookForPayload = (payload: WebhookPayload) => {
    return allWebhooks?.find((w) => w.id === payload.webhookId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-telegram-blue border-t-transparent" />
          <p className="text-sm text-telegram-text-secondary">Carregando histórico...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Barra de busca */}
      <div className="mb-4 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-telegram-text-secondary" />
          <Input
            type="text"
            placeholder="Buscar no histórico (busca em todo o conteúdo do payload)..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-telegram-text-secondary">
            {totalItems} payload{totalItems !== 1 ? 's' : ''} encontrado{totalItems !== 1 ? 's' : ''}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-7 px-3 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Lista de payloads e detalhes */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6 overflow-hidden">
        {/* Lista de payloads */}
        <div className="flex flex-col space-y-2 overflow-hidden lg:border-r lg:border-telegram-gray-medium lg:pr-6">
          <div className="flex-1 overflow-y-auto pr-1 space-y-2">
            {!filteredPayloads || filteredPayloads.length === 0 ? (
              <Card className="border-2 border-dashed border-telegram-gray-medium bg-telegram-gray-light/50">
                <CardContent className="p-6 text-center">
                  <Info className="h-8 w-8 text-telegram-text-secondary mx-auto mb-2" />
                  <p className="text-sm text-telegram-text">
                    {searchTerm ? "Nenhum payload encontrado" : "Nenhum payload no histórico"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              paginatedPayloads.map((payload) => (
                <Card
                  key={payload.id}
                  className={`cursor-pointer transition-all ${selectedPayload?.id === payload.id
                    ? "border-2 border-telegram-blue bg-telegram-blue/5 shadow-md"
                    : "border hover:border-telegram-blue/50"
                    }`}
                  onClick={() => onSelectPayload(payload)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-xs font-semibold text-telegram-text">
                        {new Date(payload.createdAt).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      {/* Badge de status (Processado/Teste) */}
                      {payload.processed ? (
                        <Badge variant="default" className="text-xs bg-green-100 text-green-700 border-green-300 hover:bg-green-100">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Processado
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-100">
                          Teste
                        </Badge>
                      )}
                    </div>
                    {payload.ipAddress && (
                      <div className="text-xs text-telegram-text-secondary truncate mb-1.5">
                        <span className="inline-flex items-center gap-1">
                          <span className="font-medium">IP:</span>
                          <span className="font-mono">{payload.ipAddress}</span>
                        </span>
                      </div>
                    )}
                    {allWebhooks && (() => {
                      const webhook = allWebhooks.find((w) => w.id === payload.webhookId);
                      return webhook ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 p-2 rounded-md bg-telegram-gray-light/50 border border-telegram-gray-medium/50">
                            <WebhookIcon className="h-3.5 w-3.5 text-telegram-blue flex-shrink-0" />
                            <span className="text-xs font-semibold text-telegram-text truncate">
                              {webhook.name}
                            </span>
                          </div>
                          {/* Badge de ação (criado/atualizado) - embaixo do webhook */}
                          {payload.processed &&
                            payload.processDetails &&
                            typeof payload.processDetails === "object" &&
                            payload.processDetails !== null && (() => {
                              const processDetails = payload.processDetails as Record<string, unknown>;
                              if (processDetails.action === "created") {
                                return (
                                  <Badge variant="default" className="text-xs bg-green-100 text-green-700 border-green-300 hover:bg-green-100 w-fit">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Usuário Criado
                                  </Badge>
                                );
                              }
                              if (processDetails.action === "updated") {
                                return (
                                  <Badge variant="default" className="text-xs bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-100 w-fit">
                                    <Settings className="h-3 w-3 mr-1" />
                                    Usuário Atualizado
                                  </Badge>
                                );
                              }
                              return null;
                            })()}
                        </div>
                      ) : null;
                    })()}
                    {payload.error && (
                      <div className="text-xs text-red-600 mt-1.5 truncate">
                        <span className="font-medium">Erro:</span> {payload.error.substring(0, 50)}...
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
          {/* ✅ Controles de paginação - Layout centralizado e bonito */}
          {totalPages > 1 || totalItems > 0 ? (
            <div className="pt-4 border-t border-telegram-gray-medium">
              <div className="flex flex-col items-center gap-4">
                {/* Informações e controles principais */}
                <div className="flex items-center gap-4 flex-wrap justify-center">
                  {/* Botão Anterior */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="h-9 px-4 text-sm font-medium transition-all hover:bg-telegram-blue/5 hover:border-telegram-blue/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1.5" />
                    Anterior
                  </Button>

                  {/* Indicador de página */}
                  <div className="flex items-center gap-2 px-4 py-2 bg-telegram-gray-light rounded-lg border border-telegram-gray-medium">
                    <span className="text-sm font-semibold text-telegram-text">
                      Página {currentPage} de {totalPages}
                    </span>
                  </div>

                  {/* Botão Próxima */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="h-9 px-4 text-sm font-medium transition-all hover:bg-telegram-blue/5 hover:border-telegram-blue/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Próxima
                    <ChevronRight className="h-4 w-4 ml-1.5" />
                  </Button>
                </div>

                {/* Informações adicionais e seletor de itens por página */}
                <div className="flex items-center gap-4 flex-wrap justify-center">
                  {/* Contador de itens */}
                  <div className="text-xs text-telegram-text-secondary">
                    Mostrando <span className="font-semibold text-telegram-text">{startIndex + 1}</span> - <span className="font-semibold text-telegram-text">{Math.min(endIndex, totalItems)}</span> de <span className="font-semibold text-telegram-text">{totalItems}</span>
                  </div>

                  {/* Separador visual */}
                  <div className="h-4 w-px bg-telegram-gray-medium" />

                  {/* Seletor de itens por página */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-telegram-text-secondary font-medium">Itens por página:</span>
                    <Select
                      value={itemsPerPage.toString()}
                      onChange={(e) => {
                        setItemsPerPage(Number.parseInt(e.target.value, 10));
                        setCurrentPage(1);
                      }}
                      className="h-8 w-20 text-xs font-medium border-telegram-gray-medium focus:border-telegram-blue focus:ring-2 focus:ring-telegram-blue/20 transition-all"
                    >
                      <option value="10">10</option>
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Detalhes do payload selecionado */}
        <div className="flex-1 overflow-y-auto pr-2">
          {selectedPayload ? (
            <div className="space-y-4">
              {/* Payload Completo */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Payload Completo Recebido
                  </CardTitle>
                  <CardDescription>
                    Dados completos recebidos do webhook
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-telegram-gray-light p-4 rounded border border-telegram-gray-medium max-h-96 overflow-y-auto">
                    <pre className="text-xs font-mono text-telegram-text whitespace-pre-wrap break-words">
                      {JSON.stringify(selectedPayload.payload, null, 2)}
                    </pre>
                  </div>
                </CardContent>
              </Card>

              {/* Detalhes de Processamento */}
              {selectedPayload.processed &&
                selectedPayload.processDetails &&
                typeof selectedPayload.processDetails === "object" &&
                selectedPayload.processDetails !== null && (
                  (() => {
                    const processDetails = selectedPayload.processDetails as Record<string, unknown>;
                    return (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Settings className="h-4 w-4" />
                            O que foi processado
                          </CardTitle>
                          <CardDescription>
                            Detalhes completos do processamento do webhook
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {/* Ação executada */}
                            {processDetails.action && (
                              <div className="p-3 rounded-lg border-2 bg-telegram-gray-light/50">
                                <div className="flex items-center gap-2 mb-2">
                                  {processDetails.action === "created" && (
                                    <>
                                      <Badge variant="default" className="bg-green-100 text-green-700 border-green-300">
                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                        Usuário Criado
                                      </Badge>
                                    </>
                                  )}
                                  {processDetails.action === "updated" && (
                                    <Badge variant="default" className="bg-blue-100 text-blue-700 border-blue-300">
                                      <Settings className="h-3 w-3 mr-1" />
                                      Usuário Atualizado
                                    </Badge>
                                  )}
                                  {processDetails.action === "no_action" && (
                                    <Badge variant="secondary">Nenhuma ação</Badge>
                                  )}
                                  {processDetails.action === "error" && (
                                    <Badge variant="destructive">Erro no processamento</Badge>
                                  )}
                                </div>
                                {processDetails.message && (
                                  <p className="text-sm text-telegram-text font-medium">
                                    {String(processDetails.message)}
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Email do usuário */}
                            {processDetails.userEmail && (
                              <div>
                                <div className="text-xs font-semibold text-telegram-text mb-1">Email do usuário</div>
                                <div className="text-sm font-mono text-telegram-text bg-white px-2 py-1 rounded border">
                                  {String(processDetails.userEmail)}
                                </div>
                              </div>
                            )}

                            {/* ID do usuário */}
                            {processDetails.userId && (
                              <div>
                                <div className="text-xs font-semibold text-telegram-text mb-1">ID do usuário</div>
                                <div className="text-sm font-mono text-telegram-text bg-white px-2 py-1 rounded border">
                                  {String(processDetails.userId)}
                                </div>
                              </div>
                            )}

                            {/* Campos atualizados */}
                            {processDetails.fieldsUpdated &&
                              typeof processDetails.fieldsUpdated === "object" &&
                              processDetails.fieldsUpdated !== null &&
                              Object.keys(processDetails.fieldsUpdated as Record<string, unknown>).length > 0 && (
                                <div>
                                  <div className="text-xs font-semibold text-telegram-text mb-2">Campos atualizados/criados</div>
                                  <div className="space-y-2">
                                    {Object.entries(processDetails.fieldsUpdated as Record<string, unknown>).map(([key, value]) => {
                                      // ✅ Formatar data de vencimento para DD/MM/AAAA
                                      const formatValue = () => {
                                        if (value === null || value === undefined) return "(nulo)";

                                        // Se for expiresAt, formatar como data DD/MM/AAAA
                                        if (key === "expiresAt") {
                                          try {
                                            const date = new Date(String(value));
                                            if (!isNaN(date.getTime())) {
                                              return date.toLocaleDateString("pt-BR", {
                                                day: "2-digit",
                                                month: "2-digit",
                                                year: "numeric",
                                              });
                                            }
                                          } catch {
                                            // Se falhar, retornar o valor original
                                          }
                                        }

                                        return String(value);
                                      };

                                      return (
                                        <div key={key} className="border-b border-telegram-gray-medium pb-2 last:border-0">
                                          <div className="text-xs font-semibold text-telegram-text mb-1 capitalize">
                                            {key === "name" ? "Nome Completo" :
                                              key === "email" ? "Email" :
                                                key === "whatsapp" ? "Telefone" :
                                                  key === "cpf" ? "CPF" :
                                                    key === "planId" ? "Planos" :
                                                      key === "period" ? "Período recorrência" :
                                                        key === "periodCount" ? "Valor do período recorrência" :
                                                          key === "expiresAt" ? "Data de Vencimento" :
                                                            key === "userStatus" ? "Status do Usuário" : key}
                                          </div>
                                          <div className="text-sm font-mono text-telegram-text bg-white px-2 py-1 rounded border">
                                            {formatValue()}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                            {/* Dados extraídos */}
                            {processDetails.extractedData &&
                              typeof processDetails.extractedData === "object" &&
                              processDetails.extractedData !== null &&
                              Object.keys(processDetails.extractedData as Record<string, unknown>).length > 0 && (
                                <div>
                                  <div className="text-xs font-semibold text-telegram-text mb-2">Dados extraídos do payload</div>
                                  <div className="bg-telegram-gray-light p-3 rounded border max-h-48 overflow-y-auto">
                                    <pre className="text-xs font-mono text-telegram-text whitespace-pre-wrap break-words">
                                      {JSON.stringify(processDetails.extractedData, null, 2)}
                                    </pre>
                                  </div>
                                </div>
                              )}

                            {/* Data de processamento */}
                            {selectedPayload.processedAt && (
                              <div className="pt-2 border-t border-telegram-gray-medium">
                                <div className="text-xs text-telegram-text-secondary">
                                  Processado em: {new Date(selectedPayload.processedAt).toLocaleString("pt-BR")}
                                </div>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })()
                )}

              {/* Resposta Enviada */}
              {selectedPayload.responseBody && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <ExternalLink className="h-4 w-4" />
                      Resposta Enviada
                    </CardTitle>
                    <CardDescription>
                      Resposta HTTP enviada para o webhook após recebimento
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-telegram-gray-light p-4 rounded border border-telegram-gray-medium max-h-64 overflow-y-auto">
                      <pre className="text-xs font-mono text-telegram-text whitespace-pre-wrap break-words">
                        {JSON.stringify(selectedPayload.responseBody, null, 2)}
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Erro se houver */}
              {selectedPayload.error && (
                <Card className="border-red-200 bg-red-50">
                  <CardHeader>
                    <CardTitle className="text-base text-red-700 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Erro no Processamento
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-red-700 font-mono bg-white p-3 rounded border border-red-200">
                      {selectedPayload.error}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Informações Adicionais */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    Informações da Requisição
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-semibold text-telegram-text">Método:</span>{" "}
                      <code className="bg-telegram-gray-light px-1 rounded">{selectedPayload.method}</code>
                    </div>
                    {selectedPayload.ipAddress && (
                      <div>
                        <span className="font-semibold text-telegram-text">IP Address:</span>{" "}
                        <code className="bg-telegram-gray-light px-1 rounded">{selectedPayload.ipAddress}</code>
                      </div>
                    )}
                    {selectedPayload.userAgent && (
                      <div>
                        <span className="font-semibold text-telegram-text">User-Agent:</span>{" "}
                        <code className="bg-telegram-gray-light px-1 rounded text-xs">{selectedPayload.userAgent}</code>
                      </div>
                    )}
                    <div>
                      <span className="font-semibold text-telegram-text">Recebido em:</span>{" "}
                      {new Date(selectedPayload.createdAt).toLocaleString("pt-BR")}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="border-2 border-dashed border-telegram-gray-medium bg-telegram-gray-light/50">
              <CardContent className="p-8 text-center">
                <Info className="h-8 w-8 text-telegram-text-secondary mx-auto mb-2" />
                <p className="text-sm text-telegram-text">Selecione um payload para ver os detalhes</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
