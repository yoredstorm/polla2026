"use client";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { BadgeCatalogEntry } from "@/lib/badges";

export function useBadgeCatalog() {
  return useQuery({
    queryKey: ["badges", "catalog"],
    queryFn: () => api.get<{ badges: BadgeCatalogEntry[] }>("/badges/catalog"),
    staleTime: 60 * 60 * 1000,
  });
}

export function useMyBadgeProgress(enabled = true) {
  return useQuery({
    queryKey: ["badges", "catalog", "me"],
    queryFn: () =>
      api.get<{
        badges: BadgeCatalogEntry[];
        earned_ids: string[];
        earned_count: number;
        total_count: number;
      }>("/badges/catalog/me"),
    enabled,
    staleTime: 30_000,
  });
}
