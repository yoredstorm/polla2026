"use client";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { HelpSectionTitle } from "@/components/features/help/HelpSectionTitle";
import { LeaderboardPodium } from "@/components/features/leaderboard/LeaderboardPodium";
import { StaggerItem } from "@/components/ui/StaggerItem";
import { Skeleton } from "@/components/ui/Skeleton";
import { useQuery } from "@tanstack/react-query";
import type { LeaderboardEntry } from "@/types/api";
import api from "@/lib/api";

interface WinnerEntry {
  position: number;
  username: string;
  total_points: number;
  prize_amount: string;
}

interface WinnersResponse {
  group_name: string;
  prize_pool: string;
  currency: string;
  winners: WinnerEntry[];
  podium?: WinnerEntry[];
  tied_for_first?: boolean;
}

function formatMoney(currency: string, value: string | number) {
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (!Number.isFinite(n)) return "—";
  return `${currency} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toLeaderboardEntry(w: WinnerEntry): LeaderboardEntry {
  return {
    position: w.position,
    user_id: w.username,
    username: w.username,
    total_points: w.total_points,
    total_bets: 0,
    correct_results: 0,
    accuracy_pct: 0,
  };
}

export default function WinnersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["pool", "winners"],
    queryFn: () => api.get<WinnersResponse | null>("/groups/pool/active/winners"),
  });

  const podium = data?.podium?.length ? data.podium : data?.winners ?? [];
  const prizeWinners = data?.winners ?? [];
  const podiumEntries = podium.slice(0, 3).map(toLeaderboardEntry);

  return (
    <PageShell maxWidth="md">
        <HelpSectionTitle as="h1" helpKey="page.winners" className="mb-2">
          Podio y premios
        </HelpSectionTitle>
        <p className="text-muted text-sm mb-8">
          El jugador con más puntos se lleva el 100% del pozo confirmado. Si varios empatan
          en el primer puesto, el premio se reparte en partes iguales entre ellos.
        </p>

        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-8 w-48 mx-auto" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
        {!isLoading && !data && <p className="text-muted">No hay polla activa.</p>}
        {data && (
          <>
            <StaggerItem index={0}>
              <div className="text-center mb-8">
                <p className="text-xs text-muted uppercase tracking-wide mb-1">Pozo total confirmado</p>
                <p className="text-accent font-display text-2xl tabular-nums text-glow-accent">
                  {formatMoney(data.currency, data.prize_pool)}
                </p>
              </div>
            </StaggerItem>

            {podiumEntries.length > 0 && (
              <LeaderboardPodium entries={podiumEntries} />
            )}

            {prizeWinners.length > 0 && (
              <section className="mb-8 mt-8" aria-labelledby="prize-winners-heading">
                <h2 id="prize-winners-heading" className="text-sm font-medium text-white mb-3">
                  {data.tied_for_first ? "Ganadores del pozo (empate)" : "Ganador del pozo"}
                </h2>
                <div className="space-y-3">
                  {prizeWinners.map((w, i) => (
                    <StaggerItem key={`prize-${w.username}-${w.position}`} index={i + 1}>
                      <div className="flex items-center gap-4 rounded-2xl border border-warning/30 bg-warning/5 p-5 card-interactive">
                        <Trophy className="w-8 h-8 text-warning shrink-0" aria-hidden />
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/u/${encodeURIComponent(w.username)}`}
                            className="font-display text-xl text-white hover:text-accent transition-colors duration-fast"
                          >
                            {w.username}
                          </Link>
                          <p className="text-sm text-muted">{w.total_points} pts</p>
                          {data.tied_for_first && (
                            <p className="text-xs text-muted mt-0.5">Empate en el primer puesto</p>
                          )}
                        </div>
                        <p className="font-display text-xl text-accent tabular-nums shrink-0 text-glow-accent">
                          {formatMoney(data.currency, w.prize_amount)}
                        </p>
                      </div>
                    </StaggerItem>
                  ))}
                </div>
              </section>
            )}

            {prizeWinners.length === 0 && podium.length === 0 && (
              <p className="text-muted text-center py-8">
                Aún no hay participantes con apuestas en el ranking.
              </p>
            )}
          </>
        )}
        <Link href="/dashboard" className="inline-block mt-8 text-sm text-accent hover:underline nav-link">
          Volver al inicio
        </Link>
      </PageShell>
  );
}
