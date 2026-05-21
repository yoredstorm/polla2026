import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/challengeUtils";

export type PushPermissionState = "unsupported" | "default" | "granted" | "denied";

export type PushSubscribeProgress =
  | "permission"
  | "vapid"
  | "service-worker"
  | "subscribe"
  | "server";

const PERMISSION_TIMEOUT_MS = 90_000;
const API_STEP_TIMEOUT_MS = 25_000;
const SW_STEP_TIMEOUT_MS = 20_000;
const SUBSCRIBE_TIMEOUT_MS = 45_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

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
  const res = await withTimeout(
    fetch("/sw.js", { cache: "no-store" }),
    SW_STEP_TIMEOUT_MS,
    "Tiempo agotado comprobando /sw.js. Recarga la pagina.",
  );
  const text = await res.text();
  if (!res.ok || text.trimStart().startsWith("<") || !text.includes("addEventListener")) {
    throw new Error(
      "El archivo /sw.js no es valido (el servidor devolvio HTML o un error). " +
        "Cierra sesion no deberia bloquear sw.js; avisa al administrador.",
    );
  }
}

async function waitForServiceWorkerActive(reg: ServiceWorkerRegistration): Promise<void> {
  if (reg.active) return;
  const readyPromise =
    "ready" in reg && reg.ready instanceof Promise
      ? (reg.ready as Promise<ServiceWorkerRegistration>)
      : new Promise<void>((resolve, reject) => {
          const worker = reg.installing ?? reg.waiting;
          if (!worker) {
            reject(
              new Error(
                "El service worker no arranco. Recarga la pagina o prueba en una ventana normal (no InPrivate).",
              ),
            );
            return;
          }
          const onState = () => {
            if (worker.state === "activated" || reg.active) resolve();
          };
          worker.addEventListener("statechange", onState);
          onState();
        });
  await withTimeout(
    readyPromise.then(() => undefined),
    SW_STEP_TIMEOUT_MS,
    "Tiempo agotado activando el service worker. Recarga la pagina e intentalo de nuevo.",
  );
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
        void withTimeout(
          api.delete("/notifications/push/unsubscribe", { endpoint }),
          5000,
          "timeout",
        ).catch(() => {
          /* ignore — local reset must not block */
        });
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
    let reg = await withTimeout(
      navigator.serviceWorker.getRegistration("/"),
      SW_STEP_TIMEOUT_MS,
      "Tiempo agotado leyendo el service worker.",
    );
    if (!reg) {
      reg = await withTimeout(
        navigator.serviceWorker.register("/sw.js", { scope: "/" }),
        SW_STEP_TIMEOUT_MS,
        "Tiempo agotado registrando /sw.js.",
      );
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

async function getPushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (reg?.active) return reg;
  if (reg) {
    await waitForServiceWorkerActive(reg);
    return reg;
  }
  return registerServiceWorker();
}

export async function getLocalPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await getPushRegistration();
  if (!reg) return null;
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
  const reg = await getPushRegistration();
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
  return withTimeout(
    reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appKey,
    }),
    SUBSCRIBE_TIMEOUT_MS,
    "Tiempo agotado registrando con el servicio push del navegador (FCM). Vuelve a intentar.",
  );
}

export async function subscribeToPush(
  onProgress?: (step: PushSubscribeProgress) => void,
): Promise<PushSubscription> {
  if (!isPushSupported()) {
    throw new Error("Las notificaciones push no estan disponibles en este navegador.");
  }

  onProgress?.("permission");
  const permission = await withTimeout(
    Notification.requestPermission(),
    PERMISSION_TIMEOUT_MS,
    "Tiempo agotado esperando permiso. En Edge/Chrome mira la barra de direcciones: puede haber un icono de campana o un aviso «Permitir/Bloquear» que debes pulsar.",
  );
  if (permission !== "granted") {
    throw new Error("Permiso de notificaciones denegado.");
  }

  onProgress?.("vapid");
  let publicKey: string;
  try {
    const res = await withTimeout(
      api.get<{ publicKey: string }>("/notifications/push/vapid-public-key"),
      API_STEP_TIMEOUT_MS,
      "Tiempo agotado obteniendo clave VAPID del servidor.",
    );
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

  onProgress?.("service-worker");
  let reg = await registerServiceWorker();
  if (!reg) {
    throw new Error("No se pudo registrar el service worker. Comprueba que /sw.js cargue correctamente.");
  }

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
    onProgress?.("subscribe");
    try {
      sub = await createBrowserSubscription(reg, appKey);
    } catch (e) {
      if (!isPushServiceRegistrationError(e)) {
        throw new Error(formatPushSubscribeError(e));
      }
      await resetLocalPushState();
      reg = (await registerServiceWorker())!;
      try {
        sub = await createBrowserSubscription(reg, appKey);
      } catch (retryErr) {
        throw new Error(formatPushSubscribeError(retryErr));
      }
    }
  }

  onProgress?.("server");
  await withTimeout(
    saveSubscriptionOnServer(sub),
    API_STEP_TIMEOUT_MS,
    "Tiempo agotado guardando la suscripcion en el servidor.",
  );

  const status = await withTimeout(
    getPushServerStatus(),
    API_STEP_TIMEOUT_MS,
    "Tiempo agotado comprobando el registro en el servidor.",
  );
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
export async function resetAndSubscribeToPush(
  onProgress?: (step: PushSubscribeProgress) => void,
): Promise<PushSubscription> {
  await withTimeout(
    resetLocalPushState(),
    SW_STEP_TIMEOUT_MS,
    "Tiempo agotado reiniciando el service worker local.",
  );
  await new Promise((r) => setTimeout(r, 800));
  return subscribeToPush(onProgress);
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const reg = await getPushRegistration();
    if (!reg) return;
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
