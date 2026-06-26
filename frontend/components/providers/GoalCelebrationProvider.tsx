"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { showToastVariant } from "@/components/ui/Toast";
import {
  celebrateGoal,
  formatGoalToastTitle,
} from "@/lib/goalCelebration";
import {
  setGoalScoredHandler,
  triggerGoalScoredEvent,
  type GoalScoredData,
} from "@/lib/realtimeSync";

let goalScoreAnchor: HTMLElement | null = null;

export function setGoalScoreAnchor(el: HTMLElement | null) {
  goalScoreAnchor = el;
}

export function mockGoalScored(data: GoalScoredData) {
  triggerGoalScoredEvent(data);
}

export function GoalCelebrationProvider({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const fixtureId = typeof params?.fixtureId === "string" ? params.fixtureId : null;

  useEffect(() => {
    const handler = async (data: GoalScoredData) => {
      const onFixturePage = fixtureId === data.fixture_id;
      const title = formatGoalToastTitle(data);

      if (onFixturePage) {
        await celebrateGoal("fixture_view", goalScoreAnchor);
        showToastVariant("goal", title);
      } else {
        showToastVariant("goal", title, {
          button: {
            title: "Ver partido",
            onClick: () => router.push(`/fixtures/${data.fixture_id}`),
          },
        });
      }
    };

    setGoalScoredHandler(handler);
    return () => setGoalScoredHandler(null);
  }, [fixtureId, router]);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      (window as Window & { __mockGoal?: typeof mockGoalScored }).__mockGoal = mockGoalScored;
    }
  }, []);

  return children;
}
