"use client";
import { useState } from "react";
import { useAuditLog, type AuditEntry, downloadAuditLogCsv } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";

const ACTION_FILTERS: { value: string | undefined; label: string }[] = [
  { value: undefined, label: "Todos" },
  { value: "register", label: "Registro" },
  { value: "login", label: "Inicio de sesión" },
  { value: "logout", label: "Cierre de sesión" },
  { value: "change_password", label: "Contraseña" },
  { value: "bet_create", label: "Nueva apuesta" },
  { value: "bulk_copy", label: "Copia masiva" },
  { value: "bet_change_request", label: "Solicitud de cambio" },
  { value: "challenge_created", label: "Reto creado" },
  { value: "challenge_accepted", label: "Reto aceptado" },
  { value: "challenge_rejected", label: "Reto rechazado" },
  { value: "challenge_settled", label: "Reto liquidado" },
  { value: "challenge_points_transferred", label: "Pts retos transferidos" },
  { value: "admin_confirm_entry", label: "Confirmar entrada" },
  { value: "entry_proof_uploaded", label: "Comprobante subido" },
  { value: "admin_confirm_extra", label: "Confirmar extra" },
  { value: "admin_approve_change_request", label: "Aprobar solicitud" },
  { value: "admin_reject_change_request", label: "Rechazar solicitud" },
  { value: "change_request_auto_expired", label: "Solicitudes caducadas" },
  { value: "admin_edit_fixture", label: "Editar partido" },
  { value: "admin_settle", label: "Liquidar partido" },
  { value: "admin_member_removed", label: "Miembro eliminado" },
  { value: "admin_patch_group", label: "Editar polla" },
  { value: "admin_repair_challenge_ranking", label: "Reparar ranking retos" },
  { value: "profile_visibility_changed", label: "Privacidad perfil" },
  { value: "fixture_betting_closed_snapshot", label: "Cierre apuestas (tendencia)" },
  { value: "comment_created", label: "Comentario" },
  { value: "comment_deleted", label: "Comentario eliminado" },
  { value: "comment_hidden", label: "Comentario oculto" },
  { value: "reaction_set", label: "Reaccion" },
  { value: "reaction_cleared", label: "Reaccion quitada" },
  { value: "social_follow", label: "Seguir" },
  { value: "social_unfollow", label: "Dejar de seguir" },
  { value: "social_spam_muted", label: "Silencio spam" },
  { value: "avatar_updated", label: "Avatar" },
];

const ACTION_COLORS: Record<string, string> = {
  register: "bg-green-500/20 text-green-400",
  login: "bg-blue-500/20 text-blue-400",
  logout: "bg-gray-500/20 text-gray-400",
  change_password: "bg-yellow-500/20 text-yellow-400",
  bet_create: "bg-purple-500/20 text-purple-400",
  bulk_copy: "bg-pink-500/20 text-pink-400",
  bet_change_request: "bg-cyan-500/20 text-cyan-400",
  challenge_created: "bg-orange-500/20 text-orange-300",
  challenge_accepted: "bg-emerald-500/20 text-emerald-300",
  challenge_rejected: "bg-red-500/20 text-red-300",
  challenge_settled: "bg-violet-500/20 text-violet-300",
  challenge_points_transferred: "bg-violet-500/15 text-violet-200",
  admin_confirm_entry: "bg-emerald-500/20 text-emerald-400",
  entry_proof_uploaded: "bg-cyan-500/20 text-cyan-300",
  admin_confirm_extra: "bg-emerald-500/20 text-emerald-400",
  admin_approve_change_request: "bg-emerald-500/20 text-emerald-400",
  admin_reject_change_request: "bg-red-500/20 text-red-400",
  change_request_auto_expired: "bg-zinc-500/20 text-zinc-300",
  admin_edit_fixture: "bg-orange-500/20 text-orange-400",
  admin_settle: "bg-red-500/20 text-red-400",
  admin_member_removed: "bg-red-500/15 text-red-300",
  admin_patch_group: "bg-sky-500/20 text-sky-300",
  admin_repair_challenge_ranking: "bg-amber-500/20 text-amber-300",
  profile_visibility_changed: "bg-indigo-500/20 text-indigo-300",
  fixture_betting_closed_snapshot: "bg-zinc-500/20 text-zinc-300",
  comment_created: "bg-teal-500/20 text-teal-300",
  comment_deleted: "bg-red-500/15 text-red-300",
  comment_hidden: "bg-orange-500/15 text-orange-300",
  reaction_set: "bg-pink-500/20 text-pink-300",
  reaction_cleared: "bg-pink-500/10 text-pink-200",
  social_follow: "bg-blue-500/15 text-blue-300",
  social_unfollow: "bg-blue-500/10 text-blue-200",
  social_spam_muted: "bg-red-600/20 text-red-300",
  avatar_updated: "bg-indigo-500/20 text-indigo-300",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function DetailCell({ entry, expanded, onToggle }: { entry: AuditEntry; expanded: boolean; onToggle: () => void }) {
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
        <button
          type="button"
          onClick={onToggle}
          className="text-[10px] text-accent hover:underline"
        >
          {expanded ? "Ocultar JSON" : "Ver JSON"}
        </button>
      )}
      {expanded && hasRaw && (
        <pre className="text-[10px] text-muted/90 bg-black/30 rounded-lg p-2 overflow-x-auto max-h-40 font-mono whitespace-pre-wrap break-all">
          {tryFormatJson(entry.detail!)}
        </pre>
      )}
    </div>
  );
}

function tryFormatJson(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export default function ActivityPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState<string | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const { data, isLoading } = useAuditLog(page, 50, actionFilter);

  const logs = data?.data ?? [];
  const pagination = data?.pagination;

  async function handleExport() {
    setExporting(true);
    try {
      await downloadAuditLogCsv(actionFilter);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl text-accent">Registro de Actividad</h2>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="px-3 py-1.5 rounded-lg text-xs border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-50"
        >
          {exporting ? "Exportando…" : "Exportar CSV"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {ACTION_FILTERS.map((f) => (
          <button
            key={f.value ?? "all"}
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
        <p className="text-muted py-8 text-center">Sin registros</p>
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
              {logs.map((entry: AuditEntry) => (
                <tr key={entry.id} className="border-b border-white/5 hover:bg-white/5 align-top">
                  <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                    {formatDate(entry.created_at)}
                  </td>
                  <td className="px-4 py-3 font-medium text-white whitespace-nowrap">
                    {entry.username ?? "Sistema"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
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
                </tr>
              ))}
            </tbody>
          </table>
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
            Página {page} de {pagination.total_pages}
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
    </div>
  );
}
