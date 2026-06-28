"use client";

import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { MatchCardSkeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import {
  useAdminCompetitions,
  useAdministeredCompetitions,
  useDiscoverCompetitions,
  useMyCompetitions,
} from "@/hooks/useCompetitions";
import { competitionDashboardPath } from "@/lib/competitionPaths";
import { cn } from "@/lib/utils";

function CompetitionGrid({
  title,
  items,
  empty,
}: {
  title: string;
  items: Array<{
    slug: string;
    name: string;
    status: string;
    logo_url: string | null;
    primary_color: string;
    is_member: boolean;
    member_count: number;
  }>;
  empty: string;
}) {
  if (!items.length) {
    return (
      <section className="mb-10">
        <h2 className="font-display text-xl text-white mb-4">{title}</h2>
        <p className="text-muted text-sm">{empty}</p>
      </section>
    );
  }
  return (
    <section className="mb-10">
      <h2 className="font-display text-xl text-white mb-4">{title}</h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="list">
        {items.map((c) => (
          <li key={c.slug}>
            <Link
              href={competitionDashboardPath(c.slug)}
              className={cn(
                "block rounded-xl border border-white/10 bg-glass p-5 transition-all",
                "hover:border-white/20 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              )}
            >
              <div className="flex items-center gap-3 mb-3">
                {c.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.logo_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                ) : (
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: c.primary_color }}
                    aria-hidden
                  >
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-display text-lg text-white">{c.name}</p>
                  <p className="text-xs text-muted capitalize">{c.status.replace("_", " ")}</p>
                </div>
              </div>
              <p className="text-sm text-muted">
                {c.member_count} participantes
                {c.is_member ? " · Ya participas" : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function CompetitionsPickerPage() {
  const { user } = useAuth();
  const { data: mine, isLoading: mineLoading } = useMyCompetitions();
  const { data: discover, isLoading: discoverLoading } = useDiscoverCompetitions();
  const { data: allComps, isLoading: allLoading } = useAdminCompetitions({
    enabled: !!user?.is_admin,
  });
  const { data: administered, isLoading: administeredLoading } = useAdministeredCompetitions();

  const isLoading =
    mineLoading ||
    discoverLoading ||
    (user?.is_admin && allLoading) ||
    administeredLoading;

  if (isLoading) {
    return (
      <PageShell maxWidth="lg">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <MatchCardSkeleton key={i} />
          ))}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell maxWidth="lg">
      <header className="mb-8">
        <h1 className="font-display text-3xl text-white">Mis competencias</h1>
        <p className="text-muted mt-2 text-sm">
          Elige una competencia para entrar a tu quiniela. Puedes participar en varias a la vez.
        </p>
      </header>
      <CompetitionGrid
        title="Donde participo"
        items={mine ?? []}
        empty="Aún no te has unido a ninguna competencia. Explora las disponibles abajo."
      />
      {user?.is_admin && (
        <CompetitionGrid
          title="Todas las competencias (plataforma)"
          items={(allComps ?? []).map((c) => ({
            ...c,
            is_member: mine?.some((m) => m.slug === c.slug) ?? false,
          }))}
          empty="No hay competencias registradas."
        />
      )}
      {!user?.is_admin && (administered?.length ?? 0) > 0 && (
        <CompetitionGrid
          title="Administro"
          items={administered ?? []}
          empty=""
        />
      )}
      <CompetitionGrid
        title="Descubrir"
        items={(discover ?? []).filter((c) => !c.is_member)}
        empty="No hay competencias públicas abiertas en este momento."
      />
    </PageShell>
  );
}
