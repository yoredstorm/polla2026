import type { BadgeOut } from "@/types/api";

export type BadgeCategory = "bets" | "challenges" | "ranking" | "social" | "all";

export interface BadgeCatalogEntry extends BadgeOut {
  category: Exclude<BadgeCategory, "all">;
  hint?: string;
}

export const BADGE_STYLES: Record<string, string> = {
  oracle: "from-violet-600/30 to-violet-900/20 border-violet-500/40",
  invicto: "from-emerald-600/30 to-emerald-900/20 border-emerald-500/40",
  madrugador: "from-sky-600/30 to-sky-900/20 border-sky-500/40",
  snaiper: "from-rose-600/30 to-rose-900/20 border-rose-500/40",
  relampago: "from-yellow-600/30 to-yellow-900/20 border-yellow-500/40",
  challenge_king: "from-amber-600/35 to-amber-900/20 border-amber-500/50",
  challenge_cursed: "from-red-700/25 to-red-900/15 border-red-500/35",
  podium: "from-yellow-500/35 to-amber-900/25 border-yellow-400/50",
  hat_trick: "from-orange-600/30 to-orange-900/20 border-orange-500/40",
  comentarista: "from-teal-600/30 to-teal-900/20 border-teal-500/40",
  reaccionador: "from-pink-600/30 to-pink-900/20 border-pink-500/40",
  mencion_magnetica: "from-fuchsia-600/30 to-fuchsia-900/20 border-fuchsia-500/40",
  polemico: "from-slate-600/30 to-slate-900/20 border-slate-500/40",
};

/** Compact chip styles for inline badges (leaderboard rows, lists). */
export const BADGE_CHIP_CLASSES: Record<string, string> = {
  oracle: "bg-violet-500/20 text-violet-200 border-violet-500/30",
  invicto: "bg-emerald-500/20 text-emerald-200 border-emerald-500/30",
  madrugador: "bg-sky-500/20 text-sky-200 border-sky-500/30",
  snaiper: "bg-rose-500/20 text-rose-200 border-rose-500/30",
  relampago: "bg-yellow-500/20 text-yellow-200 border-yellow-500/30",
  challenge_king: "bg-amber-500/25 text-amber-100 border-amber-500/40",
  challenge_cursed: "bg-red-500/15 text-red-200 border-red-500/30",
  podium: "bg-yellow-500/25 text-yellow-100 border-yellow-500/40",
  hat_trick: "bg-orange-500/20 text-orange-200 border-orange-500/30",
  comentarista: "bg-teal-500/20 text-teal-200 border-teal-500/30",
  reaccionador: "bg-pink-500/20 text-pink-200 border-pink-500/30",
  mencion_magnetica: "bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/30",
  polemico: "bg-slate-500/20 text-slate-200 border-slate-500/30",
};

export function getBadgeChipClass(badgeId: string): string {
  return BADGE_CHIP_CLASSES[badgeId] ?? "bg-white/10 text-muted border-white/15";
}

export const BADGE_EMOJI: Record<string, string> = {
  oracle: "🔮",
  invicto: "🛡️",
  madrugador: "🌅",
  snaiper: "🎯",
  relampago: "⚡",
  challenge_king: "👑",
  challenge_cursed: "💀",
  podium: "🏆",
  hat_trick: "⚽",
  comentarista: "💬",
  reaccionador: "👏",
  mencion_magnetica: "🧲",
  polemico: "🔥",
};

export const CATEGORY_LABELS: Record<Exclude<BadgeCategory, "all">, string> = {
  bets: "Pronósticos",
  challenges: "Retos 1v1",
  ranking: "Ranking",
  social: "Comunidad",
};
