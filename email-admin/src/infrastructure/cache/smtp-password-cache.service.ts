/**
 * Serviço de Cache de Senha SMTP
 *
 * Armazena senhas SMTP em memória durante a sessão do usuário.
 * As senhas são limpas automaticamente após um tempo de expiração.
 *
 * @module infrastructure/cache
 */

import { logger } from "../logger/logger";

interface CachedPassword {
  password: string;
  expiresAt: number;
  configId: string;
}

/**
 * Cache em memória de senhas SMTP por usuário
 * Formato: { userId: { configId: CachedPassword } }
 */
const passwordCache: Map<string, Map<string, CachedPassword>> = new Map();

/**
 * Tempo de expiração do cache em milissegundos (30 minutos)
 */
const CACHE_EXPIRATION_MS = 30 * 60 * 1000;

/**
 * Limpa entradas expiradas do cache
 */
function cleanExpiredEntries(): void {
  const now = Date.now();
  for (const [userId, configs] of passwordCache.entries()) {
    for (const [configId, cached] of configs.entries()) {
      if (cached.expiresAt < now) {
        configs.delete(configId);
        logger.debug("Senha SMTP expirada removida do cache", { userId, configId });
      }
    }
    // Se não há mais configurações para este usuário, remover o usuário
    if (configs.size === 0) {
      passwordCache.delete(userId);
    }
  }
}

/**
 * Armazena uma senha SMTP no cache
 */
export function cacheSmtpPassword(userId: string, configId: string, password: string): void {
  try {
    cleanExpiredEntries();

    if (!passwordCache.has(userId)) {
      passwordCache.set(userId, new Map());
    }

    const userCache = passwordCache.get(userId)!;
    userCache.set(configId, {
      password,
      expiresAt: Date.now() + CACHE_EXPIRATION_MS,
      configId,
    });

    logger.debug("Senha SMTP armazenada no cache", { userId, configId });
  } catch (error) {
    logger.error("Erro ao armazenar senha SMTP no cache", {
      userId,
      configId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Obtém uma senha SMTP do cache
 */
export function getCachedSmtpPassword(userId: string, configId: string): string | null {
  try {
    cleanExpiredEntries();

    const userCache = passwordCache.get(userId);
    if (!userCache) {
      return null;
    }

    const cached = userCache.get(configId);
    if (!cached) {
      return null;
    }

    // Verificar se expirou
    if (cached.expiresAt < Date.now()) {
      userCache.delete(configId);
      return null;
    }

    logger.debug("Senha SMTP recuperada do cache", { userId, configId });
    return cached.password;
  } catch (error) {
    logger.error("Erro ao recuperar senha SMTP do cache", {
      userId,
      configId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Remove uma senha SMTP do cache
 */
export function clearCachedSmtpPassword(userId: string, configId?: string): void {
  try {
    if (configId) {
      const userCache = passwordCache.get(userId);
      if (userCache) {
        userCache.delete(configId);
        logger.debug("Senha SMTP removida do cache", { userId, configId });
      }
    } else {
      // Remover todas as senhas do usuário
      passwordCache.delete(userId);
      logger.debug("Todas as senhas SMTP do usuário removidas do cache", { userId });
    }
  } catch (error) {
    logger.error("Erro ao limpar cache de senha SMTP", {
      userId,
      configId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Limpa todo o cache (útil para testes ou reset)
 */
export function clearAllCache(): void {
  passwordCache.clear();
  logger.info("Cache de senhas SMTP limpo completamente");
}
