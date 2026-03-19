/**
 * Componente de Lista de Variáveis de Email
 *
 * Exibe todas as variáveis disponíveis para uso em templates de email
 * com a possibilidade de copiar para a área de transferência.
 */

import { Button } from "@/shared/components/ui/button";
import {
  EMAIL_VARIABLES,
  formatCategoryName,
  groupVariablesByCategory,
} from "@/shared/utils/email-variables";
import { Check, Copy, Info, X } from "lucide-react";
import { useState } from "react";

interface EmailVariablesListProps {
  onVariableSelect?: (variable: string) => void;
}

export function EmailVariablesList({ onVariableSelect }: EmailVariablesListProps) {
  const [showList, setShowList] = useState(false);
  const [copiedVariable, setCopiedVariable] = useState<string | null>(null);

  const groupedVariables = groupVariablesByCategory(EMAIL_VARIABLES);

  const handleCopy = async (variable: string) => {
    try {
      await navigator.clipboard.writeText(variable);
      setCopiedVariable(variable);
      setTimeout(() => setCopiedVariable(null), 2000);

      // Se houver callback, chamá-lo
      if (onVariableSelect) {
        onVariableSelect(variable);
      }
    } catch (error) {
      console.error("Erro ao copiar variável:", error);
    }
  };

  if (!showList) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setShowList(true)}
        className="h-7 text-xs"
      >
        <Info className="h-3 w-3 mr-1" />
        Ver Variáveis Disponíveis
      </Button>
    );
  }

  return (
    <div className="border border-telegram-gray-medium rounded-lg p-4 bg-telegram-gray-light space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-telegram-text">
            Variáveis Disponíveis para Templates
          </h4>
          <p className="text-xs text-telegram-text-secondary mt-1">
            Clique em uma variável para copiar. Use no formato: {"{{nome}}"}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowList(false)}
          className="h-7 w-7 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {Object.entries(groupedVariables).map(([category, variables]) => (
        <div key={category}>
          <h5 className="text-xs font-semibold text-telegram-blue mb-2 uppercase">
            {formatCategoryName(category)}
          </h5>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {variables.map((variable) => {
              const isCopied = copiedVariable === variable.name;
              return (
                <div
                  key={variable.name}
                  className="flex items-center justify-between p-2 bg-white rounded border border-telegram-gray-medium hover:border-telegram-blue transition-all cursor-pointer group"
                  onClick={() => handleCopy(variable.name)}
                  title={`Clique para copiar: ${variable.name}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-xs font-mono text-telegram-blue font-semibold">
                        {variable.name}
                      </code>
                      {isCopied && (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          Copiado!
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-telegram-text-secondary">{variable.description}</p>
                    <p className="text-xs text-telegram-text-secondary italic mt-0.5">
                      Ex: {variable.example}
                    </p>
                  </div>
                  <Copy
                    className={`h-3 w-3 flex-shrink-0 ml-2 transition-opacity ${
                      isCopied
                        ? "text-green-600 opacity-100"
                        : "text-telegram-text-secondary group-hover:text-telegram-blue opacity-0 group-hover:opacity-100"
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
