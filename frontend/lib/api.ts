/**
 * API client with automatic token refresh via httpOnly cookies.
 * Security: credentials: "include" sends cookies automatically.
 * Tokens are NEVER stored in localStorage (XSS prevention).
 *
 * If NEXT_PUBLIC_API_URL is unset in the browser bundle, requests use the same hostname
 * as the page with port 8000 (e.g. UI at http://127.0.0.1:3000 → API at http://127.0.0.1:8000).
 * That avoids mixing localhost + 127.0.0.1 (different host → cookies / CORS break).
 */
/** Max `limit` accepted by most list endpoints (admin users, change requests, etc.). */
export const API_MAX_PAGE_LIMIT = 100;

export function getApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined") {
    if (configured) return configured;
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:8000`;
  }
  return configured || "http://localhost:8000";
}

// Deduplicates concurrent refresh calls — only ONE in-flight refresh at a time.
let _refreshPromise: Promise<boolean> | null = null;
// Guards against redirect loop — once we decide to redirect, stop all retries.
let _redirecting = false;

async function tryRefresh(): Promise<boolean> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = fetch(`${getApiBase()}/api/v1/auth/refresh`, {
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
    const meRes = await fetch(`${getApiBase()}/api/v1/users/me`, {
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
  fetch(`${getApiBase()}/api/v1/auth/logout`, { method: "POST", credentials: "include" })
    .catch(() => {})
    .finally(() => {
      window.location.href = "/login";
      setTimeout(() => { _redirecting = false; }, 3000);
    });
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

/** FastAPI returns HTTPException bodies as `{ detail: ... }`. Normalize so callers can use `err.error.message`. */
function throwNormalizedApiError(body: unknown): never {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (b.error && typeof b.error === "object") {
      throw body;
    }
    const detail = b.detail;
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      const d = detail as Record<string, unknown>;
      if (d.error && typeof d.error === "object") {
        throw { error: d.error };
      }
    }
    if (typeof detail === "string") {
      throw { error: { code: "HTTP_ERROR", message: detail } };
    }
    if (Array.isArray(detail)) {
      const msgs = detail
        .map((item: { msg?: string }) => (typeof item?.msg === "string" ? item.msg : null))
        .filter(Boolean) as string[];
      const message = msgs.length > 0 ? msgs.join("; ") : "Error de validacion";
      throw { error: { code: "VALIDATION_ERROR", message } };
    }
  }
  throw { error: { code: "UNKNOWN_ERROR", message: "An error occurred" } };
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  // If we already decided to redirect, bail out immediately.
  if (_redirecting) throw new Error("Session expired");

  const { params, ...fetchOptions } = options;

  const apiBase = getApiBase();
  let url = `${apiBase}/api/v1${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) searchParams.append(k, String(v));
    });
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const response = await fetch(url, {
    ...fetchOptions,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...fetchOptions.headers,
    },
  });

  // /users/me returning 401 simply means "not logged in" — treat it as a normal empty response.
  const isAnonymousOk401 =
    endpoint === "/users/me" || endpoint.startsWith("/users/me?");

  if (response.status === 401 && !endpoint.includes("/auth/") && !isAnonymousOk401) {
    const refreshOk = await tryRefresh();

    if (refreshOk) {
      const retryResponse = await fetch(url, {
        ...fetchOptions,
        credentials: "include",
        headers: { "Content-Type": "application/json", ...fetchOptions.headers },
      });
      if (!retryResponse.ok) {
        const errorBody = await retryResponse.json().catch(() => ({}));
        throwNormalizedApiError(errorBody);
      }
      return retryResponse.json();
    } else {
      redirectToLogin();
      throw new Error("Session expired");
    }
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throwNormalizedApiError(errorBody);
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

  delete: <T>(endpoint: string) =>
    apiRequest<T>(endpoint, { method: "DELETE" }),
};

export default api;
