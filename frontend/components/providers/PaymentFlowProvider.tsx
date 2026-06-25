"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useActivePolla } from "@/hooks/useGroups";
import { PaymentInstructionsModal } from "@/components/features/payment/PaymentInstructionsModal";
import { pollaNeedsPaymentAction } from "@/lib/prizeStructure";

interface PaymentFlowContextValue {
  openPaymentModal: () => void;
}

const PaymentFlowContext = createContext<PaymentFlowContextValue | null>(null);

export function PaymentFlowProvider({ children }: { children: React.ReactNode }) {
  const { data: polla } = useActivePolla();
  const [open, setOpen] = useState(false);

  const showPaymentModal = polla
    ? !polla.is_member || pollaNeedsPaymentAction(polla)
    : false;

  const openPaymentModal = useCallback(() => {
    if (showPaymentModal) setOpen(true);
  }, [showPaymentModal]);

  useEffect(() => {
    if (!polla || polla.is_member) return;
    const key = `payment_modal_seen_${polla.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* private mode */
    }
    setOpen(true);
  }, [polla?.id, polla?.is_member]);

  const value = useMemo(() => ({ openPaymentModal }), [openPaymentModal]);

  return (
    <PaymentFlowContext.Provider value={value}>
      {children}
      {polla && showPaymentModal && (
        <PaymentInstructionsModal open={open} onClose={() => setOpen(false)} polla={polla} />
      )}
    </PaymentFlowContext.Provider>
  );
}

export function usePaymentFlow() {
  const ctx = useContext(PaymentFlowContext);
  if (!ctx) {
    return { openPaymentModal: () => {} };
  }
  return ctx;
}
