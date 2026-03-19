/**
 * Cliente HTTP para o backend da API Safirion.
 *
 * Importante: no deploy (EasyPanel) o backend normalmente não fica acessível publicamente (ex.: porta 8001).
 * Por isso, fazemos requisições relativas (ex.: `/api/...`) para que o Vite proxy encaminhe.
 */

// Mantemos a variável para compatibilidade, mas o código abaixo ignora BASE_URL
// quando o endpoint passado já é relativo (como sempre ocorre aqui: `/api/...`).
const BASE_URL = "";

export type ApiError = { detail: string; status: number };

async function handleResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw { detail: text || res.statusText || "Erro desconhecido", status: res.status } as ApiError;
  }
  if (!res.ok) {
    const d = data as { detail?: string | Array<{ loc?: unknown; msg?: string }>; message?: string };
    let msg: string;
    if (typeof d?.detail === "string" && d.detail) {
      msg = d.detail;
    } else if (Array.isArray(d?.detail) && d.detail.length > 0) {
      const first = d.detail[0];
      msg = typeof first?.msg === "string" ? first.msg : JSON.stringify(d.detail);
    } else if (typeof d?.message === "string" && d.message) {
      msg = d.message;
    } else {
      msg = res.statusText || "Erro na requisição";
    }
    throw { detail: msg, status: res.status } as ApiError;
  }
  return data as T;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  // Se o caller passar URL absoluta, usamos diretamente.
  // Caso contrário, fazemos chamada relativa (ex.: /api/...) para o proxy do Vite.
  const url = path.startsWith("http")
    ? path
    : path.startsWith("/")
      ? path
      : `/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  return handleResponse<T>(res);
}

export function apiRequestWithAuth<T>(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  return apiRequest<T>(path, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

export { BASE_URL };
