"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Minus, Plus, Play, Flag, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
import {
  useSettleFixture,
  useRegisterFixtureGoal,
  useUpdateFixtureLiveScore,
  useUpdateFixtureStatus,
  usePatchFixtureSyncMode,
} from "@/hooks/useAdmin";
import { SyncStatusBadge } from "@/components/features/admin/SyncStatusBadge";
import { useFixturePredictionsBoard } from "@/hooks/useGroups";
import { useToast } from "@/components/ui/Toast";
import {
  buildGoalScoredPayload,
  handleGoalScoredEvent,
  isSingleGoalIncrement,
  playGoalSoundInline,
  prepareGoalAudio,
} from "@/lib/goalCelebration";
import type { Fixture } from "@/types/api";
import { cn, formatMatchDate } from "@/lib/utils";
import {
  canAdminStartLive,
  formatDeadlineRemaining,
  getKickoffAt,
  isAdminLiveStartExpired,
} from "@/lib/matchTiming";

export function FixtureAdminLivePanel({
  fixture,
  groupId,
}: {
  fixture: Fixture;
  groupId?: string;
}) {
  const toast = useToast((s) => s.add);
  const updateStatus = useUpdateFixtureStatus();
  const registerGoal = useRegisterFixtureGoal();
  const updateLiveScore = useUpdateFixtureLiveScore();
  const settle = useSettleFixture();
  const patchSyncMode = usePatchFixtureSyncMode();

  const [homeScore, setHomeScore] = useState(fixture.home_score ?? 0);
  const [awayScore, setAwayScore] = useState(fixture.away_score ?? 0);
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [scoreDirty, setScoreDirty] = useState(false);

  const savedHome = fixture.home_score ?? 0;
  const savedAway = fixture.away_score ?? 0;
  const hasUnsavedScore =
    fixture.status === "live" &&
    (homeScore !== savedHome || awayScore !== savedAway);

  useEffect(() => {
    if (scoreDirty) return;
    setHomeScore(fixture.home_score ?? 0);
    setAwayScore(fixture.away_score ?? 0);
  }, [fixture.home_score, fixture.away_score, fixture.status, scoreDirty]);

  useEffect(() => {
    if (fixture.status !== "scheduled") return;
    const tick = () => setNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, [fixture.status, fixture.match_date]);

  const isPending =
    updateStatus.isPending || registerGoal.isPending || updateLiveScore.isPending || settle.isPending;

  const liveStartExpired = isAdminLiveStartExpired(fixture, nowMs);
  const canStartLive = canAdminStartLive(fixture, nowMs);
  const kickoffMs = getKickoffAt(fixture);
  const beforeKickoff = kickoffMs > nowMs;

  async function recordGoal(team: "home" | "away") {
    prepareGoalAudio();
    const prevHome = savedHome;
    const prevAway = savedAway;
    try {
      const result = await registerGoal.mutateAsync({ fixtureId: fixture.id, team });
      playGoalSoundInline(true);
      void handleGoalScoredEvent(
        buildGoalScoredPayload(
          fixture,
          team,
          result.home_score,
          result.away_score,
          prevHome,
          prevAway,
          result.minute,
        ),
        {
          fromLocalAction: true,
          forceCelebrate: true,
        },
      );
    } catch {
      toast("No se pudo registrar el gol", "error");
    }
  }

  async function startMatch() {
    if (!canStartLive) {
      toast(
        liveStartExpired
          ? "El horario para iniciar en vivo ya pasó"
          : "Aún no es la hora del partido",
        "error",
      );
      return;
    }
    try {
      await updateStatus.mutateAsync({ fixtureId: fixture.id, status: "live" });
      toast("Partido iniciado — en vivo", "success");
    } catch {
      toast("No se pudo iniciar el partido", "error");
    }
  }

  async function saveLiveScore() {
    prepareGoalAudio();
    const prevHome = savedHome;
    const prevAway = savedAway;
    try {
      await updateLiveScore.mutateAsync({
        fixtureId: fixture.id,
        homeScore,
        awayScore,
      });
      setScoreDirty(false);
      const scoringTeam = isSingleGoalIncrement(prevHome, prevAway, homeScore, awayScore);
      if (scoringTeam) {
        playGoalSoundInline(true);
        void handleGoalScoredEvent(
          buildGoalScoredPayload(fixture, scoringTeam, homeScore, awayScore, prevHome, prevAway),
          { fromLocalAction: true, forceCelebrate: true },
        );
      } else {
        toast("Marcador actualizado", "success");
      }
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
      setScoreDirty(false);
      toast(
        `Partido liquidado — ${res.settled_count} apuesta(s) puntuadas`,
        "success",
      );
      setSettleModalOpen(false);
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
    <>
      <section
        className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 mb-6 space-y-4"
        aria-label="Control de partido (admin)"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-amber-300/90 font-medium">
            Control admin del partido
          </p>
          <div className="flex items-center gap-2">
            <SyncStatusBadge syncMode={fixture.sync_mode} fixtureId={fixture.id} />
            {fixture.sync_mode === "auto" ? (
              <button
                type="button"
                onClick={() =>
                  patchSyncMode.mutate({ fixtureId: fixture.id, sync_mode: "manual" })
                }
                disabled={patchSyncMode.isPending}
                className="text-[10px] text-muted hover:text-white underline"
              >
                Desactivar sync
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  patchSyncMode.mutate({ fixtureId: fixture.id, sync_mode: "auto" })
                }
                disabled={patchSyncMode.isPending}
                className="text-[10px] text-accent hover:underline"
              >
                Activar sync auto
              </button>
            )}
          </div>
        </div>

        {fixture.status === "scheduled" && (
          <div className="space-y-2">
            {liveStartExpired ? (
              <div
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2"
                role="alert"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden />
                  <p className="text-xs text-amber-100/90">
                    El horario para iniciar en vivo terminó. Liquida el resultado desde el panel
                    de partidos.
                  </p>
                </div>
                <Link
                  href="/admin/fixtures"
                  className="inline-block text-xs font-medium text-accent hover:underline"
                >
                  Ir al panel de partidos →
                </Link>
              </div>
            ) : (
              <>
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  disabled={isPending || !canStartLive}
                  onClick={() => void startMatch()}
                  className="w-full sm:w-auto"
                  aria-describedby={!canStartLive ? "live-start-hint" : undefined}
                >
                  <Play className="w-4 h-4 mr-1.5" aria-hidden />
                  Iniciar partido
                </Button>
                {beforeKickoff && (
                  <p id="live-start-hint" className="text-xs text-muted max-w-md">
                    Disponible a partir de{" "}
                    <span className="text-white">{formatMatchDate(fixture.match_date)}</span>
                    {" "}
                    (en {formatDeadlineRemaining(kickoffMs, nowMs).toLowerCase()})
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {fixture.status === "live" && (
          <>
            {hasUnsavedScore && (
              <p
                className="text-xs text-amber-300/90 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/15 border border-amber-500/25"
                role="status"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden />
                Cambios sin publicar — guarda el marcador antes de liquidar
              </p>
            )}

            <p className="text-xs text-muted text-center max-w-md mx-auto">
              Para registrar un gol +1 usa ⚽ Gol. Los botones +/- sirven para corregir el marcador
              manualmente.
            </p>

            <div className="flex flex-wrap gap-2 justify-center">
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isPending}
                onClick={() => void recordGoal("home")}
              >
                ⚽ Gol {fixture.home_team}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isPending}
                onClick={() => void recordGoal("away")}
              >
                ⚽ Gol {fixture.away_team}
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4">
              <ScoreStepper
                label={fixture.home_team}
                value={homeScore}
                onChange={(value) => {
                  setScoreDirty(true);
                  setHomeScore(value);
                }}
                disabled={isPending}
              />
              <span className="text-muted font-display text-xl">–</span>
              <ScoreStepper
                label={fixture.away_team}
                value={awayScore}
                onChange={(value) => {
                  setScoreDirty(true);
                  setAwayScore(value);
                }}
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
              <Button
                type="button"
                variant="primary"
                size="md"
                className="flex-1"
                disabled={isPending}
                onClick={() => setSettleModalOpen(true)}
              >
                <Flag className="w-4 h-4 mr-1.5" aria-hidden />
                Finalizar y liquidar
              </Button>
            </div>
          </>
        )}
      </section>

      <SettleConfirmModal
        open={settleModalOpen}
        onClose={() => setSettleModalOpen(false)}
        fixture={fixture}
        groupId={groupId}
        homeScore={homeScore}
        awayScore={awayScore}
        savedHome={savedHome}
        savedAway={savedAway}
        isPending={settle.isPending}
        onConfirm={() => void finishAndSettle()}
      />
    </>
  );
}

function SettleConfirmModal({
  open,
  onClose,
  fixture,
  groupId,
  homeScore,
  awayScore,
  savedHome,
  savedAway,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  fixture: Fixture;
  groupId?: string;
  homeScore: number;
  awayScore: number;
  savedHome: number;
  savedAway: number;
  isPending: boolean;
  onConfirm: () => void;
}) {
  const hasUnsavedScore = homeScore !== savedHome || awayScore !== savedAway;

  const { data: preview, isLoading } = useFixturePredictionsBoard(groupId, fixture.id, {
    enabled: open && !!groupId,
    atScore: { home: homeScore, away: awayScore },
  });

  const topThree = preview?.entries.slice(0, 3) ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Confirmar liquidación"
      description={`${fixture.home_team} vs ${fixture.away_team}`}
      size="md"
    >
      <div className="space-y-4">
        <div className="text-center py-2">
          <p className="text-xs text-muted uppercase tracking-wide mb-1">Marcador final</p>
          <p className="font-display text-4xl text-white">
            {homeScore}–{awayScore}
          </p>
        </div>

        {hasUnsavedScore && (
          <p className="text-xs text-amber-300/90 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            Marcador sin guardar en vivo: se liquidará con {homeScore}–{awayScore}.
          </p>
        )}

        <p className="text-sm text-muted text-center">
          {groupId ? (
            isLoading ? (
              "Calculando apuestas…"
            ) : (
              <>
                Se puntuarán{" "}
                <span className="text-white font-medium">
                  {preview?.participant_count ?? "—"}
                </span>{" "}
                apuesta{preview?.participant_count === 1 ? "" : "s"} de la polla.
              </>
            )
          ) : (
            "No se pudo cargar el conteo de apuestas de la polla."
          )}
        </p>

        {topThree.length > 0 && (
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <p className="text-[10px] uppercase tracking-wider text-muted px-3 py-2 bg-white/[0.04] border-b border-white/10">
              Top 3 proyectado
            </p>
            <ul className="divide-y divide-white/[0.06]" role="list">
              {topThree.map((row) => (
                <li
                  key={row.user_id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span className="text-muted w-5 text-center">{row.position}</span>
                  <span className="flex-1 min-w-0 truncate">
                    {row.is_blurred ? (
                      <span className="text-muted text-xs blur-sm select-none">Perfil privado</span>
                    ) : (
                      <UserDisplayName
                        username={row.username ?? "?"}
                        firstName={row.first_name}
                        lastName={row.last_name}
                        layout="inline"
                      />
                    )}
                  </span>
                  <span className="text-white font-display tabular-nums">
                    {row.is_blurred
                      ? "?–?"
                      : `${row.predicted_home_score}–${row.predicted_away_score}`}
                  </span>
                  <span className="text-accent font-bold tabular-nums w-8 text-right">
                    {row.display_points}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="md"
            className="flex-1"
            disabled={isPending}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? "Liquidando…" : "Confirmar liquidación"}
          </Button>
        </div>
      </div>
    </Modal>
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
