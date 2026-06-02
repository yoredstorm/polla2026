"use client";
import Link from "next/link";
import { Trophy, Medal } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { HelpSectionTitle } from "@/components/features/help/HelpSectionTitle";
import { useQuery } from "@tanstack/react-query";
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

export default function WinnersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["pool", "winners"],
    queryFn: () => api.get<WinnersResponse | null>("/groups/pool/active/winners"),
  });

  const medalIcons = [Trophy, Medal, Medal];
  const podium = data?.podium?.length ? data.podium : data?.winners ?? [];
  const prizeWinners = data?.winners ?? [];

  return (
    <PageShell maxWidth="md">
        <HelpSectionTitle as="h1" helpKey="page.winners" className="mb-2">
          Podio y premios
        </HelpSectionTitle>
        <p className="text-muted text-sm mb-8">
          El jugador con más puntos se lleva el 100% del pozo confirmado. Si varios empatan
          en el primer puesto, el premio se reparte en partes iguales entre ellos.
        </p>

        {isLoading && <p className="text-muted">Cargando...</p>}
        {!isLoading && !data && <p className="text-muted">No hay polla activa.</p>}
        {data && (
          <>
            <div className="text-center mb-8">
              <p className="text-xs text-muted uppercase tracking-wide mb-1">Pozo total confirmado</p>
              <p className="text-accent font-display text-2xl tabular-nums">
                {formatMoney(data.currency, data.prize_pool)}
              </p>
            </div>

            {prizeWinners.length > 0 && (
              <section className="mb-8" aria-labelledby="prize-winners-heading">
                <h2 id="prize-winners-heading" className="text-sm font-medium text-white mb-3">
                  {data.tied_for_first ? "Ganadores del pozo (empate)" : "Ganador del pozo"}
                </h2>
                <div className="space-y-3">
                  {prizeWinners.map((w) => (
                    <div
                      key={`prize-${w.username}-${w.position}`}
                      className="flex items-center gap-4 rounded-2xl border border-warning/30 bg-warning/5 p-5"
                    >
                      <Trophy className="w-8 h-8 text-warning shrink-0" aria-hidden />
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/u/${encodeURIComponent(w.username)}`}
                          className="font-display text-xl text-white hover:text-accent"
                        >
                          {w.username}
                        </Link>
                        <p className="text-sm text-muted">{w.total_points} pts</p>
                        {data.tied_for_first && (
                          <p className="text-xs text-muted mt-0.5">Empate en el primer puesto</p>
                        )}
                      </div>
                      <p className="font-display text-xl text-accent tabular-nums shrink-0">
                        {formatMoney(data.currency, w.prize_amount)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {podium.length > 0 && (
              <section aria-labelledby="podium-heading">
                <h2 id="podium-heading" className="text-sm font-medium text-muted mb-3">
                  Podio del ranking
                </h2>
                <div className="space-y-4">
                  {podium.map((w) => {
                    const Icon = medalIcons[w.position - 1];
                    const receivesPrize = prizeWinners.some(
                      (p) => p.username === w.username && p.total_points === w.total_points,
                    );
                    return (
                      <div
                        key={`podium-${w.position}-${w.username}`}
                        className="flex items-center gap-4 rounded-2xl border border-white/10 bg-glass p-5"
                      >
                        {Icon ? (
                          <Icon
                            className={w.position === 1 ? "w-8 h-8 text-warning" : "w-7 h-7 text-muted"}
                            aria-hidden
                          />
                        ) : (
                          <span className="font-display text-2xl text-muted w-8 text-center">
                            {w.position}
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/u/${encodeURIComponent(w.username)}`}
                            className="font-display text-xl text-white hover:text-accent"
                          >
                            {w.username}
                          </Link>
                          <p className="text-sm text-muted">{w.total_points} pts</p>
                          {!receivesPrize && w.position > 1 && (
                            <p className="text-xs text-muted mt-0.5">Sin premio en efectivo</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
        <Link href="/dashboard" className="inline-block mt-8 text-sm text-accent hover:underline">
          Volver al inicio
        </Link>
      </PageShell>
  );
}
