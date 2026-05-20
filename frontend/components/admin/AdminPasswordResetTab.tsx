"use client";
import { useState } from "react";
import {
  useAdminPasswordResetRequests,
  useResolvePasswordResetRequest,
  useRejectPasswordResetRequest,
  usePendingPasswordResetCount,
  type AdminPasswordResetRequest,
} from "@/hooks/useAdmin";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { UserDisplayName } from "@/components/ui/UserDisplayName";

const STATUS_FILTERS: { value: string | undefined; label: string }[] = [
  { value: undefined, label: "Todos" },
  { value: "pending", label: "Pendientes" },
  { value: "resolved", label: "Resueltas" },
  { value: "rejected", label: "Rechazadas" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminPasswordResetTab() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>("pending");
  const { data, isLoading } = useAdminPasswordResetRequests(page, 20, statusFilter);
  const { data: pendingCount } = usePendingPasswordResetCount();
  const resolve = useResolvePasswordResetRequest();
  const reject = useRejectPasswordResetRequest();
  const toast = useToast((s) => s.add);

  const [rejectModal, setRejectModal] = useState<AdminPasswordResetRequest | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [tempPasswordModal, setTempPasswordModal] = useState<string | null>(null);
  const [resolveTarget, setResolveTarget] = useState<AdminPasswordResetRequest | null>(null);

  async function handleResolve(req: AdminPasswordResetRequest) {
    try {
      const result = await resolve.mutateAsync({ requestId: req.id });
      setTempPasswordModal(result.temporary_password);
      setResolveTarget(null);
      toast("Contraseña temporal generada. Entrégala al usuario.", "success");
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "error" in e
          ? String((e as { error?: { message?: string } }).error?.message ?? "")
          : "";
      toast(msg || "Error al generar contraseña temporal", "error");
    }
  }

  async function handleReject() {
    if (!rejectModal) return;
    try {
      await reject.mutateAsync({
        requestId: rejectModal.id,
        admin_notes: rejectNotes || undefined,
      });
      toast("Solicitud rechazada", "info");
      setRejectModal(null);
      setRejectNotes("");
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "error" in e
          ? String((e as { error?: { message?: string } }).error?.message ?? "")
          : "";
      toast(msg || "Error al rechazar solicitud", "error");
    }
  }

  const rows = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        El usuario debe iniciar sesión con la contraseña temporal y elegir una nueva al entrar.
        {(pendingCount?.count ?? 0) > 0 && (
          <span className="ml-2 text-amber-300">{pendingCount?.count} pendiente(s)</span>
        )}
      </p>

      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value ?? "all"}
            onClick={() => {
              setStatusFilter(f.value);
              setPage(1);
            }}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              statusFilter === f.value
                ? "bg-accent/20 text-accent border-accent/40"
                : "bg-white/5 text-muted border-white/10 hover:border-white/30",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-muted py-8 text-center">Cargando solicitudes...</p>
      ) : rows.length === 0 ? (
        <p className="text-muted py-8 text-center">Sin solicitudes de contraseña</p>
      ) : (
        <div className="space-y-3">
          {rows.map((req) => (
            <div
              key={req.id}
              className={cn(
                "rounded-xl border p-4 space-y-3",
                req.status === "pending"
                  ? "border-amber-500/30 bg-amber-500/5"
                  : req.status === "resolved"
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : "border-red-500/20 bg-red-500/5",
              )}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <UserDisplayName
                  username={req.username}
                  firstName={req.first_name}
                  lastName={req.last_name}
                  layout="inline"
                  showUsername
                />
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-medium",
                    req.status === "pending"
                      ? "bg-amber-500/20 text-amber-300"
                      : req.status === "resolved"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-red-500/20 text-red-300",
                  )}
                >
                  {req.status === "pending"
                    ? "Pendiente"
                    : req.status === "resolved"
                      ? "Resuelta"
                      : "Rechazada"}
                </span>
              </div>
              <p className="text-xs text-muted">{formatDate(req.created_at)}</p>
              {req.message && (
                <p className="text-xs text-muted border-l-2 border-white/10 pl-3">{req.message}</p>
              )}
              {req.admin_notes && (
                <p className="text-xs text-amber-200/70 border-l-2 border-amber-500/30 pl-3">
                  Admin: {req.admin_notes}
                </p>
              )}
              {req.status === "pending" && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setResolveTarget(req)}
                    disabled={resolve.isPending}
                    className="text-xs px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors font-medium disabled:opacity-40"
                  >
                    Generar temporal
                  </button>
                  <button
                    onClick={() => {
                      setRejectModal(req);
                      setRejectNotes("");
                    }}
                    disabled={reject.isPending}
                    className="text-xs px-4 py-2 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors font-medium disabled:opacity-40"
                  >
                    Rechazar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {pagination && pagination.total_pages > 1 && (
        <div className="flex justify-center gap-2 pt-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1.5 rounded-lg text-xs bg-white/5 text-muted border border-white/10 disabled:opacity-30"
          >
            ← Anterior
          </button>
          <span className="px-3 py-1.5 text-xs text-muted">
            Pagina {page} de {pagination.total_pages}
          </span>
          <button
            disabled={page >= pagination.total_pages}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1.5 rounded-lg text-xs bg-white/5 text-muted border border-white/10 disabled:opacity-30"
          >
            Siguiente →
          </button>
        </div>
      )}

      {resolveTarget && (
        <Modal
          open={!!resolveTarget}
          onClose={() => setResolveTarget(null)}
          title="Generar contraseña temporal"
          size="sm"
        >
          <p className="text-sm text-muted">
            Se generará una contraseña temporal para{" "}
            <UserDisplayName
              username={resolveTarget.username}
              firstName={resolveTarget.first_name}
              lastName={resolveTarget.last_name}
              layout="inline"
              showUsername
            />
            . El usuario deberá cambiarla al iniciar sesión.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setResolveTarget(null)}
              className="flex-1 py-2.5 rounded-lg border border-white/10 text-muted hover:bg-white/5 text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={() => handleResolve(resolveTarget)}
              disabled={resolve.isPending}
              className="flex-1 py-2.5 rounded-lg bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-400 disabled:opacity-50"
            >
              {resolve.isPending ? "Generando..." : "Confirmar"}
            </button>
          </div>
        </Modal>
      )}

      {rejectModal && (
        <Modal
          open={!!rejectModal}
          onClose={() => setRejectModal(null)}
          title="Rechazar solicitud"
          size="sm"
        >
          <textarea
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder="Nota (opcional)..."
            rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm resize-none"
          />
          <div className="flex gap-3">
            <button
              onClick={() => setRejectModal(null)}
              className="flex-1 py-2.5 rounded-lg border border-white/10 text-muted text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleReject}
              disabled={reject.isPending}
              className="flex-1 py-2.5 rounded-lg bg-red-500 text-white font-bold text-sm disabled:opacity-50"
            >
              {reject.isPending ? "..." : "Rechazar"}
            </button>
          </div>
        </Modal>
      )}

      {tempPasswordModal && (
        <Modal
          open={!!tempPasswordModal}
          onClose={() => setTempPasswordModal(null)}
          title="Contraseña temporal"
          size="sm"
        >
          <p className="text-xs text-muted mb-2">
            Cópiala y entrégala al usuario por un canal seguro. Solo se muestra una vez.
          </p>
          <p className="font-mono text-lg text-white break-all select-all bg-black/40 rounded-lg p-4 border border-accent/30">
            {tempPasswordModal}
          </p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(tempPasswordModal);
              toast("Copiada al portapapeles", "success");
            }}
            className="text-sm text-accent hover:underline"
          >
            Copiar
          </button>
        </Modal>
      )}
    </div>
  );
}
