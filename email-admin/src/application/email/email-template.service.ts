/**
 * Serviço de Template de Email
 *
 * Responsável por gerenciar templates de email.
 * Segue princípios DDD e SOLID.
 *
 * @module application/email
 */

import type { EmailTemplateEventType } from "@/domain/email-template/email-template-event-type";
import { EmailTemplate } from "@/domain/email-template/email-template.entity";
import type { IEmailTemplateRepository } from "@/domain/email-template/email-template.repository.interface";
import { auditService } from "@/infrastructure/audit/audit.service";
import { logger } from "@/infrastructure/logger/logger";

export class EmailTemplateService {
  constructor(private readonly emailTemplateRepository: IEmailTemplateRepository) {}

  /**
   * Lista todos os templates de email
   */
  async getAllTemplates(): Promise<EmailTemplate[]> {
    try {
      const templates = await this.emailTemplateRepository.findAll();
      logger.info("Listagem de templates de email realizada", { totalTemplates: templates.length });
      return templates;
    } catch (error) {
      logger.error("Erro ao listar templates de email", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error("Erro ao listar templates de email");
    }
  }

  /**
   * Cria um novo template de email
   */
  async createTemplate(
    data: { name: string; eventType: EmailTemplateEventType; subject: string; htmlContent: string },
    adminId: string
  ): Promise<EmailTemplate> {
    try {
      const template = EmailTemplate.create(data);
      const createdTemplate = await this.emailTemplateRepository.create(template);

      await auditService.log({
        userId: adminId,
        action: "EMAIL_TEMPLATE_CREATED",
        entityType: "EmailTemplate",
        entityId: createdTemplate.id,
        details: {
          name: createdTemplate.name,
          subject: createdTemplate.subject,
        },
      });

      logger.info("Template de email criado com sucesso", {
        templateId: createdTemplate.id,
        adminId,
      });

      return createdTemplate;
    } catch (error) {
      logger.error("Erro ao criar template de email", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Atualiza um template de email
   */
  async updateTemplate(
    templateId: string,
    data: { name?: string; subject?: string; htmlContent?: string; isActive?: boolean },
    adminId: string
  ): Promise<EmailTemplate> {
    try {
      const existingTemplate = await this.emailTemplateRepository.findById(templateId);

      if (!existingTemplate) {
        throw new Error("Template não encontrado");
      }

      const updatedTemplate = await this.emailTemplateRepository.update(templateId, data);

      await auditService.log({
        userId: adminId,
        action: "EMAIL_TEMPLATE_UPDATED",
        entityType: "EmailTemplate",
        entityId: templateId,
        details: {
          updatedFields: Object.keys(data),
          oldData: {
            name: existingTemplate.name,
            subject: existingTemplate.subject,
            isActive: existingTemplate.isActive,
          },
          newData: {
            name: updatedTemplate.name,
            subject: updatedTemplate.subject,
            isActive: updatedTemplate.isActive,
          },
        },
      });

      logger.info("Template de email atualizado com sucesso", {
        templateId,
        updatedFields: Object.keys(data),
        adminId,
      });

      return updatedTemplate;
    } catch (error) {
      logger.error("Erro ao atualizar template de email", {
        templateId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Deleta um template de email
   */
  async deleteTemplate(templateId: string, adminId: string): Promise<void> {
    try {
      const existingTemplate = await this.emailTemplateRepository.findById(templateId);

      if (!existingTemplate) {
        throw new Error("Template não encontrado");
      }

      await this.emailTemplateRepository.delete(templateId);

      await auditService.log({
        userId: adminId,
        action: "EMAIL_TEMPLATE_DELETED",
        entityType: "EmailTemplate",
        entityId: templateId,
        details: {
          deletedTemplateName: existingTemplate.name,
        },
      });

      logger.info("Template de email deletado com sucesso", {
        templateId,
        adminId,
      });
    } catch (error) {
      logger.error("Erro ao deletar template de email", {
        templateId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
}
