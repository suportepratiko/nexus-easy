/**
 * Serviço de Configuração SMTP
 *
 * Responsável por gerenciar configurações SMTP para envio de emails.
 * Segue princípios DDD e SOLID.
 *
 * @module application/email
 */

import { SmtpConfig } from "@/domain/smtp-config/smtp-config.entity";
import type { ISmtpConfigRepository } from "@/domain/smtp-config/smtp-config.repository.interface";
import { auditService } from "@/infrastructure/audit/audit.service";
import { decrypt, encrypt, isEncrypted } from "@/infrastructure/crypto/encryption.service";
import { logger } from "@/infrastructure/logger/logger";

export class SmtpConfigService {
  constructor(private readonly smtpConfigRepository: ISmtpConfigRepository) {}

  /**
   * Obtém a configuração SMTP padrão
   */
  async getDefaultConfig(): Promise<SmtpConfig | null> {
    try {
      const config = await this.smtpConfigRepository.findDefault();
      logger.info("Configuração SMTP padrão obtida", { configId: config?.id });
      return config;
    } catch (error) {
      logger.error("Erro ao obter configuração SMTP padrão", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error("Erro ao obter configuração SMTP padrão");
    }
  }

  /**
   * Cria uma nova configuração SMTP
   * Só pode haver uma configuração SMTP no sistema
   */
  async createConfig(
    data: {
      name: string;
      host: string;
      port: number;
      secure: boolean;
      authUser: string;
      authPassword: string; // Senha em texto plano
      fromEmail: string;
      fromName?: string | null;
    },
    adminId: string
  ): Promise<SmtpConfig> {
    try {
      // Verificar se já existe uma configuração
      const existing = await this.smtpConfigRepository.findDefault();
      if (existing) {
        throw new Error(
          "Já existe uma configuração SMTP. Delete a existente antes de criar uma nova."
        );
      }

      // Criptografar senha antes de salvar (AES reversível)
      const encryptedPassword = encrypt(data.authPassword);

      const config = SmtpConfig.create({
        name: data.name,
        host: data.host,
        port: data.port,
        secure: data.secure,
        authUser: data.authUser,
        authPassword: encryptedPassword,
        fromEmail: data.fromEmail,
        fromName: data.fromName || null,
      });

      const createdConfig = await this.smtpConfigRepository.create(config);

      await auditService.log({
        userId: adminId,
        action: "SMTP_CONFIG_CREATED",
        entityType: "SmtpConfig",
        entityId: createdConfig.id,
        details: {
          name: createdConfig.name,
          host: createdConfig.host,
          fromEmail: createdConfig.fromEmail,
        },
      });

      logger.info("Configuração SMTP criada com sucesso", {
        configId: createdConfig.id,
        adminId,
      });

      return createdConfig;
    } catch (error) {
      logger.error("Erro ao criar configuração SMTP", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Atualiza a configuração SMTP padrão
   */
  async updateConfig(
    configId: string,
    data: {
      name?: string;
      host?: string;
      port?: number;
      secure?: boolean;
      authUser?: string;
      authPassword?: string; // Opcional - senha em texto plano
      fromEmail?: string;
      fromName?: string | null;
    },
    adminId: string
  ): Promise<SmtpConfig> {
    try {
      const existingConfig = await this.smtpConfigRepository.findById(configId);

      if (!existingConfig) {
        throw new Error("Configuração SMTP não encontrada");
      }

      // Preparar dados para atualização
      const updateData: Record<string, unknown> = {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.host !== undefined && { host: data.host }),
        ...(data.port !== undefined && { port: data.port }),
        ...(data.secure !== undefined && { secure: data.secure }),
        ...(data.authUser !== undefined && { authUser: data.authUser }),
        ...(data.fromEmail !== undefined && { fromEmail: data.fromEmail }),
        ...(data.fromName !== undefined && { fromName: data.fromName }),
      };

      // Se a senha foi fornecida, criptografar (AES reversível)
      if (data.authPassword) {
        updateData.authPassword = encrypt(data.authPassword);
      }

      const updatedConfig = await this.smtpConfigRepository.update(configId, updateData);

      await auditService.log({
        userId: adminId,
        action: "SMTP_CONFIG_UPDATED",
        entityType: "SmtpConfig",
        entityId: configId,
        details: {
          updatedFields: Object.keys(data),
          oldData: {
            name: existingConfig.name,
            host: existingConfig.host,
          },
          newData: {
            name: updatedConfig.name,
            host: updatedConfig.host,
          },
        },
      });

      logger.info("Configuração SMTP atualizada com sucesso", {
        configId,
        updatedFields: Object.keys(data),
        adminId,
      });

      return updatedConfig;
    } catch (error) {
      logger.error("Erro ao atualizar configuração SMTP", {
        configId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Deleta uma configuração SMTP
   */
  async deleteConfig(configId: string, adminId: string): Promise<void> {
    try {
      const existingConfig = await this.smtpConfigRepository.findById(configId);

      if (!existingConfig) {
        throw new Error("Configuração SMTP não encontrada");
      }

      await this.smtpConfigRepository.delete(configId);

      await auditService.log({
        userId: adminId,
        action: "SMTP_CONFIG_DELETED",
        entityType: "SmtpConfig",
        entityId: configId,
        details: {
          deletedConfigName: existingConfig.name,
        },
      });

      logger.info("Configuração SMTP deletada com sucesso", {
        configId,
        adminId,
      });
    } catch (error) {
      logger.error("Erro ao deletar configuração SMTP", {
        configId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Obtém a senha descriptografada de uma configuração SMTP
   * Usado para envio de emails
   */
  async getDecryptedPassword(configId: string): Promise<string> {
    try {
      const config = await this.smtpConfigRepository.findById(configId);

      if (!config) {
        throw new Error("Configuração SMTP não encontrada");
      }

      // Descriptografar senha
      try {
        const decryptedPassword = decrypt(config.authPassword);
        return decryptedPassword;
      } catch (error) {
        // Se falhar, pode ser que a senha ainda esteja em bcrypt (migração)
        logger.warn("Falha ao descriptografar senha SMTP. Pode ser senha antiga em bcrypt.", {
          configId,
        });
        throw new Error(
          "Não foi possível descriptografar a senha. Recrie a configuração SMTP com a senha correta."
        );
      }
    } catch (error) {
      logger.error("Erro ao obter senha descriptografada", {
        configId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
