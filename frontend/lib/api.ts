/**
 * API client with automatic token refresh via httpOnly cookies.
 * Security: credentials: "include" sends cookies automatically.
 * Tokens are NEVER stored in localStorage (XSS prevention).
 *
 * If NEXT_PUBLIC_API_URL is unset: dev (Next :3000) → API on :8000; nginx (:80/:443) → same origin /api.
 * Avoid mixing localhost + 127.0.0.1 (different host → cookies / CORS break).
 */
/** Max `limit` accepted by most list endpoints (admin users, change requests, etc.). */
export const API_MAX_PAGE_LIMIT = 100;

import { buildApiUrl, resolveApiBase } from "@/lib/apiBase";

export { buildApiUrl } from "@/lib/apiBase";

export function getApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined") {
    return resolveApiBase({
      configured,
      protocol: window.location.protocol.replace(":", ""),
      hostname: window.location.hostname,
      port: window.location.port,
      origin: window.location.origin,
    });
  }
  return resolveApiBase({
    configured,
    protocol: "http",
    hostname: "localhost",
    port: "8000",
  });
}

// Deduplicates concurrent refresh calls — only ONE in-flight refresh at a time.
let _refreshPromise: Promise<boolean> | null = null;
// Guards against redirect loop — once we decide to redirect, stop all retries.
let _redirecting = false;

async function tryRefresh(): Promise<boolean> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = fetch(buildApiUrl(getApiBase(), "/auth/refresh"), {
    method: "POST",
    credentials: "include",
  })
    .then((r) => r.ok)
    .finally(() => { _refreshPromise = null; });
  return _refreshPromise;
}

/** Proactive session check before WS-driven refetches (avoids 401 storms in console). */
export async function ensureFreshSession(): Promise<boolean> {
  if (typeof window === "undefined" || _redirecting) return false;
  try {
    const meRes = await fetch(buildApiUrl(getApiBase(), "/users/me"), {
      credentials: "include",
      cache: "no-store",
    });
    if (meRes.ok) return true;
    if (meRes.status === 401) return tryRefresh();
    return false;
  } catch {
    return false;
  }
}

function redirectToLogin() {
  if (typeof window === "undefined" || _redirecting) return;
  const path = window.location.pathname;
  if (path.startsWith("/login") || path.startsWith("/register")) return;
  _redirecting = true;
  // Clear dead cookies via the public logout endpoint, then navigate.
  fetch(buildApiUrl(getApiBase(), "/auth/logout"), { method: "POST", credentials: "include" })
    .catch(() => {})
    .finally(() => {
      window.location.href = "/login";
      setTimeout(() => { _redirecting = false; }, 3000);
    });
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

type ApiErrorMeta = { status: number; url: string };

function throwApiError(
  partial: { code: string; message: string },
  meta: ApiErrorMeta,
): never {
  throw { error: { ...partial, status: meta.status, url: meta.url } };
}

/** FastAPI returns HTTPException bodies as `{ detail: ... }`. Normalize so callers can use `err.error.message`. */
function throwNormalizedApiError(body: unknown, meta: ApiErrorMeta): never {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (b.error && typeof b.error === "object") {
      const e = b.error as Record<string, unknown>;
      throwApiError(
        {
          code: String(e.code ?? "API_ERROR"),
          message: String(e.message ?? "Error del servidor"),
        },
        meta,
      );
    }
    const detail = b.detail;
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      const d = detail as Record<string, unknown>;
      if (d.error && typeof d.error === "object") {
        const e = d.error as Record<string, unknown>;
        throwApiError(
          {
            code: String(e.code ?? "API_ERROR"),
            message: String(e.message ?? "Error del servidor"),
          },
          meta,
        );
      }
    }
    if (typeof detail === "string") {
      throwApiError({ code: "HTTP_ERROR", message: detail }, meta);
    }
    if (Array.isArray(detail)) {
      const msgs = detail
        .map((item: { msg?: string }) => (typeof item?.msg === "string" ? item.msg : null))
        .filter(Boolean) as string[];
      const message = msgs.length > 0 ? msgs.join("; ") : "Error de validación";
      throwApiError({ code: "VALIDATION_ERROR", message }, meta);
    }
  }

  if (meta.status === 405) {
    throwApiError(
      {
        code: "METHOD_NOT_ALLOWED",
        message: "Método no permitido en esta URL (probable configuración incorrecta del API).",
      },
      meta,
    );
  }

  throwApiError(
    { code: "NOT_JSON_RESPONSE", message: "Respuesta inesperada del servidor (sin detalle JSON)." },
    meta,
  );
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  // If we already decided to redirect, bail out immediately.
  if (_redirecting) throw new Error("Session expired");

  const { params, ...fetchOptions } = options;

  let url = buildApiUrl(getApiBase(), endpoint);
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) searchParams.append(k, String(v));
    });
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...fetchOptions,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...fetchOptions.headers,
      },
    });
  } catch {
    throwApiError(
      {
        code: "NETWORK_ERROR",
        message: "No se pudo conectar con el servidor.",
      },
      { status: 0, url },
    );
  }

  // /users/me returning 401 simply means "not logged in" — no refresh, no error throw.
  const isMeEndpoint =
    endpoint === "/users/me" || endpoint.startsWith("/users/me?");

  if (response.status === 401 && isMeEndpoint) {
    return null as T;
  }

  if (response.status === 401 && !endpoint.includes("/auth/")) {
    const refreshOk = await tryRefresh();

    if (refreshOk) {
      const retryResponse = await fetch(url, {
        ...fetchOptions,
        credentials: "include",
        headers: { "Content-Type": "application/json", ...fetchOptions.headers },
      });
      if (!retryResponse.ok) {
        const errorBody = await retryResponse.json().catch(() => null);
        throwNormalizedApiError(errorBody, { status: retryResponse.status, url });
      }
      return retryResponse.json();
    } else {
      redirectToLogin();
      throw new Error("Session expired");
    }
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throwNormalizedApiError(errorBody, { status: response.status, url });
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

export const api = {
  get: <T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>) =>
    apiRequest<T>(endpoint, { method: "GET", params }),

  post: <T>(endpoint: string, data?: unknown) =>
    apiRequest<T>(endpoint, { method: "POST", body: data ? JSON.stringify(data) : undefined }),

  put: <T>(endpoint: string, data?: unknown) =>
    apiRequest<T>(endpoint, { method: "PUT", body: data ? JSON.stringify(data) : undefined }),

  patch: <T>(endpoint: string, data?: unknown) =>
    apiRequest<T>(endpoint, { method: "PATCH", body: data ? JSON.stringify(data) : undefined }),

  delete: <T>(endpoint: string, data?: unknown) =>
    apiRequest<T>(endpoint, {
      method: "DELETE",
      body: data !== undefined ? JSON.stringify(data) : undefined,
    }),
};

export default api;
