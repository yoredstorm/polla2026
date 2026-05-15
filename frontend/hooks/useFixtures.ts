"use client";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Fixture, PaginatedResponse, FixtureFilter } from "@/types/api";

export function useFixtures(filters: FixtureFilter = {}) {
  return useQuery({
    queryKey: ["fixtures", filters],
    queryFn: () => api.get<PaginatedResponse<Fixture>>("/fixtures", {
      group_name: filters.group_name,
      date_from: filters.date_from,
      date_to: filters.date_to,
      status: filters.status,
      page: filters.page || 1,
      limit: filters.limit || 20,
    }),
    staleTime: 2 * 60 * 1000,
  });
}

export function useFixture(fixtureId: string) {
  return useQuery({
    queryKey: ["fixture", fixtureId],
    queryFn: () => api.get<Fixture>(`/fixtures/${fixtureId}`),
    enabled: !!fixtureId,
  });
}

export function useLiveFixtures() {
  return useQuery({
    queryKey: ["fixtures", "live"],
    queryFn: () => api.get<Fixture[]>("/fixtures/live"),
    refetchInterval: 30 * 1000, // Refetch every 30 seconds for live
  });
}
