"use client";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { LeaderboardEntry } from "@/types/api";

export type LeaderboardSort = "points" | "accuracy" | "bets";

export function useGlobalLeaderboard(
  page = 1,
  limit = 20,
  sort: LeaderboardSort = "points",
  min_bets = 1,
) {
  return useQuery({
    queryKey: ["leaderboard", "global", page, limit, sort, min_bets],
    queryFn: () =>
      api.get<LeaderboardEntry[]>("/leaderboard/global", { page, limit, sort, min_bets }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useWeeklyLeaderboard(
  page = 1,
  limit = 20,
  sort: LeaderboardSort = "points",
  min_bets = 1,
) {
  return useQuery({
    queryKey: ["leaderboard", "weekly", page, limit, sort, min_bets],
    queryFn: () =>
      api.get<LeaderboardEntry[]>("/leaderboard/weekly", { page, limit, sort, min_bets }),
    staleTime: 5 * 60 * 1000,
  });
}
