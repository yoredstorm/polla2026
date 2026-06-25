"use client";

import { Trophy, ShieldCheck } from "lucide-react";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
import { cn } from "@/lib/utils";
import type { PhaseWinnerHistoryEntry } from "@/types/api";

const TRANSPARENCY_COPY =
  "Ranking congelado automáticamente al terminar todos los partidos de la fase. Los puntos actuales del ranking son de la fase en curso.";

function formatClosedAt(iso: string) {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PhaseHistoryCard({
  phase,
  currency,
  highlight,
}: {
  phase: PhaseWinnerHistoryEntry;
  currency: string;
  highlight?: boolean;
}) {
  const prizePool =
    phase.phase_prize_pool ?? phase.winner?.prize_pool ?? "0";
  const rows = phase.top_snapshot ?? [];

  return (
    <article
      className={cn(
        "rounded-xl border p-4 space-y-3",
        highlight
          ? "border-lime-500/30 bg-lime-500/5"
          : "border-emerald-500/25 bg-emerald-500/5",
      )}
      aria-labelledby={`phase-history-${phase.phase_key}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden />
          <h3
            id={`phase-history-${phase.phase_key}`}
            className="font-display text-base text-white"
          >
            {phase.label}
          </h3>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-muted">
          Cerrada · {formatClosedAt(phase.closed_at)}
        </span>
      </div>

      {phase.winner ? (
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
              {currency} {parseFloat(prizePool).toFixed(2)}
            </span>
          </p>
          {phase.participant_count != null && phase.participant_count > 0 && (
            <p className="text-xs text-muted">
              {phase.participant_count} participante
              {phase.participant_count === 1 ? "" : "s"} en esta fase
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">Sin ganador registrado para esta fase.</p>
      )}

      {rows.length > 0 && (
        <div className="rounded-lg border border-white/10 overflow-hidden">
          <div className="grid grid-cols-[2.5rem_1fr_4rem] gap-x-2 px-3 py-2 bg-white/[0.04] border-b border-white/10 text-[10px] uppercase tracking-wider text-muted">
            <span>#</span>
            <span>Jugador</span>
            <span className="text-right">Puntos</span>
          </div>
          <ol className="divide-y divide-white/[0.06]" role="list">
            {rows.map((row) => (
              <li
                key={row.user_id}
                className="grid grid-cols-[2.5rem_1fr_4rem] gap-x-2 px-3 py-2 text-sm items-center"
              >
                <span
                  className={cn(
                    "font-display text-center",
                    row.position === 1 ? "text-yellow-400" : "text-muted",
                  )}
                >
                  {row.position}
                </span>
                <UserDisplayName
                  username={row.username}
                  firstName={row.first_name}
                  lastName={row.last_name}
                  className="truncate"
                />
                <span className="text-right font-medium tabular-nums text-white">
                  {row.total_points}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="text-[11px] text-muted flex items-start gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-400/80" aria-hidden />
        {TRANSPARENCY_COPY}
      </p>
    </article>
  );
}

export function PhaseHistoryPanel({
  phases,
  currency = "PEN",
  currentPhaseKey,
  isLoading,
  isError,
  onRetry,
  className,
  title = "Historial de fases",
}: {
  phases: PhaseWinnerHistoryEntry[];
  currency?: string;
  currentPhaseKey?: string | null;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  className?: string;
  title?: string;
}) {
  if (isLoading) {
    return (
      <div className={cn("space-y-3", className)} role="status" aria-label="Cargando historial">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-white/10 bg-white/[0.03] p-4 h-32 animate-pulse motion-reduce:animate-none"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className={cn(
          "rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-center",
          className,
        )}
        role="alert"
      >
        <p className="text-sm text-destructive">No se pudo cargar el historial de fases.</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 text-xs text-accent hover:underline"
          >
            Reintentar
          </button>
        )}
      </div>
    );
  }

  if (!phases.length) {
    return null;
  }

  return (
    <section className={cn("space-y-3", className)} aria-label={title}>
      <h2 className="font-display text-lg text-white">{title}</h2>
      <p className="text-xs text-muted -mt-1">
        Resultados oficiales de fases ya cerradas. Sirve como registro público del torneo.
      </p>
      {phases.map((phase) => (
        <PhaseHistoryCard
          key={phase.phase_key}
          phase={phase}
          currency={currency}
          highlight={
            currentPhaseKey === "knockout" && phase.phase_key === "groups"
          }
        />
      ))}
    </section>
  );
}
