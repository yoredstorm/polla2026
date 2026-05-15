"use client";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useActivePolla } from "@/hooks/useGroups";
import { useFixtures } from "@/hooks/useFixtures";
import { useMyBets } from "@/hooks/useBets";
import type { Bet, Fixture } from "@/types/api";
import { formatAmount, cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

interface Props {
  open: boolean;
  onClose: () => void;
  sourceBets: Bet[];
  sourceUsername: string;
}

interface BulkItem {
  fixture_id: string;
  predicted_home_score: number;
  predicted_away_score: number;
  add_extra: boolean;
  is_extra_only: boolean;
  fixture?: Fixture;
}

interface BulkCopyResult {
  created: number;
  skipped: number;
  errors: string[];
}

export function CopyProfileModal({ open, onClose, sourceBets, sourceUsername }: Props) {
  const qc = useQueryClient();
  const { data: polla, isLoading: pollaLoading } = useActivePolla();
  const { data: fixturesPage, isLoading: fixturesLoading } = useFixtures({ status: "scheduled", limit: 200 });
  const { data: myBetsPage, isLoading: myBetsLoading } = useMyBets(1, 200);

  const bulkCopy = useMutation({
    mutationFn: (body: { bets: { fixture_id: string; predicted_home_score: number; predicted_away_score: number; add_extra: boolean }[] }) =>
      api.post<BulkCopyResult>("/bets/bulk-copy", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-bets"] });
      qc.invalidateQueries({ queryKey: ["bets"] });
      qc.invalidateQueries({ queryKey: ["pool"] });
    },
  });

  const [items, setItems] = useState<BulkItem[]>([]);
  const [step, setStep] = useState<"review" | "done">("review");
  const [result, setResult] = useState<BulkCopyResult | null>(null);

  const myFreeFixtureIds = useMemo(() => {
    const s = new Set<string>();
    myBetsPage?.data?.forEach((b) => {
      if (!b.group_id) s.add(b.fixture_id);
    });
    return s;
  }, [myBetsPage]);

  const openFixtureIds = useMemo(() => {
    if (!fixturesPage?.data) return new Set<string>();
    return new Set(
      fixturesPage.data
        .filter((f) => f.betting_open && !f.is_locked && f.status === "scheduled")
        .map((f) => f.id),
    );
  }, [fixturesPage]);

  const fixtureMap = useMemo(() => {
    const m = new Map<string, Fixture>();
    fixturesPage?.data?.forEach((f) => m.set(f.id, f));
    return m;
  }, [fixturesPage]);

  const eligibleBets = useMemo(() => {
    if (!fixturesPage?.data) return [];
    const seen = new Set<string>();
    const result: Array<Bet & { _isExtraOnly: boolean }> = [];
    for (const b of sourceBets) {
      if (!openFixtureIds.has(b.fixture_id)) continue;
      if (seen.has(b.fixture_id)) continue;
      seen.add(b.fixture_id);
      const alreadyHasFree = myFreeFixtureIds.has(b.fixture_id);
      result.push({ ...b, _isExtraOnly: alreadyHasFree });
    }
    return result;
  }, [sourceBets, fixturesPage, openFixtureIds, myFreeFixtureIds]);

  useEffect(() => {
    if (open) {
      setItems(
        eligibleBets.map((b) => ({
          fixture_id: b.fixture_id,
          predicted_home_score: b.predicted_home_score,
          predicted_away_score: b.predicted_away_score,
          add_extra: b._isExtraOnly,
          is_extra_only: b._isExtraOnly,
          fixture: fixtureMap.get(b.fixture_id),
        })),
      );
      setStep("review");
      setResult(null);
      bulkCopy.reset();
    }
  }, [open, eligibleBets, fixtureMap]);

  const perMatchAmount = polla?.per_match_amount ? parseFloat(polla.per_match_amount) : 0;
  const currency = polla?.currency ?? "USD";
  const extrasCount = items.filter((i) => i.add_extra).length;
  const freeCount = items.filter((i) => !i.add_extra).length;
  const totalExtraCost = extrasCount * perMatchAmount;
  const isDataLoading = pollaLoading || fixturesLoading || myBetsLoading;

  function updateItem(idx: number, patch: Partial<BulkItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const toast = useToast((s) => s.add);

  async function handleConfirm() {
    if (items.length === 0) return;
    try {
      const res = await bulkCopy.mutateAsync({
        bets: items.map((it) => ({
          fixture_id: it.fixture_id,
          predicted_home_score: it.predicted_home_score,
          predicted_away_score: it.predicted_away_score,
          add_extra: it.add_extra,
        })),
      });
      setResult(res);
      setStep("done");
      if (res.created > 0) {
        toast(`${res.created} apuesta${res.created !== 1 ? "s" : ""} copiada${res.created !== 1 ? "s" : ""} correctamente`, "success");
      }
      if (res.errors.length > 0) {
        toast(`${res.errors.length} error${res.errors.length !== 1 ? "es" : ""} al copiar`, "error");
      }
    } catch {
      toast("Error al copiar apuestas", "error");
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-surface border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h3 className="font-display text-lg text-white">
            Copiar apuestas de @{sourceUsername}
          </h3>
          <button onClick={onClose} className="text-muted hover:text-white text-xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {step === "review" && (
            <>
              {isDataLoading ? (
                <p className="text-muted text-sm text-center py-8 animate-pulse">Cargando apuestas...</p>
              ) : !polla ? (
                <p className="text-danger text-sm text-center py-8">No hay polla activa</p>
              ) : !polla.is_member ? (
                <p className="text-danger text-sm text-center py-8">
                  Debes ser miembro confirmado de la polla para copiar apuestas
                </p>
              ) : items.length === 0 ? (
                <p className="text-muted text-sm text-center py-8">
                  No hay apuestas copiables (todos los partidos estan cerrados o ya culminaron)
                </p>
              ) : (
                <>
                  <p className="text-muted text-sm">
                    {items.length} partido{items.length !== 1 && "s"} seleccionado{items.length !== 1 && "s"}.
                    {freeCount > 0 && ` ${freeCount} gratis.`}
                    {extrasCount > 0 && ` ${extrasCount} extra${extrasCount !== 1 ? "s" : ""} (${formatAmount(String(totalExtraCost), currency)}).`}
                  </p>

                  <div className="space-y-3">
                    {items.map((item, idx) => {
                      const fx = item.fixture;
                      return (
                        <div
                          key={item.fixture_id}
                          className={cn(
                            "rounded-xl border p-4 space-y-3",
                            item.is_extra_only
                              ? "border-amber-500/30 bg-amber-500/5"
                              : "border-white/10 bg-white/5",
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 text-sm">
                              {fx?.home_logo_url && (
                                <img src={fx.home_logo_url} alt="" className="w-5 h-5 object-contain" />
                              )}
                              <span className="text-white font-medium">
                                {fx?.home_team ?? "?"} vs {fx?.away_team ?? "?"}
                              </span>
                              {fx?.away_logo_url && (
                                <img src={fx.away_logo_url} alt="" className="w-5 h-5 object-contain" />
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {item.is_extra_only ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-medium">
                                  Extra (+{formatAmount(String(perMatchAmount), currency)})
                                </span>
                              ) : (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 font-medium">
                                  Nueva
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => removeItem(idx)}
                                className="w-6 h-6 flex items-center justify-center rounded-full text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors text-sm"
                                title="Quitar de la lista"
                              >
                                &times;
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <label className="text-xs text-muted">Score:</label>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={item.predicted_home_score}
                              onChange={(e) => updateItem(idx, { predicted_home_score: parseInt(e.target.value) || 0 })}
                              className="w-14 px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-white text-center text-sm"
                            />
                            <span className="text-muted">-</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={item.predicted_away_score}
                              onChange={(e) => updateItem(idx, { predicted_away_score: parseInt(e.target.value) || 0 })}
                              className="w-14 px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-white text-center text-sm"
                            />
                          </div>

                          {!item.is_extra_only && perMatchAmount > 0 && (
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <input
                                type="checkbox"
                                checked={item.add_extra}
                                onChange={(e) => updateItem(idx, { add_extra: e.target.checked })}
                                className="accent-accent w-4 h-4"
                              />
                              <span className="text-muted">
                                Tambien agregar como extra ({formatAmount(String(perMatchAmount), currency)})
                              </span>
                            </label>
                          )}

                          {item.is_extra_only && (
                            <p className="text-xs text-amber-200/70">
                              Ya tienes una prediccion gratuita para este partido. Esta copia sera una apuesta extra.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {totalExtraCost > 0 && (
                    <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm">
                      <p className="text-yellow-300 font-medium">Costo adicional</p>
                      <p className="text-yellow-200 mt-1">
                        {extrasCount} extra{extrasCount !== 1 && "s"} x{" "}
                        {formatAmount(String(perMatchAmount), currency)} ={" "}
                        <strong>{formatAmount(String(totalExtraCost), currency)}</strong>
                      </p>
                      <p className="text-yellow-200/70 text-xs mt-1">
                        El admin debe confirmar el pago de cada extra antes de que sumen al pozo.
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {step === "done" && result && (
            <div className="py-8 text-center space-y-3">
              <p className="text-2xl">✓</p>
              <p className="text-white font-medium">Apuestas copiadas</p>
              <p className="text-muted text-sm">
                Creadas: {result.created} · Omitidas: {result.skipped}
              </p>
              {result.errors.length > 0 && (
                <div className="text-left rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-300">
                  {result.errors.map((e, i) => (
                    <p key={i}>{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
          {step === "review" && items.length > 0 && polla?.is_member && (
            <button
              onClick={handleConfirm}
              disabled={bulkCopy.isPending}
              className="px-5 py-2 rounded-xl bg-accent text-background font-bold text-sm hover:bg-accent-dim transition-colors disabled:opacity-50"
            >
              {bulkCopy.isPending ? "Copiando..." : `Confirmar ${items.length} apuesta${items.length !== 1 ? "s" : ""}`}
            </button>
          )}
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white/10 text-muted font-medium text-sm hover:bg-white/20 transition-colors"
          >
            {step === "done" ? "Cerrar" : "Cancelar"}
          </button>
        </div>
      </div>
    </div>
  );
}
