"use client";
import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "@/lib/challengeUtils";
import {
  getLocalPushSubscription,
  getPushPermissionState,
  isPushSupported,
  registerServiceWorker,
  subscribeToPush,
  unsubscribeFromPush,
  type PushPermissionState,
} from "@/lib/pushNotifications";

export function usePushNotifications() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<PushPermissionState>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const sup = isPushSupported();
    setSupported(sup);
    if (!sup) {
      setPermission("unsupported");
      setSubscribed(false);
      return;
    }
    setPermission(await getPushPermissionState());
    await registerServiceWorker();
    const sub = await getLocalPushSubscription();
    setSubscribed(!!sub);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function enable() {
    setLoading(true);
    setError(null);
    try {
      await subscribeToPush();
      await refresh();
    } catch (e) {
      setError(getApiErrorMessage(e, "No se pudo activar las notificaciones."));
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function disable() {
    setLoading(true);
    setError(null);
    try {
      await unsubscribeFromPush();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al desactivar");
    } finally {
      setLoading(false);
    }
  }

  return {
    supported,
    permission,
    subscribed,
    loading,
    error,
    enable,
    disable,
    refresh,
  };
}
