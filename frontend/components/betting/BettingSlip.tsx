"use client";
import { useState } from "react";
import type { Bet, Fixture } from "@/types/api";
import { CopyBetModal } from "./CopyBetModal";
import { useCreateChangeRequest, type ChangeRequest } from "@/hooks/useBets";
import { useToast } from "@/components/ui/Toast";
import { getPointsColor, formatAmount, cn, isChangeRequestWindowOpen } from "@/lib/utils";

interface BettingSlipProps {
  bet: Bet;
  fixture?: Fixture;
  showCopy?: boolean;
  showChangeRequest?: boolean;
  pendingRequest?: ChangeRequest | null;
}

export function BettingSlip({
  bet,
  fixture,
  showCopy = false,
  showChangeRequest = false,
  pendingRequest,
}: BettingSlipProps) {
  const isSettled = bet.points_earned !== null;
  const [copying, setCopying] = useState(false);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const betFixtureForWindow =
    bet.fixture_match_date && bet.fixture_home_team && bet.fixture_away_team && bet.fixture_status
      ? {
          match_date: bet.fixture_match_date,
          status: bet.fixture_status,
          home_team: bet.fixture_home_team,
          away_team: bet.fixture_away_team,
        }
      : null;
  const changeWindowOpen = !betFixtureForWindow || isChangeRequestWindowOpen(betFixtureForWindow);

  const headerFixture = fixture
    ? fixture
    : betFixtureForWindow
      ? ({
          league_name: "Partido",
          home_team: betFixtureForWindow.home_team,
          away_team: betFixtureForWindow.away_team,
          match_date: betFixtureForWindow.match_date,
        } as Pick<Fixture, "league_name" | "home_team" | "away_team" | "match_date">)
      : null;

  return (
    <>
      <div
        className={cn(
          "rounded-xl border border-white/10 bg-glass backdrop-blur-sm p-4",
          isSettled && bet.points_earned === 3 && "border-accent/30",
          isSettled && bet.points_earned === 0 && "border-danger/20",
        )}
      >
        {headerFixture && (
          <div className="mb-2 text-xs text-muted">
            {headerFixture.league_name}
            {headerFixture.league_name ? " · " : ""}
            {headerFixture.home_team} vs {headerFixture.away_team}
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-muted text-sm">Mi prediccion: </span>
            <span className="font-display text-lg text-white">
              {bet.predicted_home_score} – {bet.predicted_away_score}
            </span>
          </div>
          {fixture && fixture.home_score !== null && (
            <div className="text-right">
              <span className="text-muted text-sm">Resultado: </span>
              <span className="font-display text-lg text-white">
                {fixture.home_score} – {fixture.away_score}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">{formatAmount(bet.amount)}</span>
            {parseFloat(bet.amount) > 0 && !bet.amount_confirmed && (
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded uppercase tracking-wide">
                Pago pendiente
              </span>
            )}
            {parseFloat(bet.amount) > 0 && bet.amount_confirmed && (
              <span className="text-[10px] bg-emerald-500/15 text-emerald-300 px-1.5 py-0.5 rounded uppercase tracking-wide">
                Pagado ✓
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {showCopy && (
              <button
                onClick={() => setCopying(true)}
                className="text-xs px-3 py-1 rounded-lg bg-white/5 text-muted hover:bg-accent/10 hover:text-accent border border-white/10 hover:border-accent/30 transition-colors"
              >
                Copiar prediccion
              </button>
            )}
            {isSettled ? (
              <span className={cn("font-bold text-sm", getPointsColor(bet.points_earned))}>
                {bet.points_earned === 3
                  ? "🎯"
                  : bet.points_earned === 2
                    ? "✅"
                    : bet.points_earned === 1
                      ? "👍"
                      : "❌"}{" "}
                {bet.points_earned} pts
              </span>
            ) : (
              <span className="text-muted text-sm">Pendiente</span>
            )}
          </div>
        </div>

        {/* Pending change request badge */}
        {pendingRequest && (
          <div className="mt-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs">
            <span className="text-amber-300 font-medium">
              Solicitud pendiente:{" "}
              {pendingRequest.request_type === "modify" ? "Modificar" : "Eliminar"}
            </span>
            {pendingRequest.request_type === "modify" && (
              <span className="text-muted ml-2">
                → {pendingRequest.new_predicted_home_score} – {pendingRequest.new_predicted_away_score}
              </span>
            )}
          </div>
        )}

        {showChangeRequest && !isSettled && !pendingRequest && !changeWindowOpen && betFixtureForWindow && (
          <p className="mt-3 pt-2 border-t border-white/5 text-xs text-amber-300/90">
            Ya no puedes solicitar cambios ni eliminacion: queda menos de 1 hora para el inicio del partido
            (o el partido ya no esta programado).
          </p>
        )}

        {/* Change request buttons */}
        {showChangeRequest && !isSettled && !pendingRequest && changeWindowOpen && (
          <div className="mt-3 flex gap-2 pt-2 border-t border-white/5">
            <button
              onClick={() => setModifyOpen(true)}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-300 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
            >
              Modificar prediccion
            </button>
            <button
              onClick={() => setDeleteOpen(true)}
              className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-300 border border-red-500/20 hover:bg-red-500/20 transition-colors"
            >
              Eliminar apuesta
            </button>
          </div>
        )}
      </div>

      {copying && <CopyBetModal bet={bet} onClose={() => setCopying(false)} />}
      {modifyOpen && (
        <ModifyRequestModal
          bet={bet}
          onClose={() => setModifyOpen(false)}
        />
      )}
      {deleteOpen && (
        <DeleteRequestModal
          bet={bet}
          onClose={() => setDeleteOpen(false)}
        />
      )}
    </>
  );
}

function ModifyRequestModal({ bet, onClose }: { bet: Bet; onClose: () => void }) {
  const createRequest = useCreateChangeRequest();
  const toast = useToast((s) => s.add);
  const [homeScore, setHomeScore] = useState(bet.predicted_home_score);
  const [awayScore, setAwayScore] = useState(bet.predicted_away_score);
  const [reason, setReason] = useState("");

  async function handleSubmit() {
    try {
      await createRequest.mutateAsync({
        betId: bet.id,
        request_type: "modify",
        new_predicted_home_score: homeScore,
        new_predicted_away_score: awayScore,
        reason: reason || undefined,
      });
      toast("Solicitud de modificacion enviada", "success");
      onClose();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "error" in e
          ? String((e as { error?: { message?: string } }).error?.message ?? "")
          : "";
      toast(msg || "Error al enviar solicitud", "error");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl border border-white/10 p-6 max-w-sm w-full space-y-4">
        <h3 className="font-display text-lg text-white">Solicitar modificacion</h3>
        <p className="text-xs text-muted">
          Prediccion actual:{" "}
          <span className="text-white font-bold">
            {bet.predicted_home_score} – {bet.predicted_away_score}
          </span>
        </p>

        <div className="flex items-center justify-center gap-4">
          <input
            type="number"
            min={0}
            max={20}
            value={homeScore}
            onChange={(e) => setHomeScore(parseInt(e.target.value) || 0)}
            className="w-16 text-center bg-white/10 border border-white/20 rounded-lg py-2 text-white text-xl font-bold focus:outline-none focus:border-accent"
          />
          <span className="font-display text-2xl text-muted">–</span>
          <input
            type="number"
            min={0}
            max={20}
            value={awayScore}
            onChange={(e) => setAwayScore(parseInt(e.target.value) || 0)}
            className="w-16 text-center bg-white/10 border border-white/20 rounded-lg py-2 text-white text-xl font-bold focus:outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="text-xs text-muted mb-1 block">Motivo (opcional)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explica por que quieres cambiar..."
            rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-muted/50 focus:outline-none focus:border-accent resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-white/10 text-muted hover:bg-white/5 text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              createRequest.isPending ||
              (homeScore === bet.predicted_home_score && awayScore === bet.predicted_away_score)
            }
            className="flex-1 py-2.5 rounded-lg bg-blue-500 text-white font-bold text-sm hover:bg-blue-400 disabled:opacity-50 transition-colors"
          >
            {createRequest.isPending ? "Enviando..." : "Enviar solicitud"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteRequestModal({ bet, onClose }: { bet: Bet; onClose: () => void }) {
  const createRequest = useCreateChangeRequest();
  const toast = useToast((s) => s.add);
  const [reason, setReason] = useState("");

  async function handleSubmit() {
    try {
      await createRequest.mutateAsync({
        betId: bet.id,
        request_type: "delete",
        reason: reason || undefined,
      });
      toast("Solicitud de eliminacion enviada", "success");
      onClose();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "error" in e
          ? String((e as { error?: { message?: string } }).error?.message ?? "")
          : "";
      toast(msg || "Error al enviar solicitud", "error");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl border border-white/10 p-6 max-w-sm w-full space-y-4">
        <h3 className="font-display text-lg text-white">Solicitar eliminacion</h3>
        <p className="text-sm text-muted">
          Se enviara una solicitud al admin para eliminar esta apuesta:{" "}
          <span className="text-white font-bold">
            {bet.predicted_home_score} – {bet.predicted_away_score}
          </span>
        </p>
        {parseFloat(bet.amount) > 0 && (
          <p className="text-xs text-amber-300">
            Esta apuesta tiene un monto de {formatAmount(bet.amount)}.
            Si fue confirmada, el pozo se ajustara al aprobarse.
          </p>
        )}

        <div>
          <label className="text-xs text-muted mb-1 block">Motivo (opcional)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explica por que quieres eliminar..."
            rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-muted/50 focus:outline-none focus:border-accent resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-white/10 text-muted hover:bg-white/5 text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={createRequest.isPending}
            className="flex-1 py-2.5 rounded-lg bg-red-500 text-white font-bold text-sm hover:bg-red-400 disabled:opacity-50 transition-colors"
          >
            {createRequest.isPending ? "Enviando..." : "Solicitar eliminacion"}
          </button>
        </div>
      </div>
    </div>
  );
}
