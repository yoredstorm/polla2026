import type { GoalScoredData } from "@/lib/realtimeSync";
import { getCelebrationPrefs } from "@/lib/celebrationPrefs";
import { showToastVariant } from "@/components/ui/Toast";

export type GoalCelebrationContext = "fixture_view" | "global";

let goalAudio: HTMLAudioElement | null = null;
let viewingFixtureId: string | null = null;
let goalScoreAnchor: HTMLElement | null = null;
let lastCelebrationKey = "";
let lastCelebrationAt = 0;

const DEDUPE_MS = 2500;

export function setGoalScoreAnchor(el: HTMLElement | null) {
  goalScoreAnchor = el;
}

export function setViewingFixtureId(id: string | null) {
  viewingFixtureId = id ? normalizeFixtureId(id) : null;
}

export function getViewingFixtureId(): string | null {
  return viewingFixtureId;
}

export function normalizeFixtureId(id: string): string {
  return id.trim().toLowerCase();
}

function isOnFixturePage(fixtureId: string): boolean {
  if (!viewingFixtureId) return false;
  return normalizeFixtureId(fixtureId) === viewingFixtureId;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Call on user gesture (goal button) so autoplay is allowed later. */
export function prepareGoalAudio() {
  if (typeof window === "undefined") return;
  try {
    if (!goalAudio) {
      goalAudio = new Audio("/sounds/goal.mp3");
      goalAudio.volume = 0.5;
      goalAudio.preload = "auto";
    }
    goalAudio.load();
  } catch {
    // ignore
  }
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
    zIndex: 9999,
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
    zIndex: 9999,
  });
}

function playGoalSound(fromUserGesture = false) {
  const { sound } = getCelebrationPrefs();
  if (!sound && !fromUserGesture) return;
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
  options?: { playSoundFromGesture?: boolean },
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
    playGoalSound(Boolean(options?.playSoundFromGesture));
    vibrateOnGoal();
  }
}

export function formatGoalToastTitle(data: GoalScoredData): string {
  return `¡GOOOOL! ${data.home_team} ${data.home_score} - ${data.away_score} ${data.away_team}`;
}

export type GoalCelebrationNavigate = (path: string) => void;

export async function handleGoalScoredEvent(
  data: GoalScoredData,
  options?: {
    anchor?: HTMLElement | null;
    navigate?: GoalCelebrationNavigate;
    /** Admin just clicked — still in user-gesture chain for audio */
    fromLocalAction?: boolean;
    forceCelebrate?: boolean;
  },
) {
  const key = `${normalizeFixtureId(data.fixture_id)}:${data.home_score}:${data.away_score}`;
  const now = Date.now();
  if (key === lastCelebrationKey && now - lastCelebrationAt < DEDUPE_MS) {
    return;
  }
  lastCelebrationKey = key;
  lastCelebrationAt = now;

  const onFixturePage = options?.forceCelebrate ?? isOnFixturePage(data.fixture_id);
  const title = formatGoalToastTitle(data);

  if (onFixturePage) {
    await celebrateGoal("fixture_view", options?.anchor ?? goalScoreAnchor, {
      playSoundFromGesture: options?.fromLocalAction,
    });
    showToastVariant("goal", title);
    return;
  }

  showToastVariant("goal", title, {
    button: {
      title: "Ver partido",
      onClick: () => {
        if (options?.navigate) {
          options.navigate(`/fixtures/${data.fixture_id}`);
        } else {
          window.location.href = `/fixtures/${data.fixture_id}`;
        }
      },
    },
  });
}
