/** Normalized API error thrown by `lib/api.ts` and some fetch helpers. */
export type ApiErrorPayload = {
  code: string;
  message: string;
  status?: number;
  url?: string;
};

export type ApiErrorPresentation = {
  title: string;
  description?: string;
  technical?: string;
};

const CODE_MESSAGES_ES: Record<string, string> = {
  USER_EXISTS: "Ese nombre de usuario ya está registrado. Prueba con otro nickname.",
  INVALID_CREDENTIALS: "Usuario o contraseña incorrectos.",
  ACCOUNT_LOCKED: "Cuenta bloqueada temporalmente. Intenta más tarde.",
  VALIDATION_ERROR: "Revisa los datos del formulario.",
  NETWORK_ERROR: "No se pudo conectar con el servidor. Comprueba tu red o que el backend esté activo.",
  METHOD_NOT_ALLOWED:
    "El servidor rechazó la petición (405). Suele deberse a una URL de API mal configurada (la app llamó al frontend en lugar del backend).",
  WRONG_API_URL:
    "La URL del API parece incorrecta. Revisa NEXT_PUBLIC_API_URL (solo el origen, ej. http://127.0.0.1:8000).",
  NOT_JSON_RESPONSE: "El servidor respondió con un formato inesperado (no JSON).",
  INVALID_API_BASE:
    "La URL base del API no es válida. Revisa NEXT_PUBLIC_API_URL (ej. http://127.0.0.1:8000, sin barra final ni /api/v1).",
  UNKNOWN_ERROR: "Ocurrió un error inesperado.",
  HTTP_ERROR: "El servidor devolvió un error.",
  SESSION_EXPIRED: "Tu sesión expiró. Vuelve a iniciar sesión.",
  PHASE_MISMATCH: "Este partido no corresponde a la fase activa de la polla.",
  PHASE_NOT_ENROLLED:
    "Debes pagar e inscribirte en la fase actual para pronosticar estos partidos.",
};

function messageForHttpStatus(status: number): string {
  switch (status) {
    case 400:
      return "Datos inválidos. Revisa el formulario.";
    case 401:
      return "No autorizado. Verifica usuario y contraseña.";
    case 403:
      return "Acceso denegado.";
    case 404:
      return "Servicio no encontrado. La URL del API puede estar mal configurada.";
    case 409:
      return "Conflicto: el recurso ya existe (por ejemplo, usuario duplicado).";
    case 422:
      return "Datos inválidos. Revisa los campos marcados.";
    case 429:
      return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
    case 500:
      return "Error interno del servidor. Intenta más tarde o contacta al administrador.";
    case 502:
    case 503:
    case 504:
      return "El servidor no está disponible temporalmente. Intenta en unos minutos.";
    case 405:
      return CODE_MESSAGES_ES.METHOD_NOT_ALLOWED;
    default:
      return `Error del servidor (HTTP ${status}).`;
  }
}

function isApiErrorShape(value: unknown): value is { error: ApiErrorPayload } {
  return (
    !!value &&
    typeof value === "object" &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "object" &&
    (value as { error: ApiErrorPayload }).error !== null &&
    typeof (value as { error: ApiErrorPayload }).error.code === "string"
  );
}

/** Extract normalized payload from thrown values (API client, fetch, Error). */
export function parseApiError(error: unknown): ApiErrorPayload | null {
  if (isApiErrorShape(error)) {
    return error.error;
  }

  if (error instanceof Error) {
    const msg = error.message.trim();
    if (msg === "Session expired") {
      return { code: "SESSION_EXPIRED", message: CODE_MESSAGES_ES.SESSION_EXPIRED };
    }
    if (msg.includes("URL base del API inválida") || msg.includes("Invalid base URL")) {
      return { code: "INVALID_API_BASE", message: CODE_MESSAGES_ES.INVALID_API_BASE };
    }
    if (msg) {
      return { code: "CLIENT_ERROR", message: msg };
    }
  }

  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return { code: "UNKNOWN_ERROR", message: (error as { message: string }).message };
  }

  return null;
}

function userMessageFromPayload(payload: ApiErrorPayload): string {
  if (CODE_MESSAGES_ES[payload.code]) {
    return CODE_MESSAGES_ES[payload.code];
  }
  if (payload.message && payload.message !== "An error occurred") {
    return payload.message;
  }
  if (payload.status) {
    return messageForHttpStatus(payload.status);
  }
  return CODE_MESSAGES_ES.UNKNOWN_ERROR;
}

function detectWrongApiUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    const path = u.pathname;
    return (
      path.includes("/http://") ||
      path.includes("/https://") ||
      (typeof window !== "undefined" &&
        u.origin === window.location.origin &&
        !path.startsWith("/api/"))
    );
  } catch {
    return false;
  }
}

/** User-facing copy + optional technical line for support/debug. */
export function getApiErrorPresentation(error: unknown): ApiErrorPresentation | null {
  const payload = parseApiError(error);
  if (!payload) {
    return {
      title: CODE_MESSAGES_ES.UNKNOWN_ERROR,
      description: "No se recibió detalle del error. Revisa la consola del navegador (F12).",
    };
  }

  let title = userMessageFromPayload(payload);
  let description: string | undefined;

  if (detectWrongApiUrl(payload.url)) {
    title = CODE_MESSAGES_ES.WRONG_API_URL;
    description =
      "La petición no llegó al backend. Usa el mismo host en el navegador y en NEXT_PUBLIC_API_URL (ej. 127.0.0.1:8000, sin /api/v1).";
  } else if (payload.code === "USER_EXISTS" && payload.message.includes("different credentials")) {
    description = "El nickname ya está ocupado por otra cuenta.";
  } else if (payload.code === "VALIDATION_ERROR" && payload.message !== title) {
    description = payload.message;
  } else if (payload.code === "NOT_JSON_RESPONSE" && payload.status === 405) {
    title = CODE_MESSAGES_ES.METHOD_NOT_ALLOWED;
    description = "Comprueba NEXT_PUBLIC_API_URL y que el backend esté en el puerto 8000 o detrás de nginx (/api).";
  }

  const technicalParts: string[] = [];
  if (payload.code) technicalParts.push(`Código: ${payload.code}`);
  if (payload.status) technicalParts.push(`HTTP ${payload.status}`);
  if (payload.url) technicalParts.push(payload.url);

  return {
    title,
    description,
    technical: technicalParts.length > 0 ? technicalParts.join(" · ") : undefined,
  };
}
