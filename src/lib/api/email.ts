import { apiRequestWithAuth } from "./client";

const BASE = "/api/platform/admin/email";

export interface SmtpConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  auth_user: string;
  from_email: string;
  from_name: string | null;
  is_active: boolean;
}

export interface SmtpConfigInput {
  name: string;
  host: string;
  port: number;
  secure: boolean;
  auth_user: string;
  auth_password: string;
  from_email: string;
  from_name?: string;
}

export interface EmailTemplate {
  id: string;
  event_type: string;
  name: string;
  subject: string;
  html_content: string;
  is_active: boolean;
}

export interface EmailTemplateInput {
  event_type: string;
  name: string;
  subject: string;
  html_content: string;
}

export interface EmailLog {
  id: string;
  to_email: string;
  event_type: string;
  subject: string | null;
  status: "sent" | "failed";
  error: string | null;
  created_at: string;
}

export const getEventTypes = (token: string) =>
  apiRequestWithAuth<Record<string, string>>(`${BASE}/event-types`, token);

export const getTemplateVariables = (token: string) =>
  apiRequestWithAuth<Record<string, string>>(`${BASE}/template-variables`, token);

// SMTP
export const listSmtp = (token: string) =>
  apiRequestWithAuth<SmtpConfig[]>(`${BASE}/smtp`, token);

export const createSmtp = (token: string, data: SmtpConfigInput) =>
  apiRequestWithAuth<SmtpConfig>(`${BASE}/smtp`, token, { method: "POST", body: JSON.stringify(data) });

export const updateSmtp = (token: string, id: string, data: Partial<SmtpConfigInput> & { is_active?: boolean }) =>
  apiRequestWithAuth<SmtpConfig>(`${BASE}/smtp/${id}`, token, { method: "PUT", body: JSON.stringify(data) });

export const deleteSmtp = (token: string, id: string) =>
  apiRequestWithAuth<void>(`${BASE}/smtp/${id}`, token, { method: "DELETE" });

export const testSmtpConnection = (token: string, data: SmtpConfigInput) =>
  apiRequestWithAuth<{ success: boolean; message: string }>(`${BASE}/smtp/test-connection`, token, {
    method: "POST", body: JSON.stringify(data),
  });

export const sendTestEmail = (token: string, id: string, to_email: string) =>
  apiRequestWithAuth<{ success: boolean; error: string | null }>(`${BASE}/smtp/${id}/send-test`, token, {
    method: "POST", body: JSON.stringify({ to_email }),
  });

// Templates
export const listTemplates = (token: string) =>
  apiRequestWithAuth<EmailTemplate[]>(`${BASE}/templates`, token);

export const createTemplate = (token: string, data: EmailTemplateInput) =>
  apiRequestWithAuth<EmailTemplate>(`${BASE}/templates`, token, { method: "POST", body: JSON.stringify(data) });

export const updateTemplate = (token: string, id: string, data: Partial<EmailTemplateInput> & { is_active?: boolean }) =>
  apiRequestWithAuth<EmailTemplate>(`${BASE}/templates/${id}`, token, { method: "PUT", body: JSON.stringify(data) });

export const deleteTemplate = (token: string, id: string) =>
  apiRequestWithAuth<void>(`${BASE}/templates/${id}`, token, { method: "DELETE" });

export const triggerEmail = (token: string, event_type: string, user_email: string) =>
  apiRequestWithAuth<{ success: boolean }>(`${BASE}/trigger`, token, {
    method: "POST", body: JSON.stringify({ event_type, user_email }),
  });

// Logs
export const getEmailLogs = (token: string, limit = 50, offset = 0) =>
  apiRequestWithAuth<{ total: number; items: EmailLog[] }>(`${BASE}/logs?limit=${limit}&offset=${offset}`, token);

export const clearEmailLogs = (token: string) =>
  apiRequestWithAuth<void>(`${BASE}/logs`, token, { method: "DELETE" });
