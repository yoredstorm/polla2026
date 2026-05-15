"use client";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { TeamAvatar } from "@/components/betting/TeamAvatar";
import { Navbar } from "@/components/ui/Navbar";
import { BetForm } from "@/components/betting/BetForm";
import { BettingSlip } from "@/components/betting/BettingSlip";
import { useFixture } from "@/hooks/useFixtures";
import { useMyBetsForFixture } from "@/hooks/useBets";
import { useActivePolla } from "@/hooks/useGroups";
import { useGroupFixtureStandings } from "@/hooks/useGroups";
import { useAuth } from "@/hooks/useAuth";
import { formatMatchDate, getStatusLabel, formatAmount, cn } from "@/lib/utils";

export default function FixtureDetailPage() {
  const params = useParams();
  const fixtureId = params.fixtureId as string;
  const { user } = useAuth();

  const { data: fixture, isLoading } = useFixture(fixtureId);
  const { data: myBets } = useMyBetsForFixture(fixtureId);
  const { data: polla } = useActivePolla();

  const standingsEnabled = fixture?.status === "finished" && !!polla?.id;
  const { data: standings, isLoading: standingsLoading, isError: standingsError } = useGroupFixtureStandings(
    polla?.id ?? "",
    fixtureId,
    { enabled: standingsEnabled },
  );

  if (isLoading) return (
    <div className="min-h-screen"><Navbar /><div className="flex items-center justify-center h-64 text-muted">Cargando...</div></div>
  );
  if (!fixture) return (
    <div className="min-h-screen"><Navbar /><div className="flex items-center justify-center h-64 text-danger">Partido no encontrado</div></div>
  );

  const topThree = standings?.slice(0, 3) ?? [];
  const rest = standings?.slice(3) ?? [];

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="rounded-2xl border border-white/10 bg-glass backdrop-blur-sm p-8 mb-6">
          <div className="text-center mb-4">
            <p className="text-muted text-sm">{fixture.league_name} · {fixture.round}</p>
            <p className="text-muted text-xs mt-1">{formatMatchDate(fixture.match_date)}</p>
          </div>
          <div className="flex items-center justify-center gap-8">
            <div className="flex flex-col items-center gap-3">
              <TeamAvatar logoUrl={fixture.home_logo_url} teamName={fixture.home_team} size={64} />
              <span className="font-display text-2xl text-white text-center">{fixture.home_team}</span>
            </div>
            <div className="text-center">
              {fixture.status !== "scheduled" ? (
                <div className="font-display text-5xl text-white">{fixture.home_score ?? 0} – {fixture.away_score ?? 0}</div>
              ) : (
                <div className="font-display text-3xl text-muted">VS</div>
              )}
              <span className={`mt-2 inline-block text-sm font-medium px-3 py-1 rounded-full ${fixture.status === "live" ? "bg-danger/20 text-danger" : "bg-white/10 text-muted"}`}>
                {getStatusLabel(fixture.status)}
              </span>
            </div>
            <div className="flex flex-col items-center gap-3">
              <TeamAvatar logoUrl={fixture.away_logo_url} teamName={fixture.away_team} size={64} />
              <span className="font-display text-2xl text-white text-center">{fixture.away_team}</span>
            </div>
          </div>
        </div>

        {fixture.status === "finished" && polla && (
          <section className="rounded-2xl border border-accent/25 bg-gradient-to-b from-accent/10 via-white/[0.04] to-transparent p-6 mb-6 overflow-hidden">
            <div className="mb-5">
              <h2 className="font-display text-2xl text-white">Resultados en la polla</h2>
              <p className="text-muted text-sm mt-1">
                Marcador final {fixture.home_score}–{fixture.away_score}: ranking de predicciones.
              </p>
            </div>

            {standingsLoading && <p className="text-muted text-center py-8">Cargando ranking del partido...</p>}
            {standingsError && (
              <p className="text-warning text-sm text-center py-4">
                No hay datos de ranking para este partido (puede que aun no se hayan liquidado las apuestas).
              </p>
            )}
            {!standingsLoading && !standingsError && standings && standings.length === 0 && (
              <p className="text-muted text-center py-6">Nadie aposto este partido en la polla.</p>
            )}
            {!standingsLoading && !standingsError && standings && standings.length > 0 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  {topThree.map((row, idx) => {
                    const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";
                    const isMe = row.user_id === user?.id;
                    return (
                      <motion.div
                        key={row.user_id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.08 }}
                        className={cn(
                          "rounded-xl border p-4 text-center relative",
                          idx === 0 && "border-yellow-400/50 bg-yellow-500/5 sm:scale-[1.02] sm:-mt-1 shadow-lg shadow-yellow-500/10",
                          idx === 1 && "border-zinc-400/40 bg-white/[0.04]",
                          idx === 2 && "border-amber-700/50 bg-amber-900/10",
                          isMe && "ring-2 ring-accent/50",
                        )}
                      >
                        <span className="text-3xl block mb-1">{medal}</span>
                        <p className={cn("font-display text-lg", isMe ? "text-accent" : "text-white")}>
                          @{row.username} {isMe && "(Tu)"}
                        </p>
                        <p className="text-white font-display text-xl mt-2">
                          {row.predicted_home_score} – {row.predicted_away_score}
                        </p>
                        <p className="text-accent font-bold mt-1">{row.points_earned ?? "—"} pts</p>
                        {parseFloat(row.amount) > 0 && (
                          <p className="text-xs text-muted mt-1">{formatAmount(row.amount)}</p>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
                {rest.length > 0 && (
                  <div className="rounded-xl border border-white/10 divide-y divide-white/10">
                    {rest.map((row, i) => {
                      const isMe = row.user_id === user?.id;
                      return (
                        <div key={row.user_id} className={cn("flex items-center justify-between px-4 py-3 text-sm", isMe && "bg-accent/5")}>
                          <span className="text-muted w-8">{i + 4}</span>
                          <span className={cn("flex-1 font-medium", isMe ? "text-accent" : "text-white")}>
                            @{row.username} {isMe && "(Tu)"}
                          </span>
                          <span className="text-white font-display w-20 text-center">
                            {row.predicted_home_score}–{row.predicted_away_score}
                          </span>
                          <span className="text-accent font-bold w-14 text-right">{row.points_earned ?? "—"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        <BetForm fixture={fixture} />

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
      </main>
    </div>
  );
}
