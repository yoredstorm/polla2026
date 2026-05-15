"use client";
import { useAdminStats, useAdminTopWinners } from "@/hooks/useAdmin";

export default function AdminDashboardPage() {
  const { data: stats, isLoading: loadingStats } = useAdminStats();
  const { data: winners, isLoading: loadingWinners } = useAdminTopWinners(10);

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl text-white">Panel de Administracion</h1>

      {loadingStats ? (
        <p className="text-muted">Cargando estadisticas...</p>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Usuarios", value: stats.total_users },
            { label: "Apuestas", value: stats.total_bets },
            { label: "Pendientes", value: stats.pending_bets },
            { label: "Partidos finalizados", value: stats.finished_fixtures },
            { label: "Prize pools", value: `$${stats.total_prize_pools}` },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/10 bg-glass backdrop-blur-sm p-4">
              <p className="text-xs text-muted uppercase tracking-wide">{s.label}</p>
              <p className="font-display text-2xl text-white mt-1">{s.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div>
        <h2 className="font-display text-xl text-white mb-4">Top Ganadores</h2>
        {loadingWinners ? (
          <p className="text-muted">Cargando...</p>
        ) : winners && winners.length > 0 ? (
          <div className="rounded-xl border border-white/10 bg-glass backdrop-blur-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-muted text-xs uppercase">
                  <th className="text-left px-4 py-3">#</th>
                  <th className="text-left px-4 py-3">Usuario</th>
                  <th className="text-right px-4 py-3">Puntos</th>
                  <th className="text-right px-4 py-3">Apuestas</th>
                  <th className="text-right px-4 py-3">Aciertos</th>
                  <th className="text-right px-4 py-3">Fallos</th>
                </tr>
              </thead>
              <tbody>
                {winners.map((w, i) => (
                  <tr key={w.user_id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-4 py-3 text-muted">{i + 1}</td>
                    <td className="px-4 py-3 text-white font-medium">{w.username}</td>
                    <td className="px-4 py-3 text-right text-accent font-bold">{w.total_points}</td>
                    <td className="px-4 py-3 text-right text-muted">{w.total_bets}</td>
                    <td className="px-4 py-3 text-right text-emerald-400">{w.correct}</td>
                    <td className="px-4 py-3 text-right text-red-400">{w.wrong}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted">No hay datos aun.</p>
        )}
      </div>
    </div>
  );
}
