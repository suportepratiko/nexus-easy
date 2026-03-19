import { useState, useCallback, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import type { BotStatus, StrategyConfig, OperationLog } from "../schemas";
import { startBot as apiStartBot, stopBot as apiStopBot, resetBot as apiResetBot, getBotStatus, getBotWebSocketURL, getStoredToken, type BotOperationPayload, type BotStatusResponse } from "@/lib/api";

function mapOperation(op: BotOperationPayload): OperationLog {
  const rawTs = op.timestamp;
  let tsDate: Date;
  if (typeof rawTs === "number") {
    tsDate = new Date(rawTs * 1000);
  } else if (typeof rawTs === "string") {
    const asNumber = Number(rawTs);
    if (!Number.isNaN(asNumber) && asNumber > 0) {
      tsDate = new Date(asNumber * 1000);
    } else {
      tsDate = new Date(rawTs);
    }
  } else {
    tsDate = new Date();
  }

  if (Number.isNaN(tsDate.getTime())) {
    tsDate = new Date();
  }

  return {
    id: op.id,
    timestamp: tsDate,
    asset: op.asset,
    direction: op.direction,
    entryValue: op.entryValue,
    result: op.result,
    profit: op.profit,
    martingaleLevel: op.martingaleLevel,
    balanceAfter: op.balanceAfter,
    strategy: op.strategy,
    duration: op.duration,
    deletedAt: null,
  };
}

export type StopReason = "stop_gain" | "stop_loss" | null;

/** Hook: estado do robô real (Websocket + API). Em rotas /admin não chama a API do robô. */
export function useBotState() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith("/admin");
  const [status, setStatus] = useState<BotStatus>("idle");
  const [stopReason, setStopReason] = useState<StopReason>(null);
  const [operations, setOperations] = useState<OperationLog[]>([]);
  const [totalProfit, setTotalProfit] = useState(0);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [config, setConfig] = useState<StrategyConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLiveWidget, setShowLiveWidget] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number>(0);
  // Flag que bloqueia qualquer sync vindo do backend após logout explícito
  const disconnectedRef = useRef<boolean>(false);
  // Timestamp do último startBot — evita que poll derrube status antes do backend confirmar
  const startingUntilRef = useRef<number>(0);

  const syncFromStatus = useCallback((data: BotStatusResponse) => {
    // Se deslogado explicitamente, ignora qualquer dado vindo do backend
    if (disconnectedRef.current || !getStoredToken()) return;
    setCurrentBalance(data.current_balance ?? 0);
    setTotalProfit(data.total_profit ?? 0);
    setOperations((data.operations ?? []).map(mapOperation));
    if (data.config) {
      setConfig(data.config as unknown as StrategyConfig);
    }
    // Atualiza status baseado no backend (fonte da verdade)
    if (data.running) {
      setStatus("running");
    } else {
      // Durante a janela de início (5s após startBot), ignora "running: false"
      // para evitar race condition entre startBot e a primeira resposta do backend
      if (Date.now() < startingUntilRef.current) return;

      // Só derruba para "stopped" se o stop veio do backend com razão explícita,
      // ou se o status local não estava "running" (evita derrubar estado otimista)
      setStatus((prevStatus) => {
        if (prevStatus === "running") return "stopped";
        return prevStatus === "idle" ? "stopped" : prevStatus;
      });
      setStopReason(data.stop_reason ?? null);
    }
  }, []);

  const connectWS = useCallback(() => {
    if (isAdminRoute) return;
    const url = getBotWebSocketURL();
    if (!url) return;
    // Só conecta se tiver token ativo
    if (!getStoredToken()) return;

    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as BotStatusResponse;
        syncFromStatus(data);
      } catch (e) {
        console.error("WS parse error", e);
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      // Só reconecta se ainda tiver token da corretora e não estiver em rota admin
      if (!isAdminRoute && getStoredToken()) {
        window.clearTimeout(reconnectRef.current);
        reconnectRef.current = window.setTimeout(connectWS, 3000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [isAdminRoute, syncFromStatus]);

  const pollRef = useRef<number>(0);

  useEffect(() => {
    if (isAdminRoute) return;

    // Initial load
    getBotStatus().then(syncFromStatus).catch(() => { });

    // Connect WS
    connectWS();

    // Polling de segurança: atualiza via HTTP quando WS não está conectado
    pollRef.current = window.setInterval(() => {
      if (disconnectedRef.current || !getStoredToken()) return;
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        getBotStatus().then(syncFromStatus).catch(() => { });
      }
    }, 2000);

    return () => {
      window.clearTimeout(reconnectRef.current);
      window.clearInterval(pollRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isAdminRoute, connectWS, syncFromStatus]);

  const startBot = useCallback(
    (strategyConfig: StrategyConfig) => {
      // Reativa sync ao iniciar o robô (caso tenha sido desligado pelo logout)
      disconnectedRef.current = false;
      // Protege por 8s contra race condition onde o poll recebe "running: false"
      // antes do backend confirmar que o robô iniciou
      startingUntilRef.current = Date.now() + 8000;
      setError(null);
      setStopReason(null);
      const payload = {
        entryValue: strategyConfig.entryValue,
        payout: strategyConfig.payout,
        stopGainMode: strategyConfig.stopGainMode,
        stopGainValue: strategyConfig.stopGainValue,
        stopLossMode: strategyConfig.stopLossMode,
        stopLossValue: strategyConfig.stopLossValue,
        martingale: strategyConfig.martingale,
        bankroll: strategyConfig.bankroll,
        assetModality: strategyConfig.assetModality ?? ["binary"],
        marketType: strategyConfig.marketType ?? ["open", "otc"],
        strategies: strategyConfig.strategies ?? ["otc"],
        customStrategies: (strategyConfig.customStrategies ?? []).filter(
          (s): s is { id: string; name: string; code: string; timeframe: "M1" | "M5" } =>
            typeof s.id === "string" && typeof s.name === "string" && typeof s.code === "string" && typeof s.timeframe === "string"
        ),
        waitNextCandle: strategyConfig.waitNextCandle ?? true,
      };
      apiStartBot(payload)
        .then(() => {
          setConfig(strategyConfig);
          setStatus("running");
          setOperations([]);
          setTotalProfit(0);
          setStopReason(null);
          setError(null);
          // Garantir que o WS está ouvindo ou reconectar se necessário
          if (!wsRef.current) {
            connectWS();
          }
        })
        .catch((e: { detail?: string }) => {
          setError(e?.detail ?? "Falha ao iniciar robô.");
          setStatus("stopped");
        });
    },
    [connectWS]
  );

  const stopBot = useCallback(() => {
    startingUntilRef.current = 0; // cancela janela de proteção
    setError(null);
    apiStopBot()
      .then(() => {
        getBotStatus().then(syncFromStatus);
        setStatus("stopped");
        setStopReason(null);
      })
      .catch(() => {
        setStatus("stopped");
      });
  }, [syncFromStatus]);

  const resetBot = useCallback(() => {
    // Trava qualquer sync futuro do backend (polling e WS)
    disconnectedRef.current = true;
    startingUntilRef.current = 0;

    // Fecha WebSocket imediatamente e cancela reconexão automática
    window.clearTimeout(reconnectRef.current);
    if (wsRef.current) {
      wsRef.current.onclose = null; // evita disparar reconexão
      wsRef.current.close();
      wsRef.current = null;
    }

    // Limpa estado local imediatamente
    setStopReason(null);
    setStatus("idle");
    setOperations([]);
    setTotalProfit(0);
    setCurrentBalance(0);
    setError(null);

    // Sinaliza ao backend que o robô deve parar (ignora erros — token pode já ter sido limpo)
    apiStopBot().catch(() => {});
    apiResetBot().catch(() => {});
  }, []);

  return {
    status,
    stopReason,
    operations,
    totalProfit,
    currentBalance,
    config,
    error,
    showLiveWidget,
    setShowLiveWidget,
    startBot,
    stopBot,
    resetBot,
  };
}
