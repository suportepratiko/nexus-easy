/**
 * Entidade de Domínio: Webhook
 *
 * Representa um webhook configurado para receber dados de plataformas de pagamento.
 */

export interface WebhookFieldMapping {
  [key: string]: any; // Ex: { "email": "customer.email", "planId": "subscription.plan_id", "__periodConfig": {...} }
}

export interface WebhookEntity {
  id: string;
  name: string;
  secret: string;
  isActive: boolean; // false = modo teste, true = modo produção
  fieldMappings: WebhookFieldMapping | null;
  planId: string | null;
  userStatus: "active" | "expired" | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Webhook {
  private constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly secret: string,
    public readonly isActive: boolean,
    public readonly fieldMappings: WebhookFieldMapping | null,
    public readonly planId: string | null,
    public readonly userStatus: "active" | "expired" | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) { }

  static create(
    data: Omit<WebhookEntity, "id" | "createdAt" | "updatedAt" | "secret">,
    secret?: string
  ): Webhook {
    const now = new Date();
    // Secret será gerado no repository se não fornecido
    const webhookSecret = secret || "";
    return new Webhook(
      "",
      data.name,
      webhookSecret,
      data.isActive ?? false,
      data.fieldMappings ?? null,
      data.planId ?? null,
      data.userStatus ?? null,
      now,
      now
    );
  }

  static fromPrisma(data: {
    id: string;
    name: string;
    secret: string;
    isActive: boolean;
    fieldMappings: unknown;
    planId: string | null;
    userStatus: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Webhook {
    return new Webhook(
      data.id,
      data.name,
      data.secret,
      data.isActive,
      (data.fieldMappings as WebhookFieldMapping) ?? null,
      data.planId,
      (data.userStatus as "active" | "expired") ?? null,
      data.createdAt,
      data.updatedAt
    );
  }

  toPrisma(): WebhookEntity {
    return {
      id: this.id,
      name: this.name,
      secret: this.secret,
      isActive: this.isActive,
      fieldMappings: this.fieldMappings,
      planId: this.planId,
      userStatus: this.userStatus,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  updateFieldMappings(mappings: WebhookFieldMapping | null): Webhook {
    return new Webhook(
      this.id,
      this.name,
      this.secret,
      this.isActive,
      mappings,
      this.planId,
      this.userStatus,
      this.createdAt,
      new Date()
    );
  }

  updateSettings(data: {
    name?: string;
    isActive?: boolean;
    planId?: string | null;
    userStatus?: "active" | "expired" | null;
  }): Webhook {
    return new Webhook(
      this.id,
      data.name ?? this.name,
      this.secret,
      data.isActive ?? this.isActive,
      this.fieldMappings,
      data.planId ?? this.planId,
      data.userStatus ?? this.userStatus,
      this.createdAt,
      new Date()
    );
  }
}
