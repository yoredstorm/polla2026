"use client";
import { useBettingTrends } from "@/hooks/useBettingTrends";
import { cn } from "@/lib/utils";

interface BettingTrendsBarProps {
  fixtureId: string;
  compact?: boolean;
}

export function BettingTrendsBar({ fixtureId, compact }: BettingTrendsBarProps) {
  const { data, isLoading } = useBettingTrends(fixtureId);

  if (isLoading || !data) return null;
  if (!data.available) return null;
  if (data.total_bets === 0) {
    return (
      <p className={cn("text-[10px] text-muted", compact ? "mt-2" : "mt-3")}>
        Sin tendencia aun — se el primero en pronosticar.
      </p>
    );
  }

  return (
    <div className={cn(compact ? "mt-2" : "mt-3")}>
      <p className="text-[10px] text-muted mb-1.5 uppercase tracking-wide">
        Tendencia ({data.total_bets} apuesta{data.total_bets !== 1 ? "s" : ""})
      </p>
      <div className="space-y-1.5">
        {data.outcomes.map((o) => (
          <div key={o.key}>
            <div className="flex justify-between text-[10px] mb-0.5">
              <span className="text-muted truncate pr-2">{o.label}</span>
              <span className="text-accent font-medium shrink-0">{o.pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-accent/70 transition-all duration-slow ease-entrance"
                style={{ width: `${Math.min(100, o.pct)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {!compact && data.top_scores.length > 0 && (
        <p className="text-[10px] text-muted/80 mt-2">
          Marcador mas apostado:{" "}
          <span className="text-white">
            {data.top_scores[0].score} ({data.top_scores[0].pct}%)
          </span>
        </p>
      )}
    </div>
  );
}
