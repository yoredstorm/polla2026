"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useCompetitionSlug } from "@/components/providers/CompetitionProvider";
import { DEFAULT_COMPETITION_SLUG } from "@/lib/competitionPaths";
import type { Bet, BetCreate, PaginatedResponse } from "@/types/api";

export function useMyBets(page = 1, limit = 20) {
  const slug = useCompetitionSlug() || DEFAULT_COMPETITION_SLUG;
  return useQuery({
    queryKey: ["my-bets", slug, page],
    queryFn: () =>
      api.get<PaginatedResponse<Bet>>(`/c/${slug}/my-bets`, { page, limit }),
    refetchOnWindowFocus: true,
  });
}

export function useMyBetsForFixture(fixtureId: string) {
  return useQuery({
    queryKey: ["my-bets", "fixture", fixtureId],
    queryFn: () => api.get<Bet[]>(`/bets/my-bets/${fixtureId}`),
    enabled: !!fixtureId,
  });
}

export function useCreateBet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BetCreate) => api.post<Bet>("/bets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-bets"] });
    },
  });
}

// ── Change requests ───────────────────────────────────────────────

export interface ChangeRequest {
  id: string;
  bet_id: string;
  request_type: "modify" | "delete";
  new_predicted_home_score: number | null;
  new_predicted_away_score: number | null;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "expired";
  admin_notes: string | null;
  created_at: string;
  resolved_at: string | null;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  fixture_id: string | null;
  fixture_match_date?: string | null;
}

export function useCreateChangeRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      betId,
      ...body
    }: {
      betId: string;
      request_type: "modify" | "delete";
      new_predicted_home_score?: number;
      new_predicted_away_score?: number;
      reason?: string;
    }) => api.post<ChangeRequest>(`/bets/${betId}/change-request`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-change-requests"] });
    },
  });
}

export function useMyChangeRequests(page = 1, limit = 20) {
  return useQuery({
    queryKey: ["my-change-requests", page, limit],
    queryFn: () =>
      api.get<{
        data: ChangeRequest[];
        pagination: { total: number; page: number; limit: number; total_pages: number };
      }>("/bets/my-change-requests", { page, limit }),
    staleTime: 10_000,
  });
}

