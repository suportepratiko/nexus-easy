import { createContext, useContext, type ReactNode } from "react";
import { useBotState } from "./hooks/useBotState";

type BotContextType = ReturnType<typeof useBotState>;

const BotContext = createContext<BotContextType | null>(null);

export function BotProvider({ children }: { children: ReactNode }) {
  const bot = useBotState();
  return <BotContext.Provider value={bot}>{children}</BotContext.Provider>;
}

export function useBot() {
  const ctx = useContext(BotContext);
  if (!ctx) throw new Error("useBot must be used within BotProvider");
  return ctx;
}
