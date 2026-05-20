"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { adminEntryProofUrl, fetchAuthedImageBlob } from "@/lib/payment";
import { UserDisplayName } from "@/components/ui/UserDisplayName";

interface AdminProofLightboxProps {
  open: boolean;
  onClose: () => void;
  groupId: string;
  userId: string;
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  onConfirm?: () => void;
  confirming?: boolean;
}

export function AdminProofLightbox({
  open,
  onClose,
  groupId,
  userId,
  username,
  firstName,
  lastName,
  onConfirm,
  confirming,
}: AdminProofLightboxProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let blobUrl: string | null = null;
    setError(false);
    setSrc(null);
    void fetchAuthedImageBlob(adminEntryProofUrl(groupId, userId))
      .then((url) => {
        blobUrl = url;
        setSrc(url);
      })
      .catch(() => setError(true));
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [open, groupId, userId]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Comprobante de pago"
      size="lg"
    >
      <p className="text-sm text-muted -mt-2 mb-2">
        <UserDisplayName username={username} firstName={firstName} lastName={lastName} />
      </p>
      <div className="space-y-4 mt-2">
        {error ? (
          <p className="text-danger text-sm text-center py-8">No se pudo cargar la imagen.</p>
        ) : src ? (
          <img
            src={src}
            alt={`Comprobante de ${username}`}
            className="w-full max-h-[70vh] object-contain rounded-xl bg-black/30"
          />
        ) : (
          <div className="h-48 rounded-xl bg-white/5 animate-pulse motion-reduce:animate-none" />
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          {onConfirm && (
            <Button
              type="button"
              variant="primary"
              className="flex-1"
              loading={confirming}
              onClick={onConfirm}
            >
              Confirmar pago
            </Button>
          )}
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
