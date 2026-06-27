import type { GoalScoredData } from "@/lib/realtimeSync";
import { getCelebrationPrefs } from "@/lib/celebrationPrefs";
import { showToastVariant } from "@/components/ui/Toast";

export type GoalCelebrationContext = "fixture_view" | "global";

type ConfettiOptions = {
  particleCount?: number;
  spread?: number;
  origin?: { x: number; y: number };
  colors?: string[];
  disableForReducedMotion?: boolean;
  zIndex?: number;
};

type ConfettiFn = (options?: ConfettiOptions) => Promise<null> | null;

let goalAudio: HTMLAudioElement | null = null;
let viewingFixtureId: string | null = null;
let goalScoreAnchor: HTMLElement | null = null;
let confettiFire: ConfettiFn | null = null;
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

export function isSingleGoalIncrement(
  prevHome: number,
  prevAway: number,
  newHome: number,
  newAway: number,
): "home" | "away" | null {
  const homeDelta = newHome - prevHome;
  const awayDelta = newAway - prevAway;
  if (homeDelta === 1 && awayDelta === 0) return "home";
  if (awayDelta === 1 && homeDelta === 0) return "away";
  return null;
}

export function buildGoalScoredPayload(
  fixture: {
    id: string;
    home_team: string;
    away_team: string;
  },
  team: "home" | "away",
  homeScore: number,
  awayScore: number,
  prevHome: number,
  prevAway: number,
  minute: number | null = null,
): GoalScoredData {
  return {
    fixture_id: fixture.id,
    team,
    scoring_team_name: team === "home" ? fixture.home_team : fixture.away_team,
    home_team: fixture.home_team,
    away_team: fixture.away_team,
    home_score: homeScore,
    away_score: awayScore,
    previous_home_score: prevHome,
    previous_away_score: prevAway,
    minute,
    recorded_at: new Date().toISOString(),
  };
}

function isOnFixturePage(fixtureId: string): boolean {
  if (!viewingFixtureId) return false;
  return normalizeFixtureId(fixtureId) === viewingFixtureId;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

async function resolveConfetti(): Promise<ConfettiFn | null> {
  if (typeof window === "undefined") return null;
  if (confettiFire) return confettiFire;
  const mod = await import("canvas-confetti");
  const fire = (mod.default ?? mod) as ConfettiFn;
  confettiFire = fire;
  return fire;
}

/** Preload confetti + audio once on app mount. */
export async function preloadGoalCelebrationAssets() {
  if (typeof window === "undefined") return;
  prepareGoalAudio();
  await resolveConfetti();
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
  const confetti = await resolveConfetti();
  if (!confetti) return;
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
  const confetti = await resolveConfetti();
  if (!confetti) return;
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

/** Play sound immediately after admin action (within user-gesture chain). */
export function playGoalSoundInline(fromUserGesture = true) {
  playGoalSound(fromUserGesture);
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
  if (context !== "fixture_view") return;

  try {
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      const x = (rect.left + rect.width / 2) / window.innerWidth;
      const y = (rect.top + rect.height / 2) / window.innerHeight;
      await fireConfetti({ x, y });
    } else {
      await fireConfetti({ x: 0.5, y: 0.4 });
    }
  } catch {
    // confetti must not block toast/audio
  }

  if (!options?.playSoundFromGesture) {
    playGoalSound(false);
  }
  vibrateOnGoal();
}

export function formatGoalToastTitle(data: GoalScoredData): string {
  return `¡GOOOOL! ${data.home_team} ${data.home_score} - ${data.away_score} ${data.away_team}`;
}

export type GoalCelebrationNavigate = (path: string) => void;

function markCelebrated(key: string) {
  lastCelebrationKey = key;
  lastCelebrationAt = Date.now();
}

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
  const skipDedupe = options?.forceCelebrate === true;

  if (!skipDedupe && key === lastCelebrationKey && now - lastCelebrationAt < DEDUPE_MS) {
    return;
  }
  markCelebrated(key);

  const onFixturePage = options?.forceCelebrate ?? isOnFixturePage(data.fixture_id);
  const title = formatGoalToastTitle(data);

  if (onFixturePage) {
    try {
      await celebrateGoal("fixture_view", options?.anchor ?? goalScoreAnchor, {
        playSoundFromGesture: options?.fromLocalAction,
      });
    } catch {
      // toast still shown below
    }
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
