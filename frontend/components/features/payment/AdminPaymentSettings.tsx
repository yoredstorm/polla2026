"use client";

import { useRef, useState } from "react";
import { QrCode, Wallet } from "lucide-react";
import { useUploadPaymentQr } from "@/hooks/useAdmin";
import { getApiBase } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AdminPaymentSettingsProps {
  groupId?: string;
  paymentContactName?: string | null;
  paymentPhone?: string | null;
  paymentQrUrl?: string | null;
  /** Create mode: fields only, no QR upload endpoint until group exists */
  mode: "create" | "edit";
  contactName: string;
  phone: string;
  onContactNameChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  qrFile: File | null;
  onQrFileChange: (f: File | null) => void;
}

export function AdminPaymentSettingsFields({
  contactName,
  phone,
  onContactNameChange,
  onPhoneChange,
  qrFile,
  onQrFileChange,
}: Pick<
  AdminPaymentSettingsProps,
  "contactName" | "phone" | "onContactNameChange" | "onPhoneChange" | "qrFile" | "onQrFileChange"
>) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3 pt-2 border-t border-white/10">
      <div className="flex items-center gap-2 text-accent">
        <Wallet className="w-4 h-4" aria-hidden />
        <p className="text-sm font-medium text-white">Datos de pago</p>
      </div>
      <div>
        <label className="text-sm text-muted mb-1 block">Nombre del titular del pago</label>
        <input
          value={contactName}
          onChange={(e) => onContactNameChange(e.target.value)}
          placeholder="Ej: Tesorería Polla 2026"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent"
        />
      </div>
      <div>
        <label className="text-sm text-muted mb-1 block">Teléfono / WhatsApp</label>
        <input
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          placeholder="+51 999 888 777"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent"
        />
      </div>
      <div>
        <label className="text-sm text-muted mb-1 block flex items-center gap-1.5">
          <QrCode className="w-4 h-4" aria-hidden />
          Imagen QR de pago
        </label>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="text-xs text-accent hover:underline cursor-pointer"
        >
          {qrFile ? qrFile.name : "Elegir imagen QR"}
        </button>
        <p className="text-xs text-muted mt-1">JPG, PNG o WebP · máx. 2 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => onQrFileChange(e.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  );
}

export function AdminPaymentSettingsView({
  paymentContactName,
  paymentPhone,
  paymentQrUrl,
  groupId,
}: {
  paymentContactName?: string | null;
  paymentPhone?: string | null;
  paymentQrUrl?: string | null;
  groupId: string;
}) {
  const uploadQr = useUploadPaymentQr();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const qrSrc = localPreview
    ? localPreview
    : paymentQrUrl
      ? `${getApiBase()}${paymentQrUrl}`
      : null;

  async function onFile(f: File | undefined) {
    if (!f) return;
    setLocalPreview(URL.createObjectURL(f));
    try {
      await uploadQr.mutateAsync({ groupId, file: f });
    } catch {
      /* toast handled by parent if needed */
    }
  }

  return (
    <div className="col-span-2 pt-2 border-t border-white/10 space-y-3">
      <p className="text-xs text-muted uppercase tracking-wide flex items-center gap-1.5">
        <Wallet className="w-3.5 h-3.5" aria-hidden />
        Datos de pago
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted mb-1">Titular</p>
          <p className="text-white font-medium">{paymentContactName || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted mb-1">Teléfono</p>
          <p className="text-white font-medium">{paymentPhone || "—"}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-4">
        {qrSrc ? (
          <img
            src={qrSrc}
            alt="QR de pago"
            className="w-24 h-24 object-contain rounded-lg bg-white p-1"
          />
        ) : (
          <div className="w-24 h-24 rounded-lg bg-white/5 border border-dashed border-white/20 flex items-center justify-center text-xs text-muted text-center px-1">
            Sin QR
          </div>
        )}
        <div>
          <button
            type="button"
            disabled={uploadQr.isPending}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "text-xs px-3 py-2 rounded-lg bg-white/5 text-muted hover:text-white hover:bg-white/10 transition-colors cursor-pointer",
              uploadQr.isPending && "opacity-50",
            )}
          >
            {uploadQr.isPending ? "Subiendo..." : "Reemplazar QR"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </div>
      </div>
    </div>
  );
}
