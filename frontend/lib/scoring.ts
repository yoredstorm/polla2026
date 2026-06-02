/** Points awarded per prediction (must match backend). */
export const EXACT_POINTS = 2;
export const WINNER_POINTS = 1;
export const MISS_POINTS = 0;

export function isExactScorePoints(points: number | null): boolean {
  return points === EXACT_POINTS;
}
