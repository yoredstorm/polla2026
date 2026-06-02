"use client";

import { AlertCircle, ChevronRight } from "lucide-react";
import { useActivePolla } from "@/hooks/useGroups";
import { usePaymentFlow } from "@/components/providers/PaymentFlowProvider";
import { cn } from "@/lib/utils";

export function PaymentPendingBanner() {
  const { data: polla } = useActivePolla();
  const { openPaymentModal } = usePaymentFlow();

  if (!polla || polla.is_member) return null;

  const hasProof = !!polla.has_uploaded_proof;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openPaymentModal}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPaymentModal();
        }
      }}
      className={cn(
        "sticky top-0 z-40 mb-4 w-full rounded-xl border-l-4 px-4 py-3.5 text-left",
        "cursor-pointer transition-colors duration-200 focus-ring",
        hasProof
          ? "border-l-emerald-500 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15"
          : "border-l-danger border-danger/50 bg-danger/10 hover:bg-danger/15",
      )}
      aria-label="Abrir instrucciones de pago de entrada"
    >
      <div className="flex items-center gap-3">
        <AlertCircle
          className={cn("w-5 h-5 shrink-0", hasProof ? "text-emerald-400" : "text-danger")}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <p className={cn("font-semibold text-sm", hasProof ? "text-emerald-300" : "text-danger")}>
            Pago de entrada pendiente
          </p>
          <p className="text-xs text-white/80 mt-0.5">
            {hasProof
              ? "Comprobante enviado — el admin revisará tu pago pronto"
              : "Toca para ver el QR y cómo pagar"}
          </p>
          {hasProof && (
            <span className="inline-block mt-1.5 text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
              Comprobante enviado
            </span>
          )}
        </div>
        <ChevronRight className="w-5 h-5 text-white/50 shrink-0" aria-hidden />
      </div>
    </div>
  );
}
