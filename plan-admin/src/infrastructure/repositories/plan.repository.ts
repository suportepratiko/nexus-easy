/**
 * Repositório de Plan (Infraestrutura)
 *
 * Implementação do repositório de planos usando Prisma.
 */

import type { PlanEntity } from "@/domain/plan/plan.entity";
import type { IPlanRepository } from "@/domain/plan/plan.repository.interface";
import { logger } from "@/infrastructure/logger/logger";
import { prisma } from "@/infrastructure/database/prisma";
import { Prisma } from "@prisma/client";

export class PlanRepository implements IPlanRepository {
  async findById(id: string): Promise<PlanEntity | null> {
    try {
      logger.debug("Buscando plano por ID", { planId: id });

      const plan = await prisma.plan.findUnique({
        where: { id },
      });

      if (!plan) {
        logger.debug("Plano não encontrado", { planId: id });
        return null;
      }

      return this.mapToEntity(plan);
    } catch (error) {
      logger.error("Erro ao buscar plano por ID", {
        planId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findByName(name: string): Promise<PlanEntity | null> {
    try {
      logger.debug("Buscando plano por nome", { planName: name });

      const plan = await prisma.plan.findFirst({
        where: { name },
      });

      if (!plan) {
        logger.debug("Plano não encontrado", { planName: name });
        return null;
      }

      return this.mapToEntity(plan);
    } catch (error) {
      logger.error("Erro ao buscar plano por nome", {
        planName: name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findAllByName(name: string): Promise<PlanEntity[]> {
    try {
      logger.debug("Buscando todos os planos por nome", { planName: name });

      const plans = await prisma.plan.findMany({
        where: { name },
        orderBy: { durationDays: "asc" },
      });

      return plans.map((plan) => this.mapToEntity(plan));
    } catch (error) {
      logger.error("Erro ao buscar planos por nome", {
        planName: name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findByVariant(
    name: string,
    toggleId: string | null,
    toggleOptionValue: string | null
  ): Promise<PlanEntity | null> {
    try {
      logger.debug("Buscando plano por variante", { planName: name, toggleId, toggleOptionValue });

      const plan = await prisma.plan.findFirst({
        where: {
          name,
          toggleId: toggleId ?? null,
          toggleOptionValue: toggleOptionValue ?? null,
        },
      });

      if (!plan) {
        logger.debug("Plano por variante não encontrado", { planName: name, toggleId, toggleOptionValue });
        return null;
      }

      return this.mapToEntity(plan);
    } catch (error) {
      logger.error("Erro ao buscar plano por variante", {
        planName: name,
        toggleId,
        toggleOptionValue,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findAll(): Promise<PlanEntity[]> {
    try {
      logger.debug("Buscando todos os planos");

      const plans = await prisma.plan.findMany({
        orderBy: { price: "asc" },
      });

      return plans.map((plan) => this.mapToEntity(plan));
    } catch (error) {
      logger.error("Erro ao buscar todos os planos", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findActive(): Promise<PlanEntity[]> {
    try {
      logger.debug("Buscando planos ativos");

      const plans = await prisma.plan.findMany({
        where: { isActive: true },
        orderBy: { price: "asc" },
      });

      return plans.map((plan) => this.mapToEntity(plan));
    } catch (error) {
      logger.error("Erro ao buscar planos ativos", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async create(data: Omit<PlanEntity, "id" | "createdAt" | "updatedAt">): Promise<PlanEntity> {
    try {
      logger.info("Criando novo plano", { planName: data.name });

      const plan = await prisma.plan.create({
        data: {
          name: data.name,
          description: data.description ?? null,
          price: data.price,
          durationDays: data.durationDays ?? null,
          freeTrialDurationHours: data.freeTrialDurationHours ?? null,
          maxConnections: data.maxConnections,
          maxBots: data.maxBots,
          maxLeads: data.maxLeads,
          maxFlows: data.maxFlows,
          checkoutUrl: data.checkoutUrl ?? null,
          badge: data.badge ?? null,
          toggleId: data.toggleId ?? null,
          toggleOptionValue: data.toggleOptionValue ?? null,
          customBenefits:
            data.customBenefits === undefined || data.customBenefits === null
              ? Prisma.JsonNull
              : (data.customBenefits as unknown as Prisma.InputJsonValue),
          allowDashboard: data.allowDashboard,
          allowConnections: data.allowConnections,
          allowBots: data.allowBots,
          allowWelcomeGoodbye: data.allowWelcomeGoodbye,
          allowLeads: data.allowLeads,
          allowConversations: data.allowConversations ?? true,
          allowBulkMessage: data.allowBulkMessage,
          allowFlow: data.allowFlow,
          allowMessageClone: data.allowMessageClone,
          allowScheduledMessage: data.allowScheduledMessage,
          allowBackup: data.allowBackup ?? false,
          isActive: data.isActive,
        },
      });

      logger.info("Plano criado com sucesso", { planId: plan.id, planName: plan.name });

      return this.mapToEntity(plan);
    } catch (error) {
      logger.error("Erro ao criar plano", {
        planName: data.name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async update(id: string, data: Partial<Omit<PlanEntity, "id" | "createdAt" | "updatedAt">>): Promise<PlanEntity> {
    try {
      logger.info("Atualizando plano", { 
        planId: id,
        hasCustomBenefits: data.customBenefits !== undefined,
        customBenefitsValue: data.customBenefits === null ? "null" : Array.isArray(data.customBenefits) ? `array[${data.customBenefits.length}]` : "other",
      });

      const prismaData = data;

      const plan = await prisma.plan.update({
        where: { id },
        data: {
          ...(prismaData.name !== undefined && { name: prismaData.name }),
          ...(prismaData.description !== undefined && { description: prismaData.description ?? null }),
          ...(prismaData.price !== undefined && { price: prismaData.price }),
          ...(prismaData.durationDays !== undefined && { durationDays: prismaData.durationDays }),
          ...(prismaData.freeTrialDurationHours !== undefined && { freeTrialDurationHours: prismaData.freeTrialDurationHours }),
          ...(prismaData.maxConnections !== undefined && { maxConnections: prismaData.maxConnections }),
          ...(prismaData.maxBots !== undefined && { maxBots: prismaData.maxBots }),
          ...(prismaData.maxLeads !== undefined && { maxLeads: prismaData.maxLeads }),
          ...(prismaData.maxFlows !== undefined && { maxFlows: prismaData.maxFlows }),
          ...(prismaData.checkoutUrl !== undefined && {
            checkoutUrl: prismaData.checkoutUrl && prismaData.checkoutUrl.trim() !== "" ? prismaData.checkoutUrl : null,
          }),
          ...(prismaData.badge !== undefined && {
            badge: prismaData.badge && prismaData.badge.trim() !== "" ? prismaData.badge : null,
          }),
          ...(prismaData.toggleId !== undefined && { toggleId: prismaData.toggleId ?? null }),
          ...(prismaData.toggleOptionValue !== undefined && { toggleOptionValue: prismaData.toggleOptionValue ?? null }),
          ...(prismaData.customBenefits !== undefined && {
            customBenefits:
              prismaData.customBenefits === null || (Array.isArray(prismaData.customBenefits) && prismaData.customBenefits.length === 0)
                ? Prisma.JsonNull
                : (prismaData.customBenefits as unknown as Prisma.InputJsonValue),
          }),
          ...(prismaData.allowDashboard !== undefined && { allowDashboard: prismaData.allowDashboard }),
          ...(prismaData.allowConnections !== undefined && { allowConnections: prismaData.allowConnections }),
          ...(prismaData.allowBots !== undefined && { allowBots: prismaData.allowBots }),
          ...(prismaData.allowWelcomeGoodbye !== undefined && { allowWelcomeGoodbye: prismaData.allowWelcomeGoodbye }),
          ...(prismaData.allowLeads !== undefined && { allowLeads: prismaData.allowLeads }),
          ...(prismaData.allowConversations !== undefined && { allowConversations: prismaData.allowConversations }),
          ...(prismaData.allowBulkMessage !== undefined && { allowBulkMessage: prismaData.allowBulkMessage }),
          ...(prismaData.allowFlow !== undefined && { allowFlow: prismaData.allowFlow }),
          ...(prismaData.allowMessageClone !== undefined && { allowMessageClone: prismaData.allowMessageClone }),
          ...(prismaData.allowScheduledMessage !== undefined && { allowScheduledMessage: prismaData.allowScheduledMessage }),
          ...(prismaData.allowBackup !== undefined && { allowBackup: prismaData.allowBackup }),
          ...(prismaData.isActive !== undefined && { isActive: prismaData.isActive }),
        },
      });

      logger.info("Plano atualizado com sucesso", { planId: plan.id, planName: plan.name });

      return this.mapToEntity(plan);
    } catch (error) {
      logger.error("Erro ao atualizar plano", {
        planId: id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      logger.info("Desativando plano (soft delete)", { planId: id });

      await prisma.plan.update({
        where: { id },
        data: { isActive: false },
      });

      logger.info("Plano desativado com sucesso", { planId: id });
    } catch (error) {
      logger.error("Erro ao desativar plano", {
        planId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async deletePermanently(id: string): Promise<void> {
    try {
      logger.warn("Excluindo plano permanentemente (hard delete)", { planId: id });

      await prisma.plan.delete({
        where: { id },
      });

      logger.info("Plano excluído permanentemente com sucesso", { planId: id });
    } catch (error) {
      logger.error("Erro ao excluir plano permanentemente", {
        planId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async deleteAllByName(name: string): Promise<void> {
    try {
      logger.info("Desativando todos os planos do grupo (soft delete)", { planName: name });

      await prisma.plan.updateMany({
        where: { name },
        data: { isActive: false },
      });

      logger.info("Todos os planos do grupo desativados com sucesso", { planName: name });
    } catch (error) {
      logger.error("Erro ao desativar planos do grupo", {
        planName: name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async deleteAllByNamePermanently(name: string): Promise<void> {
    try {
      logger.warn("Excluindo permanentemente todos os planos do grupo (hard delete)", { planName: name });

      await prisma.plan.deleteMany({
        where: { name },
      });

      logger.info("Todos os planos do grupo excluídos permanentemente com sucesso", { planName: name });
    } catch (error) {
      logger.error("Erro ao excluir permanentemente planos do grupo", {
        planName: name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Mapeia o modelo Prisma para a entidade de domínio
   */
  private mapToEntity(plan: any): PlanEntity {
    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      price: plan.price,
      durationDays: plan.durationDays ?? null,
      freeTrialDurationHours: plan.freeTrialDurationHours ?? null,
      maxConnections: plan.maxConnections,
      maxBots: plan.maxBots,
      maxLeads: plan.maxLeads,
      maxFlows: plan.maxFlows,
      allowDashboard: plan.allowDashboard,
      allowConnections: plan.allowConnections,
      allowBots: plan.allowBots,
      allowWelcomeGoodbye: plan.allowWelcomeGoodbye,
      allowLeads: plan.allowLeads,
      allowConversations: plan.allowConversations ?? true,
      allowBulkMessage: plan.allowBulkMessage,
      allowFlow: plan.allowFlow,
      allowMessageClone: plan.allowMessageClone,
      allowScheduledMessage: plan.allowScheduledMessage,
      allowBackup: plan.allowBackup ?? false,
      isActive: plan.isActive,
      checkoutUrl: plan.checkoutUrl ?? null,
      badge: plan.badge ?? null,
      toggleId: plan.toggleId ?? null,
      toggleOptionValue: plan.toggleOptionValue ?? null,
      customBenefits: (plan.customBenefits ?? null) as PlanEntity["customBenefits"],
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }
}
