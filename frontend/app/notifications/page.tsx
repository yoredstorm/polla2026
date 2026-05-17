"use client";
import Link from "next/link";
import { Navbar } from "@/components/ui/Navbar";
import {
  useNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from "@/hooks/useNotifications";
import { notificationHref, notificationLinkLabel } from "@/lib/notificationLinks";
import { cn } from "@/lib/utils";
import type { Notification } from "@/types/api";

function NotificationRow({ n, onRead }: { n: Notification; onRead: () => void }) {
  const href = notificationHref(n);
  const label = notificationLinkLabel(n);

  return (
    <li
      className={cn(
        "rounded-xl border p-4",
        n.read_at ? "border-white/10 bg-glass opacity-70" : "border-accent/30 bg-accent/5",
      )}
    >
      <p className="font-medium text-white">{n.title}</p>
      <p className="text-sm text-muted mt-1">{n.body}</p>
      <p className="text-xs text-muted/60 mt-2">{new Date(n.created_at).toLocaleString("es-PE")}</p>
      <div className="flex flex-wrap gap-3 mt-3">
        {href && (
          <Link href={href} onClick={onRead} className="text-xs text-accent hover:underline font-medium">
            {label} →
          </Link>
        )}
        {!n.read_at && (
          <button type="button" onClick={onRead} className="text-xs text-muted hover:text-white">
            Marcar leida
          </button>
        )}
      </div>
    </li>
  );
}

export default function NotificationsPage() {
  const { data, isLoading } = useNotifications(1, 50);
  const markAll = useMarkAllNotificationsRead();
  const markRead = useMarkNotificationRead();
  const items = data?.data ?? [];

  return (
    <div className="min-h-screen page-with-mobile-nav">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-3xl text-white">Notificaciones</h1>
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
              onRead={() => {
                if (!n.read_at) markRead.mutate(n.id);
              }}
            />
          ))}
        </ul>
        {!isLoading && items.length === 0 && (
          <p className="text-muted text-center py-12">No tienes notificaciones.</p>
        )}
      </main>
    </div>
  );
}
