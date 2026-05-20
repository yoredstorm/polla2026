/**
 * Resolves API origin for browser, middleware, and SSR.
 * - Dev (Next :3000): API on :8000
 * - Nginx ( :80 / :443 ): same origin, paths under /api/
 */
export function normalizeConfiguredOrigin(
  configured: string | undefined,
  pageHostname?: string,
): string | undefined {
  if (!configured) return undefined;

  let c = configured.trim();
  if (!c) return undefined;

  // Typo: "/http://host:8000" → "http://host:8000"
  while (c.startsWith("/") && !c.startsWith("//")) {
    c = c.slice(1);
  }

  if (!/^https?:\/\//i.test(c)) {
    c = `http://${c}`;
  }

  try {
    const u = new URL(c);
    // Misconfig: full path like .../api/v1/auth/register → keep origin only
    if (u.pathname && u.pathname !== "/") {
      u.pathname = "";
      u.search = "";
      u.hash = "";
    }

    if (
      pageHostname &&
      (pageHostname === "localhost" || pageHostname === "127.0.0.1") &&
      (u.hostname === "localhost" || u.hostname === "127.0.0.1") &&
      u.hostname !== pageHostname
    ) {
      u.hostname = pageHostname;
    }

    return u.origin;
  } catch {
    return undefined;
  }
}

/** Same host as the page, backend port 8000 (dev). */
function devBackendOrigin(hostname: string, pageOrigin?: string): string {
  if (pageOrigin) {
    try {
      const u = new URL(pageOrigin);
      u.port = "8000";
      return u.origin;
    } catch {
      /* fall through */
    }
  }
  return `http://${hostname}:8000`;
}

export function resolveApiBase(opts: {
  configured?: string;
  protocol: string;
  hostname: string;
  port: string;
  origin?: string;
}): string {
  const normalized = normalizeConfiguredOrigin(opts.configured, opts.hostname);
  if (normalized) return normalized;

  const port = opts.port;
  if (port === "3000" || port === "3001") {
    return devBackendOrigin(opts.hostname, opts.origin);
  }

  if (opts.origin && (!port || port === "80" || port === "443")) {
    return opts.origin;
  }

  return devBackendOrigin(opts.hostname, opts.origin);
}

/** Build absolute API URL; never produces browser-relative /http://... paths. */
export function buildApiUrl(apiBase: string, endpoint: string): string {
  const ep = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const path = ep.startsWith("/api/v1") ? ep : `/api/v1${ep}`;

  const origin = apiBase.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(origin)) {
    throw new Error(`URL base del API inválida: "${apiBase}"`);
  }

  const base = `${origin}/`;
  try {
    return new URL(path, base).href;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : "URL inválida";
    throw new Error(`${detail} (base: ${origin})`);
  }
}
