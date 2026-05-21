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
    if (err.message.includes("applicationServerKey is not valid")) {
      return (
        "La clave VAPID del servidor no es valida. El administrador debe ejecutar " +
        "python scripts/generate_vapid_keys.py, actualizar Dokploy (backend) y redesplegar."
      );
    }
    if (isPushServiceRegistrationError(err)) {
      return (
        "Chrome no pudo registrar este telefono con el servicio push (suscripcion antigua o corrupta). " +
        "Pulsa «Reiniciar push en este dispositivo» o cierra Chrome por completo y vuelve a intentar."
      );
    }
    return `El navegador no pudo crear la suscripcion push: ${err.message}`;
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
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await reg.update();
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
  serverSubscriptionCount: number;
  serverRegistered: boolean;
};

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

  const appKey = validateApplicationServerKey(publicKey) as BufferSource;

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

/** Full reset (server + browser) then subscribe — use when «push service error» persists. */
export async function resetAndSubscribeToPush(): Promise<PushSubscription> {
  await clearAllPushSubscriptions();
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
