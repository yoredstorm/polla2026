"use client";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import type { Fixture } from "@/types/api";
import { TeamAvatar } from "@/components/betting/TeamAvatar";
import { cn, formatMatchDate, formatCountdown, isWithin24Hours, getStatusLabel } from "@/lib/utils";

interface MatchCardProps {
  fixture: Fixture;
  index?: number;
  /** Destaca tarjetas en la sección de partidos culminados */
  highlightFinished?: boolean;
}

export function MatchCard({ fixture, index = 0, highlightFinished }: MatchCardProps) {
  const isLive = fixture.status === "live";
  const isFinished = fixture.status === "finished";
  const isLocked = fixture.is_locked;
  const showCountdown = fixture.status === "scheduled" && isWithin24Hours(fixture.match_date);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        "relative rounded-xl border border-white/10 bg-glass backdrop-blur-sm p-4",
        "hover:border-white/20 transition-all duration-200",
        isLive && "border-danger/50 shadow-lg shadow-danger/10",
        highlightFinished && isFinished && "border-emerald-500/30 ring-1 ring-emerald-500/20"
      )}
    >
      {highlightFinished && isFinished && (
        <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wide text-emerald-400/90 bg-emerald-500/15 px-2 py-0.5 rounded-full">
          Final
        </span>
      )}
      {/* Match context header */}
      <div className="flex items-center gap-2 mb-3 text-muted text-xs">
        {fixture.league_logo_url && (
          <Image src={fixture.league_logo_url} alt={fixture.league_name} width={16} height={16} className="object-contain" unoptimized />
        )}
        {fixture.group_name ? (
          <span className="font-medium text-accent/80">{fixture.group_name}</span>
        ) : (
          <span>{fixture.league_name}</span>
        )}
        {fixture.round && <span>· {fixture.round}</span>}
        {fixture.venue && <span className="ml-auto truncate max-w-[100px]" title={fixture.venue}>📍 {fixture.venue}</span>}
      </div>

      {/* Teams & Score */}
      <div className="flex items-center justify-between gap-4">
        {/* Home team */}
        <div className="flex flex-col items-center gap-1 flex-1">
          <TeamAvatar logoUrl={fixture.home_logo_url} teamName={fixture.home_team} size={40} />
          <span className="font-display text-sm text-center leading-tight">{fixture.home_team}</span>
        </div>

        {/* Center: score/status */}
        <div className="flex flex-col items-center gap-1 min-w-[80px]">
          {isFinished || isLive ? (
            <div className="font-display text-2xl text-white">
              {fixture.home_score ?? 0} – {fixture.away_score ?? 0}
            </div>
          ) : (
            <div className="font-display text-lg text-muted">VS</div>
          )}

          {/* Status badge */}
          <div className={cn("flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
            isLive ? "bg-danger/20 text-danger" :
            isFinished ? "bg-muted/20 text-muted" :
            "bg-accent/10 text-accent"
          )}>
            {isLive && <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />}
            {getStatusLabel(fixture.status)}
          </div>

          {isLocked && !isLive && !isFinished && (
            <span className="text-[10px] text-warning">🔒 CERRADO</span>
          )}
        </div>

        {/* Away team */}
        <div className="flex flex-col items-center gap-1 flex-1">
          <TeamAvatar logoUrl={fixture.away_logo_url} teamName={fixture.away_team} size={40} />
          <span className="font-display text-sm text-center leading-tight">{fixture.away_team}</span>
        </div>
      </div>

      {/* Match date / countdown */}
      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>{formatMatchDate(fixture.match_date)}</span>
        {showCountdown && (
          <span className="text-warning">{formatCountdown(fixture.match_date)}</span>
        )}
      </div>

      {/* Bet button */}
      {!isLocked && !isFinished && fixture.status === "scheduled" && (
        <Link
          href={`/fixtures/${fixture.id}`}
          className="mt-3 block w-full text-center py-2 rounded-lg bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors"
        >
          Apostar
        </Link>
      )}
      {isFinished && (
        <Link
          href={`/fixtures/${fixture.id}`}
          className="mt-3 block w-full text-center py-2 rounded-lg bg-white/5 text-muted text-sm hover:bg-white/10 transition-colors"
        >
          Ver resultados
        </Link>
      )}
    </motion.div>
  );
}
