"use client";
import { useCallback, useEffect, useState } from "react";
import {
  beginNotificationPermissionRequest,
  collectPushDiagnostics,
  formatPushSubscribeError,
  getLocalPushSubscription,
  getPushPermissionState,
  getPushServerStatus,
  isPushSupported,
  permissionBlockedMessage,
  registerServiceWorker,
  sendPushTest,
  resetAndSubscribeToPush,
  subscribeToPush,
  syncPushSubscriptionToServer,
  unsubscribeFromPush,
  type PushDiagnostics,
  type PushPermissionState,
  type PushSubscribeProgress,
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
  const [busyStep, setBusyStep] = useState<PushSubscribeProgress | null>(null);

  const refresh = useCallback(async () => {
    const sup = isPushSupported();
    setSupported(sup);
    if (!sup) {
      setPermission("unsupported");
      setSubscribed(false);
      setServerRegistered(false);
      return;
    }
    setPermission(getPushPermissionState());
    // Register SW in background — must not block the permission button or click gesture.
    void registerServiceWorker().catch(() => {});
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

  function enableFromClick() {
    setError(null);
    setDiagnostics(null);
    const permissionPromise = beginNotificationPermissionRequest();
    setLoading(true);
    setBusyStep("permission");
    void permissionPromise.then(async (perm) => {
      setPermission(perm);
      if (perm !== "granted") {
        setError(permissionBlockedMessage(perm));
        await captureDiagnostics(new Error(permissionBlockedMessage(perm)));
        setShowDiagnostics(true);
        setLoading(false);
        setBusyStep(null);
        return;
      }
      try {
        await subscribeToPush((step) => setBusyStep(step), { permissionGranted: true });
        await refresh();
      } catch (e) {
        setError(formatPushSubscribeError(e));
        await captureDiagnostics(e);
        setShowDiagnostics(true);
        await refresh();
      } finally {
        setLoading(false);
        setBusyStep(null);
      }
    });
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

  function resetAndEnableFromClick() {
    setError(null);
    setTestMessage(null);
    setDiagnostics(null);
    const permissionPromise = beginNotificationPermissionRequest();
    setLoading(true);
    setBusyStep("permission");
    void permissionPromise.then(async (perm) => {
      setPermission(perm);
      if (perm !== "granted") {
        setError(permissionBlockedMessage(perm));
        await captureDiagnostics(new Error(permissionBlockedMessage(perm)));
        setShowDiagnostics(true);
        setLoading(false);
        setBusyStep(null);
        return;
      }
      try {
        await resetAndSubscribeToPush((step) => setBusyStep(step), { permissionGranted: true });
        await refresh();
        setTestMessage("Push reiniciado en este dispositivo.");
      } catch (e) {
        setError(formatPushSubscribeError(e));
        await captureDiagnostics(e);
        setShowDiagnostics(true);
        await refresh();
      } finally {
        setLoading(false);
        setBusyStep(null);
      }
    });
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
    busyStep,
    enableFromClick,
    disable,
    sendTest,
    resetAndEnableFromClick,
    refresh,
  };
}
