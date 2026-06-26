"use client";

import { useEffect, useRef } from "react";
import { useFixtures, useLiveFixtures } from "@/hooks/useFixtures";
import { getCelebrationPrefs } from "@/lib/celebrationPrefs";
import { fireReducedConfetti } from "@/lib/goalCelebration";

export function DashboardFavoriteWelcome() {
  const fired = useRef(false);
  const { data: live } = useLiveFixtures();
  const { data: scheduled } = useFixtures({ status: "scheduled", limit: 50 });

  useEffect(() => {
    if (fired.current) return;
    const favorite = getCelebrationPrefs().favoriteTeam;
    if (!favorite) return;

    const today = new Date().toDateString();
    const all = [...(live ?? []), ...(scheduled?.data ?? [])];
    const hasFavoriteMatchToday = all.some((f) => {
      const matchDay = new Date(f.match_date).toDateString();
      const involvesFavorite =
        f.home_team === favorite || f.away_team === favorite;
      return involvesFavorite && (matchDay === today || f.status === "live");
    });

    if (hasFavoriteMatchToday) {
      fired.current = true;
      void fireReducedConfetti();
    }
  }, [live, scheduled]);

  return null;
}
