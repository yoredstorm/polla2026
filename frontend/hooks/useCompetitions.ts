"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useCompetitionSlug } from "@/components/providers/CompetitionProvider";

export interface CompetitionCard {
  id: string;
  slug: string;
  name: string;
  sport: string;
  format_type: string;
  status: string;
  visibility: string;
  logo_url: string | null;
  primary_color: string;
  is_member: boolean;
  member_count: number;
}

export interface CompetitionContext {
  id: string;
  slug: string;
  name: string;
  status: string;
  logo_url: string | null;
  primary_color: string;
  is_member: boolean;
  is_admin: boolean;
  member_count: number;
}

export function useMyCompetitions() {
  return useQuery({
    queryKey: ["competitions", "mine"],
    queryFn: () => api.get<CompetitionCard[]>("/competitions/mine"),
    staleTime: 30_000,
  });
}

export function useDiscoverCompetitions() {
  return useQuery({
    queryKey: ["competitions", "discover"],
    queryFn: () => api.get<CompetitionCard[]>("/competitions/discover"),
    staleTime: 30_000,
  });
}

export function useCompetitionContext() {
  const slug = useCompetitionSlug();
  return useQuery({
    queryKey: ["competition", slug, "context"],
    queryFn: () => api.get<CompetitionContext>(`/c/${slug}/context`),
    staleTime: 10_000,
  });
}

export function useAdminCompetitions() {
  return useQuery({
    queryKey: ["competitions", "admin"],
    queryFn: () => api.get<CompetitionCard[]>("/competitions"),
    staleTime: 10_000,
  });
}

export function useCreateCompetition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      slug: string;
      name: string;
      sport?: string;
      format_type?: string;
      status?: string;
      visibility?: string;
    }) => api.post("/competitions", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competitions"] });
    },
  });
}

export function useUpdateCompetitionSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      settings,
      ...rest
    }: {
      id: string;
      settings?: { branding?: { logo_url?: string | null; primary_color?: string } };
      name?: string;
      status?: string;
    }) => api.patch(`/competitions/${id}`, { settings, ...rest }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competitions"] }),
  });
}

export function useUpdateScoringRules() {
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      exact_score_points: number;
      winner_points: number;
      wrong_points: number;
    }) => api.put(`/competitions/${id}/scoring`, body),
  });
}

export function useUpdatePrizeDistribution() {
  return useMutation({
    mutationFn: ({
      id,
      places,
    }: {
      id: string;
      places: { place: number; percent: number }[];
    }) => api.put(`/competitions/${id}/prizes`, { places }),
  });
}

export function useUpdatePaymentSettings() {
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      contact_name?: string | null;
      phone?: string | null;
      instructions_text?: string | null;
    }) => api.put(`/competitions/${id}/payment`, body),
  });
}

export function useAssignCompetitionAdmin() {
  return useMutation({
    mutationFn: ({
      competitionId,
      user_id,
      role = "co_admin",
    }: {
      competitionId: string;
      user_id: string;
      role?: string;
    }) => api.post(`/competitions/${competitionId}/admins`, { user_id, role }),
  });
}
