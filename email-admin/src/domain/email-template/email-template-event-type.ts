/**
 * Tipos de Eventos de Email
 *
 * Define os diferentes contextos onde um template de email pode ser usado.
 * Cada template deve estar associado a um tipo de evento específico.
 */

export enum EmailTemplateEventType {
  USER_CREATED = "USER_CREATED", // Usuário criado
  USER_UPDATED = "USER_UPDATED", // Usuário atualizado
  PASSWORD_RESET_REQUEST = "PASSWORD_RESET_REQUEST", // Solicitação de recuperação de senha
  PASSWORD_RESET_SUCCESS = "PASSWORD_RESET_SUCCESS", // Senha atualizada
}

/**
 * Mapeamento de tipos de eventos para nomes legíveis
 */
export const EmailTemplateEventTypeLabels: Record<EmailTemplateEventType, string> = {
  [EmailTemplateEventType.USER_CREATED]: "Usuário Criado",
  [EmailTemplateEventType.USER_UPDATED]: "Usuário Atualizado",
  [EmailTemplateEventType.PASSWORD_RESET_REQUEST]: "Solicitação de Recuperação de Senha",
  [EmailTemplateEventType.PASSWORD_RESET_SUCCESS]: "Senha Atualizada",
};

/**
 * Obtém o label de um tipo de evento
 */
export function getEmailTemplateEventTypeLabel(eventType: EmailTemplateEventType): string {
  return EmailTemplateEventTypeLabels[eventType] || eventType;
}
