"use client";
import { useQueryClient } from "@tanstack/react-query";
import {
  useApproveChangeRequest,
  useRejectChangeRequest,
  useConfirmExtra,
  useAddGroupMember,
} from "@/hooks/useAdmin";
import { useMarkNotificationRead } from "@/hooks/useNotifications";
import { useToast } from "@/components/ui/Toast";
import { isAlreadyResolvedError } from "@/lib/notificationActions";
import type { Notification, NotificationPayload } from "@/types/api";

export function useNotificationAdminActions() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.add);
  const markRead = useMarkNotificationRead();
  const approveCr = useApproveChangeRequest();
  const rejectCr = useRejectChangeRequest();
  const confirmExtra = useConfirmExtra();
  const addMember = useAddGroupMember();

  async function afterAction(n: Notification, alreadyDone = false) {
    if (!n.read_at) {
      await markRead.mutateAsync(n.id);
    }
    toast(
      alreadyDone ? "Ya estaba resuelto" : "Accion completada",
      alreadyDone ? "info" : "success",
    );
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  async function handleApproveChange(n: Notification, p: NotificationPayload) {
    if (!p.request_id) return;
    try {
      await approveCr.mutateAsync({ requestId: p.request_id });
      await afterAction(n);
    } catch (e) {
      if (isAlreadyResolvedError(e)) {
        await afterAction(n, true);
        return;
      }
      toast("Error al aprobar", "error");
    }
  }

  async function handleReject(n: Notification, adminNotes?: string) {
    if (!n.payload?.request_id) return;
    try {
      await rejectCr.mutateAsync({
        requestId: n.payload.request_id,
        admin_notes: adminNotes || undefined,
      });
      await afterAction(n);
    } catch (e) {
      if (isAlreadyResolvedError(e)) {
        await afterAction(n, true);
        return;
      }
      toast("Error al rechazar", "error");
    }
  }

  async function handleConfirmExtra(n: Notification, p: NotificationPayload) {
    if (!p.group_id || !p.bet_id) return;
    try {
      await confirmExtra.mutateAsync({ groupId: p.group_id, betId: p.bet_id });
      await afterAction(n);
    } catch (e) {
      if (isAlreadyResolvedError(e)) {
        await afterAction(n, true);
        return;
      }
      toast("Error al confirmar pago", "error");
    }
  }

  async function handleConfirmEntry(n: Notification, p: NotificationPayload) {
    if (!p.group_id || !p.user_id) return;
    try {
      await addMember.mutateAsync({ groupId: p.group_id, userId: p.user_id });
      await afterAction(n);
    } catch (e) {
      if (isAlreadyResolvedError(e)) {
        await afterAction(n, true);
        return;
      }
      toast("Error al confirmar entrada", "error");
    }
  }

  return {
    approveCr,
    rejectCr,
    confirmExtra,
    addMember,
    handleApproveChange,
    handleReject,
    handleConfirmExtra,
    handleConfirmEntry,
  };
}
