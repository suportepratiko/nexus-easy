/**
 * Entidade de Configuração SMTP
 *
 * Representa uma configuração SMTP para envio de emails.
 * A senha é armazenada criptografada no banco de dados.
 * Segue padrão DDD com separação de concerns.
 */

export interface SmtpConfigEntity {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  authUser: string;
  authPassword: string; // Sempre criptografada
  fromEmail: string;
  fromName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class SmtpConfig {
  private constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly host: string,
    public readonly port: number,
    public readonly secure: boolean,
    public readonly authUser: string,
    public readonly authPassword: string, // Hash da senha
    public readonly fromEmail: string,
    public readonly fromName: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  static create(data: Omit<SmtpConfigEntity, "id" | "createdAt" | "updatedAt">): SmtpConfig {
    const now = new Date();
    return new SmtpConfig(
      "",
      data.name,
      data.host,
      data.port,
      data.secure,
      data.authUser,
      data.authPassword, // Deve vir já criptografada
      data.fromEmail,
      data.fromName,
      now,
      now
    );
  }

  static fromPrisma(data: SmtpConfigEntity): SmtpConfig {
    return new SmtpConfig(
      data.id,
      data.name,
      data.host,
      data.port,
      data.secure,
      data.authUser,
      data.authPassword,
      data.fromEmail,
      data.fromName,
      data.createdAt,
      data.updatedAt
    );
  }

  toPrisma(): SmtpConfigEntity {
    return {
      id: this.id,
      name: this.name,
      host: this.host,
      port: this.port,
      secure: this.secure,
      authUser: this.authUser,
      authPassword: this.authPassword,
      fromEmail: this.fromEmail,
      fromName: this.fromName,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
