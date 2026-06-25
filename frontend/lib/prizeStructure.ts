import type { ActivePolla } from "@/types/api";

export type PrizeStructureMode =
  | "single_tournament"
  | "groups_knockout"
  | "full_milestones";

export const PRIZE_STRUCTURE_OPTIONS: {
  value: PrizeStructureMode;
  title: string;
  description: string;
}[] = [
  {
    value: "single_tournament",
    title: "Un ganador — mundial completo",
    description:
      "Un solo pago al inicio. Un ganador cuando terminen todos los partidos. Sin reinscripciones.",
  },
  {
    value: "groups_knockout",
    title: "Dos ganadores — grupos + eliminatorias",
    description:
      "Pago al inicio de grupos y otro al pasar a eliminatorias (16vos hasta la final).",
  },
  {
    value: "full_milestones",
    title: "Siete hitos FIFA",
    description:
      "Grupos, 16vos, 8vos, cuartos, semifinal, 3er puesto y final. Pago al inicio de cada hito.",
  },
];

export function prizeStructureModeLabel(mode: string | undefined): string {
  return (
    PRIZE_STRUCTURE_OPTIONS.find((o) => o.value === mode)?.title ??
    "Siete hitos FIFA"
  );
}

export function firstPhaseKeyForMode(mode: string | undefined): string {
  if (mode === "single_tournament") return "tournament";
  return "groups";
}

export function showsReinscriptionPanel(
  mode: string | undefined,
  currentPhaseKey: string | undefined,
): boolean {
  if (!currentPhaseKey) return false;
  if (mode === "single_tournament") return false;
  return currentPhaseKey !== firstPhaseKeyForMode(mode);
}

/** Admin panel for next-phase proofs while the current phase is still active. */
export function showsEarlyEnrollmentPanel(
  mode: string | undefined,
  currentPhaseKey: string | undefined,
): boolean {
  if (!currentPhaseKey) return false;
  if (mode === "single_tournament") return false;
  return currentPhaseKey === firstPhaseKeyForMode(mode);
}

export function pollaNeedsPaymentAction(polla: ActivePolla): boolean {
  if (!polla.is_member) {
    return true;
  }
  return (
    !!polla.payment_target_phase_key &&
    polla.phase_enrollment_status !== "confirmed"
  );
}

export function fixtureEffectivePhaseKey(
  fixture: { group_name?: string | null; round?: string | null },
  mode: PrizeStructureMode | undefined,
): string {
  if (mode === "single_tournament") return "tournament";
  if (mode === "groups_knockout") {
    return fixture.group_name ? "groups" : "knockout";
  }
  if (fixture.group_name) return "groups";
  const round = fixture.round ?? "";
  if (round.includes("Round of 32") || round.includes("32")) return "round_of_32";
  if (round.includes("Round of 16") || round.includes("16")) return "round_of_16";
  if (round.includes("Quarter")) return "quarterfinal";
  if (round.includes("Semi")) return "semifinal";
  if (round.toLowerCase().includes("third")) return "third_place";
  if (round === "Final") return "final";
  return "groups";
}

export function needsPaymentBlockForFixture(
  polla: ActivePolla,
  fixture: { group_name?: string | null; round?: string | null },
): boolean {
  if (!polla.is_member) return true;
  const fixturePhase = fixtureEffectivePhaseKey(fixture, polla.prize_structure_mode);
  const currentPhase = polla.current_phase_key ?? firstPhaseKeyForMode(polla.prize_structure_mode);
  if (fixturePhase !== currentPhase) return false;
  if (!pollaNeedsPaymentAction(polla)) return false;
  return polla.payment_target_phase_key === currentPhase;
}

export function phaseWinnersDescription(mode: string | undefined): string {
  switch (mode) {
    case "single_tournament":
      return "Un hito: mundial completo. Al terminar todos los partidos se registra el ganador y el pozo de la fase.";
    case "groups_knockout":
      return "Dos fases: grupos y eliminatorias (16vos a la final). Al cerrar cada una se registra el ganador, se reinician puntos y pozo, y hay que pagar de nuevo para la siguiente.";
    default:
      return "Siete fases: grupos, 16vos, 8vos, cuartos, semifinal, 3er puesto y final. Al cerrar cada una se registra el ganador y se reinician puntos y pozo para el siguiente hito.";
  }
}
