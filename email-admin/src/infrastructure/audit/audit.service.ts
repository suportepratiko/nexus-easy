import type { Prisma } from "@prisma/client";
import { prisma } from "../database/prisma";
import { logger } from "../logger/logger";

interface AuditLogData {
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditService {
  async log(data: AuditLogData): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: data.userId,
          action: data.action,
          entityType: data.entityType,
          entityId: data.entityId,
          details: (data.details ?? {}) as Prisma.InputJsonValue,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        },
      });
    } catch (error) {
      logger.error("Falha ao registrar auditoria", { error, data });
    }
  }
}

export const auditService = new AuditService();
