"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { HelpSectionTitle } from "@/components/features/help/HelpSectionTitle";
import { Modal } from "@/components/ui/Modal";
import {
  useNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  type NotificationFilter,
  type NotificationCategory,
} from "@/hooks/useNotifications";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationAdminActions } from "@/hooks/useNotificationAdminActions";
import { NotificationItem } from "@/components/features/notifications/NotificationItem";
import { cn } from "@/lib/utils";
import type { Notification } from "@/types/api";
import { QueryState } from "@/components/ui/QueryState";

const TABS: { id: NotificationFilter; label: string }[] = [
  { id: "unread", label: "Nuevas" },
  { id: "read", label: "Leídas" },
  { id: "all", label: "Todas" },
];

const CATEGORIES: { id: NotificationCategory; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "challenges", label: "Retos" },
  { id: "fixtures", label: "Partidos" },
  { id: "social", label: "Social" },
  { id: "admin", label: "Admin" },
  { id: "system", label: "Sistema" },
];

function NotificationsPageContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const focusRef = useRef<HTMLLIElement | null>(null);
  const [tab, setTab] = useState<NotificationFilter>(focusId ? "all" : "unread");
  const [category, setCategory] = useState<NotificationCategory>("all");
  const [page, setPage] = useState(1);
  const limit = 20;
  const { data, isLoading, isError, refetch } = useNotifications(page, limit, tab, category);
  const markAll = useMarkAllNotificationsRead();
  const markRead = useMarkNotificationRead();
  const { handleReject, rejectCr, rejectPasswordReset } = useNotificationAdminActions();
  const [rejectTarget, setRejectTarget] = useState<Notification | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const items = data?.data ?? [];
  const pagination = data?.pagination;

  async function handleRejectConfirm() {
    if (!rejectTarget) return;
    await handleReject(rejectTarget, rejectNotes);
    setRejectTarget(null);
    setRejectNotes("");
  }

  function switchTab(next: NotificationFilter) {
    setTab(next);
    setPage(1);
  }

  function switchCategory(next: NotificationCategory) {
    setCategory(next);
    setPage(1);
  }

  useEffect(() => {
    if (!focusId || isLoading) return;
    const el = document.getElementById(`notification-${focusId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusId, isLoading, items]);

  return (
    <PageShell maxWidth="md">
      <div className="flex items-center justify-between mb-4">
        <HelpSectionTitle as="h1" helpKey="page.notifications">
          Notificaciones
        </HelpSectionTitle>
        {tab === "unread" && items.some((n) => !n.read_at) && (
          <button
            type="button"
            onClick={() => markAll.mutate()}
            className="text-sm text-accent hover:underline"
          >
            Marcar todas leídas
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-4 border-b border-white/10 pb-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => switchTab(t.id)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer",
              tab === t.id
                ? "bg-accent/20 text-accent"
                : "text-muted hover:text-white",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => switchCategory(c.id)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer",
              category === c.id
                ? "bg-white/15 text-white border border-white/20"
                : "text-muted border border-transparent hover:text-white",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <QueryState
        isLoading={isLoading}
        isError={isError}
        isEmpty={false}
        onRetry={() => refetch()}
        errorMessage="No se pudieron cargar las notificaciones."
        loadingSlot={<p className="text-muted">Cargando...</p>}
      >
      <ul className="space-y-3">
        {items.map((n) => (
          <li
            key={n.id}
            id={`notification-${n.id}`}
            ref={n.id === focusId ? focusRef : undefined}
            className={cn(
              n.id === focusId && "rounded-xl ring-2 ring-accent/50 ring-offset-2 ring-offset-background",
            )}
          >
          <NotificationItem
            notification={n}
            isAdmin={!!user?.is_admin}
            layout="page"
            onRead={() => {
              if (!n.read_at) markRead.mutate(n.id);
            }}
            onRejectClick={(target) => {
              setRejectTarget(target);
              setRejectNotes("");
            }}
          />
          </li>
        ))}
      </ul>

      {!items.length && (
        <p className="text-muted text-center py-12">
          {tab === "unread"
            ? "No tienes avisos nuevos."
            : "No hay notificaciones leídas."}
        </p>
      )}
      </QueryState>

      {pagination && pagination.total_pages > 1 && (
        <div className="flex justify-center gap-3 mt-6">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="text-sm text-muted hover:text-white disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-sm text-muted">
            {page} / {pagination.total_pages}
          </span>
          <button
            type="button"
            disabled={page >= pagination.total_pages}
            onClick={() => setPage((p) => p + 1)}
            className="text-sm text-muted hover:text-white disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
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
              disabled={
                rejectCr.isPending ||
                (rejectTarget?.type === "password_reset_pending" && rejectPasswordReset.isPending)
              }
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

export default function NotificationsPage() {
  return (
    <Suspense fallback={<PageShell maxWidth="md"><p className="text-muted text-center py-20">Cargando...</p></PageShell>}>
      <NotificationsPageContent />
    </Suspense>
  );
}
