"use client";

import type { TournamentProgress } from "@/types/api";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
import { cn } from "@/lib/utils";

export function TournamentProgressTimeline({
  progress,
  className,
}: {
  progress: TournamentProgress;
  className?: string;
}) {
  const { total_fixtures, finished_fixtures, phases, phase_winners } = progress;
  const overallPct =
    total_fixtures > 0 ? Math.round((finished_fixtures / total_fixtures) * 100) : 0;

  const winnerByPhase = new Map(
    phase_winners.map((h) => [h.phase_key, h.winner]),
  );

  const milestones = phases.filter((p) => p.milestone_end > 0);
  const maxMilestone = milestones.length ? milestones[milestones.length - 1].milestone_end : total_fixtures;
  const phaseCount = phases.length;
  const gridCols =
    phaseCount <= 1
      ? "grid-cols-1"
      : phaseCount === 2
        ? "grid-cols-2"
        : phaseCount <= 4
          ? "grid-cols-2 sm:grid-cols-4"
          : "grid-cols-2 sm:grid-cols-4 lg:grid-cols-7";

  return (
    <div className={className}>
      <div className="flex justify-between text-xs text-muted mb-2">
        <span>Progreso del torneo</span>
        <span>
          {finished_fixtures} / {total_fixtures} partidos ({overallPct}%)
        </span>
      </div>

      <div className="relative h-3 rounded-full bg-white/10 overflow-hidden mb-3">
        <div
          className="absolute inset-y-0 left-0 bg-accent transition-all duration-slow ease-entrance"
          style={{ width: `${overallPct}%` }}
        />
        {maxMilestone > 0 &&
          milestones.map((phase) => {
            const leftPct = (phase.milestone_end / maxMilestone) * 100;
            const isPast = finished_fixtures >= phase.milestone_end;
            return (
              <div
                key={phase.phase_key}
                className={cn(
                  "absolute top-0 bottom-0 w-0.5 -translate-x-1/2 z-10",
                  phase.status === "closed" || isPast ? "bg-emerald-400/90" : "bg-white/40",
                )}
                style={{ left: `${leftPct}%` }}
                title={`${phase.label}: fin de fase (${phase.milestone_end} partidos)`}
              />
            );
          })}
      </div>

      <div className={cn("grid gap-2", gridCols)}>
        {phases.map((phase) => {
          const historyWinner = winnerByPhase.get(phase.phase_key);
          const displayWinner = historyWinner ?? phase.winner;

          return (
            <div
              key={phase.phase_key}
              className={cn(
                "rounded-lg border px-2 py-1.5 text-center text-[10px] leading-tight",
                phase.status === "closed"
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : phase.status === "active"
                    ? "border-accent/40 bg-accent/10"
                    : "border-white/10 bg-white/5",
              )}
            >
              <p className="font-medium text-white truncate">{phase.label}</p>
              <p className="text-muted mt-0.5">
                {phase.finished_fixtures}/{phase.total_fixtures}
              </p>
              {phase.status === "closed" && displayWinner && (
                <p
                  className="text-emerald-400 mt-0.5 truncate"
                  title={`${displayWinner.points} pts`}
                >
                  ✓{" "}
                  {historyWinner?.username ? (
                    <UserDisplayName
                      username={historyWinner.username}
                      firstName={historyWinner.first_name}
                      lastName={historyWinner.last_name}
                      className="inline text-[10px]"
                    />
                  ) : (
                    <span>{displayWinner.points} pts</span>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
