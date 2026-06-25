"use client";

import { useEffect, useState } from "react";
import { Minus, Plus, Play, Flag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  useSettleFixture,
  useUpdateFixtureLiveScore,
  useUpdateFixtureStatus,
} from "@/hooks/useAdmin";
import { useToast } from "@/components/ui/Toast";
import type { Fixture } from "@/types/api";
import { cn } from "@/lib/utils";

export function FixtureAdminLivePanel({ fixture }: { fixture: Fixture }) {
  const toast = useToast((s) => s.add);
  const updateStatus = useUpdateFixtureStatus();
  const updateLiveScore = useUpdateFixtureLiveScore();
  const settle = useSettleFixture();

  const [homeScore, setHomeScore] = useState(fixture.home_score ?? 0);
  const [awayScore, setAwayScore] = useState(fixture.away_score ?? 0);
  const [confirmSettle, setConfirmSettle] = useState(false);

  useEffect(() => {
    setHomeScore(fixture.home_score ?? 0);
    setAwayScore(fixture.away_score ?? 0);
  }, [fixture.home_score, fixture.away_score, fixture.status]);

  const isPending =
    updateStatus.isPending || updateLiveScore.isPending || settle.isPending;

  async function startMatch() {
    try {
      await updateStatus.mutateAsync({ fixtureId: fixture.id, status: "live" });
      toast("Partido iniciado — en vivo", "success");
    } catch {
      toast("No se pudo iniciar el partido", "error");
    }
  }

  async function saveLiveScore() {
    try {
      await updateLiveScore.mutateAsync({
        fixtureId: fixture.id,
        homeScore,
        awayScore,
      });
      toast("Marcador actualizado", "success");
    } catch {
      toast("No se pudo guardar el marcador", "error");
    }
  }

  async function finishAndSettle() {
    try {
      const res = await settle.mutateAsync({
        fixtureId: fixture.id,
        homeScore,
        awayScore,
      });
      toast(
        `Partido liquidado — ${res.settled_count} apuesta(s) puntuadas`,
        "success",
      );
      setConfirmSettle(false);
    } catch {
      toast("No se pudo liquidar el partido", "error");
    }
  }

  if (fixture.status === "finished" || fixture.status === "cancelled") {
    return (
      <section className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 mb-6">
        <p className="text-sm text-emerald-300 font-medium">Partido finalizado y liquidado.</p>
        <p className="text-xs text-muted mt-1">
          Marcador final: {fixture.home_score ?? 0}–{fixture.away_score ?? 0}
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 mb-6 space-y-4"
      aria-label="Control de partido (admin)"
    >
      <p className="text-xs uppercase tracking-wide text-amber-300/90 font-medium">
        Control admin del partido
      </p>

      {fixture.status === "scheduled" && (
        <Button
          type="button"
          variant="primary"
          size="md"
          disabled={isPending}
          onClick={() => void startMatch()}
          className="w-full sm:w-auto"
        >
          <Play className="w-4 h-4 mr-1.5" aria-hidden />
          Iniciar partido
        </Button>
      )}

      {fixture.status === "live" && (
        <>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <ScoreStepper
              label={fixture.home_team}
              value={homeScore}
              onChange={setHomeScore}
              disabled={isPending}
            />
            <span className="text-muted font-display text-xl">–</span>
            <ScoreStepper
              label={fixture.away_team}
              value={awayScore}
              onChange={setAwayScore}
              disabled={isPending}
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="flex-1"
              disabled={isPending}
              onClick={() => void saveLiveScore()}
            >
              Guardar marcador
            </Button>
            {!confirmSettle ? (
              <Button
                type="button"
                variant="primary"
                size="md"
                className="flex-1"
                disabled={isPending}
                onClick={() => setConfirmSettle(true)}
              >
                <Flag className="w-4 h-4 mr-1.5" aria-hidden />
                Finalizar y liquidar
              </Button>
            ) : (
              <div className="flex-1 flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  className="flex-1"
                  disabled={isPending}
                  onClick={() => setConfirmSettle(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  disabled={isPending}
                  onClick={() => void finishAndSettle()}
                >
                  Confirmar liquidación
                </Button>
              </div>
            )}
          </div>

          {confirmSettle && (
            <p className="text-xs text-amber-200/80">
              Se cerrará el partido con marcador {homeScore}–{awayScore} y se calcularán los
              puntos de todas las apuestas.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function ScoreStepper({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1 min-w-[100px]">
      <span className="text-[10px] text-muted uppercase tracking-wide text-center line-clamp-2">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
          className={cn(
            "w-9 h-9 rounded-lg border border-white/15 flex items-center justify-center",
            "hover:bg-white/10 disabled:opacity-40",
          )}
          aria-label={`Menos goles ${label}`}
        >
          <Minus className="w-4 h-4" />
        </button>
        <span className="font-display text-3xl text-white w-10 text-center tabular-nums">
          {value}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(value + 1)}
          className={cn(
            "w-9 h-9 rounded-lg border border-white/15 flex items-center justify-center",
            "hover:bg-white/10 disabled:opacity-40",
          )}
          aria-label={`Más goles ${label}`}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
