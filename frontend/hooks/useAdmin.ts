"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { AdminStats, SettleResult } from "@/types/api";

export function useAdminStats() {
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => api.get<AdminStats>("/admin/stats"),
    staleTime: 30_000,
  });
}

export function useAdminTopWinners(limit = 10) {
  return useQuery({
    queryKey: ["admin", "top-winners", limit],
    queryFn: () =>
      api.get<
        { user_id: string; username: string; total_points: number; total_bets: number; correct: number; wrong: number }[]
      >("/admin/top-winners", { limit }),
    staleTime: 30_000,
  });
}

export function useAdminFixtures(status?: string, page = 1, limit = 20) {
  return useQuery({
    queryKey: ["admin", "fixtures", status, page, limit],
    queryFn: () =>
      api.get<{
        data: any[];
        pagination: { total: number; page: number; limit: number; total_pages: number };
      }>("/admin/fixtures", { status: status || undefined, page, limit }),
    staleTime: 15_000,
  });
}

export function useSettleFixture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fixtureId, homeScore, awayScore }: { fixtureId: string; homeScore: number; awayScore: number }) =>
      api.patch<SettleResult>(`/admin/fixtures/${fixtureId}/result`, {
        home_score: homeScore,
        away_score: awayScore,
        status: "finished",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: ["fixtures"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });
}

export function useKnownTeams() {
  return useQuery({
    queryKey: ["admin", "known-teams"],
    queryFn: () => api.get<{ name: string; flag_url: string }[]>("/admin/fixtures/known-teams"),
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function useEditFixture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      fixtureId,
      data,
    }: {
      fixtureId: string;
      data: {
        home_team?: string;
        away_team?: string;
        home_logo_url?: string;
        away_logo_url?: string;
        betting_open?: boolean;
        venue?: string;
        match_date?: string;
      };
    }) => api.patch(`/admin/fixtures/${fixtureId}/edit`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "fixtures"] });
      qc.invalidateQueries({ queryKey: ["fixtures"] });
    },
  });
}

export function useUpdateFixtureStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fixtureId, status }: { fixtureId: string; status: string }) =>
      api.patch<{ ok: boolean }>(`/admin/fixtures/${fixtureId}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: ["fixtures"] });
    },
  });
}

export function useAdminUsers(page = 1, limit = 20) {
  return useQuery({
    queryKey: ["admin", "users", page, limit],
    queryFn: () =>
      api.get<{
        data: any[];
        pagination: { total: number; page: number; limit: number; total_pages: number };
      }>("/admin/users", { page, limit }),
    staleTime: 15_000,
  });
}

export function usePatchUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...body }: { userId: string; is_active?: boolean; is_admin?: boolean }) =>
      api.patch<any>(`/admin/users/${userId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useAdminGroups(page = 1, limit = 20) {
  return useQuery({
    queryKey: ["admin", "groups", page, limit],
    queryFn: () =>
      api.get<{
        data: any[];
        pagination: { total: number; page: number; limit: number; total_pages: number };
      }>("/admin/groups", { page, limit }),
    staleTime: 15_000,
  });
}

export function useCreatePolla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; entry_fee: number; currency: string; per_match_amount?: number }) =>
      api.post<any>("/admin/groups", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "groups"] });
      qc.invalidateQueries({ queryKey: ["pool"] });
    },
  });
}

export function usePatchGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupId,
      ...body
    }: {
      groupId: string;
      entry_fee?: number;
      currency?: string;
      bet_amount_mode?: string;
      fixed_bet_amount?: number;
      is_active?: boolean;
    }) => api.patch<any>(`/admin/groups/${groupId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "groups"] });
      qc.invalidateQueries({ queryKey: ["pool"] });
    },
  });
}

export function useGroupMembers(groupId: string | null) {
  return useQuery({
    queryKey: ["admin", "group-members", groupId],
    queryFn: () =>
      api.get<{ user_id: string; username: string; joined_at: string; total_points: number; total_amount_bet: string }[]>(
        `/admin/groups/${groupId}/members`,
      ),
    enabled: !!groupId,
    staleTime: 10_000,
  });
}

export function useAddGroupMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      api.post<any>(`/admin/groups/${groupId}/members`, { user_id: userId }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "group-members", vars.groupId] });
      qc.invalidateQueries({ queryKey: ["admin", "groups"] });
      qc.invalidateQueries({ queryKey: ["pool"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useRemoveGroupMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      api.delete<any>(`/admin/groups/${groupId}/members/${userId}`),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "group-members", vars.groupId] });
      qc.invalidateQueries({ queryKey: ["admin", "groups"] });
      qc.invalidateQueries({ queryKey: ["pool"] });
    },
  });
}

export function useAdminAllUsers() {
  return useQuery({
    queryKey: ["admin", "all-users-light"],
    queryFn: () =>
      api.get<{ data: { id: string; username: string }[]; pagination: any }>("/admin/users", { limit: 200 }),
    staleTime: 60_000,
  });
}

export function useNonMembers(groupId: string | null) {
  return useQuery({
    queryKey: ["admin", "non-members", groupId],
    queryFn: () =>
      api.get<{ user_id: string; username: string; registered_at: string }[]>(
        `/admin/groups/${groupId}/non-members`,
      ),
    enabled: !!groupId,
    refetchInterval: 15_000,
  });
}

export function usePendingExtras(groupId: string | null) {
  return useQuery({
    queryKey: ["admin", "pending-extras", groupId],
    queryFn: () =>
      api.get<{ bet_id: string; user_id: string; username: string; fixture_id: string; amount: string; predicted_home_score: number; predicted_away_score: number; created_at: string }[]>(
        `/admin/groups/${groupId}/pending-extras`,
      ),
    enabled: !!groupId,
    refetchInterval: 15_000,
  });
}

export function useConfirmExtra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, betId }: { groupId: string; betId: string }) =>
      api.post<{ ok: boolean; amount: string; prize_pool: string }>(
        `/admin/groups/${groupId}/confirm-extra/${betId}`,
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "pending-extras", vars.groupId] });
      qc.invalidateQueries({ queryKey: ["admin", "groups"] });
      qc.invalidateQueries({ queryKey: ["pool"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export interface AuditEntry {
  id: string;
  user_id: string | null;
  username: string | null;
  action: string;
  action_label: string;
  detail: string | null;
  detail_summary: string;
  ip_address: string | null;
  created_at: string;
}

export function useAuditLog(page = 1, limit = 50, action?: string) {
  return useQuery({
    queryKey: ["admin", "audit-log", page, limit, action],
    queryFn: () =>
      api.get<{
        data: AuditEntry[];
        pagination: { total: number; page: number; limit: number; total_pages: number };
      }>("/admin/audit-log", { page, limit, ...(action ? { action } : {}) }),
    staleTime: 10_000,
  });
}

// ── Bet change requests ─────────────────────────────────────────────

export interface AdminChangeRequest {
  id: string;
  user_id: string;
  username: string;
  bet_id: string;
  request_type: "modify" | "delete";
  new_predicted_home_score: number | null;
  new_predicted_away_score: number | null;
  original_home: number;
  original_away: number;
  fixture_id: string;
  home_team: string;
  away_team: string;
  home_logo_url: string | null;
  away_logo_url: string | null;
  amount: string;
  group_id: string | null;
  reason: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  resolved_at: string | null;
  match_date: string;
  fixture_status: string;
}

export function useAdminChangeRequests(page = 1, limit = 20, statusFilter?: string) {
  return useQuery({
    queryKey: ["admin", "change-requests", page, limit, statusFilter],
    queryFn: () =>
      api.get<{
        data: AdminChangeRequest[];
        pagination: { total: number; page: number; limit: number; total_pages: number };
      }>("/admin/bet-change-requests", {
        page,
        limit,
        ...(statusFilter ? { status: statusFilter } : {}),
      }),
    staleTime: 10_000,
  });
}

export function usePendingChangeRequestCount() {
  return useQuery({
    queryKey: ["admin", "change-requests-count"],
    queryFn: () => api.get<{ count: number }>("/admin/bet-change-requests/pending-count"),
    staleTime: 15_000,
  });
}

export function useApproveChangeRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, admin_notes }: { requestId: string; admin_notes?: string }) =>
      api.post<{ ok: boolean }>(`/admin/bet-change-requests/${requestId}/approve`, { admin_notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "change-requests"] });
      qc.invalidateQueries({ queryKey: ["admin", "change-requests-count"] });
      qc.invalidateQueries({ queryKey: ["admin", "groups"] });
      qc.invalidateQueries({ queryKey: ["pool"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useRejectChangeRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, admin_notes }: { requestId: string; admin_notes?: string }) =>
      api.post<{ ok: boolean }>(`/admin/bet-change-requests/${requestId}/reject`, { admin_notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "change-requests"] });
      qc.invalidateQueries({ queryKey: ["admin", "change-requests-count"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
