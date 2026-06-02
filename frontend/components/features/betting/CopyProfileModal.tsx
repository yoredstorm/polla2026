"use client";
import type { Bet } from "@/types/api";
import { formatAmount, cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useCopyProfileBulk } from "@/hooks/betting/useCopyProfileBulk";

interface Props {
  open: boolean;
  onClose: () => void;
  sourceBets: Bet[];
  sourceUserId: string;
  sourceUsername: string;
}

export function CopyProfileModal({
  open,
  onClose,
  sourceBets,
  sourceUserId,
  sourceUsername,
}: Props) {
  const {
    polla,
    step,
    setStep,
    items,
    bulkCopy,
    fixtureMap,
    perMatchAmount,
    currency,
    payloadPreview,
    extrasCount,
    freeCount,
    totalExtraCost,
    isDataLoading,
    updateItem,
    removeItem,
    itemLabel,
    targetLabel,
    handleCopy,
  } = useCopyProfileBulk(sourceBets, sourceUserId, open, onClose);

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
                              <img
                                src={fx.home_logo_url}
                                alt={fx.home_team ? `Escudo ${fx.home_team}` : ""}
                                className="w-5 h-5 object-contain shrink-0"
                              />
                            )}
                            <span className="text-white font-medium truncate">
                              {fx?.home_team ?? "?"} vs {fx?.away_team ?? "?"}
                            </span>
                            {fx?.away_logo_url && (
                              <img
                                src={fx.away_logo_url}
                                alt={fx.away_team ? `Escudo ${fx.away_team}` : ""}
                                className="w-5 h-5 object-contain shrink-0"
                              />
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
                              aria-label="Quitar apuesta de la lista"
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
                            aria-label={`Goles local ${fx?.home_team ?? "local"}`}
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
                            aria-label={`Goles visitante ${fx?.away_team ?? "visitante"}`}
                          />
                        </div>

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
            <Card glow className="border-accent/30 bg-accent/5 p-4 text-sm space-y-1">
              <p className="text-white font-medium">Resumen</p>
              <p className="text-muted">
                {freeCount} gratis · {extrasCount} extra{extrasCount !== 1 && "s"}
                {totalExtraCost > 0 && (
                  <>
                    {" "}
                    · Total extras:{" "}
                    <strong className="text-white">{formatAmount(String(totalExtraCost), currency)}</strong>
                  </>
                )}
              </p>
              {extrasCount > 0 && (
                <p className="text-xs text-muted">
                  Cada extra quedará pendiente hasta que el admin confirme el pago.
                </p>
              )}
            </Card>
          </>
        )}
      </div>

      <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
        {step === "review" && items.length > 0 && polla?.is_member && !isDataLoading && (
          <Button type="button" onClick={() => setStep("confirm")}>
            Continuar ({payloadPreview.length} apuesta{payloadPreview.length !== 1 && "s"})
          </Button>
        )}
        {step === "confirm" && (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep("review")}
              disabled={bulkCopy.isPending}
            >
              Volver
            </Button>
            <Button type="button" onClick={handleCopy} loading={bulkCopy.isPending}>
              Copiar ahora
            </Button>
          </>
        )}
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </Modal>
  );
}
