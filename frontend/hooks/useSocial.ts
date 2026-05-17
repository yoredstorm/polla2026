"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface FixtureComment {
  id: string;
  body: string;
  username: string;
  user_id: string;
  is_mine: boolean;
  created_at: string;
}

export interface FollowingBetItem {
  bet_id: string;
  fixture_id: string;
  username: string;
  predicted_home_score: number;
  predicted_away_score: number;
  home_team: string;
  away_team: string;
  match_date: string;
  created_at: string;
}

export function useFollowStatus(username: string, enabled = true) {
  return useQuery({
    queryKey: ["social", "follow", username],
    queryFn: () =>
      api.get<{ following: boolean; is_self?: boolean }>(
        `/social/follow/${encodeURIComponent(username)}/status`,
      ),
    enabled: enabled && !!username,
    staleTime: 30_000,
  });
}

export function useFollowUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (username: string) =>
      api.post<{ ok: boolean }>(`/social/follow/${encodeURIComponent(username)}`),
    onSuccess: (_, username) => {
      qc.invalidateQueries({ queryKey: ["social", "follow", username] });
      qc.invalidateQueries({ queryKey: ["social", "feed"] });
    },
  });
}

export function useUnfollowUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (username: string) =>
      api.delete<{ ok: boolean }>(`/social/follow/${encodeURIComponent(username)}`),
    onSuccess: (_, username) => {
      qc.invalidateQueries({ queryKey: ["social", "follow", username] });
      qc.invalidateQueries({ queryKey: ["social", "feed"] });
    },
  });
}

export function useFollowingFeed(limit = 15) {
  return useQuery({
    queryKey: ["social", "feed", "following", limit],
    queryFn: () => api.get<{ data: FollowingBetItem[] }>(`/social/feed/following`, { limit }),
    staleTime: 60_000,
  });
}

export function useFixtureComments(fixtureId: string) {
  return useQuery({
    queryKey: ["social", "comments", fixtureId],
    queryFn: () =>
      api.get<{ data: FixtureComment[] }>(`/social/fixtures/${fixtureId}/comments`),
    enabled: !!fixtureId,
    staleTime: 15_000,
  });
}

export function usePostFixtureComment(fixtureId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api.post<FixtureComment>(`/social/fixtures/${fixtureId}/comments`, { body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social", "comments", fixtureId] });
    },
  });
}

export function useDeleteFixtureComment(fixtureId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      api.delete(`/social/fixtures/${fixtureId}/comments/${commentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social", "comments", fixtureId] });
    },
  });
}

export function useFixtureReactions(fixtureId: string) {
  return useQuery({
    queryKey: ["social", "reactions", fixtureId],
    queryFn: () =>
      api.get<{ counts: Record<string, number>; my_reaction: string | null }>(
        `/social/fixtures/${fixtureId}/reactions`,
      ),
    enabled: !!fixtureId,
    staleTime: 10_000,
  });
}

export function useSetFixtureReaction(fixtureId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reaction_type: "like" | "fire" | "trophy") =>
      api.put(`/social/fixtures/${fixtureId}/reactions`, { reaction_type }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social", "reactions", fixtureId] });
    },
  });
}
