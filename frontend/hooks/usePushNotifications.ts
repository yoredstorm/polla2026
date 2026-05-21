"use client";
import { useCallback, useEffect, useState } from "react";
import {
  collectPushDiagnostics,
  formatPushSubscribeError,
  getLocalPushSubscription,
  getPushPermissionState,
  getPushServerStatus,
  isPushSupported,
  registerServiceWorker,
  sendPushTest,
  resetAndSubscribeToPush,
  subscribeToPush,
  syncPushSubscriptionToServer,
  unsubscribeFromPush,
  type PushDiagnostics,
  type PushPermissionState,
} from "@/lib/pushNotifications";

export function usePushNotifications() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<PushPermissionState>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [serverRegistered, setServerRegistered] = useState(false);
  const [vapidConfigured, setVapidConfigured] = useState(true);
  const [subscriptionCount, setSubscriptionCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<PushDiagnostics | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const refresh = useCallback(async () => {
    const sup = isPushSupported();
    setSupported(sup);
    if (!sup) {
      setPermission("unsupported");
      setSubscribed(false);
      setServerRegistered(false);
      return;
    }
    setPermission(await getPushPermissionState());
    await registerServiceWorker();
    const sub = await getLocalPushSubscription();
    setSubscribed(!!sub);
    if (sub && Notification.permission === "granted") {
      try {
        await syncPushSubscriptionToServer();
      } catch {
        /* server may be unreachable; status check below */
      }
    }
    try {
      const status = await getPushServerStatus();
      setServerRegistered(status.serverRegistered);
      setVapidConfigured(status.vapidConfigured);
      setSubscriptionCount(status.serverSubscriptionCount);
    } catch {
      setServerRegistered(false);
      setVapidConfigured(false);
      setSubscriptionCount(0);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function captureDiagnostics(lastError?: unknown) {
    try {
      setDiagnostics(await collectPushDiagnostics(lastError));
    } catch {
      setDiagnostics(null);
    }
  }

  async function enable() {
    setLoading(true);
    setError(null);
    setDiagnostics(null);
    try {
      await subscribeToPush();
      await refresh();
    } catch (e) {
      setError(formatPushSubscribeError(e));
      await captureDiagnostics(e);
      setShowDiagnostics(true);
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

  async function sendTest() {
    setLoading(true);
    setError(null);
    setTestMessage(null);
    try {
      await sendPushTest();
      setTestMessage("Prueba enviada. Cierra la app o bloquea la pantalla y revisa la bandeja del sistema.");
    } catch (e) {
      setError(formatPushSubscribeError(e, "No se pudo enviar la prueba."));
    } finally {
      setLoading(false);
    }
  }

  async function resetAndEnable() {
    setLoading(true);
    setError(null);
    setTestMessage(null);
    setDiagnostics(null);
    try {
      await resetAndSubscribeToPush();
      await refresh();
      setTestMessage("Push reiniciado en este dispositivo.");
    } catch (e) {
      setError(formatPushSubscribeError(e));
      await captureDiagnostics(e);
      setShowDiagnostics(true);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  return {
    supported,
    permission,
    subscribed,
    serverRegistered,
    vapidConfigured,
    subscriptionCount,
    loading,
    error,
    testMessage,
    diagnostics,
    showDiagnostics,
    setShowDiagnostics,
    enable,
    disable,
    sendTest,
    resetAndEnable,
    refresh,
  };
}
