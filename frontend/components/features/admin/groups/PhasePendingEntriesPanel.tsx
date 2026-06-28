"use client";

import { useEffect, useState } from "react";
import {
  useScopedAddGroupMember,
  useScopedConfirmPhaseEnrollment,
  useScopedPhasePendingEntries,
} from "@/hooks/admin/useScopedGroupAdmin";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
import { Modal } from "@/components/ui/Modal";
import { getApiBase } from "@/lib/api";
import { fetchAuthedImageBlob } from "@/lib/payment";

import type { PhasePendingEntry } from "@/types/api";

export function PhasePendingEntriesPanel({
  pollaId,
  currency,
  phaseKey,
  phaseLabel,
  entryFee,
  confirmLabel,
  competitionSlug,
  pendingOverride,
  onAfterConfirm,
}: {
  pollaId: string;
  currency: string;
  phaseKey: string;
  phaseLabel: string;
  entryFee?: string;
  confirmLabel?: string;
  competitionSlug?: string;
  pendingOverride?: PhasePendingEntry[];
  onAfterConfirm?: () => void;
}) {
  const { data, refetch } = useScopedPhasePendingEntries(
    pendingOverride ? null : pollaId,
    pendingOverride ? "" : phaseKey,
    competitionSlug,
  );
  const confirm = useScopedConfirmPhaseEnrollment(competitionSlug);
  const addMember = useScopedAddGroupMember(competitionSlug);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const pending = pendingOverride ?? data?.pending ?? [];
  const feeDisplay =
    entryFee != null && parseFloat(entryFee) > 0
      ? `${currency} ${parseFloat(entryFee).toFixed(2)}`
      : null;
  const buttonLabel = confirmLabel ?? "Confirmar pago";
  const isPending = confirm.isPending || addMember.isPending;

  async function handleConfirm(userId: string, isMember: boolean) {
    if (!isMember) {
      await addMember.mutateAsync({ groupId: pollaId, userId, phaseKey });
    } else {
      await confirm.mutateAsync({ groupId: pollaId, userId, phaseKey });
    }
    if (pendingOverride) {
      onAfterConfirm?.();
    } else {
      refetch();
    }
  }

  if (pending.length === 0) {
    return (
      <p className="text-sm text-muted">
        Sin comprobantes pendientes para <span className="text-white">{phaseLabel}</span>.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {pending.map((row) => {
        const isMember = row.is_member !== false;
        return (
          <li
            key={row.user_id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 p-3"
          >
            <div>
              <UserDisplayName
                username={row.username}
                firstName={row.first_name}
                lastName={row.last_name}
              />
              <p className="text-xs text-muted mt-0.5">
                {phaseLabel}
                {feeDisplay ? ` · ${feeDisplay}` : ""}
                {!isMember && (
                  <span className="ml-1 text-accent">· Usuario nuevo</span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded-lg border border-white/15 text-muted hover:text-white"
                onClick={() => setLightboxUrl(row.proof_url)}
              >
                Ver comprobante
              </button>
              <button
                type="button"
                disabled={isPending}
                className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-medium"
                onClick={() => void handleConfirm(row.user_id, isMember)}
              >
                {buttonLabel}
              </button>
            </div>
          </li>
        );
      })}
      <PhaseProofLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} phaseLabel={phaseLabel} />
    </ul>
  );
}

function PhaseProofLightbox({
  url,
  onClose,
  phaseLabel,
}: {
  url: string | null;
  onClose: () => void;
  phaseLabel: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!url) {
      setSrc(null);
      return;
    }
    const full = url.startsWith("http") ? url : `${getApiBase()}${url}`;
    void fetchAuthedImageBlob(full).then(setSrc).catch(() => setSrc(null));
    return () => setSrc(null);
  }, [url]);
  return (
    <Modal open={!!url} onClose={onClose} title={`Comprobante — ${phaseLabel}`} size="md">
      {src ? (
        <img src={src} alt="Comprobante" className="w-full rounded-lg" />
      ) : (
        <p className="text-muted text-sm">Cargando...</p>
      )}
    </Modal>
  );
}
