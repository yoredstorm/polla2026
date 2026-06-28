"use client";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useCompetitionSlug } from "@/components/providers/CompetitionProvider";
import { DEFAULT_COMPETITION_SLUG } from "@/lib/competitionPaths";
import type { Fixture, PaginatedResponse, FixtureFilter } from "@/types/api";

function competitionApiBase(slug: string) {
  return `/c/${slug}`;
}

export function useFixtures(filters: FixtureFilter = {}) {
  const slug = useCompetitionSlug() || DEFAULT_COMPETITION_SLUG;
  return useQuery({
    queryKey: ["fixtures", slug, filters],
    queryFn: () =>
      api.get<PaginatedResponse<Fixture>>(`${competitionApiBase(slug)}/fixtures`, {
        group_name: filters.group_name,
        tournament_phase: filters.tournament_phase,
        date_from: filters.date_from,
        date_to: filters.date_to,
        status: filters.status,
        exclude_finished: filters.exclude_finished,
        page: filters.page || 1,
        limit: filters.limit || 20,
      }),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useFixture(fixtureId: string) {
  const slug = useCompetitionSlug() || DEFAULT_COMPETITION_SLUG;
  return useQuery({
    queryKey: ["fixture", slug, fixtureId],
    queryFn: () => api.get<Fixture>(`${competitionApiBase(slug)}/fixtures/${fixtureId}`),
    enabled: !!fixtureId,
  });
}

export function useTournamentPhases() {
  const slug = useCompetitionSlug() || DEFAULT_COMPETITION_SLUG;
  return useQuery({
    queryKey: ["fixtures", slug, "tournament-phases"],
    queryFn: () => api.get<{ key: string; label: string }[]>(`${competitionApiBase(slug)}/tournament-phases`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useLiveFixtures() {
  const slug = useCompetitionSlug() || DEFAULT_COMPETITION_SLUG;
  return useQuery({
    queryKey: ["fixtures", slug, "live"],
    queryFn: () => api.get<Fixture[]>(`${competitionApiBase(slug)}/fixtures/live`),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
