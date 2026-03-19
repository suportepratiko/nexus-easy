/**
 * Serviço de Webhook
 *
 * Responsável pela lógica de negócio relacionada a webhooks.
 */

import type { WebhookEntity } from "@/domain/webhook/webhook.entity";
import type { IWebhookRepository } from "@/domain/webhook/webhook.repository.interface";
import { logger } from "@/infrastructure/logger/logger";

export class WebhookService {
  constructor(private readonly webhookRepository: IWebhookRepository) { }

  /**
   * Lista todos os webhooks
   */
  async getAllWebhooks(): Promise<WebhookEntity[]> {
    try {
      logger.debug("Listando todos os webhooks");
      return await this.webhookRepository.findAll();
    } catch (error) {
      logger.error("Erro ao listar webhooks", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Busca um webhook por ID
   */
  async getWebhookById(id: string): Promise<WebhookEntity | null> {
    try {
      logger.debug("Buscando webhook por ID", { webhookId: id });
      return await this.webhookRepository.findById(id);
    } catch (error) {
      logger.error("Erro ao buscar webhook", {
        webhookId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Busca um webhook por secret
   */
  async getWebhookBySecret(secret: string): Promise<WebhookEntity | null> {
    try {
      logger.debug("Buscando webhook por secret");
      return await this.webhookRepository.findBySecret(secret);
    } catch (error) {
      logger.error("Erro ao buscar webhook por secret", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Cria um novo webhook
   */
  async createWebhook(data: {
    name: string;
    isActive?: boolean;
    fieldMappings?: Record<string, any> | null;
    planId?: string | null;
    userStatus?: "active" | "expired" | null;
  }): Promise<WebhookEntity> {
    try {
      logger.info("Criando novo webhook", { webhookName: data.name });

      return await this.webhookRepository.create({
        name: data.name,
        secret: "", // Será gerado no repository
        isActive: data.isActive ?? false,
        fieldMappings: data.fieldMappings ?? null,
        planId: data.planId ?? null,
        userStatus: data.userStatus ?? null,
      });
    } catch (error) {
      logger.error("Erro ao criar webhook", {
        webhookName: data.name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Atualiza um webhook
   */
  async updateWebhook(
    id: string,
    data: {
      name?: string;
      isActive?: boolean;
      fieldMappings?: Record<string, any> | null;
      planId?: string | null;
      userStatus?: "active" | "expired" | null;
    }
  ): Promise<WebhookEntity> {
    try {
      logger.info("Atualizando webhook", { webhookId: id });

      return await this.webhookRepository.update(id, data);
    } catch (error) {
      logger.error("Erro ao atualizar webhook", {
        webhookId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Deleta um webhook
   */
  async deleteWebhook(id: string): Promise<void> {
    try {
      logger.info("Deletando webhook", { webhookId: id });
      await this.webhookRepository.delete(id);
    } catch (error) {
      logger.error("Erro ao deletar webhook", {
        webhookId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
