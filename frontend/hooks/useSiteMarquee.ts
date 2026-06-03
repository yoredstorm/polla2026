"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
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

export function useSiteMarquee() {
  return useQuery({
    queryKey: siteMarqueeQueryKey(),
    queryFn: () =>
      api.get<SiteMarqueePublic>("/site/marquee", undefined, { cache: "no-store" }),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}
