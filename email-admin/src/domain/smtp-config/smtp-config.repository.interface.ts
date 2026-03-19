/**
 * Interface do Repositório de Configuração SMTP
 *
 * Define o contrato para operações de persistência de configurações SMTP.
 * Segue princípio de inversão de dependência (SOLID).
 */

import type { SmtpConfig } from "./smtp-config.entity";

export interface ISmtpConfigRepository {
  findDefault(): Promise<SmtpConfig | null>;
  findById(id: string): Promise<SmtpConfig | null>;
  create(data: Omit<SmtpConfig, "id" | "createdAt" | "updatedAt">): Promise<SmtpConfig>;
  update(
    id: string,
    data: Partial<Omit<SmtpConfig, "id" | "createdAt" | "updatedAt">>
  ): Promise<SmtpConfig>;
  delete(id: string): Promise<void>;
}
