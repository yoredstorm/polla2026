"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Fixture } from "@/types/api";
import { useCreateBet, useMyBetsForFixture } from "@/hooks/useBets";
import { useActivePolla } from "@/hooks/useGroups";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

const betSchema = z.object({
  predicted_home_score: z.number().min(0).max(20),
  predicted_away_score: z.number().min(0).max(20),
});
type BetFormValues = z.infer<typeof betSchema>;

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
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold transition-colors"
        >
          –
        </button>
        <span className="font-display text-3xl w-10 text-center text-white">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(20, value + 1))}
          className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold transition-colors"
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
  // ── Main bet form state ──────────────────────────────────────────
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingValues, setPendingValues] = useState<BetFormValues | null>(null);

  // ── Extra prediction form state ──────────────────────────────────
  const [showExtraForm, setShowExtraForm] = useState(false);
  const [showExtraConfirm, setShowExtraConfirm] = useState(false);
  const [extraPending, setExtraPending] = useState<BetFormValues | null>(null);

  const createBet = useCreateBet();
  const { data: existingBets, isLoading: betsLoading } = useMyBetsForFixture(fixture.id);
  const { data: polla, isLoading: pollaLoading } = useActivePolla();
  const toast = useToast((s) => s.add);

  const { handleSubmit, watch, setValue } = useForm<BetFormValues>({
    resolver: zodResolver(betSchema),
    defaultValues: { predicted_home_score: 1, predicted_away_score: 0 },
  });
  const homeScore = watch("predicted_home_score");
  const awayScore = watch("predicted_away_score");

  const freeBet = existingBets?.find((b) => !b.group_id) ?? null;
  const extraBets = existingBets?.filter((b) => !!b.group_id) ?? [];

  const currency = polla?.currency ?? "USD";
  const extraAmount = polla?.per_match_amount ? parseFloat(polla.per_match_amount) : 0;

  /** Same rule as backend `should_lock_fixture`: no new bets from 1h before kickoff. */
  const bettingCutoffReached = (() => {
    if (!fixture.match_date) return false;
    const kickoff = new Date(fixture.match_date).getTime();
    if (Number.isNaN(kickoff)) return false;
    return kickoff - 60 * 60 * 1000 <= Date.now();
  })();

  const fixtureOpen =
    !fixture.is_locked &&
    !bettingCutoffReached &&
    fixture.status === "scheduled";

  const canAddExtra =
    !!polla &&
    polla.is_member &&
    extraAmount > 0 &&
    fixtureOpen;

  // ── Handler: submit main bet ─────────────────────────────────────
  function onSubmit(values: BetFormValues) {
    setPendingValues(values);
    setShowConfirm(true);
  }

  function confirmMainBet() {
    if (!pendingValues) return;
    createBet.mutate(
      {
        fixture_id: fixture.id,
        predicted_home_score: pendingValues.predicted_home_score,
        predicted_away_score: pendingValues.predicted_away_score,
      },
      {
        onSuccess: () => {
          setShowConfirm(false);
          toast("Apuesta guardada correctamente", "success");
        },
        onError: (err: any) => {
          toast(err?.error?.message || "Error al guardar la apuesta", "error");
        },
      },
    );
  }

  // ── Handler: submit extra prediction ────────────────────────────
  function onExtraSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!extraPending) return;
    setShowExtraForm(false);
    setShowExtraConfirm(true);
  }

  function confirmExtraBet() {
    if (!extraPending || !polla) return;
    createBet.mutate(
      {
        fixture_id: fixture.id,
        predicted_home_score: extraPending.predicted_home_score,
        predicted_away_score: extraPending.predicted_away_score,
        group_id: polla.id,
        amount: extraAmount,
      },
      {
        onSuccess: () => {
          setShowExtraConfirm(false);
          setExtraPending(null);
          toast("Apuesta extra guardada. Pendiente de confirmacion del admin.", "success");
        },
        onError: (err: any) => {
          toast(err?.error?.message || "Error al guardar la apuesta extra", "error");
        },
      },
    );
  }

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

  // ── Polla exists but user is not a confirmed member ──────────────
  if (!polla.is_member) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🔒</span>
          <div>
            <p className="text-amber-300 font-semibold">Pago de entrada pendiente</p>
            <p className="text-amber-200/70 text-sm mt-0.5">
              El admin debe confirmar tu pago de entrada antes de que puedas apostar.
            </p>
          </div>
        </div>
        {parseFloat(polla.entry_fee) > 0 && (
          <div className="rounded-lg bg-amber-500/10 px-4 py-2.5 text-sm">
            <span className="text-amber-200/80">Monto de entrada: </span>
            <span className="text-white font-bold">
              {currency} {parseFloat(polla.entry_fee).toFixed(2)}
            </span>
          </div>
        )}
        <p className="text-xs text-amber-200/50">
          Una vez confirmado, podras realizar tus apuestas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Existing free bet ── */}
      {freeBet && (
        <div className="rounded-xl border border-accent/20 bg-accent/5 p-5 space-y-3">
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
                    eb.amount_confirmed
                      ? "bg-emerald-500/10 border-emerald-500/20"
                      : "bg-amber-500/10 border-amber-500/20",
                  )}
                >
                  <p
                    className={cn(
                      "font-medium",
                      eb.amount_confirmed ? "text-emerald-300" : "text-amber-300",
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
                      eb.amount_confirmed ? "text-emerald-200/70" : "text-amber-200/70",
                    )}
                  >
                    {eb.amount_confirmed
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
        </div>
      )}

      {/* ── Main bet form (shown only when no free bet yet) ── */}
      {!freeBet && (
        bettingCutoffReached ? (
          <div className="rounded-xl border border-warning/30 bg-warning/5 p-5 text-center space-y-2">
            <p className="text-warning font-medium">Este partido ya no acepta nuevas apuestas</p>
            <p className="text-xs text-muted">
              Las apuestas cerraron una hora antes del inicio del partido.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-glass backdrop-blur-sm p-6">
            <h3 className="font-display text-xl mb-4 text-white">Realizar Apuesta</h3>
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
              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-accent text-background font-bold hover:bg-accent-dim transition-colors"
              >
                Apostar
              </button>
            </form>
          </div>
        )
      )}

      {/* ── Main bet confirm modal ── */}
      {showConfirm && pendingValues && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl border border-white/10 p-6 max-w-sm w-full space-y-4">
            <h4 className="font-display text-xl text-white">Confirmar Apuesta</h4>
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
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2 rounded-lg border border-white/10 text-muted hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={confirmMainBet}
                disabled={createBet.isPending}
                className="flex-1 py-2 rounded-lg bg-accent text-background font-bold hover:bg-accent-dim disabled:opacity-50"
              >
                {createBet.isPending ? "Guardando..." : "Confirmar"}
              </button>
            </div>
            {createBet.isError && (
              <p className="text-danger text-xs text-center">
                {(createBet.error as any)?.error?.message || "Error al guardar"}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Extra prediction form modal ── */}
      {showExtraForm && extraPending && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl border border-white/10 p-6 max-w-sm w-full space-y-5">
            <div>
              <h4 className="font-display text-xl text-white">Prediccion extra</h4>
              <p className="text-xs text-muted mt-1">
                Elige un marcador diferente. Esta apuesta cuesta{" "}
                <span className="text-accent font-bold">
                  {currency} {extraAmount.toFixed(2)}
                </span>{" "}
                y el admin debe confirmar tu pago.
              </p>
            </div>
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
                <button
                  type="button"
                  onClick={() => { setShowExtraForm(false); setExtraPending(null); }}
                  className="flex-1 py-2 rounded-lg border border-white/10 text-muted hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-accent text-background font-bold hover:bg-accent-dim"
                >
                  Siguiente →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Extra prediction confirm modal ── */}
      {showExtraConfirm && extraPending && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl border border-white/10 p-6 max-w-sm w-full space-y-4">
            <h4 className="font-display text-xl text-white">Confirmar prediccion extra</h4>
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
              <button
                onClick={() => { setShowExtraConfirm(false); setShowExtraForm(true); }}
                className="flex-1 py-2 rounded-lg border border-white/10 text-muted hover:bg-white/5"
              >
                ← Volver
              </button>
              <button
                onClick={confirmExtraBet}
                disabled={createBet.isPending}
                className="flex-1 py-2 rounded-lg bg-accent text-background font-bold hover:bg-accent-dim disabled:opacity-50"
              >
                {createBet.isPending ? "Guardando..." : "Confirmar"}
              </button>
            </div>
            {createBet.isError && (
              <p className="text-danger text-xs text-center">
                {(createBet.error as any)?.error?.message || "Error al guardar"}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
