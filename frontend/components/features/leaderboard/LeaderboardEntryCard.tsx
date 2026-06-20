"use client";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getBadgeChipClass } from "@/lib/badges";
import type { BadgeOut, LeaderboardEntry } from "@/types/api";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
import { StaggerItem } from "@/components/ui/StaggerItem";

function BadgeChip({ badge }: { badge: BadgeOut }) {
  const color = getBadgeChipClass(badge.id);
  return (
    <span
      title={badge.description}
      className={cn("text-[10px] px-1.5 py-0.5 rounded border truncate max-w-[7rem]", color)}
    >
      {badge.label}
    </span>
  );
}

export interface LeaderboardEntryCardProps {
  entry: LeaderboardEntry;
  isMe?: boolean;
  rankIndex: number;
  compact?: boolean;
  /** Stagger entrance when used in lists */
  animate?: boolean;
}

export function LeaderboardEntryCard({ entry, isMe, rankIndex, compact, animate }: LeaderboardEntryCardProps) {
  const wrong = entry.wrong_results ?? Math.max(0, entry.total_bets - entry.correct_results);
  const wagers = entry.wager_count ?? entry.total_bets;
  const settled = entry.total_bets;
  const vis = entry.bets_profile_visibility ?? "public";
  const showAmounts = entry.show_bet_amounts ?? true;
  const wagered = parseFloat(entry.total_wagered ?? "0");
  const hasChallenges = (entry.challenges_won ?? 0) + (entry.challenges_lost ?? 0) > 0;
  const showBreakdown =
    entry.bet_points !== undefined ||
    hasChallenges ||
    (entry.total_points === 0 && settled > 0 && entry.correct_results > 0);

  const rankDisplay =
    rankIndex === 0 ? "🥇" : rankIndex === 1 ? "🥈" : rankIndex === 2 ? "🥉" : entry.position;

  const card = (
    <div
      className={cn(
        "rounded-xl border bg-glass backdrop-blur-sm flex items-center gap-4",
        "transition-[transform,box-shadow] duration-fast ease-entrance hover:-translate-y-0.5",
        compact ? "p-3" : "p-4",
        isMe && "border-accent/60 shadow-lg shadow-accent/15 ring-1 ring-accent/20",
        !isMe && rankIndex === 0 && "border-yellow-500/40 shadow-lg shadow-yellow-500/10",
        !isMe && rankIndex === 1 && "border-zinc-400/35",
        !isMe && rankIndex === 2 && "border-amber-700/40",
        !isMe && rankIndex > 2 && "border-white/10",
      )}
    >
      <span
        className={cn(
          "font-display text-center shrink-0",
          compact ? "text-2xl w-8" : "text-3xl w-10",
          rankIndex === 0
            ? "text-yellow-400"
            : rankIndex === 1
              ? "text-zinc-300"
              : rankIndex === 2
                ? "text-amber-600"
                : "text-muted",
        )}
      >
        {rankDisplay}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <UserAvatar username={entry.username} avatarDisplay={entry.avatar_display} size="sm" />
          <Link href={`/u/${encodeURIComponent(entry.username)}`} className="group min-w-0">
            <UserDisplayName
              username={entry.username}
              firstName={entry.first_name}
              lastName={entry.last_name}
              nameClassName={cn("group-hover:text-accent", isMe && "text-accent")}
              layout="inline"
            />
            {isMe && <span className="text-accent text-xs ml-1">(Tú)</span>}
          </Link>
          {!compact && (
            <span
              className={
                vis === "invite_only"
                  ? "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 shrink-0"
                  : "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-200 shrink-0"
              }
            >
              {vis === "invite_only" ? "Privado" : "Público"}
            </span>
          )}
        </div>
        {entry.badges && entry.badges.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {entry.badges.slice(0, 3).map((b) => (
              <BadgeChip key={b.id} badge={b} />
            ))}
          </div>
        )}
        <p className={cn("text-muted mt-1", compact ? "text-[11px]" : "text-xs")}>
          {wagers} apuesta{wagers !== 1 ? "s" : ""}
          {wagers !== settled ? ` · ${settled} liquidada${settled !== 1 ? "s" : ""}` : ""}
          {settled > 0
            ? ` · ${entry.correct_results} aciertos · ${wrong} fallos · ${entry.accuracy_pct}% acierto`
            : wagers > 0
              ? " · sin liquidar aún"
              : ""}
        </p>
        {showBreakdown && (
          <p className={cn("text-muted/80 mt-0.5", compact ? "text-[10px]" : "text-xs")}>
            Pronósticos: +{entry.bet_points ?? 0}
            {hasChallenges && (
              <>
                {" "}
                · Retos: +{entry.challenge_pts_won ?? 0} ganados · −{entry.challenge_pts_lost ?? 0} perdidos
                {(entry.challenge_pts_net ?? 0) !== 0 && (
                  <span className="text-white/70">
                    {" "}
                    (neto {entry.challenge_pts_net! > 0 ? "+" : ""}
                    {entry.challenge_pts_net})
                  </span>
                )}
              </>
            )}
            {" "}
            · Total: {entry.total_points}
          </p>
        )}
        {wagered > 0 && (
          <p className={cn("mt-0.5", compact ? "text-[10px]" : "text-xs")}>
            <span className="text-muted/60">Apostado: </span>
            {showAmounts ? (
              <span className="text-emerald-400 font-medium">S/ {wagered.toFixed(2)}</span>
            ) : (
              <span className="text-muted/40 blur-sm select-none">S/ ••••</span>
            )}
          </p>
        )}
      </div>
      <span className={cn("font-display text-accent shrink-0", compact ? "text-xl" : "text-2xl")}>
        {entry.total_points}pts
      </span>
    </div>
  );

  if (animate) {
    return <StaggerItem index={rankIndex}>{card}</StaggerItem>;
  }

  return card;
}