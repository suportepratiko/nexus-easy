/**
 * Router de Planos
 *
 * Endpoints para gerenciamento de planos de assinatura.
 */

import { PlanService } from "@/application/plan/plan.service";
import type { PlanEntity } from "@/domain/plan/plan.entity";
import { PlanRepository } from "@/infrastructure/repositories/plan.repository";
import { logger } from "@/infrastructure/logger/logger";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

const createPlanSchema = z.object({
  name: z.string().min(1, "Nome do plano é obrigatório"),
  description: z.string().optional().nullable(),
  price: z.number().min(0, "Preço deve ser maior ou igual a zero"),
  durationDays: z.number().int().min(1).nullable().optional(),
  freeTrialDurationHours: z.number().int().min(1).nullable().optional(), // Duração do plano gratuito em horas
  maxConnections: z.number().int().min(1, "Máximo de conexões deve ser pelo menos 1"),
  maxBots: z.number().int().min(1).nullable(),
  maxLeads: z.number().int().min(1).nullable(),
  maxFlows: z.number().int().min(1).nullable(),
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
  customBenefits: z
    .array(
      z.union([
        z.string(),
        z.object({
          text: z.string(),
          hasFeature: z.boolean(),
        }),
      ])
    )
    .optional()
    .nullable(),
});

const updatePlanSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  price: z.number().min(0).optional(),
  durationDays: z.number().int().min(1).nullable().optional(),
  freeTrialDurationHours: z.number().int().min(1).nullable().optional(), // Duração do plano gratuito em horas
  maxConnections: z.number().int().min(1).optional(),
  maxBots: z.number().int().min(1).nullable().optional(),
  maxLeads: z.number().int().min(1).nullable().optional(),
  maxFlows: z.number().int().min(1).nullable().optional(),
  allowDashboard: z.boolean().optional(),
  allowConnections: z.boolean().optional(),
  allowBots: z.boolean().optional(),
  allowWelcomeGoodbye: z.boolean().optional(),
  allowLeads: z.boolean().optional(),
  allowConversations: z.boolean().optional(),
  allowBulkMessage: z.boolean().optional(),
  allowFlow: z.boolean().optional(),
  allowMessageClone: z.boolean().optional(),
  allowScheduledMessage: z.boolean().optional(),
  isActive: z.boolean().optional(),
  checkoutUrl: z.string().url("URL inválida").optional().nullable().or(z.literal("")),
  badge: z.string().optional().nullable(),
  toggleId: z.string().optional().nullable(),
  toggleOptionValue: z.string().optional().nullable(),
  customBenefits: z
    .array(
      z.union([
        z.string(),
        z.object({
          text: z.string(),
          hasFeature: z.boolean(),
        }),
      ])
    )
    .optional()
    .nullable(),
});

const createMultiplePlansSchema = z.object({
  baseName: z.string().min(1, "Nome base do plano é obrigatório"),
  description: z.string().optional().nullable(),
  maxConnections: z.number().int().min(1, "Máximo de conexões deve ser pelo menos 1"),
  maxBots: z.number().int().min(1).nullable(),
  maxLeads: z.number().int().min(1).nullable(),
  maxFlows: z.number().int().min(1).nullable(),
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
  customBenefits: z
    .array(
      z.union([
        z.string(),
        z.object({
          text: z.string(),
          hasFeature: z.boolean(),
        }),
      ])
    )
    .optional()
    .nullable(),
  plans: z.array(
    z.object({
      name: z.string().min(1, "Nome do plano é obrigatório"),
      price: z.number().min(0, "Preço deve ser maior ou igual a zero"),
      durationDays: z.number().int().min(1),
      toggleOptionValue: z.string().optional().nullable(),
      checkoutUrl: z.string().url("URL inválida").optional().nullable().or(z.literal("")),
    })
  ).min(1, "Pelo menos um plano deve ser fornecido"),
});

function makeService() {
  const repository = new PlanRepository();
  return new PlanService(repository);
}

export const planRouter = createTRPCRouter({
  /**
   * Lista todos os planos (apenas para admins)
   */
  getAllPlans: adminProcedure.query(async () => {
    try {
      logger.info("Listando todos os planos");

      const service = makeService();
      const plans = await service.getAllPlans();

      logger.info("Planos listados com sucesso", { count: plans.length });

      return plans;
    } catch (error) {
      logger.error("Erro ao listar planos", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao listar planos",
      });
    }
  }),

  /**
   * Lista apenas planos ativos (público para visualização)
   */
  getActivePlans: publicProcedure.query(async () => {
    try {
      logger.info("Listando planos ativos");

      const service = makeService();
      const plans = await service.getActivePlans();

      logger.info("Planos ativos listados com sucesso", { count: plans.length });

      return plans;
    } catch (error) {
      logger.error("Erro ao listar planos ativos", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao listar planos ativos",
      });
    }
  }),

  /**
   * Busca um plano por ID
   */
  getPlanById: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    try {
      logger.info("Buscando plano por ID", { planId: input.id });

      const service = makeService();
      const plan = await service.getPlanById(input.id);

      if (!plan) {
        logger.warn("Plano não encontrado", { planId: input.id });
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Plano não encontrado",
        });
      }

      logger.info("Plano encontrado", { planId: plan.id, planName: plan.name });

      return plan;
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      logger.error("Erro ao buscar plano por ID", {
        planId: input.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao buscar plano",
      });
    }
  }),

  /**
   * Cria um novo plano (apenas para admins)
   */
  createPlan: adminProcedure.input(createPlanSchema).mutation(async ({ input }) => {
    try {
      logger.info("Criando novo plano", { planName: input.name });

      const service = makeService();
      // Garantir que o nome está presente (schema Zod garante, mas TypeScript precisa da assertion)
      if (!input.name) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Nome do plano é obrigatório",
        });
      }

      const planData: Omit<PlanEntity, "id" | "createdAt" | "updatedAt"> = {
        name: input.name,
        description: input.description ?? null,
        price: input.price,
        durationDays: input.durationDays ?? null,
        maxConnections: input.maxConnections,
        maxBots: input.maxBots ?? null,
        maxLeads: input.maxLeads ?? null,
        maxFlows: input.maxFlows ?? null,
        allowDashboard: true,
        allowConnections: true,
        allowBots: true,
        allowWelcomeGoodbye: input.allowWelcomeGoodbye ?? true,
        allowLeads: input.allowLeads ?? true,
        allowConversations: input.allowConversations ?? true,
        allowBulkMessage: input.allowBulkMessage ?? true,
        allowFlow: input.allowFlow ?? true,
        allowMessageClone: input.allowMessageClone ?? false,
        allowScheduledMessage: input.allowScheduledMessage ?? false,
        allowBackup: false,
        isActive: input.isActive ?? true,
        checkoutUrl: input.checkoutUrl && input.checkoutUrl.trim() !== "" ? input.checkoutUrl : null,
        badge: input.badge && input.badge.trim() !== "" ? input.badge : null,
        toggleId: input.toggleId ?? null,
        toggleOptionValue: input.toggleOptionValue ?? null,
        customBenefits:
          input.customBenefits?.map((b) =>
            typeof b === "string" ? b : { text: b.text, hasFeature: b.hasFeature }
          ) ?? null,
      };

      const plan = await service.createPlan(planData);

      logger.info("Plano criado com sucesso", { planId: plan.id, planName: plan.name });

      return plan;
    } catch (error) {
      logger.error("Erro ao criar plano", {
        planName: input.name,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (error instanceof Error && error.message.includes("já existe")) {
        throw new TRPCError({
          code: "CONFLICT",
          message: error.message,
        });
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao criar plano",
      });
    }
  }),

  /**
   * Cria múltiplos planos de uma vez (mensal, trimestral e anual) (apenas para admins)
   */
  createMultiplePlans: adminProcedure.input(createMultiplePlansSchema).mutation(async ({ input }) => {
    try {
      logger.info("Criando múltiplos planos", { baseName: input.baseName, count: input.plans.length });

      const service = makeService();

      const baseData: Omit<PlanEntity, "id" | "createdAt" | "updatedAt" | "name" | "price" | "durationDays" | "toggleOptionValue"> = {
        description: input.description ?? null,
        maxConnections: input.maxConnections,
        maxBots: input.maxBots ?? null,
        maxLeads: input.maxLeads ?? null,
        maxFlows: input.maxFlows ?? null,
        allowDashboard: true,
        allowConnections: true,
        allowBots: true,
        allowWelcomeGoodbye: input.allowWelcomeGoodbye ?? true,
        allowLeads: input.allowLeads ?? true,
        allowConversations: input.allowConversations ?? true,
        allowBulkMessage: input.allowBulkMessage ?? true,
        allowFlow: input.allowFlow ?? true,
        allowMessageClone: input.allowMessageClone ?? false,
        allowScheduledMessage: input.allowScheduledMessage ?? false,
        allowBackup: false,
        isActive: input.isActive ?? true,
        checkoutUrl: input.checkoutUrl && input.checkoutUrl.trim() !== "" ? input.checkoutUrl : null,
        badge: input.badge && input.badge.trim() !== "" ? input.badge : null,
        toggleId: input.toggleId ?? null,
        customBenefits:
          input.customBenefits?.map((b) =>
            typeof b === "string" ? b : { text: b.text, hasFeature: b.hasFeature }
          ) ?? null,
      };

      const plansData = input.plans.map((plan) => ({
        name: plan.name,
        price: plan.price,
        durationDays: plan.durationDays,
        toggleOptionValue: plan.toggleOptionValue ?? null,
        checkoutUrl: plan.checkoutUrl && plan.checkoutUrl.trim() !== "" ? plan.checkoutUrl : null,
      }));

      const createdPlans = await service.createMultiplePlans(baseData, plansData);

      logger.info("Múltiplos planos criados com sucesso", {
        count: createdPlans.length,
        planNames: createdPlans.map((p) => p.name),
      });

      return createdPlans;
    } catch (error) {
      logger.error("Erro ao criar múltiplos planos", {
        baseName: input.baseName,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (error instanceof Error && error.message.includes("já existe")) {
        throw new TRPCError({
          code: "CONFLICT",
          message: error.message,
        });
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao criar múltiplos planos",
      });
    }
  }),

  /**
   * Atualiza os preços de todos os planos do mesmo grupo (apenas para admins)
   */
  updatePlansPricesByGroup: adminProcedure
    .input(
      z.object({
        planName: z.string().min(1, "Nome do plano é obrigatório"),
        monthlyPrice: z.number().min(0).optional(),
        quarterlyPrice: z.number().min(0).optional(),
        annualPrice: z.number().min(0).optional(),
        monthlyCheckoutUrl: z.string().url("URL inválida").optional().nullable().or(z.literal("")),
        quarterlyCheckoutUrl: z.string().url("URL inválida").optional().nullable().or(z.literal("")),
        annualCheckoutUrl: z.string().url("URL inválida").optional().nullable().or(z.literal("")),
        description: z.string().optional().nullable(),
        maxConnections: z.number().int().min(1).optional(),
        maxBots: z.number().int().min(1).nullable().optional(),
        maxLeads: z.number().int().min(1).nullable().optional(),
        maxFlows: z.number().int().min(1).nullable().optional(),
        allowDashboard: z.boolean().optional(),
        allowConnections: z.boolean().optional(),
        allowBots: z.boolean().optional(),
        allowWelcomeGoodbye: z.boolean().optional(),
        allowLeads: z.boolean().optional(),
        allowConversations: z.boolean().optional(),
        allowBulkMessage: z.boolean().optional(),
        allowFlow: z.boolean().optional(),
        allowMessageClone: z.boolean().optional(),
        allowScheduledMessage: z.boolean().optional(),
        isActive: z.boolean().optional(),
        checkoutUrl: z.string().url("URL inválida").optional().nullable().or(z.literal("")),
        badge: z.string().optional().nullable(),
        toggleId: z.string().optional().nullable(),
        customBenefits: z
          .array(
            z.union([
              z.string(),
              z.object({
                text: z.string(),
                hasFeature: z.boolean(),
              }),
            ])
          )
          .optional()
          .nullable(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const {
          planName,
          monthlyPrice,
          quarterlyPrice,
          annualPrice,
          monthlyCheckoutUrl,
          quarterlyCheckoutUrl,
          annualCheckoutUrl,
          ...otherData
        } = input;

        logger.info("Atualizando preços e links dos planos do grupo", {
          planName,
          monthlyPrice,
          quarterlyPrice,
          annualPrice,
          monthlyCheckoutUrl,
          quarterlyCheckoutUrl,
          annualCheckoutUrl,
        });

        const service = makeService();

        const finalUpdateData: Partial<Omit<PlanEntity, "id" | "createdAt" | "updatedAt" | "name" | "price" | "durationDays" | "toggleOptionValue">> = {
          ...(otherData.description !== undefined && { description: otherData.description ?? null }),
          ...(otherData.maxConnections !== undefined && { maxConnections: otherData.maxConnections }),
          ...(otherData.maxBots !== undefined && { maxBots: otherData.maxBots ?? null }),
          ...(otherData.maxLeads !== undefined && { maxLeads: otherData.maxLeads ?? null }),
          ...(otherData.maxFlows !== undefined && { maxFlows: otherData.maxFlows ?? null }),
          ...(otherData.checkoutUrl !== undefined && {
            checkoutUrl: otherData.checkoutUrl && otherData.checkoutUrl.trim() !== "" ? otherData.checkoutUrl : null,
          }),
          ...(otherData.badge !== undefined && {
            badge: otherData.badge && otherData.badge.trim() !== "" ? otherData.badge : null,
          }),
          ...(otherData.toggleId !== undefined && { toggleId: otherData.toggleId ?? null }),
          ...(otherData.customBenefits !== undefined && {
            customBenefits: otherData.customBenefits === null || (Array.isArray(otherData.customBenefits) && otherData.customBenefits.length === 0)
              ? null
              : (otherData.customBenefits as PlanEntity["customBenefits"]),
          }),
          ...(otherData.allowDashboard !== undefined && { allowDashboard: otherData.allowDashboard }),
          ...(otherData.allowConnections !== undefined && { allowConnections: otherData.allowConnections }),
          ...(otherData.allowBots !== undefined && { allowBots: otherData.allowBots }),
          ...(otherData.allowWelcomeGoodbye !== undefined && { allowWelcomeGoodbye: otherData.allowWelcomeGoodbye }),
          ...(otherData.allowLeads !== undefined && { allowLeads: otherData.allowLeads }),
          ...(otherData.allowConversations !== undefined && { allowConversations: otherData.allowConversations }),
          ...(otherData.allowBulkMessage !== undefined && { allowBulkMessage: otherData.allowBulkMessage }),
          ...(otherData.allowFlow !== undefined && { allowFlow: otherData.allowFlow }),
          ...(otherData.allowMessageClone !== undefined && { allowMessageClone: otherData.allowMessageClone }),
          ...(otherData.allowScheduledMessage !== undefined && { allowScheduledMessage: otherData.allowScheduledMessage }),
          ...(otherData.isActive !== undefined && { isActive: otherData.isActive }),
        };

        const updatedPlans = await service.updatePlansPricesByGroup(
          planName,
          {
            monthly: monthlyPrice,
            quarterly: quarterlyPrice,
            annual: annualPrice,
            monthlyCheckoutUrl: monthlyCheckoutUrl && monthlyCheckoutUrl.trim() !== "" ? monthlyCheckoutUrl : (monthlyCheckoutUrl === "" ? null : undefined),
            quarterlyCheckoutUrl: quarterlyCheckoutUrl && quarterlyCheckoutUrl.trim() !== "" ? quarterlyCheckoutUrl : (quarterlyCheckoutUrl === "" ? null : undefined),
            annualCheckoutUrl: annualCheckoutUrl && annualCheckoutUrl.trim() !== "" ? annualCheckoutUrl : (annualCheckoutUrl === "" ? null : undefined),
          },
          finalUpdateData
        );

        logger.info("Preços dos planos do grupo atualizados com sucesso", {
          planName,
          count: updatedPlans.length,
        });

        return updatedPlans;
      } catch (error) {
        logger.error("Erro ao atualizar preços dos planos do grupo", {
          planName: input.planName,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

        if (error instanceof Error && error.message.includes("não encontrado")) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao atualizar preços dos planos do grupo",
        });
      }
    }),

  /**
   * Atualiza todos os planos do mesmo grupo (mesmo nome) (apenas para admins)
   */
  updatePlansByGroup: adminProcedure
    .input(
      z.object({
        planName: z.string().min(1, "Nome do plano é obrigatório"),
        description: z.string().optional().nullable(),
        maxConnections: z.number().int().min(1).optional(),
        maxBots: z.number().int().min(1).nullable().optional(),
        maxLeads: z.number().int().min(1).nullable().optional(),
        maxFlows: z.number().int().min(1).nullable().optional(),
        allowDashboard: z.boolean().optional(),
        allowConnections: z.boolean().optional(),
        allowBots: z.boolean().optional(),
        allowWelcomeGoodbye: z.boolean().optional(),
        allowLeads: z.boolean().optional(),
        allowConversations: z.boolean().optional(),
        allowBulkMessage: z.boolean().optional(),
        allowFlow: z.boolean().optional(),
        allowMessageClone: z.boolean().optional(),
        allowScheduledMessage: z.boolean().optional(),
        isActive: z.boolean().optional(),
        checkoutUrl: z.string().url("URL inválida").optional().nullable().or(z.literal("")),
        badge: z.string().optional().nullable(),
        toggleId: z.string().optional().nullable(),
        customBenefits: z
          .array(
            z.union([
              z.string(),
              z.object({
                text: z.string(),
                hasFeature: z.boolean(),
              }),
            ])
          )
          .optional()
          .nullable(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const { planName, ...data } = input;

        logger.info("Atualizando planos do grupo", {
          planName,
          hasCustomBenefits: data.customBenefits !== undefined,
          customBenefitsLength: Array.isArray(data.customBenefits) ? data.customBenefits.length : "not array",
        });

        const service = makeService();

        const finalUpdateData: Partial<Omit<PlanEntity, "id" | "createdAt" | "updatedAt" | "name" | "price" | "durationDays" | "toggleOptionValue">> = {
          ...(data.description !== undefined && { description: data.description ?? null }),
          ...(data.maxConnections !== undefined && { maxConnections: data.maxConnections }),
          ...(data.maxBots !== undefined && { maxBots: data.maxBots ?? null }),
          ...(data.maxLeads !== undefined && { maxLeads: data.maxLeads ?? null }),
          ...(data.maxFlows !== undefined && { maxFlows: data.maxFlows ?? null }),
          ...(data.checkoutUrl !== undefined && {
            checkoutUrl: data.checkoutUrl && data.checkoutUrl.trim() !== "" ? data.checkoutUrl : null,
          }),
          ...(data.badge !== undefined && {
            badge: data.badge && data.badge.trim() !== "" ? data.badge : null,
          }),
          ...(data.toggleId !== undefined && { toggleId: data.toggleId ?? null }),
          // Sempre incluir customBenefits se foi fornecido (mesmo que seja null ou array vazio)
          ...(data.customBenefits !== undefined && {
            customBenefits: data.customBenefits === null || (Array.isArray(data.customBenefits) && data.customBenefits.length === 0)
              ? null
              : (data.customBenefits as PlanEntity["customBenefits"]),
          }),
          ...(data.allowDashboard !== undefined && { allowDashboard: data.allowDashboard }),
          ...(data.allowConnections !== undefined && { allowConnections: data.allowConnections }),
          ...(data.allowBots !== undefined && { allowBots: data.allowBots }),
          ...(data.allowWelcomeGoodbye !== undefined && { allowWelcomeGoodbye: data.allowWelcomeGoodbye }),
          ...(data.allowLeads !== undefined && { allowLeads: data.allowLeads }),
          ...(data.allowConversations !== undefined && { allowConversations: data.allowConversations }),
          ...(data.allowBulkMessage !== undefined && { allowBulkMessage: data.allowBulkMessage }),
          ...(data.allowFlow !== undefined && { allowFlow: data.allowFlow }),
          ...(data.allowMessageClone !== undefined && { allowMessageClone: data.allowMessageClone }),
          ...(data.allowScheduledMessage !== undefined && { allowScheduledMessage: data.allowScheduledMessage }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        };

        const updatedPlans = await service.updatePlansByGroup(planName, finalUpdateData);

        logger.info("Planos do grupo atualizados com sucesso", {
          planName,
          count: updatedPlans.length,
        });

        return updatedPlans;
      } catch (error) {
        logger.error("Erro ao atualizar planos do grupo", {
          planName: input.planName,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

        if (error instanceof Error && error.message.includes("não encontrado")) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao atualizar planos do grupo",
        });
      }
    }),

  /**
   * Atualiza um plano existente (apenas para admins)
   */
  updatePlan: adminProcedure.input(updatePlanSchema).mutation(async ({ input }) => {
    try {
      const { id, ...data } = input;

      logger.info("Atualizando plano", { planId: id });

      const service = makeService();

      const finalUpdateData: Partial<Omit<PlanEntity, "id" | "createdAt" | "updatedAt">> = {
        ...data,
        ...(data.customBenefits !== undefined && {
          customBenefits: data.customBenefits as PlanEntity["customBenefits"],
        }),
        ...(data.checkoutUrl !== undefined && {
          checkoutUrl: data.checkoutUrl && data.checkoutUrl.trim() !== "" ? data.checkoutUrl : null,
        }),
        ...(data.badge !== undefined && {
          badge: data.badge && data.badge.trim() !== "" ? data.badge : null,
        }),
        allowDashboard: true,
        allowConnections: true,
        allowBots: true,
      };

      const plan = await service.updatePlan(id, finalUpdateData);

      logger.info("Plano atualizado com sucesso", { planId: plan.id, planName: plan.name });

      return plan;
    } catch (error) {
      logger.error("Erro ao atualizar plano", {
        planId: input.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (error instanceof Error && error.message.includes("não encontrado")) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: error.message,
        });
      }

      if (error instanceof Error && error.message.includes("já existe")) {
        throw new TRPCError({
          code: "CONFLICT",
          message: error.message,
        });
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao atualizar plano",
      });
    }
  }),

  /**
   * Remove um plano (soft delete - apenas para admins)
   */
  deletePlan: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    try {
      logger.info("Removendo plano", { planId: input.id });

      const service = makeService();
      await service.deletePlan(input.id);

      logger.info("Plano removido com sucesso", { planId: input.id });

      return { success: true };
    } catch (error) {
      logger.error("Erro ao remover plano", {
        planId: input.id,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof Error && error.message.includes("não encontrado")) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: error.message,
        });
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao remover plano",
      });
    }
  }),

  /**
   * Remove todos os planos do mesmo grupo (soft delete - apenas para admins)
   */
  deletePlansByGroup: adminProcedure.input(z.object({ planName: z.string() })).mutation(async ({ input }) => {
    try {
      logger.info("Removendo planos do grupo", { planName: input.planName });

      const service = makeService();
      await service.deletePlansByGroup(input.planName);

      logger.info("Planos do grupo removidos com sucesso", { planName: input.planName });

      return { success: true };
    } catch (error) {
      logger.error("Erro ao remover planos do grupo", {
        planName: input.planName,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof Error && error.message.includes("não encontrado")) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: error.message,
        });
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao remover planos do grupo",
      });
    }
  }),

  /**
   * Remove permanentemente todos os planos do mesmo grupo (hard delete - apenas para admins)
   */
  deletePlansByGroupPermanently: adminProcedure.input(z.object({ planName: z.string() })).mutation(async ({ input }) => {
    try {
      logger.warn("Removendo permanentemente planos do grupo", { planName: input.planName });

      const service = makeService();
      await service.deletePlansByGroupPermanently(input.planName);

      logger.info("Planos do grupo removidos permanentemente com sucesso", { planName: input.planName });

      return { success: true };
    } catch (error) {
      logger.error("Erro ao remover permanentemente planos do grupo", {
        planName: input.planName,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof Error && error.message.includes("não encontrado")) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: error.message,
        });
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao remover permanentemente planos do grupo",
      });
    }
  }),

  /**
   * Remove um plano permanentemente do banco de dados (hard delete - apenas para admins)
   */
  deletePlanPermanently: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    try {
      logger.warn("Removendo plano permanentemente", { planId: input.id });

      const service = makeService();
      await service.deletePlanPermanently(input.id);

      logger.info("Plano removido permanentemente com sucesso", { planId: input.id });

      return { success: true };
    } catch (error) {
      logger.error("Erro ao remover plano permanentemente", {
        planId: input.id,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof Error && error.message.includes("não encontrado")) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: error.message,
        });
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao remover plano permanentemente",
      });
    }
  }),
});
