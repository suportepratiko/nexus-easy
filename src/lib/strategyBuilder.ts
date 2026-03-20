/**
 * Gera código Python da função analyze(candles, asset=None) a partir de regras
 * configuradas pelo usuário. Sem walrus operator — compatível com exec() restrito.
 */

export type Timeframe = "M1" | "M5";

export type RuleType =
  | "rsi"
  | "ema_cross"
  | "sma_cross"
  | "macd"
  | "candle_body"
  | "candle_compare"
  | "candle_color"
  | "engulfment"
  | "bollinger"
  | "wick_size"
  | "breakout"
  | "consecutive"
  | "ma_compare";

export type CallPut = "call" | "put";

export type CandlePriceType = "close" | "open" | "max" | "min";

export interface RsiParams { period: number; threshold: number; }
export interface EmaSmaCrossParams { fast: number; slow: number; }
export interface MacdParams { fast?: number; slow?: number; signal?: number; }
export interface CandleCompareParams { priceType: CandlePriceType; barsAgo: number; currentGreater: boolean; }
export interface BollingerParams { period: number; stdMult: number; }
export interface CandleColorParams { candleIndex: number; green: boolean; }
export interface EngulfmentParams { bullish: boolean; }
export interface WickSizeParams { side: "upper" | "lower"; compareType: "body_ratio" | "larger_than_previous"; ratio: number; }
export interface BreakoutParams { period: number; boundary: "high" | "low"; }
export interface ConsecutiveParams { count: number; green: boolean; }
export interface MaCompareParams {
  maType: "ema" | "sma";
  period: number;
  comparison: "above" | "below";
  target: "price" | "ma";
  targetPriceType?: CandlePriceType;
  targetMaType?: "ema" | "sma";
  targetMaPeriod?: number;
}

export type RuleParams =
  | RsiParams | EmaSmaCrossParams | MacdParams | CandleCompareParams
  | BollingerParams | CandleColorParams | EngulfmentParams | WickSizeParams
  | BreakoutParams | ConsecutiveParams | MaCompareParams | Record<string, never>;

export interface StrategyRule {
  id: string;
  signal: CallPut;
  type: RuleType;
  params: RuleParams;
}

export interface ManualStrategyConfig {
  name: string;
  timeframe: Timeframe;
  description?: string;
  callRules: StrategyRule[];
  putRules: StrategyRule[];
}

const INDICATOR_MIN_CANDLES: Record<RuleType, number> = {
  rsi: 20, ema_cross: 30, sma_cross: 30, macd: 50,
  candle_body: 5, candle_compare: 15, candle_color: 10,
  engulfment: 5, bollinger: 30, wick_size: 10,
  breakout: 50, consecutive: 20, ma_compare: 50,
};

function minCandlesForRules(rules: StrategyRule[]): number {
  if (rules.length === 0) return 20;
  const vals = [
    ...rules.map(r => INDICATOR_MIN_CANDLES[r.type]),
    ...rules.filter(r => r.type === "candle_compare").map(r => (r.params as CandleCompareParams).barsAgo + 5),
    ...rules.filter(r => r.type === "breakout").map(r => (r.params as BreakoutParams).period + 5),
    ...rules.filter(r => r.type === "consecutive").map(r => (r.params as ConsecutiveParams).count + 5),
    ...rules.filter(r => r.type === "ma_compare").map(r => Math.max((r.params as MaCompareParams).period, (r.params as MaCompareParams).targetMaPeriod ?? 0) + 10),
    ...rules.filter(r => r.type === "ema_cross" || r.type === "sma_cross").map(r => Math.max((r.params as EmaSmaCrossParams).fast, (r.params as EmaSmaCrossParams).slow) + 10),
  ];
  return Math.max(20, ...vals);
}

/**
 * Gera declarações de variáveis indicadores necessárias para o conjunto de regras.
 * Evita duplicação de cálculos — retorna linhas Python para o topo da função.
 */
function buildIndicatorSetup(rules: StrategyRule[]): string[] {
  const lines: string[] = [];
  const declared = new Set<string>();

  const need = (key: string, line: string) => {
    if (!declared.has(key)) { declared.add(key); lines.push(line); }
  };

  for (const rule of rules) {
    const p = rule.params as any;
    switch (rule.type) {
      case "rsi": {
        const period = Math.max(5, Math.min(30, p.period || 14));
        need(`rsi_${period}`, `    _rsi_${period} = _rsi(closes, ${period})`);
        break;
      }
      case "ema_cross": {
        const fast = Math.max(2, Math.min(50, p.fast || 9));
        const slow = Math.max(fast + 1, Math.min(100, p.slow || 20));
        need(`ema_${fast}`, `    _ema_${fast} = _ema(closes, ${fast})`);
        need(`ema_${slow}`, `    _ema_${slow} = _ema(closes, ${slow})`);
        break;
      }
      case "sma_cross": {
        const fast = Math.max(2, Math.min(50, p.fast || 9));
        const slow = Math.max(fast + 1, Math.min(100, p.slow || 20));
        need(`sma_${fast}`, `    _sma_${fast} = _sma(closes, ${fast})`);
        need(`sma_${slow}`, `    _sma_${slow} = _sma(closes, ${slow})`);
        break;
      }
      case "macd": {
        const fast = p.fast ?? 12; const slow2 = p.slow ?? 26; const sig = p.signal ?? 9;
        need(`macd_${fast}_${slow2}_${sig}`, `    _macd_${fast}_${slow2}_${sig} = _macd(closes, ${fast}, ${slow2}, ${sig})`);
        break;
      }
      case "bollinger": {
        const period = Math.max(5, Math.min(50, p.period ?? 20));
        const std = Math.max(1, Math.min(3, p.stdMult ?? 2));
        need(`bb_${period}_${std}`, `    _bb_${period}_${std} = _bollinger(closes, ${period}, ${std})`);
        break;
      }
      case "ma_compare": {
        const maFunc = p.maType === "ema" ? "_ema" : "_sma";
        const period = Math.max(2, Math.min(200, p.period || 20));
        need(`${p.maType}_${period}`, `    _ma_${p.maType}_${period} = ${maFunc}(closes, ${period})`);
        if (p.target === "ma") {
          const tFunc = p.targetMaType === "ema" ? "_ema" : "_sma";
          const tPeriod = Math.max(2, Math.min(200, p.targetMaPeriod || 50));
          need(`${p.targetMaType}_${tPeriod}`, `    _ma_${p.targetMaType}_${tPeriod} = ${tFunc}(closes, ${tPeriod})`);
        }
        break;
      }
    }
  }
  return lines;
}

function priceArr(priceType: CandlePriceType): string {
  switch (priceType) {
    case "close": return "closes";
    case "open": return "opens";
    case "max": return "highs";
    case "min": return "lows";
    default: return "closes";
  }
}

/**
 * Gera a condição Python para uma regra. Assume que os indicadores já foram calculados
 * pelas declarações de `buildIndicatorSetup`.
 */
function buildCondition(rule: StrategyRule): string | null {
  const p = rule.params as any;
  switch (rule.type) {
    case "rsi": {
      const period = Math.max(5, Math.min(30, p.period || 14));
      const th = p.threshold ?? (rule.signal === "call" ? 30 : 70);
      const op = rule.signal === "call" ? "<" : ">";
      return `len(_rsi_${period}) > 0 and _rsi_${period}[-1] ${op} ${th}`;
    }
    case "ema_cross": {
      const fast = Math.max(2, Math.min(50, p.fast || 9));
      const slow = Math.max(fast + 1, Math.min(100, p.slow || 20));
      const op = rule.signal === "call" ? ">" : "<";
      return `len(_ema_${fast}) > 0 and len(_ema_${slow}) > 0 and _ema_${fast}[-1] ${op} _ema_${slow}[-1]`;
    }
    case "sma_cross": {
      const fast = Math.max(2, Math.min(50, p.fast || 9));
      const slow = Math.max(fast + 1, Math.min(100, p.slow || 20));
      const op = rule.signal === "call" ? ">" : "<";
      return `len(_sma_${fast}) > 0 and len(_sma_${slow}) > 0 and _sma_${fast}[-1] ${op} _sma_${slow}[-1]`;
    }
    case "macd": {
      const fast = p.fast ?? 12; const slow2 = p.slow ?? 26; const sig = p.signal ?? 9;
      const op = rule.signal === "call" ? "> 0" : "< 0";
      return `len(_macd_${fast}_${slow2}_${sig}[2]) > 0 and _macd_${fast}_${slow2}_${sig}[2][-1] ${op}`;
    }
    case "candle_body":
      return rule.signal === "call" ? "closes[-1] > opens[-1]" : "closes[-1] < opens[-1]";
    case "candle_compare": {
      const barsAgo = Math.max(1, Math.min(10, p.barsAgo ?? 2));
      const arr = priceArr(p.priceType ?? "close");
      const op = p.currentGreater ? ">" : "<";
      return `${arr}[-1] ${op} ${arr}[-1 - ${barsAgo}]`;
    }
    case "candle_color": {
      const idx = Math.max(0, Math.min(10, p.candleIndex ?? 0));
      const op = p.green ? ">" : "<";
      return `closes[-1 - ${idx}] ${op} opens[-1 - ${idx}]`;
    }
    case "engulfment":
      if (p.bullish) {
        // Vela atual verde fechando ACIMA da máxima da vela vermelha anterior (engolfo altista)
        return "closes[-1] > opens[-1] and closes[-2] < opens[-2] and closes[-1] > highs[-2]";
      }
      // Vela atual vermelha fechando ABAIXO da mínima da vela verde anterior (engolfo baixista)
      return "closes[-1] < opens[-1] and closes[-2] > opens[-2] and closes[-1] < lows[-2]";
    case "bollinger": {
      const period = Math.max(5, Math.min(50, p.period ?? 20));
      const std = Math.max(1, Math.min(3, p.stdMult ?? 2));
      // _bollinger retorna (middle, upper, lower) → [0]=middle, [1]=upper, [2]=lower
      if (rule.signal === "call") {
        // Preço abaixo da banda inferior → sobrevenda → CALL
        return `len(_bb_${period}_${std}[2]) > 0 and closes[-1] < _bb_${period}_${std}[2][-1]`;
      } else {
        // Preço acima da banda superior → sobrecompra → PUT
        return `len(_bb_${period}_${std}[1]) > 0 and closes[-1] > _bb_${period}_${std}[1][-1]`;
      }
    }
    case "wick_size": {
      const bodyExpr = "abs(closes[-1] - opens[-1])";
      if (p.side === "upper") {
        const wickExpr = "highs[-1] - max(opens[-1], closes[-1])";
        if (p.compareType === "body_ratio") {
          return `${wickExpr} > ${bodyExpr} * ${p.ratio ?? 1.5}`;
        } else {
          return `${wickExpr} > (highs[-2] - max(opens[-2], closes[-2]))`;
        }
      } else {
        const wickExpr = "min(opens[-1], closes[-1]) - lows[-1]";
        if (p.compareType === "body_ratio") {
          return `${wickExpr} > ${bodyExpr} * ${p.ratio ?? 1.5}`;
        } else {
          return `${wickExpr} > (min(opens[-2], closes[-2]) - lows[-2])`;
        }
      }
    }
    case "breakout": {
      const period = Math.max(5, Math.min(50, p.period ?? 20));
      if (p.boundary === "high") {
        return `closes[-1] > max(highs[-${period + 1}:-1])`;
      } else {
        return `closes[-1] < min(lows[-${period + 1}:-1])`;
      }
    }
    case "consecutive": {
      const count = Math.max(2, Math.min(10, p.count ?? 3));
      const cond = p.green ? "c['close'] > c['open']" : "c['close'] < c['open']";
      return `all(${cond} for c in candles[-${count}:])`;
    }
    case "ma_compare": {
      const period = Math.max(2, Math.min(200, p.period || 20));
      const comp = p.comparison === "above" ? ">" : "<";
      if (p.target === "price") {
        const arr = priceArr(p.targetPriceType || "close");
        return `len(_ma_${p.maType}_${period}) > 0 and ${arr}[-1] ${comp} _ma_${p.maType}_${period}[-1]`;
      } else {
        const tPeriod = Math.max(2, Math.min(200, p.targetMaPeriod || 50));
        return `len(_ma_${p.maType}_${period}) > 0 and len(_ma_${p.targetMaType ?? "ema"}_${tPeriod}) > 0 and _ma_${p.maType}_${period}[-1] ${comp} _ma_${p.targetMaType ?? "ema"}_${tPeriod}[-1]`;
      }
    }
    default:
      return null;
  }
}

export function generateStrategyCode(config: ManualStrategyConfig): string {
  const allRules = [...config.callRules, ...config.putRules];
  const minLen = minCandlesForRules(allRules);

  const lines: string[] = [
    "def analyze(candles, asset=None):",
    `    if len(candles) < ${minLen}:`,
    "        return None",
    "",
    "    closes = [float(c['close']) for c in candles]",
    "    opens  = [float(c['open'])  for c in candles]",
    "    highs  = [float(c['max'])   for c in candles]",
    "    lows   = [float(c['min'])   for c in candles]",
  ];

  // Pre-compute indicators (no walrus operator)
  const setupLines = buildIndicatorSetup(allRules);
  if (setupLines.length > 0) {
    lines.push("");
    lines.push(...setupLines);
  }

  lines.push("");

  // CALL conditions
  const callConds = config.callRules.map(buildCondition).filter((c): c is string => !!c);
  if (callConds.length > 0) {
    const combined = callConds.length === 1
      ? callConds[0]
      : callConds.map(c => `(${c})`).join(" and ");
    lines.push(`    if ${combined}:`);
    lines.push('        return "call"');
    lines.push("");
  }

  // PUT conditions
  const putConds = config.putRules.map(buildCondition).filter((c): c is string => !!c);
  if (putConds.length > 0) {
    const combined = putConds.length === 1
      ? putConds[0]
      : putConds.map(c => `(${c})`).join(" and ");
    const keyword = callConds.length > 0 ? "elif" : "if";
    lines.push(`    ${keyword} ${combined}:`);
    lines.push('        return "put"');
    lines.push("");
  }

  lines.push("    return None");
  return lines.join("\n");
}

export function generateStrategyDescription(config: ManualStrategyConfig): string {
  const parts: string[] = [];
  if (config.callRules.length > 0) {
    parts.push("CALL: " + config.callRules.map(ruleShortLabel).join("; "));
  }
  if (config.putRules.length > 0) {
    parts.push("PUT: " + config.putRules.map(ruleShortLabel).join("; "));
  }
  return parts.join(" · ") || "Estratégia manual.";
}

function ruleShortLabel(rule: StrategyRule): string {
  const p = rule.params as any;
  switch (rule.type) {
    case "rsi": return `Força RSI(${p.period ?? 14})`;
    case "ema_cross": return "Cruzamento de EMAs";
    case "sma_cross": return "Cruzamento de SMAs";
    case "macd": return "Momentum MACD";
    case "candle_body": return rule.signal === "call" ? "Vela de Alta" : "Vela de Baixa";
    case "candle_compare": return `Preço ${PRICE_TYPE_LABELS[p.priceType as CandlePriceType]} vs [${p.barsAgo}]`;
    case "bollinger": return "Extremo de Bollinger";
    case "candle_color": return "Cor específica";
    case "engulfment": return "Padrão Engolfo";
    case "wick_size": return `Pavio Longo (${(p.side as string) === "upper" ? "superior" : "inferior"})`;
    case "breakout": return "Rompimento de Máxima/Mínima";
    case "consecutive": return `${p.count ?? 3} velas seguidas`;
    case "ma_compare": return `Média ${(p.maType as string).toUpperCase()}(${p.period ?? 20})`;
    default: return rule.type;
  }
}

export const PRICE_TYPE_LABELS: Record<CandlePriceType, string> = {
  close: "fechamento",
  open: "abertura",
  max: "máxima (pavio superior)",
  min: "mínima (pavio inferior)",
};

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  // Velas
  candle_body:    "Cor da vela (Alta ou Baixa)",
  consecutive:    "Sequência de velas (Ex: 3 verdes seguidas)",
  wick_size:      "Pavio de rejeição (mercado recusou o preço)",
  breakout:       "Rompimento de máxima ou mínima",
  candle_compare: "Comparar preço atual com vela anterior",
  engulfment:     "Vela engolfo (reversão de tendência)",
  candle_color:   "Cor de uma vela específica atrás",
  // Indicadores
  rsi:            "RSI — mercado sobrecomprado ou sobrevendido",
  bollinger:      "Bandas de Bollinger — preço saiu do canal",
  ema_cross:      "Cruzamento de Médias (EMA)",
  sma_cross:      "Cruzamento de Médias (SMA)",
  macd:           "MACD — força e direção do movimento",
  ma_compare:     "Média Móvel vs Preço (seguir tendência)",
};

export const RULE_TYPE_HINT: Record<RuleType, string> = {
  candle_body:    "A vela fechou verde (sinal de compra) ou vermelha (sinal de venda)? Regra mais simples e usada por iniciantes.",
  consecutive:    "Aguarda N velas seguidas da mesma cor antes de entrar. Ex: 3 verdes = sinal de call.",
  wick_size:      "Pavio longo significa que o mercado tentou ir para um lado mas foi rejeitado. Ótimo para reversões.",
  breakout:       "O preço rompeu a máxima ou mínima das últimas velas? Pode indicar continuação forte de tendência.",
  candle_compare: "Compara o preço atual com o de uma vela anterior. Ex: fechamento atual maior que o de 2 velas atrás.",
  engulfment:     "A vela atual 'engoliu' a anterior inteira. Sinal clássico de reversão usado por traders experientes.",
  candle_color:   "Define qual cor deve ter uma vela específica. Ex: a segunda vela atrás deve ser verde.",
  rsi:            "Indicador que mede se o mercado subiu ou caiu demais. Abaixo de 30 = sobrevendido (call). Acima de 70 = sobrecomprado (put).",
  bollinger:      "Três linhas que formam um canal. Quando o preço toca a banda de fora, tende a voltar ao centro.",
  ema_cross:      "Duas médias móveis exponenciais (rápida e lenta). Quando a rápida cruza a lenta, indica mudança de tendência.",
  sma_cross:      "Igual ao cruzamento de EMA, mas usa médias simples. Reação mais lenta, mas mais estável.",
  macd:           "Indicador que mostra se a força do movimento está aumentando ou diminuindo. Bom para confirmar entradas.",
  ma_compare:     "Compara uma média móvel com o preço atual ou com outra média. Útil para seguir tendências maiores.",
};
