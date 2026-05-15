"use client";
import Link from "next/link";
import { Navbar } from "@/components/ui/Navbar";
import { MatchCard } from "@/components/betting/MatchCard";
import { useFixtures } from "@/hooks/useFixtures";
import { useGlobalLeaderboard } from "@/hooks/useLeaderboard";
import { useActivePolla } from "@/hooks/useGroups";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

function PiggyBankIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="30" cy="35" rx="22" ry="18" fill="currentColor" opacity="0.15" />
      <ellipse cx="30" cy="35" rx="22" ry="18" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="21" cy="31" r="2.5" fill="currentColor" />
      <path d="M52 30c2.5 0 4.5 2 4.5 4.5S54.5 39 52 39h-2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M26 53v4M34 53v4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M30 17v-5M30 12a4 4 0 0 1 4-4h6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="27" y="14" width="6" height="4" rx="2" fill="currentColor" opacity="0.3" />
      <path d="M36 24c-1.5-4-5-7-9-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: fixturesData } = useFixtures({ status: "scheduled", limit: 6 });
  const { data: leaderboard } = useGlobalLeaderboard(1, 8, "bets", 1);
  const { data: polla } = useActivePolla();

  const prizePool = polla ? parseFloat(polla.prize_pool) : null;
  const currency = polla?.currency ?? "USD";

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl text-white">Bienvenido, {user?.username}</h1>
            <p className="text-muted mt-1">Proximos partidos disponibles para apostar</p>
          </div>
          <Link
            href="/profile"
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-white/15 bg-white/5 text-sm text-white hover:bg-white/10 transition-colors"
          >
            Ajustes de perfil y privacidad
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <section>
              <h2 className="font-display text-xl text-white mb-4">Proximos Partidos</h2>
              {fixturesData ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {fixturesData.data.map((fixture, i) => (
                    <MatchCard key={fixture.id} fixture={fixture} index={i} />
                  ))}
                </div>
              ) : (
                <p className="text-muted">Cargando partidos...</p>
              )}
            </section>

            {/* Game rules */}
            <section>
              <h2 className="font-display text-xl text-white mb-1">Reglas de puntuacion</h2>
              <p className="text-xs text-muted mb-4">Asi se calculan los puntos al liquidar cada partido.</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-accent/40 bg-accent/5 p-4 text-center">
                  <p className="font-display text-4xl text-accent mb-2">2</p>
                  <p className="text-xs font-bold text-white uppercase tracking-wide mb-1">Exacto</p>
                  <p className="text-xs text-muted leading-relaxed">Marcador exacto: goles y ganador correctos</p>
                </div>
                <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/5 p-4 text-center">
                  <p className="font-display text-4xl text-yellow-400 mb-2">1</p>
                  <p className="text-xs font-bold text-white uppercase tracking-wide mb-1">Ganador</p>
                  <p className="text-xs text-muted leading-relaxed">Solo el ganador o empate correcto</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                  <p className="font-display text-4xl text-muted mb-2">0</p>
                  <p className="text-xs font-bold text-white uppercase tracking-wide mb-1">Fallo</p>
                  <p className="text-xs text-muted leading-relaxed">Prediccion incorrecta del resultado</p>
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-6">
            {/* Piggy bank */}
            {polla ? (
              <div className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/10 via-white/[0.03] to-transparent p-5">
                <div className="flex items-center gap-3 mb-3">
                  <PiggyBankIcon className="w-10 h-10 text-accent shrink-0" />
                  <div>
                    <p className="text-xs text-muted uppercase tracking-wide">Pozo acumulado</p>
                    <p className="text-xs text-muted">{polla.name}</p>
                  </div>
                </div>
                <p className="font-display text-4xl text-white mb-1">
                  {currency}{" "}
                  <span className="text-accent">
                    {prizePool !== null ? prizePool.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                  </span>
                </p>
                <p className="text-xs text-muted">{polla.member_count} participante{polla.member_count !== 1 ? "s" : ""}</p>
                {polla.entry_fee && parseFloat(polla.entry_fee) > 0 && (
                  <p className="text-xs text-muted mt-1">Entrada: {currency} {parseFloat(polla.entry_fee).toFixed(2)}</p>
                )}
                {polla.per_match_amount && parseFloat(polla.per_match_amount) > 0 && (
                  <p className="text-xs text-muted">Extra por partido: {currency} {parseFloat(polla.per_match_amount).toFixed(2)}</p>
                )}
                {!polla.is_member && (
                  <p className="text-xs text-amber-300 mt-3 bg-amber-500/10 rounded-lg px-3 py-2">
                    No eres miembro aun. Habla con el admin para unirte.
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-glass p-5 flex items-center gap-3">
                <PiggyBankIcon className="w-10 h-10 text-muted shrink-0" />
                <div>
                  <p className="text-sm text-muted">Pozo no configurado aun.</p>
                  <p className="text-xs text-muted opacity-60">El admin activara la polla pronto.</p>
                </div>
              </div>
            )}

            {/* Leaderboard mini */}
            <div>
              <h2 className="font-display text-xl text-white mb-1">Top apostadores</h2>
              <p className="text-xs text-muted mb-4">Por volumen de apuestas; % sobre apuestas liquidadas.</p>
              <div className="rounded-xl border border-white/10 bg-glass backdrop-blur-sm p-4 space-y-3">
                {leaderboard?.length ? (
                  leaderboard.map((entry) => {
                    const wrong = entry.wrong_results ?? Math.max(0, entry.total_bets - entry.correct_results);
                    const wagers = entry.wager_count ?? entry.total_bets;
                    const settled = entry.total_bets;
                    const vis = entry.bets_profile_visibility ?? "public";
                    const showAmounts = entry.show_bet_amounts ?? true;
                    const wagered = parseFloat(entry.total_wagered ?? "0");
                    return (
                      <Link
                        key={entry.user_id}
                        href={`/u/${encodeURIComponent(entry.username)}`}
                        className="flex items-center gap-3 rounded-lg p-1 -m-1 hover:bg-white/5 transition-colors"
                      >
                        <span className="font-display text-2xl text-muted w-6 text-center">{entry.position}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-white truncate">{entry.username}</p>
                            <span
                              className={cn(
                                "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded",
                                vis === "invite_only"
                                  ? "bg-amber-500/20 text-amber-200"
                                  : "bg-emerald-500/15 text-emerald-200",
                              )}
                            >
                              {vis === "invite_only" ? "Privado" : "Publico"}
                            </span>
                          </div>
                          <p className="text-xs text-muted">
                            {wagers} apuesta{wagers !== 1 ? "s" : ""}
                            {settled > 0
                              ? ` · ${entry.accuracy_pct}% acierto · ${wrong} fallos`
                              : wagers > 0
                                ? " · sin liquidar aun"
                                : ""}
                            {wagered > 0 && (
                              <>
                                {" · "}
                                {showAmounts ? (
                                  <span className="text-emerald-400">S/ {wagered.toFixed(2)}</span>
                                ) : (
                                  <span className="blur-sm select-none text-muted/40">S/ ••••</span>
                                )}
                              </>
                            )}
                          </p>
                        </div>
                        <span className="font-display text-lg text-accent shrink-0">{entry.total_points}pts</span>
                      </Link>
                    );
                  })
                ) : !leaderboard ? (
                  <p className="text-muted text-sm">Cargando...</p>
                ) : (
                  <p className="text-muted text-sm">Aun no hay apuestas registradas.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
