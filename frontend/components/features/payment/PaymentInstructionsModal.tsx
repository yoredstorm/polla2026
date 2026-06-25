"use client";

import { useEffect, useState } from "react";
import { Copy, MessageCircle, Phone } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { PaymentProofUploadZone } from "@/components/features/payment/PaymentProofUploadZone";
import { useToast } from "@/components/ui/Toast";
import { useUploadEntryProof, useUploadPhaseEntryProof } from "@/hooks/useGroups";
import type { ActivePolla } from "@/types/api";
import {
  paymentContactName,
  paymentPhone,
  paymentQrImageUrl,
  paymentUsesExampleData,
  whatsAppUrl,
  fetchAuthedImageBlob,
  getCachedAuthedImageBlob,
} from "@/lib/payment";
import { cn } from "@/lib/utils";

interface PaymentInstructionsModalProps {
  open: boolean;
  onClose: () => void;
  polla: ActivePolla;
}

export function PaymentInstructionsModal({ open, onClose, polla }: PaymentInstructionsModalProps) {
  const toast = useToast((s) => s.add);
  const uploadEntry = useUploadEntryProof();
  const uploadPhase = useUploadPhaseEntryProof();
  const usePhaseUpload = polla.is_member;
  const upload = usePhaseUpload ? uploadPhase : uploadEntry;
  const [qrLoaded, setQrLoaded] = useState(false);
  const [qrError, setQrError] = useState(false);
  const [qrBlobUrl, setQrBlobUrl] = useState<string | null>(null);

  const isExample = paymentUsesExampleData(polla);
  const inlineQr = polla.payment_qr_data_url ?? null;
  const qrFetchUrl =
    !inlineQr && polla.payment_qr_url ? paymentQrImageUrl(polla) : null;

  useEffect(() => {
    if (!open) return;
    setQrError(false);

    if (inlineQr) {
      setQrBlobUrl(null);
      setQrLoaded(true);
      return;
    }

    if (!qrFetchUrl) {
      setQrBlobUrl(null);
      setQrLoaded(true);
      return;
    }

    const cached = getCachedAuthedImageBlob(qrFetchUrl);
    if (cached) {
      setQrBlobUrl(cached);
      setQrLoaded(true);
      return;
    }

    setQrLoaded(false);
    let cancelled = false;
    void fetchAuthedImageBlob(qrFetchUrl)
      .then((url) => {
        if (cancelled) return;
        setQrBlobUrl(url);
        setQrLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setQrError(true);
        setQrLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, inlineQr, qrFetchUrl]);

  const qrImageSrc =
    qrError || (!inlineQr && !qrFetchUrl)
      ? "/payment-qr-placeholder.svg"
      : inlineQr ?? qrBlobUrl ?? "/payment-qr-placeholder.svg";

  const contact = paymentContactName(polla);
  const phone = paymentPhone(polla);
  const wa = whatsAppUrl(phone);
  const currency = polla.currency ?? "PEN";
  const phaseLabel =
    polla.payment_target_phase_label ?? polla.current_phase_label ?? "entrada";
  const fee =
    parseFloat(polla.payment_target_entry_fee ?? polla.current_phase_entry_fee ?? polla.entry_fee) ||
    0;
  const isEarly = !!polla.early_enrollment_available;
  const phaseKey = polla.payment_target_phase_key ?? undefined;

  async function copyPhone() {
    try {
      await navigator.clipboard.writeText(phone);
      toast("Número copiado", "success");
    } catch {
      toast("No se pudo copiar", "error");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        usePhaseUpload
          ? isEarly
            ? `Inscripción anticipada — ${phaseLabel}`
            : `Inscripción — ${phaseLabel}`
          : "Cómo pagar tu entrada"
      }
      description={`${polla.name} · ${currency} ${fee.toFixed(2)}`}
      size="md"
    >
      <div className="space-y-5 mt-2">
        {isEarly && (
          <p className="text-xs text-accent/90 bg-accent/10 border border-accent/30 rounded-lg px-3 py-2">
            La fase de {polla.current_phase_label ?? "grupos"} sigue activa. Puedes inscribirte ya
            en {phaseLabel} para estar listo cuando comience.
          </p>
        )}

        {isExample && (
          <p className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            Datos de ejemplo — el administrador actualizará el QR pronto.
          </p>
        )}

        <div className="flex flex-col items-center">
          <div className="relative bg-white rounded-xl p-3 shadow-lg shadow-black/30">
            {!qrLoaded && !qrError && (
              <div className="w-[220px] h-[220px] rounded-lg bg-slate-200 animate-pulse motion-reduce:animate-none" />
            )}
            {(qrLoaded || qrError) && (
              <img
                src={qrImageSrc}
                alt="Código QR para pago"
                width={220}
                height={220}
                className={cn(
                  "w-[220px] h-[220px] object-contain rounded-lg",
                  !qrLoaded && "hidden",
                )}
                onLoad={() => setQrLoaded(true)}
              />
            )}
          </div>
        </div>

        <div className="text-center space-y-1">
          <p className="text-xs text-muted uppercase tracking-wide">A nombre de</p>
          <p className="font-display text-lg text-white">{contact}</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 space-y-2">
          <p className="text-xs text-muted uppercase tracking-wide flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5" aria-hidden />
            Teléfono
          </p>
          <p className="text-white font-medium text-lg">{phone}</p>
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Button type="button" variant="secondary" size="md" className="flex-1" onClick={() => void copyPhone()}>
              <Copy className="w-4 h-4 mr-1.5" aria-hidden />
              Copiar número
            </Button>
            {wa ? (
              <Button
                type="button"
                variant="primary"
                size="md"
                className="flex-1"
                onClick={() => window.open(wa, "_blank", "noopener,noreferrer")}
              >
                <MessageCircle className="w-4 h-4 mr-1.5" aria-hidden />
                WhatsApp
              </Button>
            ) : null}
          </div>
        </div>

        <ol className="text-xs text-muted space-y-1.5 list-decimal list-inside">
          <li>Escanea el QR o transfiere al número indicado.</li>
          <li>
            Paga el monto de inscripción ({currency} {fee.toFixed(2)}).
          </li>
          <li>Sube tu comprobante abajo (opcional).</li>
        </ol>

        <PaymentProofUploadZone
          hasUploaded={!!polla.has_uploaded_proof}
          disabled={upload.isPending}
          onUpload={async (file) => {
            if (usePhaseUpload) {
              await uploadPhase.mutateAsync({ file, phaseKey });
            } else {
              await uploadEntry.mutateAsync(file);
            }
            toast("Comprobante enviado", "success");
          }}
        />

        <Button type="button" variant="ghost" size="md" className="w-full" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Modal>
  );
}
