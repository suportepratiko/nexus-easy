import { Navigate, useLocation } from "react-router-dom";
import { usePlatformAuth } from "@/contexts/PlatformAuthContext";

/**
 * Protege rotas /admin/*: apenas role === "admin" pode acessar.
 * Usuário comum é redirecionado para "/" (não tem acesso nem pela barra do navegador).
 */
export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = usePlatformAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando…</div>
      </div>
    );
  }

  const isAdmin = (user?.role ?? "").toLowerCase() === "admin";
  if (!user || !isAdmin) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
