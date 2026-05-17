"use client";
import { cn } from "@/lib/utils";
import { BADGE_EMOJI, BADGE_STYLES } from "@/lib/badges";
import type { BadgeOut } from "@/types/api";

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
