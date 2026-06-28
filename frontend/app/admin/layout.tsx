"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/layout/PageShell";
import { cn } from "@/lib/utils";

const platformTabs = [
  { href: "/admin/competitions", label: "Competencias" },
  { href: "/admin/users", label: "Usuarios" },
  { href: "/admin/marquee", label: "Marquesina" },
];

const LEGACY_OPERATIONAL_PREFIXES = [
  "/admin/fixtures",
  "/admin/groups",
  "/admin/requests",
  "/admin/activity",
  "/admin/live-sync",
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && (!user || !user.is_admin)) {
      router.replace("/competitions");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (LEGACY_OPERATIONAL_PREFIXES.some((p) => pathname.startsWith(p))) {
      router.replace("/admin/competitions");
    }
  }, [pathname, router]);

  if (isLoading || !user?.is_admin) {
    return (
      <PageShell maxWidth="xl" withMobileNav={false}>
        <p className="text-center text-muted py-20">Verificando acceso...</p>
      </PageShell>
    );
  }

  return (
    <PageShell maxWidth="xl" withMobileNav={false} mainClassName="py-6 pb-6">
      <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/90">
        Panel de plataforma (super admin). La operación diaria de cada competencia está en{" "}
        <span className="text-white font-medium">Admin</span> dentro de la competencia.
      </div>
      <div className="border-b border-white/10 bg-surface/60 -mx-4 px-4 mb-6 rounded-xl overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {platformTabs.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-200 whitespace-nowrap cursor-pointer focus-ring",
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
      {children}
    </PageShell>
  );
}
