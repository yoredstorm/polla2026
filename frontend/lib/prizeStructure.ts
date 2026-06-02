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
