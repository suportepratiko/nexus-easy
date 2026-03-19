import { PrismaClient } from "@prisma/client";
import { logger } from "../logger/logger";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Adicionar parâmetros de timeout na URL do banco se não existirem
function enhanceDatabaseUrl(url: string | undefined): string {
  if (!url) {
    throw new Error("DATABASE_URL não está definida nas variáveis de ambiente");
  }

  // Se já tiver parâmetros, adicionar aos existentes
  const urlObj = new URL(url);

  // ✅ OTIMIZAÇÃO: Parâmetros de conexão PostgreSQL otimizados para performance
  // connection_limit: número máximo de conexões no pool (aumentado para 150)
  // pool_timeout: tempo máximo para obter conexão do pool (aumentado para 20s)
  // connect_timeout: tempo máximo para estabelecer conexão (60s)
  // statement_timeout: timeout para queries individuais (20s - reduzido para falhar mais rápido)
  if (!urlObj.searchParams.has("connection_limit")) {
    urlObj.searchParams.set("connection_limit", "150"); // ✅ Aumentado de 100 para 150
  }
  if (!urlObj.searchParams.has("pool_timeout")) {
    urlObj.searchParams.set("pool_timeout", "20"); // ✅ Adicionado: 20 segundos para obter conexão
  }
  if (!urlObj.searchParams.has("connect_timeout")) {
    urlObj.searchParams.set("connect_timeout", "60");
  }
  if (!urlObj.searchParams.has("statement_timeout")) {
    urlObj.searchParams.set("statement_timeout", "20000"); // ✅ Reduzido para 20s (falhar mais rápido)
  }

  return urlObj.toString();
}

const databaseUrl = enhanceDatabaseUrl(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    // ✅ OTIMIZAÇÃO: Configurações de pool otimizadas
    // connection_limit: 150 (na URL)
    // pool_timeout: 20s (na URL)
    // statement_timeout: 20s (na URL)
    // O Prisma gerencia o pool automaticamente com base nos parâmetros da URL
  });

// Garantir que o Prisma não trave ao conectar
if (!globalForPrisma.prisma) {
  // Tentar conectar de forma assíncrona sem bloquear
  prisma.$connect().catch((error) => {
    logger.error("Erro ao conectar ao banco de dados (não bloqueante)", {
      error: error instanceof Error ? error.message : String(error),
      errorCode: error instanceof Error && "code" in error ? error.code : undefined,
    });
    // Não lançar erro - deixar Prisma tentar conectar sob demanda
  });
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
