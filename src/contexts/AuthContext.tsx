import { createContext, useContext, type ReactNode } from "react";
import { useSafirionAuth } from "@/hooks/useSafirionAuth";

type AuthContextType = ReturnType<typeof useSafirionAuth>;

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useSafirionAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
