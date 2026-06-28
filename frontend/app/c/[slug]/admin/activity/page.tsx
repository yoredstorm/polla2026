"use client";

import { useState } from "react";
import { useCompetitionSlug } from "@/components/providers/CompetitionProvider";
import { useCompetitionAdminAuditLog } from "@/hooks/useCompetitionAdmin";
import type { AuditEntry } from "@/hooks/useAdmin";
import { StaggerItem } from "@/components/ui/StaggerItem";
import { cn } from "@/lib/utils";

const ACTION_FILTERS: { value: string | undefined; label: string }[] = [
  { value: undefined, label: "Todos" },
  { value: "bet_create", label: "Nueva apuesta" },
  { value: "bet_change_request", label: "Solicitud de cambio" },
  { value: "admin_confirm_entry", label: "Confirmar entrada" },
  { value: "admin_confirm_extra", label: "Confirmar extra" },
  { value: "admin_approve_change_request", label: "Aprobar solicitud" },
  { value: "admin_reject_change_request", label: "Rechazar solicitud" },
  { value: "admin_edit_fixture", label: "Editar partido" },
  { value: "admin_settle", label: "Liquidar partido" },
  { value: "admin_member_removed", label: "Miembro eliminado" },
  { value: "admin_patch_group", label: "Editar polla" },
  { value: "challenge_created", label: "Reto creado" },
  { value: "challenge_settled", label: "Reto liquidado" },
  { value: "entry_proof_uploaded", label: "Comprobante subido" },
];

const ACTION_COLORS: Record<string, string> = {
  bet_create: "bg-purple-500/20 text-purple-400",
  bet_change_request: "bg-cyan-500/20 text-cyan-400",
  admin_confirm_entry: "bg-emerald-500/20 text-emerald-400",
  admin_confirm_extra: "bg-emerald-500/20 text-emerald-400",
  admin_approve_change_request: "bg-emerald-500/20 text-emerald-400",
  admin_reject_change_request: "bg-red-500/20 text-red-400",
  admin_edit_fixture: "bg-orange-500/20 text-orange-400",
  admin_settle: "bg-red-500/20 text-red-400",
  admin_member_removed: "bg-red-500/15 text-red-300",
  admin_patch_group: "bg-sky-500/20 text-sky-300",
  challenge_created: "bg-orange-500/20 text-orange-300",
  challenge_settled: "bg-violet-500/20 text-violet-300",
  entry_proof_uploaded: "bg-cyan-500/20 text-cyan-300",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function DetailCell({
  entry,
  expanded,
  onToggle,
}: {
  entry: AuditEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const summary = entry.detail_summary?.trim();
  const hasRaw = !!entry.detail && entry.detail.length > 0;

  return (
    <div className="space-y-1">
      {summary ? (
        <p className="text-xs text-muted leading-relaxed">{summary}</p>
      ) : !hasRaw ? (
        <span className="text-muted">—</span>
      ) : null}
      {hasRaw && (
        <button type="button" onClick={onToggle} className="text-[10px] text-accent hover:underline">
          {expanded ? "Ocultar JSON" : "Ver JSON"}
        </button>
      )}
      {expanded && hasRaw && (
        <pre className="text-[10px] text-muted/90 bg-black/30 rounded-lg p-2 overflow-x-auto max-h-40 font-mono whitespace-pre-wrap break-all">
          {entry.detail}
        </pre>
      )}
    </div>
  );
}

export default function CompetitionAdminActivityPage() {
  const slug = useCompetitionSlug();
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState<string | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading } = useCompetitionAdminAuditLog(page, 50, actionFilter, slug);

  const logs = (data?.data ?? []) as AuditEntry[];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-white">Actividad</h1>
        <p className="text-sm text-muted mt-1">
          Registro de acciones en esta competencia (apuestas, admin, retos, pagos).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {ACTION_FILTERS.map((f) => (
          <button
            key={f.value ?? "all"}
            type="button"
            onClick={() => {
              setActionFilter(f.value);
              setPage(1);
            }}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              actionFilter === f.value
                ? "bg-accent/20 text-accent border-accent/40"
                : "bg-white/5 text-muted border-white/10 hover:border-white/30",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-muted py-8 text-center">Cargando actividad...</p>
      ) : logs.length === 0 ? (
        <p className="text-muted py-8 text-center">Sin registros para esta competencia.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-muted">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Usuario</th>
                <th className="px-4 py-3 font-medium">Acción</th>
                <th className="px-4 py-3 font-medium min-w-[280px]">Detalle</th>
                <th className="px-4 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((entry, i) => (
                <StaggerItem
                  key={entry.id}
                  as="tr"
                  index={Math.min(i, 12)}
                  className="border-b border-white/5 hover:bg-white/5 align-top"
                >
                  <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                    {formatDate(entry.created_at)}
                  </td>
                  <td className="px-4 py-3 font-medium text-white whitespace-nowrap">
                    {entry.username ?? "Sistema"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-medium",
                        ACTION_COLORS[entry.action] ?? "bg-white/10 text-white",
                      )}
                    >
                      {entry.action_label ?? entry.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-md">
                    <DetailCell
                      entry={entry}
                      expanded={expandedId === entry.id}
                      onToggle={() =>
                        setExpandedId((id) => (id === entry.id ? null : entry.id))
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                    {entry.ip_address ?? "—"}
                  </td>
                </StaggerItem>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.total_pages > 1 && (
        <div className="flex justify-center gap-2 pt-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1.5 rounded-lg text-xs bg-white/5 text-muted border border-white/10 disabled:opacity-30"
          >
            ← Anterior
          </button>
          <span className="px-3 py-1.5 text-xs text-muted">
            Página {page} de {pagination.total_pages}
          </span>
          <button
            type="button"
            disabled={page >= pagination.total_pages}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1.5 rounded-lg text-xs bg-white/5 text-muted border border-white/10 disabled:opacity-30"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
