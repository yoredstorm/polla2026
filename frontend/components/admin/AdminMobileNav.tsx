"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ClipboardList, LayoutDashboard, Trophy } from "lucide-react";
import { useAdminActionQueue } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/admin", label: "Inicio", icon: LayoutDashboard, exact: true },
  { href: "/admin/fixtures", label: "Partidos", icon: Trophy, exact: false },
  { href: "/admin/requests", label: "Cola", icon: ClipboardList, exact: false },
  { href: "/admin/activity", label: "Actividad", icon: Activity, exact: false },
];

export function AdminMobileNav() {
  const pathname = usePathname();
  const { data } = useAdminActionQueue();
  const pendingTotal = data?.pending.total ?? 0;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-white/10 bg-surface/95 backdrop-blur-md safe-area-pb"
      aria-label="Navegacion administracion"
    >
      <div className="flex justify-around items-stretch h-14 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          const showBadge = tab.href === "/admin/requests" && pendingTotal > 0;
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
