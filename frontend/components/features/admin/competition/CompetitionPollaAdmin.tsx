"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCompetitionSlug } from "@/components/providers/CompetitionProvider";
import {
  useCompetitionAdminPool,
  useCompetitionAdminNonMembers,
  useCompetitionAdminPendingExtras,
  useCompetitionAdminPhaseFees,
  useCompetitionAdminAllPhasePending,
  useCompetitionAdminActionQueue,
} from "@/hooks/useCompetitionAdmin";
import { PollaSettingsCard } from "@/components/features/admin/groups/PollaSettingsCard";
import { PollaBadge } from "@/components/features/admin/groups/PollaBadge";
import { PendingEntriesPanel } from "@/components/features/admin/groups/PendingEntriesPanel";
import { PendingExtrasPanel } from "@/components/features/admin/groups/PendingExtrasPanel";
import { MembersPanel } from "@/components/features/admin/groups/MembersPanel";
import { PhaseWinnersPanel } from "@/components/features/admin/groups/PhaseWinnersPanel";
import { PhaseFeesPanel } from "@/components/features/admin/groups/PhaseFeesPanel";
import { PhasePendingEntriesPanel } from "@/components/features/admin/groups/PhasePendingEntriesPanel";
import { phaseWinnersDescription } from "@/lib/prizeStructure";
import { cn } from "@/lib/utils";

function PendingChip({
  label,
  count,
  href,
  accent = "accent",
}: {
  label: string;
  count: number;
  href: string;
  accent?: "accent" | "amber" | "blue" | "violet" | "cyan";
}) {
  if (count <= 0) return null;
  const colors = {
    accent: "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20",
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20",
    blue: "border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20",
    violet: "border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20",
    cyan: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20",
  };
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-ring",
        colors[accent],
      )}
    >
      {label}
      <span className="min-w-[20px] h-5 px-1 rounded-full bg-black/30 text-[10px] font-bold flex items-center justify-center">
        {count}
      </span>
    </Link>
  );
}

export function CompetitionPollaAdmin() {
  const slug = useCompetitionSlug();
  const searchParams = useSearchParams();
  const { data: polla, isLoading, refetch } = useCompetitionAdminPool(slug);
  const { data: nonMembers } = useCompetitionAdminNonMembers(slug);
  const { data: pendingExtras } = useCompetitionAdminPendingExtras(slug);
  const { data: allPhasePending, refetch: refetchPhasePending } =
    useCompetitionAdminAllPhasePending(slug);
  const { data: actionQueue } = useCompetitionAdminActionQueue(slug);

  const currency = polla?.currency ?? "PEN";
  const pendingEntryCount = nonMembers?.length ?? 0;
  const pendingExtraCount = pendingExtras?.length ?? 0;
  const { data: phaseFeesData } = useCompetitionAdminPhaseFees(slug);
  const currentPhaseFee = phaseFeesData?.fees?.find(
    (f) => f.phase_key === polla?.current_phase_key,
  );

  const phaseGroups = allPhasePending?.phases ?? [];
  const phasePendingCount = useMemo(
    () => phaseGroups.reduce((sum, g) => sum + g.pending.length, 0),
    [phaseGroups],
  );
  const queuePhaseCount = actionQueue?.pending.phase_enrollments ?? 0;

  const totalPending = pendingEntryCount + pendingExtraCount + phasePendingCount;

  useEffect(() => {
    const focus = searchParams.get("focus");
    const phaseKey = searchParams.get("phase_key");
    if (focus === "phase" && phaseKey) {
      const el = document.getElementById(`phase-${phaseKey}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [searchParams]);

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

      {queuePhaseCount > 0 && phasePendingCount === 0 && (
        <div
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100"
          role="alert"
        >
          Hay {queuePhaseCount} inscripción(es) por fase pendientes. Si no aparecen abajo,{" "}
          <button
            type="button"
            className="underline font-medium hover:text-white"
            onClick={() => void refetchPhasePending()}
          >
            recarga la lista
          </button>
          .
        </div>
      )}

      {totalPending > 0 && (
        <section
          className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5"
          aria-label="Pagos pendientes"
        >
          <h2 className="font-display text-sm text-white mb-3 flex items-center gap-2">
            Pagos pendientes
            <PollaBadge count={totalPending} />
          </h2>
          <div className="flex flex-wrap gap-2">
            <PendingChip
              label="Entradas nuevas"
              count={pendingEntryCount}
              href="#pending-entries"
              accent="amber"
            />
            <PendingChip
              label="Extras"
              count={pendingExtraCount}
              href="#pending-extras"
              accent="blue"
            />
            {phaseGroups.map((group) => (
              <PendingChip
                key={group.phase_key}
                label={group.phase_label}
                count={group.pending.length}
                href={`#phase-${group.phase_key}`}
                accent={group.phase_key === "knockout" ? "accent" : "cyan"}
              />
            ))}
          </div>
        </section>
      )}

      <div className="space-y-6">
        {phaseGroups.map((group) => {
          const fee = phaseFeesData?.fees?.find((f) => f.phase_key === group.phase_key);
          const isKnockout = group.phase_key === "knockout";
          return (
            <div
              key={group.phase_key}
              id={`phase-${group.phase_key}`}
              className={cn(
                "rounded-2xl border p-6 scroll-mt-24",
                isKnockout
                  ? "border-accent/30 bg-accent/5"
                  : "border-cyan-500/20 bg-cyan-500/5",
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-display text-lg text-white">
                  Inscripciones por fase — {group.phase_label}
                </h2>
                <PollaBadge count={group.pending.length} />
              </div>
              <p className="text-xs text-muted mb-4">
                Confirma el comprobante para activar la inscripción en esta fase.
              </p>
              <PhasePendingEntriesPanel
                pollaId={polla.id}
                currency={currency}
                phaseKey={group.phase_key}
                phaseLabel={group.phase_label}
                entryFee={fee?.entry_fee}
                confirmLabel={`Confirmar pago — ${group.phase_label}`}
                competitionSlug={slug}
                pendingOverride={group.pending}
                onAfterConfirm={() => void refetchPhasePending()}
              />
            </div>
          );
        })}

        <div
          id="pending-entries"
          className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 scroll-mt-24"
        >
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-display text-lg text-white">Confirmaciones de entrada pendientes</h2>
            <PollaBadge count={pendingEntryCount} />
          </div>
          <PendingEntriesPanel pollaId={polla.id} currency={currency} competitionSlug={slug} />
        </div>

        {polla.fixed_bet_amount && parseFloat(polla.fixed_bet_amount) > 0 && (
          <div
            id="pending-extras"
            className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6 scroll-mt-24"
          >
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
      </div>
    </div>
  );
}
