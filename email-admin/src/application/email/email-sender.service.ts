/**
 * Serviço de Envio de Email
 *
 * Responsável por enviar emails usando configurações SMTP.
 * Segue princípios DDD e SOLID.
 *
 * @module application/email
 */

import type { IEmailTemplateRepository } from "@/domain/email-template/email-template.repository.interface";
import type { ISmtpConfigRepository } from "@/domain/smtp-config/smtp-config.repository.interface";
import {
  cacheSmtpPassword,
  getCachedSmtpPassword,
} from "@/infrastructure/cache/smtp-password-cache.service";
import { logger } from "@/infrastructure/logger/logger";
import nodemailer, { type Transporter } from "nodemailer";
import { replaceEmailVariables } from "./email-template-variables.service";
import type { SmtpConfigService } from "./smtp-config.service";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  fromEmail?: string;
  fromName?: string;
  attachments?: Array<{
    filename: string;
    path?: string;
    content?: string | Buffer;
    contentType?: string;
  }>;
}

export interface SendTestEmailOptions {
  templateId: string;
  to: string;
  variables?: Record<string, string>;
}

export class EmailSenderService {
  constructor(
    private readonly smtpConfigRepository: ISmtpConfigRepository,
    private readonly emailTemplateRepository: IEmailTemplateRepository,
    private readonly smtpConfigService: SmtpConfigService
  ) {}

  /**
   * Obtém a configuração SMTP padrão
   */
  private async getActiveSmtpConfig() {
    const config = await this.smtpConfigRepository.findDefault();

    if (!config) {
      throw new Error("Nenhuma configuração SMTP encontrada. Configure uma configuração SMTP.");
    }

    return config;
  }

  /**
   * Testa a conexão SMTP sem enviar email
   */
  async testConnection(
    userId: string,
    smtpPassword?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const config = await this.getActiveSmtpConfig();
      const password = await this.getSmtpPassword(config.id, userId, smtpPassword);
      const transporter = await this.createTransporter(password);

      return {
        success: true,
        message: `Conexão SMTP verificada com sucesso! Servidor: ${config.host}:${config.port}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Erro desconhecido ao testar conexão",
      };
    }
  }

  /**
   * Cria um transporter do nodemailer usando a configuração SMTP ativa
   */
  private async createTransporter(smtpPassword: string): Promise<Transporter> {
    const config = await this.getActiveSmtpConfig();

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure, // true para 465, false para outras portas
      auth: {
        user: config.authUser,
        pass: smtpPassword, // Senha em texto plano
      },
      // Para portas 587 com STARTTLS
      requireTLS: !config.secure && config.port === 587,
    });

    // Verificar conexão
    try {
      await transporter.verify();
      logger.info("Conexão SMTP verificada com sucesso", {
        host: config.host,
        port: config.port,
      });
    } catch (error) {
      logger.error("Erro ao verificar conexão SMTP", {
        host: config.host,
        port: config.port,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Falha ao conectar ao servidor SMTP: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return transporter;
  }

  /**
   * Obtém a senha SMTP (do cache ou descriptografada do banco)
   * @param userId Pode ser um ID de usuário real ou um identificador temporário (ex: email hash)
   */
  private async getSmtpPassword(
    configId: string,
    userId: string,
    providedPassword?: string
  ): Promise<string> {
    // Se senha foi fornecida, usar ela e armazenar no cache
    if (providedPassword) {
      cacheSmtpPassword(userId, configId, providedPassword);
      return providedPassword;
    }

    // Tentar obter do cache
    const cachedPassword = getCachedSmtpPassword(userId, configId);
    if (cachedPassword) {
      return cachedPassword;
    }

    // Tentar obter de variável de ambiente (fallback para operações do sistema)
    const envPassword = process.env.SMTP_PASSWORD;
    if (envPassword) {
      logger.info("Usando senha SMTP de variável de ambiente");
      cacheSmtpPassword(userId, configId, envPassword);
      return envPassword;
    }

    // Se não estiver no cache, tentar descriptografar do banco
    try {
      const decryptedPassword = await this.smtpConfigService.getDecryptedPassword(configId);
      // Armazenar no cache para próximas vezes
      cacheSmtpPassword(userId, configId, decryptedPassword);
      return decryptedPassword;
    } catch (error) {
      throw new Error(
        "Senha SMTP não encontrada. Configure SMTP_PASSWORD no .env ou recrie a configuração SMTP com a senha correta."
      );
    }
  }

  /**
   * Envia um email usando a configuração SMTP ativa
   * @param smtpPassword Senha SMTP opcional (se não fornecida, tenta cache ou descriptografa do banco)
   * @param userId ID do usuário para cache
   */
  async sendEmail(options: SendEmailOptions, userId: string, smtpPassword?: string): Promise<void> {
    try {
      const config = await this.getActiveSmtpConfig();
      const password = await this.getSmtpPassword(config.id, userId, smtpPassword);
      const transporter = await this.createTransporter(password);

      const fromEmail = options.fromEmail || config.fromEmail;
      const fromName = options.fromName || config.fromName;

      const mailOptions = {
        from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
        to: options.to,
        subject: options.subject,
        html: options.html,
        attachments: options.attachments || [],
      };

      const info = await transporter.sendMail(mailOptions);

      logger.info("Email enviado com sucesso", {
        messageId: info.messageId,
        to: options.to,
        subject: options.subject,
      });
    } catch (error) {
      logger.error("Erro ao enviar email", {
        to: options.to,
        subject: options.subject,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Envia um email de teste usando um template
   * @param smtpPassword Senha SMTP opcional (se não fornecida, tenta cache ou descriptografa do banco)
   * @param userId ID do usuário para cache
   */
  async sendTestEmail(
    options: SendTestEmailOptions,
    userId: string,
    smtpPassword?: string
  ): Promise<void> {
    try {
      // Buscar template
      const template = await this.emailTemplateRepository.findById(options.templateId);

      if (!template) {
        throw new Error("Template de email não encontrado");
      }

      // Substituir variáveis
      const variables = {
        nome: options.variables?.nome || "Usuário de Teste",
        email: options.to,
        ...options.variables,
      };

      const htmlContent = replaceEmailVariables(template.htmlContent, variables);
      const subject = replaceEmailVariables(template.subject, variables);

      // Enviar email
      await this.sendEmail(
        {
          to: options.to,
          subject,
          html: htmlContent,
        },
        userId,
        smtpPassword
      );

      logger.info("Email de teste enviado com sucesso", {
        templateId: options.templateId,
        to: options.to,
      });
    } catch (error) {
      logger.error("Erro ao enviar email de teste", {
        templateId: options.templateId,
        to: options.to,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
