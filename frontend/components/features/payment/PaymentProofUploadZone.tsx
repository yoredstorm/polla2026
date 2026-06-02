"use client";

import { useCallback, useRef, useState } from "react";
import { CheckCircle2, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const MAX_BYTES = 2_097_152;

interface PaymentProofUploadZoneProps {
  hasUploaded: boolean;
  onUpload: (file: File) => Promise<void>;
  disabled?: boolean;
}

export function PaymentProofUploadZone({
  hasUploaded,
  onUpload,
  disabled,
}: PaymentProofUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [justUploaded, setJustUploaded] = useState(false);

  const pickFile = useCallback((f: File | undefined) => {
    if (!f) return;
    setError(null);
    if (f.size > MAX_BYTES) {
      setError("La imagen debe pesar menos de 2 MB.");
      return;
    }
    if (!f.type.startsWith("image/")) {
      setError("Usa JPG, PNG o WebP.");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setJustUploaded(false);
  }, []);

  async function submit() {
    if (!file) {
      inputRef.current?.click();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onUpload(file);
      setJustUploaded(true);
      setFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
    } catch {
      setError("No se pudo enviar el comprobante. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  const showSuccess = hasUploaded || justUploaded;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted uppercase tracking-wide">Comprobante (opcional)</p>
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!disabled && !loading) inputRef.current?.click();
          }
        }}
        onClick={() => !disabled && !loading && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (disabled || loading) return;
          pickFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "rounded-xl border-2 border-dashed p-5 text-center transition-colors duration-200 cursor-pointer",
          "border-white/20 hover:border-accent/40 hover:bg-white/[0.03]",
          disabled && "opacity-50 pointer-events-none",
        )}
      >
        {preview ? (
          <img
            src={preview}
            alt="Vista previa del comprobante"
            className="mx-auto max-h-32 rounded-lg object-contain mb-3"
          />
        ) : (
          <Upload className="w-8 h-8 text-muted mx-auto mb-2" aria-hidden />
        )}
        <p className="text-sm text-white">Arrastra tu voucher o toca para elegir</p>
        <p className="text-xs text-muted mt-1">JPG, PNG o WebP · máx. 2 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
      </div>

      {showSuccess && (
        <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden />
          <p className="text-xs text-emerald-200">
            Comprobante recibido. Te avisaremos cuando el admin confirme.
          </p>
        </div>
      )}

      <p className="text-xs text-muted/80">
        Opcional: el admin también puede confirmar si pagaste por WhatsApp u otro medio.
      </p>

      {error && <p className="text-danger text-xs">{error}</p>}

      <Button
        type="button"
        variant="primary"
        size="lg"
        className="w-full"
        loading={loading}
        disabled={disabled}
        onClick={() => void submit()}
      >
        {file ? "Enviar comprobante" : "Elegir imagen"}
      </Button>
    </div>
  );
}

