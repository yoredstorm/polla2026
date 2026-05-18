"use client";
import { useState, useMemo } from "react";
import { Lock } from "lucide-react";
import type { Bet } from "@/types/api";
import { useActivePolla } from "@/hooks/useGroups";
import { useCreateBet, useMyBetsForFixture } from "@/hooks/useBets";
import { useFixture } from "@/hooks/useFixtures";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { formatAmount, formatMatchDate, cn } from "@/lib/utils";

interface Props {
  bet: Bet;
  onClose: () => void;
}

export function CopyBetDetailModal({ bet, onClose }: Props) {
  const { data: polla, isLoading: pollaLoading } = useActivePolla();
  const { data: existingBets, isLoading: betsLoading } = useMyBetsForFixture(bet.fixture_id);
  const { data: fixture, isLoading: fixtureLoading } = useFixture(bet.fixture_id);
  const createBet = useCreateBet();
  const toast = useToast((s) => s.add);

  const [homeScore, setHomeScore] = useState(bet.predicted_home_score);
  const [awayScore, setAwayScore] = useState(bet.predicted_away_score);

  const hasFreeBet = useMemo(() => existingBets?.some((b) => !b.group_id) ?? false, [existingBets]);

  const isExtra = hasFreeBet;
  const perMatchAmount = polla?.per_match_amount ? parseFloat(polla.per_match_amount) : 0;
  const currency = polla?.currency ?? "USD";

  const isLoading = pollaLoading || betsLoading || fixtureLoading;

  async function handleConfirm() {
    try {
      if (isExtra && polla) {
        await createBet.mutateAsync({
          fixture_id: bet.fixture_id,
          predicted_home_score: homeScore,
          predicted_away_score: awayScore,
          group_id: polla.id,
          amount: perMatchAmount,
        });
        toast("Apuesta extra copiada. Pendiente de confirmacion del admin.", "success");
      } else {
        await createBet.mutateAsync({
          fixture_id: bet.fixture_id,
          predicted_home_score: homeScore,
          predicted_away_score: awayScore,
        });
        toast("Apuesta copiada correctamente", "success");
      }
      onClose();
    } catch (e: unknown) {
      const err = e as { error?: { code?: string; message?: string }; detail?: string };
      const code = err?.error?.code || err?.detail || "";
      if (code === "NOT_POLLA_MEMBER") {
        toast("Tu pago de entrada no ha sido confirmado por el admin.", "error");
      } else if (code === "BET_LOCKED") {
        toast("Este partido ya no acepta apuestas.", "error");
      } else {
        toast(err?.error?.message || "Error al copiar la apuesta", "error");
      }
    }
  }

  return (
    <Modal open onClose={onClose} title="Copiar prediccion" size="md">
      {isLoading ? (
        <p className="text-muted text-sm text-center py-8 animate-pulse">Cargando...</p>
      ) : !polla ? (
        <p className="text-danger text-sm text-center py-8">No hay polla activa</p>
      ) : !polla.is_member ? (
        <div className="text-center py-6 space-y-2">
          <Lock className="w-10 h-10 text-warning mx-auto" aria-hidden />
          <p className="text-warning text-sm font-medium">Pago de entrada pendiente</p>
          <p className="text-muted text-xs">El admin debe confirmar tu pago antes de que puedas apostar.</p>
        </div>
      ) : (
        <>
          {fixture && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 mb-4">
              <div className="flex items-center justify-center gap-3 text-sm">
                {fixture.home_logo_url && (
                  <img src={fixture.home_logo_url} alt="" className="w-6 h-6 object-contain" />
                )}
                <span className="text-white font-medium">
                  {fixture.home_team} vs {fixture.away_team}
                </span>
                {fixture.away_logo_url && (
                  <img src={fixture.away_logo_url} alt="" className="w-6 h-6 object-contain" />
                )}
              </div>
              <p className="text-xs text-muted text-center mt-1">
                {fixture.league_name} · {formatMatchDate(fixture.match_date)}
              </p>
            </div>
          )}

          <div className="text-center mb-4">
            <span
              className={cn(
                "inline-block text-xs px-3 py-1 rounded-full font-medium",
                isExtra ? "bg-warning/20 text-warning" : "bg-success/20 text-success",
              )}
            >
              {isExtra ? `Extra (+${formatAmount(String(perMatchAmount), currency)})` : "Nueva (gratis)"}
            </span>
            {isExtra && (
              <p className="text-xs text-warning/80 mt-2">
                Ya tienes una prediccion para este partido. Esta copia sera una apuesta extra.
              </p>
            )}
          </div>

          <div className="space-y-2 mb-6">
            <p className="text-xs text-muted uppercase tracking-wide text-center">Prediccion (puedes editar)</p>
            <div className="flex items-center justify-center gap-4">
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-muted">{fixture?.home_team ?? "Local"}</span>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={homeScore}
                  onChange={(e) => setHomeScore(parseInt(e.target.value) || 0)}
                  className="w-16 text-center bg-white/10 border border-white/20 rounded-lg py-2 text-white text-xl font-bold focus-ring"
                />
              </div>
              <span className="font-display text-2xl text-muted mt-4">–</span>
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-muted">{fixture?.away_team ?? "Visitante"}</span>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={awayScore}
                  onChange={(e) => setAwayScore(parseInt(e.target.value) || 0)}
                  className="w-16 text-center bg-white/10 border border-white/20 rounded-lg py-2 text-white text-xl font-bold focus-ring"
                />
              </div>
            </div>
            <p className="text-[10px] text-muted text-center">
              Original: {bet.predicted_home_score} – {bet.predicted_away_score}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-white/10 text-muted hover:bg-white/5 transition-colors text-sm cursor-pointer focus-ring"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={createBet.isPending}
              className="flex-1 py-2.5 rounded-lg bg-accent text-background font-bold hover:bg-accent-dim disabled:opacity-50 transition-colors text-sm cursor-pointer focus-ring"
            >
              {createBet.isPending ? "Guardando..." : isExtra ? "Copiar como extra" : "Copiar apuesta"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
