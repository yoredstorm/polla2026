"use client";
import Link from "next/link";
import type { Challenge } from "@/hooks/useChallenges";
import { challengeStatusLabel } from "@/lib/challengeUtils";
import { cn } from "@/lib/utils";
import { UserDisplayName } from "@/components/ui/UserDisplayName";

const RESULT_STYLES: Record<string, { label: string; className: string }> = {
  won: { label: "Ganado", className: "bg-emerald-500/20 text-emerald-200 border-emerald-500/30" },
  lost: { label: "Perdido", className: "bg-red-500/15 text-red-200 border-red-500/30" },
  draw: { label: "Empate", className: "bg-white/10 text-muted border-white/15" },
  active: { label: "En juego", className: "bg-accent/20 text-accent border-accent/30" },
  pending: { label: "Pendiente", className: "bg-amber-500/15 text-amber-200 border-amber-500/30" },
  rejected: { label: "Rechazado", className: "bg-white/10 text-muted border-white/15" },
  cancelled: { label: "Cancelado", className: "bg-white/10 text-muted border-white/15" },
};

function formatMatchDate(iso: string | null | undefined) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-PE", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function ChallengeHistoryCard({
  challenge: ch,
  highlight = false,
}: {
  challenge: Challenge;
  highlight?: boolean;
}) {
  const result = ch.duel_result ?? ch.status;
  const resultStyle = RESULT_STYLES[result] ?? {
    label: challengeStatusLabel(ch.status),
    className: "bg-white/10 text-muted border-white/15",
  };
  const delta = ch.ranking_delta;
  const matchLabel =
    ch.fixture_home_team && ch.fixture_away_team
      ? `${ch.fixture_home_team} vs ${ch.fixture_away_team}`
      : "Partido";

  return (
    <div
      className={cn(
        "rounded-xl border bg-glass backdrop-blur-sm p-4 transition-colors duration-200",
        highlight && "border-amber-500/40 ring-1 ring-amber-500/20",
        result === "won" && "border-emerald-500/25",
        result === "lost" && "border-red-500/20",
        result === "active" && "border-accent/30",
        !highlight && result !== "won" && result !== "lost" && result !== "active" && "border-white/10",
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <Link
            href={`/fixtures/${ch.fixture_id}`}
            className="text-sm font-medium text-white hover:text-accent transition-colors truncate block"
          >
            {matchLabel}
          </Link>
          {ch.fixture_match_date && (
            <p className="text-[11px] text-muted mt-0.5">{formatMatchDate(ch.fixture_match_date)}</p>
          )}
        </div>
        <span
          className={cn(
            "text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0 font-medium",
            resultStyle.className,
          )}
        >
          {resultStyle.label}
        </span>
      </div>

      <p className="text-xs text-muted mb-3">
        {ch.is_challenger ? "Retaste a" : "Te retó"}{" "}
        <UserDisplayName
          username={ch.opponent_username ?? "?"}
          firstName={ch.opponent_first_name}
          lastName={ch.opponent_last_name}
          layout="inline"
          showUsername
        />
        {" · "}
        <span className="text-accent font-medium">{ch.stake_points} pts</span> en juego
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {ch.my_fixture_points != null && ch.status === "settled" && (
          <span className="text-muted">
            Tus pts del partido:{" "}
            <span className="text-white font-medium">{ch.my_fixture_points}</span>
          </span>
        )}
        {ch.status === "active" && (
          <span className="text-amber-200/90">Bloqueados al aceptar: −{ch.stake_points} pts c/u</span>
        )}
        {ch.status === "pending_accept" && ch.is_challenger && (
          <span className="text-muted inline-flex items-center gap-1 flex-wrap">
            Esperando que
            <UserDisplayName
              username={ch.opponent_username ?? "?"}
              firstName={ch.opponent_first_name}
              lastName={ch.opponent_last_name}
              layout="inline"
              showUsername
            />
            acepte
          </span>
        )}
        {delta != null && (
          <span
            className={cn(
              "font-display text-base",
              delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-muted",
            )}
          >
            Impacto ranking: {delta > 0 ? "+" : ""}
            {delta} pts
          </span>
        )}
      </div>
    </div>
  );
}
