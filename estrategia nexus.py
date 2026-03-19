import pandas as pd
import numpy as np
from datetime import datetime
import time

# ============================================================================
# ESTRATÉGIA COMPLETA DO BOT (OTC + SuperTrend + fallback)
# ============================================================================

def get_otc_signal(df: pd.DataFrame) -> str | None:
    """
    Sinal OTC baseado em candles específicos (índices -1, -3, -5, -9)
    Retorna: 'call', 'put' ou None
    """
    if len(df) < 9:
        return None
    
    close = df['Close']
    open_ = df['Open']
    
    c0 = close.iloc[-1]   # candle atual
    c2 = close.iloc[-3]
    o2 = open_.iloc[-3]
    c4 = close.iloc[-5]
    c8 = close.iloc[-9]
    
    # CALL
    if (c0 > c2) and (c2 > o2) and (c4 > c8):
        return 'call'
    
    # PUT
    if (c0 < c2) and (c2 < o2) and (c4 < c8):
        return 'put'
    
    return None


def get_supertrend(
    df: pd.DataFrame,
    period: int = 18,
    multiplier: float = 2.0,
    use_high_low: bool = False
) -> dict:
    """
    Calcula SuperTrend e detecta sinais de mudança de direção
    """
    if len(df) < period + 1:
        return {
            'long_signal': pd.Series([False]),
            'short_signal': pd.Series([False]),
            'direction': pd.Series([0])
        }

    # True Range
    high_low_diff = df['High'] - df['Low']
    high_close_diff = abs(df['High'] - df['Close'].shift(1))
    low_close_diff = abs(df['Low'] - df['Close'].shift(1))
    tr = pd.concat([high_low_diff, high_close_diff, low_close_diff], axis=1).max(axis=1)

    # ATR × multiplier
    atr = tr.ewm(alpha=1/period, adjust=False).mean() * multiplier

    # Base de cálculo
    h = df['High'] if use_high_low else df['Close']
    l = df['Low'] if use_high_low else df['Close']

    supertrend = pd.Series(index=df.index, dtype=float)
    direction = pd.Series(0, index=df.index, dtype=int)

    for i in range(1, len(df)):
        prev_st = supertrend.iloc[i-1] if pd.notna(supertrend.iloc[i-1]) else 0
        prev_close = df['Close'].iloc[i-1]
        curr_close = df['Close'].iloc[i]
        curr_h = h.iloc[i]
        curr_l = l.iloc[i]
        curr_atr = atr.iloc[i]

        if pd.isna(curr_atr):
            continue

        if curr_close > prev_st and prev_close > prev_st:
            supertrend.iloc[i] = max(prev_st, curr_h - curr_atr)
        elif curr_close < prev_st and prev_close < prev_st:
            supertrend.iloc[i] = min(prev_st, curr_l + curr_atr)
        elif curr_close > prev_st:
            supertrend.iloc[i] = curr_h - curr_atr
        else:
            supertrend.iloc[i] = curr_l + curr_atr

        # Mudança de direção
        if prev_close < prev_st and curr_close > prev_st:
            direction.iloc[i] = 1
        elif prev_close > prev_st and curr_close < prev_st:
            direction.iloc[i] = -1
        else:
            direction.iloc[i] = direction.iloc[i-1]

    long_signal  = (direction.shift(1) != direction) & (direction == 1)
    short_signal = (direction.shift(1) != direction) & (direction == -1)

    return {
        'supertrend': supertrend,
        'direction': direction,
        'long_signal': long_signal,
        'short_signal': short_signal
    }


def get_trade_signal(
    df: pd.DataFrame,
    use_usa_strategy: bool = True,
    otc_enabled: bool = True,
    supertrend_period: int = 18,
    supertrend_multiplier: float = 2.0,
    supertrend_use_high_low: bool = False
) -> str | None:
    """
    Lógica completa de decisão de entrada do seu bot:
    
    1. Se use_usa_strategy == False → usa apenas candle atual (fallback simples)
    2. Se use_usa_strategy == True:
       - Primeiro tenta sinal OTC (se otc_enabled)
       - Se não tiver OTC → tenta sinal SuperTrend
       - Se nenhum sinal → retorna None
    
    Retorna: 'call', 'put' ou None
    """
    if len(df) < 10:
        return None

    if not use_usa_strategy:
        # Fallback simples do bot quando estratégia USA está desativada
        if df['Close'].iloc[-1] > df['Open'].iloc[-1]:
            return 'call'
        else:
            return 'put'

    # Estratégia USA ativada
    sinal = None

    # Prioridade 1: OTC
    if otc_enabled:
        sinal = get_otc_signal(df)
        if sinal:
            return sinal

    # Prioridade 2: SuperTrend
    st = get_supertrend(
        df,
        period=supertrend_period,
        multiplier=supertrend_multiplier,
        use_high_low=supertrend_use_high_low
    )

    if st['long_signal'].iloc[-1]:
        return 'call'
    if st['short_signal'].iloc[-1]:
        return 'put'

    # Sem sinal claro
    return None


# ============================================================================
# EXEMPLO DE USO (como integrar em outro bot)
# ============================================================================

def exemplo_uso(api, ativo: str, timeframe: int = 60, qtd_candles: int = 100):
    """
    Exemplo de como chamar a estratégia em loop
    Substitua 'api' pela sua conexão real (IQ Option, Pocket, etc.)
    """
    while True:
        try:
            # Pega velas recentes
            candles = api.get_candles(ativo, timeframe, qtd_candles, time.time())
            if not candles or len(candles) < 50:
                time.sleep(5)
                continue

            # Converte para DataFrame no formato esperado
            df = pd.DataFrame(candles)
            df = df[['open', 'close', 'max', 'min']].rename(columns={
                'open': 'Open',
                'close': 'Close',
                'max': 'High',
                'min': 'Low'
            })

            # Decide o sinal usando as configurações desejadas
            direcao = get_trade_signal(
                df=df,
                use_usa_strategy=True,           # Ativar/desativar toda a estratégia USA
                otc_enabled=True,                # Tentar sinal OTC primeiro
                supertrend_period=18,
                supertrend_multiplier=2.0,
                supertrend_use_high_low=False    # True = usa High/Low no SuperTrend
            )

            agora = datetime.now().strftime("%H:%M:%S")
            if direcao:
                print(f"[{agora}] SINAL → {ativo} | {direcao.upper()}")
                # Aqui você colocaria sua lógica de entrada:
                # api.buy(direcao, valor, ativo, expiracao)
            else:
                print(f"[{agora}] Sem sinal em {ativo}")

            # Aguarda próximo candle (sincroniza com fechamento)
            segundos_restantes = 60 - datetime.now().second
            time.sleep(max(1, segundos_restantes - 2))  # segurança de 2s

        except Exception as e:
            print(f"Erro: {e}")
            time.sleep(10)


# Para testar standalone (sem API real):
if __name__ == "__main__":
    print("Essa é apenas a estratégia isolada.")
    print("Para testar de verdade, integre com sua API de candles.")