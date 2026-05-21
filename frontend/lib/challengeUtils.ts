export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "error" in err) {
    const e = (err as { error?: { message?: string; code?: string } }).error;
    if (e?.message) return e.message;
    if (e?.code === "DAILY_CHALLENGE_LIMIT") {
      return "Agotaste tus retos de hoy. Se reinician a medianoche.";
    }
    if (e?.code === "TOURNAMENT_CHALLENGE_LIMIT") {
      return "Agotaste tus retos del mundial.";
    }
  }
  return fallback;
}

export const CHALLENGE_RULES = {
  betTitle: "Apuesta del partido (ranking global)",
  betLines: [
    "Marcador exacto: 2 pts",
    "Solo ganador del partido: 1 pt",
    "Fallaste: 0 pts",
  ],
  duelTitle: "Reto 1v1 (bolsa entre ustedes)",
  duelLines: [
    "Al aceptar, cada uno bloquea los puntos apostados de su ranking (se restan del total).",
    "Al cerrar el partido se comparan solo los puntos de este partido (0, 1 o 2).",
    "Gana el duelo quien tuvo mas puntos en ese partido; el ganador recibe 2× la apuesta + sus pts del partido.",
    "El perdedor no suma pts del partido al ranking (ya perdio la apuesta del reto).",
    "Empate en el partido: cada uno recupera su apuesta + sus pts del partido.",
    "El organizador puede limitar cuantos retos puedes enviar por dia y en todo el mundial.",
  ],
} as const;

export function maxStakeForUser(
  available: number,
  maxStake: number,
  maxByBalance?: number,
): number {
  const halfCap = maxByBalance ?? Math.max(1, Math.floor(available / 2));
  return Math.max(0, Math.min(available, maxStake, halfCap));
}

export function challengeStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending_accept: "Esperando respuesta",
    active: "En juego",
    settled: "Finalizado",
    rejected: "Rechazado",
    cancelled: "Cancelado",
  };
  return map[status] ?? status;
}
