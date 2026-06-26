"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence } from "motion/react";
import { useAuth } from "@/hooks/useAuth";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { useUnreadCount } from "@/hooks/useNotifications";
import { Bell } from "lucide-react";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { HelpTooltip } from "@/components/features/help/HelpTooltip";
import { MotionSafe } from "@/components/ui/MotionSafe";
import { exitTransition, MOTION } from "@/lib/motion";
import type { HelpKey } from "@/lib/systemHelp";

const navLinks: { href: string; label: string; helpKey: HelpKey; tourId: string }[] = [
  { href: "/dashboard", label: "Inicio", helpKey: "nav.dashboard", tourId: "nav-dashboard" },
  { href: "/fixtures", label: "Partidos", helpKey: "nav.fixtures", tourId: "nav-fixtures" },
  { href: "/my-bets", label: "Mis Apuestas", helpKey: "nav.myBets", tourId: "nav-my-bets" },
  { href: "/leaderboard", label: "Ranking", helpKey: "nav.leaderboard", tourId: "nav-leaderboard" },
];

function DesktopNavLink({
  href,
  label,
  active,
  tourId,
  helpKey,
}: {
  href: string;
  label: string;
  active: boolean;
  tourId: string;
  helpKey: HelpKey;
}) {
  return (
    <span className="inline-flex items-center gap-0.5" data-help-tour={tourId}>
      <Link
        href={href}
        className={cn(
          "nav-link relative text-sm cursor-pointer focus-ring rounded-md px-2 py-1",
          active ? "text-accent" : "text-muted hover:text-white",
        )}
      >
        {active && (
          <MotionSafe
            layoutId="desktop-nav-pill"
            className="absolute inset-0 rounded-md bg-accent/10 border border-accent/25 -z-10"
            transition={MOTION.spring}
          />
        )}
        <span className="relative z-[1]">{label}</span>
      </Link>
      <HelpTooltip helpKey={helpKey} label={label} side="bottom" />
    </span>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { data: unreadData } = useUnreadCount(!!user);
  const unreadCount = unreadData?.count ?? 0;
  useInactivityTimeout(!!user);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 px-3 pt-3 md:px-4 md:pt-4 pointer-events-none">
        <nav
          className={cn(
            "pointer-events-auto max-w-7xl mx-auto",
            "border border-white/10 bg-surface/90 backdrop-blur-md",
            "rounded-2xl shadow-lg shadow-black/20",
            "md:top-4",
          )}
        >
          <div className="px-4 h-14 flex items-center justify-between">
            <Link
              href="/dashboard"
              className="font-display text-xl text-accent text-glow-accent focus-ring rounded-lg nav-link"
            >
              POLLA DEPORTIVA
            </Link>
            <div className="hidden md:flex items-center gap-6">
              {navLinks.map((link) => (
                <DesktopNavLink
                  key={link.href}
                  href={link.href}
                  label={link.label}
                  helpKey={link.helpKey}
                  tourId={link.tourId}
                  active={pathname.startsWith(link.href)}
                />
              ))}
              <Link
                href="/notifications"
                className={cn(
                  "nav-link text-sm cursor-pointer focus-ring rounded-md px-2 py-1 inline-flex items-center gap-1",
                  pathname.startsWith("/notifications") ? "text-accent" : "text-muted hover:text-white",
                )}
              >
                <Bell className="w-4 h-4" aria-hidden />
                Avisos
                {unreadCount > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-background text-[10px] font-bold flex items-center justify-center animate-pulse">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Link>
              {user?.is_admin && (
                <Link
                  href="/admin"
                  className={cn(
                    "nav-link text-sm cursor-pointer focus-ring rounded-md px-2 py-1",
                    pathname.startsWith("/admin") ? "text-accent" : "text-muted hover:text-white",
                  )}
                >
                  Admin
                </Link>
              )}
            </div>

            <div className="flex items-center gap-2">
              <NotificationBell />
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen((v) => !v)}
                  className="flex items-center gap-2 text-sm text-muted hover:text-white transition-[color,transform] duration-fast ease-entrance hover:-translate-y-px active:scale-[0.98] cursor-pointer focus-ring rounded-lg px-2 py-1 pressable"
                >
                  <span className="hidden md:inline">{user?.username}</span>
                  <svg
                    className={cn("w-4 h-4 transition-transform duration-fast ease-entrance", dropdownOpen && "rotate-180")}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <AnimatePresence>
                  {dropdownOpen && (
                    <MotionSafe
                      initial={{ opacity: 0, scale: 0.98, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, y: -4, transition: exitTransition() }}
                      transition={{ duration: MOTION.duration.fast, ease: MOTION.ease.entrance }}
                      className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-white/10 bg-surface shadow-xl py-1 z-50 origin-top-right"
                    >
                      <Link
                        href="/profile"
                        onClick={() => setDropdownOpen(false)}
                        className="block px-4 py-2.5 text-sm text-muted hover:text-white hover:bg-white/5 transition-colors duration-fast cursor-pointer"
                      >
                        Mi perfil
                      </Link>
                      {user?.username && (
                        <Link
                          href={`/u/${encodeURIComponent(user.username)}`}
                          onClick={() => setDropdownOpen(false)}
                          className="block px-4 py-2.5 text-sm text-muted hover:text-white hover:bg-white/5 transition-colors duration-fast cursor-pointer"
                        >
                          Mi pagina publica
                        </Link>
                      )}
                      <div className="my-1 border-t border-white/10" />
                      <button
                        type="button"
                        onClick={() => {
                          setDropdownOpen(false);
                          logout.mutate();
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-danger hover:bg-white/5 transition-colors duration-fast cursor-pointer focus-ring"
                      >
                        Cerrar sesión
                      </button>
                    </MotionSafe>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </nav>
      </header>
      <MobileBottomNav />
    </>
  );
}
