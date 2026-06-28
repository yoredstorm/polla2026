"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { useCompetitionSlug } from "@/components/providers/CompetitionProvider";
import { useCompetitionContext } from "@/hooks/useCompetitions";
import { useCompetitionAdminActionQueue } from "@/hooks/useCompetitionAdmin";
import { CompetitionAdminMobileNav } from "@/components/features/admin/CompetitionAdminMobileNav";
import { competitionAdminPath, competitionDashboardPath } from "@/lib/competitionPaths";
import { cn } from "@/lib/utils";

function TabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-1.5 inline-flex min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-background text-[10px] font-bold items-center justify-center">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function CompetitionAdminLayout({ children }: { children: React.ReactNode }) {
  const slug = useCompetitionSlug();
  const router = useRouter();
  const pathname = usePathname();
  const { data: ctx, isLoading } = useCompetitionContext();
  const { data: actionQueue } = useCompetitionAdminActionQueue(slug);

  useEffect(() => {
    if (!isLoading && ctx && !ctx.is_admin) {
      router.replace(competitionDashboardPath(slug));
    }
  }, [ctx, isLoading, router, slug]);

  if (isLoading || !ctx?.is_admin) {
    return (
      <PageShell maxWidth="xl" withMobileNav={false}>
        <p className="text-center text-muted py-20">Verificando acceso...</p>
      </PageShell>
    );
  }

  const pending = actionQueue?.pending;
  const requestsBadge = pending?.change_requests ?? 0;
  const membersBadge =
    (pending?.entries ?? 0) +
    (pending?.extras ?? 0) +
    (pending?.phase_enrollments ?? 0);

  const adminTabs = [
    { href: competitionAdminPath(slug), label: "Dashboard", badge: 0, exact: true },
    { href: competitionAdminPath(slug, "fixtures"), label: "Partidos", badge: 0, exact: false },
    { href: competitionAdminPath(slug, "members"), label: "Miembros y pagos", badge: membersBadge, exact: false },
    { href: competitionAdminPath(slug, "requests"), label: "Solicitudes", badge: requestsBadge, exact: false },
    { href: competitionAdminPath(slug, "activity"), label: "Actividad", badge: 0, exact: false },
  ];

  return (
    <PageShell maxWidth="xl" withMobileNav={false} mainClassName="py-6 pb-20 md:pb-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Admin — <span className="text-white">{ctx.name}</span>
        </p>
        <Link
          href={competitionDashboardPath(slug)}
          className="text-xs text-accent hover:underline focus-ring rounded"
        >
          Volver a la competencia
        </Link>
      </div>
      <div className="border-b border-white/10 bg-surface/60 -mx-4 px-4 mb-6 rounded-xl overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {adminTabs.map((tab) => {
            const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
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
                <TabBadge count={tab.badge} />
              </Link>
            );
          })}
        </div>
      </div>
      {children}
      <CompetitionAdminMobileNav />
    </PageShell>
  );
}
