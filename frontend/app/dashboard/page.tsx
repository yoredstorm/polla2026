"use client";
import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
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
import {
  useAnimatedPrizePool,
  parsePrizePool,
} from "@/hooks/useAnimatedPrizePool";
import { LeaderboardEntryCard } from "@/components/leaderboard/LeaderboardEntryCard";
import { BadgeCatalogSection } from "@/components/gamification/BadgeCatalogSection";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { FollowingFeed } from "@/components/social/FollowingFeed";
import { useMyRival } from "@/hooks/useRival";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
import { cn, formatCountdown } from "@/lib/utils";

// --- NUEVO COMPONENTE: NeonPiggyBank (SVG Completo + Monedas Mejoradas) ---
interface NeonPiggyBankProps {
  amount: string;
  currency: string;
  isAnimating?: boolean;
}

function NeonPiggyBank({ amount, currency, isAnimating }: NeonPiggyBankProps) {
  return (
    <div className="relative w-full flex justify-center items-center py-8">
      {/* Estilos locales para la animación y diseño de las monedas */}
      <style>{`
        @keyframes dropCoin {
          0% { transform: translateY(-40px) scale(0.5); opacity: 0; }
          20% { transform: translateY(-10px) scale(1); opacity: 1; }
          70% { transform: translateY(30px) scale(1); opacity: 1; }
          100% { transform: translateY(50px) scale(0.5); opacity: 0; }
        }
        
        .golden-coin {
          position: absolute;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: radial-gradient(circle, #ffe066 0%, #f5b041 50%, #d4ac0d 100%);
          border: 2px solid #fef9e7;
          box-shadow: 0 0 15px rgba(241, 196, 15, 0.8), inset 0 0 5px rgba(255, 255, 255, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #9a7d0a;
          font-weight: bold;
          font-size: 12px;
          opacity: 0;
          z-index: 20;
        }

        /* --- ESTILOS MEJORADOS PARA MONEDAS ACUMULADAS --- */
        .coin-inside {
          position: absolute;
          width: 28px;               /* Más ancha */
          height: 10px;              /* Más baja para dar efecto de "echadita" */
          border-radius: 50%;
          background: linear-gradient(to bottom, #ffe066 0%, #f5b041 50%, #d4ac0d 100%);
          border: 1px solid rgba(255,255,255,0.6);
          border-bottom: 3px solid #b7950b; /* Grosor/canto de la moneda en 3D */
          opacity: 0.65;             /* Ligeramente translúcidas para mantener el efecto de "dentro del cristal" */
          box-shadow: 
            0 3px 5px rgba(0,0,0,0.3), 
            inset 0 1px 2px rgba(255,255,255,0.8);
        }

        .animate-coin-1 { animation: dropCoin 1.2s ease-in forwards; }
        .animate-coin-2 { animation: dropCoin 1.2s ease-in 0.3s forwards; }
        .animate-coin-3 { animation: dropCoin 1.2s ease-in 0.6s forwards; }
        
        .text-glow-pink {
          text-shadow: 0 0 5px #fff, 0 0 15px #ff87dd, 0 0 30px #ff87dd;
        }
      `}</style>

      {/* CONTENEDOR PRINCIPAL DEL CHANCHITO */}
      <div className="relative w-full max-w-[320px] aspect-[4/3] flex items-center justify-center">
        {/* MONEDAS ANIMADAS CAYENDO */}
        {isAnimating && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 flex justify-center w-full h-full pointer-events-none">
            <div className="golden-coin animate-coin-1 left-[45%]">$</div>
            <div className="golden-coin animate-coin-2 left-[55%]">$</div>
            <div className="golden-coin animate-coin-3 left-[48%]">$</div>
          </div>
        )}

        {/* SVG PRINCIPAL DEL CHANCHITO */}
        <svg
          viewBox="0 0 240 180"
          className="w-full h-full absolute inset-0 z-0 drop-shadow-[0_15px_25px_rgba(0,0,0,0.5)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Glow neón rosado */}
            <filter id="neon-pink" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Gradiente del vidrio */}
            <linearGradient id="glass-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.1" />
              <stop offset="50%" stopColor="#ffffff" stopOpacity="0.03" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.01" />
            </linearGradient>
            {/* Reflejo superior del vidrio */}
            <radialGradient id="glass-highlight" cx="50%" cy="20%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* CUERPO DEL CHANCHITO */}
          <g
            filter="url(#neon-pink)"
            stroke="#ff87dd"
            strokeWidth={isAnimating ? "5" : "3"}
            strokeLinecap="round"   
            strokeLinejoin="round"
            className="transition-all duration-300 ease-out"
          >
            {/* Patas del chanchito */}
            <path
              d="M 82 168 C 76 168 82 168 85 168 L 90 168 C 95 168 95 160 95 155 L 96 150"
              fill="url(#glass-fill)"
            />
            <path
              d="M 161 168 C 164 168 160 168 165 168 L 170 168 C 175 168 174 161 174 155 L 178 136"
              fill="url(#glass-fill)"
            />

            {/* Cuerpo principal */}
            <path
              d="M 195 90 C 195 50 160 28 120 28 C 70 28 40 52 35 82 C 30 87 15 82 10 87 C 5 92 5 108 10 113 C 15 118 30 118 35 113 C 43 133 55 138 64 141 L 60 165 C 58 170 65 173 70 173 L 75 173 C 80 173 80 165 80 160 L 83 145 C 95 150 110 152 126 151 C 136 150 140 149 142 149 L 140 165 C 138 170 145 173 150 173 L 155 173 C 160 173 160 165 160 160 L 162 144 C 174 139 195 128 195 90 Z"
              fill="url(#glass-fill)"
            />
            {/* Hocico */}
            <ellipse cx="12" cy="98" rx="5" ry="12" fill="none" />

            {/* Fosas nasales */}
            <circle cx="12" cy="94" r="1.5" fill="#ff87dd" />
            <circle cx="12" cy="102" r="1.5" fill="#ff87dd" />

            {/* Oreja */}
            <path
              d="M 60 42 C 55 30 45 20 35 25 C 30 28 35 40 45 55"
              fill="url(#glass-fill)"
            />
            {/* Cola */}
            <path
              d="M 195 80 C 210 70 224 85 215 95 C 207 105 193 95 204 87"
              fill="none"
            />
            {/* Ranura superior para monedas */}
            <line x1="100" y1="37" x2="140" y2="37" strokeWidth="4" />

          </g>
          {/* Reflejo de luz superior */}
          <ellipse
            cx="120"
            cy="50"
            rx="40"
            ry="15"
            fill="url(#glass-highlight)"
            filter="blur(3px)"
          />
        </svg>

        {/* Monedas acumuladas (apiladas con perspectiva) */}
        <div className="absolute inset-0 z-[1] pointer-events-none">
          {/* Capa Base (Abajo) */}
          <div className="coin-inside absolute left-[38%] top-[77%] -rotate-6" />
          <div className="coin-inside absolute left-[48%] top-[78%] rotate-3" />
          <div className="coin-inside absolute left-[56%] top-[76%] rotate-12" />

          {/* Capa Media (Superpuestas) */}
          <div className="coin-inside absolute left-[43%] top-[73%] rotate-6" />
          <div className="coin-inside absolute left-[52%] top-[74%] -rotate-3" />

          {/* Capa Superior (Punta de la montaña) */}
          <div className="coin-inside absolute left-[47%] top-[70%] rotate-2" />
        </div>

        {/* Textos de la Cifra */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-2 pr-4 z-10 pointer-events-none">
          <p className="text-[10px] text-white/60 uppercase tracking-widest mb-0.5">
            Pozo Acumulado
          </p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-medium text-[#ff107a]">
              {currency}
            </span>
            <span
              className={cn(
                "font-display text-4xl text-white tabular-nums tracking-tight",
                "text-glow-pink transition-all duration-300",
                isAnimating && "scale-110",
              )}
            >
              {amount}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
// ---------------------------------------------

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: fixturesData, isLoading: fixturesLoading } = useFixtures({
    status: "scheduled",
    limit: 6,
  });
  const { data: statsAll } = useFixtures({ limit: 1 });
  const { data: statsFinished } = useFixtures({ status: "finished", limit: 1 });
  const { data: leaderboard } = useGlobalLeaderboard(1, 50, "points", 1);
  const { data: polla } = useActivePolla();
  const { data: rivalData } = useMyRival(!!user);

  const serverPrize = parsePrizePool(polla?.prize_pool);
  const { displayed: prizeAnimated, isAnimating } =
    useAnimatedPrizePool(serverPrize);
  const prizeDisplayed = prizeAnimated ?? serverPrize;
  const currency = polla?.currency ?? "USD";

  const totalFixtures = statsAll?.pagination?.total ?? 0;
  const playedFixtures = statsFinished?.pagination?.total ?? 0;
  const progressPct =
    totalFixtures > 0 ? Math.round((playedFixtures / totalFixtures) * 100) : 0;

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
              <HelpTooltip
                helpKey="page.dashboard.progress"
                label="Progreso del torneo"
              />
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
            <span className="text-xs text-muted uppercase tracking-wide">
              Tu resumen
            </span>
            <HelpTooltip helpKey="page.dashboard.stats" label="Estadísticas" />
          </div>
          <Card className="p-4 text-center col-span-1 lg:col-span-1" glow>
            <p className="text-xs text-muted">Tu puesto</p>
            <p className="font-display text-4xl text-accent text-glow-accent">
              #{myEntry.position}
            </p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-xs text-muted">Puntos</p>
            <p className="font-display text-4xl text-white">
              {myEntry.total_points}
            </p>
          </Card>
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
          {rivalData?.rival && (
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
            {fixturesLoading ? (
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

                {!polla.is_member && (
                  <p className="text-xs text-warning mt-3 bg-warning/10 rounded-lg px-3 py-2 inline-block">
                    No eres miembro aún. Habla con el admin para unirte.
                  </p>
                )}
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
