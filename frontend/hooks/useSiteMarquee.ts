"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { SiteMarqueePublic } from "@/types/api";

export function useSiteMarquee() {
  return useQuery({
    queryKey: ["site", "marquee"],
    queryFn: () => api.get<SiteMarqueePublic>("/site/marquee"),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
