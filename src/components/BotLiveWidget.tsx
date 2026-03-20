import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useBot } from "@/modules/bot/BotProvider";
import { formatBrl } from "@/lib/utils";
import type { OperationLog } from "@/modules/bot/schemas";
import type { StopReason } from "@/modules/bot/hooks/useBotState";
import { PictureInPicture2, X, GripVertical, Trophy, ShieldOff, Eye, EyeOff } from "lucide-react";

/** Mesmo algoritmo do Dashboard: ciclo começa em martingaleLevel=0 */
function cycleStats(ops: OperationLog[]) {
  const cycles: OperationLog[][] = [];
  let current: OperationLog[] = [];
  for (const op of ops) {
    if (op.martingaleLevel === 0 && current.length > 0) {
      cycles.push(current);
      current = [];
    }
    current.push(op);
  }
  if (current.length > 0) cycles.push(current);

  const entradas = cycles.filter((c) => {
    const last = c[c.length - 1];
    return last && last.result !== "pending" && last.result !== "draw";
  }).length;
  const wins = cycles.filter((c) => c[c.length - 1]?.result === "win").length;
  const losses = cycles.filter((c) => c[c.length - 1]?.result === "loss").length;
  return { entradas, wins, losses };
}

// ─── Conteúdo visual puro (sem posicionamento) ───────────────────────────────
interface ContentProps {
  operations: OperationLog[];
  totalProfit: number;
  currentBalance: number;
  isRunning: boolean;
  stopReason: StopReason;
  flashResult: "win" | "loss" | null;
  onMouseDown?: (e: React.MouseEvent) => void;
  onPiP?: () => void;
  onClose?: () => void;
  inPip?: boolean;
  hideValues: boolean;
  onToggleHide: () => void;
}

function WidgetContent({
  operations, totalProfit, currentBalance, isRunning, stopReason,
  flashResult, onMouseDown, onPiP, onClose, inPip, hideValues, onToggleHide,
}: ContentProps) {
  const { entradas, wins, losses } = cycleStats(operations);
  const winRate = entradas > 0 ? ((wins / entradas) * 100).toFixed(1) : "0.0";
  const lastOp = operations[operations.length - 1];
  const profitSign = totalProfit >= 0 ? "+" : "";
  const profitColor = totalProfit > 0 ? "#22c55e" : totalProfit < 0 ? "#ef4444" : "rgba(255,255,255,0.95)";

  const isStopGain = stopReason === "stop_gain";
  const isStopLoss = stopReason === "stop_loss";
  const hasStopped = isStopGain || isStopLoss;

  const mask = "••••";

  return (
    <div style={{
      width: inPip ? "100%" : 300,
      userSelect: "none",
      filter: "none",
      fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
      position: "relative",
    }}>
      <div style={{
        background: "linear-gradient(145deg, #0f1117 0%, #111827 100%)",
        border: `1px solid ${hasStopped ? (isStopGain ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)") : "rgba(255,255,255,0.1)"}`,
        borderRadius: inPip ? 0 : 16,
        overflow: "hidden",
        boxShadow: inPip ? "none" : "0 25px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)",
        minHeight: inPip ? "100vh" : "auto",
      }}>

        {/* Header */}
        <div
          onMouseDown={onMouseDown}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 12px 8px",
            background: "rgba(0,0,0,0.4)",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            cursor: inPip ? "default" : "grab",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {!inPip && <GripVertical size={14} color="rgba(255,255,255,0.3)" />}
            <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: 2, textTransform: "uppercase" }}>
              Nexus Bot
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* Botão olho — ocultar/mostrar valores em R$ */}
            <button
              onClick={onToggleHide}
              title={hideValues ? "Mostrar valores" : "Ocultar valores"}
              style={{
                background: "none", border: "none", padding: "2px 4px",
                cursor: "pointer", display: "flex", alignItems: "center",
                color: "rgba(255,255,255,0.25)", opacity: 0.7,
              }}
            >
              {hideValues
                ? <EyeOff size={11} />
                : <Eye size={11} />}
            </button>
            {onPiP && !inPip && (
              <button onClick={onPiP} title="Flutuar sobre todas as janelas" style={{
                background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 6,
                padding: "3px 6px", cursor: "pointer", display: "flex", alignItems: "center",
                gap: 4, color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 600,
              }}>
                <PictureInPicture2 size={12} />
                PiP
              </button>
            )}
            {onClose && (
              <button onClick={onClose} style={{
                background: "rgba(239,68,68,0.15)", border: "none", borderRadius: 6,
                padding: "3px 6px", cursor: "pointer", display: "flex", alignItems: "center",
                color: "#ef4444",
              }}>
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Banner Stop Gain / Stop Loss */}
        {hasStopped && (
          <div style={{
            background: isStopGain
              ? "linear-gradient(135deg, rgba(34,197,94,0.25), rgba(16,185,129,0.15))"
              : "linear-gradient(135deg, rgba(239,68,68,0.25), rgba(220,38,38,0.15))",
            borderBottom: `1px solid ${isStopGain ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
            padding: "10px 14px",
            textAlign: "center",
          }}>
            <div style={{
              fontSize: 13, fontWeight: 800,
              color: isStopGain ? "#4ade80" : "#f87171",
              letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 2,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              {isStopGain
                ? <><Trophy size={14} color="#4ade80" /> Stop Gain Atingido!</>
                : <><ShieldOff size={14} color="#f87171" /> Stop Loss Atingido!</>}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>
              {isStopGain ? "Meta de lucro alcançada" : "Limite de perda atingido"}
            </div>
          </div>
        )}

        {/* Body */}
        <div style={{ padding: "14px 16px 16px" }}>

          {/* Robô grande centralizado */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 14 }}>
            <div style={{ position: "relative", marginBottom: 10 }}>
              <img src="/botgrande.gif" alt="Bot" style={{
                width: 140, height: 140,
                borderRadius: 0, border: "none", background: "transparent",
                opacity: hasStopped ? 0.6 : 1,
              }} />
              {isRunning && (
                <span style={{
                  position: "absolute", bottom: 2, right: 2,
                  width: 14, height: 14, background: "#22c55e",
                  borderRadius: "50%", border: "2px solid #0f1117",
                  animation: "liveping 1.4s ease-in-out infinite", display: "block",
                }} />
              )}
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 4 }}>
                {isRunning ? (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)",
                    borderRadius: 20, padding: "2px 10px", fontSize: 10, fontWeight: 800,
                    color: "#22c55e", letterSpacing: 1.5, textTransform: "uppercase",
                  }}>
                    <span style={{
                      width: 6, height: 6, background: "#22c55e", borderRadius: "50%",
                      animation: "liveping 1s ease-in-out infinite", flexShrink: 0, display: "inline-block",
                    }} />
                    AO VIVO
                  </span>
                ) : hasStopped ? (
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: isStopGain ? "#4ade80" : "#f87171",
                    letterSpacing: 1, textTransform: "uppercase",
                  }}>
                    {isStopGain ? "STOP GAIN" : "STOP LOSS"}
                  </span>
                ) : (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 1, textTransform: "uppercase" }}>
                    PAUSADO
                  </span>
                )}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#ffffff", letterSpacing: -0.4, marginTop: 2 }}>Robô Automático</div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", marginTop: 3, fontWeight: 500, letterSpacing: 0.3 }}>100% automatizado</div>
            </div>
          </div>

          {/* WIN / LOSS — primeiro */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 6 }}>
            <div style={{
              background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.15)",
              borderRadius: 10, padding: "8px 6px", textAlign: "center",
            }}>
              <div style={{ fontSize: 9, color: "rgba(34,197,94,0.6)", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>
                Wins
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#4ade80", lineHeight: 1, fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum"' }}>
                {wins}
              </div>
            </div>
            <div style={{
              background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.15)",
              borderRadius: 10, padding: "8px 6px", textAlign: "center",
            }}>
              <div style={{ fontSize: 9, color: "rgba(239,68,68,0.6)", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>
                Loss
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#f87171", lineHeight: 1, fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum"' }}>
                {losses}
              </div>
            </div>
          </div>

          {/* Stats grid — Win Rate, Entradas, Saldo */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5, marginBottom: 6 }}>
            {[
              { label: "Win Rate", value: `${winRate}%`, color: winRate === "0.0" ? "rgba(255,255,255,0.7)" : Number(winRate) >= 50 ? "#4ade80" : "#f87171", isMonetary: false },
              { label: "Entradas", value: `${entradas}`, color: "rgba(255,255,255,0.85)", isMonetary: false },
              { label: "Saldo", value: `R$\u00A0${formatBrl(currentBalance)}`, color: "rgba(255,255,255,0.85)", isMonetary: true },
            ].map((s) => (
              <div key={s.label} style={{
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 10, padding: "7px 5px", textAlign: "center",
              }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>
                  {s.label}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: s.color, fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum"', lineHeight: 1 }}>
                  {s.isMonetary && hideValues ? mask : s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Lucro da sessão — por último */}
          <div style={{
            background: totalProfit > 0
              ? "rgba(34,197,94,0.07)"
              : totalProfit < 0
              ? "rgba(239,68,68,0.07)"
              : "rgba(255,255,255,0.04)",
            border: `1px solid ${totalProfit > 0 ? "rgba(34,197,94,0.2)" : totalProfit < 0 ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 12, padding: "10px 14px", marginBottom: 6, textAlign: "center",
          }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>
              Lucro da sessão
            </div>
            <div style={{
              fontSize: 28, fontWeight: 800, color: profitColor,
              letterSpacing: -1, lineHeight: 1,
              fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum"',
            }}>
              {hideValues ? mask : `${profitSign}R$ ${formatBrl(totalProfit)}`}
            </div>
          </div>

          {/* Última entrada — junto com lucro da sessão */}
          {lastOp && lastOp.result !== "pending" && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 10, padding: "7px 10px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>Última</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>
                  {lastOp.direction === "call" ? "CALL ↑" : "PUT ↓"}
                </span>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>{lastOp.asset}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{
                  fontSize: 12, fontWeight: 800,
                  color: lastOp.result === "win" ? "#4ade80" : "#f87171",
                  fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum"',
                }}>
                  {hideValues ? mask : `${lastOp.profit >= 0 ? "+" : ""}R$${formatBrl(lastOp.profit)}`}
                </span>
                <span style={{
                  fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 6, letterSpacing: 0.5,
                  background: lastOp.result === "win" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                  color: lastOp.result === "win" ? "#4ade80" : "#f87171",
                  border: `1px solid ${lastOp.result === "win" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                }}>
                  {lastOp.result === "win" ? "WIN" : "LOSS"}
                </span>
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{
            marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.05)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <span style={{
              width: 5, height: 5,
              background: isRunning ? "#22c55e" : hasStopped ? (isStopGain ? "#4ade80" : "#f87171") : "rgba(255,255,255,0.3)",
              borderRadius: "50%",
              animation: isRunning ? "liveping 1.4s ease-in-out infinite" : "none",
              flexShrink: 0, display: "inline-block",
            }} />
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", fontWeight: 600, letterSpacing: 1 }}>
              {isRunning
                ? `OPERANDO — ${new Date().toLocaleTimeString("pt-BR")}`
                : hasStopped
                ? (isStopGain ? "META ATINGIDA" : "LIMITE ATINGIDO")
                : "AGUARDANDO INÍCIO"}
            </span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes liveping {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}

// ─── Widget principal ─────────────────────────────────────────────────────────
interface Props {
  onClose: () => void;
}

export function BotLiveWidget({ onClose }: Props) {
  const { operations, totalProfit, currentBalance, status, stopReason } = useBot();
  const isRunning = status === "running";

  const lastOp = operations[operations.length - 1];
  const [flashResult, setFlashResult] = useState<"win" | "loss" | null>(null);
  const prevOpId = useRef<string | null>(null);
  const [hideValues, setHideValues] = useState(false);

  useEffect(() => {
    if (!lastOp || lastOp.result === "pending" || lastOp.id === prevOpId.current) return;
    prevOpId.current = lastOp.id;
    if (lastOp.result === "win" || lastOp.result === "loss") {
      setFlashResult(lastOp.result);
      const t = setTimeout(() => setFlashResult(null), 2500);
      return () => clearTimeout(t);
    }
  }, [lastOp]);

  // Live clock re-render
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Draggable
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, left: 0, top: 0 });
  const [pos, setPos] = useState({ left: 32, top: 80 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, left: pos.left, top: pos.top };
    e.preventDefault();
  }, [pos]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.dragging) return;
      setPos({ left: dragRef.current.left + (e.clientX - dragRef.current.startX), top: dragRef.current.top + (e.clientY - dragRef.current.startY) });
    };
    const onUp = () => { dragRef.current.dragging = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  // Document Picture-in-Picture — abre direto ao montar
  const [pipContainer, setPipContainer] = useState<Element | null>(null);
  const pipOpenedRef = useRef(false);

  const openPiP = useCallback(async () => {
    const api = (window as any).documentPictureInPicture;
    if (!api) return;
    try {
      const pipWin: Window = await api.requestWindow({ width: 320, height: 520 });

      [...document.querySelectorAll("style, link[rel='stylesheet']")].forEach((el) => {
        pipWin.document.head.appendChild(el.cloneNode(true));
      });

      const animStyle = pipWin.document.createElement("style");
      animStyle.textContent = `
        * { box-sizing: border-box; }
        body { margin: 0; background: #0f1117; font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; }
        @keyframes liveping {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `;
      pipWin.document.head.appendChild(animStyle);

      const container = pipWin.document.createElement("div");
      pipWin.document.body.appendChild(container);
      setPipContainer(container);

      pipWin.addEventListener("pagehide", () => setPipContainer(null));
    } catch {
      // PiP não suportado ou cancelado — mostra widget flutuante normal
    }
  }, []);

  // Tenta abrir PiP automaticamente ao montar (uma única vez)
  useEffect(() => {
    if (pipOpenedRef.current) return;
    pipOpenedRef.current = true;
    openPiP();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sharedProps = { operations, totalProfit, currentBalance, isRunning, stopReason, flashResult, hideValues, onToggleHide: () => setHideValues((v) => !v) };

  return (
    <>
      {/* Widget flutuante na página — visível apenas se PiP não estiver aberto */}
      {!pipContainer && (
        <div style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 9999 }}>
          <WidgetContent {...sharedProps} onMouseDown={onMouseDown} onPiP={openPiP} onClose={onClose} />
        </div>
      )}

      {/* Portal para a janela PiP */}
      {pipContainer && createPortal(
        <WidgetContent {...sharedProps} inPip />,
        pipContainer,
      )}
    </>
  );
}
