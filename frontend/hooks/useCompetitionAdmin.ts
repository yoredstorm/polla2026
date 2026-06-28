"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useCompetitionSlug } from "@/components/providers/CompetitionProvider";
import { DEFAULT_COMPETITION_SLUG } from "@/lib/competitionPaths";
import { competitionMarqueeQueryKey, toPublicMarqueeView } from "@/hooks/useCompetitionMarquee";
import { notifyMarqueeChanged } from "@/lib/marqueeSync";
import type {
  AdminStats,
  SettleResult,
  AdminFixture,
  AdminGroupDetail,
  AdminPhaseWinnersResponse,
  GroupPhaseFeeRow,
  PhasePendingEntry,
  PaginatedResponse,
  AdminNonMember,
  SiteMarqueeAdmin,
} from "@/types/api";
import type { AdminActionQueue } from "@/hooks/useAdmin";

function useSlug(explicit?: string) {
  const ctx = useCompetitionSlug();
  return explicit ?? ctx ?? DEFAULT_COMPETITION_SLUG;
}

function adminBase(slug: string) {
  return `/c/${slug}/admin`;
}

export function useCompetitionAdminActionQueue(slug?: string) {
  const s = useSlug(slug);
  return useQuery({
    queryKey: ["competition-admin", s, "action-queue"],
    queryFn: () => api.get<AdminActionQueue>(`${adminBase(s)}/action-queue`),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
}

export function useCompetitionAdminStats(slug?: string) {
  const s = useSlug(slug);
  return useQuery({
    queryKey: ["competition-admin", s, "stats"],
    queryFn: () => api.get<AdminStats>(`${adminBase(s)}/stats`),
    staleTime: 30_000,
  });
}

export function useCompetitionAdminTopWinners(limit = 10, slug?: string) {
  const s = useSlug(slug);
  return useQuery({
    queryKey: ["competition-admin", s, "top-winners", limit],
    queryFn: () =>
      api.get<
        { user_id: string; username: string; total_points: number; total_bets: number; correct: number; wrong: number }[]
      >(`${adminBase(s)}/top-winners`, { limit }),
    staleTime: 30_000,
  });
}

export function useCompetitionAdminFixtures(
  page = 1,
  limit = 20,
  status?: string,
  slug?: string,
) {
  const s = slug ?? useCompetitionSlug();
  return useQuery({
    queryKey: ["competition-admin", s, "fixtures", page, limit, status],
    queryFn: () =>
      api.get<PaginatedResponse<AdminFixture>>(`${adminBase(s)}/fixtures`, {
        page,
        limit,
        ...(status ? { status } : {}),
      }),
    staleTime: 10_000,
    enabled: !!slug,
  });
}

export function useCompetitionAdminPool(slug?: string) {
  const s = useSlug(slug);
  return useQuery({
    queryKey: ["competition-admin", s, "pool"],
    queryFn: () => api.get<AdminGroupDetail>(`${adminBase(s)}/pool`),
    staleTime: 10_000,
  });
}

export function useCompetitionAdminNonMembers(slug?: string) {
  const s = useSlug(slug);
  return useQuery({
    queryKey: ["competition-admin", s, "non-members"],
    queryFn: () => api.get<AdminNonMember[]>(`${adminBase(s)}/pool/non-members`),
    enabled: !!s,
  });
}

export function useCompetitionAdminPendingExtras(slug?: string) {
  const s = useSlug(slug);
  return useQuery({
    queryKey: ["competition-admin", s, "pending-extras"],
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
      >(`${adminBase(s)}/pool/pending-extras`),
    enabled: !!s,
  });
}

export function useCompetitionAdminPhaseFees(slug?: string) {
  const s = useSlug(slug);
  return useQuery({
    queryKey: ["competition-admin", s, "phase-fees"],
    queryFn: () =>
      api.get<{ fees: GroupPhaseFeeRow[] }>(`${adminBase(s)}/pool/phase-fees`),
    enabled: !!s,
  });
}

export interface PhasePendingPhaseGroup {
  phase_key: string;
  phase_label: string;
  pending: PhasePendingEntry[];
}

export function useCompetitionAdminAllPhasePending(slug?: string) {
  const s = useSlug(slug);
  return useQuery({
    queryKey: ["competition-admin", s, "all-phase-pending"],
    queryFn: () =>
      api.get<{ phases: PhasePendingPhaseGroup[] }>(
        `${adminBase(s)}/pool/all-phase-pending-entries`,
      ),
    enabled: !!s,
    staleTime: 10_000,
  });
}

export function useCompetitionAdminPhasePendingEntries(phaseKey: string | null, slug?: string) {
  const s = useSlug(slug);
  return useQuery({
    queryKey: ["competition-admin", s, "phase-pending", phaseKey],
    queryFn: () =>
      api.get<{ pending: PhasePendingEntry[] }>(`${adminBase(s)}/pool/phase-pending-entries`, {
        phase_key: phaseKey!,
      }),
    enabled: !!phaseKey && !!s,
  });
}

export function useCompetitionAdminPhaseWinners(slug?: string) {
  const s = useSlug(slug);
  return useQuery({
    queryKey: ["competition-admin", s, "phase-winners"],
    queryFn: () => api.get<AdminPhaseWinnersResponse>(`${adminBase(s)}/pool/phase-winners`),
    enabled: !!s,
  });
}

export function useCompetitionAdminAuditLog(page = 1, limit = 50, action?: string, slug?: string) {
  const s = useSlug(slug);
  return useQuery({
    queryKey: ["competition-admin", s, "audit-log", page, limit, action],
    queryFn: () =>
      api.get<{
        data: Array<{
          id: string;
          action: string;
          action_label: string;
          detail_summary: string;
          detail?: string | null;
          username: string | null;
          ip_address?: string | null;
          created_at: string;
        }>;
        pagination: { total: number; page: number; limit: number; total_pages: number };
      }>(`${adminBase(s)}/audit-log`, { page, limit, ...(action ? { action } : {}) }),
    staleTime: 15_000,
  });
}

export function useCompetitionChangeRequests(
  page = 1,
  limit = 20,
  status?: string,
  slug?: string,
) {
  const s = useSlug(slug);
  return useQuery({
    queryKey: ["competition-admin", s, "change-requests", page, limit, status],
    queryFn: () =>
      api.get<{ data: unknown[]; pagination: PaginatedResponse<unknown>["pagination"] }>(
        `${adminBase(s)}/bet-change-requests`,
        { page, limit, ...(status ? { status } : {}) },
      ),
    staleTime: 10_000,
  });
}

export function useCompetitionApproveChangeRequest(slug?: string) {
  const s = useSlug(slug);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, admin_notes }: { requestId: string; admin_notes?: string }) =>
      api.post(`${adminBase(s)}/bet-change-requests/${requestId}/approve`, { admin_notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competition-admin", s] });
    },
  });
}

export function useCompetitionRejectChangeRequest(slug?: string) {
  const s = useSlug(slug);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, admin_notes }: { requestId: string; admin_notes?: string }) =>
      api.post(`${adminBase(s)}/bet-change-requests/${requestId}/reject`, { admin_notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competition-admin", s] });
    },
  });
}

export function useCompetitionPatchPool(slug?: string) {
  const s = useSlug(slug);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`${adminBase(s)}/pool`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competition-admin", s, "pool"] }),
  });
}

export function useCompetitionSettleFixture(slug?: string) {
  const s = useSlug(slug);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      fixtureId,
      homeScore,
      awayScore,
      home_score,
      away_score,
    }: {
      fixtureId: string;
      homeScore?: number;
      awayScore?: number;
      home_score?: number;
      away_score?: number;
    }) =>
      api.patch<SettleResult>(`${adminBase(s)}/fixtures/${fixtureId}/result`, {
        home_score: homeScore ?? home_score ?? 0,
        away_score: awayScore ?? away_score ?? 0,
        status: "finished",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competition-admin", s] }),
  });
}

export function useCompetitionEditFixture(slug?: string) {
  const s = useSlug(slug);
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
    }) => api.patch(`${adminBase(s)}/fixtures/${fixtureId}/edit`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competition-admin", s, "fixtures"] });
      qc.invalidateQueries({ queryKey: ["fixtures"] });
    },
  });
}

export function useCompetitionAdminMarquee(slug?: string) {
  const s = useSlug(slug);
  return useQuery({
    queryKey: ["competition-admin", s, "marquee"],
    queryFn: () => api.get<SiteMarqueeAdmin>(`${adminBase(s)}/marquee`),
    staleTime: 10_000,
  });
}

export function useUpdateCompetitionMarquee(slug?: string) {
  const s = useSlug(slug);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { message: string; enabled: boolean }) =>
      api.put<SiteMarqueeAdmin>(`${adminBase(s)}/marquee`, data),
    onSuccess: async (data) => {
      qc.setQueryData(["competition-admin", s, "marquee"], data);
      qc.setQueryData(competitionMarqueeQueryKey(s), toPublicMarqueeView(data));
      notifyMarqueeChanged(s);
      await qc.invalidateQueries({
        queryKey: competitionMarqueeQueryKey(s),
        refetchType: "active",
      });
      qc.invalidateQueries({ queryKey: ["competition-admin", s, "audit-log"] });
      qc.invalidateQueries({ queryKey: ["competition-admin", s, "action-queue"] });
    },
  });
}
