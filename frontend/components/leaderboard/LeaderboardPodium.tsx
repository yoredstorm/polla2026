"use client";

import { Trophy, Medal } from "lucide-react";
import { MotionSafe } from "@/components/ui/MotionSafe";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/utils";
import type { LeaderboardEntry } from "@/types/api";

interface LeaderboardPodiumProps {
  entries: LeaderboardEntry[];
  currentUserId?: string;
}

const PODIUM_ORDER = [1, 0, 2] as const;

export function LeaderboardPodium({ entries, currentUserId }: LeaderboardPodiumProps) {
  const topThree = entries.slice(0, 3);
  if (topThree.length === 0) return null;

  const heights = ["h-28", "h-36", "h-24"];
  const medals = [
    { Icon: Trophy, className: "text-warning" },
    { Icon: Medal, className: "text-muted" },
    { Icon: Medal, className: "text-amber-700" },
  ];

  return (
    <section className="mb-8" aria-label="Podio top 3">
      <div className="flex items-end justify-center gap-3 sm:gap-6">
        {PODIUM_ORDER.map((slot, displayIndex) => {
          const entry = topThree[slot];
          if (!entry) {
            return <div key={`empty-${displayIndex}`} className="flex-1 max-w-[120px]" />;
          }

          const rank = slot + 1;
          const { Icon, className: iconClass } = medals[slot];
          const isMe = entry.user_id === currentUserId;

          return (
            <MotionSafe
              key={entry.user_id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: displayIndex * 0.08, duration: 0.35 }}
              className={cn("flex flex-col items-center flex-1 max-w-[140px]", rank === 1 && "sm:order-2")}
            >
              <div
                className={cn(
                  "relative mb-2 rounded-2xl border p-3 w-full text-center",
                  rank === 1
                    ? "border-accent/50 bg-accent/10 shadow-glow-accent"
                    : "border-white/10 bg-glass",
                  isMe && "ring-2 ring-accent/40",
                )}
              >
                <Icon className={cn("w-5 h-5 mx-auto mb-1", iconClass)} aria-hidden />
                <UserAvatar
                  username={entry.username}
                  avatarDisplay={entry.avatar_display ?? entry.avatar_url}
                  size="md"
                  className="mx-auto"
                />
                <p className="font-display text-lg text-white truncate mt-2">@{entry.username}</p>
                <p className="font-display text-2xl text-accent">{entry.total_points}</p>
                <p className="text-[10px] text-muted uppercase">pts</p>
              </div>
              <div
                className={cn(
                  "w-full rounded-t-xl bg-gradient-to-t from-accent/20 to-white/5 border border-b-0 border-white/10 flex items-end justify-center pb-2",
                  heights[slot],
                )}
              >
                <span className="font-display text-3xl text-white/90">#{rank}</span>
              </div>
            </MotionSafe>
          );
        })}
      </div>
    </section>
  );
}
