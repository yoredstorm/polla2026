"use client";
import { useState, useMemo } from "react";
import type { Bet } from "@/types/api";
import { useFixtures } from "@/hooks/useFixtures";
import { useMyBets } from "@/hooks/useBets";
import { useCreateBet } from "@/hooks/useBets";
import { useActivePolla } from "@/hooks/useGroups";
import { formatMatchDate, cn } from "@/lib/utils";

interface Props {
  bet: Bet;
  onClose: () => void;
}

export function CopyBetModal({ bet, onClose }: Props) {
  const [step, setStep] = useState<"pick" | "confirm">("pick");
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const { data: fixturesData } = useFixtures({ status: "scheduled", limit: 50 });
  const { data: myBetsData } = useMyBets(1, 200);
  const { data: polla } = useActivePolla();
  const createBet = useCreateBet();

  const alreadyBetFixtureIds = useMemo(() => {
    const ids = new Set<string>();
    myBetsData?.data.forEach((b) => ids.add(b.fixture_id));
    return ids;
  }, [myBetsData]);

  const bettableFixtures = useMemo(
    () =>
      (fixturesData?.data ?? []).filter(
        (f) => !f.is_locked && f.status === "scheduled" && f.betting_open && !alreadyBetFixtureIds.has(f.id),
      ),
    [fixturesData, alreadyBetFixtureIds],
  );

  const selectedFixture = bettableFixtures.find((f) => f.id === selectedFixtureId);

  const currency = polla?.currency ?? "USD";
  const extraAmount = polla?.per_match_amount ? parseFloat(polla.per_match_amount) : 0;

  async function handleConfirm() {
    if (!selectedFixtureId) return;
    setError("");
    try {
      // Copy creates a plain bet (no extra). Extra can be added from the fixture page after.
      await createBet.mutateAsync({
        fixture_id: selectedFixtureId,
        predicted_home_score: bet.predicted_home_score,
        predicted_away_score: bet.predicted_away_score,
      });
      onClose();
    } catch (e: any) {
      const code = e?.error?.code || e?.detail || "";
      if (code === "NOT_POLLA_MEMBER") {
        setError("Tu pago de entrada no ha sido confirmado por el admin.");
      } else if (code === "BET_ALREADY_EXISTS") {
        setError("Ya tienes una apuesta en este partido.");
      } else if (code === "BET_LOCKED") {
        setError("Este partido ya no acepta apuestas.");
      } else {
        setError(e?.error?.message || "Error al guardar. Intenta de nuevo.");
      }
    }
  }

  // Block while loading
  if (!polla) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-surface rounded-2xl border border-white/10 p-6 max-w-sm w-full space-y-4 text-center">
          <p className="text-muted text-sm animate-pulse">Cargando...</p>
          <button onClick={onClose} className="w-full py-2 rounded-lg border border-white/10 text-muted hover:bg-white/5 text-sm">
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  // Block if polla exists and user is not a confirmed member
  if (!polla.is_member) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-surface rounded-2xl border border-white/10 p-6 max-w-sm w-full space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🔒</span>
            <div>
              <h4 className="font-display text-xl text-white">Pago pendiente</h4>
              <p className="text-amber-300 text-sm mt-0.5">
                El admin debe confirmar tu pago de entrada antes de que puedas apostar.
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-full py-2.5 rounded-lg border border-white/10 text-muted hover:bg-white/5">
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl border border-white/10 w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h3 className="font-display text-xl text-white">Copiar prediccion</h3>
            <p className="text-xs text-muted mt-0.5">
              Prediccion a copiar:{" "}
              <span className="text-accent font-bold">
                {bet.predicted_home_score} – {bet.predicted_away_score}
              </span>
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-white text-2xl leading-none">×</button>
        </div>

        {step === "pick" ? (
          <>
            <div className="px-6 py-4 border-b border-white/10">
              <p className="text-sm text-muted">
                Selecciona un partido disponible al que quieras aplicar esta prediccion.
                Solo se muestran partidos en los que aun no apostaste.
              </p>
            </div>

            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
              {bettableFixtures.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-muted text-sm">No hay partidos disponibles.</p>
                  <p className="text-xs text-muted/60 mt-1">Ya apostaste en todos los partidos abiertos o no hay ninguno programado.</p>
                </div>
              ) : (
                bettableFixtures.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFixtureId(f.id)}
                    className={cn(
                      "w-full text-left rounded-xl border px-4 py-3 transition-colors",
                      selectedFixtureId === f.id
                        ? "border-accent bg-accent/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10",
                    )}
                  >
                    <p className="text-white text-sm font-medium">
                      {f.home_team} vs {f.away_team}
                    </p>
                    <p className="text-muted text-xs mt-0.5">
                      {f.league_name} · {formatMatchDate(f.match_date)}
                    </p>
                  </button>
                ))
              )}
            </div>

            <div className="px-6 py-4 border-t border-white/10 flex gap-3">
              <button onClick={onClose}
                className="flex-1 py-2.5 rounded-lg border border-white/10 text-muted hover:bg-white/5 transition-colors text-sm">
                Cancelar
              </button>
              <button
                onClick={() => { if (selectedFixtureId) setStep("confirm"); }}
                disabled={!selectedFixtureId}
                className="flex-1 py-2.5 rounded-lg bg-accent text-background font-bold hover:bg-accent-dim disabled:opacity-40 transition-colors text-sm"
              >
                Siguiente →
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="px-6 py-6 space-y-4 overflow-y-auto flex-1">
              {/* Selected fixture summary */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-muted uppercase tracking-wide mb-1">Partido seleccionado</p>
                <p className="text-white font-medium">{selectedFixture?.home_team} vs {selectedFixture?.away_team}</p>
                <p className="text-muted text-xs mt-0.5">
                  {selectedFixture?.league_name} · {selectedFixture ? formatMatchDate(selectedFixture.match_date) : ""}
                </p>
              </div>

              {/* Prediction */}
              <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 text-center">
                <p className="text-xs text-muted uppercase tracking-wide mb-2">Tu prediccion</p>
                <p className="font-display text-5xl text-accent">
                  {bet.predicted_home_score} – {bet.predicted_away_score}
                </p>
              </div>

              {/* Extra info note */}
              {polla && extraAmount > 0 && polla.is_member && (
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-xs text-muted">
                    Al apostar podras agregar el extra de{" "}
                    <span className="text-white">{currency} {extraAmount.toFixed(2)}</span>{" "}
                    al pozo desde la pagina del partido.
                  </p>
                </div>
              )}
              {polla && !polla.is_member && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                  <p className="text-amber-300 text-sm font-medium">No eres miembro de la polla</p>
                  <p className="text-amber-200/70 text-xs mt-0.5">
                    Tu apuesta se registra sin monto. Habla con el admin para confirmar tu pago de entrada.
                  </p>
                </div>
              )}

              {error && <p className="text-danger text-sm text-center">{error}</p>}
            </div>

            <div className="px-6 py-4 border-t border-white/10 flex gap-3">
              <button onClick={() => { setStep("pick"); setError(""); }}
                className="flex-1 py-2.5 rounded-lg border border-white/10 text-muted hover:bg-white/5 transition-colors text-sm">
                ← Volver
              </button>
              <button
                onClick={handleConfirm}
                disabled={createBet.isPending}
                className="flex-1 py-2.5 rounded-lg bg-accent text-background font-bold hover:bg-accent-dim disabled:opacity-50 transition-colors text-sm"
              >
                {createBet.isPending ? "Guardando..." : "Confirmar apuesta"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
