"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { BetsProfileMeResponse, Bet, PaginatedResponse, PublicUserSummary, User } from "@/types/api";

export function profileInviteStorageKey(userId: string) {
  return `polla_profile_invite:${userId}`;
}

export function readStoredProfileInvite(userId: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  return sessionStorage.getItem(profileInviteStorageKey(userId)) ?? undefined;
}

export function writeStoredProfileInvite(userId: string, code: string) {
  sessionStorage.setItem(profileInviteStorageKey(userId), code);
}

export function useUserSummaryByUsername(username: string, inviteCode?: string, isAuthenticated = true) {
  return useQuery({
    queryKey: ["user-summary", username, inviteCode ?? "", isAuthenticated],
    queryFn: () => {
      const path = isAuthenticated
        ? `/users/by-username/${encodeURIComponent(username)}/summary`
        : `/users/by-username/${encodeURIComponent(username)}/public`;
      const params = isAuthenticated && inviteCode ? { invite_code: inviteCode } : undefined;
      return api.get<PublicUserSummary>(path, params);
    },
    enabled: !!username,
  });
}

export function useUserPublicBets(
  userId: string | undefined,
  page: number,
  inviteCode?: string,
  enabled = true,
  limit = 20,
) {
  return useQuery({
    queryKey: ["user-public-bets", userId, page, limit, inviteCode ?? ""],
    queryFn: () =>
      api.get<PaginatedResponse<Bet>>(`/users/${userId}/bets`, {
        page,
        limit,
        invite_code: inviteCode,
      }),
    enabled: !!userId && enabled,
  });
}

export function useUpdateBetsProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { visibility: "public" | "invite_only"; rotate_code?: boolean; show_bet_amounts?: boolean }) =>
      api.patch<BetsProfileMeResponse>("/users/me/bets-profile", body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: ["me"] });
      const prev = qc.getQueryData<User | null>(["me"]);
      if (prev) {
        qc.setQueryData<User | null>(["me"], {
          ...prev,
          bets_profile_visibility: body.visibility,
          has_bets_profile_invite_code: body.visibility === "invite_only",
          ...(body.show_bet_amounts !== undefined && { show_bet_amounts: body.show_bet_amounts }),
        });
      }
      return { prev };
    },
    onError: (_err, _body, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(["me"], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      qc.invalidateQueries({ queryKey: ["group-leaderboard"] });
    },
  });
}
