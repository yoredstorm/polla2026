"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageShell } from "@/components/ui/PageShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { HelpSectionTitle } from "@/components/help/HelpSectionTitle";
import { HelpTooltip } from "@/components/help/HelpTooltip";
import { HelpTourBanner } from "@/components/help/HelpTourBanner";
import { useHelpTourRunner } from "@/components/help/HelpTour";
import { useHelpTour } from "@/hooks/useHelpTour";
import { MatchCard } from "@/components/betting/MatchCard";
import { MatchCardSkeleton } from "@/components/ui/Skeleton";
import { useFixtures } from "@/hooks/useFixtures";
import { useGlobalLeaderboard } from "@/hooks/useLeaderboard";
import { useActivePolla } from "@/hooks/useGroups";
import { useAuth } from "@/hooks/useAuth";
import { useAnimatedPrizePool, parsePrizePool } from "@/hooks/useAnimatedPrizePool";
import { LeaderboardEntryCard } from "@/components/leaderboard/LeaderboardEntryCard";
import { BadgeCatalogSection } from "@/components/gamification/BadgeCatalogSection";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { FollowingFeed } from "@/components/social/FollowingFeed";
import { useMyRival } from "@/hooks/useRival";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
import { cn, formatCountdown } from "@/lib/utils";

function PiggyBankIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <ellipse cx="30" cy="35" rx="22" ry="18" fill="currentColor" opacity="0.15" />
      <ellipse cx="30" cy="35" rx="22" ry="18" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="21" cy="31" r="2.5" fill="currentColor" />
      <path d="M52 30c2.5 0 4.5 2 4.5 4.5S54.5 39 52 39h-2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M26 53v4M34 53v4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M30 17v-5M30 12a4 4 0 0 1 4-4h6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="27" y="14" width="6" height="4" rx="2" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: fixturesData, isLoading: fixturesLoading } = useFixtures({ status: "scheduled", limit: 6 });
  const { data: statsAll } = useFixtures({ limit: 1 });
  const { data: statsFinished } = useFixtures({ status: "finished", limit: 1 });
  const { data: leaderboard } = useGlobalLeaderboard(1, 50, "points", 1);
  const { data: polla } = useActivePolla();
  const { data: rivalData } = useMyRival(!!user);

  const serverPrize = parsePrizePool(polla?.prize_pool);
  const { displayed: prizeAnimated, isAnimating } = useAnimatedPrizePool(serverPrize);
  const prizeDisplayed = prizeAnimated ?? serverPrize;
  const currency = polla?.currency ?? "USD";

  const totalFixtures = statsAll?.pagination?.total ?? 0;
  const playedFixtures = statsFinished?.pagination?.total ?? 0;
  const progressPct = totalFixtures > 0 ? Math.round((playedFixtures / totalFixtures) * 100) : 0;

  const hero = fixturesData?.data?.[0];
  const myEntry = leaderboard?.find((e) => e.user_id === user?.id);
  const leader = leaderboard?.[0];
  const gapToLeader =
    leader && myEntry ? Math.max(0, leader.total_points - myEntry.total_points) : null;

  const { bannerVisible, dismissBanner, markTourDone } = useHelpTour();
  const { startTour } = useHelpTourRunner(markTourDone);

  return (
    <PageShell maxWidth="xl">
      <HelpTourBanner visible={bannerVisible} onStart={startTour} onDismiss={dismissBanner} />

      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-accent mb-1">Centro del Mundial 2026</p>
          <HelpSectionTitle as="h1" helpKey="page.dashboard" label="Inicio">
            Hola, {user?.username}
          </HelpSectionTitle>
          <p className="text-muted mt-1">Tu hub de pronosticos y competencia</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button type="button" variant="ghost" size="sm" onClick={startTour}>
            Ver guía del sistema
          </Button>
          <Link
            href="/profile"
            className="inline-flex items-center justify-center px-4 py-2.5 text-sm rounded-xl border border-white/15 bg-white/5 text-white hover:bg-white/10 transition-colors duration-200 cursor-pointer focus-ring"
          >
            Perfil y privacidad
          </Link>
        </div>
      </div>

      {totalFixtures > 0 && (
        <Card className="mb-8 p-4 rounded-2xl">
          <div className="flex justify-between text-xs text-muted mb-2">
            <span className="inline-flex items-center gap-1">
              Progreso del torneo
              <HelpTooltip helpKey="page.dashboard.progress" label="Progreso del torneo" />
            </span>
            <span>
              {playedFixtures} / {totalFixtures} partidos ({progressPct}%)
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </Card>
      )}

      {myEntry && (
        <section className="mb-8 grid grid-cols-2 lg:grid-cols-4 gap-3 auto-rows-fr">
          <div className="col-span-2 lg:col-span-4 flex items-center gap-2 -mb-1">
            <span className="text-xs text-muted uppercase tracking-wide">Tu resumen</span>
            <HelpTooltip helpKey="page.dashboard.stats" label="Estadísticas" />
          </div>
          <Card className="p-4 text-center col-span-1 lg:col-span-1" glow>
            <p className="text-xs text-muted">Tu puesto</p>
            <p className="font-display text-4xl text-accent text-glow-accent">#{myEntry.position}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-xs text-muted">Puntos</p>
            <p className="font-display text-4xl text-white">{myEntry.total_points}</p>
          </Card>
          <Card className="p-4 col-span-2 lg:col-span-2 flex flex-col justify-center">
            <p className="text-xs text-muted">Distancia al lider</p>
            <p className="font-display text-xl text-white mt-1">
              {gapToLeader === 0
                ? "Eres el lider"
                : gapToLeader != null
                  ? `${gapToLeader} pts para alcanzar a ${leader?.username}`
                  : "—"}
            </p>
          </Card>
          {rivalData?.rival && (
            <Card className="p-4 col-span-2 lg:col-span-4 border-warning/25 bg-warning/5">
              <p className="text-xs text-warning/80 uppercase tracking-wide mb-1">Tu rival</p>
              <UserDisplayName
                username={rivalData.rival.opponent_username ?? "?"}
                firstName={rivalData.rival.opponent_first_name}
                lastName={rivalData.rival.opponent_last_name}
                className="font-display text-lg"
              />
              <p className="text-xs text-muted mt-1">
                {rivalData.rival.wins}V – {rivalData.rival.losses}D
                {rivalData.rival.draws > 0 ? ` – ${rivalData.rival.draws}E` : ""}
              </p>
            </Card>
          )}
        </section>
      )}

      {hero && (
        <section className="mb-8">
          <HelpSectionTitle as="h2" helpKey="page.dashboard.nextMatch" className="mb-3">
            Proximo partido
          </HelpSectionTitle>
          <Link
            href={`/fixtures/${hero.id}`}
            className="block rounded-2xl border border-accent/50 bg-gradient-to-r from-accent/15 via-accent/5 to-transparent p-6 shadow-glow-accent card-interactive group"
          >
            <p className="text-xs text-accent font-medium mb-2">{formatCountdown(hero.match_date)}</p>
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
            <HelpSectionTitle as="h2" helpKey="page.dashboard.upcoming" className="mb-4">
              Proximos partidos
            </HelpSectionTitle>
            {fixturesLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[0, 1, 2, 3].map((i) => (
                  <MatchCardSkeleton key={i} />
                ))}
              </div>
            ) : fixturesData?.data.length ? (
              <div className="flex gap-4 overflow-x-auto pb-2 snap-x sm:grid sm:grid-cols-2 sm:overflow-visible">
                {fixturesData.data.map((fixture, i) => (
                  <div className="min-w-[280px] snap-start sm:min-w-0" key={fixture.id}>
                    <MatchCard fixture={fixture} index={i} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted">No hay partidos programados.</p>
            )}
          </section>

          <section>
            <HelpSectionTitle as="h2" helpKey="page.dashboard.scoring" className="mb-1">
              Reglas de puntuacion
            </HelpSectionTitle>
            <p className="text-xs text-muted mb-4">Asi se calculan los puntos al liquidar cada partido.</p>
            <div className="grid grid-cols-3 gap-3">
              <Card className="p-4 text-center border-accent/40 bg-accent/5" glow>
                <p className="font-display text-4xl text-accent mb-2">2</p>
                <p className="text-xs font-bold text-white uppercase tracking-wide">Exacto</p>
              </Card>
              <Card className="p-4 text-center border-warning/40 bg-warning/5">
                <p className="font-display text-4xl text-warning mb-2">1</p>
                <p className="text-xs font-bold text-white uppercase tracking-wide">Ganador</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="font-display text-4xl text-muted mb-2">0</p>
                <p className="text-xs font-bold text-white uppercase tracking-wide">Fallo</p>
              </Card>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          {polla ? (
            <Card
              data-help-tour="prize-pool"
              className={cn(
                "rounded-2xl border-accent/30 bg-gradient-to-br from-accent/10 via-white/[0.03] to-transparent p-5",
                isAnimating && "shadow-glow-accent",
              )}
              glow
            >
              <div className="flex items-center gap-3 mb-3">
                <PiggyBankIcon className="w-10 h-10 text-accent shrink-0" />
                <div>
                  <p className="text-xs text-muted uppercase tracking-wide inline-flex items-center gap-1">
                    Pozo acumulado
                    <HelpTooltip helpKey="page.dashboard.prizePool" label="Pozo acumulado" />
                  </p>
                  <p className="text-xs text-muted">{polla.name}</p>
                </div>
              </div>
              <p className="font-display text-4xl text-white mb-1">
                {currency}{" "}
                <span className="text-accent tabular-nums text-glow-accent">
                  {prizeDisplayed != null
                    ? prizeDisplayed.toLocaleString("es-PE", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : "—"}
                </span>
              </p>
              <p className="text-xs text-muted">
                {polla.member_count} participante{polla.member_count !== 1 ? "s" : ""}
              </p>
              {!polla.is_member && (
                <p className="text-xs text-warning mt-3 bg-warning/10 rounded-lg px-3 py-2">
                  No eres miembro aun. Habla con el admin para unirte.
                </p>
              )}
            </Card>
          ) : (
            <Card className="p-5 flex items-center gap-3">
              <PiggyBankIcon className="w-10 h-10 text-muted shrink-0" />
              <p className="text-sm text-muted">Pozo no configurado aun.</p>
            </Card>
          )}

          <Link href="/winners" className="block text-center text-sm text-accent hover:underline cursor-pointer">
            Ver podio y premios
          </Link>

          <FollowingFeed />
          <ActivityFeed limit={12} className="mb-4" />

          <section>
            <HelpSectionTitle as="h2" helpKey="page.dashboard.topBettors" className="mb-1">
              Top apostadores
            </HelpSectionTitle>
            <Card className="p-4 space-y-3">
              {leaderboard?.length ? (
                leaderboard.slice(0, 8).map((entry, i) => (
                  <LeaderboardEntryCard
                    key={entry.user_id}
                    entry={entry}
                    isMe={entry.user_id === user?.id}
                    rankIndex={i}
                    compact
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
