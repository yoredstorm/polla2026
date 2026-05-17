"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/dashboard", label: "Inicio" },
  { href: "/fixtures", label: "Partidos" },
  { href: "/my-bets", label: "Apuestas" },
  { href: "/leaderboard", label: "Ranking" },
  { href: "/profile", label: "Perfil" },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin") || pathname.startsWith("/login") || pathname.startsWith("/register")) {
    return null;
  }

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-surface/95 backdrop-blur-md safe-area-pb">
      <div className="flex items-stretch justify-around h-14">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center text-[10px] font-medium transition-colors",
                active ? "text-accent" : "text-muted",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
