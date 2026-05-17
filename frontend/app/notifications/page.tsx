"use client";
import { Navbar } from "@/components/ui/Navbar";
import { useNotifications, useMarkAllNotificationsRead } from "@/hooks/useNotifications";

export default function NotificationsPage() {
  const { data, isLoading } = useNotifications(1, 50);
  const markAll = useMarkAllNotificationsRead();
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
            <li
              key={n.id}
              className={`rounded-xl border p-4 ${n.read_at ? "border-white/10 bg-glass opacity-70" : "border-accent/30 bg-accent/5"}`}
            >
              <p className="font-medium text-white">{n.title}</p>
              <p className="text-sm text-muted mt-1">{n.body}</p>
              <p className="text-xs text-muted/60 mt-2">
                {new Date(n.created_at).toLocaleString("es-PE")}
              </p>
            </li>
          ))}
        </ul>
        {!isLoading && items.length === 0 && (
          <p className="text-muted text-center py-12">No tienes notificaciones.</p>
        )}
      </main>
    </div>
  );
}
