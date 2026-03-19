/**
 * API para PWA: VAPID público e salvar subscription (push).
 */

import { apiRequest, apiRequestWithAuth } from "./client";
import { getPlatformToken } from "./platformAuth";

export type PushSubscriptionKeys = { p256dh: string; auth: string };

export async function getPushVapidPublic(): Promise<{ publicKey: string }> {
  return apiRequest<{ publicKey: string }>("/api/platform/push-vapid-public");
}

export async function savePushSubscription(subscription: globalThis.PushSubscription, userAgent?: string): Promise<void> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  const keys = subscription.getKey("p256dh");
  const auth = subscription.getKey("auth");
  if (!keys || !auth) throw new Error("Subscription sem keys.");
  await apiRequestWithAuth<unknown>(
    "/api/platform/push-subscription",
    token,
    {
      method: "POST",
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: arrayBufferToBase64Url(keys),
          auth: arrayBufferToBase64Url(auth),
        },
        user_agent: userAgent || (typeof navigator !== "undefined" ? navigator.userAgent : undefined),
      }),
    }
  );
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | BufferSource): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
