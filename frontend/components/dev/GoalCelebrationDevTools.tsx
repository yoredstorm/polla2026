"use client";

import { mockGoalScored } from "@/components/providers/GoalCelebrationProvider";
import type { GoalScoredData } from "@/lib/realtimeSync";

const SAMPLE_GOAL: GoalScoredData = {
  fixture_id: "00000000-0000-0000-0000-000000000001",
  team: "home",
  scoring_team_name: "Perú",
  home_team: "Perú",
  away_team: "Brasil",
  home_score: 2,
  away_score: 1,
  previous_home_score: 1,
  previous_away_score: 1,
  minute: 67,
  recorded_at: new Date().toISOString(),
};

export function GoalCelebrationDevTools({ fixtureId }: { fixtureId?: string }) {
  if (process.env.NODE_ENV !== "development") return null;

  return (
    <div className="mt-4 p-3 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5">
      <p className="text-xs text-amber-200 mb-2">Dev: simular gol</p>
      <button
        type="button"
        className="text-xs px-3 py-1.5 rounded bg-amber-500/20 text-amber-100 hover:bg-amber-500/30"
        onClick={() =>
          mockGoalScored({
            ...SAMPLE_GOAL,
            fixture_id: fixtureId ?? SAMPLE_GOAL.fixture_id,
          })
        }
      >
        Disparar goal_scored
      </button>
    </div>
  );
}
