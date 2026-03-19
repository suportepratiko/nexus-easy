/**
 * Router de Webhooks
 *
 * Endpoints para gerenciamento de webhooks.
 */

import { WebhookService } from "@/application/webhook/webhook.service";
import { WebhookRepository } from "@/infrastructure/repositories/webhook.repository";
import { WebhookPayloadRepository } from "@/infrastructure/repositories/webhook-payload.repository";
import { logger } from "@/infrastructure/logger/logger";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, createTRPCRouter } from "../trpc";

const createWebhookSchema = z.object({
  name: z.string().min(1, "Nome do webhook é obrigatório"),
  isActive: z.boolean().default(false),
  fieldMappings: z.record(z.string(), z.any()).optional().nullable(),
  planId: z.string().optional().nullable(),
  userStatus: z.enum(["active", "expired"]).optional().nullable(),
});

const updateWebhookSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  fieldMappings: z.record(z.string(), z.any()).optional().nullable(),
  planId: z.string().optional().nullable(),
  userStatus: z.enum(["active", "expired"]).optional().nullable(),
});

function makeService() {
  const repository = new WebhookRepository();
  return new WebhookService(repository);
}

export const webhookRouter = createTRPCRouter({
  /**
   * Lista todos os webhooks (apenas para admins)
   */
  getAllWebhooks: adminProcedure.query(async () => {
    try {
      logger.info("Listando todos os webhooks");

      const service = makeService();
      const webhooks = await service.getAllWebhooks();

      logger.info("Webhooks listados com sucesso", { count: webhooks.length });

      return webhooks;
    } catch (error) {
      logger.error("Erro ao listar webhooks", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao listar webhooks",
      });
    }
  }),

  /**
   * Busca um webhook por ID
   */
  getWebhookById: adminProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    try {
      logger.info("Buscando webhook por ID", { webhookId: input.id });

      const service = makeService();
      const webhook = await service.getWebhookById(input.id);

      if (!webhook) {
        logger.warn("Webhook não encontrado", { webhookId: input.id });
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Webhook não encontrado",
        });
      }

      logger.info("Webhook encontrado", { webhookId: webhook.id, webhookName: webhook.name });

      return webhook;
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      logger.error("Erro ao buscar webhook por ID", {
        webhookId: input.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao buscar webhook",
      });
    }
  }),

  /**
   * Cria um novo webhook (apenas para admins)
   */
  createWebhook: adminProcedure.input(createWebhookSchema).mutation(async ({ input }) => {
    try {
      logger.info("Criando novo webhook", { webhookName: input.name });

      const service = makeService();
      const webhook = await service.createWebhook({
        name: input.name,
        isActive: input.isActive ?? false,
        fieldMappings: input.fieldMappings ?? null,
        planId: input.planId ?? null,
        userStatus: input.userStatus ?? null,
      });

      logger.info("Webhook criado com sucesso", { webhookId: webhook.id, webhookName: webhook.name });

      return webhook;
    } catch (error) {
      logger.error("Erro ao criar webhook", {
        webhookName: input.name,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao criar webhook",
      });
    }
  }),

  /**
   * Atualiza um webhook existente (apenas para admins)
   */
  updateWebhook: adminProcedure.input(updateWebhookSchema).mutation(async ({ input }) => {
    try {
      const { id, ...data } = input;

      logger.info("Atualizando webhook", {
        webhookId: id,
        hasFieldMappings: data.fieldMappings !== undefined,
        fieldMappingsType: typeof data.fieldMappings,
        fieldMappingsIsNull: data.fieldMappings === null,
        fieldMappingsKeys: data.fieldMappings ? Object.keys(data.fieldMappings) : [],
      });

      const service = makeService();

      // ✅ CRÍTICO: Se fieldMappings não foi fornecido (undefined), não passar para o service
      // Isso garante que os mapeamentos existentes sejam preservados
      const updateData: {
        name?: string;
        isActive?: boolean;
        fieldMappings?: Record<string, any> | null;
        planId?: string | null;
        userStatus?: "active" | "expired" | null;
      } = {};

      if (data.name !== undefined) updateData.name = data.name;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;
      // ✅ Só atualizar fieldMappings se foi explicitamente fornecido (não undefined)
      if (data.fieldMappings !== undefined) updateData.fieldMappings = data.fieldMappings;
      if (data.planId !== undefined) updateData.planId = data.planId;
      if (data.userStatus !== undefined) updateData.userStatus = data.userStatus;

      const webhook = await service.updateWebhook(id, updateData);

      logger.info("Webhook atualizado com sucesso", {
        webhookId: webhook.id,
        webhookName: webhook.name,
        fieldMappingsAfterUpdate: webhook.fieldMappings ? Object.keys(webhook.fieldMappings) : [],
      });

      return webhook;
    } catch (error) {
      logger.error("Erro ao atualizar webhook", {
        webhookId: input.id,
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
        message: "Erro ao atualizar webhook",
      });
    }
  }),

  /**
   * Remove um webhook (apenas para admins)
   */
  deleteWebhook: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    try {
      logger.info("Removendo webhook", { webhookId: input.id });

      const service = makeService();
      await service.deleteWebhook(input.id);

      logger.info("Webhook removido com sucesso", { webhookId: input.id });

      return { success: true };
    } catch (error) {
      logger.error("Erro ao remover webhook", {
        webhookId: input.id,
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
        message: "Erro ao remover webhook",
      });
    }
  }),

  /**
   * Lista payloads de um webhook
   */
  getWebhookPayloads: adminProcedure
    .input(
      z.object({
        webhookId: z.string(),
        limit: z.number().int().min(1).max(100).default(50),
        processed: z.boolean().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        logger.info("Buscando payloads do webhook", { webhookId: input.webhookId });

        const payloadRepository = new WebhookPayloadRepository();
        const payloads = await payloadRepository.findByWebhookId(input.webhookId, {
          limit: input.limit,
          processed: input.processed,
        });

        logger.info("Payloads encontrados", { count: payloads.length });

        return payloads;
      } catch (error) {
        logger.error("Erro ao buscar payloads", {
          webhookId: input.webhookId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao buscar payloads",
        });
      }
    }),

  /**
   * Lista payloads de todos os webhooks (histórico geral)
   */
  getAllWebhookPayloads: adminProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(500).default(100),
        processed: z.boolean().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      try {
        logger.info("Buscando payloads de todos os webhooks", { limit: input?.limit });

        const payloadRepository = new WebhookPayloadRepository();
        const payloads = await payloadRepository.findAll({
          limit: input?.limit || 100,
          processed: input?.processed,
        });

        logger.info("Payloads encontrados", { count: payloads.length });

        return payloads;
      } catch (error) {
        logger.error("Erro ao buscar payloads de todos os webhooks", {
          error: error instanceof Error ? error.message : String(error),
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao buscar payloads",
        });
      }
    }),

  /**
   * Remove um payload de webhook
   */
  deleteWebhookPayload: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    try {
      logger.info("Removendo payload do webhook", { payloadId: input.id });

      const payloadRepository = new WebhookPayloadRepository();
      await payloadRepository.delete(input.id);

      logger.info("Payload removido com sucesso", { payloadId: input.id });

      return { success: true };
    } catch (error) {
      logger.error("Erro ao remover payload", {
        payloadId: input.id,
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
        message: "Erro ao remover payload",
      });
    }
  }),
});
