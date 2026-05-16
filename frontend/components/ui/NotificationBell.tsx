"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import {
  useNotifications,
  useUnreadCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/hooks/useNotifications";
import {
  useApproveChangeRequest,
  useRejectChangeRequest,
  useConfirmExtra,
  useAddGroupMember,
} from "@/hooks/useAdmin";
import { useToast } from "@/components/ui/Toast";
import {
  connectNotificationsWs,
  disconnectNotificationsWs,
  setNotificationWsCallbacks,
} from "@/lib/notificationsWs";
import type { Notification, NotificationPayload } from "@/types/api";
import { cn } from "@/lib/utils";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NotificationBell() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast((s) => s.add);
  const [open, setOpen] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<Notification | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  const { data: notifPage } = useNotifications(1, 30);
  const { data: unreadData } = useUnreadCount(!!user, !wsConnected);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const approveCr = useApproveChangeRequest();
  const rejectCr = useRejectChangeRequest();
  const confirmExtra = useConfirmExtra();
  const addMember = useAddGroupMember();

  const unread = unreadData?.count ?? 0;
  const notifications = notifPage?.data ?? [];

  useEffect(() => {
    if (!user) return;
    setNotificationWsCallbacks({
      onConnected: () => setWsConnected(true),
      onDisconnected: () => setWsConnected(false),
    });
    const disconnect = connectNotificationsWs(qc, (msg, type) => toast(msg, type));
    return () => {
      disconnect();
      setNotificationWsCallbacks({});
    };
  }, [user, qc, toast]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function afterAction(n: Notification) {
    if (!n.read_at) {
      await markRead.mutateAsync(n.id);
    }
    toast("Accion completada", "success");
  }

  async function handleApproveChange(n: Notification, p: NotificationPayload) {
    if (!p.request_id) return;
    try {
      await approveCr.mutateAsync({ requestId: p.request_id });
      await afterAction(n);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch {
      toast("Error al aprobar", "error");
    }
  }

  async function handleRejectConfirm() {
    if (!rejectTarget?.payload?.request_id) return;
    try {
      await rejectCr.mutateAsync({
        requestId: rejectTarget.payload.request_id,
        admin_notes: rejectNotes || undefined,
      });
      await afterAction(rejectTarget);
      setRejectTarget(null);
      setRejectNotes("");
      qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch {
      toast("Error al rechazar", "error");
    }
  }

  async function handleConfirmExtra(n: Notification, p: NotificationPayload) {
    if (!p.group_id || !p.bet_id) return;
    try {
      await confirmExtra.mutateAsync({ groupId: p.group_id, betId: p.bet_id });
      await afterAction(n);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch {
      toast("Error al confirmar pago", "error");
    }
  }

  async function handleConfirmEntry(n: Notification, p: NotificationPayload) {
    if (!p.group_id || !p.user_id) return;
    try {
      await addMember.mutateAsync({ groupId: p.group_id, userId: p.user_id });
      await afterAction(n);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch {
      toast("Error al confirmar entrada", "error");
    }
  }

  if (!user) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg text-muted hover:text-white hover:bg-white/5 transition-colors"
        aria-label="Notificaciones"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-accent text-background text-[10px] font-bold">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(100vw-2rem,380px)] max-w-[380px] rounded-2xl border border-white/10 bg-surface shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <h3 className="font-display text-sm text-white">Notificaciones</h3>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                className="text-xs text-accent hover:underline"
              >
                Marcar todas leidas
              </button>
            )}
          </div>

          <div className="max-h-[min(70vh,420px)] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-muted text-sm text-center py-10">Sin notificaciones</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {notifications.map((n) => {
                  const p = n.payload ?? {};
                  const isAdminActionable =
                    user.is_admin &&
                    !n.read_at &&
                    (n.type === "change_request_pending" ||
                      n.type === "extra_bet_pending" ||
                      n.type === "entry_pending");

                  return (
                    <li
                      key={n.id}
                      className={cn("px-4 py-3 space-y-2", !n.read_at && "bg-accent/5")}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-white leading-snug">{n.title}</p>
                        {!n.read_at && (
                          <span className="w-2 h-2 rounded-full bg-accent shrink-0 mt-1.5" />
                        )}
                      </div>
                      <p className="text-xs text-muted leading-relaxed">{n.body}</p>
                      <p className="text-[10px] text-muted/70">{formatTime(n.created_at)}</p>

                      {isAdminActionable && n.type === "change_request_pending" && (
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleApproveChange(n, p)}
                            disabled={approveCr.isPending}
                            className="flex-1 text-xs py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 font-medium"
                          >
                            Aprobar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectTarget(n);
                              setRejectNotes("");
                            }}
                            className="flex-1 text-xs py-1.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 font-medium"
                          >
                            Rechazar
                          </button>
                        </div>
                      )}

                      {isAdminActionable && n.type === "extra_bet_pending" && (
                        <button
                          type="button"
                          onClick={() => handleConfirmExtra(n, p)}
                          disabled={confirmExtra.isPending}
                          className="w-full text-xs py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 font-medium"
                        >
                          Confirmar pago extra
                        </button>
                      )}

                      {isAdminActionable && n.type === "entry_pending" && (
                        <button
                          type="button"
                          onClick={() => handleConfirmEntry(n, p)}
                          disabled={addMember.isPending}
                          className="w-full text-xs py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 font-medium"
                        >
                          Confirmar entrada
                        </button>
                      )}

                      {n.type === "fixture_finished" && (
                        <Link
                          href="/fixtures#culminados"
                          onClick={() => {
                            if (!n.read_at) markRead.mutate(n.id);
                            setOpen(false);
                          }}
                          className="inline-block text-xs text-accent hover:underline"
                        >
                          Ver resultado
                        </Link>
                      )}

                      {n.type === "change_request_resolved" && (
                        <Link
                          href="/my-bets"
                          onClick={() => !n.read_at && markRead.mutate(n.id)}
                          className="inline-block text-xs text-accent hover:underline"
                        >
                          Ver mis apuestas
                        </Link>
                      )}

                      {!isAdminActionable &&
                        n.type !== "change_request_resolved" &&
                        n.type !== "fixture_finished" &&
                        !n.read_at && (
                        <button
                          type="button"
                          onClick={() => markRead.mutate(n.id)}
                          className="text-xs text-muted hover:text-white"
                        >
                          Marcar leida
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {user.is_admin && (
            <div className="px-4 py-2 border-t border-white/10">
              <Link
                href="/admin/requests"
                onClick={() => setOpen(false)}
                className="text-xs text-accent hover:underline"
              >
                Ver todas las solicitudes
              </Link>
            </div>
          )}
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
          <div className="bg-surface rounded-2xl border border-white/10 p-5 max-w-sm w-full space-y-3">
            <h4 className="font-display text-white">Rechazar solicitud</h4>
            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="Motivo (opcional)..."
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm resize-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="flex-1 py-2 rounded-lg border border-white/10 text-muted text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRejectConfirm}
                disabled={rejectCr.isPending}
                className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm font-bold"
              >
                Rechazar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}