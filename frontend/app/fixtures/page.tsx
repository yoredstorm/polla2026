"use client";
import { PageShell } from "@/components/layout/PageShell";
import { HelpSectionTitle } from "@/components/features/help/HelpSectionTitle";
import { HelpTooltip } from "@/components/features/help/HelpTooltip";
import { Chip } from "@/components/ui/Chip";
import { MatchCard } from "@/components/features/betting/MatchCard";
import { MatchCardSkeleton } from "@/components/ui/Skeleton";
import { QueryState } from "@/components/ui/QueryState";
import { useFixturesListPage } from "@/hooks/fixtures/useFixturesListPage";
import type { FixtureStatus } from "@/types/api";

const GROUPS = [
  { id: undefined, label: "Todos" },
  { id: "Group A", label: "A" },
  { id: "Group B", label: "B" },
  { id: "Group C", label: "C" },
  { id: "Group D", label: "D" },
  { id: "Group E", label: "E" },
  { id: "Group F", label: "F" },
  { id: "Group G", label: "G" },
  { id: "Group H", label: "H" },
  { id: "Group I", label: "I" },
  { id: "Group J", label: "J" },
  { id: "Group K", label: "K" },
  { id: "Group L", label: "L" },
];

const STATUSES: { value: FixtureStatus | undefined; label: string }[] = [
  { value: undefined, label: "Todos" },
  { value: "scheduled", label: "Programados" },
  { value: "live", label: "En Vivo" },
  { value: "finished", label: "Finalizados" },
];

export default function FixturesPage() {
  const {
    groupName,
    status,
    page,
    setPage,
    culminadosRef,
    fixturesQuery,
    finishedQuery,
    selectGroup,
    selectStatus,
  } = useFixturesListPage();

  const { data, isLoading, isError, refetch } = fixturesQuery;
  const {
    data: finishedData,
    isLoading: finishedLoading,
    isError: finishedError,
    refetch: refetchFinished,
  } = finishedQuery;

  return (
    <PageShell maxWidth="xl">
        <HelpSectionTitle as="h1" helpKey="page.fixtures" className="mb-2">
          Partidos
        </HelpSectionTitle>
        <p className="text-muted text-sm mb-6">FIFA World Cup 2026</p>

        <div className="flex flex-col gap-3 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-muted text-xs uppercase tracking-wider">Filtros</span>
            <HelpTooltip helpKey="page.fixtures.filters" label="Filtros de partidos" />
          </div>
          <div className="flex gap-2 flex-wrap items-center overflow-x-auto snap-x snap-mandatory pb-1 -mx-1 px-1 md:overflow-visible md:snap-none">
            <span className="text-muted text-xs uppercase tracking-wider mr-1 shrink-0">Grupo:</span>
            {GROUPS.map((g) => (
              <Chip
                key={g.id ?? "all"}
                className="!px-3 !py-1.5 !text-sm shrink-0 snap-start"
                active={groupName === g.id}
                onClick={() => selectGroup(g.id)}
              >
                {g.label}
              </Chip>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-muted text-xs uppercase tracking-wider mr-1">Estado:</span>
            {STATUSES.map((s) => (
              <Chip
                key={s.value ?? "all"}
                className="!px-3 !py-1.5 !text-sm"
                active={status === s.value}
                onClick={() => selectStatus(s.value)}
              >
                {s.label}
              </Chip>
            ))}
          </div>
        </div>

        <h2 className="text-sm font-medium text-white/90 mb-3">Próximos y en curso</h2>

        <QueryState
          isLoading={isLoading}
          isError={isError}
          isEmpty={!data?.data.length}
          onRetry={() => refetch()}
          errorMessage="No se pudieron cargar los partidos."
          loadingSlot={
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <MatchCardSkeleton key={i} />
              ))}
            </div>
          }
          emptySlot={
            <div className="text-center text-muted py-12">No hay partidos con estos filtros</div>
          }
        >
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data?.data.map((fixture, i) => (
                <MatchCard key={fixture.id} fixture={fixture} index={i} />
              ))}
            </div>

            {data && data.pagination.total_pages > 1 && (
              <div className="flex justify-center gap-3 mt-8">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-4 py-2 rounded-lg bg-white/5 text-muted hover:bg-white/10 disabled:opacity-30 min-h-11"
                  aria-label="Página anterior"
                >
                  ← Anterior
                </button>
                <span className="px-4 py-2 text-muted" aria-current="page">
                  {page} / {data.pagination.total_pages}
                </span>
                <button
                  disabled={page >= data.pagination.total_pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-4 py-2 rounded-lg bg-white/5 text-muted hover:bg-white/10 disabled:opacity-30 min-h-11"
                  aria-label="Página siguiente"
                >
                  Siguiente →
                </button>
              </div>
            )}
          </>
        </QueryState>

        <section
          id="culminados"
          ref={culminadosRef}
          className="mt-14 pt-10 border-t border-white/10 scroll-mt-24"
        >
          <h2 className="font-display text-xl text-white mb-1">Partidos culminados</h2>
          <p className="text-muted text-sm mb-6">
            Resultados finales cuando el administrador liquida el partido. También recibirás una notificación con el marcador.
          </p>

          <QueryState
            isLoading={finishedLoading}
            isError={finishedError}
            isEmpty={!finishedData?.data.length}
            onRetry={() => refetchFinished()}
            errorMessage="No se pudieron cargar los partidos culminados."
            loadingSlot={
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[0, 1, 2].map((i) => (
                  <MatchCardSkeleton key={i} />
                ))}
              </div>
            }
            emptySlot={
              <div className="text-center text-muted py-12 rounded-xl border border-white/5 bg-white/[0.02]">
                Aún no hay partidos finalizados para este filtro.
              </div>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {finishedData?.data.map((fixture, i) => (
                <MatchCard key={fixture.id} fixture={fixture} index={i} highlightFinished />
              ))}
            </div>
          </QueryState>
        </section>
    </PageShell>
  );
}
