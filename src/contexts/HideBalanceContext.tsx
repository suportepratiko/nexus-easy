import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

const STORAGE_KEY = "nexus_hide_balance";

function loadStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

type HideBalanceContextType = {
  hideBalance: boolean;
  toggleHideBalance: () => void;
};

const HideBalanceContext = createContext<HideBalanceContextType | null>(null);

export function HideBalanceProvider({ children }: { children: ReactNode }) {
  const [hideBalance, setHideBalance] = useState(loadStored);

  const toggleHideBalance = useCallback(() => {
    setHideBalance((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return (
    <HideBalanceContext.Provider value={{ hideBalance, toggleHideBalance }}>
      {children}
    </HideBalanceContext.Provider>
  );
}

export function useHideBalance() {
  const ctx = useContext(HideBalanceContext);
  if (!ctx) throw new Error("useHideBalance must be used within HideBalanceProvider");
  return ctx;
}
