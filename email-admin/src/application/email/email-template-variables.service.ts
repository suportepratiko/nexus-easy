/**
 * Serviço de Variáveis de Template de Email
 *
 * Responsável por substituir variáveis nos templates de email.
 * Segue princípios DDD e SOLID.
 *
 * @module application/email
 */

/**
 * Variáveis disponíveis para templates de email
 */
export interface EmailTemplateVariables {
  // Variáveis básicas do usuário
  nome?: string; // Nome do usuário
  email?: string; // Email do usuário

  // Variáveis de data/hora
  data?: string; // Data atual formatada (DD/MM/YYYY)
  dataHora?: string; // Data e hora atual formatadas (DD/MM/YYYY HH:mm)
  dataCriacao?: string; // Data de criação do usuário (DD/MM/YYYY)
  dataCriacaoFormatada?: string; // Data de criação formatada (DD/MM/YYYY HH:mm)
  dataAtualizacao?: string; // Data de atualização (DD/MM/YYYY)
  dataAtualizacaoFormatada?: string; // Data de atualização formatada (DD/MM/YYYY HH:mm)
  dataReset?: string; // Data de reset de senha (DD/MM/YYYY)
  dataResetFormatada?: string; // Data de reset formatada (DD/MM/YYYY HH:mm)

  // Variáveis do sistema/aplicação
  appNome?: string; // Nome da aplicação
  appUrl?: string; // URL da aplicação
  linkLogin?: string; // Link para página de login
  linkDashboard?: string; // Link para dashboard
  linkPerfil?: string; // Link para perfil do usuário

  // Variáveis de recuperação de senha
  resetUrl?: string; // URL de recuperação de senha
  resetLink?: string; // URL de recuperação de senha (alternativo)
  reset_link?: string; // URL de recuperação de senha (snake_case)
  token?: string; // Token de recuperação de senha
  dataExpiracao?: string; // Data de expiração do token (DD/MM/YYYY)
  dataExpiracaoFormatada?: string; // Data de expiração formatada (DD/MM/YYYY HH:mm)
  horasValidade?: string; // Horas de validade do token
  minutosValidade?: string; // Minutos de validade do token

  // Variáveis de segurança
  ipAddress?: string; // Endereço IP do usuário
  userAgent?: string; // User agent do navegador

  // Variáveis de atualização de usuário
  camposAlterados?: string; // Lista de campos alterados

  [key: string]: string | undefined; // Permite variáveis customizadas
}

/**
 * Lista de variáveis padrão disponíveis
 */
export const AVAILABLE_EMAIL_VARIABLES: Array<{
  name: string;
  description: string;
  example: string;
  category: "user" | "date" | "system" | "security" | "password-reset" | "links";
}> = [
  // Variáveis do usuário
  {
    name: "{{nome}}",
    description: "Nome do usuário",
    example: "João Silva",
    category: "user",
  },
  {
    name: "{{email}}",
    description: "Email do usuário",
    example: "joao@exemplo.com",
    category: "user",
  },
  // Variáveis de data/hora
  {
    name: "{{data}}",
    description: "Data atual formatada (DD/MM/YYYY)",
    example: "29/11/2025",
    category: "date",
  },
  {
    name: "{{dataHora}}",
    description: "Data e hora atual formatadas (DD/MM/YYYY HH:mm)",
    example: "29/11/2025 14:30",
    category: "date",
  },
  {
    name: "{{dataCriacao}}",
    description: "Data de criação do usuário (DD/MM/YYYY)",
    example: "29/11/2025",
    category: "date",
  },
  {
    name: "{{dataCriacaoFormatada}}",
    description: "Data de criação formatada (DD/MM/YYYY HH:mm)",
    example: "29/11/2025 14:30",
    category: "date",
  },
  {
    name: "{{dataAtualizacao}}",
    description: "Data de atualização (DD/MM/YYYY)",
    example: "29/11/2025",
    category: "date",
  },
  {
    name: "{{dataAtualizacaoFormatada}}",
    description: "Data de atualização formatada (DD/MM/YYYY HH:mm)",
    example: "29/11/2025 14:30",
    category: "date",
  },
  {
    name: "{{dataReset}}",
    description: "Data de reset de senha (DD/MM/YYYY)",
    example: "29/11/2025",
    category: "date",
  },
  {
    name: "{{dataResetFormatada}}",
    description: "Data de reset formatada (DD/MM/YYYY HH:mm)",
    example: "29/11/2025 14:30",
    category: "date",
  },
  // Variáveis do sistema
  {
    name: "{{appNome}}",
    description: "Nome da aplicação",
    example: "Pratikogram",
    category: "system",
  },
  {
    name: "{{appUrl}}",
    description: "URL da aplicação",
    example: "https://pg.pratiko.app.br",
    category: "system",
  },
  // Variáveis de links
  {
    name: "{{linkLogin}}",
    description: "Link para página de login",
    example: "https://pg.pratiko.app.br/login",
    category: "links",
  },
  {
    name: "{{linkDashboard}}",
    description: "Link para dashboard",
    example: "https://pg.pratiko.app.br/dashboard",
    category: "links",
  },
  {
    name: "{{linkPerfil}}",
    description: "Link para perfil do usuário",
    example: "https://pg.pratiko.app.br/dashboard/profile",
    category: "links",
  },
  // Variáveis de recuperação de senha
  {
    name: "{{resetUrl}}",
    description: "URL completa de recuperação de senha",
    example: "https://app.pratikogram.com.br/reset-password?token=abc123",
    category: "password-reset",
  },
  {
    name: "{{resetLink}}",
    description: "Link de recuperação de senha (alternativo)",
    example: "https://app.pratikogram.com.br/reset-password?token=abc123",
    category: "password-reset",
  },
  {
    name: "{{token}}",
    description: "Token de recuperação de senha",
    example: "abc123def456",
    category: "password-reset",
  },
  {
    name: "{{dataExpiracao}}",
    description: "Data de expiração do token (DD/MM/YYYY)",
    example: "29/11/2025",
    category: "password-reset",
  },
  {
    name: "{{dataExpiracaoFormatada}}",
    description: "Data de expiração formatada (DD/MM/YYYY HH:mm)",
    example: "29/11/2025 15:30",
    category: "password-reset",
  },
  {
    name: "{{horasValidade}}",
    description: "Horas de validade do token",
    example: "1",
    category: "password-reset",
  },
  {
    name: "{{minutosValidade}}",
    description: "Minutos de validade do token",
    example: "60",
    category: "password-reset",
  },
  // Variáveis de segurança
  {
    name: "{{ipAddress}}",
    description: "Endereço IP do usuário",
    example: "192.168.1.1",
    category: "security",
  },
  {
    name: "{{userAgent}}",
    description: "User agent do navegador",
    example: "Mozilla/5.0...",
    category: "security",
  },
  // Variáveis de atualização
  {
    name: "{{camposAlterados}}",
    description: "Lista de campos alterados",
    example: "Nome, Email",
    category: "user",
  },
];

/**
 * Formata data no padrão brasileiro
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Formata data e hora no padrão brasileiro
 */
function formatDateTime(date: Date): string {
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Substitui variáveis em um texto
 */
export function replaceEmailVariables(template: string, variables: EmailTemplateVariables): string {
  let result = template;

  // Obter URL base da aplicação - SEMPRE do .env ou variáveis passadas
  const baseUrl =
    variables.appUrl || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL;

  if (!baseUrl) {
    console.error("NEXT_PUBLIC_APP_URL ou NEXT_PUBLIC_BASE_URL não configurado no .env");
    throw new Error("URL da aplicação não configurada. Configure NEXT_PUBLIC_APP_URL no .env");
  }
  const appNome = variables.appNome || "Pratikogram";

  // Mapeamento de variáveis com seus valores
  const variableMap: Record<string, string> = {
    // Variáveis básicas do usuário
    "{{nome}}": variables.nome || "",
    "{{email}}": variables.email || "",

    // Variáveis de data/hora
    "{{data}}": variables.data || formatDate(new Date()),
    "{{dataHora}}": variables.dataHora || formatDateTime(new Date()),
    "{{dataCriacao}}": variables.dataCriacao || "",
    "{{dataCriacaoFormatada}}": variables.dataCriacaoFormatada || "",
    "{{dataAtualizacao}}": variables.dataAtualizacao || "",
    "{{dataAtualizacaoFormatada}}": variables.dataAtualizacaoFormatada || "",
    "{{dataReset}}": variables.dataReset || "",
    "{{dataResetFormatada}}": variables.dataResetFormatada || "",

    // Variáveis do sistema/aplicação
    "{{appNome}}": appNome,
    "{{appUrl}}": baseUrl,
    "{{linkLogin}}": variables.linkLogin || `${baseUrl}/login`,
    "{{linkDashboard}}": variables.linkDashboard || `${baseUrl}/dashboard`,
    "{{linkPerfil}}": variables.linkPerfil || `${baseUrl}/dashboard/profile`,

    // Variáveis de recuperação de senha
    "{{resetUrl}}": variables.resetUrl || variables.reset_link || variables.resetLink || "",
    "{{resetLink}}": variables.resetLink || variables.resetUrl || variables.reset_link || "",
    "{{reset_link}}": variables.reset_link || variables.resetUrl || variables.resetLink || "",
    "{{token}}": variables.token || "",
    "{{dataExpiracao}}": variables.dataExpiracao || "",
    "{{dataExpiracaoFormatada}}": variables.dataExpiracaoFormatada || "",
    "{{horasValidade}}": variables.horasValidade || "",
    "{{minutosValidade}}": variables.minutosValidade || "",

    // Variáveis de segurança
    "{{ipAddress}}": variables.ipAddress || "",
    "{{userAgent}}": variables.userAgent || "",

    // Variáveis de atualização
    "{{camposAlterados}}": variables.camposAlterados || "",
  };

  // Substituir variáveis padrão
  for (const [key, value] of Object.entries(variableMap)) {
    const regex = new RegExp(key.replace(/[{}]/g, "\\$&"), "g");
    result = result.replace(regex, value);
  }

  // Substituir variáveis customizadas (padrão {{variavel}} ou {{variavel_com_underscore}})
  const customVariableRegex = /\{\{(\w+)\}\}/g;
  result = result.replace(customVariableRegex, (match, varName) => {
    // Tentar encontrar a variável (suporta camelCase e snake_case)
    const camelCase = varName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    const snakeCase = varName.replace(/([A-Z])/g, "_$1").toLowerCase();

    if (variables[varName] !== undefined) {
      return variables[varName] || "";
    }
    if (variables[camelCase] !== undefined) {
      return variables[camelCase] || "";
    }
    if (variables[snakeCase] !== undefined) {
      return variables[snakeCase] || "";
    }
    // Se a variável não foi encontrada, mantém o placeholder
    return match;
  });

  return result;
}

/**
 * Extrai todas as variáveis usadas em um template
 */
export function extractVariablesFromTemplate(template: string): string[] {
  const variables: Set<string> = new Set();
  const regex = /\{\{(\w+)\}\}/g;
  let match;

  while ((match = regex.exec(template)) !== null) {
    variables.add(match[1]);
  }

  return Array.from(variables);
}

/**
 * Valida se todas as variáveis necessárias foram fornecidas
 */
export function validateVariables(
  template: string,
  variables: EmailTemplateVariables
): { valid: boolean; missing: string[] } {
  const requiredVariables = extractVariablesFromTemplate(template);
  const providedVariables = Object.keys(variables);
  const missing = requiredVariables.filter(
    (varName) =>
      !providedVariables.includes(varName) &&
      !AVAILABLE_EMAIL_VARIABLES.some((v) => v.name === `{{${varName}}}`)
  );

  return {
    valid: missing.length === 0,
    missing,
  };
}
