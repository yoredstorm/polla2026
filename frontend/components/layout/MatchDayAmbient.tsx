"use client";

import { useLiveFixtures } from "@/hooks/useFixtures";
import { cn } from "@/lib/utils";

export function MatchDayAmbient({ children }: { children: React.ReactNode }) {
  const { data: live } = useLiveFixtures();
  const hasLive = (live?.length ?? 0) > 0;

  return (
    <div className={cn(hasLive && "header-match-day")}>
      {children}
    </div>
  );
}
