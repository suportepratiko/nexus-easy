type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Campos sensíveis que devem ser sanitizados nos logs
 */
const SENSITIVE_FIELDS = [
  "password",
  "token",
  "secret",
  "key",
  "authorization",
  "jwt",
  "apiKey",
  "api_key",
  "accessToken",
  "refreshToken",
  "sessionId",
  "session_id",
  "cookie",
  "creditCard",
  "credit_card",
  "cvv",
  "ssn",
  "cpf",
  "cnpj",
];

/**
 * Sanitiza dados sensíveis antes de logar
 */
function sanitizeData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === "string") {
    // Se for muito longo, pode ser um token
    if (data.length > 50) {
      return "***[REDACTED]***";
    }
    return data;
  }

  if (typeof data !== "object") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeData);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    
    // Verificar se é um campo sensível
    if (SENSITIVE_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()))) {
      sanitized[key] = "***[REDACTED]***";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

class Logger {
  private formatMessage(entry: LogEntry): string {
    const { level, message, timestamp, metadata } = entry;
    const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : "";
    return `[${timestamp.toISOString()}] [${level.toUpperCase()}] ${message}${metaStr}`;
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    // ✅ SEGURANÇA: Sanitizar dados sensíveis antes de logar
    const sanitizedMetadata = metadata ? (sanitizeData(metadata) as Record<string, unknown>) : undefined;
    
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      metadata: sanitizedMetadata,
    };

    const formatted = this.formatMessage(entry);

    switch (level) {
      case "error":
        console.error(formatted);
        break;
      case "warn":
        console.warn(formatted);
        break;
      case "debug":
        if (process.env.NODE_ENV === "development") {
          console.debug(formatted);
        }
        break;
      default:
        console.log(formatted);
    }
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log("info", message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log("warn", message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.log("error", message, metadata);
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log("debug", message, metadata);
  }

  /**
   * Log estruturado para eventos de segurança
   */
  security(event: string, metadata?: Record<string, unknown>): void {
    this.warn(`[SECURITY] ${event}`, metadata);
  }

  /**
   * Log estruturado para eventos de auditoria
   */
  audit(action: string, metadata?: Record<string, unknown>): void {
    this.info(`[AUDIT] ${action}`, metadata);
  }
}

export const logger = new Logger();
