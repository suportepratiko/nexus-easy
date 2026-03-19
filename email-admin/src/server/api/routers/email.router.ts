/**
 * Router de Gerenciamento de Emails
 *
 * Endpoints para gerenciar templates de email e configurações SMTP.
 * Apenas administradores podem acessar estes endpoints.
 *
 * Segue padrões:
 * - DDD (Domain Driven Design)
 * - SOLID
 * - Validação com Zod
 * - Auditoria de ações sensíveis
 */

import { EmailTemplateEventType } from "@/domain/email-template/email-template-event-type";
import { logger } from "@/infrastructure/logger/logger";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, createTRPCRouter } from "../trpc";

// Schemas para Email Templates
const createEmailTemplateSchema = z.object({
  name: z.string().min(1, "Nome do template é obrigatório"),
  eventType: z.nativeEnum(EmailTemplateEventType, {
    errorMap: () => ({ message: "Tipo de evento inválido" }),
  }),
  subject: z.string().min(1, "Assunto é obrigatório"),
  htmlContent: z.string().min(1, "Conteúdo HTML é obrigatório"),
});

const updateEmailTemplateSchema = z.object({
  id: z.string().min(1, "ID do template é obrigatório"),
  name: z.string().min(1, "Nome do template é obrigatório").optional(),
  eventType: z.nativeEnum(EmailTemplateEventType).optional(),
  subject: z.string().min(1, "Assunto é obrigatório").optional(),
  htmlContent: z.string().min(1, "Conteúdo HTML é obrigatório").optional(),
  isActive: z.boolean().optional(),
});

const deleteEmailTemplateSchema = z.object({
  id: z.string().min(1, "ID do template é obrigatório"),
});

// Schemas para SMTP Configs
const createSmtpConfigSchema = z.object({
  name: z.string().min(1, "Nome da configuração é obrigatório"),
  host: z.string().min(1, "Host SMTP é obrigatório"),
  port: z.number().int().min(1).max(65535, "Porta inválida"),
  secure: z.boolean().default(false),
  authUser: z.string().min(1, "Usuário de autenticação é obrigatório"),
  authPassword: z.string().min(1, "Senha de autenticação é obrigatória"),
  fromEmail: z.string().email("Email remetente inválido"),
  fromName: z.string().optional(),
});

const updateSmtpConfigSchema = z.object({
  id: z.string().min(1, "ID da configuração é obrigatório"),
  name: z.string().min(1, "Nome da configuração é obrigatório").optional(),
  host: z.string().min(1, "Host SMTP é obrigatório").optional(),
  port: z.number().int().min(1).max(65535, "Porta inválida").optional(),
  secure: z.boolean().optional(),
  authUser: z.string().min(1, "Usuário de autenticação é obrigatório").optional(),
  authPassword: z.string().optional(), // Opcional - se não fornecida, mantém a senha atual
  fromEmail: z.string().email("Email remetente inválido").optional(),
  fromName: z.string().optional(),
});

const deleteSmtpConfigSchema = z.object({
  id: z.string().min(1, "ID da configuração é obrigatório"),
});

// Schema para envio de email de teste
const sendTestEmailSchema = z.object({
  templateId: z.string().min(1, "ID do template é obrigatório"),
  to: z.string().email("Email de destino inválido"),
  smtpPassword: z.string().optional(), // Opcional - tenta usar cache ou descriptografar
  variables: z.record(z.string()).optional(),
});

// Schema para teste de conexão SMTP
const testSmtpConnectionSchema = z.object({
  smtpPassword: z.string().optional(), // Opcional - tenta usar cache ou descriptografar
});

export const emailRouter = createTRPCRouter({
  /**
   * Lista todos os templates de email
   * Apenas administradores podem acessar
   */
  getEmailTemplates: adminProcedure.query(async ({ ctx }) => {
    try {
      const templates = await ctx.emailTemplateService.getAllTemplates();

      return templates.map((template) => ({
        id: template.id,
        name: template.name,
        eventType: template.eventType,
        subject: template.subject,
        htmlContent: template.htmlContent,
        isActive: template.isActive,
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      }));
    } catch (error) {
      logger.error("Erro ao listar templates de email", {
        adminId: ctx.user.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao listar templates de email",
      });
    }
  }),

  /**
   * Cria um novo template de email
   * Apenas administradores podem acessar
   */
  createEmailTemplate: adminProcedure
    .input(createEmailTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // Validar campos obrigatórios
        if (!input.name || !input.subject || !input.htmlContent) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Campos obrigatórios: name, subject e htmlContent",
          });
        }
        const template = await ctx.emailTemplateService.createTemplate(
          {
            name: input.name,
            eventType: input.eventType,
            subject: input.subject,
            htmlContent: input.htmlContent,
          },
          ctx.user.id
        );

        return {
          id: template.id,
          name: template.name,
          subject: template.subject,
          htmlContent: template.htmlContent,
          isActive: template.isActive,
          createdAt: template.createdAt.toISOString(),
          updatedAt: template.updatedAt.toISOString(),
        };
      } catch (error) {
        logger.error("Erro ao criar template de email", {
          adminId: ctx.user.id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Erro ao criar template de email",
        });
      }
    }),

  /**
   * Atualiza um template de email
   * Apenas administradores podem acessar
   */
  updateEmailTemplate: adminProcedure
    .input(updateEmailTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { id, ...updateData } = input;

        const template = await ctx.emailTemplateService.updateTemplate(id, updateData, ctx.user.id);

        return {
          id: template.id,
          name: template.name,
          eventType: template.eventType,
          subject: template.subject,
          htmlContent: template.htmlContent,
          isActive: template.isActive,
          createdAt: template.createdAt.toISOString(),
          updatedAt: template.updatedAt.toISOString(),
        };
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "Template não encontrado") {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: error.message,
            });
          }
        }

        logger.error("Erro ao atualizar template de email", {
          adminId: ctx.user.id,
          templateId: input.id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Erro ao atualizar template de email",
        });
      }
    }),

  /**
   * Deleta um template de email
   * Apenas administradores podem acessar
   */
  deleteEmailTemplate: adminProcedure
    .input(deleteEmailTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        await ctx.emailTemplateService.deleteTemplate(input.id, ctx.user.id);

        return { success: true };
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "Template não encontrado") {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: error.message,
            });
          }
        }

        logger.error("Erro ao deletar template de email", {
          adminId: ctx.user.id,
          templateId: input.id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Erro ao deletar template de email",
        });
      }
    }),

  /**
   * Obtém a configuração SMTP padrão
   * Apenas administradores podem acessar
   */
  getSmtpConfig: adminProcedure.query(async ({ ctx }) => {
    try {
      const config = await ctx.smtpConfigService.getDefaultConfig();

      if (!config) {
        return null;
      }

      return {
        id: config.id,
        name: config.name,
        host: config.host,
        port: config.port,
        secure: config.secure,
        authUser: config.authUser,
        // Não retornar a senha por segurança
        fromEmail: config.fromEmail,
        fromName: config.fromName,
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
      };
    } catch (error) {
      logger.error("Erro ao obter configuração SMTP", {
        adminId: ctx.user.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao obter configuração SMTP",
      });
    }
  }),

  /**
   * Cria uma nova configuração SMTP
   * Apenas administradores podem acessar
   */
  createSmtpConfig: adminProcedure
    .input(createSmtpConfigSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // Validar campos obrigatórios
        if (
          !input.name ||
          !input.host ||
          !input.port ||
          !input.authUser ||
          !input.authPassword ||
          !input.fromEmail
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Campos obrigatórios: name, host, port, authUser, authPassword e fromEmail",
          });
        }
        const config = await ctx.smtpConfigService.createConfig(
          {
            name: input.name,
            host: input.host,
            port: input.port,
            secure: input.secure,
            authUser: input.authUser,
            authPassword: input.authPassword,
            fromEmail: input.fromEmail,
            fromName: input.fromName,
          },
          ctx.user.id
        );

        return {
          id: config.id,
          name: config.name,
          host: config.host,
          port: config.port,
          secure: config.secure,
          authUser: config.authUser,
          fromEmail: config.fromEmail,
          fromName: config.fromName,
          createdAt: config.createdAt.toISOString(),
          updatedAt: config.updatedAt.toISOString(),
        };
      } catch (error) {
        logger.error("Erro ao criar configuração SMTP", {
          adminId: ctx.user.id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Erro ao criar configuração SMTP",
        });
      }
    }),

  /**
   * Atualiza uma configuração SMTP
   * Apenas administradores podem acessar
   */
  updateSmtpConfig: adminProcedure
    .input(updateSmtpConfigSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { id, ...updateData } = input;

        const config = await ctx.smtpConfigService.updateConfig(id, updateData, ctx.user.id);

        return {
          id: config.id,
          name: config.name,
          host: config.host,
          port: config.port,
          secure: config.secure,
          authUser: config.authUser,
          fromEmail: config.fromEmail,
          fromName: config.fromName,
          createdAt: config.createdAt.toISOString(),
          updatedAt: config.updatedAt.toISOString(),
        };
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "Configuração SMTP não encontrada") {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: error.message,
            });
          }
        }

        logger.error("Erro ao atualizar configuração SMTP", {
          adminId: ctx.user.id,
          configId: input.id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Erro ao atualizar configuração SMTP",
        });
      }
    }),

  /**
   * Deleta uma configuração SMTP
   * Apenas administradores podem acessar
   */
  deleteSmtpConfig: adminProcedure
    .input(deleteSmtpConfigSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        await ctx.smtpConfigService.deleteConfig(input.id, ctx.user.id);

        return { success: true };
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "Configuração SMTP não encontrada") {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: error.message,
            });
          }
        }

        logger.error("Erro ao deletar configuração SMTP", {
          adminId: ctx.user.id,
          configId: input.id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Erro ao deletar configuração SMTP",
        });
      }
    }),

  /**
   * Envia um email de teste usando um template
   * Apenas administradores podem acessar
   * NOTA: Senha SMTP é opcional - tenta usar cache ou descriptografar do banco
   */
  sendTestEmail: adminProcedure.input(sendTestEmailSchema).mutation(async ({ ctx, input }) => {
    try {
      await ctx.emailSenderService.sendTestEmail(
        {
          templateId: input.templateId,
          to: input.to,
          variables: input.variables,
        },
        ctx.user.id,
        input.smtpPassword
      );

      return { success: true, message: "Email de teste enviado com sucesso" };
    } catch (error) {
      logger.error("Erro ao enviar email de teste", {
        adminId: ctx.user.id,
        templateId: input.templateId,
        to: input.to,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Erro ao enviar email de teste",
      });
    }
  }),

  /**
   * Testa a conexão SMTP sem enviar email
   * Apenas administradores podem acessar
   */
  testSmtpConnection: adminProcedure
    .input(testSmtpConnectionSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await ctx.emailSenderService.testConnection(ctx.user.id, input.smtpPassword);

        return result;
      } catch (error) {
        logger.error("Erro ao testar conexão SMTP", {
          adminId: ctx.user.id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Erro ao testar conexão SMTP",
        });
      }
    }),
});
