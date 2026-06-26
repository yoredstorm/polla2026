import type { GoalScoredData } from "@/lib/realtimeSync";
import { getCelebrationPrefs } from "@/lib/celebrationPrefs";

export type GoalCelebrationContext = "fixture_view" | "global";

let goalAudio: HTMLAudioElement | null = null;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

async function fireConfetti(origin?: { x: number; y: number }) {
  if (prefersReducedMotion()) return;
  const confetti = (await import("canvas-confetti")).default;
  confetti({
    particleCount: origin ? 80 : 40,
    spread: origin ? 70 : 50,
    origin: origin ?? { x: 0.5, y: 0.35 },
    colors: ["#22c55e", "#fbbf24", "#ffffff"],
    disableForReducedMotion: true,
  });
}

export async function fireReducedConfetti() {
  if (prefersReducedMotion()) return;
  const confetti = (await import("canvas-confetti")).default;
  confetti({
    particleCount: 30,
    spread: 40,
    origin: { x: 0.5, y: 0.2 },
    disableForReducedMotion: true,
  });
}

function playGoalSound() {
  const { sound } = getCelebrationPrefs();
  if (!sound) return;
  try {
    if (!goalAudio) {
      goalAudio = new Audio("/sounds/goal.mp3");
      goalAudio.volume = 0.5;
    }
    goalAudio.currentTime = 0;
    void goalAudio.play().catch(() => {});
  } catch {
    // ignore autoplay restrictions
  }
}

function vibrateOnGoal() {
  const { vibration } = getCelebrationPrefs();
  if (!vibration || typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  navigator.vibrate(80);
}

export async function celebrateGoal(
  context: GoalCelebrationContext,
  anchor?: HTMLElement | null,
) {
  if (context === "fixture_view") {
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      const x = (rect.left + rect.width / 2) / window.innerWidth;
      const y = (rect.top + rect.height / 2) / window.innerHeight;
      await fireConfetti({ x, y });
    } else {
      await fireConfetti({ x: 0.5, y: 0.4 });
    }
    playGoalSound();
    vibrateOnGoal();
  }
}

export function formatGoalToastTitle(data: GoalScoredData): string {
  return `¡GOOOOL! ${data.home_team} ${data.home_score} - ${data.away_score} ${data.away_team}`;
}
