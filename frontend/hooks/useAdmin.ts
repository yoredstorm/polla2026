"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { getApiBase } from "@/lib/api";
import type {
  AdminNonMember,
  AdminStats,
  SettleResult,
  AdminFixture,
  AdminUserEntry,
  AdminGroupDetail,
  AdminPhaseWinnersResponse,
  GroupPhaseFeeRow,
  PhasePendingEntry,
  PaginatedResponse,
} from "@/types/api";

export interface AdminActionQueue {
  pending: {
    change_requests: number;
    password_resets: number;
    entries: number;
    extras: number;
    total: number;
  };
  group_id: string | null;
  fixtures_attention: {
    id: string;
    home_team: string;
    away_team: string;
    match_date: string;
    status: string;
    betting_open: boolean;
    is_locked: boolean;
    home_score: number | null;
    away_score: number | null;
    urgency: string;
    betting_closes_at: string | null;
  }[];
  recent_critical: {
    id: string;
    action: string;
    action_label: string;
    summary: string;
    created_at: string;
    username: string | null;
  }[];
}

export function useAdminActionQueue() {
  return useQuery({
    queryKey: ["admin", "action-queue"],
    queryFn: () => api.get<AdminActionQueue>("/admin/action-queue"),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
}

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
      api.get<PaginatedResponse<AdminFixture>>("/admin/fixtures", {
        status: status || undefined,
        page,
        limit,
      }),
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
      api.get<PaginatedResponse<AdminUserEntry>>("/admin/users", { page, limit }),
    staleTime: 15_000,
  });
}

export function usePatchUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...body }: { userId: string; is_active?: boolean; is_admin?: boolean }) =>
      api.patch<AdminUserEntry>(`/admin/users/${userId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useAdminGroups(page = 1, limit = 20) {
  return useQuery({
    queryKey: ["admin", "groups", page, limit],
    queryFn: () =>
      api.get<PaginatedResponse<AdminGroupDetail>>("/admin/groups", { page, limit }),
    staleTime: 15_000,
  });
}

export function useAdminPhaseFees(groupId: string | null) {
  return useQuery({
    queryKey: ["admin", "phase-fees", groupId],
    queryFn: () =>
      api.get<{ group_id: string; fees: GroupPhaseFeeRow[] }>(
        `/admin/groups/${groupId}/phase-fees`,
      ),
    enabled: !!groupId,
  });
}

export function usePatchPhaseFees() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupId,
      fees,
    }: {
      groupId: string;
      fees: { phase_key: string; entry_fee: number; extra_per_match: number | null }[];
    }) =>
      api.patch<{ group_id: string; fees: GroupPhaseFeeRow[] }>(
        `/admin/groups/${groupId}/phase-fees`,
        { fees },
      ),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["admin", "phase-fees", v.groupId] });
      qc.invalidateQueries({ queryKey: ["pool", "active"] });
    },
  });
}

export function useAdminPhasePendingEntries(groupId: string | null, phaseKey?: string) {
  return useQuery({
    queryKey: ["admin", "phase-pending", groupId, phaseKey],
    queryFn: () =>
      api.get<{ group_id: string; phase_key: string; pending: PhasePendingEntry[] }>(
        `/admin/groups/${groupId}/phase-pending-entries`,
        { phase_key: phaseKey },
      ),
    enabled: !!groupId,
    refetchInterval: 20_000,
  });
}

export function useConfirmPhaseEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupId,
      userId,
      phaseKey,
    }: {
      groupId: string;
      userId: string;
      phaseKey?: string;
    }) =>
      api.post(`/admin/groups/${groupId}/phase-enrollments`, {
        user_id: userId,
        phase_key: phaseKey,
      }),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["admin", "phase-pending", v.groupId] });
      qc.invalidateQueries({ queryKey: ["pool", "active"] });
      qc.invalidateQueries({ queryKey: ["admin", "groups"] });
    },
  });
}

export function useAdminPhaseWinners(groupId: string | null) {
  return useQuery({
    queryKey: ["admin", "phase-winners", groupId],
    queryFn: () =>
      api.get<AdminPhaseWinnersResponse>(`/admin/groups/${groupId}/phase-winners`),
    enabled: !!groupId,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useCreatePolla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      entry_fee: number;
      currency: string;
      per_match_amount?: number;
      prize_structure_mode?: string;
      challenge_max_stake?: number;
      challenge_daily_limit?: number;
      challenge_tournament_limit?: number;
      challenges_enabled?: boolean;
      payment_contact_name?: string;
      payment_phone?: string;
    }) => api.post<AdminGroupDetail>("/admin/groups", body),
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
      challenge_max_stake?: number;
      challenge_daily_limit?: number;
      challenge_tournament_limit?: number;
      challenges_enabled?: boolean;
      payment_contact_name?: string;
      payment_phone?: string;
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
      api.get<
        {
          user_id: string;
          username: string;
          first_name?: string | null;
          last_name?: string | null;
          joined_at: string;
          total_points: number;
          total_amount_bet: string;
        }[]
      >(
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
      qc.invalidateQueries({ queryKey: ["admin", "non-members", vars.groupId] });
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
    queryFn: async () => {
      const limit = 100;
      const all: { id: string; username: string }[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const res = await api.get<{
          data: { id: string; username: string }[];
          pagination: { total: number; page: number; limit: number; total_pages: number };
        }>("/admin/users", { page, limit });
        all.push(...res.data);
        totalPages = res.pagination?.total_pages ?? 1;
        page += 1;
      } while (page <= totalPages);
      return { data: all, pagination: { total: all.length } };
    },
    staleTime: 60_000,
  });
}

export function useUploadPaymentQr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, file }: { groupId: string; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${getApiBase()}/api/v1/admin/groups/${groupId}/payment-qr`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw err;
      }
      return res.json() as Promise<{ ok: boolean; payment_qr_url: string }>;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "groups"] });
      qc.invalidateQueries({ queryKey: ["pool", "active"] });
    },
  });
}

export function useNonMembers(groupId: string | null) {
  return useQuery({
    queryKey: ["admin", "non-members", groupId],
    queryFn: () =>
      api.get<AdminNonMember[]>(`/admin/groups/${groupId}/non-members`),
    enabled: !!groupId,
    refetchInterval: 15_000,
  });
}

export function usePendingExtras(groupId: string | null) {
  return useQuery({
    queryKey: ["admin", "pending-extras", groupId],
    queryFn: () =>
      api.get<
        {
          bet_id: string;
          user_id: string;
          username: string;
          first_name?: string | null;
          last_name?: string | null;
          fixture_id: string;
          amount: string;
          predicted_home_score: number;
          predicted_away_score: number;
          created_at: string;
        }[]
      >(
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

export async function downloadAuditLogCsv(action?: string) {
  const { getApiBase } = await import("@/lib/api");
  const params = new URLSearchParams({ limit: "500" });
  if (action) params.set("action", action);
  const res = await fetch(`${getApiBase()}/api/v1/admin/audit-log/export?${params}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("No se pudo exportar");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "audit_log.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Bet change requests ─────────────────────────────────────────────

export interface AdminChangeRequest {
  id: string;
  user_id: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
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
  admin_resolve_closes_at?: string | null;
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

export interface AdminPasswordResetRequest {
  id: string;
  user_id: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  message: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

export function useAdminPasswordResetRequests(page = 1, limit = 20, statusFilter?: string) {
  return useQuery({
    queryKey: ["admin", "password-reset-requests", page, limit, statusFilter],
    queryFn: () =>
      api.get<{
        data: AdminPasswordResetRequest[];
        pagination: { total: number; page: number; limit: number; total_pages: number };
      }>("/admin/password-reset-requests", {
        page,
        limit,
        ...(statusFilter ? { status: statusFilter } : {}),
      }),
    staleTime: 10_000,
  });
}

export function usePendingPasswordResetCount() {
  return useQuery({
    queryKey: ["admin", "password-reset-count"],
    queryFn: () => api.get<{ count: number }>("/admin/password-reset-requests/pending-count"),
    staleTime: 15_000,
  });
}

export function useResolvePasswordResetRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, admin_notes }: { requestId: string; admin_notes?: string }) =>
      api.post<{ ok: boolean; temporary_password: string }>(
        `/admin/password-reset-requests/${requestId}/resolve`,
        { admin_notes },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "password-reset-requests"] });
      qc.invalidateQueries({ queryKey: ["admin", "password-reset-count"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useRejectPasswordResetRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, admin_notes }: { requestId: string; admin_notes?: string }) =>
      api.post<{ ok: boolean }>(`/admin/password-reset-requests/${requestId}/reject`, {
        admin_notes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "password-reset-requests"] });
      qc.invalidateQueries({ queryKey: ["admin", "password-reset-count"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
