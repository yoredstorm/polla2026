import { getApiBase } from "@/lib/api";
import type { ActivePolla } from "@/types/api";

export const PAYMENT_EXAMPLE = {
  contactName: "Ejemplo: Tesorería Polla 2026",
  phone: "+51 900 000 000",
  qrPlaceholder: "/payment-qr-placeholder.svg",
} as const;

/** In-memory cache so reopening the payment modal does not refetch (avoids CORS/race issues). */
const authedImageBlobCache = new Map<string, string>();
const authedImageInflight = new Map<string, Promise<string>>();

export function paymentQrImageUrl(polla: ActivePolla): string {
  if (polla.payment_qr_url) {
    return `${getApiBase()}${polla.payment_qr_url}`;
  }
  return PAYMENT_EXAMPLE.qrPlaceholder;
}

export function paymentUsesExampleData(polla: ActivePolla): boolean {
  return !polla.payment_qr_url && !polla.payment_contact_name && !polla.payment_phone;
}

export function paymentContactName(polla: ActivePolla): string {
  return polla.payment_contact_name?.trim() || PAYMENT_EXAMPLE.contactName;
}

export function paymentPhone(polla: ActivePolla): string {
  return polla.payment_phone?.trim() || PAYMENT_EXAMPLE.phone;
}

export function whatsAppUrl(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "";
}

export function adminEntryProofUrl(groupId: string, userId: string): string {
  return `${getApiBase()}/api/v1/admin/groups/${groupId}/entry-proofs/${userId}`;
}

export function getCachedAuthedImageBlob(url: string): string | null {
  return authedImageBlobCache.get(url) ?? null;
}

export async function fetchAuthedImageBlob(url: string): Promise<string> {
  const cached = authedImageBlobCache.get(url);
  if (cached) return cached;

  const pending = authedImageInflight.get(url);
  if (pending) return pending;

  const promise = (async () => {
    const res = await fetch(url, { credentials: "include", cache: "no-store" });
    if (!res.ok) {
      throw new Error(`No se pudo cargar la imagen (HTTP ${res.status})`);
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    authedImageBlobCache.set(url, objectUrl);
    return objectUrl;
  })().finally(() => {
    authedImageInflight.delete(url);
  });

  authedImageInflight.set(url, promise);
  return promise;
}

/** Drop one cached blob (e.g. after intentional refresh). */
export function releaseAuthedImageBlob(url: string): void {
  const objectUrl = authedImageBlobCache.get(url);
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    authedImageBlobCache.delete(url);
  }
  authedImageInflight.delete(url);
}

export function clearAuthedImageBlobCache(): void {
  for (const objectUrl of authedImageBlobCache.values()) {
    URL.revokeObjectURL(objectUrl);
  }
  authedImageBlobCache.clear();
  authedImageInflight.clear();
}
