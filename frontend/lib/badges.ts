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
