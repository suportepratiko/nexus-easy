/**
 * API de autenticação da plataforma (login user/admin no backend).
 */

import { apiRequest, apiRequestWithAuth } from "./client";
import type { BotConfigPayload } from "./safirion";

const PLATFORM_TOKEN_KEY = "nexus_platform_token";
const PLATFORM_USER_KEY = "nexus_platform_user";

export type PlatformUser = {
  email: string;
  role: string;
  name?: string | null;
  phone?: string | null;
  cpf?: string | null;
};

export type PlatformLoginResponse = { token: string; user: PlatformUser };
export type PlatformBotConfigResponse = { config: BotConfigPayload | null };

export function getPlatformToken(): string | null {
  return localStorage.getItem(PLATFORM_TOKEN_KEY);
}

export function setPlatformToken(token: string): void {
  localStorage.setItem(PLATFORM_TOKEN_KEY, token);
}

export function getPlatformUser(): PlatformUser | null {
  const raw = localStorage.getItem(PLATFORM_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlatformUser;
  } catch {
    return null;
  }
}

export function setPlatformUser(user: PlatformUser): void {
  localStorage.setItem(PLATFORM_USER_KEY, JSON.stringify(user));
}

export function clearPlatformAuth(): void {
  localStorage.removeItem(PLATFORM_TOKEN_KEY);
  localStorage.removeItem(PLATFORM_USER_KEY);
}

export async function platformLogin(
  email: string,
  password: string
): Promise<PlatformLoginResponse> {
  const res = await apiRequest<PlatformLoginResponse>("/api/platform/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  setPlatformToken(res.token);
  setPlatformUser(res.user);
  return res;
}

export async function platformMe(): Promise<PlatformUser> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return apiRequestWithAuth<PlatformUser>("/api/platform/auth/me", token);
}

export async function getPlatformBotConfig(): Promise<PlatformBotConfigResponse> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return apiRequestWithAuth<PlatformBotConfigResponse>("/api/platform/bot-config", token);
}

export async function savePlatformBotConfig(config: BotConfigPayload): Promise<PlatformBotConfigResponse> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return apiRequestWithAuth<PlatformBotConfigResponse>("/api/platform/bot-config", token, {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

export async function updateProfile(data: { name?: string; phone?: string; cpf?: string }): Promise<PlatformUser> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  const updated = await apiRequestWithAuth<PlatformUser>("/api/platform/profile", token, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  setPlatformUser(updated);
  return updated;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  await apiRequestWithAuth("/api/platform/auth/change-password", token, {
    method: "POST",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

/** Tenta reconectar na corretora usando credenciais salvas no banco (sessão persistente) */
export async function reconnectBroker(): Promise<{ token: string; message: string }> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado na plataforma.");
  const res = await apiRequestWithAuth<{ token: string; message: string }>("/api/auth/reconnect", token, {
    method: "POST",
  });
  // Se retornou um token de corretora, salva ele.
  if (res.token) {
    localStorage.setItem("safirion_token", res.token);
  }
  return res;
}
