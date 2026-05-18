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
import { Modal } from "@/components/ui/Modal";

interface Props {
  open: boolean;
  onClose: () => void;
  sourceBets: Bet[];
  sourceUserId: string;
  sourceUsername: string;
}

interface BulkItem {
  source_bet_id: string;
  fixture_id: string;
  predicted_home_score: number;
  predicted_away_score: number;
  mode: "free" | "extra";
  source_is_extra: boolean;
  also_add_extra?: boolean;
  fixture?: Fixture;
}

interface BulkCopyPayloadItem {
  fixture_id: string;
  predicted_home_score: number;
  predicted_away_score: number;
  mode: "free" | "extra";
}

interface BulkCopyResult {
  created: number;
  skipped: number;
  errors: string[];
}

type Step = "review" | "confirm";

function buildPayloadItems(items: BulkItem[]): BulkCopyPayloadItem[] {
  const out: BulkCopyPayloadItem[] = [];
  for (const it of items) {
    out.push({
      fixture_id: it.fixture_id,
      predicted_home_score: it.predicted_home_score,
      predicted_away_score: it.predicted_away_score,
      mode: it.mode,
    });
    if (it.mode === "free" && it.also_add_extra) {
      out.push({
        fixture_id: it.fixture_id,
        predicted_home_score: it.predicted_home_score,
        predicted_away_score: it.predicted_away_score,
        mode: "extra",
      });
    }
  }
  return out;
}

function effectiveExtrasCount(items: BulkItem[]): number {
  return items.filter((i) => i.mode === "extra").length +
    items.filter((i) => i.mode === "free" && i.also_add_extra).length;
}

function effectiveFreeCount(items: BulkItem[]): number {
  return items.filter((i) => i.mode === "free").length;
}

export function CopyProfileModal({ open, onClose, sourceBets, sourceUserId, sourceUsername }: Props) {
  const qc = useQueryClient();
  const { data: polla, isLoading: pollaLoading } = useActivePolla();
  const { data: fixturesPage, isLoading: fixturesLoading } = useFixtures({ status: "scheduled", limit: 200 });
  const { data: myBetsPage, isLoading: myBetsLoading } = useMyBets(1, 200);

  const bulkCopy = useMutation({
    mutationFn: (body: { bets: BulkCopyPayloadItem[]; source_user_id: string }) =>
      api.post<BulkCopyResult>("/bets/bulk-copy", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-bets"] });
      qc.invalidateQueries({ queryKey: ["bets"] });
      qc.invalidateQueries({ queryKey: ["pool"] });
    },
  });

  const [items, setItems] = useState<BulkItem[]>([]);
  const [step, setStep] = useState<Step>("review");

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
    const result: BulkItem[] = [];
    for (const b of sourceBets) {
      if (!openFixtureIds.has(b.fixture_id)) continue;
      const sourceIsExtra = !!b.group_id;
      const viewerHasFree = myFreeFixtureIds.has(b.fixture_id);
      let mode: "free" | "extra";
      if (sourceIsExtra) {
        mode = "extra";
      } else if (viewerHasFree) {
        mode = "extra";
      } else {
        mode = "free";
      }
      result.push({
        source_bet_id: b.id,
        fixture_id: b.fixture_id,
        predicted_home_score: b.predicted_home_score,
        predicted_away_score: b.predicted_away_score,
        mode,
        source_is_extra: sourceIsExtra,
        also_add_extra: false,
        fixture: fixtureMap.get(b.fixture_id),
      });
    }
    return result;
  }, [sourceBets, fixturesPage, openFixtureIds, myFreeFixtureIds, fixtureMap]);

  useEffect(() => {
    if (open) {
      setItems(eligibleBets);
      setStep("review");
      bulkCopy.reset();
    }
  }, [open, eligibleBets]);

  const perMatchAmount = polla?.per_match_amount ? parseFloat(polla.per_match_amount) : 0;
  const currency = polla?.currency ?? "USD";
  const payloadPreview = useMemo(() => buildPayloadItems(items), [items]);
  const extrasCount = effectiveExtrasCount(items);
  const freeCount = effectiveFreeCount(items);
  const totalExtraCost = extrasCount * perMatchAmount;
  const isDataLoading = pollaLoading || fixturesLoading || myBetsLoading;

  function hasExtraRowForFixture(fixtureId: string, excludeIdx?: number) {
    return items.some(
      (it, i) => i !== excludeIdx && it.fixture_id === fixtureId && it.mode === "extra",
    );
  }

  function updateItem(idx: number, patch: Partial<BulkItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const toast = useToast((s) => s.add);

  function itemLabel(item: BulkItem): string {
    if (item.mode === "extra") {
      if (item.source_is_extra) return "Extra (del perfil)";
      return "Extra (ya tienes gratis en este partido)";
    }
    return "Gratis (del perfil)";
  }

  function targetLabel(mode: "free" | "extra"): string {
    return mode === "free" ? "Apuesta gratis" : "Apuesta extra";
  }

  async function handleCopy() {
    const payload = buildPayloadItems(items);
    if (payload.length === 0) return;
    try {
      const res = await bulkCopy.mutateAsync({
        bets: payload,
        source_user_id: sourceUserId,
      });
      const total = payload.length;

      if (res.created > 0 && res.errors.length === 0) {
        if (res.skipped > 0) {
          toast(
            `Se copiaron ${res.created} de ${total} apuesta${total !== 1 ? "s" : ""} (${res.skipped} omitida${res.skipped !== 1 ? "s" : ""}).`,
            "success",
          );
        } else {
          toast(
            total === 1
              ? "La apuesta se copió correctamente."
              : `Todas las apuestas se copiaron correctamente (${res.created}).`,
            "success",
          );
        }
        onClose();
        return;
      }

      if (res.created > 0 && res.errors.length > 0) {
        toast(
          `Se copiaron ${res.created} apuesta${res.created !== 1 ? "s" : ""}, con ${res.errors.length} error${res.errors.length !== 1 ? "es" : ""}.`,
          "success",
        );
        toast(res.errors[0] ?? "Error al copiar algunas apuestas", "error");
        onClose();
        return;
      }

      if (res.errors.length > 0) {
        toast(res.errors[0] ?? "No se pudieron copiar las apuestas", "error");
      } else if (res.skipped > 0) {
        toast(
          `No se crearon apuestas nuevas (${res.skipped} omitida${res.skipped !== 1 ? "s" : ""}, quizá ya las tenías).`,
          "error",
        );
      } else {
        toast("No se pudieron copiar las apuestas", "error");
      }
    } catch {
      toast("Error al copiar apuestas", "error");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      hideCloseButton
      size="lg"
      className="p-0 flex flex-col overflow-hidden max-h-[85vh]"
    >
        <div className="px-6 py-4 border-b border-white/10 shrink-0 pr-10">
          <h3 className="font-display text-lg text-white">
            Copiar apuestas de @{sourceUsername}
            {step === "confirm" && (
              <span className="block text-xs text-muted font-sans mt-0.5">Confirmacion final</span>
            )}
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
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
                  No hay apuestas copiables (todos los partidos están cerrados o ya culminaron)
                </p>
              ) : (
                <>
                  <p className="text-muted text-sm">
                    {items.length} apuesta{items.length !== 1 && "s"} del perfil · Se crearán{" "}
                    {payloadPreview.length} en tu cuenta
                    {freeCount > 0 && ` (${freeCount} gratis)`}
                    {extrasCount > 0 &&
                      ` (${extrasCount} extra${extrasCount !== 1 ? "s" : ""}, ${formatAmount(String(totalExtraCost), currency)})`}
                    . Puedes editar o quitar filas antes de continuar.
                  </p>

                  <div className="space-y-3">
                    {items.map((item, idx) => {
                      const fx = item.fixture;
                      const isExtraRow = item.mode === "extra";
                      const showAlsoExtra =
                        item.mode === "free" &&
                        perMatchAmount > 0 &&
                        !hasExtraRowForFixture(item.fixture_id, idx);

                      return (
                        <div
                          key={item.source_bet_id}
                          className={cn(
                            "rounded-xl border p-4 space-y-3",
                            isExtraRow
                              ? "border-amber-500/30 bg-amber-500/5"
                              : "border-white/10 bg-white/5",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-3 text-sm min-w-0">
                              {fx?.home_logo_url && (
                                <img src={fx.home_logo_url} alt="" className="w-5 h-5 object-contain shrink-0" />
                              )}
                              <span className="text-white font-medium truncate">
                                {fx?.home_team ?? "?"} vs {fx?.away_team ?? "?"}
                              </span>
                              {fx?.away_logo_url && (
                                <img src={fx.away_logo_url} alt="" className="w-5 h-5 object-contain shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={cn(
                                  "text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap",
                                  isExtraRow
                                    ? "bg-amber-500/20 text-amber-300"
                                    : "bg-green-500/20 text-green-300",
                                )}
                              >
                                {itemLabel(item)}
                              </span>
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

                          <p className="text-xs text-muted">
                            Se copiará como: <span className="text-white">{targetLabel(item.mode)}</span>
                          </p>

                          <div className="flex items-center gap-3">
                            <label className="text-xs text-muted">Marcador:</label>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={item.predicted_home_score}
                              onChange={(e) =>
                                updateItem(idx, { predicted_home_score: parseInt(e.target.value) || 0 })
                              }
                              className="w-14 px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-white text-center text-sm"
                            />
                            <span className="text-muted">-</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={item.predicted_away_score}
                              onChange={(e) =>
                                updateItem(idx, { predicted_away_score: parseInt(e.target.value) || 0 })
                              }
                              className="w-14 px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-white text-center text-sm"
                            />
                          </div>

                          {showAlsoExtra && (
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!item.also_add_extra}
                                onChange={(e) => updateItem(idx, { also_add_extra: e.target.checked })}
                                className="accent-accent w-4 h-4"
                              />
                              <span className="text-muted">
                                También agregar como extra ({formatAmount(String(perMatchAmount), currency)})
                              </span>
                            </label>
                          )}

                          {isExtraRow && perMatchAmount > 0 && (
                            <p className="text-xs text-amber-200/70">
                              Monto: {formatAmount(String(perMatchAmount), currency)} · pendiente confirmación del
                              admin
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {totalExtraCost > 0 && (
                    <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm">
                      <p className="text-yellow-300 font-medium">Costo adicional estimado</p>
                      <p className="text-yellow-200 mt-1">
                        {extrasCount} extra{extrasCount !== 1 && "s"} ×{" "}
                        {formatAmount(String(perMatchAmount), currency)} ={" "}
                        <strong>{formatAmount(String(totalExtraCost), currency)}</strong>
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {step === "confirm" && (
            <>
              <p className="text-muted text-sm">
                Revisa el resumen. Al confirmar se crearán {payloadPreview.length} apuesta
                {payloadPreview.length !== 1 && "s"} en tu cuenta.
              </p>
              <ul className="space-y-2">
                {payloadPreview.map((row, i) => {
                  const fx = fixtureMap.get(row.fixture_id);
                  return (
                    <li
                      key={`${row.fixture_id}-${row.mode}-${i}`}
                      className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="text-white font-medium">
                        {fx?.home_team ?? "?"} vs {fx?.away_team ?? "?"}
                      </span>
                      <span className="text-muted">
                        {row.predicted_home_score}-{row.predicted_away_score}
                      </span>
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          row.mode === "extra"
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-green-500/20 text-green-300",
                        )}
                      >
                        {targetLabel(row.mode)}
                        {row.mode === "extra" && perMatchAmount > 0 && (
                          <> · {formatAmount(String(perMatchAmount), currency)}</>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm space-y-1">
                <p className="text-white font-medium">Resumen</p>
                <p className="text-muted">
                  {freeCount} gratis · {extrasCount} extra{extrasCount !== 1 && "s"}
                  {totalExtraCost > 0 && (
                    <>
                      {" "}
                      · Total extras:{" "}
                      <strong className="text-white">
                        {formatAmount(String(totalExtraCost), currency)}
                      </strong>
                    </>
                  )}
                </p>
                {extrasCount > 0 && (
                  <p className="text-xs text-muted">
                    Cada extra quedará pendiente hasta que el admin confirme el pago.
                  </p>
                )}
              </div>
            </>
          )}

        </div>

        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
          {step === "review" && items.length > 0 && polla?.is_member && !isDataLoading && (
            <button
              type="button"
              onClick={() => setStep("confirm")}
              className="px-5 py-2 rounded-xl bg-accent text-background font-bold text-sm hover:bg-accent-dim transition-colors"
            >
              Continuar ({payloadPreview.length} apuesta{payloadPreview.length !== 1 && "s"})
            </button>
          )}
          {step === "confirm" && (
            <>
              <button
                type="button"
                onClick={() => setStep("review")}
                disabled={bulkCopy.isPending}
                className="px-5 py-2 rounded-xl bg-white/10 text-muted font-medium text-sm hover:bg-white/20 transition-colors disabled:opacity-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleCopy}
                disabled={bulkCopy.isPending}
                className="px-5 py-2 rounded-xl bg-accent text-background font-bold text-sm hover:bg-accent-dim transition-colors disabled:opacity-50"
              >
                {bulkCopy.isPending ? "Copiando..." : "Copiar ahora"}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white/10 text-muted font-medium text-sm hover:bg-white/20 transition-colors"
          >
            Cancelar
          </button>
        </div>
    </Modal>
  );
}
