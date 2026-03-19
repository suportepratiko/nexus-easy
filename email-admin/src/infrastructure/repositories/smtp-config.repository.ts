/**
 * Repositório de Configuração SMTP
 *
 * Implementação da interface ISmtpConfigRepository usando Prisma.
 * Responsável por persistência de configurações SMTP.
 */

import { SmtpConfig } from "@/domain/smtp-config/smtp-config.entity";
import type { ISmtpConfigRepository } from "@/domain/smtp-config/smtp-config.repository.interface";
import { handleDatabaseError } from "../database/error-handler";
import { prisma } from "../database/prisma";
import { logger } from "../logger/logger";

export class SmtpConfigRepository implements ISmtpConfigRepository {
  async findDefault(): Promise<SmtpConfig | null> {
    try {
      // Busca a primeira configuração (só deve haver uma)
      const config = await prisma.smtpConfig.findFirst({
        orderBy: { createdAt: "asc" },
      });

      if (!config) return null;

      return SmtpConfig.fromPrisma({
        id: config.id,
        name: config.name,
        host: config.host,
        port: config.port,
        secure: config.secure,
        authUser: config.authUser,
        authPassword: config.authPassword,
        fromEmail: config.fromEmail,
        fromName: config.fromName,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      });
    } catch (error) {
      if (handleDatabaseError(error, "SmtpConfigRepository.findDefault", null)) {
        return null;
      }
      logger.error("Erro ao buscar configuração SMTP padrão", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findById(id: string): Promise<SmtpConfig | null> {
    try {
      const config = await prisma.smtpConfig.findUnique({
        where: { id },
      });

      if (!config) return null;

      return SmtpConfig.fromPrisma({
        id: config.id,
        name: config.name,
        host: config.host,
        port: config.port,
        secure: config.secure,
        authUser: config.authUser,
        authPassword: config.authPassword,
        fromEmail: config.fromEmail,
        fromName: config.fromName,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      });
    } catch (error) {
      if (handleDatabaseError(error, "SmtpConfigRepository.findById", null)) {
        return null;
      }
      logger.error("Erro ao buscar configuração SMTP por id", {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async create(data: Omit<SmtpConfig, "id" | "createdAt" | "updatedAt">): Promise<SmtpConfig> {
    try {
      // Verificar se já existe uma configuração
      const existing = await this.findDefault();
      if (existing) {
        throw new Error(
          "Já existe uma configuração SMTP. Delete a existente antes de criar uma nova."
        );
      }

      const config = await prisma.smtpConfig.create({
        data: {
          name: data.name,
          host: data.host,
          port: data.port,
          secure: data.secure,
          authUser: data.authUser,
          authPassword: data.authPassword, // Já deve vir criptografada
          fromEmail: data.fromEmail,
          fromName: data.fromName,
        },
      });

      return SmtpConfig.fromPrisma({
        id: config.id,
        name: config.name,
        host: config.host,
        port: config.port,
        secure: config.secure,
        authUser: config.authUser,
        authPassword: config.authPassword,
        fromEmail: config.fromEmail,
        fromName: config.fromName,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      });
    } catch (error) {
      logger.error("Erro ao criar configuração SMTP", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async update(
    id: string,
    data: Partial<Omit<SmtpConfig, "id" | "createdAt" | "updatedAt">>
  ): Promise<SmtpConfig> {
    try {
      const config = await prisma.smtpConfig.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.host !== undefined && { host: data.host }),
          ...(data.port !== undefined && { port: data.port }),
          ...(data.secure !== undefined && { secure: data.secure }),
          ...(data.authUser !== undefined && { authUser: data.authUser }),
          ...(data.authPassword !== undefined && { authPassword: data.authPassword }),
          ...(data.fromEmail !== undefined && { fromEmail: data.fromEmail }),
          ...(data.fromName !== undefined && { fromName: data.fromName }),
        },
      });

      return SmtpConfig.fromPrisma({
        id: config.id,
        name: config.name,
        host: config.host,
        port: config.port,
        secure: config.secure,
        authUser: config.authUser,
        authPassword: config.authPassword,
        fromEmail: config.fromEmail,
        fromName: config.fromName,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      });
    } catch (error) {
      logger.error("Erro ao atualizar configuração SMTP", {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await prisma.smtpConfig.delete({
        where: { id },
      });
    } catch (error) {
      logger.error("Erro ao deletar configuração SMTP", {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
