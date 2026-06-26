/** Centralized motion tokens aligned with 12 Principles of Animation (web). */
export const MOTION = {
  duration: {
    fast: 0.15,
    normal: 0.2,
    slow: 0.3,
  },
  ease: {
    entrance: [0, 0, 0.2, 1] as const,
    exit: [0.4, 0, 1, 1] as const,
  },
  stagger: 0.035,
  tap: { scale: 0.98 },
  hover: { scale: 1.02 },
  spring: { type: "spring" as const, stiffness: 500, damping: 30 },
  springSnappy: { type: "spring" as const, stiffness: 400, damping: 17 },
} as const;

export const pageEnter = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
} as const;

export function staggerDelay(index: number): number {
  return index * MOTION.stagger;
}

export function entranceTransition(delay = 0) {
  return {
    duration: MOTION.duration.normal,
    ease: MOTION.ease.entrance,
    delay,
  };
}

export function exitTransition() {
  return {
    duration: MOTION.duration.fast,
    ease: MOTION.ease.exit,
  };
}
