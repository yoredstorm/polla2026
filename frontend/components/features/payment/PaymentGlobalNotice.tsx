"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useActivePolla } from "@/hooks/useGroups";
import { PaymentPendingBanner } from "@/components/features/payment/PaymentPendingBanner";
import { pollaNeedsPaymentAction } from "@/lib/prizeStructure";

const HIDDEN_PREFIXES = ["/login", "/register", "/admin"];

export function PaymentGlobalNotice() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { data: polla, isLoading, isError } = useActivePolla();

  if (!user) return null;
  if (HIDDEN_PREFIXES.some((p) => pathname?.startsWith(p))) return null;

  if (isLoading) {
    return (
      <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 animate-pulse">
        <div className="h-4 w-48 bg-white/10 rounded" />
      </div>
    );
  }

  if (isError || !polla) {
    return (
      <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90">
        {user?.is_admin ? (
          <>
            No hay una polla activa configurada.{" "}
            <Link href="/admin/groups" className="text-accent underline">
              Crear o activar la Polla Global
            </Link>{" "}
            (incluye QR, nombre y teléfono de pago).
          </>
        ) : (
          "El administrador aún no ha activado la polla. Vuelve más tarde o contacta al organizador."
        )}
      </div>
    );
  }

  const needsAction = !polla.is_member || pollaNeedsPaymentAction(polla);
  if (!needsAction) return null;

  return <PaymentPendingBanner />;
}
