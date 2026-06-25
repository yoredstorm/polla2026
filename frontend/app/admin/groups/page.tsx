"use client";
import {
  useAdminGroups,
  useNonMembers,
  usePendingExtras,
  useAdminPhasePendingEntries,
} from "@/hooks/useAdmin";
import { CreatePollaForm } from "@/components/features/admin/groups/CreatePollaForm";
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
import { useAdminPhaseFees } from "@/hooks/useAdmin";

export default function AdminPollaPage() {
  const { data, isLoading, refetch } = useAdminGroups(1, 1);
  const polla = data?.data?.[0] ?? null;

  const { data: nonMembers } = useNonMembers(polla?.id ?? null);
  const { data: pendingExtras } = usePendingExtras(polla?.id ?? null);

  const currency = polla?.currency ?? "PEN";
  const pendingEntryCount = nonMembers?.length ?? 0;
  const pendingExtraCount = pendingExtras?.length ?? 0;
  const { data: phaseFeesData } = useAdminPhaseFees(polla?.id ?? null);
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
  const { data: earlyPendingData } = useAdminPhasePendingEntries(
    showEarlyEnrollment ? (polla?.id ?? null) : null,
    "knockout",
  );
  const earlyPendingCount = earlyPendingData?.pending?.length ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl text-white">Polla Global</h1>
        <p className="text-sm text-muted mt-1">
          Configura el torneo, define los montos y gestiona quienes participan.
        </p>
      </div>

      {isLoading ? (
        <p className="text-muted">Cargando...</p>
      ) : !polla ? (
        <CreatePollaForm />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PollaSettingsCard polla={polla} onSaved={() => refetch()} />
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
                    <span className="font-bold text-white">{currency} {parseFloat(polla.fixed_bet_amount).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-muted text-sm">Pozo total (confirmado)</span>
                  <span className="font-display text-2xl text-accent">{currency} {parseFloat(polla.prize_pool).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6">
            <h2 className="font-display text-lg text-white mb-1">Ganadores por fase</h2>
            <p className="text-xs text-muted mb-4">
              {phaseWinnersDescription(polla.prize_structure_mode)}
            </p>
            <PhaseWinnersPanel pollaId={polla.id} currency={currency} />
          </div>

          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6 space-y-4">
            <h2 className="font-display text-lg text-white">Montos por hito</h2>
            <p className="text-xs text-muted">
              Define cuánto cuesta inscribirse en cada fase (ej. la final puede valer más).
            </p>
            <PhaseFeesPanel pollaId={polla.id} currency={currency} />
          </div>

          {showEarlyEnrollment && (
            <div className="rounded-2xl border border-accent/30 bg-accent/5 p-6">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-display text-lg text-white">
                  Inscripciones anticipadas — Eliminatorias
                </h2>
                <PollaBadge count={earlyPendingCount} />
              </div>
              <p className="text-xs text-muted mb-4">
                Miembros que ya pagaron eliminatorias mientras la fase de grupos sigue activa.
                Confirma el pago para que puedan apostar cuando comience la fase eliminatoria.
              </p>
              <PhasePendingEntriesPanel
                pollaId={polla.id}
                currency={currency}
                phaseKey="knockout"
                phaseLabel={knockoutPhaseFee?.label ?? "Eliminatorias"}
              />
            </div>
          )}

          {showReinscription && polla.current_phase_key && (
            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-6">
              <h2 className="font-display text-lg text-white mb-1">
                Reinscripciones —{" "}
                {currentPhaseFee?.label ?? polla.current_phase_key}
              </h2>
              <p className="text-xs text-muted mb-4">
                Miembros que subieron comprobante para la fase activa. Confirma el pago para sumar al pozo.
              </p>
              <PhasePendingEntriesPanel
                pollaId={polla.id}
                currency={currency}
                phaseKey={polla.current_phase_key}
                phaseLabel={currentPhaseFee?.label ?? polla.current_phase_key}
              />
            </div>
          )}

          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-display text-lg text-white">
                Confirmaciones de entrada pendientes
              </h2>
              <PollaBadge count={pendingEntryCount} />
            </div>
            <p className="text-xs text-muted mb-4">
              Usuarios registrados que aun no estan en la polla. Confirma su pago para agregarlos.
            </p>
            <PendingEntriesPanel pollaId={polla.id} currency={currency} />
          </div>

          {polla.fixed_bet_amount && parseFloat(polla.fixed_bet_amount) > 0 && (
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-display text-lg text-white">
                  Adicionales por partido pendientes
                </h2>
                <PollaBadge count={pendingExtraCount} />
              </div>
              <p className="text-xs text-muted mb-4">
                Apuestas con extra ({currency} {parseFloat(polla.fixed_bet_amount).toFixed(2)}) que el usuario eligio agregar. Confirma que recibiste el pago para que sume al pozo.
              </p>
              <PendingExtrasPanel pollaId={polla.id} currency={currency} />
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-glass backdrop-blur-sm p-6">
            <h2 className="font-display text-lg text-white mb-1">
              Participantes confirmados{" "}
              <span className="text-muted text-base">({polla.member_count})</span>
            </h2>
            <p className="text-xs text-muted mb-4">
              Busca y agrega manualmente si lo necesitas.
            </p>
            <MembersPanel pollaId={polla.id} currency={currency} />
          </div>
        </div>
      )}
    </div>
  );
}
