import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  getPlatformToken,
  getPlatformUser,
  setPlatformUser,
  clearPlatformAuth,
  platformLogin as apiLogin,
  platformMe,
  type PlatformUser,
} from "@/lib/api/platformAuth";
import { logout as safirionLogout } from "@/lib/api/safirion";

type PlatformAuthContextType = {
  isAuthenticated: boolean;
  user: PlatformUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  error: string | null;
  clearError: () => void;
};

const PlatformAuthContext = createContext<PlatformAuthContextType | null>(null);

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  // Carrega imediatamente do localStorage — sem bloquear a tela
  const [user, setUser] = useState<PlatformUser | null>(() => getPlatformUser());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didValidate = useRef(false);

  // Valida token em background sem travar o carregamento inicial
  useEffect(() => {
    if (didValidate.current) return;
    didValidate.current = true;
    const token = getPlatformToken();
    const storedUser = getPlatformUser();
    if (!token || !storedUser) return;
    platformMe()
      .then((me) => { setUser(me); setPlatformUser(me); })
      .catch(async (e: unknown) => {
        const err = e as { status?: number; detail?: string };
        if (err?.status === 401) {
          try { await safirionLogout(); } catch { /* ignora */ }
          clearPlatformAuth();
          setUser(null);
          if (typeof err?.detail === "string" && err.detail) setError(err.detail);
        }
        // erro de rede/timeout: mantém logado com dados salvos
      });
  }, []);

  // Revalidar sessão a cada 1h
  useEffect(() => {
    if (!user || !getPlatformToken()) return;
    const t = setInterval(async () => {
      try {
        const me = await platformMe();
        setPlatformUser(me);
      } catch (e: unknown) {
        const err = e as { status?: number; detail?: string };
        if (err?.status === 401) {
          try {
            await safirionLogout();
          } catch {
            /* ignora */
          }
          clearPlatformAuth();
          setUser(null);
          if (typeof err?.detail === "string" && err.detail) setError(err.detail);
        }
      }
    }, 60 * 60 * 1000);
    return () => clearInterval(t);
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const res = await apiLogin(email, password);
      setUser(res.user);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string; status?: number };
      let msg = err?.detail;
      if (!msg && typeof (e as Error)?.message === "string") {
        const m = (e as Error).message;
        if (m.includes("fetch") || m.includes("Failed") || m.includes("Network"))
          msg = "Backend não está rodando. No terminal, confira se aparece \"[backend] Iniciando em http://localhost:8000\". Se não, rode: cd /app && python3 -m venv backend/venv && backend/venv/bin/pip install -r backend/requirements.txt && npm run dev";
        else msg = m;
      }
      setError(msg ?? "Falha no login.");
      throw e;
    }
  }, []);

  const logout = useCallback(() => {
    clearPlatformAuth();
    setUser(null);
    setError(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await platformMe();
    setUser(me);
    setPlatformUser(me);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value: PlatformAuthContextType = {
    isAuthenticated: !!user,
    user,
    loading,
    login,
    logout,
    refreshUser,
    error,
    clearError,
  };

  return (
    <PlatformAuthContext.Provider value={value}>
      {children}
    </PlatformAuthContext.Provider>
  );
}

export function usePlatformAuth() {
  const ctx = useContext(PlatformAuthContext);
  if (!ctx) throw new Error("usePlatformAuth must be used within PlatformAuthProvider");
  return ctx;
}
