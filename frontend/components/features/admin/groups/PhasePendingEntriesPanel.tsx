"use client";

import { useEffect, useState } from "react";
import {
  useAdminPhasePendingEntries,
  useConfirmPhaseEnrollment,
} from "@/hooks/useAdmin";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
import { Modal } from "@/components/ui/Modal";
import { getApiBase } from "@/lib/api";
import { fetchAuthedImageBlob } from "@/lib/payment";

export function PhasePendingEntriesPanel({
  pollaId,
  currency,
  phaseKey,
  phaseLabel,
}: {
  pollaId: string;
  currency: string;
  phaseKey: string;
  phaseLabel: string;
}) {
  const { data, refetch } = useAdminPhasePendingEntries(pollaId, phaseKey);
  const confirm = useConfirmPhaseEnrollment();
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const pending = data?.pending ?? [];

  async function handleConfirm(userId: string) {
    await confirm.mutateAsync({ groupId: pollaId, userId, phaseKey });
    refetch();
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
      {pending.map((row) => (
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
            <p className="text-xs text-muted mt-0.5">{phaseLabel}</p>
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
              disabled={confirm.isPending}
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-medium"
              onClick={() => void handleConfirm(row.user_id)}
            >
              Confirmar pago
            </button>
          </div>
        </li>
      ))}
      <PhaseProofLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </ul>
  );
}

function PhaseProofLightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
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
    <Modal open={!!url} onClose={onClose} title="Comprobante de fase" size="md">
      {src ? (
        <img src={src} alt="Comprobante" className="w-full rounded-lg" />
      ) : (
        <p className="text-muted text-sm">Cargando...</p>
      )}
    </Modal>
  );
}
