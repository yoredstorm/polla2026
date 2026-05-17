"use client";
import { cn } from "@/lib/utils";
import type { BadgeOut } from "@/types/api";

const BADGE_STYLES: Record<string, string> = {
  oracle: "from-violet-600/30 to-violet-900/20 border-violet-500/40",
  invicto: "from-emerald-600/30 to-emerald-900/20 border-emerald-500/40",
  madrugador: "from-sky-600/30 to-sky-900/20 border-sky-500/40",
  snaiper: "from-rose-600/30 to-rose-900/20 border-rose-500/40",
  relampago: "from-yellow-600/30 to-yellow-900/20 border-yellow-500/40",
  challenge_king: "from-amber-600/35 to-amber-900/20 border-amber-500/50",
  challenge_cursed: "from-red-700/25 to-red-900/15 border-red-500/35",
  podium: "from-yellow-500/35 to-amber-900/25 border-yellow-400/50",
  hat_trick: "from-orange-600/30 to-orange-900/20 border-orange-500/40",
};

const BADGE_EMOJI: Record<string, string> = {
  oracle: "🔮",
  invicto: "🛡️",
  madrugador: "🌅",
  snaiper: "🎯",
  relampago: "⚡",
  challenge_king: "👑",
  challenge_cursed: "💀",
  podium: "🏆",
  hat_trick: "⚽",
};

export function BadgeGrid({ badges, emptyLabel }: { badges: BadgeOut[]; emptyLabel?: string }) {
  if (!badges.length) {
    return emptyLabel ? <p className="text-sm text-muted">{emptyLabel}</p> : null;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {badges.map((b) => (
        <div
          key={b.id}
          title={b.description}
          className={cn(
            "rounded-xl border bg-gradient-to-br p-3 text-center",
            BADGE_STYLES[b.id] ?? "from-white/10 to-white/5 border-white/15",
          )}
        >
          <p className="text-2xl mb-1">{BADGE_EMOJI[b.id] ?? "🏅"}</p>
          <p className="text-sm font-medium text-white">{b.label}</p>
          <p className="text-[10px] text-muted mt-1 line-clamp-2">{b.description}</p>
        </div>
      ))}
    </div>
  );
}
