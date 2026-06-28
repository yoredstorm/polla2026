"use client";

import { useCompetitionSlug } from "@/components/providers/CompetitionProvider";
import {
  useCompetitionAdminPool,
  useCompetitionAdminNonMembers,
  useCompetitionAdminPendingExtras,
  useCompetitionAdminPhaseFees,
  useCompetitionAdminPhasePendingEntries,
} from "@/hooks/useCompetitionAdmin";
import { PollaSettingsCard } from "@/components/features/admin/groups/PollaSettingsCard";
import { PollaBadge } from "@/components/features/admin/groups/PollaBadge";
import { PendingEntriesPanel } from "@/components/features/admin/groups/PendingEntriesPanel";
import { PendingExtrasPanel } from "@/components/features/admin/groups/PendingExtrasPanel";
import { MembersPanel } from "@/components/features/admin/groups/MembersPanel";
import { PhaseWinnersPanel } from "@/components/features/admin/groups/PhaseWinnersPanel";
import { PhaseFeesPanel } from "@/components/features/admin/groups/PhaseFeesPanel";
import { PhasePendingEntriesPanel } from "@/components/features/admin/groups/PhasePendingEntriesPanel";
import {
  phaseWinnersDescription,
  showsReinscriptionPanel,
  showsEarlyEnrollmentPanel,
} from "@/lib/prizeStructure";

export function CompetitionPollaAdmin() {
  const slug = useCompetitionSlug();
  const { data: polla, isLoading, refetch } = useCompetitionAdminPool(slug);
  const { data: nonMembers } = useCompetitionAdminNonMembers(slug);
  const { data: pendingExtras } = useCompetitionAdminPendingExtras(slug);

  const currency = polla?.currency ?? "PEN";
  const pendingEntryCount = nonMembers?.length ?? 0;
  const pendingExtraCount = pendingExtras?.length ?? 0;
  const { data: phaseFeesData } = useCompetitionAdminPhaseFees(slug);
  const currentPhaseFee = phaseFeesData?.fees?.find(
    (f) => f.phase_key === polla?.current_phase_key,
  );
  const showReinscription = showsReinscriptionPanel(
    polla?.prize_structure_mode,
    polla?.current_phase_key,
  );
  const showEarlyEnrollment = showsEarlyEnrollmentPanel(
    polla?.prize_structure_mode,
    polla?.current_phase_key,
  );
  const knockoutPhaseFee = phaseFeesData?.fees?.find((f) => f.phase_key === "knockout");
  const { data: earlyPendingData } = useCompetitionAdminPhasePendingEntries(
    showEarlyEnrollment ? "knockout" : null,
    slug,
  );
  const earlyPendingCount = earlyPendingData?.pending?.length ?? 0;

  if (isLoading) {
    return <p className="text-muted">Cargando polla...</p>;
  }

  if (!polla) {
    return (
      <p className="text-muted text-center py-12">
        No hay pool configurado para esta competencia.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl text-white">Miembros y pagos</h1>
        <p className="text-sm text-muted mt-1">
          Gestiona participantes, confirmaciones de pago y configuración del pozo.
        </p>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PollaSettingsCard polla={polla} onSaved={() => void refetch()} competitionSlug={slug} />
          <div className="rounded-2xl border border-white/10 bg-glass backdrop-blur-sm p-6">
            <h2 className="font-display text-xl text-white mb-1">Estado del pozo</h2>
            <div className="space-y-3 mt-4">
              <div className="flex items-center justify-between py-2 border-b border-white/10">
                <span className="text-muted text-sm">Participantes confirmados</span>
                <span className="font-bold text-white">{polla.member_count}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-white/10">
                <span className="text-muted text-sm">Entrada hito activo</span>
                <span className="font-bold text-white">
                  {currency}{" "}
                  {parseFloat(currentPhaseFee?.entry_fee ?? polla.entry_fee).toFixed(2)}
                </span>
              </div>
              {polla.fixed_bet_amount && parseFloat(polla.fixed_bet_amount) > 0 && (
                <div className="flex items-center justify-between py-2 border-b border-white/10">
                  <span className="text-muted text-sm">Extra opcional / partido</span>
                  <span className="font-bold text-white">
                    {currency} {parseFloat(polla.fixed_bet_amount).toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2">
                <span className="text-muted text-sm">Pozo total (confirmado)</span>
                <span className="font-display text-2xl text-accent">
                  {currency} {parseFloat(polla.prize_pool).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6">
          <h2 className="font-display text-lg text-white mb-1">Ganadores por fase</h2>
          <p className="text-xs text-muted mb-4">
            {phaseWinnersDescription(polla.prize_structure_mode)}
          </p>
          <PhaseWinnersPanel pollaId={polla.id} currency={currency} competitionSlug={slug} />
        </div>

        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6 space-y-4">
          <h2 className="font-display text-lg text-white">Montos por hito</h2>
          <PhaseFeesPanel pollaId={polla.id} currency={currency} competitionSlug={slug} />
        </div>

        {showEarlyEnrollment && (
          <div className="rounded-2xl border border-accent/30 bg-accent/5 p-6">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-display text-lg text-white">
                Inscripciones anticipadas — Eliminatorias
              </h2>
              <PollaBadge count={earlyPendingCount} />
            </div>
            <PhasePendingEntriesPanel
              pollaId={polla.id}
              currency={currency}
              phaseKey="knockout"
              phaseLabel={knockoutPhaseFee?.label ?? "Eliminatorias"}
              entryFee={knockoutPhaseFee?.entry_fee}
              confirmLabel="Confirmar pago — Eliminatorias"
              competitionSlug={slug}
            />
          </div>
        )}

        {showReinscription && polla.current_phase_key && (
          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-6">
            <h2 className="font-display text-lg text-white mb-1">
              Reinscripciones — {currentPhaseFee?.label ?? polla.current_phase_key}
            </h2>
            <PhasePendingEntriesPanel
              pollaId={polla.id}
              currency={currency}
              phaseKey={polla.current_phase_key}
              phaseLabel={currentPhaseFee?.label ?? polla.current_phase_key}
              competitionSlug={slug}
            />
          </div>
        )}

        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-display text-lg text-white">Confirmaciones de entrada pendientes</h2>
            <PollaBadge count={pendingEntryCount} />
          </div>
          <PendingEntriesPanel pollaId={polla.id} currency={currency} competitionSlug={slug} />
        </div>

        {polla.fixed_bet_amount && parseFloat(polla.fixed_bet_amount) > 0 && (
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-display text-lg text-white">Adicionales por partido pendientes</h2>
              <PollaBadge count={pendingExtraCount} />
            </div>
            <PendingExtrasPanel pollaId={polla.id} currency={currency} competitionSlug={slug} />
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-glass backdrop-blur-sm p-6">
          <h2 className="font-display text-lg text-white mb-1">
            Participantes confirmados{" "}
            <span className="text-muted text-base">({polla.member_count})</span>
          </h2>
          <MembersPanel pollaId={polla.id} currency={currency} competitionSlug={slug} />
        </div>
      </div>
    </div>
  );
}
