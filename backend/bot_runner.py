"""
Robô real: executa compras na corretora Safirion conforme configuração.
Estratégia simples: um ativo (EURUSD), 1 min, direção alternada (call/put).
Respeita valor de entrada, martingale, stop gain e stop loss.
"""
from __future__ import annotations

import logging
import os
import random
import threading
import time
from datetime import datetime, timezone
from typing import Any, Iterable, Literal, Sequence

from sqlalchemy import text as sa_text

from backend.database import SessionLocal, UserOperation, get_engine

# URL do backend para disparar push (PWA). Env BACKEND_URL ou padrão local.
_BACKEND_URL = os.environ.get("BACKEND_URL", "http://127.0.0.1:8001")
_INTERNAL_PUSH_SECRET = os.environ.get("INTERNAL_PUSH_SECRET", "change-me-internal")


def _trigger_push_event(session_email: str | None, event: str, data: dict[str, Any]) -> None:
    """Dispara evento de push para o backend (operação aberta, finalizada, stop). Não bloqueia."""
    if not session_email:
        return
    try:
        import urllib.request
        import json
        req = urllib.request.Request(
            f"{_BACKEND_URL.rstrip('/')}/api/internal/push-event",
            data=json.dumps({"email": session_email, "event": event, "data": data}).encode("utf-8"),
            method="POST",
            headers={
                "Content-Type": "application/json",
                "X-Internal-Secret": _INTERNAL_PUSH_SECRET,
            },
        )
        urllib.request.urlopen(req, timeout=3)
    except Exception as e:
        logging.debug("bot_runner: push event falhou (ignorado): %s", e)


# Expiração turbo (1 minuto)
DEFAULT_DURATION = 1
# Fallback se a API não retornar ativos disponíveis
DEFAULT_ACTIVE = "EURUSD"
# Tempo de espera após cada compra antes de permitir próxima.
# Ajustado para minimizar o risco de pular uma vela M1 em ciclos de martingale,
# mantendo ainda um pequeno colchão acima de 1 minuto.
WAIT_AFTER_BUY_SECONDS = 55
# Digitais: margem extra para a corretora liquidar e atualizar saldo (ainda um pouco maior que turbo).
WAIT_AFTER_BUY_SECONDS_DIGITAL = 63
# Se a diferença de saldo for ambígua (próxima de zero), reler saldo após este intervalo.
# Valor reduzido para não alongar demais o ciclo entre uma operação e outra (evita pular vela).
BALANCE_RETRY_WAIT_SEC = 4
# Lucro mínimo (R$) para considerar WIN; abaixo disso = LOSS (evita erro por arredondamento/atraso).
MIN_PROFIT_FOR_WIN = 0.50
# Intervalo padrão para verificar se ainda há posição aberta na corretora.
POLL_OPEN_POSITIONS_INTERVAL_SEC = 5
# Em ciclo de martingale (mg_level > 0), usar polling mais curto para reentrada mais rápida.
FAST_POLL_OPEN_POSITIONS_INTERVAL_SEC = 1
# Janela máxima (segundos) para entrar na vela M1 atual.
MAX_ENTRY_SECOND_IN_CANDLE = 29

_bot_state: dict[str, dict[str, Any]] = {}
_bot_lock = threading.Lock()
# Um ciclo de compra por vez por token (evita duas entradas simultâneas)
_trade_locks: dict[str, threading.Lock] = {}
_trade_locks_lock = threading.Lock()

# Limite de operações mantidas na RAM por sessão (evita memory leak em sessões longas)
_MAX_OPS_IN_MEMORY = 500
_signal_bus_lock = threading.Lock()
_signal_bus_engine = None


def _check_target(value: float, ops: int, mode: str, target: float, banca: float) -> bool:
    if mode == "gross_value":
        return value >= target
    if mode == "percentage":
        # Porcentagem em relação à banca do usuário (saldo ao iniciar a sessão)
        return banca and (value / banca) * 100 >= target
    return False


def _interruptible_sleep(seconds: float, state: dict, check_interval: float = 0.5) -> bool:
    """Dorme por `seconds` mas verifica state['running'] a cada `check_interval`.
    Retorna True se dormiu completamente, False se interrompido (bot parou)."""
    elapsed = 0.0
    while elapsed < seconds:
        chunk = min(check_interval, seconds - elapsed)
        time.sleep(chunk)
        elapsed += chunk
        if not state.get("running"):
            return False
    return True


def _martingale_max(level: str) -> int:
    return {"none": 0, "1x": 1, "2x": 2, "3x": 3}.get(level, 0)


def _is_active_otc(name: str | None) -> bool:
    """Centraliza a lógica de identificação de mercado OTC.
    Apenas ativos terminados em -OTC são considerados mercado de balcão.
    Sufixos como -op (opções digitais de mercado aberto) são permitidos.
    """
    if not name: return False
    n = str(name).upper()
    return n.endswith("-OTC")


def _is_valid_open_price_guard(direction: str, candle_open: float, market_price: float) -> bool:
    """Permite entrada se o preço está do lado correto da abertura (com tolerância de ~0.02% para spread)."""
    if candle_open <= 0:
        return True
    tol = max(0.0001, abs(candle_open) * 0.0002)
    if direction == "put":
        return market_price >= candle_open - tol
    return market_price <= candle_open + tol


def _trade_lock_for(token: str) -> threading.Lock:
    """Lock por token: garante uma única entrada por vez."""
    with _trade_locks_lock:
        if token not in _trade_locks:
            _trade_locks[token] = threading.Lock()
        return _trade_locks[token]


def _signal_bus_init() -> None:
    try:
        with _signal_bus_lock:
            global _signal_bus_engine
            if _signal_bus_engine is None:
                _signal_bus_engine = get_engine()
            with _signal_bus_engine.begin() as conn:
                conn.execute(sa_text(
                    """
                    CREATE TABLE IF NOT EXISTS signal_bus (
                        bus_key TEXT NOT NULL,
                        minute_bucket BIGINT NOT NULL,
                        active_name TEXT NOT NULL,
                        active_type TEXT NOT NULL,
                        direction TEXT NOT NULL,
                        strategy TEXT,
                        created_ts BIGINT NOT NULL,
                        PRIMARY KEY (bus_key, minute_bucket)
                    )
                    """
                ))
                # Add columns for high-speed synchronization if they don't exist
                try:
                    conn.execute(sa_text("ALTER TABLE signal_bus ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'waiting'"))
                    conn.execute(sa_text("ALTER TABLE signal_bus ADD COLUMN IF NOT EXISTS candle_from BIGINT"))
                    conn.execute(sa_text("ALTER TABLE signal_bus ADD COLUMN IF NOT EXISTS trigger_ts BIGINT"))
                    conn.execute(sa_text("ALTER TABLE signal_bus ADD COLUMN IF NOT EXISTS heartbeat_ts BIGINT"))
                    conn.execute(sa_text("ALTER TABLE signal_bus ADD COLUMN IF NOT EXISTS signals_json JSONB"))
                except Exception:
                    pass
    except Exception as e:
        logging.warning("bot_runner: signal_bus_init falhou: %s", e)


def _signal_key(
    enabled_strategies: list[str],
    allow_digital: bool,
    allow_binary: bool,
    allow_open: bool,
    allow_otc: bool,
    wait_next_candle: bool,
) -> str:
    # Chave do "canal" de sinal compartilhado especializada por conjunto de estratégias
    # e filtros de mercado. Isso garante que bots com necessidades diferentes não
    # esperem por um líder que não escaneia o que eles precisam.
    strats_part = ",".join(sorted(enabled_strategies)) if enabled_strategies else "none"
    return f"st={strats_part}|dig={int(allow_digital)}|bin={int(allow_binary)}|open={int(allow_open)}|otc={int(allow_otc)}|wnc={int(wait_next_candle)}"


def _publish_shared_signal(
    bus_key: str,
    minute_bucket: int,
    active_name: str,
    active_type: str,
    direction: str,
    strategy: str | None,
    status: str = "searching",
    candle_from: int | None = None,
    trigger_ts: int | None = None,
    signals_data: dict[str, Any] | None = None,
) -> None:
    try:
        with _signal_bus_lock:
            global _signal_bus_engine
            if _signal_bus_engine is None:
                _signal_bus_engine = get_engine()
            now_ts = int(time.time())
            with _signal_bus_engine.begin() as conn:
                import json
                # Upsert signal details
                conn.execute(
                    sa_text(
                        """
                        INSERT INTO signal_bus
                        (bus_key, minute_bucket, active_name, active_type, direction, strategy, created_ts, status, candle_from, trigger_ts, heartbeat_ts, signals_json)
                        VALUES (:bus_key, :minute_bucket, :active_name, :active_type, :direction, :strategy, :ts, :status, :cf, :trig, :ts, :sj)
                        ON CONFLICT (bus_key, minute_bucket) DO UPDATE SET
                            active_name = EXCLUDED.active_name,
                            active_type = EXCLUDED.active_type,
                            direction = EXCLUDED.direction,
                            strategy = EXCLUDED.strategy,
                            created_ts = EXCLUDED.created_ts,
                            status = EXCLUDED.status,
                            candle_from = COALESCE(EXCLUDED.candle_from, signal_bus.candle_from),
                            trigger_ts = COALESCE(EXCLUDED.trigger_ts, signal_bus.trigger_ts),
                            heartbeat_ts = EXCLUDED.heartbeat_ts,
                            signals_json = COALESCE(EXCLUDED.signals_json, signal_bus.signals_json)
                        """
                    ),
                    {
                        "bus_key": bus_key,
                        "minute_bucket": int(minute_bucket),
                        "active_name": active_name,
                        "active_type": active_type,
                        "direction": direction,
                        "strategy": strategy,
                        "ts": now_ts,
                        "status": status,
                        "cf": candle_from,
                        "trig": trigger_ts,
                        "sj": json.dumps(signals_data) if signals_data else None
                    },
                )
                # Quick cleanup for better performance
                conn.execute(
                    sa_text("DELETE FROM signal_bus WHERE created_ts < :min_ts"),
                    {"min_ts": now_ts - 300},
                )
    except Exception as e:
        logging.warning("bot_runner: publish_shared_signal falhou: %s", e)


def _publish_multi_signals(bus_key: str, minute_bucket: int, signals: dict[str, Any]) -> None:
    """Publica um conjunto de sinais (um por estratégia) no barramento."""
    try:
        import json
        with _signal_bus_lock:
            global _signal_bus_engine
            if _signal_bus_engine is None: _signal_bus_engine = get_engine()
            with _signal_bus_engine.begin() as conn:
                conn.execute(
                    sa_text("UPDATE signal_bus SET signals_json = :sj, heartbeat_ts = :ts WHERE bus_key = :k AND minute_bucket = :b"),
                    {"sj": json.dumps(signals), "ts": int(time.time()), "k": bus_key, "b": int(minute_bucket)}
                )
    except Exception:
        pass


def _update_leader_heartbeat(bus_key: str, minute_bucket: int) -> None:
    """Atualiza o timestamp de atividade do líder para evitar que outros assumam o posto."""
    try:
        with _signal_bus_lock:
            global _signal_bus_engine
            if _signal_bus_engine is None: _signal_bus_engine = get_engine()
            with _signal_bus_engine.begin() as conn:
                conn.execute(
                    sa_text("UPDATE signal_bus SET heartbeat_ts = :ts WHERE bus_key = :k AND minute_bucket = :b"),
                    {"ts": int(time.time()), "k": bus_key, "b": int(minute_bucket)}
                )
    except Exception:
        pass


def _get_shared_signal_sync(bus_key: str, minute_bucket: int) -> dict[str, Any] | None:
    # Retorna o estado completo do sinal para sincronismo em milissegundos
    try:
        with _signal_bus_lock:
            global _signal_bus_engine
            if _signal_bus_engine is None:
                _signal_bus_engine = get_engine()
            with _signal_bus_engine.begin() as conn:
                row = conn.execute(
                    sa_text(
                        """
                        SELECT active_name, active_type, direction, strategy, created_ts, status, candle_from, trigger_ts, heartbeat_ts, signals_json
                        FROM signal_bus
                        WHERE bus_key = :bus_key AND minute_bucket = :bucket
                        """
                    ),
                    {"bus_key": bus_key, "bucket": int(minute_bucket)},
                ).fetchone()
            if not row:
                return None
            return {
                "active_name": row[0],
                "active_type": row[1],
                "direction": row[2],
                "strategy": row[3],
                "created_ts": row[4],
                "status": row[5],
                "candle_from": row[6],
                "trigger_ts": row[7],
                "heartbeat_ts": row[8],
                "signals_json": row[9],
            }
    except Exception:
        return None


def _get_shared_signal(bus_key: str, minute_bucket: int) -> tuple[str, str, str, str | None] | None:
    # Mantendo compatibilidade com assinatura legada onde necessário
    data = _get_shared_signal_sync(bus_key, minute_bucket)
    if not data or data["status"] == "searching":
        return None
    # Evita reaproveitar sinal "velho" demais.
    if int(time.time()) - int(data["created_ts"]) > 75:
        return None
    return (
        str(data["active_name"]),
        str(data["active_type"]),
        str(data["direction"]),
        (str(data["strategy"]) if data["strategy"] else None),
    )


def _save_user_operation(email: str | None, op: dict[str, Any], total_profit: float | None) -> None:
    """
    Persiste uma operação do robô para uso em relatórios/ranking.
    Falhas de gravação não interrompem o robô.
    """
    if not email:
        return
    try:
        ts_raw = op.get("timestamp") or time.time()
        if isinstance(ts_raw, (int, float)):
            ts = datetime.fromtimestamp(float(ts_raw), tz=timezone.utc)
        else:
            try:
                ts = datetime.fromisoformat(str(ts_raw))
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
            except Exception:
                ts = datetime.now(tz=timezone.utc)

        entry_val = op.get("entryValue")
        profit_val = op.get("profit")
        balance_after = op.get("balanceAfter")
        try:
            entry_f = float(entry_val) if entry_val is not None else None
        except (TypeError, ValueError):
            entry_f = None
        try:
            profit_f = float(profit_val) if profit_val is not None else None
        except (TypeError, ValueError):
            profit_f = None
        try:
            balance_f = float(balance_after) if balance_after is not None else None
        except (TypeError, ValueError):
            balance_f = None

        db = SessionLocal()
        rec = UserOperation(
            user_email=str(email).strip().lower(),
            timestamp=ts,
            asset=str(op.get("asset") or "") or None,
            direction=str(op.get("direction") or "") or None,
            result=str(op.get("result") or "") or None,
            entry_value=entry_f,
            profit=profit_f,
            balance_after=balance_f,
            total_profit_after=float(total_profit or 0.0),
        )
        db.add(rec)
        db.commit()
    except Exception:
        logging.exception("bot_runner: falha ao salvar operação do usuário para ranking")
    finally:
        try:
            db.close()  # type: ignore[name-defined]
        except Exception:
            pass


def _sma(values: Sequence[float], period: int) -> list[float]:
    """Simple Moving Average. Retorna lista alinhada ao input."""
    n = len(values)
    if n < period or period <= 0:
        return []
    out: list[float] = []
    first_sma = sum(values[:period]) / period
    for i in range(n):
        if i < period - 1:
            out.append(first_sma)
        else:
            out.append(sum(values[i - period + 1 : i + 1]) / period)
    return out


def _ema(values: Sequence[float], period: int) -> list[float]:
    if not values or period <= 0 or len(values) < period:
        return []
    k = 2 / (period + 1)
    ema_vals: list[float] = []
    sma = sum(values[:period]) / period
    ema_vals.append(sma)
    for price in values[period:]:
        ema_vals.append(price * k + ema_vals[-1] * (1 - k))
    # alinhar tamanho ao vetor original (preenche início com primeiros valores)
    pad = len(values) - len(ema_vals)
    return [ema_vals[0]] * pad + ema_vals


def _rsi(values: Sequence[float], period: int = 14) -> list[float]:
    if len(values) <= period:
        return []
    gains: list[float] = []
    losses: list[float] = []
    for i in range(1, len(values)):
        diff = values[i] - values[i - 1]
        gains.append(max(diff, 0))
        losses.append(-min(diff, 0))
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    rsis: list[float] = []
    if avg_loss == 0:
        rsis.append(100.0)
    else:
        rs = avg_gain / avg_loss
        rsis.append(100 - (100 / (1 + rs)))
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0:
            rsis.append(100.0)
        else:
            rs = avg_gain / avg_loss
            rsis.append(100 - (100 / (1 + rs)))
    pad = len(values) - len(rsis)
    return [rsis[0]] * pad + rsis


def _macd(values: Sequence[float], fast: int = 12, slow: int = 26, signal: int = 9) -> tuple[list[float], list[float], list[float]]:
    if len(values) < slow + signal:
        return ([], [], [])
    ema_fast = _ema(values, fast)
    ema_slow = _ema(values, slow)
    macd_line = [f - s for f, s in zip(ema_fast, ema_slow)]
    signal_line = _ema(macd_line, signal)
    hist = [m - s for m, s in zip(macd_line, signal_line)]
    return macd_line, signal_line, hist


def _bollinger(values: Sequence[float], period: int = 20, std_mult: float = 2.0) -> tuple[list[float], list[float], list[float]]:
    """Bandas de Bollinger: middle=SMA(close, period), upper=middle+std_mult*std, lower=middle-std_mult*std."""
    n = len(values)
    if n < period or period <= 0:
        return ([], [], [])
    middle = _sma(values, period)
    upper: list[float] = []
    lower: list[float] = []
    for i in range(n):
        if i < period - 1:
            upper.append(middle[i] if middle else 0.0)
            lower.append(middle[i] if middle else 0.0)
        else:
            window = values[i - period + 1 : i + 1]
            mean = sum(window) / period
            variance = sum((x - mean) ** 2 for x in window) / period
            std = (variance ** 0.5) if variance > 0 else 0.0
            upper.append(middle[i] + std_mult * std)
            lower.append(middle[i] - std_mult * std)
    return (middle, upper, lower)


def _atr(highs: Sequence[float], lows: Sequence[float], closes: Sequence[float], period: int = 20) -> list[float]:
    """Average True Range (period)."""
    n = len(closes)
    if n < 2 or period <= 0 or n < period:
        return []
    tr: list[float] = []
    for i in range(n):
        if i == 0:
            tr.append(highs[0] - lows[0])
        else:
            hl = highs[i] - lows[i]
            hc = abs(highs[i] - closes[i - 1])
            lc = abs(lows[i] - closes[i - 1])
            tr.append(max(hl, hc, lc))
    # ATR = EMA(TR, period)
    return _ema(tr, period)


def _adx(highs: Sequence[float], lows: Sequence[float], closes: Sequence[float], period: int = 14) -> list[float]:
    """Average Directional Index (ADX). Retorna lista alinhada ao input; índices iniciais preenchidos com 0."""
    n = len(closes)
    if n < period + 1 or period <= 0:
        return []
    tr: list[float] = []
    plus_dm: list[float] = []
    minus_dm: list[float] = []
    for i in range(n):
        if i == 0:
            tr.append(highs[0] - lows[0])
            plus_dm.append(0.0)
            minus_dm.append(0.0)
            continue
        hl = highs[i] - lows[i]
        hc = abs(highs[i] - closes[i - 1])
        lc = abs(lows[i] - closes[i - 1])
        tr.append(max(hl, hc, lc))
        up_move = highs[i] - highs[i - 1]
        down_move = lows[i - 1] - lows[i]
        if up_move > down_move and up_move > 0:
            plus_dm.append(up_move)
        else:
            plus_dm.append(0.0)
        if down_move > up_move and down_move > 0:
            minus_dm.append(down_move)
        else:
            minus_dm.append(0.0)

    def _wilder_smooth(vals: list[float], p: int) -> list[float]:
        out: list[float] = [0.0] * len(vals)
        for i in range(p - 1, len(vals)):
            if i == p - 1:
                out[i] = sum(vals[1 : p + 1]) / p
            else:
                out[i] = (out[i - 1] * (p - 1) + vals[i]) / p
        return out

    tr_smooth = _wilder_smooth(tr, period)
    plus_smooth = _wilder_smooth(plus_dm, period)
    minus_smooth = _wilder_smooth(minus_dm, period)

    adx_vals: list[float] = []
    for i in range(n):
        if i < period:
            adx_vals.append(0.0)
            continue
        tr_val = tr_smooth[i]
        if tr_val <= 0:
            adx_vals.append(0.0)
            continue
        plus_di = 100.0 * plus_smooth[i] / tr_val
        minus_di = 100.0 * minus_smooth[i] / tr_val
        di_sum = plus_di + minus_di
        if di_sum <= 0:
            adx_vals.append(0.0)
            continue
        dx = 100.0 * abs(plus_di - minus_di) / di_sum
        adx_vals.append(dx)

    adx_smooth: list[float] = [0.0] * n
    for i in range(period, n):
        if i == period:
            adx_smooth[i] = sum(adx_vals[period : period + period]) / period
        else:
            adx_smooth[i] = (adx_smooth[i - 1] * (period - 1) + adx_vals[i]) / period
    return adx_smooth


def _execute_custom_strategy(code: str, candles: list[dict[str, Any]], asset: str | None = None) -> Literal["call", "put"] | None:
    """
    Executa código Python de estratégia custom em namespace restrito.
    O código deve definir analyze(candles, asset=None) -> "call"|"put"|None.
    """
    import builtins
    safe_builtins = {
        "abs", "all", "any", "bool", "dict", "enumerate", "float", "int", "len",
        "list", "map", "max", "min", "range", "round", "sum", "tuple", "zip",
        "True", "False", "None",
    }
    restricted_builtins = {k: getattr(builtins, k) for k in safe_builtins if hasattr(builtins, k)}
    ns: dict[str, Any] = {
        "__builtins__": restricted_builtins,
        "_rsi": _rsi,
        "_ema": _ema,
        "_sma": _sma,
        "_macd": _macd,
        "_bollinger": _bollinger,
        "_atr": _atr,
        "_adx": _adx,
        "_keltner": _keltner,
        "_stochastic": _stochastic,
        "_swing_lows": _swing_lows,
        "_swing_highs": _swing_highs,
    }
    try:
        exec(code, ns)
        analyze_fn = ns.get("analyze")
        if not callable(analyze_fn):
            return None
        result = analyze_fn(candles, asset)
        if result in ("call", "put"):
            return result
        return None
    except Exception as e:
        logging.warning("bot_runner: custom strategy exec error: %s", e)
        return None


def _keltner(
    closes: Sequence[float], highs: Sequence[float], lows: Sequence[float],
    period: int = 20, mult: float = 2.0,
) -> tuple[list[float], list[float], list[float]]:
    """Keltner Channels: middle=EMA(close,20), upper=middle+mult*ATR, lower=middle-mult*ATR."""
    if len(closes) < period:
        return ([], [], [])
    middle = _ema(closes, period)
    atr_vals = _atr(highs, lows, closes, period)
    if not atr_vals or len(middle) != len(atr_vals):
        return ([], [], [])
    upper = [m + mult * a for m, a in zip(middle, atr_vals)]
    lower = [m - mult * a for m, a in zip(middle, atr_vals)]
    return middle, upper, lower


def _stochastic(
    highs: Sequence[float], lows: Sequence[float], closes: Sequence[float],
    k_period: int = 6, k_smooth: int = 3, d_period: int = 3,
) -> tuple[list[float], list[float]]:
    """Stochastic %K (smoothed) and %D. Returns (%K, %D) aligned to input length."""
    n = len(closes)
    if n < k_period or k_period <= 0:
        return ([], [])
    k_raw: list[float] = []
    for i in range(n):
        if i < k_period - 1:
            k_raw.append(50.0)
            continue
        lo = min(lows[i - k_period + 1 : i + 1])
        hi = max(highs[i - k_period + 1 : i + 1])
        if hi <= lo:
            k_raw.append(50.0)
        else:
            k_raw.append(100.0 * (closes[i] - lo) / (hi - lo))
    # SMA(k_raw, k_smooth) -> %K
    def _sma(vals: list[float], p: int) -> list[float]:
        out: list[float] = []
        for i in range(len(vals)):
            if i < p - 1:
                out.append(vals[i] if vals else 50.0)
            else:
                out.append(sum(vals[i - p + 1 : i + 1]) / p)
        return out
    k_smoothed = _sma(k_raw, k_smooth)
    d_smoothed = _sma(k_smoothed, d_period)
    return k_smoothed, d_smoothed


Signal = Literal["call", "put", None]


def _analyze_candles_otc(candles: Iterable[dict[str, Any]], asset: str | None = None) -> Signal:
    """
    Estratégia OTC baseada em candles específicos (-1, -3, -5, -9).
    Regras:
    - CALL: c0 > c2 e c2 > o2 e c4 > c8
    - PUT:  c0 < c2 e c2 < o2 e c4 < c8
    """
    c_list = list(candles)
    if len(c_list) < 9:
        return None

    closes = [float(c["close"]) for c in c_list]
    opens = [float(c["open"]) for c in c_list]
    c0 = closes[-1]
    c2 = closes[-3]
    o2 = opens[-3]
    c4 = closes[-5]
    c8 = closes[-9]

    if (c0 > c2) and (c2 > o2) and (c4 > c8):
        logging.info("bot_runner: otc CALL em %s | c0=%.5f c2=%.5f o2=%.5f c4=%.5f c8=%.5f", asset, c0, c2, o2, c4, c8)
        return "call"
    if (c0 < c2) and (c2 < o2) and (c4 < c8):
        logging.info("bot_runner: otc PUT em %s | c0=%.5f c2=%.5f o2=%.5f c4=%.5f c8=%.5f", asset, c0, c2, o2, c4, c8)
        return "put"

    return None


def _swing_lows(lows: list[float], left: int = 2, right: int = 2) -> list[float]:
    """Retorna os valores dos swing lows (mínimos locais) no array de lows."""
    out: list[float] = []
    for i in range(left, len(lows) - right):
        window = lows[i - left : i + right + 1]
        if lows[i] == min(window):
            out.append(lows[i])
    return out


def _swing_highs(highs: list[float], left: int = 2, right: int = 2) -> list[float]:
    """Retorna os valores dos swing highs (máximos locais) no array de highs."""
    out: list[float] = []
    for i in range(left, len(highs) - right):
        window = highs[i - left : i + right + 1]
        if highs[i] == max(window):
            out.append(highs[i])
    return out


def _analyze_candles_supertrend(candles: Iterable[dict[str, Any]], asset: str | None = None) -> Signal:
    """
    Estratégia SuperTrend (period=18, multiplier=2.0):
    - CALL quando muda direção para alta.
    - PUT quando muda direção para baixa.
    """
    c_list = list(candles)
    period = 18
    multiplier = 2.0
    if len(c_list) < period + 2:
        return None

    closes = [float(c["close"]) for c in c_list]
    highs = [float(c["max"]) for c in c_list]
    lows = [float(c["min"]) for c in c_list]
    # True Range
    tr: list[float] = []
    for i in range(len(c_list)):
        if i == 0:
            tr.append(highs[i] - lows[i])
            continue
        tr.append(max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        ))

    # ATR EWMA (alpha=1/period), depois multiplicador
    alpha = 1.0 / period
    atr: list[float] = [tr[0]]
    for i in range(1, len(tr)):
        atr.append(alpha * tr[i] + (1.0 - alpha) * atr[i - 1])
    atr = [a * multiplier for a in atr]

    supertrend: list[float | None] = [None] * len(c_list)
    direction: list[int] = [0] * len(c_list)

    for i in range(1, len(c_list)):
        prev_st = supertrend[i - 1] if supertrend[i - 1] is not None else 0.0
        prev_close = closes[i - 1]
        curr_close = closes[i]
        curr_h = closes[i]
        curr_l = closes[i]
        curr_atr = atr[i]

        if curr_close > prev_st and prev_close > prev_st:
            st = max(prev_st, curr_h - curr_atr)
        elif curr_close < prev_st and prev_close < prev_st:
            st = min(prev_st, curr_l + curr_atr)
        elif curr_close > prev_st:
            st = curr_h - curr_atr
        else:
            st = curr_l + curr_atr
        supertrend[i] = st

        if prev_close < prev_st and curr_close > prev_st:
            direction[i] = 1
        elif prev_close > prev_st and curr_close < prev_st:
            direction[i] = -1
        else:
            direction[i] = direction[i - 1]

    if len(direction) < 2:
        return None
    long_signal = direction[-2] != direction[-1] and direction[-1] == 1
    short_signal = direction[-2] != direction[-1] and direction[-1] == -1

    if long_signal:
        logging.info("bot_runner: supertrend CALL em %s | close=%.5f", asset, closes[-1])
        return "call"
    if short_signal:
        logging.info("bot_runner: supertrend PUT em %s | close=%.5f", asset, closes[-1])
        return "put"

    return None


def _revalidate_signal_on_closed(
    asset: str,
    direction: str,
    strategy: str | None,
    signal_from: int,
    get_candles: Any,
    get_ts: Any,
    custom_strategies_map: dict[str, dict[str, Any]] | None = None,
) -> bool:
    """
    Revalida o sinal usando a vela FECHADA (não em formação).
    Se wait_next_candle: o sinal foi engatilhado na vela N; ao entrar na vela N+1, a vela N já fechou.
    Re-executa a estratégia nos dados da vela fechada. Se não bater, aborta (não forçar entrada).
    
    Agora suporta estratégias customizadas também.
    """
    if not strategy:
        return True
    try:
        now = int(get_ts()) if callable(get_ts) else int(time.time())
        
        # Determina timeframe baseado na estratégia
        is_m5 = False
        candle_period = 60  # M1 padrão
        if strategy and strategy.startswith("custom:") and custom_strategies_map:
            cs = custom_strategies_map.get(strategy)
            if cs and cs.get("timeframe") == "M5":
                is_m5 = True
                candle_period = 300
        
        candles_raw = get_candles(asset, candle_period, 100, now)
        if not candles_raw or len(candles_raw) < 10:
            logging.info("bot_runner: revalidação — candles insuficientes")
            return False
        
        # Revalida exatamente a vela que originou o sinal.
        # cutoff = signal_from + bucket_size garante que a vela [signal_from] seja a ÚLTIMA incluída.
        bucket_size = 300 if is_m5 else 60
        cutoff = signal_from + bucket_size
        filtered = [c for c in candles_raw if int(c.get("from", 0)) < cutoff]
        filtered.sort(key=lambda c: int(c.get("from", 0)))
        if not filtered or len(filtered) < 10:
            logging.info("bot_runner: revalidação — vela de sinal (%d) não encontrada", signal_from)
            return False
        
        sig = None
        if strategy == "otc":
            sig = _analyze_candles_otc(filtered, asset=asset)
        elif strategy == "supertrend":
            sig = _analyze_candles_supertrend(filtered, asset=asset)
        elif strategy and strategy.startswith("custom:") and custom_strategies_map:
            # Revalidação para estratégias customizadas
            cs = custom_strategies_map.get(strategy)
            if cs:
                sig = _execute_custom_strategy(cs["code"], filtered, asset=asset)
            else:
                logging.warning("bot_runner: revalidação — estratégia customizada não encontrada: %s", strategy)
                return True  # Se não encontrou, permite entrada (fail-safe)
        else:
            return True
        
        if sig != direction:
            logging.info(
                "bot_runner: revalidação FALHOU — vela fechou diferente do gatilho | ativo=%s estrategia=%s dir_esperado=%s resultado=%s",
                asset, strategy, direction, sig
            )
            return False
        logging.info("bot_runner: revalidação OK — vela fechada confirma sinal | ativo=%s estrategia=%s dir=%s", asset, strategy, direction)
        return True
    except Exception as e:
        logging.warning("bot_runner: revalidação falhou: %s", e)
        return False


def _run_bot(token: str, s, config: dict) -> None:
    """Loop do robô: UMA entrada por vez (lock), depois espera WAIT_AFTER_BUY_SECONDS, atualiza saldo, verifica stops."""
    global _signal_bus_engine
    logging.info("bot_runner: a thread do robô foi despachada para o token %s", token[:8])
    state = _bot_state.get(token)
    if not state or not state.get("running"):
        return
    # Captura a geração desta thread. Se outra chamada start_bot incrementar _gen,
    # esta thread detectará a mudança e encerrará sem interferir na nova.
    my_gen = state.get("_gen", 0)

    try:
        s.change_balance("REAL")
    except Exception as e:
        logging.warning("bot_runner: change_balance(REAL): %s", e)

    entry_value = float(config.get("entryValue", 10))
    stop_gain_mode = config.get("stopGainMode", "gross_value")
    stop_gain_value = float(config.get("stopGainValue", 100))
    stop_loss_mode = config.get("stopLossMode", "gross_value")
    stop_loss_value = float(config.get("stopLossValue", 50))
    martingale = config.get("martingale", "none")
    # Banca do usuário: saldo ao iniciar a sessão (para stop gain/loss em %)
    banca_usuario = float(
        state.get("start_balance")
        or state.get("current_balance")
        or config.get("bankroll", 1000)
    )
    bankroll = banca_usuario

    allow_digital = "digital" in (config.get("assetModality") or ["binary"])
    allow_binary = "binary" in (config.get("assetModality") or ["binary"])
    allow_open = "open" in (config.get("marketType") or ["open", "otc"])
    allow_otc = "otc" in (config.get("marketType") or ["open", "otc"])
    enabled_strategies: list[str] = config.get("strategies") or ["otc"]
    enabled_strategies = [str(s).strip().lower() for s in enabled_strategies if str(s).strip()]
    custom_strategies_raw: list[dict] = config.get("customStrategies") or []
    custom_strategies_map: dict[str, dict[str, Any]] = {}
    for cs in custom_strategies_raw:
        sid = str(cs.get("id", "")).strip().lower()
        if sid and isinstance(cs.get("code"), str):
            custom_strategies_map[f"custom:{sid}"] = {
                "code": cs["code"],
                "timeframe": str(cs.get("timeframe", "M1")).upper(),
            }
    strategy_duration_map: dict[str, int] = {
        "otc": 1, "supertrend": 1,
    }
    for k, v in custom_strategies_map.items():
        strategy_duration_map[k] = 5 if v.get("timeframe") == "M5" else 1
    wait_next_candle: bool = bool(config.get("waitNextCandle", True))

    operations = state["operations"]
    total_profit = state["total_profit"]
    current_balance = state.get("current_balance") or bankroll
    mg_level = 0
    max_mg = _martingale_max(martingale)
    # Contadores por ciclo COMPLETO (martingale finalizado em win ou loss).
    entries_count = 0
    win_cycles_count = 0
    loss_cycles_count = 0
    # Ativo e direção atuais de um ciclo de martingale.
    # Enquanto mg_level > 0, reutilizamos esses valores (mesmo ativo, mesma direção).
    current_active: dict[str, Any] | None = None
    current_direction: str = "call"
    current_strategy: str | None = None
    current_duration: int = 1
    current_candle_from: int = 0
    trade_lock = _trade_lock_for(token)
    session_email = str(config.get("session_email") or "").strip().lower() or None
    _signal_bus_init()
    shared_bus_key = _signal_key(
        enabled_strategies=enabled_strategies,
        allow_digital=allow_digital,
        allow_binary=allow_binary,
        allow_open=allow_open,
        allow_otc=allow_otc,
        wait_next_candle=wait_next_candle,
    )
    last_heartbeat_log_ts = 0
    # Evita re-entrar no mesmo minuto se já houve uma tentativa (sucesso ou falha)
    last_processed_bucket = -1
    # Contador de erros consecutivos no loop principal (protege contra crash-loop)
    _consecutive_errors = 0
    _MAX_CONSECUTIVE_ERRORS = 10
    
    # Parâmetros de trading da config
    logging.info(
        "bot_runner: iniciado para token=%s | banca=%.2f | entry=%.2f | mg=%s (max=%d) | "
        "stop_gain=(mode=%s,value=%.2f) | stop_loss=(mode=%s,value=%.2f) | "
        "modalidade=%s | mercado=%s | estrategias=%s | wait_next_candle=%s",
        token[:6] + "***",
        bankroll,
        entry_value,
        martingale,
        max_mg,
        stop_gain_mode,
        stop_gain_value,
        stop_loss_mode,
        stop_loss_value,
        "digital" if allow_digital and not allow_binary else "binary" if allow_binary and not allow_digital else "both",
        "open" if allow_open and not allow_otc else "otc" if allow_otc and not allow_open else "both",
        enabled_strategies,
        wait_next_candle,
    )
    if "supertrend" not in enabled_strategies:
        logging.info(
            "bot_runner: diagnostico estrategias | supertrend desabilitada na configuracao atual (strategies=%s).",
            enabled_strategies,
        )
    if enabled_strategies == ["otc"]:
        logging.info(
            "bot_runner: diagnostico estrategias | apenas OTC ativa; entradas por supertrend nao ocorrerao ate habilitar essa estrategia.",
        )

    # Ativos preferenciais de mercado aberto (forex principais, índices etc.)
    preferred_open = [
        "EURUSD",
        "EURJPY",
        "EURCAD",
        "EURNZD",
        "EURAUD",
        "GBPUSD",
        "GBPJPY",
        "GBPAUD",
    ]

    def _sort_with_preference(names: list[str]) -> list[str]:
        if not names:
            return names
        preferred_set = set(preferred_open)
        preferred = [n for n in names if n in preferred_set]
        others = [n for n in names if n not in preferred_set]
        return preferred + others

    def _get_available_actives():
        try:
            fn = getattr(s, "get_available_actives_filtered", None)
            if callable(fn):
                out = fn(
                    allow_digital=allow_digital,
                    allow_binary=allow_binary,
                    allow_open=allow_open,
                    allow_otc=allow_otc,
                )
                if out:
                    # Garantir filtro rigoroso por Mercado (Aberto vs OTC) e Modalidade
                    if not allow_otc:
                         out = [item for item in out if not _is_active_otc(item.get("name"))]
                    if not allow_open:
                         out = [item for item in out if _is_active_otc(item.get("name"))]
                    if not allow_digital:
                         out = [item for item in out if item.get("type") != "digital"]
                    if not allow_binary:
                         out = [item for item in out if item.get("type") != "binary"]

                    # Priorização e Ordenação por Preferência
                    open_actives = [i for i in out if not _is_active_otc(i.get("name"))]
                    otc_actives = [i for i in out if _is_active_otc(i.get("name"))]
                    
                    sorted_open_names = _sort_with_preference([i["name"] for i in open_actives if "name" in i])
                    name_to_item = {i["name"]: i for i in open_actives}
                    sorted_open = [name_to_item[n] for n in sorted_open_names if n in name_to_item]
                    
                    # Se ambos ativos, retornamos os abertos (ordenados) primeiro
                    out = sorted_open + otc_actives
                    
                    logging.info(
                        "bot_runner: ativos filtrados (digital=%s,binary=%s,open=%s,otc=%s) -> %d ativos",
                        allow_digital, allow_binary, allow_open, allow_otc, len(out)
                    )
                    return out
            
            lst = getattr(s, "get_available_turbo_actives", None)
            if callable(lst):
                raw = lst()
                if raw:
                    logging.info(
                        "bot_runner: fallback get_available_turbo_actives -> %d ativos",
                        len(raw),
                    )
                    # Filtra fallback se allow_otc for falso
                    filtered_raw = []
                    for name in raw:
                        if not allow_otc and _is_active_otc(name): continue
                        filtered_raw.append({"name": name, "type": "binary"})
                    return filtered_raw
        except Exception as e:
            logging.warning("bot_runner: get_available_actives: %s", e)

        logging.info("bot_runner: sem ativos da API, usando fallback DEFAULT_ACTIVE=%s", DEFAULT_ACTIVE)
        return [{"name": DEFAULT_ACTIVE, "type": "binary"}]

    def _has_open_positions():
        """Só abre nova operação se NÃO houver nenhuma posição aberta (turbo/binary/digital) na corretora."""
        try:
            fn_binary = getattr(s, "has_open_binary_turbo_positions", None)
            if callable(fn_binary):
                if fn_binary():
                    logging.info("bot_runner: detectada posição BINÁRIA/TURBO aberta na corretora. Aguardando...")
                    return True
            if allow_digital:
                fn_digital = getattr(s, "has_open_digital_positions", None)
                if callable(fn_digital):
                    if fn_digital():
                        logging.info("bot_runner: detectada posição DIGITAL aberta na corretora. Aguardando...")
                        return True
        except Exception as e:
            logging.info("bot_runner: erro ao verificar posições abertas: %s (isso pode ser comum se a conexão falhar temporariamente)", e)
        return False

    def _active_candidates(name: str) -> list[str]:
        """
        Gera variações de símbolo para aumentar chance de execução quando a corretora
        rejeita um formato específico (ex.: -op / sem -op).
        """
        base = (name or "").strip()
        if not base:
            return []
        out: list[str] = [base]
        
        # Suffix handling
        suffixes = ["-op", "-OTC", "-DIG"]
        clean = base
        found_suffix = None
        for sfx in suffixes:
            if clean.upper().endswith(sfx.upper()):
                clean = clean[:-len(sfx)]
                found_suffix = sfx
                break
        
        if clean != base:
            out.append(clean)
        
        # Add variations
        for sfx in suffixes:
            if sfx != found_suffix: # Don't add the same suffix again
                candidate = f"{clean}{sfx}"
                # Filtro global: se o robô não permite OTC, não gera candidato OTC
                if not allow_otc and _is_active_otc(candidate):
                    continue
                out.append(candidate)
                out.append(f"{clean}{sfx.lower()}")

        # dedupe preservando ordem
        uniq: list[str] = []
        seen = set()
        for item in out:
            if item and item not in seen:
                uniq.append(item)
                seen.add(item)
        return uniq

    MAX_SCAN_ACTIVES = 30
    scan_turn = 0

    def _find_signal() -> tuple[tuple[dict[str, Any] | None, str | None, str | None, int, int], dict]:
        """Varre a lista de ativos permitidos e retorna o primeiro que bater a estratégia.

        Retorna (ativo, direção, nome_estratégia).
        """
        nonlocal scan_turn
        try:
            scan_turn += 1
            scan_stats: dict[str, int] = {
                "assets_scanned": 0,
                "candles_insufficient": 0,
                "otc_checks": 0, "otc_hits": 0,
                "supertrend_checks": 0, "supertrend_hits": 0,
            }
            get_candles = getattr(s, "get_candles", None)
            get_ts = getattr(s, "get_server_timestamp", None)
            if not callable(get_candles):
                return None, None, None

            actives = _get_available_actives()
            if not actives:
                return None, None, None

            # Alterna prioridade de mercado quando open e otc estão ativos juntos,
            # para não enviesar a busca sempre para um único lado.
            market_order = "as_returned"
            if allow_open and allow_otc:
                market_otc_first = (scan_turn % 2 == 0)
                open_actives: list[dict[str, Any]] = []
                otc_actives: list[dict[str, Any]] = []
                for item in actives:
                    name = str(item.get("name") or "")
                    if _is_active_otc(name):
                        otc_actives.append(item)
                    else:
                        open_actives.append(item)
                actives = (otc_actives + open_actives) if market_otc_first else (open_actives + otc_actives)
                market_order = "otc->open" if market_otc_first else "open->otc"

            # Sem ordem fixa: todas as estratégias têm a mesma chance (embaralha a cada varredura)
            strategy_order = (
                [s for s in ["otc", "supertrend"] if s in enabled_strategies]
                + [s for s in enabled_strategies if s.startswith("custom:") and s in custom_strategies_map]
            )
            random.shuffle(strategy_order)
            found_signals: dict[str, dict] = {}
            
            logging.info(
                "bot_runner: ESCANEAMENTO LÍDER (bucket=%d) | ord_mercado=%s",
                int(time.time() // 60) % 100, market_order
            )

            for idx_a, item in enumerate(actives[:MAX_SCAN_ACTIVES], start=1):
                # Update Heartbeat do Líder no Banco (Importante para 'transferir' carga se cair)
                if idx_a % 5 == 0:
                   _update_leader_heartbeat(shared_bus_key, minute_bucket)

                scan_stats["assets_scanned"] += 1
                name = item.get("name")
                if not isinstance(name, str): continue
                
                try:
                    endtime = int(get_ts()) if callable(get_ts) else int(time.time())
                except Exception:
                    continue

                # M1: estratégias builtin + custom M1
                m1_strategies = [sn for sn in strategy_order if sn in ("otc", "supertrend") or (sn.startswith("custom:") and custom_strategies_map.get(sn, {}).get("timeframe") == "M1")]
                # M5: custom M5
                m5_strategies = [sn for sn in strategy_order if sn.startswith("custom:") and custom_strategies_map.get(sn, {}).get("timeframe") == "M5"]

                candles_m1 = None
                if m1_strategies:
                    try:
                        # Buscamos 250 candles para permitir médias longas (ex: 200 period)
                        candles_raw = get_candles(name, 60, 250, endtime)
                        if candles_raw:
                            candles_m1 = candles_raw
                    except Exception:
                        pass
                candles_m5 = None
                if m5_strategies:
                    try:
                        # Buscamos 250 candles para permitir médias longas
                        candles_raw = get_candles(name, 300, 250, endtime)
                        if candles_raw:
                            candles_m5 = candles_raw
                    except Exception:
                        pass

                if candles_m1 is None and candles_m5 is None:
                    continue
                if candles_m1 and len(candles_m1) < 40:
                    candles_m1 = None
                if candles_m5 and len(candles_m5) < 20:
                    candles_m5 = None

                for strategy_name in strategy_order:
                    if strategy_name in found_signals:
                        continue
                    is_m5 = strategy_name.startswith("custom:") and custom_strategies_map.get(strategy_name, {}).get("timeframe") == "M5"
                    candles = candles_m5 if is_m5 else candles_m1
                    if not candles:
                        continue

                    signal_dir = None
                    if strategy_name == "otc":
                        scan_stats["otc_checks"] += 1
                        signal_dir = _analyze_candles_otc(candles, asset=name)
                    elif strategy_name == "supertrend":
                        scan_stats["supertrend_checks"] += 1
                        signal_dir = _analyze_candles_supertrend(candles, asset=name)
                    elif strategy_name.startswith("custom:") and strategy_name in custom_strategies_map:
                        cs = custom_strategies_map[strategy_name]
                        signal_dir = _execute_custom_strategy(cs["code"], list(candles), asset=name)

                    if signal_dir in ("call", "put"):
                        dur = strategy_duration_map.get(strategy_name, 1)
                        found_signals[strategy_name] = {
                            "active_name": name,
                            "active_type": item.get("type", "binary"),
                            "direction": signal_dir,
                            "strategy": strategy_name,
                            "duration": dur,
                            "candle_from": int(candles[-1].get("from", 0)),
                        }
                        _publish_multi_signals(shared_bus_key, minute_bucket, found_signals)

                # Se já achamos sinais para as estratégias principais do líder, podemos terminar mais cedo?
                # Não, melhor varrer tudo para alimentar todos os seguidores do canal.
                # Mas limitamos a 1 sinal por estratégia total.
                if len(found_signals) == len(strategy_order): break

            logging.info("bot_runner: varredura concluída. Sinais achados: %s", list(found_signals.keys()))
            
            # Sem prioridade: qualquer estratégia que achou padrão pode ser usada (escolha aleatória)
            chosen = None
            if found_signals:
                chosen = random.choice(list(found_signals.values()))
            
            if chosen:
                return (
                    (
                        {"name": chosen["active_name"], "type": chosen["active_type"]},
                        chosen["direction"],
                        chosen["strategy"],
                        chosen.get("duration", 1),
                        chosen.get("candle_from", 0),
                    ),
                    found_signals,
                )
            return (None, None, None, 1, 0), found_signals

        except Exception as e:
            logging.warning("bot_runner: _find_signal error: %s", e)
        return (None, None, None, 1), {}

    def _get_current_m1_snapshot(asset_name: str) -> tuple[int, float, float] | None:
        """Snapshot da M1 atual: (inicio_da_vela, abertura, preco_atual)."""
        get_candles = getattr(s, "get_candles", None)
        get_ts = getattr(s, "get_server_timestamp", None)
        if not callable(get_candles):
            return None
        try:
            now_ts = int(get_ts()) if callable(get_ts) else int(time.time())
        except Exception:
            now_ts = int(time.time())
        try:
            candles = get_candles(asset_name, 60, 4, now_ts)
        except Exception:
            return None
        if not candles:
            return None

        selected = None
        for candle in reversed(candles):
            try:
                candle_from = int(candle.get("from"))
            except Exception:
                continue
            candle_to = candle_from + 60
            if candle_from <= now_ts < candle_to:
                selected = candle
                break
        if selected is None:
            selected = candles[-1]

        try:
            candle_from = int(selected.get("from"))
            candle_open = float(selected.get("open"))
            market_price = float(selected.get("close"))
            return candle_from, candle_open, market_price
        except Exception:
            return None

    while state.get("running") and state.get("_gen") == my_gen:
        try:
            now_loop = time.time()
            if now_loop - last_heartbeat_log_ts >= 30:
                logging.info(
                    "bot_runner: heartbeat | running=%s mg_level=%d ativo=%s dir=%s estrategia=%s "
                    "saldo=%.2f lucro_total=%.2f entradas=%d wins=%d losses=%d",
                    bool(state.get("running")),
                    mg_level,
                    (current_active or {}).get("name") if current_active else "—",
                    current_direction if current_active else "—",
                    current_strategy or "—",
                    float(current_balance),
                    float(total_profit),
                    entries_count,
                    win_cycles_count,
                    loss_cycles_count,
                )
                last_heartbeat_log_ts = now_loop

            # Esperar até não haver operação rolando na corretora (qualquer ativo).
            # Em martingale, reduz o intervalo para acelerar a reentrada após loss.
            poll_interval = (
                FAST_POLL_OPEN_POSITIONS_INTERVAL_SEC if mg_level > 0 else POLL_OPEN_POSITIONS_INTERVAL_SEC
            )
            while state.get("running") and state.get("_gen") == my_gen and _has_open_positions():
                logging.info("bot_runner: detectada posição(ões) aberta(s) na corretora. Aguardando fechamento antes de nova entrada.")
                time.sleep(poll_interval)
            if not state.get("running") or state.get("_gen") != my_gen:
                break

            # Antes de iniciar um novo ciclo (mg_level == 0), verificar stops por ENTRADAS já concluídas.
            if mg_level == 0:
                if stop_gain_mode == "entries" and win_cycles_count >= stop_gain_value:
                    logging.info("bot_runner: stop_gain (quantidade de entradas ganhas) atingido. Parando.")
                    state["running"] = False
                    state["stop_reason"] = "stop_gain"
                    break
                if stop_loss_mode == "entries" and loss_cycles_count >= stop_loss_value:
                    logging.info("bot_runner: stop_loss (quantidade de entradas perdidas) atingido. Parando.")
                    state["running"] = False
                    state["stop_reason"] = "stop_loss"
                    break

            # Escolher ativo e direção APENAS no início de um ciclo de martingale (mg_level == 0).
            # Reentradas de martingale (mg_level > 0) usam o mesmo ativo e mesma direção.
            is_leader = False
            found_any = {}
            if mg_level == 0 or current_active is None:
                logging.info("bot_runner: iniciando protocolo de busca de sinal (mg_level=%d)", mg_level)
                while state.get("running") and state.get("_gen") == my_gen:
                    now_ts = int(getattr(s, "get_server_timestamp", lambda: int(time.time()))())
                    minute_bucket = now_ts // 60

                    logging.info("bot_runner: checando sinal compartilhado para o minuto %d...", minute_bucket % 100)
                    # Se já processamos este bucket (pelo menos tentado uma vez), aguarda o próximo
                    if minute_bucket <= last_processed_bucket and mg_level == 0:
                        time.sleep(1)
                        continue

                    # 1. Tenta buscar sinal no barramento compartilhado (Polling)
                    # pode estar em 'searching', 'found', 'triggered' ou 'none')
                    shared_data = _get_shared_signal_sync(shared_bus_key, minute_bucket)
                    
                    if shared_data:
                        # 1. Pega qualquer sinal que o líder encontrou (sem prioridade de estratégia)
                        my_best = None
                        s_json = shared_data.get("signals_json")
                        if isinstance(s_json, dict):
                            allowed = [s_json[s] for s in enabled_strategies if s in s_json]
                            if allowed:
                                my_best = random.choice(allowed)
                                    
                        if my_best:
                            # Validação rigorosa: o sinal é do meu mercado/modalidade?
                            # NOTA: O bus_key já deveria filtrar isso, mas fazemos check extra por segurança.
                            s_name = my_best["active_name"]
                            s_type = my_best["active_type"]
                            s_is_otc = _is_active_otc(s_name)
                            
                            mkt_ok = (s_is_otc and allow_otc) or (not s_is_otc and allow_open)
                            mod_ok = (s_type == "digital" and allow_digital) or (s_type == "binary" and allow_binary)
                            
                            if mkt_ok and mod_ok:
                                current_active = {"name": s_name, "type": s_type}
                                current_direction = my_best["direction"]
                                current_strategy = my_best["strategy"]
                                current_duration = my_best.get("duration", 1)
                                current_candle_from = my_best.get("candle_from", 0)
                                is_leader = False
                                logging.info(
                                    "bot_runner (Seguidor): sinal compartilhado (%s) detectado | ativo=%s dir=%s | signal_candle=%d",
                                    current_strategy, current_active["name"], current_direction, current_candle_from
                                )
                                break
                        
                        # 2. Se o status é triggered (gatilho global do canal), e eu ainda não peguei,
                        # pego o sinal padrão que o lider postou como principal.
                        if shared_data["status"] == "triggered" and shared_data["active_name"] not in ("SEARCHING", "NONE"):
                            # Filtro: só aceito se a estratégia do sinal principal for permitida para mim
                            if (shared_data["strategy"] in enabled_strategies):
                                s_name = shared_data["active_name"]
                                s_type = shared_data["active_type"]
                                s_is_otc = _is_active_otc(s_name)
                                
                                mkt_ok = (s_is_otc and allow_otc) or (not s_is_otc and allow_open)
                                mod_ok = (s_type == "digital" and allow_digital) or (s_type == "binary" and allow_binary)
                                
                                if mkt_ok and mod_ok:
                                    current_active = {"name": s_name, "type": s_type}
                                    current_direction = shared_data["direction"]
                                    current_strategy = shared_data["strategy"]
                                    current_duration = strategy_duration_map.get(shared_data.get("strategy", ""), 1)
                                    current_candle_from = shared_data.get("candle_from", 0)
                                    is_leader = False
                                    break
                        # 3. Gestão de estados do líder
                        status = shared_data.get("status")
                        if status == "searching":
                            # Check se o líder ainda está vivo (heartbeat atualizado nos últimos 15s)
                            if int(time.time()) - shared_data.get("heartbeat_ts", 0) <= 15:
                                if time.time() % 3 < 0.1: # Throttled log
                                    logging.info("bot_runner: aguardando líder concluir varredura... (bucket=%d)", minute_bucket % 100)
                                time.sleep(0.5)
                                continue
                            else:
                                logging.warning("bot_runner: líder atual parece inativo (stale), tentando assumir...")
                                # Não damos continue, permitimos cair na lógica de "Steal" abaixo
                        
                        elif status in ("none", "found", "triggered", "aborted", "aborted_price_guard"):
                            # Se já temos um estado final e não pegamos o sinal no 'break' acima,
                            # este minuto não tem oportunidades para nós.
                            if time.time() % 20 < 0.1:
                                logging.info("bot_runner: minuto %d já processado (status=%s), aguardando próximo...", minute_bucket % 100, status)
                            last_processed_bucket = minute_bucket
                            time.sleep(1)
                            continue

                    # 2. Se nenhum robô está procurando nesse minuto, TENTA SE TORNAR O LÍDER (Scanner)
                    # Usamos a inserção inicial como lock de liderança.
                    logging.info("bot_runner: nenhum líder ativo no momento, tentando assumir liderança para o minuto %d...", minute_bucket % 100)
                    try:
                        with _signal_bus_lock:
                            if _signal_bus_engine is None: _signal_bus_engine = get_engine()
                            with _signal_bus_engine.begin() as conn:
                                now_s = int(time.time())
                                # 1. Tenta inserir como lider novo
                                res = conn.execute(
                                    sa_text("INSERT INTO signal_bus (bus_key, minute_bucket, active_name, active_type, direction, created_ts, heartbeat_ts, status) "
                                            "VALUES (:k, :b, 'SEARCHING', '', '', :ts, :ts, 'searching') ON CONFLICT DO NOTHING"),
                                    {"k": shared_bus_key, "b": minute_bucket, "ts": now_s}
                                )
                                if res.rowcount > 0:
                                    is_leader = True
                                else:
                                    # 2. Se falhou, verifica se o lider atual está 'morto' (heartbeat > 10s)
                                    # Se estiver, este robô assume a liderança (Steal Leadership)
                                    stale_limit = now_s - 10
                                    res_steal = conn.execute(
                                        sa_text("UPDATE signal_bus SET status='searching', heartbeat_ts=:ts, created_ts=:ts "
                                                "WHERE bus_key=:k AND minute_bucket=:b AND (status='searching' OR status='waiting') "
                                                "AND heartbeat_ts < :limit"),
                                        {"k": shared_bus_key, "b": minute_bucket, "ts": now_s, "limit": stale_limit}
                                    )
                                    if res_steal.rowcount > 0:
                                        logging.info("bot_runner: LIDERANÇA ASSUMIDA (Steal) - líder anterior offline.")
                                        is_leader = True
                    except Exception as e:
                        logging.warning("bot_runner: erro ao tentar assumir liderança: %s", e)
                        is_leader = False

                    if is_leader:
                        logging.info("bot_runner: este robô assumiu a LIDERANÇA da varredura para o minuto %d", minute_bucket % 100)
                        (chosen, signal_dir, used_strategy, duration, candle_from_info), found_any = _find_signal()
                        
                        if chosen and signal_dir:
                            current_active = chosen
                            current_direction = signal_dir
                            current_strategy = used_strategy
                            current_duration = duration
                            current_candle_from = candle_from_info
                            # Publica o sinal encontrado (líder + todos os outros)
                            _publish_shared_signal(
                                shared_bus_key, minute_bucket,
                                chosen["name"], chosen.get("type", "binary"),
                                signal_dir, used_strategy, status="found",
                                candle_from=candle_from_info,
                                signals_data=found_any
                            )
                            break
                        elif found_any:
                            # O líder não achou sinal para si, mas achou para outros!
                            # Publica o lote mas marca como 'status=found' com nome NONE para o principal.
                            # Assim os seguidores que tem essas estratégias ativas podem pegar.
                            _publish_shared_signal(
                                shared_bus_key, minute_bucket, 
                                "NONE", "binary", "none", None, 
                                status="found", signals_data=found_any
                            )
                            # Líder volta ao repouso mas não apaga o canal.
                            logging.info("bot_runner (Líder): nenhum sinal para minhas estratégias, mas sinais para outros foram publicados: %s", list(found_any.keys()))
                            time.sleep(2)
                            continue
                        else:
                            # Nenhuma oportunidade real para ninguém.
                            _publish_shared_signal(shared_bus_key, minute_bucket, "NONE", "", "", None, status="none")
                            time.sleep(1)
                            continue
                    
                    # 3. Se não é líder e não tem sinal ainda, espera um pouco para não fritar o banco
                    time.sleep(0.5)

                if not state.get("running"): break
                
                logging.info(
                    "bot_runner: ciclo iniciado | ativo=%s tipo=%s dir=%s estrategia=%s | lider=%s",
                    current_active.get("name"),
                    current_active.get("type"),
                    current_direction,
                    current_strategy,
                    is_leader
                )
            # Reentradas de Martingale são privadas: cada robô assume sua cronometragem 
            # (is_leader=True para o ciclo) mas NÃO polui o canal dos outros (skip_publish=True).
            skip_publish = False
            if mg_level > 0:
                logging.info(
                    "bot_runner: reentrada martingale | ativo=%s dir=%s estrategia=%s mg_level=%d",
                    (current_active or {}).get("name"),
                    current_direction,
                    current_strategy,
                    mg_level,
                )
                is_leader = True
                skip_publish = True

            active = current_active["name"]
            active_type = current_active.get("type", "binary")
            direction = current_direction
            price = entry_value * (2 ** mg_level)
            
            now_ts_for_bucket = int(getattr(s, "get_server_timestamp", lambda: int(time.time()))())
            minute_bucket = now_ts_for_bucket // 60

            if is_leader:
                # Lógica do LÍDER: Executa as esperas e validações de preço
                must_wait = bool(wait_next_candle)
                if must_wait:
                    # O sinal foi dado na vela 'current_candle_from'
                    # Se wait_next_candle for True, esperamos essa vela fechar antes de entrar.
                    # M1: próximo minuto; M5: próximo bloco de 5 min
                    bucket_size = 300 if current_duration >= 5 else 60
                    target_min_start = current_candle_from + bucket_size
                    delay = max(0, target_min_start - now_ts_for_bucket)
                    if delay > 0:
                        logging.info("bot_runner (Lider): aguardando próxima vela (%dm) em %.0fs", current_duration, delay)
                    while state.get("running") and state.get("_gen") == my_gen:
                        cur_ts = int(getattr(s, "get_server_timestamp", lambda: int(time.time()))())
                        if cur_ts >= target_min_start:
                            break
                        if (target_min_start - cur_ts) <= 1:
                            break
                        time.sleep(0.05)
                    # Pausa mínima para a API/corretora registrar o fechamento da vela antes da revalidação
                    if state.get("running") and must_wait:
                        time.sleep(0.3)
                
                # Revalidação (apenas quando wait_next_candle): vela de sinal já FECHOU — se não bater mais, aborta
                # AGORA APLICA PARA TODAS AS ESTRATÉGIAS (built-in E customizadas)
                get_candles_fn = getattr(s, "get_candles", None)
                get_ts_fn = getattr(s, "get_server_timestamp", lambda: int(time.time()))
                if must_wait and callable(get_candles_fn):
                    guard_ok = _revalidate_signal_on_closed(
                        active, direction, current_strategy, current_candle_from,
                        get_candles_fn, get_ts_fn, custom_strategies_map
                    )
                    # Se falhou por dados atrasados (API), dá uma segunda chance após 700ms
                    if not guard_ok and state.get("running"):
                        logging.info("bot_runner (Lider): revalidação falhou — nova tentativa em 700ms (dados da vela podem estar atrasados)")
                        time.sleep(0.7)
                        guard_ok = _revalidate_signal_on_closed(
                            active, direction, current_strategy, current_candle_from,
                            get_candles_fn, get_ts_fn, custom_strategies_map
                        )
                else:
                    guard_ok = True
                
                logging.info("bot_runner (Lider): disparando gatilho em %s (segundo=%d) revalidação=%s...",
                    active, int(time.time()) % 60, "OK" if guard_ok else "FALHOU")
                server_now = int(get_ts_fn())
                
                if not guard_ok:
                    logging.info("bot_runner (Lider): vela fechou diferente do gatilho — abortando entrada (não forçar).")
                    if not skip_publish:
                        _publish_shared_signal(
                            shared_bus_key, minute_bucket, active, active_type, direction, current_strategy,
                            status="aborted", signals_data=found_any
                        )
                    if mg_level == 0: current_active = None
                    continue
                
                if not skip_publish:
                    _publish_shared_signal(
                        shared_bus_key, minute_bucket, active, active_type, direction, current_strategy,
                        status="triggered", candle_from=(minute_bucket+1)*60, trigger_ts=server_now,
                        signals_data=found_any
                    )
            else:
                # Lógica do SEGUIDOR: Polling ultra-rápido do status 'triggered'
                logging.debug("bot_runner (Seguidor): em prontidão para gatilho do líder...")
                trigger_data = None
                while state.get("running") and state.get("_gen") == my_gen:
                    # Check shared status
                    trigger_data = _get_shared_signal_sync(shared_bus_key, minute_bucket)
                    if not trigger_data: break
                    if trigger_data["status"] == "triggered":
                        logging.info("bot_runner (Seguidor): GATILHO RECEBIDO! Executando entrada simultânea.")
                        break
                    if trigger_data["status"] == "aborted":
                        logging.info("bot_runner (Seguidor): Líder abortou entrada.")
                        break
                    
                    now_sec = int(time.time()) % 60
                    if now_sec >= 59 or now_sec < 2:
                        time.sleep(0.01) # 10ms polling na virada da vela
                    else:
                        time.sleep(0.1)
                
                if not trigger_data or trigger_data["status"] != "triggered":
                    if mg_level == 0: current_active = None
                    continue

            # --- AMBOS CHEGAM AQUI PARA EXECUTAR A ORDEM (LOCK CURTO E DISPARO REATIVO) ---
            logging.info(
                "bot_runner: EXECUTANDO ENTRADA | ativo=%s dir=%s estrategia=%s valor=%.2f duração=%dm",
                active, direction, current_strategy or "—", price, current_duration
            )
            with trade_lock:
                if _has_open_positions():
                    continue
                # --- FILTRO FINAL DE SEGURANÇA (Mercado/Modalidade) ---
                is_this_otc = _is_active_otc(active)
                mkt_safe = (is_this_otc and allow_otc) or (not is_this_otc and allow_open)
                if not mkt_safe:
                    logging.warning(
                        "bot_runner: CANCELANDO ENTRADA POR SEGURANÇA | Ativo %s não permitido pela configuração (OTC=%s)",
                        active, allow_otc
                    )
                    current_active = None
                    if mg_level == 0: last_processed_bucket = minute_bucket
                    continue

                balance_before = s.get_balance() or current_balance

                # --- VALIDAÇÃO DE SALDO SUFICIENTE ANTES DE ENTRAR ---
                # Se o saldo atual for menor que o valor da entrada, para o robô.
                if float(balance_before) < float(price):
                    logging.warning(
                        "bot_runner: SALDO INSUFICIENTE — saldo=%.2f entrada=%.2f | parando robô.",
                        float(balance_before), float(price)
                    )
                    state["running"] = False
                    state["stop_reason"] = "insufficient_balance"
                    _trigger_push_event(token, "stop_loss", {
                        "profit": f"{total_profit:+.2f}",
                        "entries": str(len(operations)),
                        "wins": str(sum(1 for o in operations if o.get("result") == "win")),
                        "losses": str(sum(1 for o in operations if o.get("result") == "loss")),
                    })
                    break

                # --- VALIDAÇÃO DE PREÇO ANTES DE ENTRAR (GUARDA DE SEGURANÇA) ---
                # COMPRA (CALL): preço atual deve ser <= abertura da vela
                # VENDA (PUT): preço atual deve ser >= abertura da vela
                # Isso garante que não entramos em condições que já mudaram
                # Aplica para TODAS as estratégias (built-in e customizadas)
                price_guard_ok = True
                try:
                    # Para M5, também usa snapshot M1 (preço atual é o mesmo)
                    snapshot = _get_current_m1_snapshot(active)
                    if snapshot:
                        candle_from, candle_open, market_price = snapshot
                        price_guard_ok = _is_valid_open_price_guard(direction, candle_open, market_price)
                        if not price_guard_ok:
                            logging.warning(
                                "bot_runner: VALIDAÇÃO DE PREÇO FALHOU — abortando entrada | "
                                "ativo=%s estratégia=%s direção=%s abertura=%.5f preço_atual=%.5f",
                                active, current_strategy or "—", direction, candle_open, market_price
                            )
                            if not skip_publish:
                                _publish_shared_signal(
                                    shared_bus_key, minute_bucket, active, active_type, direction, current_strategy,
                                    status="aborted_price_guard", signals_data=found_any
                                )
                            if mg_level == 0:
                                current_active = None
                                last_processed_bucket = minute_bucket
                            continue
                        else:
                            logging.debug(
                                "bot_runner: validação de preço OK | ativo=%s dir=%s abertura=%.5f preço=%.5f",
                                active, direction, candle_open, market_price
                            )
                except Exception as price_err:
                    logging.warning("bot_runner: erro ao validar preço (continuando): %s", price_err)
                    # Em caso de erro na validação, continua (fail-safe)
                
                order_id = None
                ok = False
                used_active = active
                used_type = active_type

                # 1) Tenta modalidade original com variações de símbolo.
                last_error = None
                _digital_key_error = False  # ativo não existe no mapa de digitais
                for candidate in _active_candidates(active):
                    if active_type == "digital":
                        buy_fn = getattr(s, "buy_digital_spot_v2", None)
                        if callable(buy_fn):
                            try:
                                ok, order_val = buy_fn(candidate, price, direction, current_duration)
                                order_id = order_val
                            except KeyError:
                                # Ativo não suporta digital (não existe em OP_code.ACTIVES)
                                ok, order_id = False, "digital não disponível para este ativo"
                                _digital_key_error = True
                        else:
                            ok, order_id = False, "digital não disponível"
                    else:
                        ok, order_val = s.buy(price, candidate, direction, current_duration)
                        order_id = order_val

                    if ok:
                        used_active = candidate
                        logging.info("bot_runner: ORDEM ACEITA PELA CORRETORA! Ativo=%s Tipo=%s ID=%s", candidate, active_type, order_id)
                        break
                    else:
                        last_error = order_id
                        logging.debug("bot_runner: falha tentativa (Original %s) at=%s msg=%s", active_type, candidate, last_error)

                # 2) Fallback de modalidade:
                # se não entrou como digital, tenta binary; se não entrou como binary, tenta digital.
                if not ok:
                    fallback_type = "binary" if active_type == "digital" else "digital"
                    logging.debug("bot_runner: tentando fallback para %s...", fallback_type)
                    for candidate in _active_candidates(active):
                        if fallback_type == "digital":
                            buy_fn = getattr(s, "buy_digital_spot_v2", None)
                            if callable(buy_fn):
                                try:
                                    ok, order_val = buy_fn(candidate, price, direction, current_duration)
                                    order_id = order_val
                                except KeyError:
                                    ok, order_id = False, "digital não disponível para este ativo"
                            else:
                                ok, order_id = False, "digital não disponível"
                        else:
                            ok, order_val = s.buy(price, candidate, direction, current_duration)
                            order_id = order_val

                        if ok:
                            used_active = candidate
                            used_type = fallback_type
                            logging.info(
                                "bot_runner: ORDEM ACEITA (Fallback %s) | Ativo=%s ID=%s",
                                used_type,
                                candidate,
                                order_id,
                            )
                            break
                        else:
                            last_error = order_id
                            logging.debug("bot_runner: falha tentativa (Fallback %s) at=%s msg=%s", fallback_type, candidate, last_error)
                
                # Se após todos os candidatos e modalidades ainda ok=False, usamos o last_error para o log final
                if not ok:
                    order_id = last_error
                if not ok:
                    msg = str(order_id or "").lower()
                    if "suspended" in msg:
                        logging.warning(
                            "bot_runner: ativo suspenso | ativo=%s tipo=%s msg=%s",
                            active,
                            active_type,
                            order_id,
                        )
                    elif "digital não disponível para este ativo" in msg or _digital_key_error:
                        # Ativo não suporta digital — não é erro fatal, apenas pula este ciclo
                        logging.warning(
                            "bot_runner: ativo %s não suporta digital (KeyError) — pulando ciclo sem contar erro",
                            active,
                        )
                    else:
                        logging.warning(
                            "bot_runner: falha ao enviar ordem | ativo=%s tipo=%s dir=%s valor=%.2f mg_level=%d msg=%s",
                            active,
                            active_type,
                            direction,
                            price,
                            mg_level,
                            order_id,
                        )
                    if mg_level == 0:
                        last_processed_bucket = minute_bucket

                    # Reseta contador de erros consecutivos para KeyError de digital (não é erro do sistema)
                    if _digital_key_error:
                        _consecutive_errors = 0

                    if not _interruptible_sleep(5, state):
                        break
                    continue

                # Registra operação como PENDENTE na hora (aparece na plataforma de imediato).
                op_id = str(len(operations) + 1)
                operations.append({
                    "id": op_id,
                    "timestamp": time.time(),
                    "asset": used_active,
                    "direction": "call" if direction == "call" else "put",
                    "entryValue": price,
                    "result": "pending",
                    "profit": 0.0,
                    "martingaleLevel": mg_level,
                    "balanceAfter": round(float(balance_before), 2),
                    "strategy": current_strategy,
                    "duration": current_duration,
                })
                # Limita operações na RAM para evitar memory leak em sessões longas
                if len(operations) > _MAX_OPS_IN_MEMORY:
                    operations[:] = operations[-_MAX_OPS_IN_MEMORY:]
                direction_label = "Compra" if direction == "call" else "Venda"
                _trigger_push_event(session_email, "operation_opened", {
                    "asset": used_active,
                    "direction": direction_label,
                    "entry_value": f"{price:.2f}",
                })
                state["current_balance"] = current_balance
                state["total_profit"] = total_profit

                # Resultado real: primeiro tenta evento/histórico da corretora (digitais).
                is_win = None
                profit = 0.0
                if used_type == "digital" and order_id is not None:
                    poll_fn = getattr(s, "poll_digital_result", None)
                    if callable(poll_fn):
                        try:
                            # Se for M5, esperamos pelo menos 300s + margem.
                            dyn_timeout = max(68, (current_duration * 60) + 8)
                            res = poll_fn(order_id, timeout_sec=dyn_timeout)
                            if res is not None:
                                profit = res[0]
                                if abs(profit) < MIN_PROFIT_FOR_WIN:
                                    is_win = None
                                    logging.info(
                                        "bot_runner: resultado por evento corretora (digital) | profit=%.2f -> EMPATE (abertura=fechamento)",
                                        profit,
                                    )
                                else:
                                    is_win = profit > MIN_PROFIT_FOR_WIN
                                    logging.info(
                                        "bot_runner: resultado por evento corretora (digital) | profit=%.2f -> %s",
                                        profit,
                                        "WIN" if is_win else "LOSS",
                                    )
                        except Exception as e:
                            logging.warning("bot_runner: poll_digital_result: %s", e)
                if used_type != "digital":
                    get_result = getattr(s, "get_binary_option_result", None)
                    if callable(get_result) and order_id is not None:
                        try:
                            oid = int(order_id) if not isinstance(order_id, int) else order_id
                            # Timeout dinâmico: duração da vela + margem curta (15s)
                            dyn_timeout = (current_duration * 60) + 15
                            logging.info("bot_runner: aguardando resultado binário | order_id=%s timeout=%ds", oid, dyn_timeout)
                            win_result, profit_result = get_result(oid, timeout_sec=dyn_timeout)
                            if win_result is not None:
                                is_win = win_result
                                profit = float(profit_result)
                                logging.info("bot_runner: resultado obtido via get_binary_option_result | win=%s | profit=%.2f", is_win, profit)
                            else:
                                logging.warning("bot_runner: get_binary_option_result retornou None (timeout) | order_id=%s | tentando verificação final", oid)
                                # Timeout aconteceu, mas vamos tentar verificar uma última vez se o resultado já está disponível
                                # antes de ir para o fallback de saldo
                                try:
                                    time.sleep(2)  # Pequena pausa para dar tempo do evento chegar
                                    # Tenta verificar diretamente no order_binary se disponível
                                    if hasattr(s, "api") and hasattr(s.api, "order_binary"):
                                        oid_int = int(order_id) if not isinstance(order_id, int) else order_id
                                        oid_str = str(order_id)
                                        key = oid_int if oid_int in s.api.order_binary else (oid_str if oid_str in s.api.order_binary else None)
                                        if key is not None:
                                            your_order = s.api.order_binary.pop(key, None)
                                            if your_order:
                                                win = (your_order.get("win") or your_order.get("result") or "").lower()
                                                sum_inv = float(your_order.get("sum") or your_order.get("amount") or your_order.get("invest") or 0)
                                                win_amount = float(your_order.get("win_amount") or 0)
                                                if win in ("win", "won"):
                                                    profit_val = (win_amount - sum_inv) if win_amount else (sum_inv * 0.88)
                                                    is_win = True
                                                    profit = round(profit_val, 2)
                                                    logging.info("bot_runner: resultado encontrado após timeout (verificação final) | WIN | profit=%.2f", profit)
                                                elif win in ("loose", "loss", "lose"):
                                                    is_win = False
                                                    profit = round(-sum_inv, 2)
                                                    logging.info("bot_runner: resultado encontrado após timeout (verificação final) | LOSS | profit=%.2f", profit)
                                                elif win:
                                                    # equal ou outro status
                                                    is_win = False
                                                    profit = 0.0
                                                    logging.info("bot_runner: resultado encontrado após timeout (verificação final) | EMPATE")
                                except Exception as check_err:
                                    logging.debug("bot_runner: verificação final de resultado falhou (normal se não disponível): %s", check_err)
                        except Exception as e:
                            logging.warning("bot_runner: get_binary_option_result: %s", e)

                # Fallback universal (digitais sem evento ou saldo): diferença de saldo após fechamento.
                # Para digitais aguardamos mais (corretora pode demorar a liquidar). Se lucro ambíguo, reler saldo
                # algumas poucas vezes, mas sem alongar demais para não pular vela em ciclos de martingale.
                if is_win is None:
                    # Cálculo dinâmico de espera: quanto tempo falta para a vela fechar + margem
                    entry_ts = operations[-1].get("timestamp", time.time())
                    elapsed = time.time() - entry_ts
                    
                    needed_total = (current_duration * 60) + 5
                    # Ajuste fino por modalidade
                    if used_type == "digital":
                        needed_total = max(needed_total, WAIT_AFTER_BUY_SECONDS_DIGITAL)
                    else:
                        needed_total = max(needed_total, WAIT_AFTER_BUY_SECONDS)
                    
                    remaining = needed_total - elapsed
                    if remaining > 0:
                        logging.info("bot_runner: aguardando fechamento da vela (faltam %.1fs)...", remaining)
                        if not _interruptible_sleep(remaining, state):
                            break
                    else:
                        # Se já passamos do tempo necessário (ex: por timeout do poll anterior),
                        # fazemos apenas uma pequena pausa técnica para a corretora processar o saldo
                        if not _interruptible_sleep(2, state):
                            break
                    
                    # Antes de verificar saldo, tenta mais uma vez verificar resultado direto (para binárias)
                    if used_type != "digital" and order_id is not None:
                        try:
                            oid_int = int(order_id) if not isinstance(order_id, int) else order_id
                            oid_str = str(order_id)
                            if hasattr(s, "api") and hasattr(s.api, "order_binary"):
                                key = oid_int if oid_int in s.api.order_binary else (oid_str if oid_str in s.api.order_binary else None)
                                if key is not None:
                                    your_order = s.api.order_binary.pop(key, None)
                                    if your_order:
                                        win = (your_order.get("win") or your_order.get("result") or "").lower()
                                        sum_inv = float(your_order.get("sum") or your_order.get("amount") or your_order.get("invest") or 0)
                                        win_amount = float(your_order.get("win_amount") or 0)
                                        if win in ("win", "won"):
                                            profit_val = (win_amount - sum_inv) if win_amount else (sum_inv * 0.88)
                                            is_win = True
                                            profit = round(profit_val, 2)
                                            logging.info("bot_runner: resultado encontrado no fallback (verificação pré-saldo) | WIN | profit=%.2f", profit)
                                        elif win in ("loose", "loss", "lose"):
                                            is_win = False
                                            profit = round(-sum_inv, 2)
                                            logging.info("bot_runner: resultado encontrado no fallback (verificação pré-saldo) | LOSS | profit=%.2f", profit)
                                        elif win:
                                            is_win = False
                                            profit = 0.0
                                            logging.info("bot_runner: resultado encontrado no fallback (verificação pré-saldo) | EMPATE")
                        except Exception as check_err:
                            logging.debug("bot_runner: verificação pré-saldo falhou: %s", check_err)
                    
                    # Se ainda não temos resultado, usa diferença de saldo
                    if is_win is None:
                        for retry in range(3):  # Aumentado de 2 para 3 tentativas
                            balance_after = s.get_balance()
                            if balance_after is None:
                                balance_after = balance_before
                            profit = round(float(balance_after) - float(balance_before), 2)
                            # Resultado claro: lucro > limite ou prejuízo (não ambíguo)
                            if abs(profit) >= MIN_PROFIT_FOR_WIN or retry >= 2:
                                break
                            logging.info(
                                "bot_runner: saldo ambíguo (profit=%.2f), aguardando mais %ds e relendo (tentativa %d/3)",
                                profit,
                                BALANCE_RETRY_WAIT_SEC,
                                retry + 1,
                            )
                            if not _interruptible_sleep(BALANCE_RETRY_WAIT_SEC, state):
                                break
                        if abs(profit) < MIN_PROFIT_FOR_WIN:
                            # Saldo não mudou: pode ser empate ou ordem não executada.
                            # LOSS real sempre muda o saldo em -entry_value → profit=0 nunca é LOSS.
                            is_win = None
                            logging.error(
                                "bot_runner: saldo inalterado após ordem | ativo=%s saldo_antes=%.2f saldo_depois=%.2f -> EMPATE/não executada",
                                used_active, float(balance_before), float(balance_after),
                            )
                        else:
                            is_win = profit > MIN_PROFIT_FOR_WIN
                            logging.error(
                                "bot_runner: resultado por saldo | saldo_antes=%.2f saldo_depois=%.2f profit=%.2f -> %s",
                                float(balance_before), float(balance_after), profit,
                                "WIN" if is_win else "LOSS",
                            )
                
                # Sincronizar saldo com a corretora ANTES de logar o saldo atual
                try:
                    real_bal = s.get_balance()
                    if real_bal is not None:
                        current_balance = round(float(real_bal), 2)
                    else:
                        current_balance = round(current_balance + profit, 2)
                except Exception:
                    current_balance = round(current_balance + profit, 2)

                total_profit += profit

                logging.info(
                    "bot_runner: resultado operação | ativo=%s tipo=%s dir=%s mg_level=%d | win=%s | lucro=%.2f | "
                    "saldo_atual=%.2f",
                    used_active,
                    used_type,
                    direction,
                    mg_level,
                    bool(is_win),
                    profit,
                    current_balance,
                )

                # Atualiza a operação que já está na lista (estava "pending") com o resultado final.
                if operations and operations[-1].get("result") == "pending" and operations[-1].get("id") == op_id:
                    if is_win is None:
                        operations[-1]["result"] = "draw"
                        operations[-1]["profit"] = 0.0
                    else:
                        operations[-1]["result"] = "win" if is_win else "loss"
                        operations[-1]["profit"] = round(float(profit), 2)
                    operations[-1]["balanceAfter"] = round(current_balance, 2)
                    res = operations[-1].get("result", "")
                    prof = operations[-1].get("profit", 0)
                    op_direction = operations[-1].get("direction", direction)
                    direction_label = "Compra" if op_direction == "call" else "Venda"
                    result_label = "Win" if res == "win" else ("Loss" if res == "loss" else "Empate")
                    profit_label = "Lucro" if res == "win" else ("Prejuízo" if res == "loss" else "Resultado")
                    _trigger_push_event(session_email, "operation_finished", {
                        "asset": used_active,
                        "direction": direction_label,
                        "result": result_label,
                        "profit_label": profit_label,
                        "profit": f"{abs(prof):.2f}",
                        "profit_signed": f"{prof:+.2f}",
                        "entry_value": f"{price:.2f}",
                    })
                    # Persiste operação para ranking de usuários (se houver email de sessão).
                    try:
                        _save_user_operation(session_email, operations[-1], total_profit)
                    except Exception:
                        # Erros já são logados dentro de _save_user_operation
                        pass
                state["current_balance"] = current_balance
                state["total_profit"] = total_profit

            # Determinar se ESTA operação encerrou o ciclo de martingale.
            # EMPATE (draw): não encerra, retenta no mesmo nível.
            entry_finished = bool(is_win or (is_win is False and mg_level >= max_mg))

            if mg_level == 0:
                last_processed_bucket = minute_bucket

            # Atualizar nível de martingale para a PRÓXIMA operação.
            # EMPATE (is_win=None): mantém mg_level, retenta.
            if is_win:
                mg_level = 0
            elif is_win is False:
                if mg_level < max_mg:
                    mg_level += 1
                else:
                    mg_level = 0
            # is_win is None (draw): mg_level permanece

            # Se o ciclo foi concluído (win em qualquer nível OU loss final), incrementa contador de entradas.
            if entry_finished:
                entries_count += 1
                current_active = None # Reseta ativo para buscar novo sinal no próximo ciclo
                if is_win:
                    win_cycles_count += 1
                else:
                    loss_cycles_count += 1

            # Stop Gain: modos por valor/porcentagem — avaliado apenas ao fim de um ciclo
            # completo (entry_finished), garantindo que o martingale execute antes do stop.
            if (
                entry_finished
                and stop_gain_mode in ("gross_value", "percentage")
                and _check_target(total_profit, entries_count, stop_gain_mode, stop_gain_value, banca_usuario)
            ):
                state["running"] = False
                state["stop_reason"] = "stop_gain"
                _trigger_push_event(session_email, "stop_gain", {
                    "profit": f"{total_profit:.2f}",
                    "entries": str(entries_count),
                    "wins": str(win_cycles_count),
                    "losses": str(loss_cycles_count),
                })
                logging.info(
                    "bot_runner: stop_gain atingido | mode=%s value=%.2f total_profit=%.2f entries=%d",
                    stop_gain_mode,
                    stop_gain_value,
                    total_profit,
                    entries_count,
                )
                break

            # Stop Gain por ENTRADAS: só avalia quando um ciclo acaba.
            if (
                stop_gain_mode == "entries"
                and entry_finished
                and win_cycles_count >= stop_gain_value
            ):
                state["running"] = False
                state["stop_reason"] = "stop_gain"
                _trigger_push_event(session_email, "stop_gain", {
                    "profit": f"{total_profit:.2f}",
                    "entries": str(entries_count),
                    "wins": str(win_cycles_count),
                    "losses": str(loss_cycles_count),
                })
                logging.info(
                    "bot_runner: stop_gain (entries) atingido | wins=%d losses=%d entradas=%d target=%.2f total_profit=%.2f",
                    win_cycles_count,
                    loss_cycles_count,
                    entries_count,
                    stop_gain_value,
                    total_profit,
                )
                break

            # Stop Loss: modos por valor/porcentagem — avaliado apenas ao fim de um ciclo
            # completo (entry_finished), garantindo que o martingale execute antes do stop.
            if (
                entry_finished
                and stop_loss_mode in ("gross_value", "percentage")
                and _check_target(-total_profit, entries_count, stop_loss_mode, stop_loss_value, banca_usuario)
            ):
                state["running"] = False
                state["stop_reason"] = "stop_loss"
                _trigger_push_event(session_email, "stop_loss", {
                    "profit": f"{total_profit:.2f}",
                    "entries": str(entries_count),
                    "wins": str(win_cycles_count),
                    "losses": str(loss_cycles_count),
                })
                logging.info(
                    "bot_runner: stop_loss atingido | mode=%s value=%.2f total_profit=%.2f entries=%d",
                    stop_loss_mode,
                    stop_loss_value,
                    total_profit,
                    entries_count,
                )
                break

            # Stop Loss por ENTRADAS: só avalia quando um ciclo acaba.
            if (
                stop_loss_mode == "entries"
                and entry_finished
                and loss_cycles_count >= stop_loss_value
            ):
                state["running"] = False
                state["stop_reason"] = "stop_loss"
                _trigger_push_event(session_email, "stop_loss", {
                    "profit": f"{total_profit:.2f}",
                    "entries": str(entries_count),
                    "wins": str(win_cycles_count),
                    "losses": str(loss_cycles_count),
                })
                logging.info(
                    "bot_runner: stop_loss (entries) atingido | losses=%d wins=%d entradas=%d target=%.2f total_profit=%.2f",
                    loss_cycles_count,
                    win_cycles_count,
                    entries_count,
                    stop_loss_value,
                    total_profit,
                )
                break

        except Exception as e:
            _consecutive_errors += 1
            logging.exception(
                "bot_runner: loop error (%d/%d): %s",
                _consecutive_errors, _MAX_CONSECUTIVE_ERRORS, e,
            )
            # Erros fatais repetidos encerram o robô; erros transientes apenas dormem e continuam
            if _consecutive_errors >= _MAX_CONSECUTIVE_ERRORS:
                logging.error("bot_runner: muitos erros consecutivos (%d), encerrando robô.", _consecutive_errors)
                state["running"] = False
                state["error"] = f"Muitos erros consecutivos: {e}"
                break
            if not _interruptible_sleep(5, state):
                break
            continue
        else:
            # Iteração sem exceção: reset do contador
            _consecutive_errors = 0

    if state.get("_gen") != my_gen:
        logging.info("bot_runner: thread da geração %d encerrando pois nova geração %d foi iniciada.", my_gen, state.get("_gen"))
    state["running"] = False


def start_bot(token: str, s, config: dict) -> None:
    with _bot_lock:
        # Incrementa geração para invalidar qualquer thread anterior que ainda possa estar rodando
        existing = _bot_state.get(token)
        new_gen = (existing.get("_gen", 0) + 1) if existing else 1
        # Sinaliza parada para thread antiga (ela verifica _gen e encerra sozinha)
        # Também limpa stop_reason imediatamente para que polls/WS não voltem
        # a exibir o stop do ciclo anterior durante a janela de troca de estado.
        if existing:
            existing["running"] = False
            existing["stop_reason"] = None
        try:
            s.change_balance("REAL")
            real_balance = s.get_balance()
            if real_balance is None:
                real_balance = float(config.get("bankroll", 0)) or 0
        except Exception as e:
            logging.warning("start_bot: change_balance/get_balance: %s", e)
            real_balance = float(config.get("bankroll", 0)) or 0
        _bot_state[token] = {
            "running": True,
            "_gen": new_gen,
            "config": config,
            "start_balance": real_balance,
            "current_balance": real_balance,
            "total_profit": 0,
            "operations": [],
            "stop_reason": None,
            "error": None,
        }
        logging.info("start_bot: nova geração %d iniciada para token %s", new_gen, token[:8])
    t = threading.Thread(target=_run_bot, args=(token, s, config), daemon=True)
    t.start()


def stop_bot(token: str) -> None:
    with _bot_lock:
        if token in _bot_state:
            _bot_state[token]["running"] = False


def reset_bot(token: str) -> None:
    """Limpa stop_reason e reseta estado para idle sem iniciar o robô."""
    with _bot_lock:
        if token in _bot_state:
            _bot_state[token]["running"] = False
            _bot_state[token]["stop_reason"] = None
            _bot_state[token]["operations"] = []
            _bot_state[token]["total_profit"] = 0
            _bot_state[token]["error"] = None
    # Limpa trade lock para liberar memória
    with _trade_locks_lock:
        _trade_locks.pop(token, None)


def get_bot_state(token: str) -> dict[str, Any] | None:
    with _bot_lock:
        return _bot_state.get(token)
