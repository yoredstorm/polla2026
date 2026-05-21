import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/challengeUtils";

export type PushPermissionState = "unsupported" | "default" | "granted" | "denied";

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  const secure =
    window.location.protocol === "https:" || window.location.hostname === "localhost";
  return secure && "serviceWorker" in navigator && "PushManager" in window;
}

function isPushServiceRegistrationError(err: unknown): boolean {
  const msg =
    err instanceof DOMException
      ? err.message
      : err instanceof Error
        ? err.message
        : "";
  return (
    msg.includes("push service error") ||
    msg.includes("Registration failed") ||
    msg.includes("applicationServerKey is not valid")
  );
}

/** User-facing message for push subscribe failures (API, browser, or generic Error). */
export function formatPushSubscribeError(
  err: unknown,
  fallback = "No se pudo activar las notificaciones.",
): string {
  const apiMsg = getApiErrorMessage(err, "");
  if (apiMsg) return apiMsg;
  if (err instanceof DOMException) {
    const detail = formatDomException(err);
    if (err.message.includes("applicationServerKey is not valid")) {
      return (
        "La clave VAPID del servidor no es valida. El administrador debe ejecutar " +
        "python scripts/generate_vapid_keys.py, actualizar Dokploy (backend) y redesplegar."
      );
    }
    if (isPushServiceRegistrationError(err)) {
      return (
        "Tu permiso esta bien y el servidor responde, pero Google (FCM) rechazo registrar este Chrome en el movil. " +
        "Eso no se arregla borrando cookies del sitio: hay que resetear Chrome o la red. " +
        "Prueba: Ajustes → Apps → Chrome → Almacenamiento → Borrar datos (o desinstalar actualizaciones de Chrome), " +
        "desactiva DNS privado/adblock, usa Wi‑Fi, y comprueba Google Play Services. " +
        `Detalle tecnico: ${detail}`
      );
    }
    return `El navegador no pudo crear la suscripcion push: ${detail}`;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}

function normalizeVapidPublicKey(key: string): string {
  return key.trim().replace(/^["']|["']$/g, "").replace(/\s+/g, "");
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const cleaned = normalizeVapidPublicKey(base64String);
  const padding = "=".repeat((4 - (cleaned.length % 4)) % 4);
  const base64 = (cleaned + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function validateApplicationServerKey(publicKey: string): Uint8Array {
  const bytes = urlBase64ToUint8Array(publicKey);
  if (bytes.length !== 65 || bytes[0] !== 0x04) {
    throw new Error(
      "La clave VAPID publica del servidor no es valida. Regenera las claves en Dokploy y redesplega el backend.",
    );
  }
  return bytes;
}

/** Detached ArrayBuffer — some Android Chrome builds reject Uint8Array views on subscribe. */
function toApplicationServerKey(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

async function preflightServiceWorkerScript(): Promise<void> {
  const res = await fetch("/sw.js", { cache: "no-store" });
  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (!res.ok || text.trimStart().startsWith("<") || !ct.includes("javascript")) {
    throw new Error(
      "El archivo /sw.js no es valido (el servidor devolvio HTML o un error). " +
        "Cierra sesion no deberia bloquear sw.js; avisa al administrador.",
    );
  }
}

async function waitForServiceWorkerActive(
  reg: ServiceWorkerRegistration,
  timeoutMs = 12000,
): Promise<void> {
  if (reg.active) return;
  const worker = reg.installing ?? reg.waiting;
  if (!worker) {
    await new Promise((r) => setTimeout(r, 400));
    if (reg.active) return;
    throw new Error("El service worker no termino de activarse. Cierra Chrome y vuelve a abrir el sitio.");
  }
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("Tiempo de espera agotado activando notificaciones. Vuelve a intentar."));
    }, timeoutMs);
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated" || reg.active) {
        window.clearTimeout(timer);
        resolve();
      }
    });
    if (worker.state === "activated" || reg.active) {
      window.clearTimeout(timer);
      resolve();
    }
  });
}

/** Unregister service workers and local push subscription (does not clear server). */
export async function resetLocalPushState(): Promise<void> {
  if (!isPushSupported()) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const reg of registrations) {
    try {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        try {
          await sub.unsubscribe();
        } catch {
          /* ignore */
        }
        try {
          await api.delete("/notifications/push/unsubscribe", { endpoint });
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
    try {
      await reg.unregister();
    } catch {
      /* ignore */
    }
  }
  if ("caches" in window) {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    } catch {
      /* ignore */
    }
  }
}

/** Remove every server-side subscription for this user, then reset locally. */
export async function clearAllPushSubscriptions(): Promise<number> {
  const res = await api.delete<{ ok: boolean; removed: number }>(
    "/notifications/push/subscriptions",
  );
  await resetLocalPushState();
  return res.removed ?? 0;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  await preflightServiceWorkerScript();
  try {
    let reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg) {
      reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }
    await waitForServiceWorkerActive(reg);
    return reg;
  } catch (e) {
    const hint = e instanceof Error ? e.message : "error desconocido";
    throw new Error(`No se pudo cargar /sw.js (${hint}).`);
  }
}

export async function getPushPermissionState(): Promise<PushPermissionState> {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission as PushPermissionState;
}

export async function getLocalPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export type PushServerStatus = {
  vapidConfigured: boolean;
  vapidKeyPairConsistent?: boolean;
  vapidPublicKeyPrefix?: string;
  serverSubscriptionCount: number;
  serverRegistered: boolean;
};

export type PushDiagnostics = {
  permission: string;
  swRegistrations: number;
  swActive: boolean;
  swScriptOk: boolean;
  localSubscription: boolean;
  localEndpointHost: string | null;
  serverVapidConfigured: boolean;
  serverVapidKeyPairConsistent: boolean;
  serverSubscriptionCount: number;
  vapidKeyBytes: number | null;
  subscribeError: string | null;
  userAgent: string;
};

function formatDomException(err: DOMException): string {
  const parts = [err.name, err.message].filter(Boolean);
  if (typeof err.code === "number" && err.code !== 0) {
    parts.push(`code=${err.code}`);
  }
  return parts.join(" — ");
}

/** Step-by-step state for support (does not change subscriptions). */
export async function collectPushDiagnostics(
  lastError?: unknown,
): Promise<PushDiagnostics> {
  let swRegistrations = 0;
  let swActive = false;
  let swScriptOk = false;
  let localSubscription = false;
  let localEndpointHost: string | null = null;
  let vapidKeyBytes: number | null = null;

  if (isPushSupported()) {
    try {
      const res = await fetch("/sw.js", { cache: "no-store" });
      const text = await res.text();
      swScriptOk =
        res.ok && !text.trimStart().startsWith("<") && text.includes("addEventListener");
    } catch {
      swScriptOk = false;
    }
    const regs = await navigator.serviceWorker.getRegistrations();
    swRegistrations = regs.length;
    swActive = regs.some((r) => !!r.active);
    const sub = await getLocalPushSubscription();
    localSubscription = !!sub;
    if (sub?.endpoint) {
      try {
        localEndpointHost = new URL(sub.endpoint).host;
      } catch {
        localEndpointHost = "invalid";
      }
    }
    try {
      const { publicKey } = await api.get<{ publicKey: string }>(
        "/notifications/push/vapid-public-key",
      );
      vapidKeyBytes = validateApplicationServerKey(publicKey).byteLength;
    } catch {
      vapidKeyBytes = null;
    }
  }

  let serverVapidConfigured = false;
  let serverVapidKeyPairConsistent = true;
  let serverSubscriptionCount = 0;
  try {
    const status = await getPushServerStatus();
    serverVapidConfigured = status.vapidConfigured;
    serverVapidKeyPairConsistent = status.vapidKeyPairConsistent ?? true;
    serverSubscriptionCount = status.serverSubscriptionCount;
  } catch {
    /* ignore */
  }

  let subscribeError: string | null = null;
  if (lastError instanceof DOMException) {
    subscribeError = formatDomException(lastError);
  } else if (lastError instanceof Error) {
    subscribeError = lastError.message;
  } else if (lastError) {
    subscribeError = String(lastError);
  }

  return {
    permission: isPushSupported() ? Notification.permission : "unsupported",
    swRegistrations,
    swActive,
    swScriptOk,
    localSubscription,
    localEndpointHost,
    serverVapidConfigured,
    serverVapidKeyPairConsistent,
    serverSubscriptionCount,
    vapidKeyBytes,
    subscribeError,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
  };
}

export async function getPushServerStatus(): Promise<PushServerStatus> {
  return api.get<PushServerStatus>("/notifications/push/status");
}

async function saveSubscriptionOnServer(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Suscripcion push invalida en el navegador.");
  }
  try {
    await api.post("/notifications/push/subscribe", {
      endpoint: json.endpoint,
      keys: json.keys,
      expirationTime: json.expirationTime ?? null,
    });
  } catch (err) {
    const detail = getApiErrorMessage(err, "");
    throw new Error(
      detail
        ? `No se guardo la suscripcion en el servidor: ${detail}`
        : "No se guardo la suscripcion en el servidor.",
    );
  }
}

/** Re-register browser subscription on the server (fixes permission granted but POST failed). */
export async function syncPushSubscriptionToServer(): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== "granted") return false;
  await navigator.serviceWorker.ready;
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return false;
  await saveSubscriptionOnServer(sub);
  return true;
}

export async function sendPushTest(): Promise<{
  ok: boolean;
  serverSubscriptionCount: number;
  pushDelivered?: number;
}> {
  return api.post("/notifications/push/test", {});
}

async function createBrowserSubscription(
  reg: ServiceWorkerRegistration,
  appKey: BufferSource,
): Promise<PushSubscription> {
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: appKey,
  });
}

export async function subscribeToPush(): Promise<PushSubscription> {
  if (!isPushSupported()) {
    throw new Error("Las notificaciones push no estan disponibles en este navegador.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permiso de notificaciones denegado.");
  }

  let publicKey: string;
  try {
    const res = await api.get<{ publicKey: string }>("/notifications/push/vapid-public-key");
    publicKey = res.publicKey;
  } catch (err) {
    const detail = getApiErrorMessage(err, "");
    if (detail.includes("no configurado") || detail.includes("Web Push")) {
      throw new Error(detail);
    }
    throw new Error(
      detail
        ? `Web Push no disponible en el servidor: ${detail}`
        : "Web Push no configurado en el servidor. El administrador debe añadir claves VAPID en Dokploy.",
    );
  }

  if (!publicKey) {
    throw new Error(
      "Web Push no configurado en el servidor. El administrador debe añadir claves VAPID en Dokploy.",
    );
  }

  const appKey = toApplicationServerKey(validateApplicationServerKey(publicKey));

  let reg = await registerServiceWorker();
  if (!reg) {
    throw new Error("No se pudo registrar el service worker. Comprueba que /sw.js cargue correctamente.");
  }

  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    try {
      await saveSubscriptionOnServer(sub);
      const status = await getPushServerStatus();
      if (status.serverRegistered) return sub;
    } catch {
      /* re-subscribe with current VAPID */
    }
    try {
      await sub.unsubscribe();
    } catch {
      /* ignore */
    }
    sub = null;
  }

  if (!sub) {
    try {
      sub = await createBrowserSubscription(reg, appKey);
    } catch (e) {
      if (!isPushServiceRegistrationError(e)) {
        throw new Error(formatPushSubscribeError(e));
      }
      await resetLocalPushState();
      reg = (await registerServiceWorker())!;
      await navigator.serviceWorker.ready;
      try {
        sub = await createBrowserSubscription(reg, appKey);
      } catch (retryErr) {
        throw new Error(formatPushSubscribeError(retryErr));
      }
    }
  }

  await saveSubscriptionOnServer(sub);

  const status = await getPushServerStatus();
  if (!status.serverRegistered) {
    throw new Error(
      "El servidor no registro este dispositivo. Revisa VAPID en Dokploy o vuelve a intentar.",
    );
  }

  return sub;
}

/**
 * Reset push only on this browser (unregister SW + local subscription), then subscribe again.
 * Does not remove other devices registered on the server.
 */
export async function resetAndSubscribeToPush(): Promise<PushSubscription> {
  await resetLocalPushState();
  await new Promise((r) => setTimeout(r, 1500));
  return subscribeToPush();
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await api.delete("/notifications/push/unsubscribe", { endpoint });
    }
  } catch {
    /* best effort on logout */
  }
}
