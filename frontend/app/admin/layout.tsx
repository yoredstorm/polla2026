"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { Navbar } from "@/components/ui/Navbar";
import { cn } from "@/lib/utils";

const adminTabs = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/fixtures", label: "Partidos" },
  { href: "/admin/users", label: "Usuarios" },
  { href: "/admin/groups", label: "Polla Global" },
  { href: "/admin/requests", label: "Solicitudes" },
  { href: "/admin/activity", label: "Actividad" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && (!user || !user.is_admin)) {
      router.replace("/dashboard");
    }
  }, [user, isLoading, router]);

  if (isLoading || !user?.is_admin) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="flex items-center justify-center py-20">
          <p className="text-muted">Verificando acceso...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="border-b border-white/10 bg-surface/60">
        <div className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {adminTabs.map((tab) => {
            const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  active
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-white hover:border-white/20",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
