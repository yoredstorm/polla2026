"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ClipboardList, LayoutDashboard, RefreshCw, Trophy, Users } from "lucide-react";
import { useCompetitionSlug } from "@/components/providers/CompetitionProvider";
import { useCompetitionAdminActionQueue } from "@/hooks/useCompetitionAdmin";
import { competitionAdminPath } from "@/lib/competitionPaths";
import { cn } from "@/lib/utils";

export function CompetitionAdminMobileNav() {
  const slug = useCompetitionSlug();
  const pathname = usePathname();
  const { data } = useCompetitionAdminActionQueue(slug);
  const pendingTotal = data?.pending.total ?? 0;

  const tabs = [
    { href: competitionAdminPath(slug), label: "Inicio", icon: LayoutDashboard, exact: true },
    { href: competitionAdminPath(slug, "fixtures"), label: "Partidos", icon: Trophy, exact: false },
    { href: competitionAdminPath(slug, "live-sync"), label: "Sync", icon: RefreshCw, exact: false },
    { href: competitionAdminPath(slug, "members"), label: "Miembros", icon: Users, exact: false },
    { href: competitionAdminPath(slug, "requests"), label: "Cola", icon: ClipboardList, exact: false },
    { href: competitionAdminPath(slug, "activity"), label: "Actividad", icon: Activity, exact: false },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-white/10 bg-surface/95 backdrop-blur-md safe-area-pb"
      aria-label="Navegacion administracion competencia"
    >
      <div className="flex justify-around items-stretch h-14 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          const showBadge = tab.label === "Cola" && pendingTotal > 0;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors duration-200 cursor-pointer focus-ring relative",
                active ? "text-accent" : "text-muted hover:text-white",
              )}
            >
              <span className="relative">
                <Icon className="w-5 h-5" aria-hidden />
                {showBadge && (
                  <span className="absolute -top-1 -right-2 min-w-[14px] h-[14px] px-0.5 rounded-full bg-accent text-background text-[9px] font-bold flex items-center justify-center">
                    {pendingTotal > 9 ? "9+" : pendingTotal}
                  </span>
                )}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
