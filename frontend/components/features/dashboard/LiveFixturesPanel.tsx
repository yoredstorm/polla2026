"use client";

import Link from "next/link";
import { Radio } from "lucide-react";
import { useLiveFixtures } from "@/hooks/useFixtures";
import { MatchCard } from "@/components/features/betting/MatchCard";
import { MatchCardSkeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

export function LiveFixturesPanel({ className }: { className?: string }) {
  const { data: liveFixtures, isLoading, isError, refetch } = useLiveFixtures();

  if (!isLoading && !isError && (!liveFixtures || liveFixtures.length === 0)) {
    return null;
  }

  return (
    <section
      className={cn("mb-8", className)}
      aria-labelledby="dashboard-live-fixtures"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-danger/20 text-danger border border-danger/40"
            aria-hidden
          >
            <Radio className="w-3 h-3" />
            Live
          </span>
          <h2 id="dashboard-live-fixtures" className="font-display text-xl text-white">
            Partidos en vivo
          </h2>
        </div>
        {!isLoading && liveFixtures && liveFixtures.length > 0 && (
          <span className="text-xs text-muted">
            {liveFixtures.length} partido{liveFixtures.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" role="status">
          {[0, 1].map((i) => (
            <MatchCardSkeleton key={i} />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center" role="alert">
          <p className="text-sm text-destructive mb-2">No se pudieron cargar los partidos en vivo.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-xs text-accent hover:underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {!isLoading && !isError && liveFixtures && liveFixtures.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-2 snap-x sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:overflow-visible">
          {liveFixtures.map((fixture, i) => (
            <div key={fixture.id} className="min-w-[280px] snap-start sm:min-w-0">
              <MatchCard fixture={fixture} index={i} />
            </div>
          ))}
        </div>
      )}

      {!isLoading && !isError && liveFixtures && liveFixtures.length > 0 && (
        <p className="text-[11px] text-muted mt-3">
          El marcador se actualiza en tiempo real. Toca un partido para ver apostadores y tu ranking
          proyectado.
        </p>
      )}
    </section>
  );
}

/** Compact live score chip for the status strip (first live match). */
export function LiveFixtureStripLink({
  fixture,
  className,
}: {
  fixture: { id: string; home_team: string; away_team: string; home_score: number | null; away_score: number | null };
  className?: string;
}) {
  return (
    <Link
      href={`/fixtures/${fixture.id}`}
      className={cn(
        "flex items-center gap-2 text-sm min-w-0 cursor-pointer hover:text-white transition-colors focus-ring rounded-md",
        className,
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse shrink-0" aria-hidden />
      <span className="truncate text-muted">
        <span className="text-white font-medium">
          {fixture.home_team} {fixture.home_score ?? 0}–{fixture.away_score ?? 0}{" "}
          {fixture.away_team}
        </span>
        {" · "}
        <span className="text-danger">En vivo</span>
      </span>
    </Link>
  );
}
