"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Modal } from "@/components/ui/Modal";
import {
  formatPushSubscribeError,
  getLocalPushSubscription,
  getPushPermissionState,
  getPushServerStatus,
  isPushSupported,
  subscribeToPush,
  syncPushSubscriptionToServer,
} from "@/lib/pushNotifications";

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
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  const onAuthPage = AUTH_PREFIXES.some((p) => pathname?.startsWith(p));

  useEffect(() => {
    if (!user || onAuthPage || !isPushSupported() || isSnoozed()) {
      setOpen(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      const perm = await getPushPermissionState();
      if (cancelled) return;
      setPermission(perm as NotificationPermission);
      if (perm === "unsupported") return;

      try {
        const status = await getPushServerStatus();
        if (cancelled) return;
        if (status.serverRegistered) return;
      } catch {
        /* show prompt so user can retry */
      }

      const existing = await getLocalPushSubscription();
      if (cancelled) return;

      if (existing && perm === "granted") {
        try {
          await syncPushSubscriptionToServer();
          const status = await getPushServerStatus();
          if (!cancelled && status.serverRegistered) return;
        } catch {
          /* need manual activation */
        }
      }

      if (!cancelled) setOpen(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, onAuthPage, pathname]);

  async function handleEnable() {
    setBusy(true);
    setError(null);
    try {
      await subscribeToPush();
      setOpen(false);
    } catch (e) {
      setError(formatPushSubscribeError(e));
      const p = await getPushPermissionState();
      setPermission(p as NotificationPermission);
    } finally {
      setBusy(false);
    }
  }

  function handleLater() {
    snoozePrompt();
    setOpen(false);
  }

  if (!open || permission === "unsupported") return null;

  const denied = permission === "denied";

  return (
    <Modal open={open} onClose={handleLater} title="Activar notificaciones" size="sm">
      <p className="text-sm text-muted mb-4">
        Recibe avisos en este dispositivo aunque no tengas la app abierta: partidos, retos, menciones
        {user?.is_admin ? " y pendientes de aprobacion." : "."}
      </p>
      {busy && !denied && (
        <p className="text-xs text-accent mb-3">Esperando respuesta del navegador...</p>
      )}
      {denied && (
        <p className="text-xs text-amber-300 mb-3">
          Bloqueaste las notificaciones. En la configuracion del sitio (icono del candado en la barra
          de direcciones) permitelas y vuelve a pulsar Activar.
        </p>
      )}
      {error && <p className="text-xs text-red-300 mb-3">{error}</p>}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void handleEnable()}
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
