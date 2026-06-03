"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/layout/PageShell";
import { AdminMobileNav } from "@/components/features/admin/AdminMobileNav";
import { useAdminActionQueue } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";

const adminTabs = [
  { href: "/admin", label: "Dashboard", badgeKey: null as string | null },
  { href: "/admin/fixtures", label: "Partidos", badgeKey: null },
  { href: "/admin/users", label: "Usuarios", badgeKey: null },
  { href: "/admin/groups", label: "Polla Global", badgeKey: "entries" as const },
  { href: "/admin/marquee", label: "Marquesina", badgeKey: null },
  { href: "/admin/requests", label: "Solicitudes", badgeKey: "requests" as const },
  { href: "/admin/activity", label: "Actividad", badgeKey: null },
];

function TabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-1.5 inline-flex min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-background text-[10px] font-bold items-center justify-center">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { data: actionQueue } = useAdminActionQueue();
  const pending = actionQueue?.pending;

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

  const requestsBadge =
    (pending?.change_requests ?? 0) + (pending?.password_resets ?? 0);
  const groupsBadge = (pending?.entries ?? 0) + (pending?.extras ?? 0);

  return (
    <PageShell
      maxWidth="xl"
      withMobileNav={false}
      mainClassName="py-6 pb-20 md:pb-6"
    >
      <div className="border-b border-white/10 bg-surface/60 -mx-4 px-4 mb-6 rounded-xl overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {adminTabs.map((tab) => {
            const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
            const badgeCount =
              tab.badgeKey === "requests"
                ? requestsBadge
                : tab.badgeKey === "entries"
                  ? groupsBadge
                  : 0;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-200 whitespace-nowrap cursor-pointer focus-ring inline-flex items-center",
                  active
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-white hover:border-white/20",
                )}
              >
                {tab.label}
                <TabBadge count={badgeCount} />
              </Link>
            );
          })}
        </div>
      </div>
      {children}
      <AdminMobileNav />
    </PageShell>
  );
}
