import {
  getViewingFixtureId,
  normalizeFixtureId,
  preloadGoalCelebrationAssets,
} from "@/lib/goalCelebration";

export type FixtureCheerTeam = "home" | "away";

export type FixtureCheerData = {
  fixture_id: string;
  team: FixtureCheerTeam;
  home_team: string;
  away_team: string;
};

type ConfettiOptions = {
  particleCount?: number;
  spread?: number;
  angle?: number;
  origin?: { x: number; y: number };
  colors?: string[];
  disableForReducedMotion?: boolean;
  zIndex?: number;
};

type ConfettiFn = (options?: ConfettiOptions) => Promise<null> | null;

type ConfettiModule = {
  create: (
    canvas?: HTMLCanvasElement | null,
    globalOpts?: {
      useWorker?: boolean;
      resize?: boolean;
      disableForReducedMotion?: boolean;
    },
  ) => ConfettiFn;
};

const CONFETTI_BASE: ConfettiOptions = {
  disableForReducedMotion: true,
  zIndex: 9998,
};

let confettiFire: ConfettiFn | null = null;
let lastCheerKey = "";
let lastCheerAt = 0;

const CHEER_DEDUPE_MS = 400;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

async function resolveConfetti(): Promise<ConfettiFn | null> {
  if (typeof window === "undefined") return null;
  if (confettiFire) return confettiFire;
  const mod = await import("canvas-confetti");
  const pkg = (mod.default ?? mod) as ConfettiModule;
  confettiFire = pkg.create(null, {
    useWorker: false,
    resize: true,
    disableForReducedMotion: true,
  });
  return confettiFire;
}

export async function preloadTeamCheerAssets() {
  await preloadGoalCelebrationAssets();
}

export async function fireTeamSupportConfetti(team: FixtureCheerTeam) {
  if (prefersReducedMotion()) return;
  const confetti = await resolveConfetti();
  if (!confetti) return;

  const isHome = team === "home";
  confetti({
    ...CONFETTI_BASE,
    particleCount: 35,
    spread: 55,
    angle: isHome ? 60 : 120,
    origin: isHome ? { x: 0.12, y: 0.38 } : { x: 0.88, y: 0.38 },
    colors: ["#22c55e", "#fbbf24", "#ffffff", "#3b82f6"],
  });
}

export function handleFixtureCheerEvent(
  data: FixtureCheerData,
  options?: { fromLocal?: boolean },
) {
  const viewingId = getViewingFixtureId();
  if (!viewingId || normalizeFixtureId(data.fixture_id) !== viewingId) {
    return;
  }

  const key = `${normalizeFixtureId(data.fixture_id)}:${data.team}`;
  const now = Date.now();
  if (
    !options?.fromLocal &&
    key === lastCheerKey &&
    now - lastCheerAt < CHEER_DEDUPE_MS
  ) {
    return;
  }
  lastCheerKey = key;
  lastCheerAt = now;

  void fireTeamSupportConfetti(data.team);
}
