"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { getApiBase } from "@/lib/api";
import {
  useNonMembers,
  usePendingExtras,
  useGroupMembers,
  useAddGroupMember,
  useRemoveGroupMember,
  useConfirmExtra,
  useAdminPhaseFees,
  usePatchPhaseFees,
  useAdminPhasePendingEntries,
  useConfirmPhaseEnrollment,
  useAdminPhaseWinners,
  usePatchGroup,
  useUploadPaymentQr,
} from "@/hooks/useAdmin";
import {
  useCompetitionAdminNonMembers,
  useCompetitionAdminPendingExtras,
  useCompetitionAdminPhaseFees,
  useCompetitionAdminPhasePendingEntries,
  useCompetitionAdminPhaseWinners,
  useCompetitionPatchPool,
} from "@/hooks/useCompetitionAdmin";
import type { GroupPhaseFeeRow, AdminNonMember } from "@/types/api";

function adminBase(slug: string) {
  return `/c/${slug}/admin`;
}

export function useScopedNonMembers(pollaId: string | null, competitionSlug?: string) {
  const global = useNonMembers(competitionSlug ? null : pollaId);
  const scoped = useCompetitionAdminNonMembers(competitionSlug);
  return competitionSlug ? scoped : global;
}

export function useScopedPendingExtras(pollaId: string | null, competitionSlug?: string) {
  const global = usePendingExtras(competitionSlug ? null : pollaId);
  const scoped = useCompetitionAdminPendingExtras(competitionSlug);
  return competitionSlug ? scoped : global;
}

export function useScopedGroupMembers(pollaId: string | null, competitionSlug?: string) {
  const global = useGroupMembers(competitionSlug ? null : pollaId);
  const scoped = useQuery({
    queryKey: ["competition-admin", competitionSlug, "members"],
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
      >(`${adminBase(competitionSlug!)}/pool/members`),
    enabled: !!competitionSlug && !!pollaId,
    staleTime: 10_000,
  });
  return competitionSlug ? scoped : global;
}

export function useScopedAddGroupMember(competitionSlug?: string) {
  const global = useAddGroupMember();
  const qc = useQueryClient();
  const scoped = useMutation({
    mutationFn: ({
      userId,
      phaseKey,
    }: {
      groupId: string;
      userId: string;
      phaseKey?: string;
    }) =>
      api.post(`${adminBase(competitionSlug!)}/pool/members`, {
        user_id: userId,
        ...(phaseKey ? { phase_key: phaseKey } : {}),
      }),
    onSuccess: () => {
      if (competitionSlug) {
        qc.invalidateQueries({ queryKey: ["competition-admin", competitionSlug] });
      }
    },
  });
  return competitionSlug ? scoped : global;
}

export function useScopedRemoveGroupMember(competitionSlug?: string) {
  const global = useRemoveGroupMember();
  const qc = useQueryClient();
  const scoped = useMutation({
    mutationFn: ({ userId }: { groupId: string; userId: string }) =>
      api.delete(`${adminBase(competitionSlug!)}/pool/members/${userId}`),
    onSuccess: () => {
      if (competitionSlug) {
        qc.invalidateQueries({ queryKey: ["competition-admin", competitionSlug] });
      }
    },
  });
  return competitionSlug ? scoped : global;
}

export function useScopedConfirmExtra(competitionSlug?: string) {
  const global = useConfirmExtra();
  const qc = useQueryClient();
  const scoped = useMutation({
    mutationFn: ({ betId }: { groupId: string; betId: string }) =>
      api.post<{ prize_pool: string }>(`${adminBase(competitionSlug!)}/pool/confirm-extra/${betId}`),
    onSuccess: () => {
      if (competitionSlug) {
        qc.invalidateQueries({ queryKey: ["competition-admin", competitionSlug] });
      }
    },
  });
  return competitionSlug ? scoped : global;
}

export function useScopedPhaseFees(pollaId: string | null, competitionSlug?: string) {
  const global = useAdminPhaseFees(competitionSlug ? null : pollaId);
  const scoped = useCompetitionAdminPhaseFees(competitionSlug);
  return competitionSlug ? scoped : global;
}

export function useScopedPatchPhaseFees(competitionSlug?: string) {
  const global = usePatchPhaseFees();
  const qc = useQueryClient();
  const scoped = useMutation({
    mutationFn: ({
      fees,
    }: {
      groupId: string;
      fees: { phase_key: string; entry_fee: number; extra_per_match: number | null }[];
    }) => api.patch(`${adminBase(competitionSlug!)}/pool/phase-fees`, { fees }),
    onSuccess: () => {
      if (competitionSlug) {
        qc.invalidateQueries({ queryKey: ["competition-admin", competitionSlug, "phase-fees"] });
      }
    },
  });
  return competitionSlug ? scoped : global;
}

export function useScopedPhasePendingEntries(
  pollaId: string | null,
  phaseKey: string,
  competitionSlug?: string,
) {
  const global = useAdminPhasePendingEntries(competitionSlug ? null : pollaId, phaseKey);
  const scoped = useCompetitionAdminPhasePendingEntries(phaseKey, competitionSlug);
  return competitionSlug ? scoped : global;
}

export function useScopedConfirmPhaseEnrollment(competitionSlug?: string) {
  const global = useConfirmPhaseEnrollment();
  const qc = useQueryClient();
  const scoped = useMutation({
    mutationFn: ({
      userId,
      phaseKey,
    }: {
      groupId: string;
      userId: string;
      phaseKey: string;
    }) =>
      api.post(`${adminBase(competitionSlug!)}/pool/phase-enrollments`, {
        user_id: userId,
        phase_key: phaseKey,
      }),
    onSuccess: () => {
      if (competitionSlug) {
        qc.invalidateQueries({ queryKey: ["competition-admin", competitionSlug] });
      }
    },
  });
  return competitionSlug ? scoped : global;
}

export function useScopedPhaseWinners(pollaId: string | null, competitionSlug?: string) {
  const global = useAdminPhaseWinners(competitionSlug ? null : pollaId);
  const scoped = useCompetitionAdminPhaseWinners(competitionSlug);
  return competitionSlug ? scoped : global;
}

export function useScopedPatchGroup(competitionSlug?: string) {
  const global = usePatchGroup();
  const scoped = useCompetitionPatchPool(competitionSlug);
  return competitionSlug ? scoped : global;
}

export type PatchGroupVars = {
  groupId?: string;
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
};

export function useScopedUploadPaymentQr(competitionSlug?: string) {
  const global = useUploadPaymentQr();
  if (!competitionSlug) return global;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file }: { groupId: string; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `${getApiBase()}/api/v1/c/${competitionSlug}/admin/pool/payment-qr`,
        { method: "POST", body: fd, credentials: "include" },
      );
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competition-admin", competitionSlug, "pool"] });
    },
  });
}

export type { AdminNonMember, GroupPhaseFeeRow };
