"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useUnreadCount } from "@/hooks/useNotifications";
import { useAuth } from "@/hooks/useAuth";
import { MotionSafe } from "@/components/ui/MotionSafe";
import { MOTION } from "@/lib/motion";
import { DEFAULT_COMPETITION_SLUG, competitionPath } from "@/lib/competitionPaths";

const tabSegments = [
  { segment: "dashboard", label: "Inicio", icon: HomeIcon },
  { segment: "fixtures", label: "Partidos", icon: FixturesIcon },
  { segment: "my-bets", label: "Apuestas", icon: BetsIcon },
  { segment: "notifications", label: "Avisos", icon: BellIcon, global: true },
  { segment: "leaderboard", label: "Ranking", icon: TrophyIcon },
];

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg className={cn("w-5 h-5 transition-transform duration-fast ease-entrance", active ? "text-accent scale-110" : "text-muted")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function FixturesIcon({ active }: { active: boolean }) {
  return (
    <svg className={cn("w-5 h-5 transition-transform duration-fast ease-entrance", active ? "text-accent scale-110" : "text-muted")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function BetsIcon({ active }: { active: boolean }) {
  return (
    <svg className={cn("w-5 h-5 transition-transform duration-fast ease-entrance", active ? "text-accent scale-110" : "text-muted")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function BellIcon({ active }: { active: boolean }) {
  return (
    <svg className={cn("w-5 h-5 transition-transform duration-fast ease-entrance", active ? "text-accent scale-110" : "text-muted")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

function TrophyIcon({ active }: { active: boolean }) {
  return (
    <svg className={cn("w-5 h-5 transition-transform duration-fast ease-entrance", active ? "text-accent scale-110" : "text-muted")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    </svg>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { data: unreadData } = useUnreadCount(!!user);
  const unread = unreadData?.count ?? 0;
  const slugMatch = pathname.match(/^\/c\/([^/]+)/);
  const slug = slugMatch?.[1] ?? DEFAULT_COMPETITION_SLUG;
  const tabHref = (segment: string, global?: boolean) =>
    global ? `/${segment}` : competitionPath(slug, segment);

  if (pathname.startsWith("/admin") || pathname.startsWith("/login") || pathname.startsWith("/register")) {
    return null;
  }

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-surface/95 backdrop-blur-md safe-area-pb">
      <div className="flex items-stretch justify-around h-14">
        {tabSegments.map((tab) => {
          const href = tabHref(tab.segment, tab.global);
          const active =
            pathname === href ||
            pathname.startsWith(`${href}/`) ||
            (!tab.global && pathname.startsWith(`/c/${slug}/${tab.segment}`));
          const Icon = tab.icon;
          const showBadge = tab.segment === "notifications" && unread > 0;
          return (
            <Link
              key={tab.segment}
              href={href}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium pressable cursor-pointer focus-ring",
                "transition-colors duration-fast ease-entrance",
                active ? "text-accent" : "text-muted",
              )}
            >
              {active && (
                <MotionSafe
                  layoutId="mobile-nav-indicator"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-accent rounded-full shadow-glow-sm"
                  transition={MOTION.spring}
                />
              )}
              <Icon active={active} />
              {showBadge && (
                <span className="absolute top-1 right-[18%] min-w-[14px] h-[14px] px-0.5 flex items-center justify-center rounded-full bg-accent text-background text-[8px] font-bold">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
