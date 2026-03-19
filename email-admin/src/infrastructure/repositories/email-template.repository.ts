/**
 * Repositório de Email Template
 *
 * Implementação da interface IEmailTemplateRepository usando Prisma.
 * Responsável por persistência de templates de email.
 */

import type { EmailTemplateEventType } from "@/domain/email-template/email-template-event-type";
import { EmailTemplate } from "@/domain/email-template/email-template.entity";
import type { IEmailTemplateRepository } from "@/domain/email-template/email-template.repository.interface";
import { handleDatabaseError } from "../database/error-handler";
import { prisma } from "../database/prisma";
import { logger } from "../logger/logger";

export class EmailTemplateRepository implements IEmailTemplateRepository {
  async findAll(): Promise<EmailTemplate[]> {
    try {
      const templates = await prisma.emailTemplate.findMany({
        orderBy: { createdAt: "desc" },
      });

      return templates.map((template) =>
        EmailTemplate.fromPrisma({
          id: template.id,
          name: template.name,
          eventType: template.eventType as any,
          subject: template.subject,
          htmlContent: template.htmlContent,
          isActive: template.isActive,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
        })
      );
    } catch (error) {
      if (handleDatabaseError(error, "EmailTemplateRepository.findAll", [])) {
        return [];
      }
      logger.error("Erro ao buscar templates de email", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findById(id: string): Promise<EmailTemplate | null> {
    try {
      const template = await prisma.emailTemplate.findUnique({
        where: { id },
      });

      if (!template) return null;

      return EmailTemplate.fromPrisma({
        id: template.id,
        name: template.name,
        eventType: template.eventType as any,
        subject: template.subject,
        htmlContent: template.htmlContent,
        isActive: template.isActive,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      });
    } catch (error) {
      if (handleDatabaseError(error, "EmailTemplateRepository.findById", null)) {
        return null;
      }
      logger.error("Erro ao buscar template de email por id", {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findByEventType(eventType: EmailTemplateEventType): Promise<EmailTemplate | null> {
    try {
      const template = await prisma.emailTemplate.findFirst({
        where: {
          eventType,
          isActive: true,
        },
        orderBy: { createdAt: "desc" },
      });

      if (!template) return null;

      return EmailTemplate.fromPrisma({
        id: template.id,
        name: template.name,
        eventType: template.eventType as any,
        subject: template.subject,
        htmlContent: template.htmlContent,
        isActive: template.isActive,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      });
    } catch (error) {
      if (handleDatabaseError(error, "EmailTemplateRepository.findByEventType", null)) {
        return null;
      }
      logger.error("Erro ao buscar template de email por tipo de evento", {
        eventType,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async create(
    data: Omit<EmailTemplate, "id" | "createdAt" | "updatedAt">
  ): Promise<EmailTemplate> {
    try {
      const template = await prisma.emailTemplate.create({
        data: {
          name: data.name,
          eventType: data.eventType,
          subject: data.subject,
          htmlContent: data.htmlContent,
          isActive: data.isActive,
        },
      });

      return EmailTemplate.fromPrisma({
        id: template.id,
        name: template.name,
        eventType: template.eventType as any,
        subject: template.subject,
        htmlContent: template.htmlContent,
        isActive: template.isActive,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      });
    } catch (error) {
      logger.error("Erro ao criar template de email", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async update(
    id: string,
    data: Partial<
      Pick<EmailTemplate, "name" | "eventType" | "subject" | "htmlContent" | "isActive">
    >
  ): Promise<EmailTemplate> {
    try {
      const template = await prisma.emailTemplate.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.eventType !== undefined && { eventType: data.eventType }),
          ...(data.subject !== undefined && { subject: data.subject }),
          ...(data.htmlContent !== undefined && { htmlContent: data.htmlContent }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
      });

      return EmailTemplate.fromPrisma({
        id: template.id,
        name: template.name,
        eventType: template.eventType as any,
        subject: template.subject,
        htmlContent: template.htmlContent,
        isActive: template.isActive,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      });
    } catch (error) {
      logger.error("Erro ao atualizar template de email", {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await prisma.emailTemplate.delete({
        where: { id },
      });
    } catch (error) {
      logger.error("Erro ao deletar template de email", {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
