/**
 * Interface do Repositório de Email Template
 *
 * Define o contrato para operações de persistência de templates de email.
 * Segue princípio de inversão de dependência (SOLID).
 */

import type { EmailTemplate } from "./email-template.entity";

import type { EmailTemplateEventType } from "./email-template-event-type";

export interface IEmailTemplateRepository {
  findAll(): Promise<EmailTemplate[]>;
  findById(id: string): Promise<EmailTemplate | null>;
  findByEventType(eventType: EmailTemplateEventType): Promise<EmailTemplate | null>;
  create(data: Omit<EmailTemplate, "id" | "createdAt" | "updatedAt">): Promise<EmailTemplate>;
  update(
    id: string,
    data: Partial<
      Pick<EmailTemplate, "name" | "eventType" | "subject" | "htmlContent" | "isActive">
    >
  ): Promise<EmailTemplate>;
  delete(id: string): Promise<void>;
}
