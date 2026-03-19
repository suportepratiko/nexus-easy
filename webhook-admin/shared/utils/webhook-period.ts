/**
 * Tipos e constantes para período de recorrência em webhooks.
 * Universal: várias plataformas de pagamento; payloads diferentes.
 * Em cada parte (Período / Valor): mapear path + interpretações "quando X → significa Y".
 */

export type BillingPeriod = "mensal" | "trimestral" | "semestral" | "anual";

/** Significado do tipo = sempre unidade (mês, dia, ano). Cálculo exato via tipo + valor nas Regras de período. */
export type TypeMeaning = "month" | "day" | "year";

/** Significado do valor: número (1,3,6,12) ou período quando só há count. */
export type CountMeaning = number | BillingPeriod;

export interface PeriodTypeInterpretation {
  payloadValue: string;
  meaning: TypeMeaning;
}

export interface PeriodCountInterpretation {
  payloadValue: string;
  meaning: CountMeaning;
}

export interface PeriodRule {
  intervalType: string;
  intervalCount: number;
  period: BillingPeriod;
  planId?: string | null;
}

export interface PeriodConfig {
  typeInterpretations: PeriodTypeInterpretation[];
  countInterpretations: PeriodCountInterpretation[];
  periodRules: PeriodRule[];
}

export const DEFAULT_PERIOD_RULES: PeriodRule[] = [
  { intervalType: "MONTHS", intervalCount: 1, period: "mensal" },
  { intervalType: "MONTHS", intervalCount: 3, period: "trimestral" },
  { intervalType: "MONTHS", intervalCount: 6, period: "semestral" },
  { intervalType: "MONTHS", intervalCount: 12, period: "anual" },
];

export const DEFAULT_TYPE_INTERPRETATIONS: PeriodTypeInterpretation[] = [
  { payloadValue: "MONTHS", meaning: "month" },
  { payloadValue: "MESES", meaning: "month" },
  { payloadValue: "MONTHLY", meaning: "month" },
  { payloadValue: "DAYS", meaning: "day" },
  { payloadValue: "DIAS", meaning: "day" },
  { payloadValue: "YEARS", meaning: "year" },
  { payloadValue: "ANOS", meaning: "year" },
  { payloadValue: "ANNUAL", meaning: "year" },
];

export const DEFAULT_COUNT_INTERPRETATIONS: PeriodCountInterpretation[] = [
  { payloadValue: "1", meaning: 1 },
  { payloadValue: "01", meaning: 1 },
  { payloadValue: "3", meaning: 3 },
  { payloadValue: "6", meaning: 6 },
  { payloadValue: "12", meaning: 12 },
];
