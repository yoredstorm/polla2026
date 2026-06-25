"use client";
import type { Fixture } from "@/types/api";
import { PaymentEntryBlock } from "@/components/features/payment/PaymentEntryBlock";
import { needsPaymentBlockForFixture } from "@/lib/prizeStructure";
import { cn } from "@/lib/utils";
import { getBettingClosesAt } from "@/lib/matchTiming";
import { FixtureDeadlineCountdown } from "@/components/features/betting/FixtureDeadlineCountdown";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DUPLICATE_PREDICTION_MESSAGE } from "@/lib/betPredictionUtils";
import { useBetForm } from "@/hooks/betting/useBetForm";
import { MotionSafeSpan } from "@/components/ui/MotionSafe";
import { entranceTransition } from "@/lib/motion";
import { parseApiError } from "@/lib/apiError";

function ScoreInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Reducir goles ${label}`}
          onClick={() => onChange(Math.max(0, value - 1))}
          className="min-h-11 min-w-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white font-bold pressable"
        >
          –
        </button>
        <MotionSafeSpan
          key={value}
          initial={{ scale: 1.12 }}
          animate={{ scale: 1 }}
          transition={entranceTransition()}
          className="font-display text-3xl w-10 text-center text-white inline-block"
        >
          {value}
        </MotionSafeSpan>
        <button
          type="button"
          aria-label={`Aumentar goles ${label}`}
          onClick={() => onChange(Math.min(20, value + 1))}
          className="min-h-11 min-w-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white font-bold pressable"
        >
          +
        </button>
      </div>
    </div>
  );
}

interface BetFormProps {
  fixture: Fixture;
}

export function BetForm({ fixture }: BetFormProps) {
  const {
    showConfirm,
    setShowConfirm,
    pendingValues,
    showExtraForm,
    setShowExtraForm,
    showExtraConfirm,
    setShowExtraConfirm,
    extraPending,
    setExtraPending,
    createBet,
    betsLoading,
    polla,
    pollaLoading,
    handleSubmit,
    setValue,
    homeScore,
    awayScore,
    freeBet,
    extraBets,
    currency,
    extraAmount,
    fixtureOpen,
    canAddExtra,
    extraDuplicate,
    onSubmit,
    confirmMainBet,
    onExtraSubmit,
    confirmExtraBet,
  } = useBetForm(fixture);

  const betErrorMessage =
    parseApiError(createBet.error)?.message ?? "Error al guardar";

  // ── Betting not yet opened by admin ─────────────────────────────
  if (!fixture.betting_open) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-center space-y-2">
        <p className="text-2xl">🔐</p>
        <p className="text-white font-medium">Apuestas no habilitadas aun</p>
        <p className="text-xs text-muted/70">
          El admin habilitara las apuestas cuando los equipos esten confirmados.
        </p>
      </div>
    );
  }

  // ── Locked fixture (finished / live / cancelled — server flag) ───
  if (fixture.is_locked) {
    return (
      <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-center">
        <p className="text-warning font-medium">Este partido ya no acepta apuestas</p>
      </div>
    );
  }

  // ── Wait for both polla and existing bets to resolve ─────────────
  if (pollaLoading || betsLoading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <p className="text-muted text-sm animate-pulse">Cargando...</p>
      </div>
    );
  }

  // ── No active polla configured by admin ──────────────────────────
  if (!polla) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-center space-y-2">
        <p className="text-muted font-medium">No hay una polla activa</p>
        <p className="text-xs text-muted/60">
          El admin aun no ha configurado la polla. Vuelve mas tarde.
        </p>
      </div>
    );
  }

  // ── Polla exists but user cannot bet (membership or phase enrollment) ──
  if (!polla.is_member || needsPaymentBlockForFixture(polla, fixture)) {
    return <PaymentEntryBlock polla={polla} currency={currency} />;
  }

  return (
    <div className="space-y-4">
      {/* ── Existing free bet ── */}
      {freeBet && (
        <Card glow className="border-accent/20 bg-accent/5 p-5 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="text-white font-medium">Tu prediccion</p>
              <p className="font-display text-2xl text-accent mt-0.5">
                {freeBet.predicted_home_score} – {freeBet.predicted_away_score}
              </p>
            </div>
          </div>

          {extraBets.length > 0 && (
            <div className="space-y-2">
              {extraBets.map((eb, idx) => (
                <div
                  key={eb.id}
                  className={cn(
                    "rounded-lg px-4 py-3 text-sm border",
                    eb.cancelled_at
                      ? "bg-red-500/10 border-red-500/20"
                      : eb.amount_confirmed
                        ? "bg-emerald-500/10 border-emerald-500/20"
                        : "bg-amber-500/10 border-amber-500/20",
                  )}
                >
                  <p
                    className={cn(
                      "font-medium",
                      eb.cancelled_at
                        ? "text-red-300"
                        : eb.amount_confirmed
                          ? "text-emerald-300"
                          : "text-amber-300",
                    )}
                  >
                    Extra #{idx + 1}:{" "}
                    <span className="font-display text-lg">
                      {eb.predicted_home_score} – {eb.predicted_away_score}
                    </span>
                    <span className="ml-2 text-xs font-normal">
                      (+{currency} {parseFloat(eb.amount).toFixed(2)})
                    </span>
                  </p>
                  <p
                    className={cn(
                      "text-xs mt-0.5",
                      eb.cancelled_at
                        ? "text-red-200/70"
                        : eb.amount_confirmed
                          ? "text-emerald-200/70"
                          : "text-amber-200/70",
                    )}
                  >
                    {eb.cancelled_at
                      ? "Cancelado por falta de pago antes del inicio del partido"
                      : eb.amount_confirmed
                        ? "Pago confirmado por el admin ✓"
                        : "Pago pendiente de confirmacion por el admin"}
                  </p>
                </div>
              ))}
            </div>
          )}

          {canAddExtra && (
            <div>
              <button
                onClick={() => {
                  setExtraPending({ predicted_home_score: 1, predicted_away_score: 0 });
                  setShowExtraForm(true);
                }}
                className="w-full py-2.5 rounded-xl border border-accent/40 text-accent text-sm font-medium hover:bg-accent/10 transition-colors"
              >
                + Agregar prediccion extra al pozo ({currency} {extraAmount.toFixed(2)})
              </button>
              <p className="text-xs text-muted/60 text-center mt-1.5">
                Puedes apostar un marcador diferente pagando el adicional. El admin confirma tu pago.
              </p>
            </div>
          )}
        </Card>
      )}

      {/* ── Main bet form (shown only when no free bet yet) ── */}
      {!freeBet && (
        !fixtureOpen ? (
          <div className="rounded-xl border border-warning/30 bg-warning/5 p-5 text-center space-y-2">
            <p className="text-warning font-medium">Este partido ya no acepta nuevas apuestas</p>
            <p className="text-xs text-muted">
              Las apuestas cierran 1 minuto antes del inicio del partido.
            </p>
          </div>
        ) : (
          <Card className="p-6">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <h3 className="font-display text-xl text-white">Realizar Apuesta</h3>
              <FixtureDeadlineCountdown
                deadlineMs={getBettingClosesAt(fixture)}
                label="Cierran apuestas en"
                compact
              />
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="flex items-center justify-center gap-8">
                <ScoreInput
                  label={fixture.home_team}
                  value={homeScore}
                  onChange={(v) => setValue("predicted_home_score", v)}
                />
                <span className="font-display text-2xl text-muted">–</span>
                <ScoreInput
                  label={fixture.away_team}
                  value={awayScore}
                  onChange={(v) => setValue("predicted_away_score", v)}
                />
              </div>
              <p className="text-xs text-muted text-center">
                Exacto (goles + ganador) = 2pts · Solo ganador = 1pt · Fallo = 0pts
              </p>
              <Button type="submit" size="lg">
                Apostar
              </Button>
            </form>
          </Card>
        )
      )}

      {/* ── Main bet confirm modal ── */}
      {showConfirm && pendingValues && (
        <Modal
          open={showConfirm}
          onClose={() => setShowConfirm(false)}
          title="Confirmar Apuesta"
          size="sm"
        >
            <div className="text-center py-2">
              <p className="text-muted text-sm mb-1">Tu prediccion</p>
              <p className="font-display text-5xl text-accent">
                {pendingValues.predicted_home_score} – {pendingValues.predicted_away_score}
              </p>
            </div>
            {extraAmount > 0 && polla?.is_member && (
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-muted">
                Despues de apostar podras agregar predicciones extra de{" "}
                {currency} {extraAmount.toFixed(2)} cada una al pozo.
              </div>
            )}
            <p className="text-xs text-warning text-center">
              Una vez guardada, no podras editar esta apuesta.
            </p>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setShowConfirm(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={confirmMainBet}
                loading={createBet.isPending}
              >
                Confirmar
              </Button>
            </div>
            {createBet.isError && (
              <p className="text-danger text-xs text-center">{betErrorMessage}</p>
            )}
        </Modal>
      )}

      {showExtraForm && extraPending && (
        <Modal
          open={showExtraForm}
          onClose={() => {
            setShowExtraForm(false);
            setExtraPending(null);
          }}
          title="Prediccion extra"
          size="sm"
        >
            <p className="text-xs text-muted mb-4">
              Elige un marcador diferente. Esta apuesta cuesta{" "}
              <span className="text-accent font-bold">
                {currency} {extraAmount.toFixed(2)}
              </span>{" "}
              y el admin debe confirmar tu pago.
            </p>
            <form onSubmit={onExtraSubmit} className="space-y-5">
              <div className="flex items-center justify-center gap-8">
                <ScoreInput
                  label={fixture.home_team}
                  value={extraPending.predicted_home_score}
                  onChange={(v) =>
                    setExtraPending((p) => p && { ...p, predicted_home_score: v })
                  }
                />
                <span className="font-display text-2xl text-muted">–</span>
                <ScoreInput
                  label={fixture.away_team}
                  value={extraPending.predicted_away_score}
                  onChange={(v) =>
                    setExtraPending((p) => p && { ...p, predicted_away_score: v })
                  }
                />
              </div>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => { setShowExtraForm(false); setExtraPending(null); }}
                >
                  Cancelar
                </Button>
                {extraDuplicate && (
                  <p className="text-danger text-xs text-center">{DUPLICATE_PREDICTION_MESSAGE}</p>
                )}
                <Button type="submit" className="flex-1" disabled={extraDuplicate}>
                  Siguiente →
                </Button>
              </div>
            </form>
        </Modal>
      )}

      {showExtraConfirm && extraPending && (
        <Modal
          open={showExtraConfirm}
          onClose={() => {
            setShowExtraConfirm(false);
            setShowExtraForm(true);
          }}
          title="Confirmar prediccion extra"
          size="sm"
        >
            <div className="text-center py-2">
              <p className="text-muted text-sm mb-1">Tu prediccion extra</p>
              <p className="font-display text-5xl text-accent">
                {extraPending.predicted_home_score} – {extraPending.predicted_away_score}
              </p>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
              <p className="text-amber-300 font-medium">Antes de confirmar</p>
              <p className="text-amber-200/80 text-xs mt-1">
                Asegurate de transferir{" "}
                <strong>
                  {currency} {extraAmount.toFixed(2)}
                </strong>{" "}
                al admin. El monto no sumara al pozo hasta que el admin confirme tu pago.
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => { setShowExtraConfirm(false); setShowExtraForm(true); }}
              >
                ← Volver
              </Button>
              {extraDuplicate && (
                <p className="text-danger text-xs text-center mb-2">{DUPLICATE_PREDICTION_MESSAGE}</p>
              )}
              <Button
                type="button"
                className="flex-1"
                onClick={confirmExtraBet}
                loading={createBet.isPending}
                disabled={extraDuplicate}
              >
                Confirmar
              </Button>
            </div>
            {createBet.isError && (
              <p className="text-danger text-xs text-center">{betErrorMessage}</p>
            )}
        </Modal>
      )}
    </div>
  );
}
