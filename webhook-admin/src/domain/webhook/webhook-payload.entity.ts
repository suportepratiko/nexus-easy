/**
 * Entidade de Domínio: WebhookPayload
 *
 * Representa um payload recebido de um webhook.
 */

export interface WebhookPayloadEntity {
  id: string;
  webhookId: string;
  payload: unknown; // JSON payload
  headers: Record<string, string> | null;
  method: string;
  ipAddress: string | null;
  userAgent: string | null;
  processed: boolean;
  processedAt: Date | null;
  error: string | null;
  processDetails: Record<string, unknown> | null;
  responseBody: unknown | null;
  createdAt: Date;
}

export class WebhookPayload {
  private constructor(
    public readonly id: string,
    public readonly webhookId: string,
    public readonly payload: unknown,
    public readonly headers: Record<string, string> | null,
    public readonly method: string,
    public readonly ipAddress: string | null,
    public readonly userAgent: string | null,
    public readonly processed: boolean,
    public readonly processedAt: Date | null,
    public readonly error: string | null,
    public readonly processDetails: Record<string, unknown> | null,
    public readonly responseBody: unknown | null,
    public readonly createdAt: Date
  ) {}

  static create(data: Omit<WebhookPayloadEntity, "id" | "createdAt" | "processed" | "processedAt">): WebhookPayload {
    const now = new Date();
    return new WebhookPayload(
      "",
      data.webhookId,
      data.payload,
      data.headers ?? null,
      data.method ?? "POST",
      data.ipAddress ?? null,
      data.userAgent ?? null,
      false,
      null,
      null,
      null,
      null,
      now
    );
  }

  static fromPrisma(data: {
    id: string;
    webhookId: string;
    payload: unknown;
    headers: unknown;
    method: string;
    ipAddress: string | null;
    userAgent: string | null;
    processed: boolean;
    processedAt: Date | null;
    error: string | null;
    processDetails: unknown;
    responseBody: unknown;
    createdAt: Date;
  }): WebhookPayload {
    return new WebhookPayload(
      data.id,
      data.webhookId,
      data.payload,
      (data.headers as Record<string, string>) ?? null,
      data.method,
      data.ipAddress,
      data.userAgent,
      data.processed,
      data.processedAt,
      data.error,
      (data.processDetails as Record<string, unknown>) ?? null,
      data.responseBody ?? null,
      data.createdAt
    );
  }

  toPrisma(): WebhookPayloadEntity {
    return {
      id: this.id,
      webhookId: this.webhookId,
      payload: this.payload,
      headers: this.headers,
      method: this.method,
      ipAddress: this.ipAddress,
      userAgent: this.userAgent,
      processed: this.processed,
      processedAt: this.processedAt,
      error: this.error,
      processDetails: this.processDetails,
      responseBody: this.responseBody,
      createdAt: this.createdAt,
    };
  }

  markAsProcessed(): WebhookPayload {
    return new WebhookPayload(
      this.id,
      this.webhookId,
      this.payload,
      this.headers,
      this.method,
      this.ipAddress,
      this.userAgent,
      true,
      new Date(),
      null,
      this.processDetails,
      this.responseBody,
      this.createdAt
    );
  }

  markAsError(error: string): WebhookPayload {
    return new WebhookPayload(
      this.id,
      this.webhookId,
      this.payload,
      this.headers,
      this.method,
      this.ipAddress,
      this.userAgent,
      false,
      null,
      error,
      this.processDetails,
      this.responseBody,
      this.createdAt
    );
  }
}
