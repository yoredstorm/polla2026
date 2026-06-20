"use client";
import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { HelpSectionTitle } from "@/components/features/help/HelpSectionTitle";
import { HelpTooltip } from "@/components/features/help/HelpTooltip";
import { HelpTourBanner } from "@/components/features/help/HelpTourBanner";
import { useHelpTourRunner } from "@/components/features/help/HelpTour";
import { useHelpTour } from "@/hooks/useHelpTour";
import { MatchCard } from "@/components/features/betting/MatchCard";
import { MatchCardSkeleton } from "@/components/ui/Skeleton";
import { useFixtures } from "@/hooks/useFixtures";
import { useGlobalLeaderboard } from "@/hooks/useLeaderboard";
import { useActivePolla, useTournamentProgress } from "@/hooks/useGroups";
import { useAuth } from "@/hooks/useAuth";
import {
  useAnimatedPrizePool,
  parsePrizePool,
} from "@/hooks/useAnimatedPrizePool";
import { LeaderboardEntryCard } from "@/components/features/leaderboard/LeaderboardEntryCard";
import { BadgeCatalogSection } from "@/components/features/gamification/BadgeCatalogSection";
import { ActivityFeed } from "@/components/features/activity/ActivityFeed";
import { FollowingFeed } from "@/components/features/social/FollowingFeed";
import { useMyRival } from "@/hooks/useRival";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
import { cn, formatCountdown } from "@/lib/utils";
import { useChallengeAvailablePoints } from "@/hooks/useChallenges";
import { ChallengeQuotaBars } from "@/components/features/betting/ChallengeQuotaBars";
import { NeonPiggyBank } from "@/components/features/dashboard/NeonPiggyBank";
import { LiveStatusStrip } from "@/components/features/dashboard/LiveStatusStrip";
import { StaggerItem } from "@/components/ui/StaggerItem";
import { TournamentProgressTimeline } from "@/components/features/dashboard/TournamentProgressTimeline";

export default function DashboardPage() {
  const { user } = useAuth();
  const {
    data: fixturesData,
    isLoading: fixturesLoading,
    isError: fixturesError,
    refetch: refetchFixtures,
  } = useFixtures({
    status: "scheduled",
    limit: 6,
  });
  const { data: tournamentProgress } = useTournamentProgress();
  const { data: leaderboard } = useGlobalLeaderboard(1, 50, "points", 1);
  const { data: polla } = useActivePolla();
  const { data: rivalData } = useMyRival(!!user);
  const { data: challengeQuota } = useChallengeAvailablePoints();

  const serverPrize = parsePrizePool(polla?.prize_pool);
  const { displayed: prizeAnimated, isAnimating } =
    useAnimatedPrizePool(serverPrize);
  const prizeDisplayed = prizeAnimated ?? serverPrize;
  const currency = polla?.currency ?? "USD";

  const hero = fixturesData?.data?.[0];
  const myEntry = leaderboard?.find((e) => e.user_id === user?.id);
  const leader = leaderboard?.[0];
  const gapToLeader =
    leader && myEntry
      ? Math.max(0, leader.total_points - myEntry.total_points)
      : null;

  // Formateo de la cifra
  const formattedAmount =
    prizeDisplayed != null
      ? prizeDisplayed.toLocaleString("es-PE", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : "—";

  const { bannerVisible, dismissBanner, markTourDone } = useHelpTour();
  const { startTour } = useHelpTourRunner(markTourDone);

  return (
    <PageShell maxWidth="xl">
      <HelpTourBanner
        visible={bannerVisible}
        onStart={startTour}
        onDismiss={dismissBanner}
      />

      <LiveStatusStrip className="mb-6" />

      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-accent mb-1">
            Centro del Mundial 2026
          </p>
          <HelpSectionTitle
            as="h1"
            helpKey="page.dashboard"
            label="Inicio"
            className="font-display text-3xl text-white text-glow-accent"
          >
            Hola, {user?.first_name ?? user?.username}
          </HelpSectionTitle>

          <p className="text-muted mt-1">Tu hub de pronósticos y competencia</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button type="button" variant="ghost" size="sm" onClick={startTour}>
            Ver guía del sistema
          </Button>
          <Link
            href="/profile"
            className="inline-flex items-center justify-center px-4 py-2.5 text-sm rounded-xl border border-white/15 bg-white/5 text-white hover:bg-white/10 pressable cursor-pointer focus-ring"
          >
            Perfil y privacidad
          </Link>
        </div>
      </div>

      {tournamentProgress && tournamentProgress.total_fixtures > 0 && (
        <Card className="mb-8 p-4 rounded-2xl">
          <div className="inline-flex items-center gap-1 mb-2">
            <HelpTooltip
              helpKey="page.dashboard.progress"
              label="Progreso del torneo"
            />
          </div>
          <TournamentProgressTimeline progress={tournamentProgress} />
        </Card>
      )}

      {user && polla?.challenges_enabled !== false && (
        <ChallengeQuotaBars quota={challengeQuota} className="mb-8" />
      )}

      {myEntry && (
        <section className="mb-8 grid grid-cols-2 lg:grid-cols-4 gap-3 auto-rows-fr">
          <div className="col-span-2 lg:col-span-4 flex items-center gap-2 -mb-1">
            <span className="text-xs text-muted uppercase tracking-wide">
              Tu resumen
            </span>
            <HelpTooltip helpKey="page.dashboard.stats" label="Estadísticas" />
          </div>
          <StaggerItem index={0}>
          <Card className="p-4 text-center col-span-1 lg:col-span-1" glow>
            <p className="text-xs text-muted">Tu puesto</p>
            <p className="font-display text-4xl text-accent text-glow-accent">
              #{myEntry.position}
            </p>
          </Card>
          </StaggerItem>
          <StaggerItem index={1}>
          <Card className="p-4 text-center">
            <p className="text-xs text-muted">Puntos</p>
            <p className="font-display text-4xl text-white">
              {myEntry.total_points}
            </p>
          </Card>
          </StaggerItem>
          <StaggerItem index={2}>
          <Card className="p-4 col-span-2 lg:col-span-2 flex flex-col justify-center">
            <p className="text-xs text-muted">Distancia al líder</p>
            <p className="font-display text-xl text-white mt-1">
              {gapToLeader === 0
                ? "Eres el líder"
                : gapToLeader != null
                  ? `${gapToLeader} pts para alcanzar a ${leader?.username}`
                  : "—"}
            </p>
          </Card>
          </StaggerItem>
          {rivalData?.rival && (
            <StaggerItem index={3} className="col-span-2 lg:col-span-4">
            <Card className="p-4 col-span-2 lg:col-span-4 border-warning/25 bg-warning/5">
              <p className="text-xs text-warning/80 uppercase tracking-wide mb-1">
                Tu rival
              </p>
              <UserDisplayName
                username={rivalData.rival.opponent_username ?? "?"}
                firstName={rivalData.rival.opponent_first_name}
                lastName={rivalData.rival.opponent_last_name}
                className="font-display text-lg"
              />
              <p className="text-xs text-muted mt-1">
                {rivalData.rival.wins}V – {rivalData.rival.losses}D
                {rivalData.rival.draws > 0
                  ? ` – ${rivalData.rival.draws}E`
                  : ""}
              </p>
            </Card>
            </StaggerItem>
          )}
        </section>
      )}

      {hero && (
        <section className="mb-8">
          <HelpSectionTitle
            as="h2"
            helpKey="page.dashboard.nextMatch"
            className="font-display text-lg text-white mb-3"
          >
            Próximo partido
          </HelpSectionTitle>
          <Link
            href={`/fixtures/${hero.id}`}
            className="block rounded-2xl border border-accent/50 bg-gradient-to-r from-accent/15 via-accent/5 to-transparent p-6 shadow-glow-accent card-interactive group"
          >
            <p className="text-xs text-accent font-medium mb-2">
              {formatCountdown(hero.match_date)}
            </p>
            <p className="font-display text-3xl text-white group-hover:text-glow-accent transition-colors duration-200">
              {hero.home_team} vs {hero.away_team}
            </p>
            <p className="text-sm text-muted mt-2">
              {hero.group_name ?? hero.round}
              {hero.venue ? ` · ${hero.venue}` : ""}
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-accent">
              Pronosticar ahora
              <ChevronRight className="w-4 h-4" aria-hidden />
            </span>
          </Link>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section>
            <HelpSectionTitle
              as="h2"
              helpKey="page.dashboard.upcoming"
              className="font-display text-xl text-white mb-4"
            >
              Próximos partidos
            </HelpSectionTitle>
            {fixturesError ? (
              <div className="text-center py-8 space-y-2">
                <p className="text-danger text-sm">No se pudieron cargar los partidos.</p>
                <button
                  type="button"
                  onClick={() => refetchFixtures()}
                  className="text-xs px-3 py-2 rounded-lg bg-white/10 text-white"
                >
                  Reintentar
                </button>
              </div>
            ) : fixturesLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[0, 1, 2, 3].map((i) => (
                  <MatchCardSkeleton key={i} />
                ))}
              </div>
            ) : fixturesData?.data.length ? (
              <div className="flex gap-4 overflow-x-auto pb-2 snap-x sm:grid sm:grid-cols-2 sm:overflow-visible">
                {fixturesData.data.map((fixture, i) => (
                  <div
                    className="min-w-[280px] snap-start sm:min-w-0"
                    key={fixture.id}
                  >
                    <MatchCard fixture={fixture} index={i} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted">No hay partidos programados.</p>
            )}
          </section>

          <section>
            <HelpSectionTitle
              as="h2"
              helpKey="page.dashboard.scoring"
              className="font-display text-xl text-white mb-1"
            >
              Reglas de puntuación
            </HelpSectionTitle>

            <p className="text-xs text-muted mb-4">
              Así se calculan los puntos al liquidar cada partido.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <Card
                className="p-4 text-center border-accent/40 bg-accent/5"
                glow
              >
                <p className="font-display text-4xl text-accent mb-2">2</p>
                <p className="text-xs font-bold text-white uppercase tracking-wide">
                  Exacto
                </p>
              </Card>
              <Card className="p-4 text-center border-warning/40 bg-warning/5">
                <p className="font-display text-4xl text-warning mb-2">1</p>
                <p className="text-xs font-bold text-white uppercase tracking-wide">
                  Ganador
                </p>
              </Card>
              <Card className="p-4 text-center">
                <p className="font-display text-4xl text-muted mb-2">0</p>
                <p className="text-xs font-bold text-white uppercase tracking-wide">
                  Fallo
                </p>
              </Card>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          {/* --- SECCIÓN ACTUALIZADA DEL POZO (CHANCHITO ROSA) --- */}
          {polla ? (
            <div data-help-tour="prize-pool" className="relative">
              <div className="flex items-center justify-center gap-2 mb-2">
                <p className="text-xs text-muted uppercase tracking-wide inline-flex items-center gap-1">
                  Pozo acumulado
                  <HelpTooltip
                    helpKey="page.dashboard.prizePool"
                    label="Pozo acumulado"
                  />
                </p>
              </div>

              <NeonPiggyBank
                amount={formattedAmount}
                currency={currency}
                isAnimating={isAnimating}
              />

              <div className="text-center mt-2 space-y-1">
                <p className="text-sm font-medium text-white">{polla.name}</p>

                <div className="flex items-center justify-center gap-1.5 text-xs text-muted">
                  <Users className="w-3.5 h-3.5" />

                  <span>
                    {polla.member_count} participante
                    {polla.member_count !== 1 ? "s" : ""}
                  </span>
                </div>

              </div>
            </div>
          ) : (
            <Card className="p-5 flex items-center gap-3">
              <div className="w-16 h-10 rounded-full border border-dashed border-muted/50 bg-muted/5"></div>
              <p className="text-sm text-muted">Pozo no configurado aún.</p>
            </Card>
          )}

          <Link
            href="/winners"
            className="block text-center text-sm text-accent hover:underline cursor-pointer"
          >
            Ver podio y premios
          </Link>
          {/* ------------------------------------------------ */}

          <FollowingFeed />
          <ActivityFeed limit={12} className="mb-4" />

          <section>
            <HelpSectionTitle
              as="h2"
              helpKey="page.dashboard.topBettors"
              className="mb-1"
            >
              Top apostadores
            </HelpSectionTitle>
            <Card className="p-4 space-y-3">
              {leaderboard?.length ? (
                leaderboard
                  .slice(0, 8)
                  .map((entry, i) => (
                    <LeaderboardEntryCard
                      key={entry.user_id}
                      entry={entry}
                      isMe={entry.user_id === user?.id}
                      rankIndex={i}
                      compact
                      animate
                    />
                  ))
              ) : !leaderboard ? (
                <MatchCardSkeleton />
              ) : (
                <p className="text-muted text-sm">Aun no hay datos.</p>
              )}
            </Card>
          </section>
        </div>
      </div>

      <BadgeCatalogSection />
    </PageShell>
  );
}
