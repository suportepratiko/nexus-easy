/**
 * Utilitários para período de recorrência em webhooks de pagamento.
 * Universal: várias plataformas; às vezes só type, às vezes só count, às vezes os dois.
 * Em cada parte: map path + interpretações "quando X → significa Y". Regras (type, count) → period.
 */

import type {
  BillingPeriod,
  PeriodRule,
  PeriodConfig,
  PeriodTypeInterpretation,
  PeriodCountInterpretation,
  TypeMeaning,
  CountMeaning,
} from "@/shared/utils/webhook-period";

export type { BillingPeriod, PeriodRule, PeriodConfig };
export {
  DEFAULT_PERIOD_RULES,
  DEFAULT_TYPE_INTERPRETATIONS,
  DEFAULT_COUNT_INTERPRETATIONS,
} from "@/shared/utils/webhook-period";

const ALIASES: Record<BillingPeriod, string[]> = {
  mensal: [
    "mensal",
    "monthly",
    "mês",
    "mes",
    "month",
    "1 month",
    "1 months",
    "1m",
    "1mes",
    "1meses",
  ],
  trimestral: [
    "trimestral",
    "quarterly",
    "trimestre",
    "quarter",
    "3 months",
    "3 meses",
    "3m",
    "3meses",
  ],
  semestral: [
    "semestral",
    "semester",
    "semestre",
    "6 months",
    "6 meses",
    "semi-annual",
    "semiannual",
    "semi anual",
    "6m",
    "6meses",
  ],
  anual: [
    "anual",
    "annual",
    "yearly",
    "ano",
    "year",
    "12 months",
    "12 meses",
    "12m",
    "12meses",
    "1y",
    "1 year",
  ],
};

function normalizeInput(raw: unknown): string {
  if (raw == null) return "";
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, " ");
  return s;
}

/**
 * Normaliza um valor único (ex.: "MONTHLY", "quarterly") para período.
 * Usado quando só intervalType vem mapeado ou para matching do plano (toggleOptionValue).
 */
export function normalizeBillingPeriod(raw: unknown): BillingPeriod | null {
  const s = normalizeInput(raw);
  if (!s) return null;

  for (const [period, aliases] of Object.entries(ALIASES) as [BillingPeriod, string[]][]) {
    if (aliases.some((a) => a === s || a.replace(/\s+/g, " ") === s)) return period;
  }
  return null;
}

function parseCount(raw: unknown): number | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw).trim(), 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Deriva período a partir de intervalType + intervalCount (ex.: MONTHS + 1 → mensal).
 * Ambos opcionais. Se só um vier, tenta inferir (ex.: intervalType "MONTHLY" → mensal).
 * Sem contagem de dias: usamos isso só para escolher o plano; os dias vêm do plano.
 */
export function derivePeriodFromInterval(
  intervalType: unknown,
  intervalCount: unknown
): BillingPeriod | null {
  const typeStr = normalizeInput(intervalType);
  const count = parseCount(intervalCount);

  // Só intervalType (ex.: "MONTHLY", "QUARTERLY", "ANNUAL")
  if (typeStr && count == null) {
    const byAlias = normalizeBillingPeriod(intervalType);
    if (byAlias) return byAlias;
    // "months", "days", "years" sem count → ambíguo
    return null;
  }

  // intervalType + intervalCount
  if (!typeStr || count == null) return null;

  if (typeStr === "months" || typeStr === "month") {
    if (count === 1) return "mensal";
    if (count === 3) return "trimestral";
    if (count === 6) return "semestral";
    if (count === 12) return "anual";
    return null;
  }

  if (typeStr === "days" || typeStr === "day") {
    if (count >= 28 && count <= 31) return "mensal";
    if (count >= 88 && count <= 92) return "trimestral";
    if (count >= 175 && count <= 185) return "semestral";
    if (count >= 364 && count <= 366) return "anual";
    return null;
  }

  if (typeStr === "years" || typeStr === "year") {
    if (count === 1) return "anual";
    return null;
  }

  return null;
}

/**
 * Resolve período usando regras configuráveis (ex.: MONTHS + 1 → mensal).
 * Comparação case-insensitive para intervalType.
 */
export function resolvePeriodFromRules(
  intervalType: unknown,
  intervalCount: unknown,
  rules: PeriodRule[]
): { period: BillingPeriod | null; planId: string | null } {
  const typeStr = normalizeInput(intervalType);
  const count = parseCount(intervalCount);
  if (!typeStr || count == null || rules.length === 0) {
    return { period: null, planId: null };
  }

  const match = rules.find(
    (r) => normalizeInput(r.intervalType) === typeStr && r.intervalCount === count
  );
  return match ? { period: match.period, planId: match.planId ?? null } : { period: null, planId: null };
}

const PERIOD_PERIOD: BillingPeriod[] = ["mensal", "trimestral", "semestral", "anual"];
function isPeriod(s: TypeMeaning | CountMeaning): s is BillingPeriod {
  return PERIOD_PERIOD.includes(s as BillingPeriod);
}

function normalizeForLookup(raw: unknown): string {
  if (raw == null) return "";
  return String(raw).trim().toLowerCase();
}

/**
 * Interpreta valor do payload (type) pelas regras. Ex.: "MONTHS" → month, "MONTHLY" → mensal.
 */
export function interpretType(
  raw: unknown,
  rules: PeriodTypeInterpretation[]
): TypeMeaning | null {
  const key = normalizeForLookup(raw);
  if (!key || rules.length === 0) return null;
  const r = rules.find((x) => normalizeForLookup(x.payloadValue) === key);
  return r ? r.meaning : null;
}

/**
 * Interpreta valor do payload (count) pelas regras. Ex.: "1" → 1, "3" → 3 ou "1" → mensal.
 */
export function interpretCount(
  raw: unknown,
  rules: PeriodCountInterpretation[]
): number | BillingPeriod | null {
  const key = normalizeForLookup(raw);
  if (key === "" || rules.length === 0) return null;
  const r = rules.find((x) => normalizeForLookup(x.payloadValue) === key);
  if (!r) return null;
  const m = r.meaning;
  if (typeof m === "number") return m;
  return m;
}

/**
 * (unit, number) → period. Fallback quando há type+count mas nenhuma period rule dá match.
 */
function unitCountToPeriod(unit: TypeMeaning, count: number): BillingPeriod | null {
  if (unit === "month") {
    if (count === 1) return "mensal";
    if (count === 3) return "trimestral";
    if (count === 6) return "semestral";
    if (count === 12) return "anual";
  }
  if (unit === "day") {
    if (count >= 28 && count <= 31) return "mensal";
    if (count >= 88 && count <= 92) return "trimestral";
    if (count >= 175 && count <= 185) return "semestral";
    if (count >= 364 && count <= 366) return "anual";
  }
  if (unit === "year" && count === 1) return "anual";
  return null;
}

/**
 * Resolve período usando PeriodConfig (interpretações + regras).
 * Suporta: só type, só count, ou type+count. Universal para diferentes payloads.
 */
export function resolvePeriodFromConfig(
  intervalTypeRaw: unknown,
  intervalCountRaw: unknown,
  config: PeriodConfig
): { period: BillingPeriod | null; planId: string | null } {
  const hasType = intervalTypeRaw != null && String(intervalTypeRaw).trim() !== "";
  const hasCount = intervalCountRaw != null && String(intervalCountRaw).trim() !== "";

  if (hasType && hasCount && config.periodRules.length > 0) {
    const byRules = resolvePeriodFromRules(
      intervalTypeRaw,
      intervalCountRaw,
      config.periodRules
    );
    if (byRules.period) return byRules;
  }

  if (hasType && hasCount && config.typeInterpretations.length > 0 && config.countInterpretations.length > 0) {
    const typeMeaning = interpretType(intervalTypeRaw, config.typeInterpretations);
    if (typeMeaning && (typeMeaning === "month" || typeMeaning === "day" || typeMeaning === "year")) {
      const countMeaning = interpretCount(intervalCountRaw, config.countInterpretations);
      const n = typeof countMeaning === "number" ? countMeaning : null;
      if (n != null) {
        const p = unitCountToPeriod(typeMeaning, n);
        return { period: p, planId: null };
      }
    }
  }

  if (hasCount && config.countInterpretations.length > 0) {
    const countMeaning = interpretCount(intervalCountRaw, config.countInterpretations);
    if (countMeaning != null && isPeriod(countMeaning)) {
      return { period: countMeaning, planId: null };
    }
  }

  return { period: null, planId: null };
}

/**
 * Dias a adicionar por período (Regras de período).
 * Usado para expiresAt; não usar durationDays do plano.
 */
const PERIOD_DURATION_DAYS: Record<BillingPeriod, number> = {
  mensal: 31,
  trimestral: 91,
  semestral: 182,
  anual: 365,
};

/**
 * Retorna os dias a adicionar para vencimento a partir do período resolvido
 * pelas Regras de período (mensal/trimestral/semestral/anual).
 */
export function periodToDurationDays(period: BillingPeriod | null): number | null {
  if (!period) return null;
  return PERIOD_DURATION_DAYS[period] ?? null;
}

/**
 * Retorna se um valor (ex.: toggleOptionValue do plano) corresponde ao período.
 * Usado para matching: "este plano é o mensal?" → normalizeBillingPeriod(toggle) === period.
 */
export function valueMatchesPeriod(value: string | null | undefined, period: BillingPeriod): boolean {
  return normalizeBillingPeriod(value) === period;
}
