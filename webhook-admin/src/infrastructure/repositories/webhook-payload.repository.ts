/**
 * Repositório de WebhookPayload (Infraestrutura)
 *
 * Implementação do repositório de payloads de webhook usando Prisma.
 */

import type { WebhookPayloadEntity } from "@/domain/webhook/webhook-payload.entity";
import type { IWebhookPayloadRepository } from "@/domain/webhook/webhook.repository.interface";
import { WebhookPayload } from "@/domain/webhook/webhook-payload.entity";
import { logger } from "@/infrastructure/logger/logger";
import { prisma } from "@/infrastructure/database/prisma";

export class WebhookPayloadRepository implements IWebhookPayloadRepository {
  async findById(id: string): Promise<WebhookPayloadEntity | null> {
    try {
      logger.debug("Buscando payload por ID", { payloadId: id });

      const payload = await prisma.webhookPayload.findUnique({
        where: { id },
      });

      if (!payload) {
        logger.debug("Payload não encontrado", { payloadId: id });
        return null;
      }

      return WebhookPayload.fromPrisma(payload).toPrisma();
    } catch (error) {
      logger.error("Erro ao buscar payload por ID", {
        payloadId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findByWebhookId(
    webhookId: string,
    options?: { limit?: number; processed?: boolean }
  ): Promise<WebhookPayloadEntity[]> {
    try {
      logger.debug("Buscando payloads por webhookId", { webhookId, options });

      const where: { webhookId: string; processed?: boolean } = { webhookId };
      if (options?.processed !== undefined) {
        where.processed = options.processed;
      }

      const payloads = await prisma.webhookPayload.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: options?.limit,
      });

      return payloads.map((payload) => WebhookPayload.fromPrisma(payload).toPrisma());
    } catch (error) {
      logger.error("Erro ao buscar payloads por webhookId", {
        webhookId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async create(data: Omit<WebhookPayloadEntity, "id" | "createdAt">): Promise<WebhookPayloadEntity> {
    try {
      logger.debug("Criando novo payload", { webhookId: data.webhookId });

      const payload = WebhookPayload.create(data);
      const created = await prisma.webhookPayload.create({
        data: {
          webhookId: payload.webhookId,
          payload: payload.payload as any, // ✅ Type assertion para Prisma.JsonValue
          headers: payload.headers as any,
          method: payload.method,
          ipAddress: payload.ipAddress,
          userAgent: payload.userAgent,
          processed: payload.processed,
          processedAt: payload.processedAt,
          error: payload.error,
          processDetails: payload.processDetails as any, // ✅ Type assertion para Prisma.JsonValue
          responseBody: payload.responseBody as any, // ✅ Type assertion para Prisma.JsonValue
        },
      });

      return WebhookPayload.fromPrisma(created).toPrisma();
    } catch (error) {
      logger.error("Erro ao criar payload", {
        webhookId: data.webhookId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async update(id: string, data: Partial<Omit<WebhookPayloadEntity, "id" | "createdAt">>): Promise<WebhookPayloadEntity> {
    try {
      logger.debug("Atualizando payload", { payloadId: id });

      const existing = await prisma.webhookPayload.findUnique({ where: { id } });
      if (!existing) {
        throw new Error("Payload não encontrado");
      }

      // Preparar dados de atualização diretamente dos parâmetros
      const updateData: {
        processed?: boolean;
        processedAt?: Date | null;
        error?: string | null;
        processDetails?: any; // ✅ Type assertion para Prisma.JsonValue
        responseBody?: any; // ✅ Type assertion para Prisma.JsonValue
      } = {};

      // Atualizar campos se fornecidos
      if (data.processed !== undefined) {
        updateData.processed = data.processed;
        // Se marcando como processado e processedAt não foi fornecido, usar data atual
        if (data.processed && data.processedAt === undefined) {
          updateData.processedAt = new Date();
        } else if (data.processedAt !== undefined) {
          updateData.processedAt = data.processedAt;
        } else if (!data.processed) {
          // Se marcando como não processado, limpar processedAt
          updateData.processedAt = null;
        }
      }

      if (data.error !== undefined) {
        updateData.error = data.error;
      }

      if (data.processDetails !== undefined) {
        updateData.processDetails = data.processDetails as any; // ✅ Type assertion para Prisma.JsonValue
      }

      if (data.responseBody !== undefined) {
        updateData.responseBody = data.responseBody as any; // ✅ Type assertion para Prisma.JsonValue
      }

      const updated = await prisma.webhookPayload.update({
        where: { id },
        data: updateData,
      });

      return WebhookPayload.fromPrisma(updated).toPrisma();
    } catch (error) {
      logger.error("Erro ao atualizar payload", {
        payloadId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findAll(options?: { limit?: number; processed?: boolean }): Promise<WebhookPayloadEntity[]> {
    try {
      logger.debug("Buscando todos os payloads", { options });

      const where: { processed?: boolean } = {};
      if (options?.processed !== undefined) {
        where.processed = options.processed;
      }

      const payloads = await prisma.webhookPayload.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: options?.limit,
      });

      return payloads.map((payload) => WebhookPayload.fromPrisma(payload).toPrisma());
    } catch (error) {
      logger.error("Erro ao buscar todos os payloads", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      logger.debug("Deletando payload", { payloadId: id });

      const existing = await prisma.webhookPayload.findUnique({ where: { id } });
      if (!existing) {
        throw new Error("Payload não encontrado");
      }

      await prisma.webhookPayload.delete({
        where: { id },
      });

      logger.debug("Payload deletado com sucesso", { payloadId: id });
    } catch (error) {
      logger.error("Erro ao deletar payload", {
        payloadId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
