"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { Trophy, Medal } from "lucide-react";
import { MotionSafe } from "@/components/ui/MotionSafe";
import { entranceTransition, staggerDelay } from "@/lib/motion";
import { PageShell } from "@/components/layout/PageShell";
import { HelpSectionTitle } from "@/components/features/help/HelpSectionTitle";
import { HelpTooltip } from "@/components/features/help/HelpTooltip";
import { MatchCardSkeleton } from "@/components/ui/Skeleton";
import { TeamAvatar } from "@/components/features/betting/TeamAvatar";
import { BetForm } from "@/components/features/betting/BetForm";
import { BettingSlip } from "@/components/features/betting/BettingSlip";
import { ChallengeModal } from "@/components/features/betting/ChallengeModal";
import { ChallengeCard } from "@/components/features/betting/ChallengeCard";
import { useToast } from "@/components/ui/Toast";
import { getApiErrorMessage } from "@/lib/challengeUtils";
import { useFixture } from "@/hooks/useFixtures";
import { useMyBetsForFixture } from "@/hooks/useBets";
import { useActivePolla } from "@/hooks/useGroups";
import { useGroupFixtureStandings } from "@/hooks/useGroups";
import { useAuth } from "@/hooks/useAuth";
import {
  useFixtureChallenges,
  useAcceptChallenge,
  useRejectChallenge,
} from "@/hooks/useChallenges";
import { formatMatchDate, getStatusLabel, formatAmount, cn } from "@/lib/utils";
import { getBettingClosesAt, isBettingWindowOpen } from "@/lib/matchTiming";
import { FixtureDeadlineCountdown } from "@/components/features/betting/FixtureDeadlineCountdown";
import { BettingTrendsBar } from "@/components/features/betting/BettingTrendsBar";
import { ActivityFeed } from "@/components/features/activity/ActivityFeed";
import { FixtureSocialSection } from "@/components/features/social/FixtureSocialSection";
import { UserDisplayName } from "@/components/ui/UserDisplayName";

export default function FixtureDetailPage() {
  const params = useParams();
  const fixtureId = params.fixtureId as string;
  const { user } = useAuth();
  const [challengeOpen, setChallengeOpen] = useState(false);
  const { data: challenges } = useFixtureChallenges(fixtureId);
  const acceptChallenge = useAcceptChallenge();
  const rejectChallenge = useRejectChallenge();
  const toast = useToast((s) => s.add);
  const [betPanelMinimized, setBetPanelMinimized] = useState(false);

  const { data: fixture, isLoading, isError, refetch } = useFixture(fixtureId);
  const { data: myBets } = useMyBetsForFixture(fixtureId);
  const { data: polla } = useActivePolla();

  const standingsEnabled = fixture?.status === "finished" && !!polla?.id;
  const {
    data: standings,
    isLoading: standingsLoading,
    isError: standingsError,
  } = useGroupFixtureStandings(polla?.id ?? "", fixtureId, {
    enabled: standingsEnabled,
  });

  if (isLoading) {
    return (
      <PageShell maxWidth="md">
        <MatchCardSkeleton />
      </PageShell>
    );
  }
  if (isError) {
    return (
      <PageShell maxWidth="md">
        <div className="text-center py-20 space-y-3">
          <p className="text-danger">No se pudo cargar el partido.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-sm px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20"
          >
            Reintentar
          </button>
        </div>
      </PageShell>
    );
  }
  if (!fixture) {
    return (
      <PageShell maxWidth="md">
        <p className="text-center text-danger py-20">Partido no encontrado</p>
      </PageShell>
    );
  }

  const topThree = standings?.slice(0, 3) ?? [];
  const rest = standings?.slice(3) ?? [];
  const primaryBet = myBets?.[0];
  const hasBet = (myBets?.length ?? 0) > 0;

  const showBetForm =
    fixture.status === "scheduled" &&
    !fixture.is_locked &&
    fixture.betting_open &&
    polla?.is_member;

  return (
    <PageShell maxWidth="md" mainClassName="pb-28 md:pb-8">
      <div className="rounded-2xl border border-white/10 bg-glass backdrop-blur-sm p-8 mb-6">
        <div className="text-center mb-4">
          <p className="text-muted text-sm">
            {fixture.league_name} · {fixture.round}
          </p>
          <p className="text-muted text-xs mt-1">
            {formatMatchDate(fixture.match_date)}
          </p>
          {fixture.status === "scheduled" &&
            fixture.betting_open &&
            !fixture.is_locked &&
            isBettingWindowOpen(fixture) && (
            <div className="mt-2 flex justify-center">
              <FixtureDeadlineCountdown
                deadlineMs={getBettingClosesAt(fixture)}
                label="Cierran apuestas en"
              />
            </div>
          )}
        </div>
        <div className="flex items-center justify-center gap-8">
          <div className="flex flex-col items-center gap-3">
            <TeamAvatar
              logoUrl={fixture.home_logo_url}
              teamName={fixture.home_team}
              size={64}
            />
            <span className="font-display text-2xl text-white text-center">
              {fixture.home_team}
            </span>
          </div>
          <div className="text-center">
            {fixture.status !== "scheduled" ? (
              <div className="font-display text-5xl text-white">
                {fixture.home_score ?? 0} – {fixture.away_score ?? 0}
              </div>
            ) : (
              <div className="font-display text-3xl text-muted">VS</div>
            )}
            <span
              className={`mt-2 inline-block text-sm font-medium px-3 py-1 rounded-full ${fixture.status === "live" ? "bg-danger/20 text-danger" : "bg-white/10 text-muted"}`}
            >
              {getStatusLabel(fixture.status)}
            </span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <TeamAvatar
              logoUrl={fixture.away_logo_url}
              teamName={fixture.away_team}
              size={64}
            />
            <span className="font-display text-2xl text-white text-center">
              {fixture.away_team}
            </span>
          </div>
        </div>
      </div>

      {fixture.status === "scheduled" &&
        fixture.betting_open &&
        !fixture.is_locked && (
          <section className="mb-6 rounded-xl border border-white/10 bg-glass p-4">
            <h3 className="font-display text-sm text-white mb-2">
              Tendencia de apuestas
            </h3>
            <BettingTrendsBar fixtureId={fixtureId} />
          </section>
        )}

      <ActivityFeed
        fixtureId={fixtureId}
        limit={10}
        title="Actividad del partido"
        className="mb-6"
      />

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-display text-sm text-white">
            Comentarios del partido
          </span>
          <HelpTooltip
            helpKey="page.fixtureDetail.comments"
            label="Comentarios"
          />
        </div>
        <FixtureSocialSection fixtureId={fixtureId} />
      </div>

      {fixture.status === "finished" && primaryBet && (
        <section className="rounded-xl border border-accent/30 bg-accent/10 p-4 mb-6">
          <h2 className="font-display text-lg text-white mb-2">Tu resultado</h2>
          <p className="text-sm text-muted">
            Predijiste {primaryBet.predicted_home_score}–
            {primaryBet.predicted_away_score} · Final {fixture.home_score}–
            {fixture.away_score}
          </p>
          <p className="font-display text-3xl text-accent mt-2">
            {primaryBet.points_earned ?? 0} pts
          </p>
        </section>
      )}

      {fixture.status === "scheduled" &&
        !fixture.is_locked &&
        fixture.betting_open &&
        polla?.is_member &&
        polla.challenges_enabled !== false && (
          <section className="mb-6">
            {hasBet ? (
              <button
                type="button"
                onClick={() => setChallengeOpen(true)}
                className="px-4 py-2 rounded-xl border border-accent/50 text-accent text-sm font-bold hover:bg-accent/10"
              >
                Te reto
              </button>
            ) : (
              <p className="text-sm text-muted">
                Haz tu pronostico para poder retar a otro jugador.
              </p>
            )}
          </section>
        )}

      {polla?.is_member && polla.challenges_enabled === false && (
        <section className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="text-sm text-muted">
            El sistema de retos esta desactivado por el administrador en esta fase del torneo.
          </p>
        </section>
      )}

      {challenges && challenges.length > 0 && (
        <section className="mb-6 space-y-3">
          <HelpSectionTitle as="h3" helpKey="page.fixtureDetail.challenge">
            Duelos
          </HelpSectionTitle>
          {challenges.map((ch) => (
            <ChallengeCard
              key={ch.id}
              challenge={ch}
              currentUserId={user?.id}
              hasBet={hasBet}
              acceptPending={acceptChallenge.isPending}
              rejectPending={rejectChallenge.isPending}
              onAccept={() =>
                acceptChallenge.mutate(ch.id, {
                  onSuccess: () =>
                    toast("Reto aceptado — duelo en juego", "success"),
                  onError: (err) =>
                    toast(
                      getApiErrorMessage(err, "No se pudo aceptar el reto"),
                      "error",
                    ),
                })
              }
              onReject={() =>
                rejectChallenge.mutate(ch.id, {
                  onSuccess: () => toast("Reto rechazado", "info"),
                  onError: (err) =>
                    toast(
                      getApiErrorMessage(err, "No se pudo rechazar"),
                      "error",
                    ),
                })
              }
            />
          ))}
        </section>
      )}

      <ChallengeModal
        fixtureId={fixtureId}
        open={challengeOpen}
        onClose={() => setChallengeOpen(false)}
      />

      {fixture.status === "finished" && polla && (
        <section className="rounded-2xl border border-accent/25 bg-gradient-to-b from-accent/10 via-white/[0.04] to-transparent p-6 mb-6 overflow-hidden">
          <div className="mb-5">
            <h2 className="font-display text-2xl text-white">
              Resultados en la polla
            </h2>
            <p className="text-muted text-sm mt-1">
              Marcador final {fixture.home_score}–{fixture.away_score}: ranking
              de predicciones.
            </p>
          </div>

          {standingsLoading && (
            <p className="text-muted text-center py-8">
              Cargando ranking del partido...
            </p>
          )}
          {standingsError && (
            <p className="text-warning text-sm text-center py-4">
              No hay datos de ranking para este partido (puede que aun no se
              hayan liquidado las apuestas).
            </p>
          )}
          {!standingsLoading &&
            !standingsError &&
            standings &&
            standings.length === 0 && (
              <p className="text-muted text-center py-6">
                Nadie aposto este partido en la polla.
              </p>
            )}
          {!standingsLoading &&
            !standingsError &&
            standings &&
            standings.length > 0 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  {topThree.map((row, idx) => {
                    const MedalIcon = idx === 0 ? Trophy : Medal;
                    const isMe = row.user_id === user?.id;
                    return (
                      <MotionSafe
                        key={row.user_id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={entranceTransition(staggerDelay(idx))}
                        className={cn(
                          "rounded-xl border p-4 text-center relative",
                          idx === 0 &&
                            "border-warning/50 bg-warning/5 shadow-glow-sm",
                          idx === 1 && "border-zinc-400/40 bg-white/[0.04]",
                          idx === 2 && "border-amber-700/50 bg-amber-900/10",
                          isMe && "ring-2 ring-accent/50",
                        )}
                      >
                        <MedalIcon
                          className={cn(
                            "w-8 h-8 mx-auto mb-1",
                            idx === 0
                              ? "text-warning"
                              : idx === 1
                                ? "text-muted"
                                : "text-amber-700",
                          )}
                          aria-hidden
                        />
                        <UserDisplayName
                          username={row.username}
                          firstName={row.first_name}
                          lastName={row.last_name}
                          nameClassName={cn(
                            "font-display text-lg",
                            isMe && "text-accent",
                          )}
                        />
                        {isMe && (
                          <span className="text-accent text-xs">(Tú)</span>
                        )}
                        <p className="text-white font-display text-xl mt-2">
                          {row.predicted_home_score} –{" "}
                          {row.predicted_away_score}
                        </p>
                        <p className="text-accent font-bold mt-1">
                          {row.points_earned ?? "—"} pts
                        </p>
                        {parseFloat(row.amount) > 0 && (
                          <p className="text-xs text-muted mt-1">
                            {formatAmount(row.amount)}
                          </p>
                        )}
                      </MotionSafe>
                    );
                  })}
                </div>
                {rest.length > 0 && (
                  <div className="rounded-xl border border-white/10 divide-y divide-white/10">
                    {rest.map((row, i) => {
                      const isMe = row.user_id === user?.id;
                      return (
                        <div
                          key={row.user_id}
                          className={cn(
                            "flex items-center justify-between px-4 py-3 text-sm",
                            isMe && "bg-accent/5",
                          )}
                        >
                          <span className="text-muted w-8">{i + 4}</span>
                          <span className="flex-1 min-w-0">
                            <UserDisplayName
                              username={row.username}
                              firstName={row.first_name}
                              lastName={row.last_name}
                              nameClassName={isMe ? "text-accent" : undefined}
                              layout="inline"
                            />
                            {isMe && (
                              <span className="text-accent text-xs ml-1">
                                (Tú)
                              </span>
                            )}
                          </span>
                          <span className="text-white font-display w-20 text-center">
                            {row.predicted_home_score}–
                            {row.predicted_away_score}
                          </span>
                          <span className="text-accent font-bold w-14 text-right">
                            {row.points_earned ?? "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
        </section>
      )}

      <div
        className={cn(
          showBetForm &&
            "fixed bottom-[4.5rem] left-0 right-0 z-30 px-4 pb-2 md:relative md:bottom-auto md:inset-auto md:z-auto md:px-0 md:pb-0 md:mb-6",
        )}
      >
        <div
          className={cn(
            "max-w-3xl mx-auto",
            showBetForm &&
              "rounded-2xl border border-accent/30 bg-surface/95 backdrop-blur-xl shadow-glow-accent md:shadow-none md:bg-transparent md:border-0 md:p-0",
            // ↓ solo en mobile: altura máxima + scroll interno
            showBetForm &&
              !betPanelMinimized &&
              "max-h-[70vh] overflow-y-auto md:max-h-none md:overflow-visible p-4",
            showBetForm && betPanelMinimized && "p-0",
          )}
        >
          {/* Header: siempre visible en mobile cuando showBetForm */}
          <div
            className={cn(
              "flex items-center justify-between gap-2",
              !betPanelMinimized && "mb-2",
              showBetForm && betPanelMinimized && "px-4 py-3",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="font-display text-sm text-white">
                Tu pronóstico
              </span>
              <HelpTooltip
                helpKey="page.fixtureDetail.bet"
                label="Pronóstico"
              />
            </div>
            {/* Botón solo visible en mobile */}
            {showBetForm && (
              <button
                type="button"
                onClick={() => setBetPanelMinimized((v) => !v)}
                className="md:hidden flex items-center gap-1 text-xs text-accent/80 hover:text-accent transition-colors px-2 py-1 rounded-lg hover:bg-accent/10"
                aria-label={
                  betPanelMinimized
                    ? "Expandir panel de apuesta"
                    : "Minimizar panel de apuesta"
                }
              >
                {betPanelMinimized ? (
                  <>
                    <span>Apostar</span>
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 15l7-7 7 7"
                      />
                    </svg>
                  </>
                ) : (
                  <>
                    <span>Minimizar</span>
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Contenido: oculto cuando minimizado en mobile */}
          <div
            className={cn(
              showBetForm && betPanelMinimized && "hidden md:block",
            )}
          >
            <BetForm fixture={fixture} />
          </div>
        </div>
      </div>

      {myBets && myBets.length > 0 && (
        <div className="mt-6">
          <h3 className="font-display text-xl text-white mb-3">Mis Apuestas</h3>
          <div className="space-y-3">
            {myBets.map((bet) => (
              <BettingSlip key={bet.id} bet={bet} fixture={fixture} />
            ))}
          </div>
        </div>
      )}
    </PageShell>
  );
}
