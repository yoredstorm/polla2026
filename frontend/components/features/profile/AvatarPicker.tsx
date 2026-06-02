"use client";
import { useRef, useState } from "react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useAvatarPresets, useUpdateAvatarPreset, useUploadAvatar } from "@/hooks/useAvatar";
import { cn } from "@/lib/utils";
import type { User } from "@/types/api";

interface AvatarPickerProps {
  user: User;
}

export function AvatarPicker({ user }: AvatarPickerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: presetsData } = useAvatarPresets();
  const updatePreset = useUpdateAvatarPreset();
  const upload = useUploadAvatar();

  const presets = presetsData?.presets ?? [];
  const busy = updatePreset.isPending || upload.isPending;

  async function pickPreset(id: string) {
    setError(null);
    try {
      await updatePreset.mutateAsync(id);
    } catch {
      setError("No se pudo actualizar el avatar.");
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > 1_048_576) {
      setError("La imagen debe pesar menos de 1 MB.");
      return;
    }
    try {
      await upload.mutateAsync(file);
    } catch {
      setError("No se pudo subir la imagen. Usa JPG, PNG o WebP.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-glass backdrop-blur-sm p-6 space-y-4">
      <h2 className="font-display text-lg text-white">Tu avatar</h2>
      <div className="flex items-center gap-4">
        <UserAvatar username={user.username} avatarDisplay={user.avatar_display} size="lg" />
        <div className="text-xs text-muted space-y-1">
          <p>Elige un icono o sube una foto (máx. 1 MB).</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="text-accent hover:underline disabled:opacity-50"
          >
            Subir foto
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => void onFile(e)}
          />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={busy}
            title={p.label}
            onClick={() => void pickPreset(p.id)}
            className={cn(
              "rounded-xl border p-2 transition-colors hover:border-accent/50",
              user.avatar_preset === p.id && !user.avatar_url
                ? "border-accent bg-accent/10"
                : "border-white/10 bg-white/5",
            )}
          >
            <img src={p.path} alt={p.label} className="w-10 h-10 mx-auto" />
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </section>
  );
}
