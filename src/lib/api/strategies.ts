/**
 * API de estratégias customizadas (Gemini).
 */

import { apiRequestWithAuth } from "./client";
import { getPlatformToken } from "./platformAuth";

export type GeminiDraftResponse = {
  description: string;
  explanation: string;
  code: string;
  confirmation_question: string;
};

export type CustomStrategy = {
  id: string;
  name: string;
  code: string;
  timeframe: "M1" | "M5";
  description: string | null;
  config?: any;
  created_at: string | null;
  wins: number;
  losses: number;
  win_rate: number | null;
};

export async function getGeminiStrategyDraft(
  prompt: string,
  timeframe: "M1" | "M5"
): Promise<GeminiDraftResponse> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  // Timeout 2min10: backend pode demorar até 90s (Gemini) + margem
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 130_000);
  try {
    return await apiRequestWithAuth<GeminiDraftResponse>(
      "/api/platform/strategies/gemini-draft",
      token,
      {
        method: "POST",
        body: JSON.stringify({ prompt: prompt.trim(), timeframe }),
        signal: ctrl.signal,
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function createCustomStrategy(payload: {
  name: string;
  code: string;
  timeframe: "M1" | "M5";
  description?: string;
  config?: any;
}): Promise<CustomStrategy> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return apiRequestWithAuth<CustomStrategy>("/api/platform/strategies", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateCustomStrategy(
  id: string,
  payload: {
    name?: string;
    code?: string;
    timeframe?: "M1" | "M5";
    description?: string;
    config?: any;
  }
): Promise<CustomStrategy> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return apiRequestWithAuth<CustomStrategy>(`/api/platform/strategies/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function listCustomStrategies(): Promise<CustomStrategy[]> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return apiRequestWithAuth<CustomStrategy[]>("/api/platform/strategies", token);
}

export async function deleteCustomStrategy(id: string): Promise<void> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  await apiRequestWithAuth<void>(`/api/platform/strategies/${id}`, token, {
    method: "DELETE",
  });
}
