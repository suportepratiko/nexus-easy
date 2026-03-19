#!/usr/bin/env node
/**
 * Envia uma notificação Web Push usando a lib web-push (Node).
 * Lê da stdin um JSON: { "subscription": { "endpoint", "keys": { "p256dh", "auth" } }, "payload": string }
 * Chaves VAPID em .vapid_webpush.json (ou VAPID_KEYS_PATH). Sai 0 se sucesso, 1 se falha.
 */
const path = require("path");
const fs = require("fs");

const root = process.env.VAPID_KEYS_PATH
  ? path.dirname(process.env.VAPID_KEYS_PATH)
  : path.resolve(__dirname, "..");
const vapidFile = process.env.VAPID_KEYS_PATH || path.join(root, ".vapid_webpush.json");

if (!fs.existsSync(vapidFile)) {
  console.error("Missing .vapid_webpush.json. Run: node scripts/ensure-vapid.cjs");
  process.exit(1);
}

const vapidKeys = JSON.parse(fs.readFileSync(vapidFile, "utf8"));
const webpush = require("web-push");

// Apple (web.push.apple.com) rejeita BadJwtToken com mailto em domínio .local; usar formato padrão sem espaço
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:noreply@example.com";
webpush.setVapidDetails(
  vapidSubject,
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  let data;
  try {
    data = JSON.parse(input);
  } catch (e) {
    console.error("Invalid JSON stdin:", e.message);
    process.exit(1);
  }
  const subscription = data.subscription;
  const payload = data.payload != null ? data.payload : "";
  if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
    console.error("subscription.endpoint and subscription.keys.p256dh, .auth required");
    process.exit(1);
  }
  webpush.sendNotification(subscription, payload)
    .then(() => process.exit(0))
    .catch((err) => {
      const statusCode = err.statusCode != null ? err.statusCode : "";
      const body = (err.body != null ? err.body : err.message || String(err)).trim();
      if (statusCode) {
        console.error(`status: ${statusCode}`);
        if (body) console.error(`body: ${body}`);
      } else {
        console.error(body || err.message || err);
      }
      process.exit(1);
    });
});
