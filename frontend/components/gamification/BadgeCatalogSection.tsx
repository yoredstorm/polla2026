"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  BADGE_EMOJI,
  BADGE_STYLES,
  CATEGORY_LABELS,
  type BadgeCatalogEntry,
  type BadgeCategory,
} from "@/lib/badges";
import { useBadgeCatalog, useMyBadgeProgress } from "@/hooks/useBadgeCatalog";
import { useAuth } from "@/hooks/useAuth";

const FILTERS: { id: BadgeCategory; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "bets", label: "Pronósticos" },
  { id: "challenges", label: "Retos" },
  { id: "ranking", label: "Ranking" },
];

function CatalogCard({
  badge,
  earned,
}: {
  badge: BadgeCatalogEntry;
  earned: boolean;
}) {
  const style = BADGE_STYLES[badge.id] ?? "from-white/10 to-white/5 border-white/15";
  return (
    <div
      className={cn(
        "relative rounded-xl border bg-gradient-to-br p-4 transition-all",
        style,
        earned ? "ring-1 ring-accent/40 shadow-md shadow-accent/10" : "opacity-75 saturate-[0.45]",
      )}
      title={badge.description}
    >
      {earned ? (
        <span className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent/25 text-accent border border-accent/30">
          Tuya
        </span>
      ) : (
        <span className="absolute top-2 right-2 text-muted/80" aria-hidden>
          🔒
        </span>
      )}
      <p className={cn("text-3xl mb-2", !earned && "grayscale")}>{BADGE_EMOJI[badge.id] ?? "🏅"}</p>
      <p className="text-sm font-semibold text-white pr-12">{badge.label}</p>
      <p className="text-[11px] text-muted mt-1 leading-snug">{badge.description}</p>
      {badge.hint && (
        <p className="text-[10px] text-muted/70 mt-2 italic border-t border-white/10 pt-2">{badge.hint}</p>
      )}
    </div>
  );
}

export function BadgeCatalogSection() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<BadgeCategory>("all");
  const { data: catalogData, isLoading: catalogLoading } = useBadgeCatalog();
  const { data: progress, isLoading: progressLoading } = useMyBadgeProgress(!!user);

  const earnedSet = useMemo(
    () => new Set(progress?.earned_ids ?? []),
    [progress?.earned_ids],
  );

  const badges = catalogData?.badges ?? progress?.badges ?? [];
  const filtered = useMemo(
    () => (filter === "all" ? badges : badges.filter((b) => b.category === filter)),
    [badges, filter],
  );

  const earnedCount = progress?.earned_count ?? 0;
  const totalCount = progress?.total_count ?? badges.length;
  const isLoading = catalogLoading || (!!user && progressLoading);

  return (
    <section
      id="medallas"
      className="mt-10 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-6 sm:p-8 scroll-mt-24"
    >
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-accent mb-1">Colección</p>
          <h2 className="font-display text-2xl sm:text-3xl text-white">Medallas del torneo</h2>
          <p className="text-sm text-muted mt-2 max-w-2xl">
            Desbloquea medallas apostando partidos, ganando duelos en{" "}
            <span className="text-white/80">Te reto</span> o escalando el ranking. Las grises aún te
            esperan.
          </p>
        </div>
        {user && !isLoading && (
          <div className="shrink-0 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-center">
            <p className="text-xs text-muted uppercase tracking-wide">Tu progreso</p>
            <p className="font-display text-3xl text-accent">
              {earnedCount}
              <span className="text-lg text-muted">/{totalCount}</span>
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              filter === f.id
                ? "bg-accent text-background"
                : "bg-white/5 text-muted hover:bg-white/10 hover:text-white",
            )}
          >
            {f.label}
            {f.id !== "all" && (
              <span className="ml-1 opacity-70">
                ({badges.filter((b) => b.category === f.id).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-36 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((badge) => (
            <CatalogCard key={badge.id} badge={badge} earned={earnedSet.has(badge.id)} />
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-white/10">
        <p className="text-xs text-muted">
          {filter !== "all" && CATEGORY_LABELS[filter as Exclude<BadgeCategory, "all">]}
          {filter !== "all" && " · "}
          Consejo: en cada partido puedes retar a quien ya apostó desde la ficha del encuentro.
        </p>
        {user ? (
          <Link
            href="/profile"
            className="text-sm text-accent hover:underline shrink-0 text-center sm:text-right"
          >
            Ver solo las tuyas en perfil →
          </Link>
        ) : (
          <Link href="/login" className="text-sm text-accent hover:underline shrink-0">
            Inicia sesión para ver tu progreso →
          </Link>
        )}
      </div>
    </section>
  );
}
