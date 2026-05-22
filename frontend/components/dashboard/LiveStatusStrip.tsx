"use client";
import Link from "next/link";
import { Bell, Clock, Swords } from "lucide-react";
import { useFixtures } from "@/hooks/useFixtures";
import { useMyChallenges } from "@/hooks/useChallenges";
import { useNotifications } from "@/hooks/useNotifications";
import { useUnreadCount } from "@/hooks/useNotifications";
import { getBettingClosesAt, formatDeadlineRemaining } from "@/lib/matchTiming";
import { cn } from "@/lib/utils";

export function LiveStatusStrip({ className }: { className?: string }) {
  const { data: fixtures } = useFixtures({ status: "scheduled", limit: 5 });
  const { data: challenges } = useMyChallenges();
  const { data: unread } = useUnreadCount();
  const { data: latestNotif } = useNotifications(1, 1, "unread");

  const nextFixture = fixtures?.data?.[0];
  const pendingChallenges =
    challenges?.filter(
      (c) =>
        c.duel_result === "pending" &&
        c.status === "pending" &&
        c.is_challenger === false,
    ).length ?? 0;
  const unreadCount = unread?.count ?? 0;
  const latest = latestNotif?.data?.[0];

  const bettingDeadline = nextFixture
    ? getBettingClosesAt({
        match_date: nextFixture.match_date,
        status: nextFixture.status,
        betting_closes_at: nextFixture.betting_closes_at,
      })
    : null;

  return (
    <div
      className={cn(
        "rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      {nextFixture && bettingDeadline && (
        <Link
          href={`/fixtures/${nextFixture.id}`}
          className="flex items-center gap-2 text-sm min-w-0 cursor-pointer hover:text-white transition-colors focus-ring rounded-md"
        >
          <Clock className="w-4 h-4 text-accent shrink-0" aria-hidden />
          <span className="truncate text-muted">
            <span className="text-white font-medium">
              {nextFixture.home_team} vs {nextFixture.away_team}
            </span>
            {" · "}
            cierra {formatDeadlineRemaining(bettingDeadline)}
          </span>
        </Link>
      )}
      {pendingChallenges > 0 && (
        <Link
          href="/my-bets?tab=retos"
          className="flex items-center gap-2 text-sm text-amber-300 cursor-pointer hover:text-amber-200 transition-colors focus-ring rounded-md shrink-0"
        >
          <Swords className="w-4 h-4" aria-hidden />
          {pendingChallenges} reto{pendingChallenges !== 1 ? "s" : ""} pendiente
          {pendingChallenges !== 1 ? "s" : ""}
        </Link>
      )}
      {(unreadCount > 0 || latest) && (
        <Link
          href={latest ? `/notifications?focus=${latest.id}` : "/notifications"}
          className="flex items-center gap-2 text-sm text-muted ml-auto cursor-pointer hover:text-white transition-colors focus-ring rounded-md min-w-0"
        >
          <Bell className="w-4 h-4 text-accent shrink-0" aria-hidden />
          <span className="truncate">
            {unreadCount > 0 ? `${unreadCount} aviso${unreadCount !== 1 ? "s" : ""}` : "Avisos"}
            {latest ? `: ${latest.title}` : ""}
          </span>
        </Link>
      )}
    </div>
  );
}
