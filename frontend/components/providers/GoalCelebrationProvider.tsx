"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  handleGoalScoredEvent,
  preloadGoalCelebrationAssets,
} from "@/lib/goalCelebration";
import {
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
    void preloadGoalCelebrationAssets();
  }, []);

  useEffect(() => {
    const handler = (data: GoalScoredData) =>
      handleGoalScoredEvent(data, {
        navigate: (path) => router.push(path),
      });

    setGoalScoredHandler(handler);
    return () => setGoalScoredHandler(null);
  }, [router]);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      (window as Window & { __mockGoal?: typeof mockGoalScored }).__mockGoal = mockGoalScored;
    }
  }, []);

  return children;
}
