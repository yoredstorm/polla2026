/** Compare predicted score pairs for duplicate-detection across bets on one fixture. */

export interface PredictionScore {
  predicted_home_score: number;
  predicted_away_score: number;
}

export function scoresMatch(
  a: PredictionScore,
  home: number,
  away: number,
): boolean {
  return a.predicted_home_score === home && a.predicted_away_score === away;
}

export function predictionExists(
  home: number,
  away: number,
  bets: PredictionScore[],
): boolean {
  return bets.some((b) => scoresMatch(b, home, away));
}

export const DUPLICATE_PREDICTION_MESSAGE =
  "Ya tienes una prediccion con ese marcador en este partido. Cada apuesta debe usar un marcador distinto.";
