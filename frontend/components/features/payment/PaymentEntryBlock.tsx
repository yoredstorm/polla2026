"use client";

import { AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { usePaymentFlow } from "@/components/providers/PaymentFlowProvider";
import type { ActivePolla } from "@/types/api";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "upload", label: "Subir comprobante" },
  { id: "review", label: "Revision admin" },
  { id: "done", label: "Confirmado" },
] as const;

export function PaymentEntryBlock({
  polla,
  currency,
}: {
  polla: ActivePolla;
  currency: string;
}) {
  const { openPaymentModal } = usePaymentFlow();
  const fee = parseFloat(polla.entry_fee) || 0;
  const stepIndex = polla.is_member ? 2 : polla.has_uploaded_proof ? 1 : 0;

  return (
    <div className="rounded-xl border border-danger/40 bg-danger/10 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-6 h-6 text-danger shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="text-danger font-semibold">Pago de entrada pendiente</p>
          <p className="text-white/80 text-sm mt-0.5">
            Confirma tu pago para poder apostar en la polla.
          </p>
        </div>
      </div>

      <ol className="flex gap-1">
        {STEPS.map((step, i) => (
          <li key={step.id} className="flex-1 flex flex-col items-center gap-1">
            <div
              className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border",
                i < stepIndex
                  ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                  : i === stepIndex
                    ? "bg-accent/20 border-accent text-accent"
                    : "border-white/15 text-muted",
              )}
            >
              {i < stepIndex ? <Check className="w-3.5 h-3.5" aria-hidden /> : i + 1}
            </div>
            <span className="text-[9px] text-center text-muted leading-tight">{step.label}</span>
          </li>
        ))}
      </ol>

      {fee > 0 && (
        <p className="text-sm text-white/90">
          Monto de entrada:{" "}
          <span className="font-bold text-accent">
            {currency} {fee.toFixed(2)}
          </span>
        </p>
      )}
      <Button type="button" variant="primary" size="lg" className="w-full" onClick={openPaymentModal}>
        {polla.has_uploaded_proof ? "Ver estado del comprobante" : "Ver instrucciones de pago"}
      </Button>
    </div>
  );
}
