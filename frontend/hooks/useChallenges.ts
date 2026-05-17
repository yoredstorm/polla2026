"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface Challenge {
  id: string;
  fixture_id: string;
  group_id: string;
  challenger_id: string;
  challenged_id: string;
  challenger_username: string | null;
  challenged_username: string | null;
  stake_points: number;
  status: string;
  winner_id: string | null;
  challenger_fixture_points?: number | null;
  challenged_fixture_points?: number | null;
  created_at: string;
  accepted_at?: string | null;
  settled_at?: string | null;
  fixture_home_team?: string | null;
  fixture_away_team?: string | null;
  fixture_match_date?: string | null;
  opponent_username?: string | null;
  my_fixture_points?: number | null;
  ranking_delta?: number | null;
  duel_result?: string | null;
  is_challenger?: boolean | null;
}

export interface ChallengeOpponent {
  username: string;
  total_points: number;
  available_for_challenge: number;
}

export function useMyChallenges() {
  return useQuery({
    queryKey: ["challenges", "my"],
    queryFn: () => api.get<Challenge[]>("/challenges/my"),
    refetchOnWindowFocus: true,
  });
}

export function useFixtureChallenges(fixtureId: string) {
  return useQuery({
    queryKey: ["challenges", "fixture", fixtureId],
    queryFn: () => api.get<Challenge[]>(`/challenges/fixture/${fixtureId}`),
    enabled: !!fixtureId,
  });
}

export function useChallengeAvailablePoints() {
  return useQuery({
    queryKey: ["challenges", "available-points"],
    queryFn: () =>
      api.get<{
        available: number;
        max_stake: number;
        max_by_balance: number;
        effective_max: number;
      }>("/challenges/available-points"),
  });
}

export function useChallengeOpponents(q: string) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: ["challenges", "opponents", trimmed],
    queryFn: () =>
      api.get<ChallengeOpponent[]>("/challenges/opponents", { q: trimmed, limit: 10 }),
    enabled: trimmed.length >= 2,
    staleTime: 30_000,
  });
}

export function useCreateChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { fixture_id: string; challenged_username: string; stake_points: number }) =>
      api.post<Challenge>("/challenges", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges"] });
    },
  });
}

export function useAcceptChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Challenge>(`/challenges/${id}/accept`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["challenges"] }),
  });
}

export function useRejectChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Challenge>(`/challenges/${id}/reject`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["challenges"] }),
  });
}
