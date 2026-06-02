"use client";
import { useState } from "react";
import type { Notification, NotificationPayload } from "@/types/api";
import { useNotificationAdminActions } from "@/hooks/useNotificationAdminActions";
import { Modal } from "@/components/ui/Modal";

interface NotificationAdminActionsProps {
  notification: Notification;
  payload: NotificationPayload;
  isAdmin: boolean;
  onRejectClick?: (n: Notification) => void;
  layout?: "compact" | "stack";
}

export function isAdminActionableNotification(n: Notification, isAdmin: boolean) {
  return (
    isAdmin &&
    !n.read_at &&
    (n.type === "change_request_pending" ||
      n.type === "extra_bet_pending" ||
      n.type === "entry_pending" ||
      n.type === "password_reset_pending")
  );
}

export function NotificationAdminActions({
  notification: n,
  payload: p,
  isAdmin,
  onRejectClick,
  layout = "compact",
}: NotificationAdminActionsProps) {
  const {
    approveCr,
    addMember,
    confirmExtra,
    resolvePasswordReset,
    handleApproveChange,
    handleConfirmExtra,
    handleConfirmEntry,
    handleResolvePasswordReset,
    handleRejectPasswordReset,
  } = useNotificationAdminActions();

  const [tempPasswordModal, setTempPasswordModal] = useState<string | null>(null);

  if (!isAdminActionableNotification(n, isAdmin)) return null;

  const approveCls =
    "text-xs py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 font-medium disabled:opacity-50";
  const rejectCls =
    "text-xs py-1.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 font-medium";

  if (n.type === "change_request_pending") {
    return (
      <div className={layout === "stack" ? "flex flex-col gap-2 pt-1" : "flex gap-2 pt-1"}>
        <button
          type="button"
          onClick={() => handleApproveChange(n, p)}
          disabled={approveCr.isPending}
          className={layout === "stack" ? `w-full ${approveCls}` : `flex-1 ${approveCls}`}
        >
          Aprobar
        </button>
        <button
          type="button"
          onClick={() => onRejectClick?.(n)}
          className={layout === "stack" ? `w-full ${rejectCls}` : `flex-1 ${rejectCls}`}
        >
          Rechazar
        </button>
      </div>
    );
  }

  if (n.type === "extra_bet_pending") {
    return (
      <button
        type="button"
        onClick={() => handleConfirmExtra(n, p)}
        disabled={confirmExtra.isPending}
        className={`w-full ${approveCls} mt-1`}
      >
        Confirmar pago extra
      </button>
    );
  }

  if (n.type === "entry_pending") {
    return (
      <button
        type="button"
        onClick={() => handleConfirmEntry(n, p)}
        disabled={addMember.isPending}
        className={`w-full ${approveCls} mt-1`}
      >
        Confirmar entrada
      </button>
    );
  }

  if (n.type === "password_reset_pending") {
    return (
      <>
        <div className={layout === "stack" ? "flex flex-col gap-2 pt-1" : "flex gap-2 pt-1"}>
          <button
            type="button"
            onClick={async () => {
              const pwd = await handleResolvePasswordReset(n, p);
              if (pwd) setTempPasswordModal(pwd);
            }}
            disabled={resolvePasswordReset.isPending}
            className={layout === "stack" ? `w-full ${approveCls}` : `flex-1 ${approveCls}`}
          >
            Generar temporal
          </button>
          <button
            type="button"
            onClick={() => onRejectClick?.(n)}
            className={layout === "stack" ? `w-full ${rejectCls}` : `flex-1 ${rejectCls}`}
          >
            Rechazar
          </button>
        </div>
        {tempPasswordModal && (
          <Modal
            open={!!tempPasswordModal}
            onClose={() => setTempPasswordModal(null)}
            title="Contraseña temporal"
            size="sm"
          >
            <p className="text-sm text-muted mb-3">
              Entrégala al usuario de forma segura. Debe cambiarla al iniciar sesión.
            </p>
            <p className="font-mono text-lg text-white bg-white/5 rounded-lg px-3 py-2 break-all">
              {tempPasswordModal}
            </p>
            <button
              type="button"
              onClick={() => setTempPasswordModal(null)}
              className="mt-4 w-full py-2 rounded-lg border border-white/10 text-muted text-sm"
            >
              Cerrar
            </button>
          </Modal>
        )}
      </>
    );
  }

  return null;
}
