/**
 * Entidade de Domínio: Plan
 *
 * Representa um plano de assinatura do sistema com todas as limitações e permissões.
 */

export interface PlanEntity {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  durationDays?: number | null;
  freeTrialDurationHours?: number | null; // Duração do plano gratuito em horas
  maxConnections: number;
  maxBots: number | null;
  maxLeads: number | null;
  maxFlows: number | null;
  // Funcionalidades permitidas
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
  allowBackup: boolean;
  isActive: boolean;
  checkoutUrl?: string | null;
  badge?: string | null;
  toggleId?: string | null;
  toggleOptionValue?: string | null; // Valor da opção do toggle (ex: "monthly", "quarterly")
  customBenefits?: Array<{ text: string; hasFeature: boolean } | string> | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Plan {
  constructor(private readonly data: PlanEntity) {}

  get id(): string {
    return this.data.id;
  }

  get name(): string {
    return this.data.name;
  }

  get description(): string | null | undefined {
    return this.data.description;
  }

  get price(): number {
    return this.data.price;
  }

  get durationDays(): number | null | undefined {
    return this.data.durationDays;
  }

  get maxConnections(): number {
    return this.data.maxConnections;
  }

  get maxBots(): number | null {
    return this.data.maxBots;
  }

  get maxLeads(): number | null {
    return this.data.maxLeads;
  }

  get maxFlows(): number | null {
    return this.data.maxFlows;
  }

  get allowDashboard(): boolean {
    return this.data.allowDashboard;
  }

  get allowConnections(): boolean {
    return this.data.allowConnections;
  }

  get allowBots(): boolean {
    return this.data.allowBots;
  }

  get allowWelcomeGoodbye(): boolean {
    return this.data.allowWelcomeGoodbye;
  }

  get allowLeads(): boolean {
    return this.data.allowLeads;
  }

  get allowConversations(): boolean {
    return this.data.allowConversations;
  }

  get allowBulkMessage(): boolean {
    return this.data.allowBulkMessage;
  }

  get allowFlow(): boolean {
    return this.data.allowFlow;
  }

  get allowMessageClone(): boolean {
    return this.data.allowMessageClone;
  }

  get allowScheduledMessage(): boolean {
    return this.data.allowScheduledMessage;
  }


  get allowBackup(): boolean {
    return this.data.allowBackup;
  }

  get isActive(): boolean {
    return this.data.isActive;
  }

  get checkoutUrl(): string | null | undefined {
    return this.data.checkoutUrl;
  }

  get badge(): string | null | undefined {
    return this.data.badge;
  }

  get toggleId(): string | null | undefined {
    return this.data.toggleId;
  }

  get customBenefits(): Array<{ text: string; hasFeature: boolean } | string> | null | undefined {
    return this.data.customBenefits;
  }

  get createdAt(): Date {
    return this.data.createdAt;
  }

  get updatedAt(): Date {
    return this.data.updatedAt;
  }

  /**
   * Verifica se o plano permite uma funcionalidade específica
   */
  allowsFeature(feature: keyof Pick<PlanEntity, "allowDashboard" | "allowConnections" | "allowBots" | "allowWelcomeGoodbye" | "allowLeads" | "allowConversations" | "allowBulkMessage" | "allowFlow" | "allowMessageClone" | "allowScheduledMessage">): boolean {
    return this.data[feature] ?? false;
  }

  /**
   * Verifica se o plano tem limite ilimitado para um recurso
   */
  isUnlimited(resource: "bots" | "leads" | "flows"): boolean {
    switch (resource) {
      case "bots":
        return this.data.maxBots === null;
      case "leads":
        return this.data.maxLeads === null;
      case "flows":
        return this.data.maxFlows === null;
      default:
        return false;
    }
  }

  toJSON(): PlanEntity {
    return { ...this.data };
  }
}
