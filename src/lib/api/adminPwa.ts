/**
 * API admin para PWA: templates, envio de mensagem personalizada, estatísticas.
 */

import { apiRequestWithAuth } from "./client";
import { getPlatformToken } from "./platformAuth";

export type PwaTemplate = {
  trigger_key: string;
  title_template: string;
  body_template: string;
  is_active: boolean;
};

export type PwaStats = {
  subscribers_count: number;
  custom_messages_sent: number;
};

export async function getPwaTemplates(): Promise<PwaTemplate[]> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return apiRequestWithAuth<PwaTemplate[]>("/api/platform/admin/pwa/templates", token);
}

export async function updatePwaTemplate(
  triggerKey: string,
  payload: { title_template?: string; body_template?: string; is_active?: boolean }
): Promise<PwaTemplate> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return apiRequestWithAuth<PwaTemplate>(`/api/platform/admin/pwa/templates/${encodeURIComponent(triggerKey)}`, token, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export type PwaHistoryItem = {
  id: string;
  title: string;
  body: string;
  url: string | null;
  sent_count: number;
  created_at: string;
};

export async function sendPwaCustomMessage(
  title: string,
  body: string,
  url?: string | null
): Promise<{ sent: number; total_subscribers: number }> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return apiRequestWithAuth<{ sent: number; total_subscribers: number }>("/api/platform/admin/pwa/send", token, {
    method: "POST",
    body: JSON.stringify({ title, body, url: url || undefined }),
  });
}

export async function getPwaHistory(limit = 50): Promise<PwaHistoryItem[]> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return apiRequestWithAuth<PwaHistoryItem[]>(
    `/api/platform/admin/pwa/history?limit=${limit}`,
    token
  );
}

export async function getPwaStats(): Promise<PwaStats> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return apiRequestWithAuth<PwaStats>("/api/platform/admin/pwa/stats", token);
}

export async function deletePwaHistoryItem(id: string): Promise<void> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return apiRequestWithAuth<void>(`/api/platform/admin/pwa/history/${encodeURIComponent(id)}`, token, {
    method: "DELETE",
  });
}

export async function deletePwaHistoryAll(): Promise<void> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return apiRequestWithAuth<void>("/api/platform/admin/pwa/history", token, {
    method: "DELETE",
  });
}
