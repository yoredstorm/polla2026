"use client";

import type { TournamentProgress } from "@/types/api";
import { cn } from "@/lib/utils";

export function TournamentProgressTimeline({
  progress,
  className,
}: {
  progress: TournamentProgress;
  className?: string;
}) {
  const { total_fixtures, finished_fixtures, phases } = progress;
  const overallPct =
    total_fixtures > 0 ? Math.round((finished_fixtures / total_fixtures) * 100) : 0;

  const milestones = phases.filter((p) => p.milestone_end > 0);
  const maxMilestone = milestones.length ? milestones[milestones.length - 1].milestone_end : total_fixtures;

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
          className="absolute inset-y-0 left-0 bg-accent transition-all duration-500"
          style={{ width: `${overallPct}%` }}
        />
        {maxMilestone > 0 &&
          milestones.map((phase, i) => {
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

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {phases.map((phase) => (
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
            {phase.status === "closed" && phase.winner && (
              <p className="text-emerald-400 mt-0.5 truncate" title={`${phase.winner.points} pts`}>
                ✓ {phase.winner.points} pts
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
