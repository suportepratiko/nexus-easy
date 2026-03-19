#!/usr/bin/env node
/**
 * Garante que existe .vapid_webpush.json na raiz do projeto com chaves VAPID
 * geradas pela lib web-push (mesmo formato usado no envio = evita BadJwtToken).
 * Uso: node scripts/ensure-vapid.cjs [caminho/para/raiz]
 */
const path = require("path");
const fs = require("fs");

const root = process.argv[2] || path.resolve(__dirname, "..");
const vapidPath = path.join(root, ".vapid_webpush.json");

if (fs.existsSync(vapidPath)) {
  const data = JSON.parse(fs.readFileSync(vapidPath, "utf8"));
  if (data.publicKey && data.privateKey) {
    process.exit(0);
  }
}

const webpush = require("web-push");
const keys = webpush.generateVAPIDKeys();
fs.writeFileSync(vapidPath, JSON.stringify(keys, null, 2), "utf8");
console.log("VAPID keys created at", vapidPath);
