"use client";

import { useAdminPhaseWinners } from "@/hooks/useAdmin";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
import { cn } from "@/lib/utils";
import { Trophy, Clock, CheckCircle2 } from "lucide-react";

const STATUS_STYLES = {
  pending: "border-white/10 bg-white/5 text-muted",
  active: "border-accent/40 bg-accent/10 text-accent",
  closed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
} as const;

export function PhaseWinnersPanel({
  pollaId,
  currency,
}: {
  pollaId: string;
  currency: string;
}) {
  const { data, isLoading, isError } = useAdminPhaseWinners(pollaId);
  const phases = data?.phases ?? [];

  if (isLoading) {
    return <p className="text-sm text-muted">Cargando ganadores por fase...</p>;
  }
  if (isError) {
    return <p className="text-sm text-red-400">No se pudo cargar el historial de fases.</p>;
  }

  return (
    <div className="space-y-3">
      {phases.map((phase) => (
        <div
          key={phase.phase_key}
          className={cn(
            "rounded-xl border p-4 transition-colors",
            STATUS_STYLES[phase.status],
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              {phase.status === "closed" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />
              ) : phase.status === "active" ? (
                <Trophy className="w-4 h-4 shrink-0" aria-hidden />
              ) : (
                <Clock className="w-4 h-4 shrink-0" aria-hidden />
              )}
              <h3 className="font-display text-base text-white">{phase.label}</h3>
            </div>
            <span className="text-xs uppercase tracking-wide">
              {phase.status === "closed"
                ? "Cerrada"
                : phase.status === "active"
                  ? "En curso"
                  : "Pendiente"}
            </span>
          </div>

          <p className="text-xs text-muted mb-2">
            Partidos: {phase.finished_fixtures} / {phase.total_fixtures}
          </p>

          {phase.status === "closed" && phase.winner ? (
            <div className="text-sm space-y-1">
              <p>
                <span className="text-muted">Ganador: </span>
                <span className="text-white font-medium">
                  <UserDisplayName
                    username={phase.winner.username ?? ""}
                    firstName={phase.winner.first_name}
                    lastName={phase.winner.last_name}
                  />
                </span>
                <span className="text-muted"> · {phase.winner.points} pts</span>
              </p>
              <p>
                <span className="text-muted">Pozo de la fase: </span>
                <span className="text-accent font-medium">
                  {currency}{" "}
                  {parseFloat(phase.phase_prize_pool ?? phase.winner.prize_pool).toFixed(2)}
                </span>
              </p>
              {phase.closed_at && (
                <p className="text-[10px] text-muted">
                  Cerrada:{" "}
                  {new Date(phase.closed_at).toLocaleString("es-PE", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
              {phase.top_snapshot.length > 1 && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-muted hover:text-white">
                    Top 3 de la fase (transparencia)
                  </summary>
                  <ol className="mt-1 space-y-0.5 list-decimal list-inside">
                    {phase.top_snapshot.map((row) => (
                      <li key={row.user_id} className="text-muted">
                        {row.username} — {row.total_points} pts
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
          ) : phase.status === "active" ? (
            <p className="text-xs text-muted">
              Al finalizar todos los partidos de esta fase se designará al jugador con más
              puntos y se reiniciarán puntos y pozo para la siguiente.
            </p>
          ) : (
            <p className="text-xs text-muted">Esta fase aún no ha comenzado.</p>
          )}
        </div>
      ))}
    </div>
  );
}
