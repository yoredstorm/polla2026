"use client";

import { Trophy, Medal } from "lucide-react";
import { MotionSafe } from "@/components/ui/MotionSafe";
import { entranceTransition, staggerDelay } from "@/lib/motion";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/utils";
import type { LeaderboardEntry } from "@/types/api";

interface LeaderboardPodiumProps {
  entries: LeaderboardEntry[];
  currentUserId?: string;
}

const MEDALS = [
  { Icon: Trophy, iconClass: "text-warning" },
  { Icon: Medal, iconClass: "text-muted" },
  { Icon: Medal, iconClass: "text-amber-700" },
] as const;

const CARD_SIZE = [
  { avatar: "lg" as const, pointsClass: "text-2xl sm:text-3xl", nickClass: "text-sm" },
  { avatar: "md" as const, pointsClass: "text-xl sm:text-2xl", nickClass: "text-xs" },
  { avatar: "sm" as const, pointsClass: "text-lg sm:text-xl",  nickClass: "text-xs" },
] as const;

function PodiumColumn({
  entry,
  rank,
  currentUserId,
  delay,
}: {
  entry: LeaderboardEntry | null;
  rank: 1 | 2 | 3;
  currentUserId?: string;
  delay: number;
}) {
  if (!entry) return <div aria-hidden className="min-w-0" />;

  const slot = rank - 1;
  const { Icon, iconClass } = MEDALS[slot];
  const { avatar, pointsClass, nickClass } = CARD_SIZE[slot];
  const isMe = entry.user_id === currentUserId;
  const isFirst = rank === 1;

  return (
    <MotionSafe
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...entranceTransition(delay), duration: 0.25 }}
      className="flex flex-col items-center w-full min-w-0"
    >
      <div
        className={cn(
          "w-full rounded-t-2xl border border-b-0 px-2.5 pt-3 pb-2.5 text-center",
          isFirst
            ? "border-accent/50 bg-accent/10 shadow-glow-accent"
            : "border-white/10 bg-glass",
          isMe && "ring-2 ring-accent/40 ring-offset-2 ring-offset-background",
        )}
      >
        <Icon className={cn("w-5 h-5 mx-auto mb-1", iconClass)} aria-hidden />
        <UserAvatar
          username={entry.username}
          avatarDisplay={entry.avatar_display ?? entry.avatar_url}
          size={avatar}
          className="mx-auto"
        />
        <p className={cn("mt-2 font-medium truncate w-full text-center", nickClass, isMe ? "text-accent" : "text-white/90")}>
          @{entry.username}
        </p>
        <p className={cn("font-display text-accent leading-none", pointsClass)}>
          {entry.total_points}
        </p>
        <p className="text-[10px] text-muted uppercase tracking-wide">pts</p>
      </div>
      <div className="w-full h-14 rounded-b-xl border border-t-0 border-white/10 bg-gradient-to-t from-accent/25 via-accent/10 to-white/5 flex items-center justify-center">
        <span
          className={cn(
            "font-display text-white/90 leading-none",
            isFirst ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl",
          )}
        >
          #{rank}
        </span>
      </div>
    </MotionSafe>
  );
}

export function LeaderboardPodium({ entries, currentUserId }: LeaderboardPodiumProps) {
  const first = entries[0] ?? null;
  const second = entries[1] ?? null;
  const third = entries[2] ?? null;

  if (!first) return null;

  return (
    <section className="mb-8" aria-label="Podio top 3">
      <div className="grid grid-cols-3 gap-x-2 sm:gap-x-4 items-end max-w-lg mx-auto px-1">
        <PodiumColumn entry={second} rank={2} currentUserId={currentUserId} delay={staggerDelay(0)} />
        <PodiumColumn entry={first}  rank={1} currentUserId={currentUserId} delay={staggerDelay(1)} />
        <PodiumColumn entry={third}  rank={3} currentUserId={currentUserId} delay={staggerDelay(2)} />
      </div>
    </section>
  );
}