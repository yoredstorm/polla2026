"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { getApiBase } from "@/lib/api";
import type {
  ActivePolla,
  Group,
  GroupMember,
  LeaderboardEntry,
  BetWithUser,
  GroupFixtureStandingEntry,
  TournamentProgress,
} from "@/types/api";

export function useActivePolla() {
  return useQuery({
    queryKey: ["pool", "active"],
    queryFn: () => api.get<ActivePolla | null>("/groups/pool/active"),
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useTournamentProgress() {
  return useQuery({
    queryKey: ["pool", "tournament-progress"],
    queryFn: () => api.get<TournamentProgress | null>("/groups/pool/active/tournament-progress"),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useMyGroups() {
  return useQuery({
    queryKey: ["groups"],
    queryFn: () => api.get<Group[]>("/groups"),
  });
}

export function useGroup(groupId: string) {
  return useQuery({
    queryKey: ["group", groupId],
    queryFn: () => api.get<Group>(`/groups/${groupId}`),
    enabled: !!groupId,
  });
}

export function useGroupMembers(groupId: string) {
  return useQuery({
    queryKey: ["group-members", groupId],
    queryFn: () => api.get<GroupMember[]>(`/groups/${groupId}/members`),
    enabled: !!groupId,
  });
}

export function useGroupLeaderboard(
  groupId: string,
  options?: { sort?: "points" | "accuracy" | "bets"; min_bets?: number; enabled?: boolean },
) {
  const sort = options?.sort ?? "points";
  const min_bets = options?.min_bets ?? 1;
  return useQuery({
    queryKey: ["group-leaderboard", groupId, sort, min_bets],
    queryFn: () =>
      api.get<LeaderboardEntry[]>(`/groups/${groupId}/leaderboard`, { sort, min_bets }),
    enabled: (options?.enabled ?? true) && !!groupId,
  });
}

export function useGroupBets(groupId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["group-bets", groupId],
    queryFn: () => api.get<BetWithUser[]>(`/groups/${groupId}/bets`),
    enabled: (options?.enabled ?? true) && !!groupId,
  });
}

export function useGroupFixtureStandings(groupId: string, fixtureId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["group-fixture-standings", groupId, fixtureId],
    queryFn: () =>
      api.get<GroupFixtureStandingEntry[]>(`/groups/${groupId}/fixtures/${fixtureId}/standings`),
    enabled: (options?.enabled ?? true) && !!groupId && !!fixtureId,
    retry: false,
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; max_members?: number; entry_fee?: number; currency?: string }) =>
      api.post<Group>("/groups", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });
}

export function useJoinGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invite_code: string) => api.post<Group>("/groups/join", { invite_code }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });
}

export function useUploadEntryProof() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${getApiBase()}/api/v1/groups/pool/active/entry-proof`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw err;
      }
      return res.json() as Promise<{ ok: boolean; has_uploaded_proof: boolean }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pool", "active"] });
      qc.invalidateQueries({ queryKey: ["admin", "non-members"] });
    },
  });
}
