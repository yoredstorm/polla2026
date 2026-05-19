"use client";

import { Trophy, Medal } from "lucide-react";
import { MotionSafe } from "@/components/ui/MotionSafe";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
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

const PEDESTAL_HEIGHT = ["h-20 sm:h-24", "h-28 sm:h-36", "h-16 sm:h-20"] as const;

function PodiumColumn({
  entry,
  rank,
  currentUserId,
  align,
  delay,
}: {
  entry: LeaderboardEntry | null;
  rank: 1 | 2 | 3;
  currentUserId?: string;
  align: "start" | "center" | "end";
  delay: number;
}) {
  if (!entry) {
    return <div aria-hidden className="min-w-0" />;
  }

  const slot = rank - 1;
  const { Icon, iconClass } = MEDALS[slot];
  const isMe = entry.user_id === currentUserId;
  const isFirst = rank === 1;

  return (
    <MotionSafe
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      className={cn(
        "flex flex-col items-center w-full min-w-0 max-w-[132px] sm:max-w-[148px]",
        align === "start" && "justify-self-start",
        align === "center" && "justify-self-center",
        align === "end" && "justify-self-end",
      )}
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
          size="md"
          className="mx-auto"
        />
        <div className="mt-2 w-full">
          <UserDisplayName
            username={entry.username}
            firstName={entry.first_name}
            lastName={entry.last_name}
            className="items-center"
          />
        </div>
        <p className="font-display text-xl sm:text-2xl text-accent leading-none">{entry.total_points}</p>
        <p className="text-[10px] text-muted uppercase tracking-wide">pts</p>
      </div>
      <div
        className={cn(
          "w-full rounded-b-xl border border-t-0 border-white/10 bg-gradient-to-t from-accent/25 via-accent/10 to-white/5 flex items-center justify-center",
          PEDESTAL_HEIGHT[slot],
        )}
      >
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
      <div className="grid grid-cols-[1fr_auto_1fr] gap-x-2 sm:gap-x-5 items-end max-w-lg mx-auto px-1">
        <PodiumColumn
          entry={second}
          rank={2}
          currentUserId={currentUserId}
          align="end"
          delay={0}
        />
        <PodiumColumn
          entry={first}
          rank={1}
          currentUserId={currentUserId}
          align="center"
          delay={0.08}
        />
        <PodiumColumn
          entry={third}
          rank={3}
          currentUserId={currentUserId}
          align="start"
          delay={0.16}
        />
      </div>
    </section>
  );
}
