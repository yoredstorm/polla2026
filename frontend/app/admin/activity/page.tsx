"use client";
import { useState } from "react";
import { useAuditLog, type AuditEntry } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";

const ACTION_FILTERS: { value: string | undefined; label: string }[] = [
  { value: undefined, label: "Todos" },
  { value: "register", label: "Registro" },
  { value: "login", label: "Login" },
  { value: "logout", label: "Logout" },
  { value: "change_password", label: "Contraseña" },
  { value: "bet_create", label: "Apuestas" },
  { value: "bulk_copy", label: "Copia masiva" },
  { value: "bet_change_request", label: "Solicitud cambio" },
  { value: "admin_confirm_entry", label: "Confirmar entrada" },
  { value: "admin_confirm_extra", label: "Confirmar extra" },
  { value: "admin_approve_change_request", label: "Aprobar solicitud" },
  { value: "admin_reject_change_request", label: "Rechazar solicitud" },
  { value: "admin_edit_fixture", label: "Editar partido" },
  { value: "admin_settle", label: "Liquidar" },
];

const ACTION_COLORS: Record<string, string> = {
  register: "bg-green-500/20 text-green-400",
  login: "bg-blue-500/20 text-blue-400",
  logout: "bg-gray-500/20 text-gray-400",
  change_password: "bg-yellow-500/20 text-yellow-400",
  bet_create: "bg-purple-500/20 text-purple-400",
  bet_extra: "bg-purple-500/20 text-purple-400",
  bulk_copy: "bg-pink-500/20 text-pink-400",
  bet_change_request: "bg-cyan-500/20 text-cyan-400",
  admin_confirm_entry: "bg-emerald-500/20 text-emerald-400",
  admin_confirm_extra: "bg-emerald-500/20 text-emerald-400",
  admin_approve_change_request: "bg-emerald-500/20 text-emerald-400",
  admin_reject_change_request: "bg-red-500/20 text-red-400",
  admin_edit_fixture: "bg-orange-500/20 text-orange-400",
  admin_settle: "bg-red-500/20 text-red-400",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function DetailSnippet({ detail }: { detail: string | null }) {
  if (!detail) return <span className="text-muted">—</span>;
  try {
    const obj = JSON.parse(detail);
    const entries = Object.entries(obj).slice(0, 4);
    return (
      <span className="text-xs text-muted break-all">
        {entries.map(([k, v]) => `${k}: ${v}`).join(" · ")}
      </span>
    );
  } catch {
    return <span className="text-xs text-muted break-all">{detail.slice(0, 120)}</span>;
  }
}

export default function ActivityPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState<string | undefined>(undefined);
  const { data, isLoading } = useAuditLog(page, 50, actionFilter);

  const logs = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl text-accent">Registro de Actividad</h2>

      <div className="flex flex-wrap gap-2">
        {ACTION_FILTERS.map((f) => (
          <button
            key={f.value ?? "all"}
            onClick={() => { setActionFilter(f.value); setPage(1); }}
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
                <th className="px-4 py-3 font-medium">Detalle</th>
                <th className="px-4 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((entry: AuditEntry) => (
                <tr key={entry.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                    {formatDate(entry.created_at)}
                  </td>
                  <td className="px-4 py-3 font-medium text-white">
                    {entry.username ?? "Sistema"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-medium",
                        ACTION_COLORS[entry.action] ?? "bg-white/10 text-white",
                      )}
                    >
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <DetailSnippet detail={entry.detail} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{entry.ip_address ?? "—"}</td>
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
