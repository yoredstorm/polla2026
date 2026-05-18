"use client";
import { useState, useMemo } from "react";
import { Lock } from "lucide-react";
import type { Bet } from "@/types/api";
import { useFixtures } from "@/hooks/useFixtures";
import { useMyBets } from "@/hooks/useBets";
import { useCreateBet } from "@/hooks/useBets";
import { useActivePolla } from "@/hooks/useGroups";
import { Modal } from "@/components/ui/Modal";
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
      await createBet.mutateAsync({
        fixture_id: selectedFixtureId,
        predicted_home_score: bet.predicted_home_score,
        predicted_away_score: bet.predicted_away_score,
      });
      onClose();
    } catch (e: unknown) {
      const err = e as { error?: { code?: string; message?: string }; detail?: string };
      const code = err?.error?.code || err?.detail || "";
      if (code === "NOT_POLLA_MEMBER") {
        setError("Tu pago de entrada no ha sido confirmado por el admin.");
      } else if (code === "BET_ALREADY_EXISTS") {
        setError("Ya tienes una apuesta en este partido.");
      } else if (code === "BET_LOCKED") {
        setError("Este partido ya no acepta apuestas.");
      } else {
        setError(err?.error?.message || "Error al guardar. Intenta de nuevo.");
      }
    }
  }

  if (!polla) {
    return (
      <Modal open onClose={onClose} title="Copiar prediccion" size="sm">
        <p className="text-muted text-sm text-center animate-pulse py-4">Cargando...</p>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2 rounded-lg border border-white/10 text-muted hover:bg-white/5 text-sm cursor-pointer focus-ring"
        >
          Cerrar
        </button>
      </Modal>
    );
  }

  if (!polla.is_member) {
    return (
      <Modal open onClose={onClose} title="Pago pendiente" size="sm">
        <div className="flex items-center gap-3 mb-4">
          <Lock className="w-8 h-8 text-warning shrink-0" aria-hidden />
          <p className="text-warning text-sm">
            El admin debe confirmar tu pago de entrada antes de que puedas apostar.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-lg border border-white/10 text-muted hover:bg-white/5 cursor-pointer focus-ring"
        >
          Cerrar
        </button>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      hideCloseButton
      size="lg"
      className="p-0 flex flex-col overflow-hidden max-h-[85vh]"
    >
      <div className="px-6 py-4 border-b border-white/10 shrink-0 pr-10">
        <h3 className="font-display text-xl text-white">Copiar prediccion</h3>
        <p className="text-xs text-muted mt-0.5">
          Prediccion a copiar:{" "}
          <span className="text-accent font-bold">
            {bet.predicted_home_score} – {bet.predicted_away_score}
          </span>
        </p>
      </div>

      {step === "pick" ? (
        <>
          <div className="px-6 py-4 border-b border-white/10 shrink-0">
            <p className="text-sm text-muted">
              Selecciona un partido disponible al que quieras aplicar esta prediccion. Solo se muestran partidos en
              los que aun no apostaste.
            </p>
          </div>

          <div className="overflow-y-auto flex-1 min-h-0 px-4 py-3 space-y-2">
            {bettableFixtures.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-muted text-sm">No hay partidos disponibles.</p>
                <p className="text-xs text-muted/60 mt-1">
                  Ya apostaste en todos los partidos abiertos o no hay ninguno programado.
                </p>
              </div>
            ) : (
              bettableFixtures.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelectedFixtureId(f.id)}
                  className={cn(
                    "w-full text-left rounded-xl border px-4 py-3 transition-colors duration-200 cursor-pointer focus-ring",
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

          <div className="px-6 py-4 border-t border-white/10 flex gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-white/10 text-muted hover:bg-white/5 transition-colors text-sm cursor-pointer focus-ring"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectedFixtureId) setStep("confirm");
              }}
              disabled={!selectedFixtureId}
              className="flex-1 py-2.5 rounded-lg bg-accent text-background font-bold hover:bg-accent-dim disabled:opacity-40 transition-colors text-sm cursor-pointer focus-ring"
            >
              Siguiente →
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="px-6 py-6 space-y-4 overflow-y-auto flex-1 min-h-0">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-muted uppercase tracking-wide mb-1">Partido seleccionado</p>
              <p className="text-white font-medium">
                {selectedFixture?.home_team} vs {selectedFixture?.away_team}
              </p>
              <p className="text-muted text-xs mt-0.5">
                {selectedFixture?.league_name} ·{" "}
                {selectedFixture ? formatMatchDate(selectedFixture.match_date) : ""}
              </p>
            </div>

            <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 text-center">
              <p className="text-xs text-muted uppercase tracking-wide mb-2">Tu prediccion</p>
              <p className="font-display text-5xl text-accent">
                {bet.predicted_home_score} – {bet.predicted_away_score}
              </p>
            </div>

            {extraAmount > 0 && (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs text-muted">
                  Al apostar podras agregar el extra de{" "}
                  <span className="text-white">
                    {currency} {extraAmount.toFixed(2)}
                  </span>{" "}
                  al pozo desde la pagina del partido.
                </p>
              </div>
            )}

            {error && <p className="text-danger text-sm text-center">{error}</p>}
          </div>

          <div className="px-6 py-4 border-t border-white/10 flex gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setStep("pick");
                setError("");
              }}
              className="flex-1 py-2.5 rounded-lg border border-white/10 text-muted hover:bg-white/5 transition-colors text-sm cursor-pointer focus-ring"
            >
              ← Volver
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={createBet.isPending}
              className="flex-1 py-2.5 rounded-lg bg-accent text-background font-bold hover:bg-accent-dim disabled:opacity-50 transition-colors text-sm cursor-pointer focus-ring"
            >
              {createBet.isPending ? "Guardando..." : "Confirmar apuesta"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
