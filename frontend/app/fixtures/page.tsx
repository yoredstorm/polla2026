"use client";
import { useEffect, useRef, useState } from "react";
import { Navbar } from "@/components/ui/Navbar";
import { MatchCard } from "@/components/betting/MatchCard";
import { useFixtures } from "@/hooks/useFixtures";
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
  const [groupName, setGroupName] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<FixtureStatus | undefined>(undefined);
  const [page, setPage] = useState(1);
  const culminadosRef = useRef<HTMLElement>(null);

  const { data, isLoading } = useFixtures({
    group_name: groupName,
    status,
    page,
    exclude_finished: status === undefined ? true : undefined,
  });

  const { data: finishedData, isLoading: finishedLoading } = useFixtures({
    group_name: groupName,
    status: "finished",
    page: 1,
    limit: 12,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#culminados") return;
    const t = window.setTimeout(() => {
      culminadosRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(t);
  }, [finishedData?.data?.length]);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="font-display text-3xl text-white mb-2">Partidos</h1>
        <p className="text-muted text-sm mb-6">FIFA World Cup 2026</p>

        {/* Filters */}
        <div className="flex flex-col gap-3 mb-6">
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-muted text-xs uppercase tracking-wider mr-1">Grupo:</span>
            {GROUPS.map((g) => (
              <button
                key={g.id ?? "all"}
                onClick={() => {
                  setGroupName(g.id);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  groupName === g.id
                    ? "bg-accent text-background font-bold"
                    : "bg-white/5 text-muted hover:bg-white/10"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-muted text-xs uppercase tracking-wider mr-1">Estado:</span>
            {STATUSES.map((s) => (
              <button
                key={s.value ?? "all"}
                onClick={() => {
                  setStatus(s.value);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  status === s.value
                    ? "bg-accent text-background font-bold"
                    : "bg-white/5 text-muted hover:bg-white/10"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <h2 className="text-sm font-medium text-white/90 mb-3">Próximos y en curso</h2>

        {isLoading ? (
          <div className="text-center text-muted py-20">Cargando partidos...</div>
        ) : data?.data.length === 0 ? (
          <div className="text-center text-muted py-12">No hay partidos con estos filtros</div>
        ) : (
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
                  className="px-4 py-2 rounded-lg bg-white/5 text-muted hover:bg-white/10 disabled:opacity-30"
                >
                  ← Anterior
                </button>
                <span className="px-4 py-2 text-muted">
                  {page} / {data.pagination.total_pages}
                </span>
                <button
                  disabled={page >= data.pagination.total_pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-4 py-2 rounded-lg bg-white/5 text-muted hover:bg-white/10 disabled:opacity-30"
                >
                  Siguiente →
                </button>
              </div>
            )}
          </>
        )}

        <section
          id="culminados"
          ref={culminadosRef}
          className="mt-14 pt-10 border-t border-white/10 scroll-mt-24"
        >
          <h2 className="font-display text-xl text-white mb-1">Partidos culminados</h2>
          <p className="text-muted text-sm mb-6">
            Resultados finales cuando el administrador liquida el partido. También recibirás una notificación con el marcador.
          </p>

          {finishedLoading ? (
            <div className="text-center text-muted py-12">Cargando resultados...</div>
          ) : !finishedData?.data.length ? (
            <div className="text-center text-muted py-12 rounded-xl border border-white/5 bg-white/[0.02]">
              Aún no hay partidos finalizados para este filtro.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {finishedData.data.map((fixture, i) => (
                <MatchCard key={fixture.id} fixture={fixture} index={i} highlightFinished />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
