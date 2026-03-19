import { useState, useCallback } from "react";
import {
  login as apiLogin,
  logout as apiLogout,
  getStoredToken,
  clearStoredToken,
  reconnectBroker as apiReconnect,
  type ApiError,
} from "@/lib/api";

export function useSafirionAuth() {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (payload: { email: string; password: string; remember?: boolean }) => {
    setLoading(true);
    setError(null);
    clearStoredToken();
    try {
      const res = await apiLogin(payload);
      setToken(res.token);
      return res;
    } catch (e) {
      const err = e as ApiError & { message?: string };
      let msg = err?.detail ?? err?.message ?? "Falha no login.";
      if (msg.includes("fetch") || msg.includes("Failed to fetch"))
        msg = "Backend inacessível.";
      setError(msg);
      clearStoredToken();
      setToken(null);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const reconnect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiReconnect();
      if (res.token) {
        setToken(res.token);
      }
      return res;
    } catch (e) {
      setToken(null);
      clearStoredToken();
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    // Limpa imediatamente para atualizar a UI em tempo real
    clearStoredToken();
    setToken(null);
    setLoading(true);
    try {
      await apiLogout();
    } catch {
      // ignora erros da API — estado já foi limpo
    } finally {
      setLoading(false);
    }
  }, []);

  // Utilizado para limpar estado local quando o backend retorna 401 (token expirado no servidor)
  const setTokenExpired = useCallback(() => {
    setToken(null);
    clearStoredToken();
  }, []);

  return {
    isAuthenticated: !!token,
    token,
    error,
    loading,
    login,
    reconnect,
    logout,
    setTokenExpired,
  };
}
