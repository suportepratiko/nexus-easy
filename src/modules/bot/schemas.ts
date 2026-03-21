import { z } from "zod";

/** Calculation mode for stop gain/loss targets */
export const CalculationModeSchema = z.enum(["gross_value", "percentage", "entries"]);

/** Martingale strategy levels */
export const MartingaleLevelSchema = z.enum(["none", "1x", "2x", "3x"]);

/** Bot execution status */
export const BotStatusSchema = z.enum(["idle", "running", "paused", "stopped"]);

/** Asset modality: Digital options or Binary/Turbo options */
export const AssetModalitySchema = z.enum(["digital", "binary"]);

/** Market type: open market or OTC */
export const MarketTypeSchema = z.enum(["open", "otc"]);

/** Built-in strategy types */
export const BuiltinStrategyTypeSchema = z.enum(["otc", "supertrend"]);

/** Strategy: built-in ou custom:uuid */
export const StrategyTypeSchema = z.union([
  BuiltinStrategyTypeSchema,
  z.string().refine((s) => s.startsWith("custom:"), "custom deve ser custom:uuid"),
]);

/** Estratégia customizada (enviada ao bot) */
export const CustomStrategyPayloadSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  timeframe: z.enum(["M1", "M5"]),
});

/** Strategy configuration schema */
export const StrategyConfigSchema = z.object({
  bankroll: z.number().min(1, "Banca mínima: R$ 1,00"),
  entryValue: z.number().min(0.5, "Entrada mínima: R$ 0,50"),

  stopGainMode: CalculationModeSchema,
  stopGainValue: z.number().min(0),

  stopLossMode: CalculationModeSchema,
  stopLossValue: z.number().min(0),

  martingale: MartingaleLevelSchema,

  payout: z.number().min(50).max(100).default(87),

  /** Modalidade do ativo: Digital e/ou Binárias (pelo menos um) */
  assetModality: z
    .array(AssetModalitySchema)
    .min(1, "Selecione ao menos uma modalidade")
    .default(["binary"]),

  /** Mercado: aberto e/ou OTC (pelo menos um) */
  marketType: z
    .array(MarketTypeSchema)
    .min(1, "Selecione ao menos um tipo de mercado")
    .default(["open", "otc"]),

  /** Estratégias ativas: built-in ou custom:uuid (pelo menos uma) */
  strategies: z
    .array(z.string())
    .min(1, "Selecione ao menos uma estratégia")
    .default(["otc"]),

  /** Estratégias customizadas selecionadas (id, name, code, timeframe) — enviadas ao bot para execução */
  customStrategies: z
    .array(CustomStrategyPayloadSchema)
    .default([]),

  /** Se true, entra no início da próxima vela (M1) após o gatilho; se false, entra imediatamente. */
  waitNextCandle: z.boolean().default(true),

  /** Conta da corretora: REAL (dinheiro real) ou PRACTICE (conta demo). */
  accountMode: z.enum(["REAL", "PRACTICE"]).default("REAL"),
});

/** Operation log entry schema */
export const OperationLogSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.date(),
  asset: z.string(),
  direction: z.enum(["call", "put"]),
  entryValue: z.number(),
  result: z.enum(["win", "loss", "draw", "pending"]),
  profit: z.number(),
  martingaleLevel: z.number().min(0).max(3),
  balanceAfter: z.number(),
  strategy: z.string().optional(),
  duration: z.number().optional(),
  deletedAt: z.date().nullable().default(null),
});

/** Bot session schema */
export const BotSessionSchema = z.object({
  id: z.string().uuid(),
  status: BotStatusSchema,
  config: StrategyConfigSchema,
  startedAt: z.date().nullable(),
  stoppedAt: z.date().nullable(),
  totalProfit: z.number().default(0),
  totalOperations: z.number().default(0),
  wins: z.number().default(0),
  losses: z.number().default(0),
  deletedAt: z.date().nullable().default(null),
});

export type CalculationMode = z.infer<typeof CalculationModeSchema>;
export type MartingaleLevel = z.infer<typeof MartingaleLevelSchema>;
export type AssetModality = z.infer<typeof AssetModalitySchema>;
export type MarketType = z.infer<typeof MarketTypeSchema>;
export type BuiltinStrategyType = z.infer<typeof BuiltinStrategyTypeSchema>;
export type StrategyType = z.infer<typeof StrategyTypeSchema>;
export type CustomStrategyPayload = z.infer<typeof CustomStrategyPayloadSchema>;
export type BotStatus = z.infer<typeof BotStatusSchema>;
export type StrategyConfig = z.infer<typeof StrategyConfigSchema>;
export type OperationLog = z.infer<typeof OperationLogSchema>;
export type BotSession = z.infer<typeof BotSessionSchema>;
