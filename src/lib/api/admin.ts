/**
 * API admin da plataforma (requer role=admin e token da plataforma).
 */

import { apiRequestWithAuth } from "./client";
import { getPlatformToken } from "./platformAuth";

export type AdminUserItem = {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string | null;
  name: string | null;
  phone: string | null;
  cpf: string | null;
  plan: string | null;
  plan_period?: string | null;
  /** Nome do plano + período para exibição (ex.: "Plan Tester (Mensal)") */
  plan_display?: string | null;
  /** "Ativo" ou "Vencido" conforme data de vencimento */
  status_display?: "Ativo" | "Vencido";
};

export type AdminUsersResponse = {
  users: AdminUserItem[];
  total: number;
  active: number;
  inactive: number;
  expiring_in_7_days: number;
};

export type AdminUserRankingItem = {
  position: number;
  email: string;
  name: string | null;
  total_profit: number;
  operations_count: number;
  last_operation_at: string | null;
};

export type AdminUserRankingResponse = {
  items: AdminUserRankingItem[];
  total_users: number;
  period_start: string;
  period_end: string;
};

export type AdminCreateUserPayload = {
  email: string;
  password: string;
  name?: string;
  phone?: string;
  cpf?: string;
  plan?: string;
  plan_period?: string;
  role?: string;
  expires_at?: string | null;
};

export type AdminUpdateUserPayload = {
  email?: string;
  name?: string;
  phone?: string;
  cpf?: string;
  plan?: string;
  plan_period?: string;
  role?: string;
  is_active?: boolean;
  expires_at?: string | null;
};

export async function getAdminUsers(search?: string): Promise<AdminUsersResponse> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  const url = search?.trim()
    ? `/api/platform/admin/users?search=${encodeURIComponent(search.trim())}`
    : "/api/platform/admin/users";
  return apiRequestWithAuth<AdminUsersResponse>(url, token);
}

export async function getAdminUserRanking(params?: {
  preset?: "today" | "7d" | "30d" | "3m" | "current_month" | "custom";
  start?: string;
  end?: string;
  limit?: number;
}): Promise<AdminUserRankingResponse> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  const searchParams = new URLSearchParams();
  if (params?.preset) searchParams.set("preset", params.preset);
  if (params?.start) searchParams.set("start", params.start);
  if (params?.end) searchParams.set("end", params.end);
  if (typeof params?.limit === "number") searchParams.set("limit", String(params.limit));
  const qs = searchParams.toString();
  const url = qs ? `/api/platform/admin/users/ranking?${qs}` : "/api/platform/admin/users/ranking";
  return apiRequestWithAuth<AdminUserRankingResponse>(url, token);
}

export async function createAdminUser(payload: AdminCreateUserPayload): Promise<AdminUserItem> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return apiRequestWithAuth<AdminUserItem>("/api/platform/admin/users", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAdminUser(
  userId: string,
  payload: AdminUpdateUserPayload
): Promise<AdminUserItem> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return apiRequestWithAuth<AdminUserItem>(`/api/platform/admin/users/${userId}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteAdminUser(userId: string): Promise<void> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  await apiRequestWithAuth<unknown>(`/api/platform/admin/users/${userId}`, token, {
    method: "DELETE",
  });
}

/** Prompt de sistema usado pelo Gemini para gerar estratégias (apenas admin) */
export type GeminiPromptResponse = { prompt: string };

export async function getAdminGeminiPrompt(): Promise<GeminiPromptResponse> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return apiRequestWithAuth<GeminiPromptResponse>("/api/platform/admin/gemini-prompt", token);
}

export async function updateAdminGeminiPrompt(prompt: string): Promise<GeminiPromptResponse> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return apiRequestWithAuth<GeminiPromptResponse>("/api/platform/admin/gemini-prompt", token, {
    method: "PUT",
    body: JSON.stringify({ prompt }),
  });
}
