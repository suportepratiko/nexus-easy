/**
 * Entidade de Template de Email
 *
 * Representa um template HTML que pode ser usado para envio de emails.
 * Segue padrão DDD com separação de concerns.
 */

import type { EmailTemplateEventType } from "./email-template-event-type";

export interface EmailTemplateEntity {
  id: string;
  name: string;
  eventType: EmailTemplateEventType;
  subject: string;
  htmlContent: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class EmailTemplate {
  private constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly eventType: EmailTemplateEventType,
    public readonly subject: string,
    public readonly htmlContent: string,
    public readonly isActive: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  static create(
    data: Omit<EmailTemplateEntity, "id" | "createdAt" | "updatedAt" | "isActive">
  ): EmailTemplate {
    const now = new Date();
    return new EmailTemplate(
      "",
      data.name,
      data.eventType,
      data.subject,
      data.htmlContent,
      true, // Default ativo
      now,
      now
    );
  }

  static fromPrisma(data: EmailTemplateEntity): EmailTemplate {
    return new EmailTemplate(
      data.id,
      data.name,
      data.eventType,
      data.subject,
      data.htmlContent,
      data.isActive,
      data.createdAt,
      data.updatedAt
    );
  }

  toPrisma(): EmailTemplateEntity {
    return {
      id: this.id,
      name: this.name,
      eventType: this.eventType,
      subject: this.subject,
      htmlContent: this.htmlContent,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
