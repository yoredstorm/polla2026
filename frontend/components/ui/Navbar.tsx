"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { MobileBottomNav } from "@/components/ui/MobileBottomNav";

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/fixtures", label: "Partidos" },
  { href: "/my-bets", label: "Mis Apuestas" },
  { href: "/leaderboard", label: "Ranking" },
];

export function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
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
    <nav className="border-b border-white/10 bg-surface/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="font-display text-xl text-accent">
          POLLA DEPORTIVA
        </Link>
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm transition-colors",
                pathname.startsWith(link.href) ? "text-accent" : "text-muted hover:text-white"
              )}
            >
              {link.label}
            </Link>
          ))}
          {user?.is_admin && (
            <Link
              href="/admin"
              className={cn(
                "text-sm transition-colors",
                pathname.startsWith("/admin") ? "text-accent" : "text-muted hover:text-white"
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
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-2 text-sm text-muted hover:text-white transition-colors"
          >
            <span className="hidden md:inline">{user?.username}</span>
            <svg
              className={cn("w-4 h-4 transition-transform", dropdownOpen && "rotate-180")}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-white/10 bg-surface shadow-xl py-1 z-50">
              <Link
                href="/profile"
                onClick={() => setDropdownOpen(false)}
                className="block px-4 py-2.5 text-sm text-muted hover:text-white hover:bg-white/5 transition-colors"
              >
                Mi perfil
              </Link>
              {user?.username && (
                <Link
                  href={`/u/${encodeURIComponent(user.username)}`}
                  onClick={() => setDropdownOpen(false)}
                  className="block px-4 py-2.5 text-sm text-muted hover:text-white hover:bg-white/5 transition-colors"
                >
                  Mi pagina publica
                </Link>
              )}
              <div className="my-1 border-t border-white/10" />
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  logout.mutate();
                }}
                className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-white/5 transition-colors"
              >
                Cerrar sesion
              </button>
            </div>
          )}
        </div>
        </div>
      </div>
    </nav>
    <MobileBottomNav />
    </>
  );
}
