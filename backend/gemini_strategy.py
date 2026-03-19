"""
Integração com Gemini para geração de estratégias de opções binárias.
A IA atua como ESPECIALISTA em opções binárias e gera apenas lógica de estratégia.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import Any

# Timeout para chamada ao Gemini (segundos). Aumentado para dar mais tempo para a IA responder.
GEMINI_TIMEOUT_SEC = int(os.environ.get("GEMINI_TIMEOUT_SEC", "90"))
# Número máximo de retries para erros 429 (quota)
MAX_RETRIES_429 = 3
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "AIzaSyDYMqfjnuIqMjk_3uMo-ns8h6jwKJJUsek")
# Modelos a tentar (em ordem). Lista obtida via genai.list_models() — use os que existem na sua API.
GEMINI_MODELS = os.environ.get(
    "GEMINI_MODEL",
    "gemini-2.5-flash,gemini-2.0-flash,gemini-2.0-flash-lite,gemini-flash-latest,gemini-pro-latest",
).split(",")

SYSTEM_PROMPT = """Você é um ESPECIALISTA em opções binárias. Sua ÚNICA função é criar estratégias de trading para opções binárias (CALL e PUT).

REGRAS OBRIGATÓRIAS:
1. Fale APENAS sobre estratégias para opções binárias. Nada mais.
2. A estratégia deve analisar candles (OHLC) e retornar sinal CALL, PUT ou nenhum.
3. Cada candle tem: open, close, max (high), min (low), from (timestamp).
4. Você terá acesso a funções: _rsi(closes, period), _ema(values, period), _sma(values, period), _macd(closes), _atr(highs, lows, closes, period), _adx(highs, lows, closes, period).
5. O código Python deve definir UMA função: def analyze(candles, asset=None) -> "call"|"put"|None
6. candles é lista de dicts com keys: open, close, max, min, from.
7. Retorne "call" para compra, "put" para venda, None quando não houver sinal.
8. O timeframe (M1 ou M5) será informado pelo usuário - use candles diretamente, o sistema já fornece no timeframe correto.

CRÍTICO - CANDLES FECHADOS:
- IMPORTANTE: A lista 'candles' recebida contém APENAS candles FECHADOS (não inclui a vela atual em formação).
- O sistema garante que apenas candles completamente fechados sejam analisados.
- Quando waitNextCandle está ativo, o sistema espera o fechamento da vela antes de entrar e revalida o sinal.
- Sua estratégia deve analisar os candles fechados e retornar o sinal baseado neles.
- O último candle na lista é o mais recente FECHADO disponível.

FORMATO DE RESPOSTA - PRIMEIRA INTERAÇÃO (rascunho):
Responda APENAS com JSON válido, sem markdown, sem texto adicional antes ou depois. Use exatamente estas chaves:
{
  "description": "Resumo curto da estratégia em 1-2 frases",
  "explanation": "Explicação em português para o usuário confirmar. Inclua: indicadores usados (EMA, RSI, etc.) e parâmetros; análise de vela/corpo se houver; gatilho de CALL (compra); gatilho de PUT (venda). Linguagem clara.",
  "code": "código Python completo da função analyze(candles, asset=None)",
  "confirmation_question": "Pergunta para o usuário confirmar (ex: 'É dessa forma que você imaginou a estratégia?')"
}

CRÍTICO - REGRAS DE JSON:
1. O JSON deve ser VÁLIDO e parseável. Todas as strings devem ter aspas duplas escapadas corretamente.
2. No campo "code", o código Python deve estar como STRING JSON válida. Use \\n para quebras de linha, \\" para aspas duplas dentro do código, \\\\ para barras invertidas.
3. Não use aspas simples para strings JSON - sempre use aspas duplas.
4. Não inclua markdown (```json ou ```) - retorne APENAS o JSON puro.
5. Não inclua texto explicativo antes ou depois do JSON.
6. Se o prompt do usuário for muito vago ou curto, crie uma estratégia clássica e robusta (ex: RSI, Médias Móveis) e formule a `confirmation_question` perguntando se é isso que o usuário esperava ou se ele quer algo mais específico.

O código Python deve ser válido, usando apenas as funções disponíveis. Não use import. A função analyze recebe candles (list) e asset (str|None) e retorna "call", "put" ou None."""

# Arquivo onde o admin pode sobrescrever o system prompt (persistido em disco)
_GEMINI_PROMPT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
_GEMINI_PROMPT_FILE = os.path.join(_GEMINI_PROMPT_DIR, "gemini_system_prompt.txt")


def get_system_prompt() -> str:
    """Retorna o system prompt atual: do arquivo admin se existir, senão o padrão (SYSTEM_PROMPT)."""
    try:
        if os.path.isfile(_GEMINI_PROMPT_FILE):
            with open(_GEMINI_PROMPT_FILE, "r", encoding="utf-8") as f:
                content = f.read()
            if content and content.strip():
                return content.strip()
    except Exception as e:
        logging.warning("gemini_strategy: não foi possível ler prompt do arquivo: %s", e)
    return SYSTEM_PROMPT


def set_system_prompt(text: str) -> None:
    """Persiste o system prompt no arquivo (apenas admin). Cria o diretório se não existir."""
    os.makedirs(_GEMINI_PROMPT_DIR, exist_ok=True)
    with open(_GEMINI_PROMPT_FILE, "w", encoding="utf-8") as f:
        f.write(text.strip() if text else "")


# Estratégia padrão para usar como fallback quando o prompt é muito curto ou a IA falha
DEFAULT_STRATEGY = {
    "description": "Estratégia de Reversão com RSI (Padrão)",
    "explanation": "Esta estratégia utiliza o indicador RSI (Índice de Força Relativa) com período 14. Ela busca pontos de reversão: quando o RSI está abaixo de 30 (sobrevenda), sugere COMPRA (CALL). Quando está acima de 70 (sobrecompra), sugere VENDA (PUT). É uma estratégia clássica e robusta para diversos ativos.",
    "code": """def analyze(candles, asset=None):
    # Obtém apenas os preços de fechamento
    closes = [c['close'] for c in candles]
    if len(closes) < 15:
        return None
    
    # Calcula RSI de 14 períodos
    rsi_values = _rsi(closes, 14)
    if not rsi_values:
        return None
        
    last_rsi = rsi_values[-1]
    
    # Lógica de entrada
    if last_rsi < 30:
        return "call"
    elif last_rsi > 70:
        return "put"
        
    return None""",
    "confirmation_question": "Como seu prompt foi bem resumido, criei uma estratégia clássica de RSI que funciona muito bem. É desta forma que você imaginou ou gostaria de algo mais específico?"
}


def _extract_fields_manually(text: str) -> str | None:
    """Tenta extrair campos do JSON manualmente quando o parsing falha."""
    try:
        # Estratégia melhorada: procura por padrões de campo e extrai até o próximo campo ou fim
        def extract_field_value(field_name: str, start_pos: int = 0) -> tuple[str | None, int]:
            """Extrai valor de um campo JSON, retornando (valor, posição_final)."""
            field_pattern = f'"{field_name}"'
            field_start = text.find(field_pattern, start_pos)
            if field_start == -1:
                return None, start_pos
            
            # Encontra o início do valor (depois de :)
            colon_pos = text.find(':', field_start + len(field_pattern))
            if colon_pos == -1:
                return None, start_pos
            
            # Pula espaços após :
            value_start = colon_pos + 1
            while value_start < len(text) and text[value_start] in ' \n\t':
                value_start += 1
            
            # Se começa com ", é uma string
            if value_start < len(text) and text[value_start] == '"':
                value_start += 1  # Pula a primeira "
                # Procura pelo fim da string (próxima " não escapada) ou fim do texto
                value_end = value_start
                escaped = False
                while value_end < len(text):
                    if escaped:
                        escaped = False
                        value_end += 1
                        continue
                    if text[value_end] == '\\':
                        escaped = True
                        value_end += 1
                        continue
                    if text[value_end] == '"':
                        # Encontrou fim da string
                        return text[value_start:value_end], value_end + 1
                    value_end += 1
                
                # String não terminada - precisa encontrar onde realmente termina
                # Procura pelo próximo campo ou }
                search_start = value_start
                next_field_positions = []
                for field in ["description", "explanation", "code", "confirmation_question"]:
                    if field != field_name:  # Não procura o próprio campo
                        pos = text.find(f'"{field}"', search_start)
                        if pos != -1:
                            next_field_positions.append(pos)
                # Também procura pelo fim do objeto
                obj_end = text.find('}', search_start)
                if obj_end != -1:
                    next_field_positions.append(obj_end)
                
                if next_field_positions:
                    value_end = min(next_field_positions)
                    # Tenta encontrar um ponto natural de fim da string
                    # Procura por padrões que indicam fim do conteúdo antes do próximo campo
                    # Ex: quebra de linha seguida de espaço/tab e aspas (início de novo campo)
                    for i in range(value_end - 1, max(value_start, value_end - 100), -1):
                        if i >= len(text):
                            continue
                        # Verifica se há um padrão de fim de string antes do próximo campo
                        # Ex: \n seguido de espaços e "
                        if i > 0 and text[i-1:i+1] == '\n':
                            # Verifica os próximos caracteres
                            check_start = i + 1
                            check_end = min(len(text), check_start + 30)
                            if check_start < len(text):
                                after_newline = text[check_start:check_end]
                                # Se encontrar um padrão de campo JSON após a quebra de linha
                                if re.match(r'^\s+"[a-z_]+"', after_newline):
                                    value_end = i
                                    break
                    # Limpa o valor extraído
                    extracted = text[value_start:value_end].rstrip()
                    # Remove vírgulas e aspas finais que podem ter ficado
                    extracted = extracted.rstrip(',').rstrip('"').rstrip()
                    return extracted, value_end
                # Último recurso: pega até o fim (string realmente não terminada)
                extracted = text[value_start:].rstrip().rstrip(',').rstrip('"').rstrip()
                return extracted, len(text)
            return None, start_pos
        
        # Extrai cada campo na ordem que aparecem no JSON (para melhor detecção de fim)
        # Ordem típica: description, explanation, code, confirmation_question
        description, desc_end = extract_field_value("description")
        explanation, expl_end = extract_field_value("explanation", desc_end if desc_end else 0)
        code, code_end = extract_field_value("code", expl_end if expl_end else (desc_end if desc_end else 0))
        confirmation, _ = extract_field_value("confirmation_question", code_end if code_end else 0)
        
        # Se não encontrou explanation mas encontrou code, tenta buscar explanation antes do code
        if not explanation and code:
            explanation, _ = extract_field_value("explanation", 0)
        
        # Se explanation está vazio ou muito curto, usa description como fallback
        if not explanation or len(explanation.strip()) < 10:
            explanation = description if description else ""
        
        # Se conseguiu extrair os campos obrigatórios
        if description and code and confirmation:
            # Limpa e escapa os valores
            def clean_value(val: str) -> str:
                if not val:
                    return ""
                # Remove escapes duplos e normaliza
                val = val.replace('\\"', '"').replace("\\'", "'")
                val = val.replace('\\n', '\n').replace('\\t', '\t')
                return val
            
            description_clean = clean_value(description)
            code_clean = clean_value(code)
            confirmation_clean = clean_value(confirmation)
            explanation_clean = clean_value(explanation) if explanation else description_clean
            
            # Reconstrói JSON válido com escape correto
            reconstructed = json.dumps({
                "description": description_clean,
                "explanation": explanation_clean,
                "code": code_clean,
                "confirmation_question": confirmation_clean
            }, ensure_ascii=False)
            logging.info("gemini_strategy: campos extraídos manualmente com sucesso")
            return reconstructed
    except Exception as e:
        logging.debug("gemini_strategy: extração manual de campos falhou: %s", e)
    return None


def _extract_retry_delay(error: Exception) -> float | None:
    """Extrai o retryDelay de um erro 429 do Gemini API."""
    try:
        error_str = str(error)
        # Procura por "retryDelay" ou "RetryInfo" no erro
        if "retryDelay" in error_str or "RetryInfo" in error_str:
            # Tenta extrair o número de segundos
            import re as re_module
            # Procura por padrões como "retryDelay': '35s" ou "retryDelay': 35"
            match = re_module.search(r"retryDelay['\"]?\s*[:=]\s*['\"]?(\d+(?:\.\d+)?)", error_str)
            if match:
                return float(match.group(1))
            # Procura por "Please retry in X.XXs"
            match = re_module.search(r"retry in ([\d.]+)s", error_str, re_module.IGNORECASE)
            if match:
                return float(match.group(1))
    except Exception:
        pass
    return None


def _call_gemini_inner(user_prompt: str, timeframe: str) -> dict[str, Any] | None:
    """Chamada interna ao Gemini (sem timeout). Tenta vários modelos em ordem."""
    import google.generativeai as genai

    genai.configure(api_key=GEMINI_API_KEY, transport=os.environ.get("GEMINI_TRANSPORT", "rest"))

    user_msg = f"""O usuário quer criar uma estratégia com as seguintes características:

PROMPT DO USUÁRIO:
{user_prompt}

TIMEFRAME ESCOLHIDO: {timeframe}
- Se M1: velas de 1 minuto, expiração 1 minuto.
- Se M5: velas de 5 minutos, expiração 5 minutos.

Gere a estratégia em Python. A função analyze receberá candles já no timeframe correto (cada candle representa 1 min ou 5 min conforme escolhido).

IMPORTANTE: Retorne APENAS JSON válido, sem markdown (sem ```json ou ```), sem texto antes ou depois.
O campo "code" deve conter o código Python como string JSON válida, com quebras de linha como \\n e aspas escapadas como \\".
Certifique-se de que o JSON é parseável - todas as strings devem usar aspas duplas e estar corretamente escapadas."""

    last_error = None
    quota_errors_by_model: dict[str, int] = {}  # Contador de erros 429 por modelo
    
    for model_name in GEMINI_MODELS:
        model_name = model_name.strip()
        if not model_name:
            continue
        
        # Se este modelo já teve muitos erros 429, pula para o próximo
        if quota_errors_by_model.get(model_name, 0) >= MAX_RETRIES_429:
            logging.info("gemini_strategy: pulando modelo %s (muitos erros 429)", model_name)
            continue
        
        retry_count = 0
        while retry_count <= MAX_RETRIES_429:
            try:
                model = genai.GenerativeModel(model_name)
                if retry_count > 0:
                    logging.info("gemini_strategy: tentando modelo %s (retry %d/%d)", model_name, retry_count, MAX_RETRIES_429)
                else:
                    logging.info("gemini_strategy: tentando modelo %s", model_name)
                
                response = model.generate_content(
                    [get_system_prompt(), user_msg],
                    generation_config=genai.types.GenerationConfig(
                        temperature=0.3,
                        max_output_tokens=4096,
                    ),
                )
                text = (response.text or "").strip()
                if not text:
                    retry_count += 1
                    continue
            
                # Limpar markdown code blocks
                if text.startswith("```"):
                    parts = text.split("```")
                    text = parts[1] if len(parts) > 1 else text
                    if text.startswith("json"):
                        text = text[4:]
                text = text.strip()
                
                # Tentar extrair JSON de forma mais robusta
                # Se o texto começa com {, tenta encontrar o JSON completo
                if text.startswith("{"):
                    # Tenta encontrar o último } válido (pode haver código Python depois)
                    brace_count = 0
                    json_end = -1
                    in_string = False
                    escape_next = False
                    string_char = None
                    
                    for i, char in enumerate(text):
                        if escape_next:
                            escape_next = False
                            continue
                        
                        if char == "\\":
                            escape_next = True
                            continue
                        
                        if not in_string and char in ('"', "'"):
                            in_string = True
                            string_char = char
                        elif in_string and char == string_char:
                            in_string = False
                            string_char = None
                        
                        if not in_string:
                            if char == "{":
                                brace_count += 1
                            elif char == "}":
                                brace_count -= 1
                                if brace_count == 0:
                                    json_end = i + 1
                                    break
                    
                    if json_end > 0:
                        text = text[:json_end]
                
                # Log para debug (apenas primeiras 500 chars para não poluir)
                logging.debug("gemini_strategy: resposta raw (primeiros 500 chars): %s", text[:500])
                
                data = None
                json_err = None
                
                try:
                    data = json.loads(text)
                except json.JSONDecodeError as e:
                    json_err = e
                    # Log do erro completo para debug
                    error_pos = getattr(e, 'pos', None)
                    error_msg = str(e)
                    logging.warning(
                        "gemini_strategy: erro ao fazer parse do JSON (modelo %s): %s (posição: %s)",
                        model_name, error_msg, error_pos
                    )
                    
                    # Tenta várias estratégias de recuperação
                    def try_fix_unterminated_strings(json_text: str, error_pos: int | None) -> str | None:
                        """Tenta corrigir strings não terminadas no JSON."""
                        if error_pos is None:
                            error_pos = len(json_text) - 1
                        
                        # Procura pela última ocorrência de "code": " antes da posição do erro
                        code_patterns = [
                            ('"code"', '"'),
                            ("'code'", "'"),
                            ('"code":', '"'),
                        ]
                        
                        for pattern, quote_char in code_patterns:
                            code_start = json_text.rfind(pattern, 0, min(error_pos + 50, len(json_text)))
                            if code_start != -1:
                                # Encontra o início do valor da string
                                value_start = json_text.find(quote_char, code_start + len(pattern))
                                if value_start != -1 and value_start < error_pos + 200:
                                    # Procura pelo final do JSON
                                    json_end = json_text.rfind('}')
                                    if json_end > value_start:
                                        # Tenta encontrar um bom ponto para fechar a string
                                        # Procura por padrões que indicam fim do código Python
                                        search_end = min(json_end, value_start + 5000)  # Limita busca
                                        snippet = json_text[value_start:search_end]
                                        
                                        # Procura por padrões de fim de código
                                        end_patterns = [
                                            '\n    """',  # Fim de docstring
                                            '\n    \'\'\'',  # Fim de docstring com aspas simples
                                            '\n    return',  # Return statement
                                            '\ndef ',  # Próxima função (improvável mas possível)
                                        ]
                                        
                                        best_end = None
                                        for pattern in end_patterns:
                                            pos = snippet.find(pattern)
                                            if pos != -1:
                                                if best_end is None or pos < best_end:
                                                    best_end = pos
                                        
                                        # Se encontrou um padrão, fecha antes dele
                                        if best_end is not None:
                                            close_pos = value_start + best_end
                                            fixed = json_text[:close_pos] + quote_char + json_text[close_pos:]
                                            return fixed
                                        
                                        # Se não encontrou padrão, fecha antes do }
                                        # Mas tenta encontrar uma quebra de linha antes do }
                                        last_newline = json_text.rfind('\n', value_start, json_end)
                                        if last_newline != -1 and last_newline > value_start + 100:
                                            fixed = json_text[:last_newline] + quote_char + json_text[last_newline:]
                                            return fixed
                                        
                                        # Último recurso: fecha logo antes do }
                                        if json_end - value_start > 50:  # Só se houver conteúdo suficiente
                                            fixed = json_text[:json_end] + quote_char + json_text[json_end:]
                                            return fixed
                        return None
                    
                    recovery_strategies = [
                        # Estratégia 1: Tentar extrair campos individuais e reconstruir JSON (mais robusta)
                        lambda: _extract_fields_manually(text),
                        # Estratégia 2: Tentar corrigir strings não terminadas
                        lambda: try_fix_unterminated_strings(text, error_pos),
                        # Estratégia 3: Extrair JSON usando regex (mais simples)
                        lambda: re.search(r'\{.*\}', text, re.DOTALL),
                        # Estratégia 4: Tentar encontrar JSON entre primeira { e última }
                        lambda: text[text.find("{"):text.rfind("}") + 1] if "{" in text and "}" in text else None,
                    ]
                    
                    for strategy_idx, strategy in enumerate(recovery_strategies):
                        try:
                            result = strategy()
                            if result:
                                candidate = result.group(0) if hasattr(result, 'group') else result
                                if candidate and candidate.strip():
                                    data = json.loads(candidate)
                                    logging.info(
                                        "gemini_strategy: JSON recuperado com sucesso usando estratégia %d",
                                        strategy_idx + 1
                                    )
                                    break
                        except (json.JSONDecodeError, AttributeError, ValueError) as recovery_err:
                            logging.debug("gemini_strategy: estratégia %d falhou: %s", strategy_idx + 1, recovery_err)
                            continue
                    
                    if data is None:
                        # Se nenhuma estratégia funcionou, loga mais detalhes e re-raise
                        logging.error(
                            "gemini_strategy: falha ao fazer parse do JSON após todas as tentativas. "
                            "Texto completo (primeiros 1000 chars): %s",
                            text[:1000]
                        )
                        raise json_err
                
                if "description" in data and "code" in data and "confirmation_question" in data:
                    if "explanation" not in data:
                        data["explanation"] = data.get("description", "")
                    return data
                break  # Sucesso, sai do loop de retry
                
            except Exception as e:
                error_str = str(e)
                is_429 = "429" in error_str or "quota" in error_str.lower() or "Quota exceeded" in error_str
                
                if is_429 and retry_count < MAX_RETRIES_429:
                    quota_errors_by_model[model_name] = quota_errors_by_model.get(model_name, 0) + 1
                    retry_delay = _extract_retry_delay(e)
                    
                    if retry_delay:
                        wait_time = min(retry_delay + 2, 60)  # Máximo 60s, adiciona 2s de margem
                        logging.warning(
                            "gemini_strategy: modelo %s retornou 429 (quota excedida). Aguardando %.1fs antes de retry %d/%d",
                            model_name, wait_time, retry_count + 1, MAX_RETRIES_429
                        )
                        time.sleep(wait_time)
                        retry_count += 1
                        continue
                    else:
                        # Se não conseguiu extrair delay, usa backoff exponencial
                        wait_time = min(5 * (2 ** retry_count), 60)
                        logging.warning(
                            "gemini_strategy: modelo %s retornou 429 (quota excedida). Aguardando %.1fs antes de retry %d/%d (backoff exponencial)",
                            model_name, wait_time, retry_count + 1, MAX_RETRIES_429
                        )
                        time.sleep(wait_time)
                        retry_count += 1
                        continue
                else:
                    # Outro tipo de erro ou excedeu retries
                    last_error = e
                    if is_429:
                        logging.warning(
                            "gemini_strategy: modelo %s falhou após %d tentativas com erro 429 (quota excedida)",
                            model_name, retry_count + 1
                        )
                    else:
                        logging.warning("gemini_strategy: modelo %s falhou: %s", model_name, e)
                    break  # Sai do loop de retry e tenta próximo modelo

    # Lista modelos disponíveis para debug (apenas quando todos falham)
    try:
        available = [m.name for m in genai.list_models() if "generateContent" in (m.supported_generation_methods or [])]
        logging.info("gemini_strategy: modelos disponíveis na API: %s", available[:10])
    except Exception:
        pass
    
    # Se todos os modelos falharam, verifica se foi por quota
    if last_error:
        error_str = str(last_error)
        if "429" in error_str or "quota" in error_str.lower():
            logging.error(
                "gemini_strategy: TODOS os modelos falharam por quota excedida. "
                "Por favor, aguarde alguns minutos ou verifique sua conta Gemini API."
            )
            raise Exception(
                "Quota da API Gemini excedida. Todos os modelos tentados retornaram erro 429. "
                "Por favor, aguarde alguns minutos antes de tentar novamente ou verifique sua conta/billing na Gemini API."
            ) from last_error
        raise last_error
    return None


def call_gemini_for_draft(user_prompt: str, timeframe: str) -> dict[str, Any] | None:
    """
    Chama Gemini com o prompt do usuário e retorna o rascunho da estratégia.
    timeframe: "M1" ou "M5"
    Usa timeout para evitar 502 por demora excessiva.
    Fallbacks para evitar falhas em prompts vagos ou erros da API.
    """
    prompt_clean = user_prompt.strip() if user_prompt else ""
    
    # Caso 1: Prompt extremamente curto (ex: "oi", "criar", "estratégia")
    # Nestes casos, já retornamos a estratégia padrão para ser mais rápido e evitar timeouts
    if not prompt_clean or len(prompt_clean) < 10:
        logging.info("gemini_strategy: prompt vago ou curto, retornando estratégia padrão.")
        return DEFAULT_STRATEGY

    try:
        with ThreadPoolExecutor(max_workers=1) as ex:
            future = ex.submit(_call_gemini_inner, prompt_clean, timeframe)
            result = future.result(timeout=GEMINI_TIMEOUT_SEC)
            
            if result:
                return result
            else:
                # Se _call_gemini_inner retornou None (ex: após todos os retries)
                logging.warning("gemini_strategy: IA falhou em gerar, usando fallback padrão.")
                return DEFAULT_STRATEGY
                
    except FuturesTimeoutError:
        logging.warning(
            "gemini_strategy: timeout após %d segundos, usando fallback padrão. O front receberá a estratégia e o usuário pode confirmar.",
            GEMINI_TIMEOUT_SEC,
        )
        return DEFAULT_STRATEGY
    except Exception as e:
        # Se for erro de quota (429), não usamos fallback aqui — o endpoint main.py re-levanta 429.
        # Outros erros: retornamos fallback para o front nunca ficar sem resposta.
        error_str = str(e).lower()
        if "quota" in error_str or "429" in error_str:
            logging.error("gemini_strategy: erro de quota Gemini (será re-levantado pelo endpoint).")
            raise
        logging.exception("gemini_strategy: falha crítica, retornando estratégia padrão como fallback: %s", e)
        return DEFAULT_STRATEGY
