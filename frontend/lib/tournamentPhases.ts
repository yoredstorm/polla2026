export const TOURNAMENT_PHASES = [
  { key: "groups", label: "Grupos" },
  { key: "round_of_32", label: "16vos" },
  { key: "round_of_16", label: "8vos" },
  { key: "quarterfinal", label: "Cuartos" },
  { key: "semifinal", label: "Semifinal" },
  { key: "third_place", label: "3er puesto" },
  { key: "final", label: "Final" },
] as const;

export type TournamentPhaseKey = (typeof TOURNAMENT_PHASES)[number]["key"];
