import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAdminGeminiPrompt, updateAdminGeminiPrompt } from "@/lib/api/admin";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

/**
 * Página admin para ver e editar o prompt de sistema enviado ao Gemini na geração de estratégias.
 * Acesso restrito a role === "admin" (protegido por AdminRoute).
 */
export default function AdminGeminiPromptPage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAdminGeminiPrompt()
      .then((res) => {
        if (!cancelled) setPrompt(res.prompt ?? "");
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(err?.detail ?? "Erro ao carregar o prompt.");
          setPrompt("");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      toast.error("O prompt não pode ser vazio.");
      return;
    }
    setSaving(true);
    updateAdminGeminiPrompt(trimmed)
      .then((res) => {
        setPrompt(res.prompt ?? trimmed);
        toast.success("Prompt salvo. O Gemini usará este texto nas próximas gerações.");
      })
      .catch((err) => {
        toast.error(err?.detail ?? "Erro ao salvar o prompt.");
      })
      .finally(() => setSaving(false));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando prompt…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Prompt do Gemini
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Este é o prompt de sistema enviado ao Gemini para gerar os códigos/estratégias. Ajuste aqui para refinar o comportamento da IA.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Prompt de sistema</CardTitle>
          <CardDescription>
            O texto abaixo é concatenado ao contexto antes do prompt do usuário. Use para regras, formato de resposta e instruções fixas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gemini-prompt">Conteúdo</Label>
            <Textarea
              id="gemini-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Prompt de sistema do Gemini..."
              className="min-h-[320px] font-mono text-sm resize-y"
              disabled={saving}
            />
          </div>
          <Button onClick={handleSave} disabled={saving || !prompt.trim()}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando…
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salvar prompt
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
