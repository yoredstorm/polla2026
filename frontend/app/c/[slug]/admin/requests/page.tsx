"use client";

import { useState } from "react";
import { useCompetitionSlug } from "@/components/providers/CompetitionProvider";
import {
  useCompetitionChangeRequests,
  useCompetitionApproveChangeRequest,
  useCompetitionRejectChangeRequest,
} from "@/hooks/useCompetitionAdmin";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { getAdminResolveClosesAt, isAdminResolveWindowOpen } from "@/lib/matchTiming";
import { FixtureDeadlineCountdown } from "@/components/features/betting/FixtureDeadlineCountdown";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
import type { AdminChangeRequest } from "@/hooks/useAdmin";

const STATUS_FILTERS: { value: string | undefined; label: string }[] = [
  { value: undefined, label: "Todos" },
  { value: "pending", label: "Pendientes" },
  { value: "approved", label: "Aprobadas" },
  { value: "rejected", label: "Rechazadas" },
  { value: "expired", label: "Caducadas" },
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

export default function CompetitionAdminRequestsPage() {
  const slug = useCompetitionSlug();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>("pending");
  const { data, isLoading } = useCompetitionChangeRequests(page, 20, statusFilter, slug);
  const approve = useCompetitionApproveChangeRequest(slug);
  const reject = useCompetitionRejectChangeRequest(slug);
  const toast = useToast((s) => s.add);
  const [rejectModal, setRejectModal] = useState<AdminChangeRequest | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");

  const rows = (data?.data ?? []) as AdminChangeRequest[];

  async function handleApprove(req: AdminChangeRequest) {
    try {
      await approve.mutateAsync({ requestId: req.id });
      toast("Solicitud aprobada", "success");
    } catch {
      toast("No se pudo aprobar", "error");
    }
  }

  async function handleReject() {
    if (!rejectModal) return;
    try {
      await reject.mutateAsync({ requestId: rejectModal.id, admin_notes: rejectNotes || undefined });
      toast("Solicitud rechazada", "success");
      setRejectModal(null);
      setRejectNotes("");
    } catch {
      toast("No se pudo rechazar", "error");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-white">Solicitudes de cambio</h1>
        <p className="text-sm text-muted mt-1">Aprueba o rechaza cambios de pronóstico en esta competencia.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => {
              setStatusFilter(f.value);
              setPage(1);
            }}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm border transition-colors",
              statusFilter === f.value
                ? "border-accent bg-accent/10 text-accent"
                : "border-white/10 text-muted hover:text-white",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-muted">Cargando solicitudes...</p>
      ) : rows.length === 0 ? (
        <p className="text-muted text-sm rounded-xl border border-white/10 bg-glass p-6 text-center">
          No hay solicitudes con este filtro.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((req) => {
            const fixtureTiming = {
              match_date: req.match_date,
              status: req.fixture_status,
              admin_resolve_closes_at: req.admin_resolve_closes_at ?? null,
            };
            const canResolve = isAdminResolveWindowOpen(fixtureTiming);
            return (
              <li
                key={req.id}
                className="rounded-xl border border-white/10 bg-glass p-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <UserDisplayName
                      username={req.username}
                      firstName={req.first_name}
                      lastName={req.last_name}
                    />
                    <p className="text-sm text-white mt-1">
                      {req.home_team} vs {req.away_team}
                    </p>
                    <p className="text-xs text-muted mt-1">
                      {req.original_home}–{req.original_away} →{" "}
                      <span className="text-accent">
                        {req.new_predicted_home_score}–{req.new_predicted_away_score}
                      </span>
                    </p>
                  </div>
                  <span className="text-[10px] uppercase text-muted">{req.status}</span>
                </div>
                {req.status === "pending" && (
                  <FixtureDeadlineCountdown
                    deadlineMs={getAdminResolveClosesAt(fixtureTiming)}
                    label="Ventana admin cierra"
                    compact
                    className="text-xs text-muted"
                  />
                )}
                {req.status === "pending" && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!canResolve || approve.isPending}
                      onClick={() => void handleApprove(req)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 disabled:opacity-40"
                    >
                      Aprobar
                    </button>
                    <button
                      type="button"
                      disabled={!canResolve}
                      onClick={() => setRejectModal(req)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 disabled:opacity-40"
                    >
                      Rechazar
                    </button>
                  </div>
                )}
                <p className="text-[10px] text-muted">{formatDate(req.created_at)}</p>
              </li>
            );
          })}
        </ul>
      )}

      {data && data.pagination.total_pages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: data.pagination.total_pages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPage(p)}
              className={cn(
                "w-8 h-8 rounded-lg text-sm",
                page === p ? "bg-accent text-background" : "text-muted hover:bg-white/10",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <Modal open={!!rejectModal} onClose={() => setRejectModal(null)} title="Rechazar solicitud">
        <textarea
          value={rejectNotes}
          onChange={(e) => setRejectNotes(e.target.value)}
          placeholder="Notas opcionales para el usuario"
          className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white min-h-[80px]"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={() => setRejectModal(null)}
            className="text-sm px-4 py-2 rounded-lg border border-white/10 text-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleReject()}
            disabled={reject.isPending}
            className="text-sm px-4 py-2 rounded-lg bg-red-500/20 text-red-300"
          >
            Rechazar
          </button>
        </div>
      </Modal>
    </div>
  );
}
