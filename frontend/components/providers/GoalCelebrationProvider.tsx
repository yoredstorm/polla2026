"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { handleGoalScoredEvent } from "@/lib/goalCelebration";
import { handleFixtureCheerEvent, preloadTeamCheerAssets } from "@/lib/teamCheer";
import {
  setFixtureCheerHandler,
  setGoalScoredHandler,
  triggerGoalScoredEvent,
  type GoalScoredData,
} from "@/lib/realtimeSync";

export { setGoalScoreAnchor, setViewingFixtureId } from "@/lib/goalCelebration";

export function mockGoalScored(data: GoalScoredData) {
  triggerGoalScoredEvent(data);
}

export function GoalCelebrationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    void preloadTeamCheerAssets();
  }, []);

  useEffect(() => {
    const goalHandler = (data: GoalScoredData) =>
      handleGoalScoredEvent(data, {
        navigate: (path) => router.push(path),
      });

    const cheerHandler = (data: Parameters<typeof handleFixtureCheerEvent>[0]) =>
      handleFixtureCheerEvent(data);

    setGoalScoredHandler(goalHandler);
    setFixtureCheerHandler(cheerHandler);
    return () => {
      setGoalScoredHandler(null);
      setFixtureCheerHandler(null);
    };
  }, [router]);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      (window as Window & { __mockGoal?: typeof mockGoalScored }).__mockGoal = mockGoalScored;
    }
  }, []);

  return children;
}
