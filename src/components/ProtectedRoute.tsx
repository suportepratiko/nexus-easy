import { Navigate, useLocation } from "react-router-dom";
import { usePlatformAuth } from "@/contexts/PlatformAuthContext";

type ProtectedRouteProps = { children: React.ReactNode };

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, loading } = usePlatformAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando…</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
