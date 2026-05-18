"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/ui/PageShell";
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
      <PageShell maxWidth="xl" withMobileNav={false}>
        <p className="text-center text-muted py-20">Verificando acceso...</p>
      </PageShell>
    );
  }

  return (
    <PageShell maxWidth="xl" withMobileNav={false} mainClassName="py-6">
      <div className="border-b border-white/10 bg-surface/60 -mx-4 px-4 mb-6 rounded-xl overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {adminTabs.map((tab) => {
            const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
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
