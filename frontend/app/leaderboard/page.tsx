"use client";
import { useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/ui/Navbar";
import { useGlobalLeaderboard, useWeeklyLeaderboard, type LeaderboardSort } from "@/hooks/useLeaderboard";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

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
            {data.map((entry, i) => {
              const isMe = entry.user_id === user?.id;
              const wrong = entry.wrong_results ?? Math.max(0, entry.total_bets - entry.correct_results);
              const wagers = entry.wager_count ?? entry.total_bets;
              const settled = entry.total_bets;
              const vis = entry.bets_profile_visibility ?? "public";
              const showAmounts = entry.show_bet_amounts ?? true;
              const wagered = parseFloat(entry.total_wagered ?? "0");
              return (
                <div
                  key={entry.user_id}
                  className={cn(
                    "rounded-xl border bg-glass backdrop-blur-sm p-4 flex items-center gap-4 transition-shadow",
                    isMe && "border-accent/60 shadow-lg shadow-accent/15 ring-1 ring-accent/20",
                    !isMe && i === 0 && "border-yellow-500/40 shadow-lg shadow-yellow-500/10",
                    !isMe && i === 1 && "border-zinc-400/35",
                    !isMe && i === 2 && "border-amber-700/40",
                    !isMe && i > 2 && "border-white/10",
                  )}
                >
                  <span
                    className={cn(
                      "font-display text-3xl w-10 text-center shrink-0",
                      i === 0 ? "text-yellow-400" : i === 1 ? "text-zinc-300" : i === 2 ? "text-amber-600" : "text-muted",
                    )}
                  >
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : entry.position}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/u/${encodeURIComponent(entry.username)}`} className="group min-w-0">
                        <p
                          className={cn(
                            "font-medium truncate group-hover:text-accent transition-colors",
                            isMe ? "text-accent" : "text-white",
                          )}
                        >
                          @{entry.username} {isMe && "(Tú)"}
                        </p>
                      </Link>
                      <span
                        className={
                          vis === "invite_only"
                            ? "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 shrink-0"
                            : "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-200 shrink-0"
                        }
                      >
                        {vis === "invite_only" ? "Privado" : "Público"}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-1">
                      {wagers} apuesta{wagers !== 1 ? "s" : ""}
                      {wagers !== settled ? ` · ${settled} liquidada${settled !== 1 ? "s" : ""}` : ""}
                      {settled > 0
                        ? ` · ${entry.correct_results} aciertos · ${wrong} fallos · ${entry.accuracy_pct}% acierto`
                        : wagers > 0
                          ? " · sin liquidar aún"
                          : ""}
                    </p>
                    {/* Amount wagered */}
                    {wagered > 0 && (
                      <p className="text-xs mt-0.5">
                        <span className="text-muted/60">Apostado: </span>
                        {showAmounts ? (
                          <span className="text-emerald-400 font-medium">
                            S/ {wagered.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-muted/40 blur-sm select-none">
                            S/ ••••
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <span className="font-display text-2xl text-accent shrink-0">{entry.total_points}pts</span>
                </div>
              );
            })}
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
