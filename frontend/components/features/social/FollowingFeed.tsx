"use client";
import Link from "next/link";
import { useFollowingFeed, type FollowingBetChallenge } from "@/hooks/useSocial";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { challengeStatusLabel } from "@/lib/challengeUtils";
import { userLabel } from "@/lib/userDisplay";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
import { StaggerItem } from "@/components/ui/StaggerItem";
import { cn } from "@/lib/utils";

function challengeBadge(ch: FollowingBetChallenge) {
  const rival = ch.challenge_opponent_username
    ? userLabel(
        ch.challenge_opponent_first_name,
        ch.challenge_opponent_last_name,
        ch.challenge_opponent_username,
      )
    : "rival";
  const stake = ch.challenge_stake;

  if (ch.challenge_result === "won") {
    return {
      text: `Ganó el reto vs ${rival} (${stake} pts)`,
      className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    };
  }
  if (ch.challenge_result === "lost") {
    return {
      text: `Perdió el reto vs ${rival} (${stake} pts)`,
      className: "bg-red-500/15 text-red-300 border-red-500/30",
    };
  }
  if (ch.challenge_result === "draw") {
    return {
      text: `Empate en reto vs ${rival} (${stake} pts)`,
      className: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
    };
  }
  if (ch.challenge_result === "active") {
    return {
      text: `En reto vs ${rival} · ${stake} pts en juego`,
      className: "bg-amber-500/15 text-amber-200 border-amber-500/30",
    };
  }
  if (ch.challenge_result === "pending") {
    return {
      text: `Reto pendiente vs ${rival} · ${stake} pts`,
      className: "bg-sky-500/15 text-sky-200 border-sky-500/30",
    };
  }
  return {
    text: `Reto · ${challengeStatusLabel(ch.challenge_status)} vs ${rival}`,
    className: "bg-white/10 text-muted border-white/15",
  };
}

export function FollowingFeed() {
  const { data, isLoading } = useFollowingFeed(12);
  const items = data?.data ?? [];

  if (isLoading) return null;
  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-white/10 bg-glass p-4 mb-4">
      <h2 className="font-display text-lg text-white mb-3">Apuestas de quien sigues</h2>
      <ul className="space-y-2">
        {items.map((item, i) => {
          const ch = item.challenge;
          const badge = ch ? challengeBadge(ch) : null;
          return (
            <StaggerItem key={item.bet_id} as="li" index={Math.min(i, 12)}>
              <Link
                href={`/fixtures/${item.fixture_id}`}
                className="flex gap-3 rounded-lg border border-white/10 px-3 py-2 card-interactive"
              >
                  <UserAvatar username={item.username} avatarDisplay={item.avatar_display} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate flex items-center gap-1 flex-wrap">
                      <UserDisplayName
                        username={item.username}
                        firstName={item.first_name}
                        lastName={item.last_name}
                        layout="inline"
                        showUsername
                        linkToProfile
                      />
                      <span className="text-muted"> · </span>
                      {item.home_team} vs {item.away_team}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      Pronóstico {item.predicted_home_score}–{item.predicted_away_score}
                    </p>
                    {badge && (
                      <span
                        className={cn(
                          "inline-block mt-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full border",
                          badge.className,
                        )}
                      >
                        {badge.text}
                      </span>
                    )}
                  </div>
                </Link>
            </StaggerItem>
          );
        })}
      </ul>
    </section>
  );
}
