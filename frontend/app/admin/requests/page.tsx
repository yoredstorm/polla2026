"use client";
import { useState } from "react";
import {
  useAdminChangeRequests,
  useApproveChangeRequest,
  useRejectChangeRequest,
  usePendingChangeRequestCount,
  usePendingPasswordResetCount,
  type AdminChangeRequest,
} from "@/hooks/useAdmin";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { getAdminResolveClosesAt, isAdminResolveWindowOpen } from "@/lib/matchTiming";
import { FixtureDeadlineCountdown } from "@/components/betting/FixtureDeadlineCountdown";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
import { AdminPasswordResetTab } from "@/components/admin/AdminPasswordResetTab";

const STATUS_FILTERS: { value: string | undefined; label: string }[] = [
  { value: undefined, label: "Todos" },
  { value: "pending", label: "Pendientes" },
  { value: "approved", label: "Aprobadas" },
  { value: "rejected", label: "Rechazadas" },
  { value: "expired", label: "Caducadas" },
];

type TabId = "bets" | "passwords";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function BetChangeRequestsPanel() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>("pending");
  const { data, isLoading } = useAdminChangeRequests(page, 20, statusFilter);
  const approve = useApproveChangeRequest();
  const reject = useRejectChangeRequest();
  const toast = useToast((s) => s.add);

  const [rejectModal, setRejectModal] = useState<AdminChangeRequest | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");

  async function handleApprove(req: AdminChangeRequest) {
    try {
      await approve.mutateAsync({ requestId: req.id });
      toast(
        req.request_type === "modify"
          ? `Apuesta modificada: ${req.new_predicted_home_score} – ${req.new_predicted_away_score}`
          : "Apuesta eliminada correctamente",
        "success",
      );
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "error" in e
          ? String((e as { error?: { message?: string } }).error?.message ?? "")
          : "";
      toast(msg || "Error al aprobar solicitud", "error");
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
    <>
      <p className="text-sm text-muted">
        Usuarios solicitan modificar o eliminar sus apuestas. Aprueba o rechaza cada solicitud.
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
        <p className="text-muted py-8 text-center">Sin solicitudes</p>
      ) : (
        <div className="space-y-3">
          {rows.map((req) => {
            const fixtureTiming = {
              match_date: req.match_date,
              status: req.fixture_status,
              admin_resolve_closes_at: req.admin_resolve_closes_at ?? null,
            };
            const canAct =
              req.status === "pending" && isAdminResolveWindowOpen(fixtureTiming);
            const pendingButLocked = req.status === "pending" && !canAct;

            return (
              <div
                key={req.id}
                className={cn(
                  "rounded-xl border p-4 space-y-3",
                  req.status === "pending"
                    ? "border-amber-500/30 bg-amber-500/5"
                    : req.status === "approved"
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : req.status === "expired"
                        ? "border-zinc-500/25 bg-zinc-500/5"
                        : "border-red-500/20 bg-red-500/5",
                )}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-sm">
                      {req.home_logo_url && (
                        <img
                          src={req.home_logo_url}
                          alt=""
                          className="w-5 h-3.5 object-cover rounded-sm"
                        />
                      )}
                      <span className="text-white font-medium">{req.home_team}</span>
                      <span className="text-muted text-xs">vs</span>
                      <span className="text-white font-medium">{req.away_team}</span>
                      {req.away_logo_url && (
                        <img
                          src={req.away_logo_url}
                          alt=""
                          className="w-5 h-3.5 object-cover rounded-sm"
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-medium",
                        req.request_type === "modify"
                          ? "bg-blue-500/20 text-blue-300"
                          : "bg-red-500/20 text-red-300",
                      )}
                    >
                      {req.request_type === "modify" ? "Modificar" : "Eliminar"}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-medium",
                        req.status === "pending"
                          ? "bg-amber-500/20 text-amber-300"
                          : req.status === "approved"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : req.status === "expired"
                              ? "bg-zinc-500/25 text-zinc-300"
                              : "bg-red-500/20 text-red-300",
                      )}
                    >
                      {req.status === "pending"
                        ? "Pendiente"
                        : req.status === "approved"
                          ? "Aprobada"
                          : req.status === "expired"
                            ? "Caducada"
                            : "Rechazada"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm flex-wrap">
                  <UserDisplayName
                    username={req.username}
                    firstName={req.first_name}
                    lastName={req.last_name}
                    layout="inline"
                    showUsername
                  />
                  <span className="text-muted text-xs">{formatDate(req.created_at)}</span>
                  <span className="text-muted text-xs">Partido: {formatDate(req.match_date)}</span>
                </div>

                <div className="flex items-center gap-6 text-sm">
                  <div>
                    <span className="text-xs text-muted uppercase tracking-wide">Original</span>
                    <p className="font-display text-lg text-white">
                      {req.original_home} – {req.original_away}
                    </p>
                  </div>
                  {req.request_type === "modify" && (
                    <>
                      <span className="text-muted text-lg">→</span>
                      <div>
                        <span className="text-xs text-muted uppercase tracking-wide">Nuevo</span>
                        <p className="font-display text-lg text-accent">
                          {req.new_predicted_home_score} – {req.new_predicted_away_score}
                        </p>
                      </div>
                    </>
                  )}
                  {parseFloat(req.amount) > 0 && (
                    <div>
                      <span className="text-xs text-muted uppercase tracking-wide">Monto</span>
                      <p className="text-white text-sm font-medium">${req.amount}</p>
                    </div>
                  )}
                </div>

                {req.reason && (
                  <p className="text-xs text-muted border-l-2 border-white/10 pl-3">{req.reason}</p>
                )}

                {req.admin_notes && (
                  <p className="text-xs text-amber-200/70 border-l-2 border-amber-500/30 pl-3">
                    Admin: {req.admin_notes}
                  </p>
                )}

                {req.status === "pending" && canAct && (
                  <FixtureDeadlineCountdown
                    deadlineMs={getAdminResolveClosesAt(fixtureTiming)}
                    label="Debes responder en"
                    className="text-amber-200/90"
                  />
                )}

                {pendingButLocked && (
                  <p className="text-xs text-amber-300/90 border border-amber-500/20 rounded-lg px-3 py-2 bg-amber-500/5">
                    Fuera de plazo: no se puede aprobar ni rechazar (cierra 1 minuto antes del partido).
                  </p>
                )}

                {req.status === "pending" && (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => handleApprove(req)}
                      disabled={approve.isPending || !canAct}
                      className="text-xs px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors font-medium disabled:opacity-40 disabled:pointer-events-none"
                    >
                      {approve.isPending ? "..." : "Aprobar"}
                    </button>
                    <button
                      onClick={() => {
                        setRejectModal(req);
                        setRejectNotes("");
                      }}
                      disabled={reject.isPending || !canAct}
                      className="text-xs px-4 py-2 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors font-medium disabled:opacity-40 disabled:pointer-events-none"
                    >
                      Rechazar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
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

      {rejectModal && (
        <Modal
          open={!!rejectModal}
          onClose={() => setRejectModal(null)}
          title="Rechazar solicitud"
          size="sm"
        >
          <p className="text-sm text-muted">
            Solicitud de{" "}
            <UserDisplayName
              username={rejectModal.username}
              firstName={rejectModal.first_name}
              lastName={rejectModal.last_name}
              layout="inline"
              showUsername
            />{" "}
            para {rejectModal.request_type === "modify" ? "modificar" : "eliminar"} su apuesta.
          </p>
          <textarea
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder="Motivo del rechazo..."
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
              {reject.isPending ? "Rechazando..." : "Confirmar rechazo"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

export default function AdminRequestsPage() {
  const [tab, setTab] = useState<TabId>("bets");
  const { data: betPending } = usePendingChangeRequestCount();
  const { data: pwdPending } = usePendingPasswordResetCount();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-white">Solicitudes</h1>
      </div>

      <div className="flex gap-2 border-b border-white/10 pb-0">
        <button
          type="button"
          onClick={() => setTab("bets")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            tab === "bets"
              ? "border-accent text-accent"
              : "border-transparent text-muted hover:text-white",
          )}
        >
          Apuestas
          {(betPending?.count ?? 0) > 0 && (
            <span className="ml-1.5 text-[10px] bg-amber-500/30 text-amber-200 px-1.5 py-0.5 rounded-full">
              {betPending?.count}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab("passwords")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            tab === "passwords"
              ? "border-accent text-accent"
              : "border-transparent text-muted hover:text-white",
          )}
        >
          Contraseñas
          {(pwdPending?.count ?? 0) > 0 && (
            <span className="ml-1.5 text-[10px] bg-amber-500/30 text-amber-200 px-1.5 py-0.5 rounded-full">
              {pwdPending?.count}
            </span>
          )}
        </button>
      </div>

      {tab === "bets" ? <BetChangeRequestsPanel /> : <AdminPasswordResetTab />}
    </div>
  );
}
