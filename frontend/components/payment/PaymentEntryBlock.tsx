"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { usePaymentFlow } from "@/components/payment/PaymentFlowProvider";
import type { ActivePolla } from "@/types/api";

export function PaymentEntryBlock({
  polla,
  currency,
}: {
  polla: ActivePolla;
  currency: string;
}) {
  const { openPaymentModal } = usePaymentFlow();
  const fee = parseFloat(polla.entry_fee) || 0;

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
      {fee > 0 && (
        <p className="text-sm text-white/90">
          Monto de entrada:{" "}
          <span className="font-bold text-accent">
            {currency} {fee.toFixed(2)}
          </span>
        </p>
      )}
      <Button type="button" variant="primary" size="lg" className="w-full" onClick={openPaymentModal}>
        Ver instrucciones de pago
      </Button>
    </div>
  );
}
