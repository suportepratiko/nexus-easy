/**
 * Endpoints da API Safirion (proxy backend).
 * Usar após login para obter token e chamar as rotas autenticadas.
 */

import { apiRequest, apiRequestWithAuth } from "./client";

export type LoginPayload = { email: string; password: string; remember?: boolean };
export type LoginResponse = { token: string; message: string };
export type BalanceItem = { id: number; amount: number; currency?: string; type?: number };
export type BalancesResponse = { balances: BalanceItem[] };
export type ProfileResponse = Record<string, unknown>;

const AUTH_TOKEN_KEY = "safirion_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const pToken = localStorage.getItem("nexus_platform_token");
  const headers: Record<string, string> = {};
  if (pToken) headers["Authorization"] = `Bearer ${pToken}`;

  const res = await apiRequest<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
    headers,
  });
  if (res.token) setStoredToken(res.token);
  return res;
}

export async function logout(): Promise<{ message: string }> {
  const token = getStoredToken();
  const res = await apiRequest<{ message: string }>("/api/auth/logout", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  clearStoredToken();
  return res;
}

export async function getBalances(): Promise<BalancesResponse> {
  const token = getStoredToken();
  if (!token) throw new Error("Não autenticado. Faça login.");
  return apiRequestWithAuth<BalancesResponse>("/api/balances", token);
}

export async function getProfile(): Promise<ProfileResponse> {
  const token = getStoredToken();
  if (!token) throw new Error("Não autenticado. Faça login.");
  return apiRequestWithAuth<ProfileResponse>("/api/profile", token);
}

export async function healthCheck(): Promise<{ status: string; safirion_available?: boolean }> {
  return apiRequest<{ status: string; safirion_available?: boolean }>("/health");
}

// ---------- Robô real (backend) ----------

export type BotConfigPayload = {
  entryValue: number;
  payout: number;
  stopGainMode: string;
  stopGainValue: number;
  stopLossMode: string;
  stopLossValue: number;
  martingale: string;
  bankroll: number;
  /** Modalidade: "digital" e/ou "binary" */
  assetModality?: ("digital" | "binary")[];
  /** Mercado: "open" e/ou "otc" */
  marketType?: ("open" | "otc")[];
  /** Estratégias ativas: "otc", "supertrend" ou "custom:uuid" */
  strategies?: string[];
  /** Estratégias customizadas (id, name, code, timeframe) — para execução no bot */
  customStrategies?: { id: string; name: string; code: string; timeframe: "M1" | "M5" }[];
  /** Se true, entra na próxima vela após o gatilho. */
  waitNextCandle?: boolean;
};

export type BotOperationPayload = {
  id: string;
  // Epoch seconds (number) vindo do backend; mantemos string | number para compatibilidade.
  timestamp: string | number;
  asset: string;
  direction: "call" | "put";
  entryValue: number;
  result: "win" | "loss" | "draw" | "pending";
  profit: number;
  martingaleLevel: number;
  balanceAfter: number;
  strategy?: string;
  duration?: number;
};

export type BotStatusResponse = {
  status: "idle" | "running" | "stopped";
  running: boolean;
  config?: BotConfigPayload;
  start_balance?: number;
  current_balance?: number;
  total_profit?: number;
  operations?: BotOperationPayload[];
  stop_reason?: "stop_gain" | "stop_loss" | null;
  error?: string;
};

export async function startBot(config: BotConfigPayload): Promise<{ message: string; status: string }> {
  const token = getStoredToken();
  if (!token) throw new Error("Não autenticado na corretora. Faça login.");
  return apiRequestWithAuth<{ message: string; status: string }>("/api/bot/start", token, {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export async function stopBot(): Promise<{ message: string; status: string }> {
  const token = getStoredToken();
  if (!token) throw new Error("Não autenticado na corretora.");
  return apiRequestWithAuth<{ message: string; status: string }>("/api/bot/stop", token, {
    method: "POST",
  });
}

export async function resetBot(): Promise<{ message: string; status: string }> {
  const token = getStoredToken();
  if (!token) throw new Error("Não autenticado na corretora.");
  return apiRequestWithAuth<{ message: string; status: string }>("/api/bot/reset", token, {
    method: "POST",
  });
}

export async function getBotStatus(): Promise<BotStatusResponse> {
  const token = getStoredToken();
  if (!token) return { status: "idle", running: false, operations: [], current_balance: 0, total_profit: 0, stop_reason: null };
  return apiRequestWithAuth<BotStatusResponse>("/api/bot/status", token);
}

/** Retorna URL do WebSocket para monitoramento em tempo real */
export function getBotWebSocketURL(): string | null {
  const token = getStoredToken();
  if (!token) return null;

  // Em produção BASE_URL pode ser absoluto, em dev costuma ser ""
  const isProd = import.meta.env.PROD;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  if (!isProd) {
    // Em dev, usamos o proxy do Vite configurado no vite.config.ts (porta 8000 -> 8001)
    const host = window.location.host;
    return `${protocol}//${host}/ws/bot?token=${token}`;
  }

  // Em produção/Build, usamos o host atual
  const host = window.location.host;
  return `${protocol}//${host}/ws/bot?token=${token}`;
}
