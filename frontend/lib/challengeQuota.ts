export interface ChallengeQuotaData {
  daily_limit?: number | null;
  daily_used?: number;
  daily_remaining?: number | null;
  tournament_limit?: number | null;
  tournament_used?: number;
  tournament_remaining?: number | null;
  daily_resets_at?: string | null;
  timezone?: string | null;
}

export function hasChallengeQuotaLimits(q: ChallengeQuotaData | undefined): boolean {
  if (!q) return false;
  return (q.daily_limit != null && q.daily_limit > 0) || (q.tournament_limit != null && q.tournament_limit > 0);
}

export function isChallengeQuotaExhausted(q: ChallengeQuotaData | undefined): boolean {
  if (!q) return false;
  if (q.daily_remaining != null && q.daily_remaining <= 0) return true;
  if (q.tournament_remaining != null && q.tournament_remaining <= 0) return true;
  return false;
}

export function challengeQuotaExhaustedMessage(q: ChallengeQuotaData | undefined): string | null {
  if (!q) return null;
  if (q.daily_remaining != null && q.daily_remaining <= 0) {
    return "Agotaste tus retos de hoy. Se reinician a medianoche.";
  }
  if (q.tournament_remaining != null && q.tournament_remaining <= 0) {
    return "Agotaste tus retos del mundial.";
  }
  return null;
}
