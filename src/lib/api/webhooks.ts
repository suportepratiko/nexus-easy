import { apiRequestWithAuth } from "./client";
import { getPlatformToken } from "./platformAuth";

export type WebhookUserStatus = "active" | "expired";

export type Webhook = {
  id: string;
  name: string;
  secret: string;
  is_active: boolean;
  field_mappings: Record<string, unknown> | null;
  plan_id: string | null;
  user_status: WebhookUserStatus | null;
  created_at: string | null;
  updated_at: string | null;
};

export type WebhookPayload = {
  id: string;
  webhook_id: string;
  webhook_name?: string | null;
  payload: unknown;
  headers: Record<string, string> | null;
  method: string;
  ip_address: string | null;
  user_agent: string | null;
  processed: boolean;
  processed_at: string | null;
  error: string | null;
  process_details: unknown;
  response_body: unknown;
  processed_action?: string | null;
  is_test: boolean;
  created_at: string | null;
};

export type CreateWebhookPayload = {
  name: string;
  is_active?: boolean;
  plan_id?: string | null;
  user_status?: WebhookUserStatus | null;
  field_mappings?: Record<string, unknown> | null;
};

export type UpdateWebhookPayload = Partial<CreateWebhookPayload>;

export async function getWebhooks(): Promise<Webhook[]> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return apiRequestWithAuth<Webhook[]>("/api/platform/admin/webhooks", token);
}

export async function createWebhook(payload: CreateWebhookPayload): Promise<Webhook> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return apiRequestWithAuth<Webhook>("/api/platform/admin/webhooks", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateWebhook(id: string, payload: UpdateWebhookPayload): Promise<Webhook> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return apiRequestWithAuth<Webhook>(`/api/platform/admin/webhooks/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteWebhook(id: string): Promise<void> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  await apiRequestWithAuth<unknown>(`/api/platform/admin/webhooks/${id}`, token, {
    method: "DELETE",
  });
}

export async function getWebhookPayloads(params?: {
  webhookId?: string;
  processed?: boolean;
  limit?: number;
}): Promise<WebhookPayload[]> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");

  const searchParams = new URLSearchParams();
  if (params?.webhookId) searchParams.set("webhook_id", params.webhookId);
  if (params?.processed !== undefined) searchParams.set("processed", String(params.processed));
  if (params?.limit !== undefined) searchParams.set("limit", String(params.limit));

  const query = searchParams.toString();
  const url = query ? `/api/platform/admin/webhook-payloads?${query}` : "/api/platform/admin/webhook-payloads";

  return apiRequestWithAuth<WebhookPayload[]>(url, token);
}

export async function deleteWebhookPayload(id: string): Promise<void> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  await apiRequestWithAuth<unknown>(`/api/platform/admin/webhook-payloads/${id}`, token, {
    method: "DELETE",
  });
}

