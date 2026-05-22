"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Swords } from "lucide-react";
import { useMyChallenges, type Challenge } from "@/hooks/useChallenges";
import { ChallengeHistoryCard } from "@/components/betting/ChallengeHistoryCard";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type Filter = "all" | "won" | "lost" | "open";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "won", label: "Ganados" },
  { id: "lost", label: "Perdidos" },
  { id: "open", label: "En curso" },
];

function matchesFilter(ch: Challenge, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "won") return ch.duel_result === "won";
  if (filter === "lost") return ch.duel_result === "lost";
  return ch.duel_result === "active" || ch.duel_result === "pending";
}

export function MyChallengesSection() {
  const { data: challenges, isLoading } = useMyChallenges();
  const [filter, setFilter] = useState<Filter>("all");

  const stats = useMemo(() => {
    const list = challenges ?? [];
    let won = 0;
    let lost = 0;
    let net = 0;
    for (const ch of list) {
      if (ch.duel_result === "won") won += 1;
      if (ch.duel_result === "lost") lost += 1;
      if (ch.ranking_delta != null) net += ch.ranking_delta;
    }
    return { won, lost, net };
  }, [challenges]);

  const filtered = useMemo(
    () => (challenges ?? []).filter((ch) => matchesFilter(ch, filter)),
    [challenges, filter],
  );

  const incomingPending = useMemo(
    () =>
      (challenges ?? []).filter(
        (ch) =>
          ch.duel_result === "pending" &&
          ch.status === "pending" &&
          ch.is_challenger === false,
      ),
    [challenges],
  );

  return (
    <section className="mt-12 pt-10 border-t border-white/10">
      {incomingPending.length > 0 && (
        <Card className="mb-6 border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="flex items-start gap-3">
              <Swords className="w-6 h-6 text-amber-300 shrink-0" aria-hidden />
              <div>
                <p className="font-medium text-white">
                  {incomingPending.length} reto{incomingPending.length !== 1 ? "s" : ""} esperando tu respuesta
                </p>
                <p className="text-sm text-muted mt-0.5">
                  Acepta o rechaza antes de que cierre el partido.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="shrink-0"
              onClick={() => setFilter("open")}
            >
              Ver retos pendientes
            </Button>
          </div>
          <ul className="mt-4 space-y-2">
            {incomingPending.slice(0, 3).map((ch) => (
              <li key={ch.id}>
                <ChallengeHistoryCard challenge={ch} highlight />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mb-6">
        <h2 className="font-display text-2xl text-white">Retos 1v1</h2>
        <p className="text-sm text-muted mt-1">
          Historial de duelos <span className="text-white/80">Te reto</span> y cómo afectaron tu ranking.
        </p>
      </div>

      {!isLoading && (challenges?.length ?? 0) > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-center">
            <p className="text-xs text-muted">Ganados</p>
            <p className="font-display text-2xl text-emerald-400">{stats.won}</p>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-center">
            <p className="text-xs text-muted">Perdidos</p>
            <p className="font-display text-2xl text-red-400">{stats.lost}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center col-span-2 sm:col-span-2">
            <p className="text-xs text-muted">Impacto neto (retos liquidados)</p>
            <p
              className={cn(
                "font-display text-2xl",
                stats.net > 0 ? "text-emerald-400" : stats.net < 0 ? "text-red-400" : "text-white",
              )}
            >
              {stats.net > 0 ? "+" : ""}
              {stats.net} pts
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              filter === f.id
                ? "bg-accent text-background"
                : "bg-white/5 text-muted hover:bg-white/10 hover:text-white",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-muted text-center py-12">Cargando retos...</p>
      ) : !challenges?.length ? (
        <Card className="p-8 text-center">
          <p className="text-muted mb-2">Aún no tienes retos 1v1</p>
          <p className="text-xs text-muted mb-4">
            Apuesta un partido y reta a otro jugador desde la ficha del encuentro.
          </p>
          <Link href="/fixtures" className="text-accent text-sm hover:underline">
            Ver partidos →
          </Link>
        </Card>
      ) : filtered.length === 0 ? (
        <p className="text-muted text-center py-8 text-sm">No hay retos en este filtro.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((ch) => (
            <ChallengeHistoryCard key={ch.id} challenge={ch} />
          ))}
        </div>
      )}
    </section>
  );
}
