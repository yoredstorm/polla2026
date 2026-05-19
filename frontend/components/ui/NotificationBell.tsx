"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import {
  useNotifications,
  useUnreadCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/hooks/useNotifications";
import { useNotificationAdminActions } from "@/hooks/useNotificationAdminActions";
import { useRealtimeSync } from "@/components/RealtimeSyncProvider";
import type { Notification } from "@/types/api";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { notificationHref, notificationLinkLabel } from "@/lib/notificationLinks";
import {
  NotificationAdminActions,
  isAdminActionableNotification,
} from "@/components/notifications/NotificationAdminActions";

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
  const { wsConnected } = useRealtimeSync();
  const [open, setOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<Notification | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  const { data: notifPage } = useNotifications(1, 30);
  const { data: unreadData } = useUnreadCount(!!user);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const { handleReject, rejectCr } = useNotificationAdminActions();

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
            <Link href="/notifications" className="text-xs text-muted hover:text-accent mr-2">
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
              <p className="text-muted text-sm text-center py-10">Sin notificaciones</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {notifications.map((n) => {
                  const p = n.payload ?? {};
                  const isAdminActionable = isAdminActionableNotification(n, !!user.is_admin);

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

                      <NotificationAdminActions
                        notification={n}
                        payload={p}
                        isAdmin={!!user.is_admin}
                        onRejectClick={(target) => {
                          setRejectTarget(target);
                          setRejectNotes("");
                        }}
                      />

                      {n.type === "change_request_expired" && (
                        <Link
                          href="/my-bets"
                          onClick={() => {
                            if (!n.read_at) markRead.mutate(n.id);
                            setOpen(false);
                          }}
                          className="inline-block text-xs text-accent hover:underline"
                        >
                          Ver mis apuestas
                        </Link>
                      )}

                      {n.type === "change_request_expired_batch" && user.is_admin && (
                        <Link
                          href="/admin/requests"
                          onClick={() => {
                            if (!n.read_at) markRead.mutate(n.id);
                            setOpen(false);
                          }}
                          className="inline-block text-xs text-accent hover:underline"
                        >
                          Ver solicitudes
                        </Link>
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
                          href="/my-bets?tab=pronosticos"
                          onClick={() => !n.read_at && markRead.mutate(n.id)}
                          className="inline-block text-xs text-accent hover:underline"
                        >
                          Ver mis apuestas
                        </Link>
                      )}

                      {(n.type === "badge_earned" ||
                        n.type === "challenge_pending" ||
                        n.type === "challenge_accepted" ||
                        n.type === "challenge_settled") &&
                        notificationHref(n) && (
                        <Link
                          href={notificationHref(n)!}
                          onClick={() => {
                            if (!n.read_at) markRead.mutate(n.id);
                            setOpen(false);
                          }}
                          className="inline-block text-xs text-accent hover:underline"
                        >
                          {notificationLinkLabel(n)} →
                        </Link>
                      )}

                      {!isAdminActionable &&
                        n.type !== "change_request_resolved" &&
                        n.type !== "change_request_expired" &&
                        n.type !== "change_request_expired_batch" &&
                        n.type !== "fixture_finished" &&
                        n.type !== "badge_earned" &&
                        n.type !== "challenge_pending" &&
                        n.type !== "challenge_accepted" &&
                        n.type !== "challenge_settled" &&
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
              disabled={rejectCr.isPending}
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
