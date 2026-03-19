/**
 * Página de Administração de Planos
 *
 * Permite que administradores gerenciem planos do sistema:
 * - Criar novos planos
 * - Listar todos os planos
 * - Editar planos existentes
 * - Deletar planos
 * - Visualizar planos na mesma estrutura da página pública
 *
 * Apenas administradores podem acessar esta página.
 */

import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { Badge } from "@/shared/components/ui/badge";
import { Separator } from "@/shared/components/ui/separator";
import { Textarea } from "@/shared/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { trpc } from "@/shared/lib/trpc";
import { useAuth } from "@/shared/providers/auth-provider";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Edit,
  GripVertical,
  Info,
  Link as LinkIcon,
  Package,
  Plus,
  Search,
  Settings,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const createPlanSchema = z.object({
  name: z.string().min(1, "Nome do plano é obrigatório"),
  description: z.string().optional().nullable(),
  price: z.number().min(0, "Preço deve ser maior ou igual a zero"),
  durationDays: z.string().optional().nullable().refine(
    (val) => {
      if (!val || val === "") return true;
      const num = Number.parseInt(val, 10);
      return !Number.isNaN(num) && num >= 1;
    },
    { message: "Deve ser um número maior ou igual a 1" }
  ),
  freeTrialDurationHours: z.string().optional().nullable().refine(
    (val) => {
      if (!val || val === "") return true;
      const num = Number.parseInt(val, 10);
      return !Number.isNaN(num) && num >= 1;
    },
    { message: "Deve ser um número maior ou igual a 1" }
  ),
  maxConnections: z.number().int().min(1, "Máximo de conexões deve ser pelo menos 1"),
  maxBots: z.string().optional().nullable().refine(
    (val) => {
      if (!val || val === "") return true;
      const num = Number.parseInt(val, 10);
      return !Number.isNaN(num) && num >= 1;
    },
    { message: "Deve ser um número maior ou igual a 1" }
  ),
  maxLeads: z.string().optional().nullable().refine(
    (val) => {
      if (!val || val === "") return true;
      const num = Number.parseInt(val, 10);
      return !Number.isNaN(num) && num >= 1;
    },
    { message: "Deve ser um número maior ou igual a 1" }
  ),
  maxFlows: z.string().optional().nullable().refine(
    (val) => {
      if (!val || val === "") return true;
      const num = Number.parseInt(val, 10);
      return !Number.isNaN(num) && num >= 1;
    },
    { message: "Deve ser um número maior ou igual a 1" }
  ),
  allowDashboard: z.boolean().default(true),
  allowConnections: z.boolean().default(true),
  allowBots: z.boolean().default(true),
  allowWelcomeGoodbye: z.boolean().default(true),
  allowLeads: z.boolean().default(true),
  allowConversations: z.boolean().default(true),
  allowBulkMessage: z.boolean().default(true),
  allowFlow: z.boolean().default(true),
  allowMessageClone: z.boolean().default(false),
  allowScheduledMessage: z.boolean().default(false),
  isActive: z.boolean().default(true),
  checkoutUrl: z.string().url("URL inválida").optional().nullable().or(z.literal("")),
  badge: z.string().optional().nullable(),
  toggleId: z.string().optional().nullable(),
  toggleOptionValue: z.string().optional().nullable(),
  customBenefits: z.array(z.string()).optional().nullable(),
});

const updatePlanSchema = createPlanSchema.extend({
  id: z.string(),
});

type CreatePlanFormData = z.infer<typeof createPlanSchema>;
type UpdatePlanFormData = z.infer<typeof updatePlanSchema>;

type Plan = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  durationDays: number | null;
  maxConnections: number;
  maxBots: number | null;
  maxLeads: number | null;
  maxFlows: number | null;
  allowDashboard: boolean;
  allowConnections: boolean;
  allowBots: boolean;
  allowWelcomeGoodbye: boolean;
  allowLeads: boolean;
  allowConversations: boolean;
  allowBulkMessage: boolean;
  allowFlow: boolean;
  allowMessageClone: boolean;
  allowScheduledMessage: boolean;
  isActive: boolean;
  checkoutUrl: string | null;
  badge: string | null;
  toggleId: string | null;
  toggleOptionValue?: string | null;
  customBenefits: Array<{ text: string; hasFeature: boolean } | string> | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Formata limite para exibição
 */
function formatLimit(limit: number | null): string {
  if (limit === null) return "Ilimitado";
  return limit.toString();
}

/**
 * Obtém descrição curta do plano (para o header)
 */
function getPlanShortDescription(plan: Plan): string {
  const descriptions: Record<string, string> = {
    BASIC: "Ideal para pequenos projetos",
    PRO: "Ideal para pequenas e médias empresas",
    EXPERT: "Ideal para médias e grandes empresas",
    PROFESSIONAL: "Ideal para grandes empresas e corporações",
  };

  return descriptions[plan.name] || plan.description || "";
}

/**
 * Interface para feature com status
 */
interface FeatureWithStatus {
  label: string;
  hasFeature: boolean;
}

/**
 * Gera lista completa de features com status para comparação
 * IMPORTANTE: Só mostra benefícios customizados. Se não houver benefícios customizados, retorna array vazio.
 */
function getAllFeaturesWithStatus(plan: Plan): FeatureWithStatus[] {
  const allFeatures: FeatureWithStatus[] = [];

  // Adicionar benefícios customizados APENAS se existirem e não forem vazios
  if (plan.customBenefits && Array.isArray(plan.customBenefits) && plan.customBenefits.length > 0) {
    // Parse customBenefits - pode ser array de strings ou array de objetos {text, hasFeature}
    plan.customBenefits.forEach((benefit) => {
      if (typeof benefit === "string" && benefit.trim() !== "") {
        allFeatures.push({
          label: benefit.trim(),
          hasFeature: true,
        });
      } else if (typeof benefit === "object" && benefit !== null) {
        const text = (benefit as any).text;
        if (text && typeof text === "string" && text.trim() !== "") {
          allFeatures.push({
            label: text.trim(),
            hasFeature: (benefit as any).hasFeature !== false,
          });
        }
      }
    });
  }

  // Se não houver benefícios customizados, retornar array vazio
  return allFeatures;
}

/**
 * Determina o período do plano baseado na duração em dias
 */
function getPlanPeriod(durationDays: number | null): { label: string; variant: "default" | "secondary" | "outline" } | null {
  if (!durationDays) return null;

  if (durationDays === 30 || durationDays === 31) {
    return { label: "Mensal", variant: "default" };
  }
  if (durationDays === 90) {
    return { label: "Trimestral", variant: "default" };
  }
  if (durationDays === 180) {
    return { label: "Semestral", variant: "default" };
  }
  if (durationDays === 365 || durationDays === 366) {
    return { label: "Anual", variant: "default" };
  }

  // Se não corresponder a nenhum período padrão, retornar null
  return null;
}

/**
 * Componente de item de benefício customizado com drag and drop e edição
 */
function SortableBenefitItem({
  benefit,
  index,
  isEditing,
  editingText,
  onEditTextChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onToggle,
  onRemove,
}: {
  benefit: { text: string; hasFeature: boolean };
  index: number;
  isEditing: boolean;
  editingText: string;
  onEditTextChange: (text: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: index });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-telegram-blue/50 transition-colors ${isDragging ? "shadow-lg" : ""
        }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
      >
        <GripVertical className="h-5 w-5" />
      </div>
      <button
        type="button"
        onClick={onToggle}
        className="flex-shrink-0"
      >
        {benefit.hasFeature ? (
          <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
            <Check className="h-3 w-3 text-white stroke-[3]" />
          </div>
        ) : (
          <div className="h-5 w-5 rounded-full bg-red-100 flex items-center justify-center">
            <X className="h-3 w-3 text-red-500 stroke-[3]" />
          </div>
        )}
      </button>
      {isEditing ? (
        <div className="flex-1 flex items-center gap-2">
          <Input
            value={editingText}
            onChange={(e) => onEditTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSaveEdit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onCancelEdit();
              }
            }}
            className="flex-1 h-8 text-sm"
            autoFocus
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSaveEdit}
            className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancelEdit}
            className="h-8 w-8 p-0 text-gray-600 hover:text-gray-700 hover:bg-gray-50"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <span
            className={`flex-1 text-sm cursor-pointer ${benefit.hasFeature ? "text-gray-700" : "text-gray-400"
              }`}
            onClick={onStartEdit}
            onDoubleClick={onStartEdit}
          >
            {benefit.text}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onStartEdit}
            className="h-8 w-8 p-0 text-telegram-blue hover:text-telegram-blue-dark hover:bg-telegram-blue/10 flex-shrink-0"
            title="Editar"
          >
            <Edit className="h-4 w-4" />
          </Button>
        </>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRemove}
        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
        title="Remover"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

/**
 * Componente de card agrupado que mostra todos os períodos de um plano em um único card
 */
function GroupedPlanCard({
  planGroup,
  onEdit,
  onDelete,
  onToggleActive,
  onDuplicate,
}: {
  planGroup: Plan[];
  onEdit: (plan: Plan) => void;
  onDelete: (plan: Plan) => void;
  onToggleActive: (plan: Plan) => void;
  onDuplicate: (plan: Plan) => void;
}) {
  const firstPlan = planGroup[0];
  const features = getAllFeaturesWithStatus(firstPlan);
  const shortDescription = getPlanShortDescription(firstPlan);
  const hasBadge = firstPlan.badge && firstPlan.badge.trim() !== "";

  // Separar planos por período
  const monthlyPlan = planGroup.find((p) => p.durationDays === 30);
  const quarterlyPlan = planGroup.find((p) => p.durationDays === 90);
  const annualPlan = planGroup.find((p) => p.durationDays === 365);

  // Usar o primeiro plano para ações que afetam o grupo
  const representativePlan = firstPlan;

  return (
    <Card className="h-full flex flex-col border-2 border-telegram-blue/20 hover:border-telegram-blue/40 transition-all shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <CardTitle className="text-lg sm:text-xl font-bold text-telegram-blue break-words">
                {representativePlan.name}
              </CardTitle>
              {representativePlan.isActive && (
                <Badge className="bg-green-500 text-white text-xs">Ativo</Badge>
              )}
              {hasBadge && (
                <Badge variant="secondary" className="text-xs">
                  {representativePlan.badge}
                </Badge>
              )}
            </div>
            {shortDescription && (
              <CardDescription className="text-sm mt-1">{shortDescription}</CardDescription>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 pt-3 pb-3 px-4 min-h-0">
        {/* Preços por período */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
          {monthlyPlan && (
            <div className="text-center p-2 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-xs text-gray-600 mb-1">Mensal</div>
              <div className="text-lg font-bold text-telegram-blue">R$ {monthlyPlan.price.toFixed(2)}</div>
              <div className="text-xs text-gray-500">30 dias</div>
            </div>
          )}
          {quarterlyPlan && (
            <div className="text-center p-2 bg-green-50 rounded-lg border border-green-200">
              <div className="text-xs text-gray-600 mb-1">Trimestral</div>
              <div className="text-lg font-bold text-telegram-blue">R$ {quarterlyPlan.price.toFixed(2)}</div>
              <div className="text-xs text-gray-500">90 dias</div>
            </div>
          )}
          {annualPlan && (
            <div className="text-center p-2 bg-purple-50 rounded-lg border border-purple-200">
              <div className="text-xs text-gray-600 mb-1">Anual</div>
              <div className="text-lg font-bold text-telegram-blue">R$ {annualPlan.price.toFixed(2)}</div>
              <div className="text-xs text-gray-500">365 dias</div>
            </div>
          )}
        </div>

        <Separator className="my-3" />

        {/* Features */}
        {features.length > 0 ? (
          <ul className="space-y-1.5 h-full max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
            {features.map((feature, index) => (
              <li key={index} className="flex items-start gap-2">
                <div className="flex-shrink-0 mt-0.5">
                  {feature.hasFeature ? (
                    <div className="h-3.5 w-3.5 rounded-full bg-green-500 flex items-center justify-center">
                      <Check className="h-2 w-2 text-white stroke-[3]" />
                    </div>
                  ) : (
                    <div className="h-3.5 w-3.5 rounded-full bg-red-100 flex items-center justify-center">
                      <X className="h-2 w-2 text-red-500 stroke-[3]" />
                    </div>
                  )}
                </div>
                <span
                  className={`text-xs leading-relaxed ${feature.hasFeature ? "text-gray-700" : "text-gray-400 line-through"
                    }`}
                >
                  {feature.label}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-400 text-center py-4">Nenhum benefício customizado</p>
        )}
      </CardContent>

      <CardFooter className="pt-3 pb-4 px-4 border-t">
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 w-full">
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-9 border-telegram-blue text-telegram-blue hover:bg-telegram-blue/10 hover:text-telegram-blue-dark"
            onClick={() => onEdit(representativePlan)}
          >
            <Edit className="h-3.5 w-3.5 mr-1.5" />
            Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-9 border-telegram-blue text-telegram-blue hover:bg-telegram-blue/10 hover:text-telegram-blue-dark"
            onClick={() => onDuplicate(representativePlan)}
          >
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Duplicar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-9 border-telegram-blue text-telegram-blue hover:bg-telegram-blue/10 hover:text-telegram-blue-dark"
            onClick={() => onToggleActive(representativePlan)}
          >
            {representativePlan.isActive ? (
              <>
                <X className="h-3.5 w-3.5 mr-1.5" />
                Desativar
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Ativar
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-9 border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-600"
            onClick={() => onDelete(representativePlan)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Excluir
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

function PlanCard({
  plan,
  onEdit,
  onDelete,
  onToggleActive,
  onDuplicate,
}: {
  plan: Plan;
  onEdit: (plan: Plan) => void;
  onDelete: (plan: Plan) => void;
  onToggleActive: (plan: Plan) => void;
  onDuplicate: (plan: Plan) => void;
}) {
  const features = getAllFeaturesWithStatus(plan);
  const shortDescription = getPlanShortDescription(plan);
  const hasBadge = plan.badge && plan.badge.trim() !== "";
  const planPeriod = getPlanPeriod(plan.durationDays);

  return (
    <div className="relative h-full flex">
      <Card
        className={`relative flex flex-col transition-all duration-300 hover:shadow-lg w-full ${hasBadge
          ? "border-2 border-telegram-blue shadow-md bg-gradient-to-b from-white via-telegram-blue/5 to-telegram-blue/10"
          : "border border-gray-200 shadow-sm hover:border-telegram-blue/50"
          }`}
      >
        {/* Badge do Plano - centralizado na linha de cima */}
        {hasBadge && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
            <Badge className="bg-gradient-to-r from-telegram-blue to-telegram-blue-dark text-white border-2 border-white shadow-md text-xs font-bold px-3 py-1 rounded-full">
              ⭐ {plan.badge}
            </Badge>
          </div>
        )}

        {/* Badge de Status */}
        <div className="absolute top-2 right-2 z-10">
          <Badge
            variant={plan.isActive ? "default" : "secondary"}
            className={`${plan.isActive ? "bg-green-600" : "bg-gray-400"} text-xs px-2 py-0.5`}
          >
            {plan.isActive ? "Ativo" : "Inativo"}
          </Badge>
        </div>

        <CardHeader className="relative text-center pb-2 pt-4">
          <div className="space-y-1">
            <CardTitle className={`text-lg font-bold ${hasBadge ? "text-telegram-blue" : "text-gray-900"}`}>
              {plan.name}
            </CardTitle>
            {plan.description && plan.description.trim() !== "" && (
              <CardDescription className="text-xs text-gray-600 line-clamp-2">
                {plan.description}
              </CardDescription>
            )}
          </div>

          <div className="mt-3 space-y-2">
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-3xl font-bold text-telegram-blue">
                R$ {plan.price.toFixed(0)}
              </span>
            </div>
            {planPeriod && (
              <div className="flex justify-center">
                <Badge
                  variant={planPeriod.variant}
                  className="bg-telegram-blue text-white text-xs px-2 py-0.5"
                >
                  {planPeriod.label}
                </Badge>
              </div>
            )}
          </div>
        </CardHeader>

        {/* Informações Administrativas */}
        <div className="px-4 pb-2 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Duração:</span>
            <span className="font-medium text-gray-700">
              {plan.durationDays ? `${plan.durationDays} dias` : "Sem vencimento"}
            </span>
          </div>
          {plan.checkoutUrl && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Checkout:</span>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-telegram-blue hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(plan.checkoutUrl || "", "_blank");
                }}
              >
                <LinkIcon className="h-3 w-3 mr-1" />
                Testar Link
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-center px-4">
          <Separator className="w-full" />
        </div>

        <CardContent className="flex-1 pt-3 pb-3 px-4 min-h-0">
          {features.length > 0 ? (
            <ul className="space-y-1.5 h-full max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
              {features.map((feature, index) => (
                <li key={index} className="flex items-start gap-2">
                  <div className="flex-shrink-0 mt-0.5">
                    {feature.hasFeature ? (
                      <div className="h-3.5 w-3.5 rounded-full bg-green-500 flex items-center justify-center">
                        <Check className="h-2 w-2 text-white stroke-[3]" />
                      </div>
                    ) : (
                      <div className="h-3.5 w-3.5 rounded-full bg-red-100 flex items-center justify-center">
                        <X className="h-2 w-2 text-red-500 stroke-[3]" />
                      </div>
                    )}
                  </div>
                  <span className={`text-xs ${feature.hasFeature ? "text-gray-700" : "text-gray-400"} leading-tight`}>
                    {feature.label}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-400 text-center py-4">
              Nenhuma feature configurada
            </p>
          )}
        </CardContent>

        <CardFooter className="pt-2 pb-3 px-4">
          <div className="w-full grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-9 border-telegram-blue text-telegram-blue hover:bg-telegram-blue/10 hover:text-telegram-blue-dark"
              onClick={() => onEdit(plan)}
            >
              <Edit className="h-3.5 w-3.5 mr-1.5" />
              Editar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-9 border-telegram-blue text-telegram-blue hover:bg-telegram-blue/10 hover:text-telegram-blue-dark"
              onClick={() => onDuplicate(plan)}
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Duplicar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-9 border-telegram-blue text-telegram-blue hover:bg-telegram-blue/10 hover:text-telegram-blue-dark"
              onClick={() => onToggleActive(plan)}
            >
              {plan.isActive ? (
                <>
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Desativar
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  Ativar
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-9 border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-600"
              onClick={() => onDelete(plan)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Excluir
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

export function PlanAdminPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<Plan | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showOnlyActive, setShowOnlyActive] = useState(true);
  const [createMultiplePlans, setCreateMultiplePlans] = useState(false);
  const [customBenefitsCreate, setCustomBenefitsCreate] = useState<Array<{ text: string; hasFeature: boolean }>>([]);
  const [customBenefitsEdit, setCustomBenefitsEdit] = useState<Array<{ text: string; hasFeature: boolean }>>([]);
  const [newBenefitCreate, setNewBenefitCreate] = useState("");
  const [newBenefitEdit, setNewBenefitEdit] = useState("");
  const [editingBenefitIndexCreate, setEditingBenefitIndexCreate] = useState<number | null>(null);
  const [editingBenefitIndexEdit, setEditingBenefitIndexEdit] = useState<number | null>(null);
  const [editingBenefitTextCreate, setEditingBenefitTextCreate] = useState("");
  const [editingBenefitTextEdit, setEditingBenefitTextEdit] = useState("");

  // Sensors para drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Estados para múltiplos planos (criação)
  const [monthlyPrice, setMonthlyPrice] = useState<string>("");
  const [quarterlyPrice, setQuarterlyPrice] = useState<string>("");
  const [annualPrice, setAnnualPrice] = useState<string>("");

  // Estados para edição de múltiplos planos
  const [monthlyPriceEdit, setMonthlyPriceEdit] = useState<string>("");
  const [quarterlyPriceEdit, setQuarterlyPriceEdit] = useState<string>("");
  const [annualPriceEdit, setAnnualPriceEdit] = useState<string>("");
  const [monthlyCheckoutUrl, setMonthlyCheckoutUrl] = useState<string>("");
  const [quarterlyCheckoutUrl, setQuarterlyCheckoutUrl] = useState<string>("");
  const [annualCheckoutUrl, setAnnualCheckoutUrl] = useState<string>("");
  const [monthlyCheckoutUrlEdit, setMonthlyCheckoutUrlEdit] = useState<string>("");
  const [quarterlyCheckoutUrlEdit, setQuarterlyCheckoutUrlEdit] = useState<string>("");
  const [annualCheckoutUrlEdit, setAnnualCheckoutUrlEdit] = useState<string>("");
  const [hasGroupPlansEdit, setHasGroupPlansEdit] = useState(false);

  // Estados para gerenciamento de toggle do plano
  const [selectedToggleIdCreate, setSelectedToggleIdCreate] = useState<string>("");
  const [selectedToggleOptionValueCreate, setSelectedToggleOptionValueCreate] = useState<string>("");
  const [selectedToggleIdEdit, setSelectedToggleIdEdit] = useState<string>("");
  const [selectedToggleOptionValueEdit, setSelectedToggleOptionValueEdit] = useState<string>("");

  // Estados para gerenciamento de toggles compartilhados (legado)
  const [isToggleDialogOpen, setIsToggleDialogOpen] = useState(false);
  const [editingToggle, setEditingToggle] = useState<{ id: string; name: string; options: Array<{ label: string; value: string }> } | null>(null);
  const [newToggleName, setNewToggleName] = useState("");
  const [toggleOptions, setToggleOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [newToggleLabel, setNewToggleLabel] = useState("");
  const [newToggleValue, setNewToggleValue] = useState("");

  // Verificar se o usuário atual é admin
  useEffect(() => {
    if (currentUser && currentUser.role !== "admin") {
      navigate("/dashboard");
    }
  }, [currentUser, navigate]);

  const utils = trpc.useUtils();

  const {
    data: plans,
    isLoading,
    error,
    refetch,
  } = trpc.plan.getAllPlans.useQuery(undefined, {
    enabled: currentUser?.role === "admin",
    staleTime: 0, // Sempre considerar stale para garantir dados atualizados após mutações
    gcTime: 600000, // 10 minutos
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });

  const {
    data: toggles,
    isLoading: isLoadingToggles,
    refetch: refetchToggles,
  } = trpc.planToggle.getAllToggles.useQuery(undefined, {
    enabled: currentUser?.role === "admin",
    staleTime: 300000,
    gcTime: 600000,
  });

  const createPlanMutation = trpc.plan.createPlan.useMutation({
    onSuccess: () => {
      setIsCreateDialogOpen(false);
      refetch();
      resetCreate();
      setCreateMultiplePlans(false);
      setMonthlyPrice("");
      setQuarterlyPrice("");
      setAnnualPrice("");
      setMonthlyCheckoutUrl("");
      setQuarterlyCheckoutUrl("");
      setAnnualCheckoutUrl("");
      setCustomBenefitsCreate([]);
      setEditingBenefitIndexCreate(null);
      setEditingBenefitTextCreate("");
    },
    onError: (error) => {
      alert(`Erro ao criar plano: ${error.message}`);
    },
  });

  const createMultiplePlansMutation = trpc.plan.createMultiplePlans.useMutation({
    onSuccess: () => {
      setIsCreateDialogOpen(false);
      refetch();
      resetCreate();
      setCreateMultiplePlans(false);
      setMonthlyPrice("");
      setQuarterlyPrice("");
      setAnnualPrice("");
      setMonthlyCheckoutUrl("");
      setQuarterlyCheckoutUrl("");
      setAnnualCheckoutUrl("");
      setCustomBenefitsCreate([]);
      setEditingBenefitIndexCreate(null);
      setEditingBenefitTextCreate("");
    },
    onError: (error) => {
      alert(`Erro ao criar múltiplos planos: ${error.message}`);
    },
  });

  const updatePlanMutation = trpc.plan.updatePlan.useMutation({
    onSuccess: () => {
      setIsEditDialogOpen(false);
      setEditingPlan(null);
      setEditingBenefitIndexEdit(null);
      setEditingBenefitTextEdit("");
      refetch();
    },
    onError: (error) => {
      alert(`Erro ao atualizar plano: ${error.message}`);
    },
  });

  const updatePlansByGroupMutation = trpc.plan.updatePlansByGroup.useMutation({
    onSuccess: () => {
      setIsEditDialogOpen(false);
      setEditingPlan(null);
      setEditingBenefitIndexEdit(null);
      setEditingBenefitTextEdit("");
      setMonthlyPriceEdit("");
      setQuarterlyPriceEdit("");
      setAnnualPriceEdit("");
      setMonthlyCheckoutUrlEdit("");
      setQuarterlyCheckoutUrlEdit("");
      setAnnualCheckoutUrlEdit("");
      refetch();
    },
    onError: (error) => {
      alert(`Erro ao atualizar planos do grupo: ${error.message}`);
    },
  });

  const updatePlansPricesByGroupMutation = trpc.plan.updatePlansPricesByGroup.useMutation({
    onSuccess: () => {
      setIsEditDialogOpen(false);
      setEditingPlan(null);
      setEditingBenefitIndexEdit(null);
      setEditingBenefitTextEdit("");
      setMonthlyPriceEdit("");
      setQuarterlyPriceEdit("");
      setAnnualPriceEdit("");
      setMonthlyCheckoutUrlEdit("");
      setQuarterlyCheckoutUrlEdit("");
      setAnnualCheckoutUrlEdit("");
      refetch();
    },
    onError: (error) => {
      alert(`Erro ao atualizar preços dos planos do grupo: ${error.message}`);
    },
  });

  const deletePlanMutation = trpc.plan.deletePlan.useMutation({
    onSuccess: async () => {
      // Invalidar cache primeiro
      await utils.plan.getAllPlans.invalidate();
      // Fazer refetch imediato
      await refetch();
      // Fechar dialog
      setIsDeleteDialogOpen(false);
      setDeletingPlan(null);
    },
    onError: (error) => {
      alert(`Erro ao deletar plano: ${error.message}`);
    },
  });

  const deletePlanPermanentlyMutation = trpc.plan.deletePlanPermanently.useMutation({
    onSuccess: async () => {
      // Invalidar cache primeiro
      await utils.plan.getAllPlans.invalidate();
      // Fazer refetch imediato
      await refetch();
      // Fechar dialog
      setIsDeleteDialogOpen(false);
      setDeletingPlan(null);
    },
    onError: (error) => {
      alert(`Erro ao excluir plano permanentemente: ${error.message}`);
    },
  });

  const deletePlansByGroupMutation = trpc.plan.deletePlansByGroup.useMutation({
    onSuccess: async () => {
      // Invalidar cache primeiro
      await utils.plan.getAllPlans.invalidate();
      // Fazer refetch imediato
      await refetch();
      // Fechar dialog
      setIsDeleteDialogOpen(false);
      setDeletingPlan(null);
    },
    onError: (error) => {
      alert(`Erro ao desativar planos do grupo: ${error.message}`);
    },
  });

  const deletePlansByGroupPermanentlyMutation = trpc.plan.deletePlansByGroupPermanently.useMutation({
    onSuccess: async () => {
      // Invalidar cache primeiro
      await utils.plan.getAllPlans.invalidate();
      // Fazer refetch imediato
      await refetch();
      // Fechar dialog
      setIsDeleteDialogOpen(false);
      setDeletingPlan(null);
    },
    onError: (error) => {
      alert(`Erro ao excluir permanentemente planos do grupo: ${error.message}`);
    },
  });

  const createToggleMutation = trpc.planToggle.createToggle.useMutation({
    onSuccess: () => {
      setIsToggleDialogOpen(false);
      setNewToggleName("");
      setToggleOptions([]);
      setNewToggleLabel("");
      setNewToggleValue("");
      refetchToggles();
    },
    onError: (error) => {
      alert(`Erro ao criar toggle: ${error.message}`);
    },
  });

  const updateToggleMutation = trpc.planToggle.updateToggle.useMutation({
    onSuccess: () => {
      setIsToggleDialogOpen(false);
      setEditingToggle(null);
      setNewToggleName("");
      setToggleOptions([]);
      setNewToggleLabel("");
      setNewToggleValue("");
      refetchToggles();
    },
    onError: (error) => {
      alert(`Erro ao atualizar toggle: ${error.message}`);
    },
  });

  const toggleActiveMutation = trpc.planToggle.updateToggle.useMutation({
    onSuccess: () => {
      refetchToggles();
    },
    onError: (error) => {
      alert(`Erro ao atualizar toggle: ${error.message}`);
    },
  });

  const deleteToggleMutation = trpc.planToggle.deleteToggle.useMutation({
    onSuccess: () => {
      refetchToggles();
    },
    onError: (error) => {
      alert(`Erro ao deletar toggle: ${error.message}`);
    },
  });

  const toggleToggleActive = (toggle: { id: string; name: string; isActive: boolean; options: Array<{ label: string; value: string }> }) => {
    toggleActiveMutation.mutate({
      id: toggle.id,
      name: toggle.name,
      options: toggle.options,
      isActive: !toggle.isActive,
    });
  };

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    formState: { errors: errorsEdit },
    setValue: setValueEdit,
    watch: watchEdit,
    reset: resetEdit,
    control: controlEdit,
  } = useForm<UpdatePlanFormData>({
    resolver: zodResolver(updatePlanSchema),
  });

  const {
    register: registerCreate,
    handleSubmit: handleSubmitCreate,
    formState: { errors: errorsCreate },
    setValue: setValueCreate,
    watch: watchCreate,
    reset: resetCreate,
    control: controlCreate,
  } = useForm<CreatePlanFormData>({
    resolver: zodResolver(createPlanSchema),
    defaultValues: {
      allowDashboard: true,
      allowConnections: true,
      allowBots: true,
      allowWelcomeGoodbye: true,
      allowLeads: true,
      allowConversations: true,
      allowBulkMessage: true,
      allowFlow: true,
      allowMessageClone: false,
      allowScheduledMessage: false,
      isActive: true,
    },
  });

  useEffect(() => {
    if (editingPlan) {
      setValueEdit("id", editingPlan.id);
      setValueEdit("name", editingPlan.name);
      setValueEdit("description", editingPlan.description || "");
      setValueEdit("price", editingPlan.price);
      setValueEdit("maxConnections", editingPlan.maxConnections);
      setValueEdit("maxBots", editingPlan.maxBots?.toString() || "");
      setValueEdit("maxLeads", editingPlan.maxLeads?.toString() || "");
      setValueEdit("maxFlows", editingPlan.maxFlows?.toString() || "");
      setValueEdit("allowDashboard", editingPlan.allowDashboard);
      setValueEdit("allowConnections", editingPlan.allowConnections);
      setValueEdit("allowBots", editingPlan.allowBots);
      setValueEdit("allowWelcomeGoodbye", editingPlan.allowWelcomeGoodbye);
      setValueEdit("allowLeads", editingPlan.allowLeads);
      setValueEdit("allowConversations", (editingPlan as any).allowConversations ?? true);
      setValueEdit("allowBulkMessage", editingPlan.allowBulkMessage);
      setValueEdit("allowFlow", editingPlan.allowFlow);
      setValueEdit("allowMessageClone", editingPlan.allowMessageClone);
      setValueEdit("allowScheduledMessage", editingPlan.allowScheduledMessage);
      setValueEdit("isActive", editingPlan.isActive);
      setValueEdit("checkoutUrl", editingPlan.checkoutUrl || "");
      setValueEdit("badge", editingPlan.badge || "");
      setValueEdit("durationDays", editingPlan.durationDays?.toString() || "");
      setValueEdit("freeTrialDurationHours", (editingPlan as any).freeTrialDurationHours?.toString() || "");
      // Carregar toggleId e toggleOptionValue do plano
      setSelectedToggleIdEdit(editingPlan.toggleId || "");
      setSelectedToggleOptionValueEdit((editingPlan as any).toggleOptionValue || "");
      // Parse customBenefits - pode ser array de strings ou objetos
      if (editingPlan.customBenefits && editingPlan.customBenefits.length > 0) {
        const parsed = editingPlan.customBenefits.map((b) => {
          if (typeof b === "string") {
            return { text: b, hasFeature: true };
          }
          return { text: (b as any).text || String(b), hasFeature: (b as any).hasFeature !== false };
        });
        setCustomBenefitsEdit(parsed);
      } else {
        setCustomBenefitsEdit([]);
      }
      setNewBenefitEdit("");

      // Verificar se existem outros planos com o mesmo nome (mesmo grupo)
      const plansWithSameName = plans?.filter((p) => p.name === editingPlan.name) || [];
      const hasGroup = plansWithSameName.length > 1;
      setHasGroupPlansEdit(hasGroup);

      // Carregar preços de todos os planos do grupo
      if (hasGroup) {
        const monthlyPlan = plansWithSameName.find((p) => p.durationDays === 30);
        const quarterlyPlan = plansWithSameName.find((p) => p.durationDays === 90);
        const annualPlan = plansWithSameName.find((p) => p.durationDays === 365);

        setMonthlyPriceEdit(monthlyPlan?.price.toString() || "");
        setQuarterlyPriceEdit(quarterlyPlan?.price.toString() || "");
        setAnnualPriceEdit(annualPlan?.price.toString() || "");
        setMonthlyCheckoutUrlEdit(monthlyPlan?.checkoutUrl || "");
        setQuarterlyCheckoutUrlEdit(quarterlyPlan?.checkoutUrl || "");
        setAnnualCheckoutUrlEdit(annualPlan?.checkoutUrl || "");
      } else {
        // Se não houver grupo, usar o preço do plano atual
        setMonthlyPriceEdit("");
        setQuarterlyPriceEdit("");
        setAnnualPriceEdit("");
        setMonthlyCheckoutUrlEdit("");
        setQuarterlyCheckoutUrlEdit("");
        setAnnualCheckoutUrlEdit("");
      }
    }
  }, [editingPlan, setValueEdit, plans]);

  const handleCreate = () => {
    resetCreate();
    setCustomBenefitsCreate([]);
    setNewBenefitCreate("");
    setSelectedToggleIdCreate("");
    setSelectedToggleOptionValueCreate("");
    setCreateMultiplePlans(false);
    setMonthlyPrice("");
    setQuarterlyPrice("");
    setAnnualPrice("");
    setMonthlyCheckoutUrl("");
    setQuarterlyCheckoutUrl("");
    setAnnualCheckoutUrl("");
    setEditingBenefitIndexCreate(null);
    setEditingBenefitTextCreate("");
    setIsCreateDialogOpen(true);
  };

  const handleCreateToggle = () => {
    setEditingToggle(null);
    setNewToggleName("");
    setToggleOptions([]);
    setNewToggleLabel("");
    setNewToggleValue("");
    setIsToggleDialogOpen(true);
  };

  const handleEditToggle = (toggle: { id: string; name: string; options: Array<{ label: string; value: string }> }) => {
    setEditingToggle(toggle);
    setNewToggleName(toggle.name);
    setToggleOptions(toggle.options);
    setNewToggleLabel("");
    setNewToggleValue("");
    setIsToggleDialogOpen(true);
  };

  const addToggleOption = () => {
    if (newToggleLabel.trim() && newToggleValue.trim()) {
      setToggleOptions([
        ...toggleOptions,
        { label: newToggleLabel.trim(), value: newToggleValue.trim() },
      ]);
      setNewToggleLabel("");
      setNewToggleValue("");
    }
  };

  const removeToggleOption = (index: number) => {
    setToggleOptions(toggleOptions.filter((_, i) => i !== index));
  };

  const handleSaveToggle = () => {
    if (!newToggleName.trim()) {
      alert("Por favor, preencha o nome do toggle.");
      return;
    }

    if (toggleOptions.length === 0) {
      alert("Por favor, adicione pelo menos uma opção ao toggle (ex: Mensal, Trimestral, Anual).");
      return;
    }

    // Validar que todas as opções têm label e value
    const invalidOptions = toggleOptions.filter(opt => !opt.label.trim() || !opt.value.trim());
    if (invalidOptions.length > 0) {
      alert("Todas as opções devem ter um label e um value preenchidos.");
      return;
    }

    if (editingToggle) {
      updateToggleMutation.mutate({
        id: editingToggle.id,
        name: newToggleName.trim(),
        options: toggleOptions,
        isActive: true,
      });
    } else {
      createToggleMutation.mutate({
        name: newToggleName.trim(),
        options: toggleOptions,
        isActive: true,
      });
    }
  };

  const handleEdit = (plan: Plan) => {
    setEditingPlan(plan);
    setIsEditDialogOpen(true);
  };

  const handleToggleActive = (plan: Plan) => {
    // Verificar se existem outros planos com o mesmo nome (mesmo grupo)
    const plansWithSameName = plans?.filter((p) => p.name === plan.name && p.id !== plan.id) || [];
    const hasGroupPlans = plansWithSameName.length > 0;

    // Se houver planos do mesmo grupo, atualizar todos
    if (hasGroupPlans) {
      updatePlansByGroupMutation.mutate({
        planName: plan.name,
        isActive: !plan.isActive,
      });
    } else {
      // Atualizar apenas o plano individual
      updatePlanMutation.mutate({
        id: plan.id,
        isActive: !plan.isActive,
      });
    }
  };

  const handleDelete = (plan: Plan) => {
    setDeletingPlan(plan);
    setIsDeleteDialogOpen(true);
  };

  const handleDuplicate = (plan: Plan) => {
    // Resetar formulário primeiro
    resetCreate();

    // Preencher campos básicos
    setValueCreate("name", `${plan.name} (Cópia)`);
    setValueCreate("description", plan.description || "");
    setValueCreate("price", plan.price);
    setValueCreate("durationDays", plan.durationDays?.toString() || "");
    setValueCreate("maxConnections", plan.maxConnections);
    setValueCreate("maxBots", plan.maxBots?.toString() || "");
    setValueCreate("maxLeads", plan.maxLeads?.toString() || "");
    setValueCreate("maxFlows", plan.maxFlows?.toString() || "");
    setValueCreate("badge", plan.badge || "");
    setValueCreate("checkoutUrl", plan.checkoutUrl || "");

    // Preencher permissões
    setValueCreate("allowDashboard", plan.allowDashboard);
    setValueCreate("allowConnections", plan.allowConnections);
    setValueCreate("allowBots", plan.allowBots);
    setValueCreate("allowWelcomeGoodbye", plan.allowWelcomeGoodbye);
    setValueCreate("allowLeads", plan.allowLeads);
    setValueCreate("allowConversations", (plan as any).allowConversations ?? true);
    setValueCreate("allowBulkMessage", plan.allowBulkMessage);
    setValueCreate("allowFlow", plan.allowFlow);
    setValueCreate("allowMessageClone", plan.allowMessageClone);
    setValueCreate("allowScheduledMessage", plan.allowScheduledMessage);
    setValueCreate("isActive", true); // Novo plano sempre ativo

    // Preencher toggle
    setSelectedToggleIdCreate(plan.toggleId || "");
    setSelectedToggleOptionValueCreate((plan as any).toggleOptionValue || "");

    // Preencher benefícios customizados
    if (plan.customBenefits && plan.customBenefits.length > 0) {
      const parsed = plan.customBenefits.map((b) => {
        if (typeof b === "string") {
          return { text: b, hasFeature: true };
        }
        return { text: (b as any).text || String(b), hasFeature: (b as any).hasFeature !== false };
      });
      setCustomBenefitsCreate(parsed);
    } else {
      setCustomBenefitsCreate([]);
    }

    // Abrir modal de criação
    setIsCreateDialogOpen(true);
  };

  const onSubmitCreate = (data: CreatePlanFormData) => {
    // Se está criando múltiplos planos
    if (createMultiplePlans) {
      // Validação dos preços
      if (!monthlyPrice.trim() || !quarterlyPrice.trim() || !annualPrice.trim()) {
        alert("Por favor, preencha os preços para todos os períodos (Mensal, Trimestral e Anual).");
        return;
      }

      const monthlyPriceNum = Number.parseFloat(monthlyPrice);
      const quarterlyPriceNum = Number.parseFloat(quarterlyPrice);
      const annualPriceNum = Number.parseFloat(annualPrice);

      if (Number.isNaN(monthlyPriceNum) || monthlyPriceNum < 0) {
        alert("Preço mensal inválido.");
        return;
      }
      if (Number.isNaN(quarterlyPriceNum) || quarterlyPriceNum < 0) {
        alert("Preço trimestral inválido.");
        return;
      }
      if (Number.isNaN(annualPriceNum) || annualPriceNum < 0) {
        alert("Preço anual inválido.");
        return;
      }

      // Buscar opções do toggle se houver
      const selectedToggle = selectedToggleIdCreate ? toggles?.find((t) => t.id === selectedToggleIdCreate) : null;
      const toggleOptions = selectedToggle?.options || [];

      // Função auxiliar para encontrar opção do toggle
      const findToggleOption = (keywords: string[]) => {
        if (toggleOptions.length === 0) return null;
        return toggleOptions.find((opt) => {
          const labelLower = opt.label.toLowerCase();
          const valueLower = opt.value.toLowerCase();
          return keywords.some((keyword) => labelLower.includes(keyword) || valueLower.includes(keyword));
        })?.value ?? null;
      };

      // Criar os 3 planos
      const plans = [
        {
          name: data.name,
          price: monthlyPriceNum,
          durationDays: 30,
          toggleOptionValue: findToggleOption(["mensal", "monthly", "mês", "mes"]),
          checkoutUrl: monthlyCheckoutUrl || null,
        },
        {
          name: data.name,
          price: quarterlyPriceNum,
          durationDays: 90,
          toggleOptionValue: findToggleOption(["trimestral", "quarterly", "trimestre", "3 meses"]),
          checkoutUrl: quarterlyCheckoutUrl || null,
        },
        {
          name: data.name,
          price: annualPriceNum,
          durationDays: 365,
          toggleOptionValue: findToggleOption(["anual", "annual", "yearly", "ano", "12 meses"]),
          checkoutUrl: annualCheckoutUrl || null,
        },
      ];

      createMultiplePlansMutation.mutate({
        baseName: data.name,
        description: data.description || null,
        maxConnections: data.maxConnections,
        maxBots: data.maxBots && String(data.maxBots).trim() !== "" ? Number.parseInt(String(data.maxBots).trim(), 10) : null,
        maxLeads: data.maxLeads && String(data.maxLeads).trim() !== "" ? Number.parseInt(String(data.maxLeads).trim(), 10) : null,
        maxFlows: data.maxFlows && String(data.maxFlows).trim() !== "" ? Number.parseInt(String(data.maxFlows).trim(), 10) : null,
        allowDashboard: true,
        allowConnections: true,
        allowBots: true,
        allowWelcomeGoodbye: Boolean(data.allowWelcomeGoodbye),
        allowLeads: Boolean(data.allowLeads),
        allowConversations: Boolean((data as any).allowConversations ?? true),
        allowBulkMessage: Boolean(data.allowBulkMessage),
        allowFlow: Boolean(data.allowFlow),
        allowMessageClone: Boolean(data.allowMessageClone),
        allowScheduledMessage: Boolean(data.allowScheduledMessage),
        isActive: data.isActive,
        checkoutUrl: data.checkoutUrl || null,
        badge: data.badge || null,
        toggleId: selectedToggleIdCreate || null,
        customBenefits:
          customBenefitsCreate.length > 0
            ? customBenefitsCreate.map((b) => ({ text: b.text, hasFeature: b.hasFeature }))
            : null,
        plans,
      });
      return;
    }

    // Criação de plano único (código original)
    // Validação: se um toggle foi selecionado, uma opção também deve ser selecionada
    if (selectedToggleIdCreate && !selectedToggleOptionValueCreate) {
      const selectedToggle = toggles?.find((t) => t.id === selectedToggleIdCreate);
      const toggleOptions = selectedToggle?.options || [];

      if (toggleOptions.length > 0) {
        alert("Por favor, selecione uma opção do toggle (ex: Mensal, Trimestral, Anual) antes de criar o plano.");
        return;
      }
    }

    createPlanMutation.mutate({
      name: data.name,
      description: data.description || null,
      price: data.price,
      maxConnections: data.maxConnections,
      maxBots: data.maxBots && String(data.maxBots).trim() !== "" ? Number.parseInt(String(data.maxBots).trim(), 10) : null,
      maxLeads: data.maxLeads && String(data.maxLeads).trim() !== "" ? Number.parseInt(String(data.maxLeads).trim(), 10) : null,
      maxFlows: data.maxFlows && String(data.maxFlows).trim() !== "" ? Number.parseInt(String(data.maxFlows).trim(), 10) : null,
      allowDashboard: true, // Sempre fixo
      allowConnections: true, // Sempre fixo
      allowBots: true, // Sempre fixo
      allowWelcomeGoodbye: Boolean(data.allowWelcomeGoodbye),
      allowLeads: Boolean(data.allowLeads),
      allowConversations: Boolean((data as any).allowConversations ?? true),
      allowBulkMessage: Boolean(data.allowBulkMessage),
      allowFlow: Boolean(data.allowFlow),
      allowMessageClone: Boolean(data.allowMessageClone),
      allowScheduledMessage: Boolean(data.allowScheduledMessage),
      isActive: data.isActive,
      checkoutUrl: data.checkoutUrl || null,
      badge: data.badge || null,
      durationDays: data.durationDays ? Number.parseInt(data.durationDays, 10) : null,
      freeTrialDurationHours: data.freeTrialDurationHours ? Number.parseInt(data.freeTrialDurationHours, 10) : null,
      toggleId: selectedToggleIdCreate || null,
      toggleOptionValue: selectedToggleOptionValueCreate || null,
      customBenefits:
        customBenefitsCreate.length > 0
          ? customBenefitsCreate.map((b) => ({ text: b.text, hasFeature: b.hasFeature }))
          : null,
    });
  };

  const onSubmitEdit = (data: UpdatePlanFormData) => {
    if (!editingPlan) return;

    // Validação: se um toggle foi selecionado, uma opção também deve ser selecionada
    if (selectedToggleIdEdit && !selectedToggleOptionValueEdit) {
      const selectedToggle = toggles?.find((t) => t.id === selectedToggleIdEdit);
      const toggleOptions = selectedToggle?.options || [];

      if (toggleOptions.length > 0) {
        alert("Por favor, selecione uma opção do toggle (ex: Mensal, Trimestral, Anual) antes de salvar o plano.");
        return;
      }
    }

    // Verificar se existem outros planos com o mesmo nome (mesmo grupo)
    const plansWithSameName = plans?.filter((p) => p.name === editingPlan.name) || [];
    const hasGroupPlans = plansWithSameName.length > 1;

    // Se houver planos do mesmo grupo, atualizar todos
    if (hasGroupPlans) {
      // Verificar se o nome foi alterado
      const nameChanged = data.name !== editingPlan.name;

      // Se o nome foi alterado, precisamos atualizar o nome de todos os planos do grupo primeiro
      if (nameChanged) {
        // Atualizar o nome de todos os planos do grupo individualmente
        const updatePromises = plansWithSameName.map((plan) =>
          updatePlanMutation.mutateAsync({
            id: plan.id,
            name: data.name,
          })
        );
        // Também atualizar o plano atual
        updatePromises.push(
          updatePlanMutation.mutateAsync({
            id: editingPlan.id,
            name: data.name,
          })
        );
        // Aguardar todas as atualizações de nome
        Promise.all(updatePromises).then(() => {
          // Depois de atualizar os nomes, atualizar os outros campos
          if (monthlyPriceEdit || quarterlyPriceEdit || annualPriceEdit) {
            // Atualizar preços usando o novo nome
            const monthly = monthlyPriceEdit ? Number.parseFloat(monthlyPriceEdit) : undefined;
            const quarterly = quarterlyPriceEdit ? Number.parseFloat(quarterlyPriceEdit) : undefined;
            const annual = annualPriceEdit ? Number.parseFloat(annualPriceEdit) : undefined;

            updatePlansPricesByGroupMutation.mutate({
              planName: data.name, // Usar o novo nome
              monthlyPrice: monthly,
              quarterlyPrice: quarterly,
              annualPrice: annual,
              monthlyCheckoutUrl: monthlyCheckoutUrlEdit || null,
              quarterlyCheckoutUrl: quarterlyCheckoutUrlEdit || null,
              annualCheckoutUrl: annualCheckoutUrlEdit || null,
              description: data.description || null,
              maxConnections: data.maxConnections,
              maxBots: data.maxBots && String(data.maxBots).trim() !== "" ? Number.parseInt(String(data.maxBots).trim(), 10) : null,
              maxLeads: data.maxLeads && String(data.maxLeads).trim() !== "" ? Number.parseInt(String(data.maxLeads).trim(), 10) : null,
              maxFlows: data.maxFlows && String(data.maxFlows).trim() !== "" ? Number.parseInt(String(data.maxFlows).trim(), 10) : null,
              allowDashboard: true,
              allowConnections: true,
              allowBots: true,
              allowWelcomeGoodbye: Boolean(data.allowWelcomeGoodbye),
              allowLeads: Boolean(data.allowLeads),
              allowConversations: Boolean((data as any).allowConversations ?? true),
              allowBulkMessage: Boolean(data.allowBulkMessage),
              allowFlow: Boolean(data.allowFlow),
              allowMessageClone: Boolean(data.allowMessageClone),
              allowScheduledMessage: Boolean(data.allowScheduledMessage),
              isActive: data.isActive,
              checkoutUrl: data.checkoutUrl || null,
              badge: data.badge || null,
              toggleId: selectedToggleIdEdit || null,
              customBenefits: customBenefitsEdit.length > 0
                ? customBenefitsEdit.map((b) => ({ text: b.text, hasFeature: b.hasFeature }))
                : null,
            });
          } else {
            // Atualizar outros campos usando o novo nome
            updatePlansByGroupMutation.mutate({
              planName: data.name, // Usar o novo nome
              description: data.description || null,
              maxConnections: data.maxConnections,
              maxBots: data.maxBots && String(data.maxBots).trim() !== "" ? Number.parseInt(String(data.maxBots).trim(), 10) : null,
              maxLeads: data.maxLeads && String(data.maxLeads).trim() !== "" ? Number.parseInt(String(data.maxLeads).trim(), 10) : null,
              maxFlows: data.maxFlows && String(data.maxFlows).trim() !== "" ? Number.parseInt(String(data.maxFlows).trim(), 10) : null,
              allowDashboard: true,
              allowConnections: true,
              allowBots: true,
              allowWelcomeGoodbye: Boolean(data.allowWelcomeGoodbye),
              allowLeads: Boolean(data.allowLeads),
              allowConversations: Boolean((data as any).allowConversations ?? true),
              allowBulkMessage: Boolean(data.allowBulkMessage),
              allowFlow: Boolean(data.allowFlow),
              allowMessageClone: Boolean(data.allowMessageClone),
              allowScheduledMessage: Boolean(data.allowScheduledMessage),
              isActive: data.isActive,
              checkoutUrl: data.checkoutUrl || null,
              badge: data.badge || null,
              toggleId: selectedToggleIdEdit || null,
              customBenefits: customBenefitsEdit.length > 0
                ? customBenefitsEdit.map((b) => ({ text: b.text, hasFeature: b.hasFeature }))
                : null,
            });
          }
        });
        return;
      }

      // Se houver preços específicos para cada período, usar updatePlansPricesByGroup
      if (monthlyPriceEdit || quarterlyPriceEdit || annualPriceEdit) {
        // Validar que os preços são números válidos
        const monthly = monthlyPriceEdit ? Number.parseFloat(monthlyPriceEdit) : undefined;
        const quarterly = quarterlyPriceEdit ? Number.parseFloat(quarterlyPriceEdit) : undefined;
        const annual = annualPriceEdit ? Number.parseFloat(annualPriceEdit) : undefined;

        if (monthlyPriceEdit && (isNaN(monthly) || monthly < 0)) {
          alert("Preço mensal inválido. Por favor, insira um número válido maior ou igual a zero.");
          return;
        }
        if (quarterlyPriceEdit && (isNaN(quarterly) || quarterly < 0)) {
          alert("Preço trimestral inválido. Por favor, insira um número válido maior ou igual a zero.");
          return;
        }
        if (annualPriceEdit && (isNaN(annual) || annual < 0)) {
          alert("Preço anual inválido. Por favor, insira um número válido maior ou igual a zero.");
          return;
        }
        updatePlansPricesByGroupMutation.mutate({
          planName: editingPlan.name,
          monthlyPrice: monthly,
          quarterlyPrice: quarterly,
          annualPrice: annual,
          monthlyCheckoutUrl: monthlyCheckoutUrlEdit || null,
          quarterlyCheckoutUrl: quarterlyCheckoutUrlEdit || null,
          annualCheckoutUrl: annualCheckoutUrlEdit || null,
          description: data.description || null,
          maxConnections: data.maxConnections,
          maxBots: data.maxBots && String(data.maxBots).trim() !== "" ? Number.parseInt(String(data.maxBots).trim(), 10) : null,
          maxLeads: data.maxLeads && String(data.maxLeads).trim() !== "" ? Number.parseInt(String(data.maxLeads).trim(), 10) : null,
          maxFlows: data.maxFlows && String(data.maxFlows).trim() !== "" ? Number.parseInt(String(data.maxFlows).trim(), 10) : null,
          allowDashboard: true,
          allowConnections: true,
          allowBots: true,
          allowWelcomeGoodbye: Boolean(data.allowWelcomeGoodbye),
          allowLeads: Boolean(data.allowLeads),
          allowConversations: Boolean((data as any).allowConversations ?? true),
          allowBulkMessage: Boolean(data.allowBulkMessage),
          allowFlow: Boolean(data.allowFlow),
          allowMessageClone: Boolean(data.allowMessageClone),
          allowScheduledMessage: Boolean(data.allowScheduledMessage),
          isActive: data.isActive,
          checkoutUrl: data.checkoutUrl || null,
          badge: data.badge || null,
          toggleId: selectedToggleIdEdit || null,
          customBenefits: customBenefitsEdit.length > 0
            ? customBenefitsEdit.map((b) => ({ text: b.text, hasFeature: b.hasFeature }))
            : null, // Sempre enviar, mesmo que seja null
        });
      } else {
        // Se não houver preços específicos, usar updatePlansByGroup (atualiza tudo menos preços)
        updatePlansByGroupMutation.mutate({
          planName: editingPlan.name,
          description: data.description || null,
          maxConnections: data.maxConnections,
          maxBots: data.maxBots && String(data.maxBots).trim() !== "" ? Number.parseInt(String(data.maxBots).trim(), 10) : null,
          maxLeads: data.maxLeads && String(data.maxLeads).trim() !== "" ? Number.parseInt(String(data.maxLeads).trim(), 10) : null,
          maxFlows: data.maxFlows && String(data.maxFlows).trim() !== "" ? Number.parseInt(String(data.maxFlows).trim(), 10) : null,
          allowDashboard: true,
          allowConnections: true,
          allowBots: true,
          allowWelcomeGoodbye: Boolean(data.allowWelcomeGoodbye),
          allowLeads: Boolean(data.allowLeads),
          allowConversations: Boolean((data as any).allowConversations ?? true),
          allowBulkMessage: Boolean(data.allowBulkMessage),
          allowFlow: Boolean(data.allowFlow),
          allowMessageClone: Boolean(data.allowMessageClone),
          allowScheduledMessage: Boolean(data.allowScheduledMessage),
          isActive: data.isActive,
          checkoutUrl: data.checkoutUrl || null,
          badge: data.badge || null,
          toggleId: selectedToggleIdEdit || null,
          customBenefits: customBenefitsEdit.length > 0
            ? customBenefitsEdit.map((b) => ({ text: b.text, hasFeature: b.hasFeature }))
            : null, // Sempre enviar, mesmo que seja null
        });
      }
      return;
    } else {
      // Atualizar apenas o plano individual
      updatePlanMutation.mutate({
        id: data.id,
        name: data.name,
        description: data.description || null,
        price: data.price,
        maxConnections: data.maxConnections,
        maxBots: data.maxBots && String(data.maxBots).trim() !== "" ? Number.parseInt(String(data.maxBots).trim(), 10) : null,
        maxLeads: data.maxLeads && String(data.maxLeads).trim() !== "" ? Number.parseInt(String(data.maxLeads).trim(), 10) : null,
        maxFlows: data.maxFlows && String(data.maxFlows).trim() !== "" ? Number.parseInt(String(data.maxFlows).trim(), 10) : null,
        allowDashboard: true,
        allowConnections: true,
        allowBots: true,
        allowWelcomeGoodbye: Boolean(data.allowWelcomeGoodbye),
        allowLeads: Boolean(data.allowLeads),
        allowConversations: Boolean((data as any).allowConversations ?? true),
        allowBulkMessage: Boolean(data.allowBulkMessage),
        allowFlow: Boolean(data.allowFlow),
        allowMessageClone: Boolean(data.allowMessageClone),
        allowScheduledMessage: Boolean(data.allowScheduledMessage),
        isActive: data.isActive,
        checkoutUrl: data.checkoutUrl || null,
        badge: data.badge || null,
        toggleId: selectedToggleIdEdit || null,
        toggleOptionValue: selectedToggleOptionValueEdit || null,
        durationDays: data.durationDays ? Number.parseInt(data.durationDays, 10) : null,
        freeTrialDurationHours: data.freeTrialDurationHours ? Number.parseInt(data.freeTrialDurationHours, 10) : null,
        customBenefits:
          customBenefitsEdit.length > 0
            ? customBenefitsEdit.map((b) => ({ text: b.text, hasFeature: b.hasFeature }))
            : null,
      });
    }
  };

  const addCustomBenefitCreate = () => {
    if (newBenefitCreate.trim()) {
      setCustomBenefitsCreate([
        ...customBenefitsCreate,
        { text: newBenefitCreate.trim(), hasFeature: true },
      ]);
      setNewBenefitCreate("");
    }
  };

  const removeCustomBenefitCreate = (index: number) => {
    setCustomBenefitsCreate(customBenefitsCreate.filter((_, i) => i !== index));
  };

  const toggleCustomBenefitCreate = (index: number) => {
    const updated = [...customBenefitsCreate];
    updated[index] = { ...updated[index], hasFeature: !updated[index].hasFeature };
    setCustomBenefitsCreate(updated);
  };

  const startEditingBenefitCreate = (index: number) => {
    setEditingBenefitIndexCreate(index);
    setEditingBenefitTextCreate(customBenefitsCreate[index].text);
  };

  const saveEditingBenefitCreate = (index: number) => {
    if (editingBenefitTextCreate.trim()) {
      const updated = [...customBenefitsCreate];
      updated[index] = { ...updated[index], text: editingBenefitTextCreate.trim() };
      setCustomBenefitsCreate(updated);
    }
    setEditingBenefitIndexCreate(null);
    setEditingBenefitTextCreate("");
  };

  const cancelEditingBenefitCreate = () => {
    setEditingBenefitIndexCreate(null);
    setEditingBenefitTextCreate("");
  };

  const handleDragEndCreate = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = customBenefitsCreate.findIndex((_, i) => i === Number(active.id));
      const newIndex = customBenefitsCreate.findIndex((_, i) => i === Number(over.id));
      setCustomBenefitsCreate(arrayMove(customBenefitsCreate, oldIndex, newIndex));
    }
  };

  const addCustomBenefitEdit = () => {
    if (newBenefitEdit.trim()) {
      setCustomBenefitsEdit([
        ...customBenefitsEdit,
        { text: newBenefitEdit.trim(), hasFeature: true },
      ]);
      setNewBenefitEdit("");
    }
  };

  const removeCustomBenefitEdit = (index: number) => {
    setCustomBenefitsEdit(customBenefitsEdit.filter((_, i) => i !== index));
  };

  const toggleCustomBenefitEdit = (index: number) => {
    const updated = [...customBenefitsEdit];
    updated[index] = { ...updated[index], hasFeature: !updated[index].hasFeature };
    setCustomBenefitsEdit(updated);
  };

  const startEditingBenefitEdit = (index: number) => {
    setEditingBenefitIndexEdit(index);
    setEditingBenefitTextEdit(customBenefitsEdit[index].text);
  };

  const saveEditingBenefitEdit = (index: number) => {
    if (editingBenefitTextEdit.trim()) {
      const updated = [...customBenefitsEdit];
      updated[index] = { ...updated[index], text: editingBenefitTextEdit.trim() };
      setCustomBenefitsEdit(updated);
    }
    setEditingBenefitIndexEdit(null);
    setEditingBenefitTextEdit("");
  };

  const cancelEditingBenefitEdit = () => {
    setEditingBenefitIndexEdit(null);
    setEditingBenefitTextEdit("");
  };

  const handleDragEndEdit = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = customBenefitsEdit.findIndex((_, i) => i === Number(active.id));
      const newIndex = customBenefitsEdit.findIndex((_, i) => i === Number(over.id));
      setCustomBenefitsEdit(arrayMove(customBenefitsEdit, oldIndex, newIndex));
    }
  };


  const handleConfirmDelete = () => {
    if (!deletingPlan) return;

    // Verificar se existem outros planos com o mesmo nome (mesmo grupo)
    const plansWithSameName = plans?.filter((p) => p.name === deletingPlan.name && p.id !== deletingPlan.id) || [];
    const hasGroupPlans = plansWithSameName.length > 0;

    // Se houver planos do mesmo grupo, excluir todos
    if (hasGroupPlans) {
      deletePlansByGroupMutation.mutate({
        planName: deletingPlan.name,
      });
    } else {
      // Excluir apenas o plano individual
      deletePlanMutation.mutate({
        id: deletingPlan.id,
      });
    }
  };

  if (currentUser?.role !== "admin") {
    return null;
  }

  // Filtrar planos baseado no termo de busca e status ativo/inativo
  const filteredPlans =
    plans?.filter((plan) => {
      // Filtrar por status ativo/inativo
      if (showOnlyActive && !plan.isActive) return false;

      // Filtrar por termo de busca
      if (!searchTerm.trim()) return true;
      const search = searchTerm.toLowerCase();

      // Buscar por nome
      if (plan.name.toLowerCase().includes(search)) return true;

      // Buscar por descrição
      if (plan.description && plan.description.toLowerCase().includes(search)) return true;

      // Buscar por tag de período (Mensal, Trimestral, Semestral, Anual)
      if (plan.durationDays) {
        const period = getPlanPeriod(plan.durationDays);
        if (period && period.label.toLowerCase().includes(search)) return true;
      }

      return false;
    }) || [];

  // Agrupar planos por nome
  const groupedPlans = filteredPlans.reduce((acc, plan) => {
    if (!acc[plan.name]) {
      acc[plan.name] = [];
    }
    acc[plan.name].push(plan);
    return acc;
  }, {} as Record<string, Plan[]>);

  // Ordenar planos dentro de cada grupo por durationDays
  Object.keys(groupedPlans).forEach((name) => {
    groupedPlans[name].sort((a, b) => (a.durationDays || 0) - (b.durationDays || 0));
  });

  // Calcular estatísticas
  const stats = {
    total: plans?.length || 0,
    ativos: plans?.filter((p) => p.isActive).length || 0,
    inativos: plans?.filter((p) => !p.isActive).length || 0,
  };

  return (
    <div
      className="w-full max-w-full overflow-x-hidden min-w-0 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1 w-full sm:w-auto">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3 flex-wrap">
            <Shield className="h-6 w-6 sm:h-8 sm:w-8 text-telegram-blue flex-shrink-0" />
            <span className="break-words">Administração de Planos</span>
          </h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">
            Gerencie planos do sistema. Apenas administradores podem acessar esta página.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button onClick={handleCreateToggle} variant="outline" className="w-full sm:w-auto flex items-center justify-center gap-2">
            <Settings className="h-4 w-4" />
            Novo Toggle
          </Button>
          <Button onClick={handleCreate} className="w-full sm:w-auto flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" />
            Novo Plano
          </Button>
        </div>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Planos</CardTitle>
            <Package className="h-4 w-4 text-telegram-blue" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-telegram-text-secondary">Planos cadastrados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Planos Ativos</CardTitle>
            <Check className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.ativos}</div>
            <p className="text-xs text-telegram-text-secondary">Disponíveis para assinatura</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Planos Inativos</CardTitle>
            <X className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.inativos}</div>
            <p className="text-xs text-telegram-text-secondary">Indisponíveis</p>
          </CardContent>
        </Card>
      </div>

      {/* Campo de Busca */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Lista de Planos
          </CardTitle>
          {searchTerm && (
            <CardDescription>
              {`${filteredPlans.length} de ${plans?.length || 0} plano${(plans?.length || 0) !== 1 ? "s" : ""} encontrado${filteredPlans.length !== 1 ? "s" : ""}`}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="mb-4 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-telegram-text-secondary" />
              <Input
                type="text"
                placeholder="Buscar por nome, descrição ou período (Mensal, Trimestral, Semestral, Anual)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="showOnlyActive"
                checked={showOnlyActive}
                onCheckedChange={(checked) => setShowOnlyActive(checked === true)}
              />
              <Label htmlFor="showOnlyActive" className="text-sm cursor-pointer">
                Mostrar apenas planos ativos
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Toggles - Versão Simplificada */}
      {!isLoadingToggles && toggles && toggles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Toggles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {toggles.map((toggle) => (
                <div
                  key={toggle.id}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-md shadow-sm hover:shadow transition-shadow"
                >
                  <span className="text-sm font-medium text-gray-900">{toggle.name}</span>
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditToggle(toggle)}
                      className="h-7 w-7 p-0 hover:bg-gray-100"
                      title="Editar"
                    >
                      <Edit className="h-3.5 w-3.5 text-gray-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleToggleActive(toggle)}
                      className={`h-7 w-7 p-0 ${toggle.isActive
                        ? "text-green-600 hover:text-green-700 hover:bg-green-50"
                        : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                        }`}
                      title={toggle.isActive ? "Desativar" : "Ativar"}
                    >
                      {toggle.isActive ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Tem certeza que deseja excluir o toggle "${toggle.name}"?`)) {
                          deleteToggleMutation.mutate({ id: toggle.id });
                        }
                      }}
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                      title="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grid de Planos */}
      {
        isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-telegram-blue border-t-transparent" />
              <p className="text-telegram-text-secondary">Carregando planos...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
              <p className="text-red-500">Erro ao carregar planos</p>
              <p className="text-sm text-telegram-text-secondary mt-2">{error.message}</p>
            </div>
          </div>
        ) : !plans || plans.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Package className="mx-auto mb-4 h-12 w-12 text-telegram-text-secondary" />
              <p className="text-telegram-text-secondary">Nenhum plano encontrado</p>
            </div>
          </div>
        ) : filteredPlans.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Search className="mx-auto mb-4 h-12 w-12 text-telegram-text-secondary" />
              <p className="text-telegram-text-secondary">
                Nenhum plano encontrado com "{searchTerm}"
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full items-stretch">
            {Object.entries(groupedPlans).map(([planName, planGroup]) => (
              <div key={planName} className="h-full">
                <GroupedPlanCard
                  planGroup={planGroup as Plan[]}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onToggleActive={handleToggleActive}
                  onDuplicate={handleDuplicate}
                />
              </div>
            ))}
          </div>
        )
      }

      {/* Dialog de Criação */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="w-[calc(100%-1rem)] sm:max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-xl sm:text-2xl">
              <Package className="h-5 w-5 sm:h-6 sm:w-6 text-telegram-blue flex-shrink-0" />
              Criar Novo Plano
            </DialogTitle>
            <DialogDescription className="text-sm sm:text-base">
              Preencha os campos abaixo para criar um novo plano de assinatura.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleSubmitCreate(onSubmitCreate)}
            className="flex-1 overflow-y-auto px-2 custom-scrollbar"
          >
            <Tabs defaultValue="basic" className="w-full mt-4">
              <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger value="basic" className="flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Informações Básicas
                </TabsTrigger>
                <TabsTrigger value="limits" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Limites e Permissões
                </TabsTrigger>
                <TabsTrigger value="benefits" className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Benefícios
                </TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4 mt-0">
                <div className="space-y-4">
                  {/* Checkbox para criar múltiplos planos */}
                  <div className="flex items-center space-x-3 p-4 rounded-lg border border-telegram-blue/20 bg-telegram-blue/5">
                    <Checkbox
                      id="createMultiplePlans"
                      checked={createMultiplePlans}
                      onCheckedChange={(checked) => {
                        setCreateMultiplePlans(checked === true);
                        if (checked) {
                          // Limpar campos de plano único
                          setValueCreate("price", 0);
                          setValueCreate("durationDays", "");
                        } else {
                          // Limpar campos de múltiplos planos
                          setMonthlyPrice("");
                          setQuarterlyPrice("");
                          setAnnualPrice("");
                        }
                      }}
                    />
                    <Label
                      htmlFor="createMultiplePlans"
                      className="text-sm font-medium cursor-pointer flex-1"
                    >
                      Criar planos mensal, trimestral e anual de uma vez
                    </Label>
                    <Info className="h-4 w-4 text-telegram-blue" />
                  </div>

                  <div>
                    <Label htmlFor="name" className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-telegram-blue" />
                      Nome do Plano *
                    </Label>
                    <Input id="name" {...registerCreate("name")} className="mt-1" />
                    {errorsCreate.name && (
                      <p className="text-sm text-red-500 mt-1">{errorsCreate.name.message}</p>
                    )}
                    {createMultiplePlans && (
                      <p className="text-xs text-gray-500 mt-1">
                        Este nome será usado para todos os 3 planos (Mensal, Trimestral e Anual)
                      </p>
                    )}
                  </div>

                  {createMultiplePlans ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label htmlFor="monthlyPrice" className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-telegram-blue" />
                            Preço Mensal (R$) *
                          </Label>
                          <Input
                            id="monthlyPrice"
                            type="number"
                            step="0.01"
                            min="0"
                            value={monthlyPrice}
                            onChange={(e) => setMonthlyPrice(e.target.value)}
                            className="mt-1"
                            placeholder="Ex: 49.00"
                          />
                          <p className="text-xs text-gray-500 mt-1">30 dias</p>
                        </div>
                        <div>
                          <Label htmlFor="quarterlyPrice" className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-telegram-blue" />
                            Preço Trimestral (R$) *
                          </Label>
                          <Input
                            id="quarterlyPrice"
                            type="number"
                            step="0.01"
                            min="0"
                            value={quarterlyPrice}
                            onChange={(e) => setQuarterlyPrice(e.target.value)}
                            className="mt-1"
                            placeholder="Ex: 129.00"
                          />
                          <p className="text-xs text-gray-500 mt-1">90 dias</p>
                        </div>
                        <div>
                          <Label htmlFor="annualPrice" className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-telegram-blue" />
                            Preço Anual (R$) *
                          </Label>
                          <Input
                            id="annualPrice"
                            type="number"
                            step="0.01"
                            min="0"
                            value={annualPrice}
                            onChange={(e) => setAnnualPrice(e.target.value)}
                            className="mt-1"
                            placeholder="Ex: 467.00"
                          />
                          <p className="text-xs text-gray-500 mt-1">365 dias</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mt-2">
                        <div>
                          <Label htmlFor="monthlyCheckoutUrl" className="flex items-center gap-2 text-[10px] uppercase font-bold text-gray-500">
                            <LinkIcon className="h-3 w-3 text-telegram-blue" />
                            Checkout Mensal
                          </Label>
                          <Input
                            id="monthlyCheckoutUrl"
                            value={monthlyCheckoutUrl}
                            onChange={(e) => setMonthlyCheckoutUrl(e.target.value)}
                            className="mt-1 h-8 text-xs focus-visible:ring-telegram-blue"
                            placeholder="URL do checkout mensal"
                          />
                        </div>
                        <div>
                          <Label htmlFor="quarterlyCheckoutUrl" className="flex items-center gap-2 text-[10px] uppercase font-bold text-gray-500">
                            <LinkIcon className="h-3 w-3 text-telegram-blue" />
                            Checkout Trimestral
                          </Label>
                          <Input
                            id="quarterlyCheckoutUrl"
                            value={quarterlyCheckoutUrl}
                            onChange={(e) => setQuarterlyCheckoutUrl(e.target.value)}
                            className="mt-1 h-8 text-xs focus-visible:ring-telegram-blue"
                            placeholder="URL do checkout trimestral"
                          />
                        </div>
                        <div>
                          <Label htmlFor="annualCheckoutUrl" className="flex items-center gap-2 text-[10px] uppercase font-bold text-gray-500">
                            <LinkIcon className="h-3 w-3 text-telegram-blue" />
                            Checkout Anual
                          </Label>
                          <Input
                            id="annualCheckoutUrl"
                            value={annualCheckoutUrl}
                            onChange={(e) => setAnnualCheckoutUrl(e.target.value)}
                            className="mt-1 h-8 text-xs focus-visible:ring-telegram-blue"
                            placeholder="URL do checkout anual"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="price" className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-telegram-blue" />
                          Preço (R$) *
                        </Label>
                        <Input
                          id="price"
                          type="number"
                          step="0.01"
                          min="0"
                          {...registerCreate("price", { valueAsNumber: true })}
                          className="mt-1"
                        />
                        {errorsCreate.price && (
                          <p className="text-sm text-red-500 mt-1">{errorsCreate.price.message}</p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="durationDays" className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-telegram-blue" />
                          Duração (dias)
                        </Label>
                        <Input
                          id="durationDays"
                          type="number"
                          min="1"
                          placeholder="Ex: 30 (mensal), 90 (trimestral)"
                          {...registerCreate("durationDays")}
                          className="mt-1"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Deixe vazio para plano sem vencimento
                        </p>
                      </div>
                      {/* Campo de duração do plano gratuito - apenas para plano "Gratuito" */}
                      {watchCreate("name")?.toLowerCase() === "gratuito" && (
                        <div>
                          <Label htmlFor="freeTrialDurationHours" className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-telegram-blue" />
                            Duração do Plano Gratuito (horas) *
                          </Label>
                          <Input
                            id="freeTrialDurationHours"
                            type="number"
                            min="1"
                            placeholder="Ex: 24 (padrão)"
                            {...registerCreate("freeTrialDurationHours")}
                            className="mt-1"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Quantidade de horas que o usuário pode usar o plano gratuito (padrão: 24 horas)
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <Label htmlFor="badge" className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-telegram-blue" />
                      Badge do Plano
                    </Label>
                    <Input
                      id="badge"
                      placeholder="Ex: Recomendado, Popular, Mais Vendido..."
                      {...registerCreate("badge")}
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Badge que aparecerá no card do plano (opcional)
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="toggleId" className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-telegram-blue" />
                      Toggle do Plano
                    </Label>
                    <Select
                      id="toggleId"
                      value={selectedToggleIdCreate}
                      onChange={(e) => {
                        setSelectedToggleIdCreate(e.target.value);
                        setSelectedToggleOptionValueCreate(""); // Reset opção quando mudar toggle
                      }}
                      className="mt-1"
                    >
                      <option value="">Nenhum toggle</option>
                      {toggles?.map((toggle) => (
                        <option key={toggle.id} value={toggle.id}>
                          {toggle.name}
                        </option>
                      ))}
                    </Select>
                    <p className="text-xs text-gray-500 mt-1">
                      {createMultiplePlans
                        ? "Se selecionado, os planos serão associados automaticamente às opções Mensal, Trimestral e Anual do toggle."
                        : "Selecione um toggle criado. O plano aparecerá apenas dentro deste toggle na página de planos."}
                    </p>
                  </div>

                  {!createMultiplePlans && selectedToggleIdCreate && (() => {
                    const selectedToggle = toggles?.find((t) => t.id === selectedToggleIdCreate);
                    const toggleOptions = selectedToggle?.options || [];

                    return (
                      <div>
                        <Label htmlFor="toggleOptionValue" className="flex items-center gap-2">
                          <Settings className="h-4 w-4 text-telegram-blue" />
                          Opção do Toggle {toggleOptions.length === 0 && <span className="text-red-500">*</span>}
                        </Label>
                        {toggleOptions.length === 0 ? (
                          <div className="mt-1 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                            <p className="text-sm text-yellow-800">
                              ⚠️ Este toggle não possui opções configuradas. Por favor, edite o toggle e adicione opções (ex: Mensal, Trimestral, Anual) antes de associar um plano.
                            </p>
                          </div>
                        ) : (
                          <>
                            <Select
                              id="toggleOptionValue"
                              value={selectedToggleOptionValueCreate}
                              onChange={(e) => setSelectedToggleOptionValueCreate(e.target.value)}
                              className="mt-1"
                              required
                            >
                              <option value="">Selecione uma opção</option>
                              {toggleOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </Select>
                            <p className="text-xs text-gray-500 mt-1">
                              Selecione a opção do toggle (ex: Mensal, Trimestral, Anual). O plano aparecerá apenas quando esta opção estiver selecionada na página de planos.
                            </p>
                          </>
                        )}
                      </div>
                    );
                  })()}

                  <div>
                    <Label htmlFor="description" className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-telegram-blue" />
                      Descrição
                    </Label>
                    <Textarea
                      id="description"
                      {...registerCreate("description")}
                      rows={4}
                      placeholder="Descreva o plano detalhadamente..."
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="checkoutUrl" className="flex items-center gap-2">
                      <LinkIcon className="h-4 w-4 text-telegram-blue" />
                      URL de Checkout
                    </Label>
                    <Input
                      id="checkoutUrl"
                      type="url"
                      placeholder="https://checkout.exemplo.com/plano-x"
                      {...registerCreate("checkoutUrl")}
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Link para onde o usuário será redirecionado ao clicar em "Assinar Agora"
                    </p>
                    {errorsCreate.checkoutUrl && (
                      <p className="text-sm text-red-500 mt-1">
                        {errorsCreate.checkoutUrl.message}
                      </p>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="limits" className="space-y-4 mt-0">
                <div className="space-y-4">
                  <div>
                    <Label className="text-base font-semibold mb-3 block flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      Limites de Recursos
                    </Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="maxConnections">Máx. Conexões *</Label>
                        <Input
                          id="maxConnections"
                          type="number"
                          min="1"
                          {...registerCreate("maxConnections", { valueAsNumber: true })}
                          className="mt-1"
                        />
                        {errorsCreate.maxConnections && (
                          <p className="text-sm text-red-500 mt-1">
                            {errorsCreate.maxConnections.message}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="maxBots">Máx. Bots</Label>
                        <Input
                          id="maxBots"
                          type="number"
                          min="1"
                          placeholder="Vazio = ilimitado"
                          {...registerCreate("maxBots")}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="maxLeads">Máx. Leads</Label>
                        <Input
                          id="maxLeads"
                          type="number"
                          min="1"
                          placeholder="Vazio = ilimitado"
                          {...registerCreate("maxLeads")}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="maxFlows">Máx. Fluxos</Label>
                        <Input
                          id="maxFlows"
                          type="number"
                          min="1"
                          placeholder="Vazio = ilimitado"
                          {...registerCreate("maxFlows")}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <Label className="text-base font-semibold mb-3 block flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      Permissões do Plano
                    </Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 bg-gray-50/50 transition-colors cursor-not-allowed opacity-75">
                        <Controller
                          control={controlCreate}
                          name="allowDashboard"
                          render={({ field }) => (
                            <Checkbox
                              id="allowDashboard"
                              checked={true}
                              disabled
                              className="cursor-not-allowed"
                            />
                          )}
                        />
                        <Label
                          htmlFor="allowDashboard"
                          className="text-sm font-medium text-gray-600 cursor-not-allowed flex-1"
                        >
                          Dashboard <span className="text-xs text-gray-500">(sempre ativo)</span>
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 bg-gray-50/50 transition-colors cursor-not-allowed opacity-75">
                        <Controller
                          control={controlCreate}
                          name="allowConnections"
                          render={({ field }) => (
                            <Checkbox
                              id="allowConnections"
                              checked={true}
                              disabled
                              className="cursor-not-allowed"
                            />
                          )}
                        />
                        <Label
                          htmlFor="allowConnections"
                          className="text-sm font-medium text-gray-600 cursor-not-allowed flex-1"
                        >
                          Conexões <span className="text-xs text-gray-500">(sempre ativo)</span>
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 bg-gray-50/50 transition-colors cursor-not-allowed opacity-75">
                        <Controller
                          control={controlCreate}
                          name="allowBots"
                          render={({ field }) => (
                            <Checkbox
                              id="allowBots"
                              checked={true}
                              disabled
                              className="cursor-not-allowed"
                            />
                          )}
                        />
                        <Label
                          htmlFor="allowBots"
                          className="text-sm font-medium text-gray-600 cursor-not-allowed flex-1"
                        >
                          Bots <span className="text-xs text-gray-500">(sempre ativo)</span>
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-telegram-blue/50 hover:bg-gray-50/50 transition-colors cursor-pointer group">
                        <Controller
                          control={controlCreate}
                          name="allowWelcomeGoodbye"
                          render={({ field }) => (
                            <Checkbox
                              id="allowWelcomeGoodbye"
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="group-hover:border-telegram-blue"
                            />
                          )}
                        />
                        <Label
                          htmlFor="allowWelcomeGoodbye"
                          className="text-sm font-medium text-gray-700 cursor-pointer group-hover:text-telegram-blue transition-colors flex-1"
                        >
                          Boas-vindas/Despedida
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-telegram-blue/50 hover:bg-gray-50/50 transition-colors cursor-pointer group">
                        <Controller
                          control={controlCreate}
                          name="allowLeads"
                          render={({ field }) => (
                            <Checkbox
                              id="allowLeads"
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="group-hover:border-telegram-blue"
                            />
                          )}
                        />
                        <Label
                          htmlFor="allowLeads"
                          className="text-sm font-medium text-gray-700 cursor-pointer group-hover:text-telegram-blue transition-colors flex-1"
                        >
                          Leads
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-telegram-blue/50 hover:bg-gray-50/50 transition-colors cursor-pointer group">
                        <Controller
                          control={controlCreate}
                          name="allowConversations"
                          render={({ field }) => (
                            <Checkbox
                              id="allowConversations"
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="group-hover:border-telegram-blue"
                            />
                          )}
                        />
                        <Label
                          htmlFor="allowConversations"
                          className="text-sm font-medium text-gray-700 cursor-pointer group-hover:text-telegram-blue transition-colors flex-1"
                        >
                          Conversas
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-telegram-blue/50 hover:bg-gray-50/50 transition-colors cursor-pointer group">
                        <Controller
                          control={controlCreate}
                          name="allowBulkMessage"
                          render={({ field }) => (
                            <Checkbox
                              id="allowBulkMessage"
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="group-hover:border-telegram-blue"
                            />
                          )}
                        />
                        <Label
                          htmlFor="allowBulkMessage"
                          className="text-sm font-medium text-gray-700 cursor-pointer group-hover:text-telegram-blue transition-colors flex-1"
                        >
                          Mensagens em Massa
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-telegram-blue/50 hover:bg-gray-50/50 transition-colors cursor-pointer group">
                        <Controller
                          control={controlCreate}
                          name="allowFlow"
                          render={({ field }) => (
                            <Checkbox
                              id="allowFlow"
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="group-hover:border-telegram-blue"
                            />
                          )}
                        />
                        <Label
                          htmlFor="allowFlow"
                          className="text-sm font-medium text-gray-700 cursor-pointer group-hover:text-telegram-blue transition-colors flex-1"
                        >
                          Fluxos
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-telegram-blue/50 hover:bg-gray-50/50 transition-colors cursor-pointer group">
                        <Controller
                          control={controlCreate}
                          name="allowMessageClone"
                          render={({ field }) => (
                            <Checkbox
                              id="allowMessageClone"
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="group-hover:border-telegram-blue"
                            />
                          )}
                        />
                        <Label
                          htmlFor="allowMessageClone"
                          className="text-sm font-medium text-gray-700 cursor-pointer group-hover:text-telegram-blue transition-colors flex-1"
                        >
                          Clonagem de Mensagens
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-telegram-blue/50 hover:bg-gray-50/50 transition-colors cursor-pointer group">
                        <Controller
                          control={controlCreate}
                          name="allowScheduledMessage"
                          render={({ field }) => (
                            <Checkbox
                              id="allowScheduledMessage"
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="group-hover:border-telegram-blue"
                            />
                          )}
                        />
                        <Label
                          htmlFor="allowScheduledMessage"
                          className="text-sm font-medium text-gray-700 cursor-pointer group-hover:text-telegram-blue transition-colors flex-1"
                        >
                          Mensagens Agendadas
                        </Label>
                      </div>

                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="benefits" className="space-y-4 mt-0">
                <div className="space-y-4">
                  <div>
                    <Label className="text-base font-semibold mb-2 block flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5" />
                      Benefícios Customizados
                    </Label>
                    <p className="text-xs text-gray-500 mb-4">
                      Adicione benefícios extras que aparecerão no card do plano. Arraste para reordenar, clique no texto para editar, e no ícone para alternar entre check (verde) e X (vermelho).
                    </p>
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEndCreate}
                    >
                      <SortableContext
                        items={customBenefitsCreate.map((_, i) => i)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                          {customBenefitsCreate.map((benefit, index) => (
                            <SortableBenefitItem
                              key={index}
                              benefit={benefit}
                              index={index}
                              isEditing={editingBenefitIndexCreate === index}
                              editingText={editingBenefitTextCreate}
                              onEditTextChange={setEditingBenefitTextCreate}
                              onStartEdit={() => startEditingBenefitCreate(index)}
                              onSaveEdit={() => saveEditingBenefitCreate(index)}
                              onCancelEdit={cancelEditingBenefitCreate}
                              onToggle={() => toggleCustomBenefitCreate(index)}
                              onRemove={() => removeCustomBenefitCreate(index)}
                            />
                          ))}
                          {customBenefitsCreate.length === 0 && (
                            <p className="text-sm text-gray-400 text-center py-4">
                              Nenhum benefício customizado adicionado
                            </p>
                          )}
                        </div>
                      </SortableContext>
                    </DndContext>
                    <div className="flex gap-2 mt-4">
                      <Input
                        placeholder="Digite um benefício..."
                        value={newBenefitCreate}
                        onChange={(e) => setNewBenefitCreate(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addCustomBenefitCreate();
                          }
                        }}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addCustomBenefitCreate}
                        disabled={!newBenefitCreate.trim()}
                        className="flex items-center gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        Adicionar
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-center space-x-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <input
                      type="checkbox"
                      id="isActive"
                      {...registerCreate("isActive")}
                      className="rounded"
                    />
                    <Label htmlFor="isActive" className="text-sm font-medium cursor-pointer">
                      Plano Ativo (disponível para assinatura)
                    </Label>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="border-t pt-4 mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createPlanMutation.isPending}>
                {createPlanMutation.isPending ? "Criando..." : "Criar Plano"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog de Edição */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="w-[calc(100%-1rem)] sm:max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <Edit className="h-6 w-6 text-telegram-blue" />
              Editar Plano
            </DialogTitle>
            <DialogDescription>
              Atualize as informações do plano abaixo.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleSubmitEdit(onSubmitEdit)}
            className="flex-1 overflow-y-auto px-2 custom-scrollbar"
          >
            <Tabs defaultValue="basic" className="w-full mt-4">
              <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger value="basic" className="flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Informações Básicas
                </TabsTrigger>
                <TabsTrigger value="limits" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Limites e Permissões
                </TabsTrigger>
                <TabsTrigger value="benefits" className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Benefícios
                </TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4 mt-0">
                <div className="space-y-4">
                  {/* Aviso se houver grupo de planos */}
                  {hasGroupPlansEdit && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800">
                        <Info className="h-4 w-4 inline mr-2" />
                        Este plano faz parte de um grupo. As alterações serão aplicadas a todos os períodos (Mensal, Trimestral e Anual).
                      </p>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="edit-name" className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-telegram-blue" />
                      Nome do Plano *
                    </Label>
                    <Input id="edit-name" {...registerEdit("name")} className="mt-1" />
                    {errorsEdit.name && (
                      <p className="text-sm text-red-500 mt-1">{errorsEdit.name.message}</p>
                    )}
                    {hasGroupPlansEdit && (
                      <p className="text-xs text-gray-500 mt-1">
                        Este nome será usado para todos os períodos do grupo
                      </p>
                    )}
                  </div>

                  {hasGroupPlansEdit ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label htmlFor="edit-monthlyPrice" className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-telegram-blue" />
                            Preço Mensal (R$) *
                          </Label>
                          <Input
                            id="edit-monthlyPrice"
                            type="number"
                            step="0.01"
                            min="0"
                            value={monthlyPriceEdit}
                            onChange={(e) => setMonthlyPriceEdit(e.target.value)}
                            className="mt-1"
                            placeholder="Ex: 49.00"
                          />
                          <p className="text-xs text-gray-500 mt-1">30 dias</p>
                        </div>
                        <div>
                          <Label htmlFor="edit-quarterlyPrice" className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-telegram-blue" />
                            Preço Trimestral (R$) *
                          </Label>
                          <Input
                            id="edit-quarterlyPrice"
                            type="number"
                            step="0.01"
                            min="0"
                            value={quarterlyPriceEdit}
                            onChange={(e) => setQuarterlyPriceEdit(e.target.value)}
                            className="mt-1"
                            placeholder="Ex: 129.00"
                          />
                          <p className="text-xs text-gray-500 mt-1">90 dias</p>
                        </div>
                        <div>
                          <Label htmlFor="edit-annualPrice" className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-telegram-blue" />
                            Preço Anual (R$) *
                          </Label>
                          <Input
                            id="edit-annualPrice"
                            type="number"
                            step="0.01"
                            min="0"
                            value={annualPriceEdit}
                            onChange={(e) => setAnnualPriceEdit(e.target.value)}
                            className="mt-1"
                            placeholder="Ex: 467.00"
                          />
                          <p className="text-xs text-gray-500 mt-1">365 dias</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mt-2">
                        <div>
                          <Label htmlFor="edit-monthlyCheckoutUrl" className="flex items-center gap-2 text-[10px] uppercase font-bold text-gray-500">
                            <LinkIcon className="h-3 w-3 text-telegram-blue" />
                            Checkout Mensal
                          </Label>
                          <Input
                            id="edit-monthlyCheckoutUrl"
                            value={monthlyCheckoutUrlEdit}
                            onChange={(e) => setMonthlyCheckoutUrlEdit(e.target.value)}
                            className="mt-1 h-8 text-xs focus-visible:ring-telegram-blue"
                            placeholder="URL do checkout mensal"
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit-quarterlyCheckoutUrl" className="flex items-center gap-2 text-[10px] uppercase font-bold text-gray-500">
                            <LinkIcon className="h-3 w-3 text-telegram-blue" />
                            Checkout Trimestral
                          </Label>
                          <Input
                            id="edit-quarterlyCheckoutUrl"
                            value={quarterlyCheckoutUrlEdit}
                            onChange={(e) => setQuarterlyCheckoutUrlEdit(e.target.value)}
                            className="mt-1 h-8 text-xs focus-visible:ring-telegram-blue"
                            placeholder="URL do checkout trimestral"
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit-annualCheckoutUrl" className="flex items-center gap-2 text-[10px] uppercase font-bold text-gray-500">
                            <LinkIcon className="h-3 w-3 text-telegram-blue" />
                            Checkout Anual
                          </Label>
                          <Input
                            id="edit-annualCheckoutUrl"
                            value={annualCheckoutUrlEdit}
                            onChange={(e) => setAnnualCheckoutUrlEdit(e.target.value)}
                            className="mt-1 h-8 text-xs focus-visible:ring-telegram-blue"
                            placeholder="URL do checkout anual"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="edit-price" className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-telegram-blue" />
                          Preço (R$) *
                        </Label>
                        <Input
                          id="edit-price"
                          type="number"
                          step="0.01"
                          min="0"
                          {...registerEdit("price", { valueAsNumber: true })}
                          className="mt-1"
                        />
                        {errorsEdit.price && (
                          <p className="text-sm text-red-500 mt-1">{errorsEdit.price.message}</p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="edit-durationDays" className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-telegram-blue" />
                          Duração (dias)
                        </Label>
                        <Input
                          id="edit-durationDays"
                          type="number"
                          min="1"
                          placeholder="Ex: 30 (mensal), 90 (trimestral)"
                          {...registerEdit("durationDays")}
                          className="mt-1"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Deixe vazio para plano sem vencimento
                        </p>
                      </div>
                      {/* Campo de duração do plano gratuito - apenas para plano "Gratuito" */}
                      {editingPlan && editingPlan.name.toLowerCase() === "gratuito" && (
                        <div>
                          <Label htmlFor="edit-freeTrialDurationHours" className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-telegram-blue" />
                            Duração do Plano Gratuito (horas) *
                          </Label>
                          <Input
                            id="edit-freeTrialDurationHours"
                            type="number"
                            min="1"
                            placeholder="Ex: 24 (padrão)"
                            {...registerEdit("freeTrialDurationHours")}
                            className="mt-1"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Quantidade de horas que o usuário pode usar o plano gratuito (padrão: 24 horas)
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <Label htmlFor="edit-badge" className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-telegram-blue" />
                      Badge do Plano
                    </Label>
                    <Input
                      id="edit-badge"
                      placeholder="Ex: Recomendado, Popular, Mais Vendido..."
                      {...registerEdit("badge")}
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Badge que aparecerá no card do plano (opcional)
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="edit-toggleId" className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-telegram-blue" />
                      Toggle do Plano
                    </Label>
                    <Select
                      id="edit-toggleId"
                      value={selectedToggleIdEdit}
                      onChange={(e) => {
                        setSelectedToggleIdEdit(e.target.value);
                        setSelectedToggleOptionValueEdit(""); // Reset opção quando mudar toggle
                      }}
                      className="mt-1"
                    >
                      <option value="">Nenhum toggle</option>
                      {toggles?.map((toggle) => (
                        <option key={toggle.id} value={toggle.id}>
                          {toggle.name}
                        </option>
                      ))}
                    </Select>
                    <p className="text-xs text-gray-500 mt-1">
                      Selecione um toggle criado. O plano aparecerá apenas dentro deste toggle na página de planos.
                    </p>
                  </div>

                  {selectedToggleIdEdit && (() => {
                    const selectedToggle = toggles?.find((t) => t.id === selectedToggleIdEdit);
                    const toggleOptions = selectedToggle?.options || [];

                    return (
                      <div>
                        <Label htmlFor="edit-toggleOptionValue" className="flex items-center gap-2">
                          <Settings className="h-4 w-4 text-telegram-blue" />
                          Opção do Toggle {toggleOptions.length === 0 && <span className="text-red-500">*</span>}
                        </Label>
                        {toggleOptions.length === 0 ? (
                          <div className="mt-1 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                            <p className="text-sm text-yellow-800">
                              ⚠️ Este toggle não possui opções configuradas. Por favor, edite o toggle e adicione opções (ex: Mensal, Trimestral, Anual) antes de associar um plano.
                            </p>
                          </div>
                        ) : (
                          <>
                            <Select
                              id="edit-toggleOptionValue"
                              value={selectedToggleOptionValueEdit}
                              onChange={(e) => setSelectedToggleOptionValueEdit(e.target.value)}
                              className="mt-1"
                              required
                            >
                              <option value="">Selecione uma opção</option>
                              {toggleOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </Select>
                            <p className="text-xs text-gray-500 mt-1">
                              Selecione a opção do toggle (ex: Mensal, Trimestral, Anual). O plano aparecerá apenas quando esta opção estiver selecionada na página de planos.
                            </p>
                          </>
                        )}
                      </div>
                    );
                  })()}

                  <div>
                    <Label htmlFor="edit-description" className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-telegram-blue" />
                      Descrição
                    </Label>
                    <Textarea
                      id="edit-description"
                      {...registerEdit("description")}
                      rows={4}
                      placeholder="Descreva o plano detalhadamente..."
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="edit-checkoutUrl" className="flex items-center gap-2">
                      <LinkIcon className="h-4 w-4 text-telegram-blue" />
                      URL de Checkout
                    </Label>
                    <Input
                      id="edit-checkoutUrl"
                      type="url"
                      placeholder="https://checkout.exemplo.com/plano-x"
                      {...registerEdit("checkoutUrl")}
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Link para onde o usuário será redirecionado ao clicar em "Assinar Agora"
                    </p>
                    {errorsEdit.checkoutUrl && (
                      <p className="text-sm text-red-500 mt-1">
                        {errorsEdit.checkoutUrl.message}
                      </p>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="limits" className="space-y-4 mt-0">
                <div className="space-y-4">
                  <div>
                    <Label className="text-base font-semibold mb-3 block flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      Limites de Recursos
                    </Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="edit-maxConnections">Máx. Conexões *</Label>
                        <Input
                          id="edit-maxConnections"
                          type="number"
                          min="1"
                          {...registerEdit("maxConnections", { valueAsNumber: true })}
                          className="mt-1"
                        />
                        {errorsEdit.maxConnections && (
                          <p className="text-sm text-red-500 mt-1">
                            {errorsEdit.maxConnections.message}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="edit-maxBots">Máx. Bots</Label>
                        <Input
                          id="edit-maxBots"
                          type="number"
                          min="1"
                          placeholder="Vazio = ilimitado"
                          {...registerEdit("maxBots")}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-maxLeads">Máx. Leads</Label>
                        <Input
                          id="edit-maxLeads"
                          type="number"
                          min="1"
                          placeholder="Vazio = ilimitado"
                          {...registerEdit("maxLeads")}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-maxFlows">Máx. Fluxos</Label>
                        <Input
                          id="edit-maxFlows"
                          type="number"
                          min="1"
                          placeholder="Vazio = ilimitado"
                          {...registerEdit("maxFlows")}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <Label className="text-base font-semibold mb-3 block flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      Permissões do Plano
                    </Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 bg-gray-50/50 transition-colors cursor-not-allowed opacity-75">
                        <Controller
                          control={controlEdit}
                          name="allowDashboard"
                          render={({ field }) => (
                            <Checkbox
                              id="edit-allowDashboard"
                              checked={true}
                              disabled
                              className="cursor-not-allowed"
                            />
                          )}
                        />
                        <Label
                          htmlFor="edit-allowDashboard"
                          className="text-sm font-medium text-gray-600 cursor-not-allowed flex-1"
                        >
                          Dashboard <span className="text-xs text-gray-500">(sempre ativo)</span>
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 bg-gray-50/50 transition-colors cursor-not-allowed opacity-75">
                        <Controller
                          control={controlEdit}
                          name="allowConnections"
                          render={({ field }) => (
                            <Checkbox
                              id="edit-allowConnections"
                              checked={true}
                              disabled
                              className="cursor-not-allowed"
                            />
                          )}
                        />
                        <Label
                          htmlFor="edit-allowConnections"
                          className="text-sm font-medium text-gray-600 cursor-not-allowed flex-1"
                        >
                          Conexões <span className="text-xs text-gray-500">(sempre ativo)</span>
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 bg-gray-50/50 transition-colors cursor-not-allowed opacity-75">
                        <Controller
                          control={controlEdit}
                          name="allowBots"
                          render={({ field }) => (
                            <Checkbox
                              id="edit-allowBots"
                              checked={true}
                              disabled
                              className="cursor-not-allowed"
                            />
                          )}
                        />
                        <Label
                          htmlFor="edit-allowBots"
                          className="text-sm font-medium text-gray-600 cursor-not-allowed flex-1"
                        >
                          Bots <span className="text-xs text-gray-500">(sempre ativo)</span>
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-telegram-blue/50 hover:bg-gray-50/50 transition-colors cursor-pointer group">
                        <Controller
                          control={controlEdit}
                          name="allowWelcomeGoodbye"
                          render={({ field }) => (
                            <Checkbox
                              id="edit-allowWelcomeGoodbye"
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="group-hover:border-telegram-blue"
                            />
                          )}
                        />
                        <Label
                          htmlFor="edit-allowWelcomeGoodbye"
                          className="text-sm font-medium text-gray-700 cursor-pointer group-hover:text-telegram-blue transition-colors flex-1"
                        >
                          Boas-vindas/Despedida
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-telegram-blue/50 hover:bg-gray-50/50 transition-colors cursor-pointer group">
                        <Controller
                          control={controlEdit}
                          name="allowLeads"
                          render={({ field }) => (
                            <Checkbox
                              id="edit-allowLeads"
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="group-hover:border-telegram-blue"
                            />
                          )}
                        />
                        <Label
                          htmlFor="edit-allowLeads"
                          className="text-sm font-medium text-gray-700 cursor-pointer group-hover:text-telegram-blue transition-colors flex-1"
                        >
                          Leads
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-telegram-blue/50 hover:bg-gray-50/50 transition-colors cursor-pointer group">
                        <Controller
                          control={controlEdit}
                          name="allowConversations"
                          render={({ field }) => (
                            <Checkbox
                              id="edit-allowConversations"
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="group-hover:border-telegram-blue"
                            />
                          )}
                        />
                        <Label
                          htmlFor="edit-allowConversations"
                          className="text-sm font-medium text-gray-700 cursor-pointer group-hover:text-telegram-blue transition-colors flex-1"
                        >
                          Conversas
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-telegram-blue/50 hover:bg-gray-50/50 transition-colors cursor-pointer group">
                        <Controller
                          control={controlEdit}
                          name="allowBulkMessage"
                          render={({ field }) => (
                            <Checkbox
                              id="edit-allowBulkMessage"
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="group-hover:border-telegram-blue"
                            />
                          )}
                        />
                        <Label
                          htmlFor="edit-allowBulkMessage"
                          className="text-sm font-medium text-gray-700 cursor-pointer group-hover:text-telegram-blue transition-colors flex-1"
                        >
                          Mensagens em Massa
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-telegram-blue/50 hover:bg-gray-50/50 transition-colors cursor-pointer group">
                        <Controller
                          control={controlEdit}
                          name="allowFlow"
                          render={({ field }) => (
                            <Checkbox
                              id="edit-allowFlow"
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="group-hover:border-telegram-blue"
                            />
                          )}
                        />
                        <Label
                          htmlFor="edit-allowFlow"
                          className="text-sm font-medium text-gray-700 cursor-pointer group-hover:text-telegram-blue transition-colors flex-1"
                        >
                          Fluxos
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-telegram-blue/50 hover:bg-gray-50/50 transition-colors cursor-pointer group">
                        <Controller
                          control={controlEdit}
                          name="allowMessageClone"
                          render={({ field }) => (
                            <Checkbox
                              id="edit-allowMessageClone"
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="group-hover:border-telegram-blue"
                            />
                          )}
                        />
                        <Label
                          htmlFor="edit-allowMessageClone"
                          className="text-sm font-medium text-gray-700 cursor-pointer group-hover:text-telegram-blue transition-colors flex-1"
                        >
                          Clonagem de Mensagens
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-telegram-blue/50 hover:bg-gray-50/50 transition-colors cursor-pointer group">
                        <Controller
                          control={controlEdit}
                          name="allowScheduledMessage"
                          render={({ field }) => (
                            <Checkbox
                              id="edit-allowScheduledMessage"
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="group-hover:border-telegram-blue"
                            />
                          )}
                        />
                        <Label
                          htmlFor="edit-allowScheduledMessage"
                          className="text-sm font-medium text-gray-700 cursor-pointer group-hover:text-telegram-blue transition-colors flex-1"
                        >
                          Mensagens Agendadas
                        </Label>
                      </div>

                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="benefits" className="space-y-4 mt-0">
                <div className="space-y-4">
                  <div>
                    <Label className="text-base font-semibold mb-2 block flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5" />
                      Benefícios Customizados
                    </Label>
                    <p className="text-xs text-gray-500 mb-4">
                      Adicione benefícios extras que aparecerão no card do plano. Arraste para reordenar, clique no texto para editar, e no ícone para alternar entre check (verde) e X (vermelho).
                    </p>
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEndEdit}
                    >
                      <SortableContext
                        items={customBenefitsEdit.map((_, i) => i)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                          {customBenefitsEdit.map((benefit, index) => (
                            <SortableBenefitItem
                              key={index}
                              benefit={benefit}
                              index={index}
                              isEditing={editingBenefitIndexEdit === index}
                              editingText={editingBenefitTextEdit}
                              onEditTextChange={setEditingBenefitTextEdit}
                              onStartEdit={() => startEditingBenefitEdit(index)}
                              onSaveEdit={() => saveEditingBenefitEdit(index)}
                              onCancelEdit={cancelEditingBenefitEdit}
                              onToggle={() => toggleCustomBenefitEdit(index)}
                              onRemove={() => removeCustomBenefitEdit(index)}
                            />
                          ))}
                          {customBenefitsEdit.length === 0 && (
                            <p className="text-sm text-gray-400 text-center py-4">
                              Nenhum benefício customizado adicionado
                            </p>
                          )}
                        </div>
                      </SortableContext>
                    </DndContext>
                    <div className="flex gap-2 mt-4">
                      <Input
                        placeholder="Digite um benefício..."
                        value={newBenefitEdit}
                        onChange={(e) => setNewBenefitEdit(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addCustomBenefitEdit();
                          }
                        }}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addCustomBenefitEdit}
                        disabled={!newBenefitEdit.trim()}
                        className="flex items-center gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        Adicionar
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-center space-x-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <input
                      type="checkbox"
                      id="edit-isActive"
                      {...registerEdit("isActive")}
                      className="rounded"
                    />
                    <Label htmlFor="edit-isActive" className="text-sm font-medium cursor-pointer">
                      Plano Ativo (disponível para assinatura)
                    </Label>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="border-t pt-4 mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setEditingPlan(null);
                  resetEdit();
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={updatePlanMutation.isPending}>
                {updatePlanMutation.isPending ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Exclusão */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              O que deseja fazer com o plano "{deletingPlan?.name}"?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 border border-gray-200 rounded-lg">
              <h4 className="font-semibold mb-2">Desativar (Soft Delete)</h4>
              <p className="text-sm text-gray-600 mb-3">
                {(() => {
                  const plansWithSameName = plans?.filter((p) => p.name === deletingPlan?.name && p.id !== deletingPlan?.id) || [];
                  const hasGroupPlans = plansWithSameName.length > 0;

                  if (hasGroupPlans) {
                    return `Todos os planos do grupo "${deletingPlan?.name}" (Mensal, Trimestral e Anual) serão desativados e não aparecerão mais para novos usuários, mas permanecerão no banco de dados. Você poderá reativá-los depois.`;
                  }
                  return "O plano será desativado e não aparecerá mais para novos usuários, mas permanecerá no banco de dados. Você poderá reativá-lo depois.";
                })()}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (deletingPlan) {
                    const plansWithSameName = plans?.filter((p) => p.name === deletingPlan.name && p.id !== deletingPlan.id) || [];
                    const hasGroupPlans = plansWithSameName.length > 0;

                    if (hasGroupPlans) {
                      deletePlansByGroupMutation.mutate({ planName: deletingPlan.name });
                    } else {
                      deletePlanMutation.mutate({ id: deletingPlan.id });
                    }
                  }
                }}
                disabled={deletePlanMutation.isPending || deletePlansByGroupMutation.isPending}
                className="w-full"
              >
                {deletePlanMutation.isPending || deletePlansByGroupMutation.isPending ? "Desativando..." : "Desativar Plano"}
              </Button>
            </div>
            <div className="p-4 border border-red-200 rounded-lg bg-red-50">
              <h4 className="font-semibold mb-2 text-red-700">Excluir Permanentemente (Hard Delete)</h4>
              <p className="text-sm text-red-600 mb-3">
                ⚠️ {(() => {
                  const plansWithSameName = plans?.filter((p) => p.name === deletingPlan?.name && p.id !== deletingPlan?.id) || [];
                  const hasGroupPlans = plansWithSameName.length > 0;

                  if (hasGroupPlans) {
                    return `Todos os planos do grupo "${deletingPlan?.name}" (Mensal, Trimestral e Anual) serão removidos permanentemente do banco de dados e não poderão ser recuperados. Esta ação não pode ser revertida.`;
                  }
                  return `O plano será removido permanentemente do banco de dados e não poderá ser recuperado. Esta ação não pode ser revertida.`;
                })()}
              </p>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  if (deletingPlan) {
                    const plansWithSameName = plans?.filter((p) => p.name === deletingPlan.name && p.id !== deletingPlan.id) || [];
                    const hasGroupPlans = plansWithSameName.length > 0;

                    const confirmMessage = hasGroupPlans
                      ? `Tem CERTEZA ABSOLUTA que deseja excluir PERMANENTEMENTE todos os planos do grupo "${deletingPlan.name}" (Mensal, Trimestral e Anual)? Esta ação NÃO pode ser revertida!`
                      : `Tem CERTEZA ABSOLUTA que deseja excluir PERMANENTEMENTE o plano "${deletingPlan.name}"? Esta ação NÃO pode ser revertida!`;

                    if (confirm(confirmMessage)) {
                      if (hasGroupPlans) {
                        deletePlansByGroupPermanentlyMutation.mutate({ planName: deletingPlan.name });
                      } else {
                        deletePlanPermanentlyMutation.mutate({ id: deletingPlan.id });
                      }
                    }
                  }
                }}
                disabled={deletePlanPermanentlyMutation.isPending || deletePlansByGroupPermanentlyMutation.isPending}
                className="w-full"
              >
                {deletePlanPermanentlyMutation.isPending || deletePlansByGroupPermanentlyMutation.isPending ? "Excluindo..." : "Excluir Permanentemente"}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setDeletingPlan(null);
              }}
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Criação/Edição de Toggle */}
      <Dialog open={isToggleDialogOpen} onOpenChange={setIsToggleDialogOpen}>
        <DialogContent className="w-[calc(100%-1rem)] sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <Settings className="h-6 w-6 text-telegram-blue" />
              {editingToggle ? "Editar Toggle" : "Criar Novo Toggle"}
            </DialogTitle>
            <DialogDescription>
              {editingToggle
                ? "Atualize as informações do toggle abaixo."
                : "Crie um novo toggle que pode ser associado aos planos."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-2 custom-scrollbar space-y-4 py-4">
            <div>
              <Label htmlFor="toggleName" className="flex items-center gap-2">
                <Package className="h-4 w-4 text-telegram-blue" />
                Nome do Toggle *
              </Label>
              <Input
                id="toggleName"
                value={newToggleName}
                onChange={(e) => setNewToggleName(e.target.value)}
                placeholder="Ex: Período de Cobrança"
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">
                O nome do toggle aparecerá na página de planos (ex: "Período de Cobrança").
              </p>
            </div>

            <div>
              <Label className="flex items-center gap-2 mb-2">
                <Settings className="h-4 w-4 text-telegram-blue" />
                Opções do Toggle *
              </Label>
              <p className="text-xs text-gray-500 mb-3">
                Adicione as opções que aparecerão no toggle. Exemplo: Mensal (monthly), Trimestral (quarterly), Anual (annual).
              </p>
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                {toggleOptions.length === 0 ? (
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 text-center">
                    <p className="text-sm text-gray-500">
                      Nenhuma opção adicionada ainda. Adicione pelo menos uma opção abaixo.
                    </p>
                  </div>
                ) : (
                  toggleOptions.map((option, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-700">{option.label}</span>
                        <span className="text-xs text-gray-500 ml-2">({option.value})</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeToggleOption(index)}
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Input
                  placeholder="Label (ex: Mensal)"
                  value={newToggleLabel}
                  onChange={(e) => setNewToggleLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newToggleLabel.trim() && newToggleValue.trim()) {
                      e.preventDefault();
                      addToggleOption();
                    }
                  }}
                  className="flex-1"
                />
                <Input
                  placeholder="Valor (ex: monthly)"
                  value={newToggleValue}
                  onChange={(e) => setNewToggleValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newToggleLabel.trim() && newToggleValue.trim()) {
                      e.preventDefault();
                      addToggleOption();
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addToggleOption}
                  disabled={!newToggleLabel.trim() || !newToggleValue.trim()}
                  className="flex-shrink-0"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                <strong>Dica:</strong> O "Label" é o que aparece na tela (ex: "Mensal"). O "Valor" é usado internamente (ex: "monthly").
              </p>
            </div>
          </div>
          <DialogFooter className="border-t pt-4 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsToggleDialogOpen(false);
                setEditingToggle(null);
                setNewToggleName("");
                setToggleOptions([]);
                setNewToggleLabel("");
                setNewToggleValue("");
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSaveToggle}
              disabled={createToggleMutation.isPending || updateToggleMutation.isPending}
            >
              {createToggleMutation.isPending || updateToggleMutation.isPending
                ? "Salvando..."
                : editingToggle
                  ? "Salvar Alterações"
                  : "Criar Toggle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div >
  );
}
