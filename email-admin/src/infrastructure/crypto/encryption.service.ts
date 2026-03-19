/**
 * Serviço de Criptografia AES
 *
 * Responsável por criptografar e descriptografar dados sensíveis usando AES-256.
 * Usado para armazenar senhas SMTP de forma reversível.
 *
 * @module infrastructure/crypto
 */

import CryptoJS from "crypto-js";
import { logger } from "../logger/logger";

/**
 * Obtém a chave de criptografia do ambiente
 * Se não estiver definida, usa uma chave padrão (apenas para desenvolvimento)
 */
function getEncryptionKey(): string {
  const key =
    process.env.ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    "default-encryption-key-change-in-production";

  if (!process.env.ENCRYPTION_KEY && process.env.NODE_ENV === "production") {
    logger.warn(
      "⚠️ ENCRYPTION_KEY não definida em produção. Usando JWT_SECRET como fallback. Configure ENCRYPTION_KEY no .env para maior segurança."
    );
  }

  // Garantir que a chave tenha pelo menos 32 caracteres para AES-256
  if (key.length < 32) {
    return key.padEnd(32, "0");
  }

  return key.substring(0, 32);
}

/**
 * Criptografa um texto usando AES-256
 */
export function encrypt(text: string): string {
  try {
    const key = getEncryptionKey();
    const encrypted = CryptoJS.AES.encrypt(text, key).toString();
    return encrypted;
  } catch (error) {
    logger.error("Erro ao criptografar texto", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("Erro ao criptografar dados");
  }
}

/**
 * Descriptografa um texto usando AES-256
 */
export function decrypt(encryptedText: string): string {
  try {
    const key = getEncryptionKey();
    const bytes = CryptoJS.AES.decrypt(encryptedText, key);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);

    if (!decrypted) {
      throw new Error("Falha ao descriptografar. Chave incorreta ou dados corrompidos.");
    }

    return decrypted;
  } catch (error) {
    logger.error("Erro ao descriptografar texto", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      "Erro ao descriptografar dados. Verifique se a chave de criptografia está correta."
    );
  }
}

/**
 * Verifica se uma string está criptografada (formato base64 do crypto-js)
 */
export function isEncrypted(text: string): boolean {
  try {
    // Tentar descriptografar - se funcionar, está criptografado
    const key = getEncryptionKey();
    const bytes = CryptoJS.AES.decrypt(text, key);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    return decrypted.length > 0;
  } catch {
    return false;
  }
}
