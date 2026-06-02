"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Modal } from "@/components/ui/Modal";
import {
  beginNotificationPermissionRequest,
  formatPushSubscribeError,
  getPushPermissionState,
  getPushServerStatus,
  isPushSupported,
  permissionBlockedMessage,
  subscribeToPush,
  syncPushSubscriptionToServer,
  type PushSubscribeProgress,
} from "@/lib/pushNotifications";

const PROGRESS_HINT: Record<PushSubscribeProgress, string> = {
  permission:
    "Mira la barra de direcciones de Edge: debe aparecer «¿Permitir notificaciones?». Pulsa Permitir.",
  vapid: "Conectando con el servidor...",
  "service-worker": "Preparando el service worker...",
  subscribe: "Registrando con el servicio push del navegador...",
  server: "Guardando este dispositivo en el servidor...",
};

const SNOOZE_KEY = "polla_push_prompt_snooze_until";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

const AUTH_PREFIXES = ["/login", "/register", "/account/change-password-required"];

function isSnoozed(): boolean {
  if (typeof window === "undefined") return true;
  const raw = localStorage.getItem(SNOOZE_KEY);
  if (!raw) return false;
  const until = Number(raw);
  return Number.isFinite(until) && Date.now() < until;
}

function snoozePrompt() {
  localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
}

export function PushNotificationPrompt() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyStep, setBusyStep] = useState<PushSubscribeProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  const onAuthPage = AUTH_PREFIXES.some((p) => pathname?.startsWith(p));

  useEffect(() => {
    if (!user || onAuthPage || !isPushSupported() || isSnoozed()) {
      setOpen(false);
      return;
    }

    const perm = getPushPermissionState();
    setPermission(perm as NotificationPermission);
    if (perm === "unsupported") {
      setOpen(false);
      return;
    }

    // Show the button immediately — do not wait for API or service worker.
    setOpen(true);

    let cancelled = false;
    void (async () => {
      try {
        const status = await getPushServerStatus();
        if (cancelled) return;
        if (status.serverRegistered) {
          setOpen(false);
          return;
        }
      } catch {
        /* keep modal open */
      }

      if (perm !== "granted") return;

      const reg = await navigator.serviceWorker.getRegistration("/");
      if (!reg?.active || cancelled) return;
      const existing = await reg.pushManager.getSubscription();
      if (!existing || cancelled) return;

      try {
        await syncPushSubscriptionToServer();
        const status = await getPushServerStatus();
        if (!cancelled && status.serverRegistered) setOpen(false);
      } catch {
        /* keep modal open */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, onAuthPage, pathname]);

  function handleEnableClick() {
    setError(null);
    const permissionPromise = beginNotificationPermissionRequest();
    setBusy(true);
    setBusyStep("permission");

    void permissionPromise.then(async (perm) => {
      setPermission(perm);
      if (perm !== "granted") {
        setError(permissionBlockedMessage(perm));
        setBusy(false);
        setBusyStep(null);
        return;
      }

      setBusy(true);
      try {
        await subscribeToPush((step) => setBusyStep(step), { permissionGranted: true });
        setOpen(false);
      } catch (e) {
        setError(formatPushSubscribeError(e));
        setPermission(getPushPermissionState() as NotificationPermission);
      } finally {
        setBusy(false);
        setBusyStep(null);
      }
    });
  }

  function handleLater() {
    snoozePrompt();
    setOpen(false);
  }

  if (!open || permission === "unsupported") return null;

  const denied = permission === "denied";
  const needsPermission = permission === "default";

  return (
    <Modal open={open} onClose={handleLater} title="Activar notificaciones" size="sm">
      <p className="text-sm text-muted mb-4">
        Recibe avisos en este dispositivo aunque no tengas la app abierta: partidos, retos, menciones
        {user?.is_admin ? " y pendientes de aprobacion." : "."}
      </p>
      {needsPermission && !busy && (
        <p className="text-xs text-amber-200 mb-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2">
          El aviso de permiso lo muestra <strong className="text-white">Edge</strong>, no el servidor
          (suele aparecer junto a la URL, no en este cuadro). Pulsa el boton y luego{" "}
          <strong className="text-white">Permitir</strong> en la barra de direcciones.
        </p>
      )}
      {busy && !denied && (
        <p className="text-xs text-accent mb-3">
          {busyStep ? PROGRESS_HINT[busyStep] : "Iniciando..."}
        </p>
      )}
      {denied && (
        <p className="text-xs text-amber-300 mb-3">
          Bloqueaste las notificaciones. Candado en la barra de direcciones → Notificaciones → Permitir,
          o edge://settings/content/notifications
        </p>
      )}
      {error && <p className="text-xs text-red-300 mb-3">{error}</p>}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleEnableClick}
          disabled={busy}
          className="w-full py-2.5 rounded-lg bg-accent text-background font-semibold text-sm hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Activando..." : "Permitir notificaciones"}
        </button>
        <button
          type="button"
          onClick={handleLater}
          disabled={busy}
          className="w-full py-2 text-sm text-muted hover:text-white"
        >
          Ahora no
        </button>
      </div>
    </Modal>
  );
}
