"use client";
import type { Notification, NotificationPayload } from "@/types/api";
import { useNotificationAdminActions } from "@/hooks/useNotificationAdminActions";

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
      n.type === "entry_pending")
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
    handleApproveChange,
    handleConfirmExtra,
    handleConfirmEntry,
  } = useNotificationAdminActions();

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

  return null;
}
