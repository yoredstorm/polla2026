"use client";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export interface RivalInfo {
  opponent_id: string;
  opponent_username: string | null;
  wins: number;
  losses: number;
  draws: number;
  total_duels: number;
  duels_together?: number;
}

export function useMyRival(enabled = true) {
  return useQuery({
    queryKey: ["leaderboard", "rival"],
    queryFn: () => api.get<{ rival: RivalInfo | null }>("/leaderboard/rival"),
    enabled,
    staleTime: 120_000,
  });
}

export function useH2H(opponentId: string, enabled = true) {
  return useQuery({
    queryKey: ["leaderboard", "h2h", opponentId],
    queryFn: () => api.get<RivalInfo>(`/leaderboard/h2h/${opponentId}`),
    enabled: enabled && !!opponentId,
    staleTime: 120_000,
  });
}
