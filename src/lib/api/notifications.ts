/**
 * API de preferências de notificações PWA (gatilhos automáticos).
 * Mensagem personalizada do admin não pode ser desativada pelo usuário.
 */

import { apiRequestWithAuth } from "./client";
import { getPlatformToken } from "./platformAuth";

export type NotificationPreferenceItem = {
  trigger_key: string;
  label: string;
  enabled: boolean;
};

export type NotificationPreferences = {
  triggers: NotificationPreferenceItem[];
};

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return apiRequestWithAuth<NotificationPreferences>("/api/platform/notifications/preferences", token);
}

export async function updateNotificationPreferences(
  triggers: Record<string, boolean>
): Promise<NotificationPreferences> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return apiRequestWithAuth<NotificationPreferences>("/api/platform/notifications/preferences", token, {
    method: "PUT",
    body: JSON.stringify({ triggers }),
  });
}
