"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiBase } from "@/lib/api";
import api from "@/lib/api";
import type { User } from "@/types/api";

export interface AvatarPreset {
  id: string;
  label: string;
  path: string;
}

export function useAvatarPresets() {
  return useQuery({
    queryKey: ["avatar", "presets"],
    queryFn: () => api.get<{ presets: AvatarPreset[] }>("/users/avatar-presets"),
    staleTime: 300_000,
  });
}

export function useUpdateAvatarPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (preset: string | null) =>
      api.patch<User>("/users/me/avatar", { preset }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${getApiBase()}/api/v1/users/me/avatar/upload`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw err;
      }
      return res.json() as Promise<User>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
