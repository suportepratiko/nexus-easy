/**
 * Interface do Repositório de Webhook
 *
 * Define os contratos para persistência de webhooks.
 */

import type { WebhookEntity } from "./webhook.entity";
import type { WebhookPayloadEntity } from "./webhook-payload.entity";

export interface IWebhookRepository {
  findById(id: string): Promise<WebhookEntity | null>;
  findBySecret(secret: string): Promise<WebhookEntity | null>;
  findAll(): Promise<WebhookEntity[]>;
  create(data: Omit<WebhookEntity, "id" | "createdAt" | "updatedAt">): Promise<WebhookEntity>;
  update(id: string, data: Partial<Omit<WebhookEntity, "id" | "createdAt" | "updatedAt">>): Promise<WebhookEntity>;
  delete(id: string): Promise<void>;
}

export interface IWebhookPayloadRepository {
  findById(id: string): Promise<WebhookPayloadEntity | null>;
  findByWebhookId(webhookId: string, options?: { limit?: number; processed?: boolean }): Promise<WebhookPayloadEntity[]>;
  create(data: Omit<WebhookPayloadEntity, "id" | "createdAt">): Promise<WebhookPayloadEntity>;
  update(id: string, data: Partial<Omit<WebhookPayloadEntity, "id" | "createdAt">>): Promise<WebhookPayloadEntity>;
  delete(id: string): Promise<void>;
}
