/**
 * Componente de Preview de Email
 *
 * Renderiza uma prévia do template de email HTML com variáveis substituídas
 */

import { EMAIL_VARIABLES } from "@/shared/utils/email-variables";
import { AlertCircle } from "lucide-react";
import { useMemo } from "react";

interface EmailPreviewProps {
  htmlContent: string;
}

/**
 * Substitui variáveis do template por valores de exemplo
 */
function replaceVariablesWithExamples(html: string): string {
  let result = html;

  // Valores de exemplo para as variáveis
  const exampleValues: Record<string, string> = {
    "{{nome}}": "João Silva",
    "{{email}}": "joao@exemplo.com",
    "{{data}}": new Date().toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
    "{{dataHora}}": new Date().toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    "{{appNome}}": "Pratikogram",
    "{{appUrl}}":
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "http://localhost:3000",
  };

  // Substituir variáveis conhecidas
  EMAIL_VARIABLES.forEach((variable) => {
    const regex = new RegExp(variable.name.replace(/[{}]/g, "\\$&"), "g");
    const exampleValue = exampleValues[variable.name] || variable.example;
    result = result.replace(regex, exampleValue);
  });

  // Substituir variáveis customizadas com placeholder
  const customVariableRegex = /\{\{(\w+)\}\}/g;
  result = result.replace(customVariableRegex, (match) => {
    if (!exampleValues[match]) {
      return `<span class="text-yellow-600 font-semibold">[${match}]</span>`;
    }
    return match;
  });

  return result;
}

export function EmailPreview({ htmlContent }: EmailPreviewProps) {
  const previewHtml = useMemo(() => {
    if (!htmlContent || htmlContent.trim() === "") {
      return null;
    }
    return replaceVariablesWithExamples(htmlContent);
  }, [htmlContent]);

  if (!htmlContent || htmlContent.trim() === "") {
    return (
      <div className="min-h-[400px] flex items-center justify-center border border-telegram-gray-medium rounded-lg bg-telegram-gray-light">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-telegram-text-secondary mx-auto mb-2" />
          <p className="text-sm text-telegram-text-secondary">
            Digite o HTML do template no editor para ver a prévia
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="border border-telegram-gray-medium rounded-lg bg-gray-50 min-h-[400px] overflow-auto">
        {/* Cabeçalho simulado de email */}
        <div className="bg-white border-b border-telegram-gray-medium px-4 py-3">
          <div className="space-y-1">
            <div className="text-xs text-telegram-text flex items-center gap-2">
              <span className="font-semibold">De:</span>
              <span>noreply@pratikogram.com</span>
            </div>
            <div className="text-xs text-telegram-text flex items-center gap-2">
              <span className="font-semibold">Para:</span>
              <span>exemplo@email.com</span>
            </div>
          </div>
        </div>
        {/* Preview do conteúdo HTML */}
        <div className="bg-white">
          <style>
            {`
              .email-preview {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333333;
                max-width: 100%;
              }
              .email-preview h1, .email-preview h2, .email-preview h3 {
                margin-top: 0;
                margin-bottom: 0.5em;
              }
              .email-preview p {
                margin-top: 0;
                margin-bottom: 1em;
              }
              .email-preview img {
                max-width: 100%;
                height: auto;
              }
              .email-preview a {
                color: #3390EC;
                text-decoration: underline;
              }
              .email-preview table {
                width: 100%;
                border-collapse: collapse;
              }
            `}
          </style>
          <div
            className="email-preview p-4"
            dangerouslySetInnerHTML={{ __html: previewHtml || "" }}
          />
        </div>
      </div>
      <p className="text-xs text-telegram-text-secondary">
        <strong>Nota:</strong> As variáveis foram substituídas por valores de exemplo. Em emails
        reais, serão substituídas pelos dados do destinatário. Variáveis não reconhecidas aparecem
        em <span className="text-yellow-600 font-semibold">amarelo</span>.
      </p>
    </div>
  );
}
