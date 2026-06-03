"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { subscribeMarqueeChanged } from "@/lib/marqueeSync";
import type { SiteMarqueePublic } from "@/types/api";

export function siteMarqueeQueryKey() {
  return ["site", "marquee"] as const;
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

/** Refetch while tab is visible so admin edits propagate without manual reload. */
const MARQUEE_REFETCH_MS = 12_000;

export function useSiteMarquee() {
  const qc = useQueryClient();

  useEffect(() => {
    return subscribeMarqueeChanged(() => {
      void qc.invalidateQueries({
        queryKey: siteMarqueeQueryKey(),
        refetchType: "active",
      });
    });
  }, [qc]);

  return useQuery({
    queryKey: siteMarqueeQueryKey(),
    queryFn: () =>
      api.get<SiteMarqueePublic>("/site/marquee", undefined, { cache: "no-store" }),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchInterval: MARQUEE_REFETCH_MS,
    refetchIntervalInBackground: false,
  });
}
