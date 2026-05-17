"use client";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export interface ActivityItem {
  id: string;
  action: string;
  action_label: string;
  summary: string;
  created_at: string;
}

export function useRecentActivity(limit = 20, fixtureId?: string) {
  return useQuery({
    queryKey: ["activity", "recent", limit, fixtureId],
    queryFn: () =>
      api.get<{ data: ActivityItem[] }>("/activity/recent", {
        limit,
        ...(fixtureId ? { fixture_id: fixtureId } : {}),
      }),
    staleTime: 30_000,
  });
}
