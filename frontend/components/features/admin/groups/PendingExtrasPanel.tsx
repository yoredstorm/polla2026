"use client";
import { useState } from "react";
import { useScopedConfirmExtra, useScopedPendingExtras } from "@/hooks/admin/useScopedGroupAdmin";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
import { getApiErrorMessage } from "@/lib/challengeUtils";
import { useToast } from "@/components/ui/Toast";

export function PendingExtrasPanel({
  pollaId,
  currency,
  competitionSlug,
}: {
  pollaId: string;
  currency: string;
  competitionSlug?: string;
}) {
  const { data: extras, isLoading } = useScopedPendingExtras(pollaId, competitionSlug);
  const confirmExtra = useScopedConfirmExtra(competitionSlug);
  const toast = useToast((s) => s.add);
  const [confirmed, setConfirmed] = useState<Record<string, string>>({});

  async function confirm(betId: string) {
    try {
      const res = await confirmExtra.mutateAsync({ groupId: pollaId, betId });
      setConfirmed((s) => ({ ...s, [betId]: res.prize_pool }));
    } catch (err) {
      toast(
        getApiErrorMessage(err, "No se puede confirmar: el partido ya comenzó o el extra fue cancelado"),
        "error",
      );
    }
  }

  if (isLoading) return <p className="text-muted text-sm">Cargando...</p>;
  if (!extras?.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center">
        <p className="text-muted text-sm">No hay adicionales pendientes de confirmacion.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <ul className="md:hidden divide-y divide-white/10">
        {extras.map((ex) => (
          <li key={ex.bet_id} className="p-4 space-y-2">
            <UserDisplayName username={ex.username} firstName={ex.first_name} lastName={ex.last_name} />
            <p className="font-display text-accent">
              {ex.predicted_home_score} – {ex.predicted_away_score}
            </p>
            <p className="text-sm text-accent font-bold">
              {currency} {parseFloat(ex.amount).toFixed(2)}
            </p>
            {confirmed[ex.bet_id] ? (
              <span className="text-xs text-emerald-400">Confirmado ✓</span>
            ) : (
              <button
                type="button"
                onClick={() => confirm(ex.bet_id)}
                disabled={confirmExtra.isPending}
                className="w-full min-h-11 text-sm px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-300 font-medium"
              >
                ✓ Confirmar pago
              </button>
            )}
          </li>
        ))}
      </ul>
      <table className="w-full text-sm hidden md:table">
        <thead>
          <tr className="border-b border-white/10 bg-white/5 text-muted text-xs uppercase">
            <th className="text-left px-4 py-3">Usuario</th>
            <th className="text-center px-4 py-3">Prediccion extra</th>
            <th className="text-right px-4 py-3">Monto</th>
            <th className="text-right px-4 py-3">Fecha</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {extras.map((ex) => (
            <tr key={ex.bet_id} className="border-b border-white/5 hover:bg-white/5">
              <td className="px-4 py-3">
                <UserDisplayName
                  username={ex.username}
                  firstName={ex.first_name}
                  lastName={ex.last_name}
                />
              </td>
              <td className="px-4 py-3 text-center">
                <span className="font-display text-accent text-base">
                  {ex.predicted_home_score} – {ex.predicted_away_score}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-bold text-accent">
                {currency} {parseFloat(ex.amount).toFixed(2)}
              </td>
              <td className="px-4 py-3 text-right text-muted text-xs">
                {new Date(ex.created_at).toLocaleDateString("es-PE")}
              </td>
              <td className="px-4 py-3 text-right">
                {confirmed[ex.bet_id] ? (
                  <span className="text-xs text-emerald-400">Confirmado ✓</span>
                ) : (
                  <button
                    onClick={() => confirm(ex.bet_id)}
                    disabled={confirmExtra.isPending}
                    className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors font-medium"
                  >
                    ✓ Confirmar pago
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
