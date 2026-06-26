"use client";
import Image from "next/image";
import Link from "next/link";
import { Lock, MapPin } from "lucide-react";
import type { Fixture } from "@/types/api";
import { TeamAvatar } from "@/components/features/betting/TeamAvatar";
import { LiveBadge } from "@/components/ui/LiveBadge";
import { MotionSafe } from "@/components/ui/MotionSafe";
import { entranceTransition, staggerDelay } from "@/lib/motion";
import { cn, formatMatchDate, formatCountdown, isWithin24Hours, getStatusLabel } from "@/lib/utils";
import { getBettingClosesAt, isBettingWindowOpen } from "@/lib/matchTiming";
import { BettingTrendsBar } from "@/components/features/betting/BettingTrendsBar";
import { FixtureDeadlineCountdown } from "@/components/features/betting/FixtureDeadlineCountdown";

interface MatchCardProps {
  fixture: Fixture;
  index?: number;
  highlightFinished?: boolean;
}

export function MatchCard({ fixture, index = 0, highlightFinished }: MatchCardProps) {
  const isLive = fixture.status === "live";
  const isFinished = fixture.status === "finished";
  const isLocked = fixture.is_locked;
  const showKickoffCountdown = fixture.status === "scheduled" && isWithin24Hours(fixture.match_date);
  const showBettingCountdown =
    fixture.status === "scheduled" && !isLocked && fixture.betting_open && isBettingWindowOpen(fixture);
  const canBet =
    !isLocked && !isFinished && fixture.status === "scheduled" && isBettingWindowOpen(fixture);

  return (
    <MotionSafe
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={entranceTransition(staggerDelay(index))}
    >
      <Link
        href={`/fixtures/${fixture.id}`}
        className={cn(
          "relative block rounded-xl border border-white/10 bg-glass backdrop-blur-sm p-4 card-interactive",
          "transition-[transform,box-shadow] duration-fast ease-entrance hover:-translate-y-0.5 hover:shadow-lg",
          isLive && "border-danger/50 shadow-glow-danger",
          highlightFinished && isFinished && "border-success/30 ring-1 ring-success/20",
        )}
      >
        {highlightFinished && isFinished && (
          <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wide text-success/90 bg-success/15 px-2 py-0.5 rounded-full">
            Final
          </span>
        )}
        <div className="flex items-center gap-2 mb-3 text-muted text-xs">
          {fixture.league_logo_url && (
            <Image
              src={fixture.league_logo_url}
              alt={fixture.league_name}
              width={16}
              height={16}
              className="object-contain"
              unoptimized
            />
          )}
          {fixture.group_name ? (
            <span className="font-medium text-accent/80">{fixture.group_name}</span>
          ) : (
            <span>{fixture.league_name}</span>
          )}
          {fixture.round && <span>· {fixture.round}</span>}
          {fixture.venue && (
            <span className="ml-auto flex items-center gap-0.5 truncate max-w-[120px]" title={fixture.venue}>
              <MapPin className="w-3 h-3 shrink-0" aria-hidden />
              {fixture.venue}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col items-center gap-1 flex-1">
            <TeamAvatar logoUrl={fixture.home_logo_url} teamName={fixture.home_team} size={40} />
            <span className="font-display text-sm text-center leading-tight">{fixture.home_team}</span>
          </div>
          <div className="flex flex-col items-center gap-1 min-w-[80px]">
            {isFinished || isLive ? (
              <div className="font-display text-2xl text-white">
                {fixture.home_score ?? 0} – {fixture.away_score ?? 0}
              </div>
            ) : (
              <div className="font-display text-lg text-muted">VS</div>
            )}
            {isLive ? (
              <LiveBadge className="text-[10px]" />
            ) : (
              <div
                className={cn(
                  "flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
                  isFinished ? "bg-muted/20 text-muted" : "bg-accent/10 text-accent",
                )}
              >
                {getStatusLabel(fixture.status)}
              </div>
            )}
            {isLocked && !isLive && !isFinished && (
              <span className="flex items-center gap-0.5 text-[10px] text-warning">
                <Lock className="w-3 h-3" aria-hidden />
                CERRADO
              </span>
            )}
          </div>
          <div className="flex flex-col items-center gap-1 flex-1">
            <TeamAvatar logoUrl={fixture.away_logo_url} teamName={fixture.away_team} size={40} />
            <span className="font-display text-sm text-center leading-tight">{fixture.away_team}</span>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-1.5 text-xs text-muted">
          <div className="flex items-center justify-between">
            <span>{formatMatchDate(fixture.match_date)}</span>
            {showKickoffCountdown && (
              <span className="text-warning">{formatCountdown(fixture.match_date)}</span>
            )}
          </div>
          {showBettingCountdown && (
            <FixtureDeadlineCountdown
              deadlineMs={getBettingClosesAt(fixture)}
              label="Cierran apuestas en"
              compact
            />
          )}
        </div>

        {!isLocked && !isFinished && fixture.status === "scheduled" && fixture.betting_open && (
          <BettingTrendsBar fixtureId={fixture.id} compact />
        )}

        <span
          className={cn(
            "mt-3 block w-full text-center py-2 rounded-lg text-sm font-medium transition-colors duration-200",
            canBet
              ? "bg-accent/10 text-accent hover:bg-accent/20"
              : isFinished
                ? "bg-white/5 text-muted hover:bg-white/10"
                : "hidden",
          )}
        >
          {canBet ? "Apostar" : isFinished ? "Ver resultados" : ""}
        </span>
      </Link>
    </MotionSafe>
  );
}
