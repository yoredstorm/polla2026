"use client";
import { useCallback, useEffect, useState } from "react";
import {
  getLocalPushSubscription,
  getPushPermissionState,
  isPushSupported,
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
      const sub = await subscribeToPush();
      if (!sub) {
        setError("Permiso denegado o no disponible en este navegador.");
        await refresh();
        return;
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo activar las notificaciones");
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
