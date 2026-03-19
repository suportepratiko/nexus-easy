/**
 * Repositório de Webhook (Infraestrutura)
 *
 * Implementação do repositório de webhooks usando Prisma.
 */

import type { WebhookEntity } from "@/domain/webhook/webhook.entity";
import type { IWebhookRepository } from "@/domain/webhook/webhook.repository.interface";
import { Webhook } from "@/domain/webhook/webhook.entity";
import { logger } from "@/infrastructure/logger/logger";
import { prisma } from "@/infrastructure/database/prisma";

export class WebhookRepository implements IWebhookRepository {
  async findById(id: string): Promise<WebhookEntity | null> {
    try {
      logger.debug("Buscando webhook por ID", { webhookId: id });

      const webhook = await prisma.webhook.findUnique({
        where: { id },
      });

      if (!webhook) {
        logger.debug("Webhook não encontrado", { webhookId: id });
        return null;
      }

      // Log detalhado do webhook carregado do Prisma
      logger.info("🔍 [WEBHOOK_REPO] Webhook carregado do Prisma", {
        webhookId: id,
        fieldMappingsType: typeof webhook.fieldMappings,
        fieldMappingsIsNull: webhook.fieldMappings === null,
        fieldMappingsValue: webhook.fieldMappings ? JSON.stringify(webhook.fieldMappings) : "null",
        fieldMappingsKeys: webhook.fieldMappings && typeof webhook.fieldMappings === "object" ? Object.keys(webhook.fieldMappings) : [],
      });

      const webhookEntity = Webhook.fromPrisma(webhook).toPrisma();

      // Log detalhado após conversão
      logger.info("✅ [WEBHOOK_REPO] Webhook convertido para entidade", {
        webhookId: id,
        fieldMappingsType: typeof webhookEntity.fieldMappings,
        fieldMappingsIsNull: webhookEntity.fieldMappings === null,
        fieldMappingsValue: webhookEntity.fieldMappings ? JSON.stringify(webhookEntity.fieldMappings) : "null",
        fieldMappingsKeys: webhookEntity.fieldMappings ? Object.keys(webhookEntity.fieldMappings) : [],
      });

      return webhookEntity;
    } catch (error) {
      logger.error("Erro ao buscar webhook por ID", {
        webhookId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findBySecret(secret: string): Promise<WebhookEntity | null> {
    try {
      logger.debug("Buscando webhook por secret", { secret: secret.substring(0, 10) + "..." });

      const webhook = await prisma.webhook.findUnique({
        where: { secret },
      });

      if (!webhook) {
        logger.debug("Webhook não encontrado", { secret: secret.substring(0, 10) + "..." });
        return null;
      }

      return Webhook.fromPrisma(webhook).toPrisma();
    } catch (error) {
      logger.error("Erro ao buscar webhook por secret", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findAll(): Promise<WebhookEntity[]> {
    try {
      logger.debug("Buscando todos os webhooks");

      const webhooks = await prisma.webhook.findMany({
        orderBy: { createdAt: "desc" },
      });

      return webhooks.map((webhook) => Webhook.fromPrisma(webhook).toPrisma());
    } catch (error) {
      logger.error("Erro ao buscar todos os webhooks", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async create(data: Omit<WebhookEntity, "id" | "createdAt" | "updatedAt">): Promise<WebhookEntity> {
    try {
      logger.info("Criando novo webhook", { webhookName: data.name });

      // Gera um secret único
      const secret = `wh_${Date.now()}_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;

      const webhook = Webhook.create(data, secret);
      const created = await prisma.webhook.create({
        data: {
          name: webhook.name,
          secret: webhook.secret,
          isActive: webhook.isActive,
          fieldMappings: webhook.fieldMappings as any,
          planId: webhook.planId,
          userStatus: webhook.userStatus,
        },
      });

      return Webhook.fromPrisma(created).toPrisma();
    } catch (error) {
      logger.error("Erro ao criar webhook", {
        webhookName: data.name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async update(id: string, data: Partial<Omit<WebhookEntity, "id" | "createdAt" | "updatedAt">>): Promise<WebhookEntity> {
    try {
      logger.info("Atualizando webhook", { webhookId: id });

      const existing = await prisma.webhook.findUnique({ where: { id } });
      if (!existing) {
        throw new Error("Webhook não encontrado");
      }

      const webhook = Webhook.fromPrisma(existing);

      // ✅ PRESERVAR fieldMappings existentes se não foram explicitamente fornecidos
      // Isso garante que os mapeamentos nunca sejam perdidos acidentalmente
      const fieldMappingsToUse = data.fieldMappings !== undefined
        ? data.fieldMappings
        : webhook.fieldMappings; // Preservar mapeamentos existentes

      const updatedWebhook = webhook.updateSettings({
        name: data.name,
        isActive: data.isActive,
        planId: data.planId,
        userStatus: data.userStatus,
      });

      // ✅ SEMPRE atualizar fieldMappings (preservando se não foi fornecido)
      if (fieldMappingsToUse !== undefined) {
        logger.info("💾 [WEBHOOK_UPDATE] Salvando fieldMappings no banco", {
          webhookId: id,
          fieldMappingsProvided: data.fieldMappings !== undefined,
          fieldMappingsPreserved: data.fieldMappings === undefined,
          fieldMappingsType: typeof fieldMappingsToUse,
          fieldMappingsIsNull: fieldMappingsToUse === null,
          fieldMappingsKeys: fieldMappingsToUse ? Object.keys(fieldMappingsToUse) : [],
          fieldMappingsValue: fieldMappingsToUse ? JSON.stringify(fieldMappingsToUse) : "null",
        });

        const withMappings = updatedWebhook.updateFieldMappings(fieldMappingsToUse as any);
        const updated = await prisma.webhook.update({
          where: { id },
          data: {
            name: withMappings.name,
            isActive: withMappings.isActive,
            fieldMappings: withMappings.fieldMappings as any,
            planId: withMappings.planId,
            userStatus: withMappings.userStatus,
          },
        });

        logger.info("✅ [WEBHOOK_UPDATE] fieldMappings salvos com sucesso no banco", {
          webhookId: id,
          savedFieldMappingsType: typeof updated.fieldMappings,
          savedFieldMappingsIsNull: updated.fieldMappings === null,
          savedFieldMappingsKeys: updated.fieldMappings ? Object.keys(updated.fieldMappings as Record<string, unknown>) : [],
          savedFieldMappingsValue: updated.fieldMappings ? JSON.stringify(updated.fieldMappings) : "null",
        });

        return Webhook.fromPrisma(updated).toPrisma();
      }

      // ✅ PRESERVAR fieldMappings mesmo quando não estão sendo atualizados explicitamente
      const updated = await prisma.webhook.update({
        where: { id },
        data: {
          name: updatedWebhook.name,
          isActive: updatedWebhook.isActive,
          planId: updatedWebhook.planId,
          userStatus: updatedWebhook.userStatus,
          // ✅ CRÍTICO: Sempre preservar fieldMappings existentes se não foram fornecidos
          fieldMappings: (fieldMappingsToUse ?? updatedWebhook.fieldMappings) as any,
        },
      });

      return Webhook.fromPrisma(updated).toPrisma();
    } catch (error) {
      logger.error("Erro ao atualizar webhook", {
        webhookId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      logger.info("Deletando webhook", { webhookId: id });

      await prisma.webhook.delete({
        where: { id },
      });
    } catch (error) {
      logger.error("Erro ao deletar webhook", {
        webhookId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
