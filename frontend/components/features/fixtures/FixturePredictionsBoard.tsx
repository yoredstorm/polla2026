"use client";

import { useMemo, useState } from "react";
import { Radio, Users } from "lucide-react";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
import { useFixturePredictionsBoard } from "@/hooks/useGroups";
import type { Fixture, FixtureScoreTimelineEvent } from "@/types/api";
import { cn } from "@/lib/utils";

function formatTimelineTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FixturePredictionsBoard({
  fixture,
  groupId,
  currency = "PEN",
  currentUserId,
}: {
  fixture: Fixture;
  groupId: string;
  currency?: string;
  currentUserId?: string;
}) {
  const [selectedEvent, setSelectedEvent] = useState<FixtureScoreTimelineEvent | null>(null);
  const isLive = fixture.status === "live";
  const enabled = isLive || fixture.status === "finished";

  const atScore =
    selectedEvent != null
      ? { home: selectedEvent.home_score, away: selectedEvent.away_score }
      : null;

  const { data, isLoading, isError, refetch } = useFixturePredictionsBoard(groupId, fixture.id, {
    enabled: enabled && !!groupId,
    atScore,
    refetchInterval: isLive && selectedEvent == null ? 15_000 : false,
  });

  const timeline = data?.score_timeline ?? [];

  const scoreLabel = useMemo(() => {
    if (selectedEvent) {
      return `${selectedEvent.home_score}–${selectedEvent.away_score}`;
    }
    if (data) return `${data.home_score}–${data.away_score}`;
    return `${fixture.home_score ?? 0}–${fixture.away_score ?? 0}`;
  }, [selectedEvent, data, fixture.home_score, fixture.away_score]);

  if (!enabled) return null;

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-white/10 bg-glass p-6 mb-6" role="status">
        <div className="h-6 w-48 bg-white/10 rounded animate-pulse motion-reduce:animate-none mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-white/5 rounded-lg animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section
        className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 mb-6 text-center"
        role="alert"
      >
        <p className="text-sm text-destructive">No se pudo cargar las predicciones del partido.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-2 text-xs text-accent hover:underline"
        >
          Reintentar
        </button>
      </section>
    );
  }

  if (!data || data.entries.length === 0) {
    return (
      <section className="rounded-2xl border border-white/10 bg-glass p-6 mb-6 text-center">
        <p className="text-sm text-muted">Nadie apostó este partido en la polla aún.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-glass p-6 mb-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-5 h-5 text-accent" aria-hidden />
            <h2 className="font-display text-xl text-white">Apostadores del partido</h2>
            {isLive && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-danger/20 text-danger border border-danger/30">
                <Radio className="w-3 h-3" aria-hidden />
                En vivo
              </span>
            )}
            {fixture.status === "finished" && (
              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Final
              </span>
            )}
          </div>
          <p className="text-xs text-muted">
            Marcador {selectedEvent ? "en ese momento" : "actual"}:{" "}
            <span className="text-white font-medium">{scoreLabel}</span>
            {" · "}
            {data.participant_count} participante{data.participant_count === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {timeline.length > 1 && (
        <div className="overflow-x-auto pb-1">
          <div className="flex gap-2 min-w-max">
            <button
              type="button"
              onClick={() => setSelectedEvent(null)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-lg border transition-colors",
                selectedEvent == null
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-white/10 text-muted hover:text-white",
              )}
            >
              Actual
            </button>
            {timeline.map((ev, i) => (
              <button
                key={`${ev.recorded_at}-${i}`}
                type="button"
                onClick={() => setSelectedEvent(ev)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap",
                  selectedEvent?.recorded_at === ev.recorded_at &&
                    selectedEvent.home_score === ev.home_score &&
                    selectedEvent.away_score === ev.away_score
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-white/10 text-muted hover:text-white",
                )}
              >
                {ev.home_score}–{ev.away_score}
                <span className="text-muted ml-1">({formatTimelineTime(ev.recorded_at)})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="grid grid-cols-[2.5rem_1fr_4.5rem_3.5rem] gap-x-2 px-3 py-2 bg-white/[0.04] border-b border-white/10 text-[10px] uppercase tracking-wider text-muted">
          <span>#</span>
          <span>Jugador</span>
          <span className="text-center">Predicción</span>
          <span className="text-right">Pts</span>
        </div>
        <ol className="divide-y divide-white/[0.06]" role="list">
          {data.entries.map((row) => {
            const isMe = row.user_id === currentUserId;
            const pts =
              fixture.status === "finished" && row.points_earned != null
                ? row.points_earned
                : row.display_points;
            return (
              <li
                key={row.user_id}
                className={cn(
                  "grid grid-cols-[2.5rem_1fr_4.5rem_3.5rem] gap-x-2 px-3 py-2.5 text-sm items-center",
                  isMe && "bg-accent/5",
                )}
              >
                <span
                  className={cn(
                    "font-display text-center",
                    row.position === 1 ? "text-yellow-400" : "text-muted",
                  )}
                >
                  {row.position}
                </span>
                <div className="min-w-0">
                  {row.is_blurred ? (
                    <span className="text-muted text-xs blur-sm select-none" aria-label="Perfil privado">
                      Perfil privado
                    </span>
                  ) : (
                    <UserDisplayName
                      username={row.username ?? "?"}
                      firstName={row.first_name}
                      lastName={row.last_name}
                      nameClassName={isMe ? "text-accent" : undefined}
                    />
                  )}
                  {isMe && <span className="text-accent text-xs ml-1">(Tú)</span>}
                </div>
                <span className="text-center font-display text-white">
                  {row.is_blurred ? (
                    <span className="blur-sm select-none text-muted">?–?</span>
                  ) : (
                    `${row.predicted_home_score}–${row.predicted_away_score}`
                  )}
                </span>
                <span className="text-right font-bold text-accent tabular-nums">{pts}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <p className="text-[11px] text-muted">
        Los perfiles privados aparecen en la lista pero con datos difuminados. Los puntos se
        actualizan en tiempo real según el marcador del partido.
        {parseFloat(data.entries[0]?.amount ?? "0") > 0 && (
          <span> Montos extra visibles solo si el usuario lo permite.</span>
        )}
      </p>
    </section>
  );
}
