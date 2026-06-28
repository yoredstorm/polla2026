"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { subscribeMarqueeChanged } from "@/lib/marqueeSync";
import type { SiteMarqueePublic } from "@/types/api";

export function competitionMarqueeQueryKey(slug: string) {
  return ["competition", slug, "marquee"] as const;
}

/** Same rules as backend public_marquee_payload. */
export function toPublicMarqueeView(admin: {
  enabled: boolean;
  message: string;
}): SiteMarqueePublic {
  const message = (admin.message ?? "").trim();
  const enabled = Boolean(admin.enabled && message);
  return {
    enabled,
    message: enabled ? message : "",
  };
}

/** Slug from /c/{slug}/... routes; null elsewhere. */
export function useRouteCompetitionSlug(): string | null {
  const pathname = usePathname();
  const match = pathname.match(/^\/c\/([^/]+)/);
  return match?.[1] ?? null;
}

const MARQUEE_REFETCH_MS = 12_000;

export function useCompetitionMarquee(slug: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!slug) return;
    return subscribeMarqueeChanged((changedSlug) => {
      if (changedSlug !== slug) return;
      void qc.invalidateQueries({
        queryKey: competitionMarqueeQueryKey(slug),
        refetchType: "active",
      });
    });
  }, [qc, slug]);

  return useQuery({
    queryKey: slug ? competitionMarqueeQueryKey(slug) : ["competition", null, "marquee"],
    queryFn: () =>
      api.get<SiteMarqueePublic>(`/c/${slug}/marquee`, undefined, { cache: "no-store" }),
    enabled: Boolean(slug),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchInterval: MARQUEE_REFETCH_MS,
    refetchIntervalInBackground: false,
  });
}

/** @deprecated Use useCompetitionMarquee with route slug */
export function useSiteMarquee() {
  const slug = useRouteCompetitionSlug();
  return useCompetitionMarquee(slug);
}

/** @deprecated Use competitionMarqueeQueryKey */
export function siteMarqueeQueryKey() {
  return ["site", "marquee"] as const;
}
