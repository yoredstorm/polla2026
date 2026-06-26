"use client";

import { useFixtures, useLiveFixtures } from "@/hooks/useFixtures";
import { cn } from "@/lib/utils";
import { LiveBadge } from "@/components/ui/LiveBadge";

export function ResultsTicker({ className }: { className?: string }) {
  const { data: liveData } = useLiveFixtures();
  const { data: finishedData } = useFixtures({ status: "finished", limit: 8, page: 1 });

  const live = liveData ?? [];
  const finished = finishedData?.data ?? [];
  const items = [...live, ...finished];

  if (items.length === 0) return null;

  const segments = items.map((f) => {
    const score =
      f.status === "live" || f.status === "finished"
        ? `${f.home_score ?? 0}-${f.away_score ?? 0}`
        : "vs";
    return `${f.home_team} ${score} ${f.away_team}`;
  });

  const track = segments.join("  ·  ");
  const repeated = `${track}  ·  ${track}`;

  return (
    <div
      className={cn(
        "border-b border-white/5 bg-black/30 overflow-hidden",
        className,
      )}
      aria-label="Últimos resultados"
    >
      <div className="max-w-7xl mx-auto flex items-center gap-3 px-4 py-1.5 min-h-[2rem]">
        {live.length > 0 && <LiveBadge className="shrink-0 text-[10px] py-0.5" />}
        <div className="flex-1 overflow-hidden mask-fade-x">
          <div className="results-ticker-track flex w-max whitespace-nowrap items-center text-xs text-muted">
            <span className="px-4 font-medium">{repeated}</span>
            <span className="px-4 font-medium" aria-hidden>
              {repeated}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
