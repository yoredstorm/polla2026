"use client";
import Link from "next/link";
import { Navbar } from "@/components/ui/Navbar";
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
}

export default function WinnersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["pool", "winners"],
    queryFn: () => api.get<WinnersResponse | null>("/groups/pool/active/winners"),
  });

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="min-h-screen page-with-mobile-nav">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="font-display text-3xl text-white mb-2">Podio y premios</h1>
        <p className="text-muted text-sm mb-8">Distribucion 60% / 30% / 10% del pozo acumulado</p>

        {isLoading && <p className="text-muted">Cargando...</p>}
        {!isLoading && !data && <p className="text-muted">No hay polla activa.</p>}
        {data && (
          <>
            <p className="text-center text-accent font-display text-2xl mb-8">
              {data.currency} {parseFloat(data.prize_pool).toLocaleString("es-PE", { minimumFractionDigits: 2 })}
            </p>
            <div className="space-y-4">
              {data.winners.map((w) => (
                <div
                  key={w.position}
                  className="flex items-center gap-4 rounded-2xl border border-white/10 bg-glass p-5"
                >
                  <span className="text-3xl">{medals[w.position - 1] ?? w.position}</span>
                  <div className="flex-1">
                    <Link href={`/u/${encodeURIComponent(w.username)}`} className="font-display text-xl text-white hover:text-accent">
                      {w.username}
                    </Link>
                    <p className="text-sm text-muted">{w.total_points} pts</p>
                  </div>
                  <p className="font-display text-xl text-accent">
                    {data.currency} {parseFloat(w.prize_amount).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
        <Link href="/dashboard" className="inline-block mt-8 text-sm text-accent hover:underline">
          Volver al inicio
        </Link>
      </main>
    </div>
  );
}
