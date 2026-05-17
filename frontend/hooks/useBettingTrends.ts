"use client";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export interface BettingTrendOutcome {
  key: string;
  label: string;
  count: number;
  pct: number;
}

export interface BettingTrends {
  fixture_id: string;
  available: boolean;
  reason?: string;
  total_bets: number;
  outcomes: BettingTrendOutcome[];
  top_scores: { score: string; count: number; pct: number }[];
}

export function useBettingTrends(fixtureId: string, enabled = true) {
  return useQuery({
    queryKey: ["fixtures", fixtureId, "betting-trends"],
    queryFn: () => api.get<BettingTrends>(`/fixtures/${fixtureId}/betting-trends`),
    enabled: enabled && !!fixtureId,
    staleTime: 60_000,
  });
}
