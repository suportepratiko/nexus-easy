/**
 * Utilitário de Variáveis de Email para Frontend
 *
 * Define as variáveis disponíveis para uso nos templates de email.
 * Usado apenas para exibição/documentação no frontend.
 */

export interface EmailVariable {
  name: string;
  description: string;
  example: string;
  category: "user" | "date" | "system" | "security" | "password-reset" | "links" | "custom";
}

/**
 * Lista completa de variáveis disponíveis para templates de email
 */
export const EMAIL_VARIABLES: EmailVariable[] = [
  // Variáveis do usuário
  {
    name: "{{nome}}",
    description: "Nome do usuário destinatário",
    example: "João Silva",
    category: "user",
  },
  {
    name: "{{email}}",
    description: "Email do usuário destinatário",
    example: "joao@exemplo.com",
    category: "user",
  },
  {
    name: "{{camposAlterados}}",
    description: "Lista de campos alterados (para USER_UPDATED)",
    example: "Nome, Email",
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
    description: "Data de criação do usuário (DD/MM/YYYY) - USER_CREATED",
    example: "29/11/2025",
    category: "date",
  },
  {
    name: "{{dataCriacaoFormatada}}",
    description: "Data de criação formatada (DD/MM/YYYY HH:mm) - USER_CREATED",
    example: "29/11/2025 14:30",
    category: "date",
  },
  {
    name: "{{dataAtualizacao}}",
    description: "Data de atualização (DD/MM/YYYY) - USER_UPDATED",
    example: "29/11/2025",
    category: "date",
  },
  {
    name: "{{dataAtualizacaoFormatada}}",
    description: "Data de atualização formatada (DD/MM/YYYY HH:mm) - USER_UPDATED",
    example: "29/11/2025 14:30",
    category: "date",
  },
  {
    name: "{{dataReset}}",
    description: "Data de reset de senha (DD/MM/YYYY) - PASSWORD_RESET_SUCCESS",
    example: "29/11/2025",
    category: "date",
  },
  {
    name: "{{dataResetFormatada}}",
    description: "Data de reset formatada (DD/MM/YYYY HH:mm) - PASSWORD_RESET_SUCCESS",
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
    example: "https://app.pratikogram.com.br",
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
    description: "URL completa de recuperação de senha - PASSWORD_RESET_REQUEST",
    example: "https://app.pratikogram.com.br/reset-password?token=abc123",
    category: "password-reset",
  },
  {
    name: "{{resetLink}}",
    description: "Link de recuperação de senha (alternativo) - PASSWORD_RESET_REQUEST",
    example: "https://app.pratikogram.com.br/reset-password?token=abc123",
    category: "password-reset",
  },
  {
    name: "{{token}}",
    description: "Token de recuperação de senha - PASSWORD_RESET_REQUEST",
    example: "abc123def456",
    category: "password-reset",
  },
  {
    name: "{{dataExpiracao}}",
    description: "Data de expiração do token (DD/MM/YYYY) - PASSWORD_RESET_REQUEST",
    example: "29/11/2025",
    category: "password-reset",
  },
  {
    name: "{{dataExpiracaoFormatada}}",
    description: "Data de expiração formatada (DD/MM/YYYY HH:mm) - PASSWORD_RESET_REQUEST",
    example: "29/11/2025 15:30",
    category: "password-reset",
  },
  {
    name: "{{horasValidade}}",
    description: "Horas de validade do token - PASSWORD_RESET_REQUEST",
    example: "1",
    category: "password-reset",
  },
  {
    name: "{{minutosValidade}}",
    description: "Minutos de validade do token - PASSWORD_RESET_REQUEST",
    example: "60",
    category: "password-reset",
  },
  // Variáveis de segurança
  {
    name: "{{ipAddress}}",
    description: "Endereço IP do usuário - PASSWORD_RESET_SUCCESS",
    example: "192.168.1.1",
    category: "security",
  },
  {
    name: "{{userAgent}}",
    description: "User agent do navegador - PASSWORD_RESET_SUCCESS",
    example: "Mozilla/5.0...",
    category: "security",
  },
];

/**
 * Agrupa variáveis por categoria
 */
export function groupVariablesByCategory(
  variables: EmailVariable[]
): Record<string, EmailVariable[]> {
  return variables.reduce(
    (acc, variable) => {
      if (!acc[variable.category]) {
        acc[variable.category] = [];
      }
      acc[variable.category].push(variable);
      return acc;
    },
    {} as Record<string, EmailVariable[]>
  );
}

/**
 * Formata categoria para exibição
 */
export function formatCategoryName(category: string): string {
  const names: Record<string, string> = {
    user: "Informações do Usuário",
    date: "Datas e Horas",
    system: "Informações do Sistema",
    links: "Links da Aplicação",
    "password-reset": "Recuperação de Senha",
    security: "Informações de Segurança",
    custom: "Variáveis Customizadas",
  };
  return names[category] || category;
}
