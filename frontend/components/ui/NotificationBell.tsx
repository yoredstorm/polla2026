"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import {
  useNotifications,
  useUnreadCount,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from "@/hooks/useNotifications";
import { useNotificationAdminActions } from "@/hooks/useNotificationAdminActions";
import { useRealtimeSync } from "@/components/RealtimeSyncProvider";
import type { Notification } from "@/types/api";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { NotificationItem } from "@/components/notifications/NotificationItem";

export function NotificationBell() {
  const { user } = useAuth();
  const { wsConnected } = useRealtimeSync();
  const [open, setOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<Notification | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  const { data: notifPage } = useNotifications(1, 20, "unread");
  const { data: unreadData } = useUnreadCount(!!user);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const { handleReject, rejectCr, rejectPasswordReset } = useNotificationAdminActions();

  const unread = unreadData?.count ?? 0;
  const notifications = notifPage?.data ?? [];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleRejectConfirm() {
    if (!rejectTarget) return;
    await handleReject(rejectTarget, rejectNotes);
    setRejectTarget(null);
    setRejectNotes("");
  }

  if (!user) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        data-help-tour="notifications"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg text-muted hover:text-white hover:bg-white/5 transition-colors"
        aria-label="Notificaciones"
      >
        <span
          className={cn(
            "absolute bottom-1 left-1 w-2 h-2 rounded-full border border-surface",
            wsConnected ? "bg-accent" : "bg-amber-500 animate-pulse",
          )}
          title={wsConnected ? "En vivo" : "Reconectando…"}
        />
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
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs text-muted hover:text-accent mr-2"
            >
              Ver todas
            </Link>
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
              <p className="text-muted text-sm text-center py-10">No tienes avisos nuevos</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {notifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    isAdmin={!!user.is_admin}
                    layout="bell"
                    onRead={() => {
                      if (!n.read_at) markRead.mutate(n.id);
                    }}
                    onRejectClick={(target) => {
                      setRejectTarget(target);
                      setRejectNotes("");
                    }}
                    onNavigate={() => setOpen(false)}
                  />
                ))}
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
        <Modal
          open={!!rejectTarget}
          onClose={() => setRejectTarget(null)}
          title="Rechazar solicitud"
          size="sm"
          overlayClassName="z-[60]"
        >
          <textarea
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder="Motivo (opcional)..."
            rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm resize-none focus-ring mb-3"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              className="flex-1 py-2 rounded-lg border border-white/10 text-muted text-sm cursor-pointer focus-ring"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleRejectConfirm}
              disabled={
                rejectCr.isPending ||
                (rejectTarget?.type === "password_reset_pending" && rejectPasswordReset.isPending)
              }
              className="flex-1 py-2 rounded-lg bg-danger text-white text-sm font-bold cursor-pointer focus-ring disabled:opacity-50"
            >
              Rechazar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
