"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound, Trophy, Users } from "lucide-react";
import { usePendingPasswordResetCount } from "@/hooks/useAdmin";
import { platformTabs } from "@/lib/platformAdminTabs";
import { cn } from "@/lib/utils";

const tabIcons: Record<string, typeof Trophy> = {
  "/admin/competitions": Trophy,
  "/admin/users": Users,
  "/admin/password-resets": KeyRound,
};

export function AdminMobileNav() {
  const pathname = usePathname();
  const { data: pwdPending } = usePendingPasswordResetCount();
  const pwdBadge = pwdPending?.count ?? 0;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-white/10 bg-surface/95 backdrop-blur-md safe-area-pb"
      aria-label="Navegacion panel plataforma"
    >
      <div className="flex justify-around items-stretch h-14">
        {platformTabs.map((tab) => {
          const active = pathname.startsWith(tab.href);
          const Icon = tabIcons[tab.href] ?? Trophy;
          const showBadge = tab.badgeKey === "password-resets" && pwdBadge > 0;
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
                    {pwdBadge > 9 ? "9+" : pwdBadge}
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
