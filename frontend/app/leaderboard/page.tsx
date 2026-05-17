"use client";
import { useState } from "react";
import { Navbar } from "@/components/ui/Navbar";
import { useGlobalLeaderboard, useWeeklyLeaderboard, type LeaderboardSort } from "@/hooks/useLeaderboard";
import { useAuth } from "@/hooks/useAuth";
import { LeaderboardEntryCard } from "@/components/leaderboard/LeaderboardEntryCard";

const PAGE_SIZE = 20;
/** Mínimo de apuestas hechas (incluye pendientes de liquidar) para entrar al ranking. */
const MIN_WAGERS = 1;

export default function LeaderboardPage() {
  const [view, setView] = useState<"global" | "weekly">("global");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<LeaderboardSort>("points");
  const { user } = useAuth();

  const { data: global, isLoading: globalLoading } = useGlobalLeaderboard(page, PAGE_SIZE, sort, MIN_WAGERS);
  const { data: weekly, isLoading: weeklyLoading } = useWeeklyLeaderboard(page, PAGE_SIZE, sort, MIN_WAGERS);

  const data = view === "global" ? global : weekly;
  const isLoading = view === "global" ? globalLoading : weeklyLoading;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <h1 className="font-display text-3xl text-white">Ranking</h1>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setView("global");
                setPage(1);
              }}
              className={`px-4 py-2 rounded-full text-sm transition-colors ${
                view === "global" ? "bg-accent text-background font-bold" : "bg-white/5 text-muted hover:bg-white/10"
              }`}
            >
              Global
            </button>
            <button
              onClick={() => {
                setView("weekly");
                setPage(1);
              }}
              className={`px-4 py-2 rounded-full text-sm transition-colors ${
                view === "weekly" ? "bg-accent text-background font-bold" : "bg-white/5 text-muted hover:bg-white/10"
              }`}
            >
              Esta semana
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-2">
          <span className="text-xs text-muted self-center mr-2">Ordenar por</span>
          <button
            type="button"
            onClick={() => {
              setSort("points");
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-full text-xs ${
              sort === "points" ? "bg-white/15 text-white" : "bg-white/5 text-muted hover:bg-white/10"
            }`}
          >
            Puntos
          </button>
          <button
            type="button"
            onClick={() => {
              setSort("accuracy");
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-full text-xs ${
              sort === "accuracy" ? "bg-white/15 text-white" : "bg-white/5 text-muted hover:bg-white/10"
            }`}
          >
            % acierto
          </button>
          <button
            type="button"
            onClick={() => {
              setSort("bets");
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-full text-xs ${
              sort === "bets" ? "bg-white/15 text-white" : "bg-white/5 text-muted hover:bg-white/10"
            }`}
          >
            Más apuestas
          </button>
        </div>
        <p className="text-xs text-muted mb-6">
          Mínimo {MIN_WAGERS} apuesta(s) registrada(s). El % acierto / fallos usa solo apuestas ya liquidadas.
        </p>

        {isLoading ? (
          <p className="text-muted text-center py-20">Cargando ranking...</p>
        ) : !data || data.length === 0 ? (
          <p className="text-muted text-center py-20">Sin datos de ranking aún</p>
        ) : (
          <div className="space-y-3">
            {data.map((entry, i) => (
              <LeaderboardEntryCard
                key={entry.user_id}
                entry={entry}
                isMe={entry.user_id === user?.id}
                rankIndex={i}
              />
            ))}
          </div>
        )}

        <div className="flex justify-center gap-3 mt-8">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-4 py-2 rounded-lg bg-white/5 text-muted hover:bg-white/10 disabled:opacity-30"
          >
            ← Anterior
          </button>
          <span className="px-4 py-2 text-muted">Página {page}</span>
          <button
            disabled={!data || data.length < PAGE_SIZE}
            onClick={() => setPage((p) => p + 1)}
            className="px-4 py-2 rounded-lg bg-white/5 text-muted hover:bg-white/10 disabled:opacity-30"
          >
            Siguiente →
          </button>
        </div>
      </main>
    </div>
  );
}
