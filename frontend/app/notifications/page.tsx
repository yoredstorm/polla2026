"use client";
import { useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/ui/PageShell";
import { HelpSectionTitle } from "@/components/help/HelpSectionTitle";
import { Modal } from "@/components/ui/Modal";
import {
  useNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from "@/hooks/useNotifications";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationAdminActions } from "@/hooks/useNotificationAdminActions";
import { notificationHref, notificationLinkLabel } from "@/lib/notificationLinks";
import {
  NotificationAdminActions,
  isAdminActionableNotification,
} from "@/components/notifications/NotificationAdminActions";
import { cn } from "@/lib/utils";
import type { Notification } from "@/types/api";

function NotificationRow({
  n,
  isAdmin,
  onRead,
  onRejectClick,
}: {
  n: Notification;
  isAdmin: boolean;
  onRead: () => void;
  onRejectClick: (n: Notification) => void;
}) {
  const p = n.payload ?? {};
  const href = notificationHref(n);
  const label = notificationLinkLabel(n);
  const isAdminActionable = isAdminActionableNotification(n, isAdmin);

  return (
    <li
      className={cn(
        "rounded-xl border p-4 space-y-2",
        n.read_at ? "border-white/10 bg-glass opacity-70" : "border-accent/30 bg-accent/5",
      )}
    >
      <p className="font-medium text-white">{n.title}</p>
      <p className="text-sm text-muted">{n.body}</p>
      <p className="text-xs text-muted/60">{new Date(n.created_at).toLocaleString("es-PE")}</p>

      <NotificationAdminActions
        notification={n}
        payload={p}
        isAdmin={isAdmin}
        layout="stack"
        onRejectClick={onRejectClick}
      />

      <div className="flex flex-wrap gap-3 pt-1">
        {href && (
          <Link href={href} onClick={onRead} className="text-xs text-accent hover:underline font-medium">
            {label} →
          </Link>
        )}
        {!isAdminActionable && !n.read_at && (
          <button type="button" onClick={onRead} className="text-xs text-muted hover:text-white">
            Marcar leida
          </button>
        )}
      </div>
    </li>
  );
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const { data, isLoading } = useNotifications(1, 50);
  const markAll = useMarkAllNotificationsRead();
  const markRead = useMarkNotificationRead();
  const { handleReject, rejectCr } = useNotificationAdminActions();
  const [rejectTarget, setRejectTarget] = useState<Notification | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const items = data?.data ?? [];

  async function handleRejectConfirm() {
    if (!rejectTarget) return;
    await handleReject(rejectTarget, rejectNotes);
    setRejectTarget(null);
    setRejectNotes("");
  }

  return (
    <PageShell maxWidth="md">
      <div className="flex items-center justify-between mb-6">
        <HelpSectionTitle as="h1" helpKey="page.notifications">
          Notificaciones
        </HelpSectionTitle>
        {items.some((n) => !n.read_at) && (
          <button
            type="button"
            onClick={() => markAll.mutate()}
            className="text-sm text-accent hover:underline"
          >
            Marcar todas leidas
          </button>
        )}
      </div>
      {isLoading && <p className="text-muted">Cargando...</p>}
      <ul className="space-y-3">
        {items.map((n) => (
          <NotificationRow
            key={n.id}
            n={n}
            isAdmin={!!user?.is_admin}
            onRead={() => {
              if (!n.read_at) markRead.mutate(n.id);
            }}
            onRejectClick={(target) => {
              setRejectTarget(target);
              setRejectNotes("");
            }}
          />
        ))}
      </ul>
      {!isLoading && items.length === 0 && (
        <p className="text-muted text-center py-12">No tienes notificaciones.</p>
      )}

      {rejectTarget && (
        <Modal
          open={!!rejectTarget}
          onClose={() => setRejectTarget(null)}
          title="Rechazar solicitud"
          size="sm"
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
              className="flex-1 py-2 rounded-lg border border-white/10 text-muted text-sm"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleRejectConfirm}
              disabled={rejectCr.isPending}
              className="flex-1 py-2 rounded-lg bg-danger text-white text-sm font-bold disabled:opacity-50"
            >
              Rechazar
            </button>
          </div>
        </Modal>
      )}
    </PageShell>
  );
}
