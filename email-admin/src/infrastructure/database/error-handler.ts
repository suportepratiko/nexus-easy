import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { logger } from "../logger/logger";

/**
 * Detecta se o erro é relacionado a conexão com o banco de dados
 * Código P1001: Can't reach database server
 */
export function isDatabaseConnectionError(error: unknown): boolean {
  if (error instanceof PrismaClientKnownRequestError) {
    return error.code === "P1001";
  }

  const errorMessage = error instanceof Error ? error.message : String(error);

  return (
    errorMessage.includes("Can't reach database server") ||
    errorMessage.includes("P1001") ||
    errorMessage.includes("ECONNREFUSED") ||
    errorMessage.includes("ETIMEDOUT") ||
    errorMessage.includes("ENOTFOUND")
  );
}

/**
 * Detecta se o erro é relacionado a tabela não encontrada
 */
export function isTableNotFoundError(error: unknown): boolean {
  if (error instanceof PrismaClientKnownRequestError) {
    return (
      error.code === "P2001" || // Record not found
      error.code === "P2021" || // Table does not exist
      error.code === "P2010" // Raw query failed
    );
  }

  const errorMessage = error instanceof Error ? error.message : String(error);

  return (
    errorMessage.includes("does not exist") ||
    errorMessage.includes("relation") ||
    errorMessage.includes("table") ||
    errorMessage.includes("Unknown table") ||
    errorMessage.includes("Table") ||
    errorMessage.includes("P2001") ||
    errorMessage.includes("P2021") ||
    errorMessage.includes("P2010")
  );
}

/**
 * Trata erros de banco de dados de forma segura
 * Retorna true se o erro foi tratado (não deve ser relançado)
 */
export function handleDatabaseError(
  error: unknown,
  context: string,
  fallbackValue: unknown = null
): boolean {
  if (isDatabaseConnectionError(error)) {
    logger.warn(`⚠️ Erro de conexão com banco de dados em ${context}`, {
      context,
      error: error instanceof Error ? error.message : String(error),
      fallback: fallbackValue !== null ? "Retornando valor padrão" : "Ignorando operação",
    });
    return true; // Erro tratado, não relançar
  }

  if (isTableNotFoundError(error)) {
    logger.warn(`⚠️ Tabela não encontrada em ${context}`, {
      context,
      error: error instanceof Error ? error.message : String(error),
      fallback: fallbackValue !== null ? "Retornando valor padrão" : "Ignorando operação",
    });
    return true; // Erro tratado, não relançar
  }

  return false; // Erro não tratado, deve ser relançado
}
