"use client";
import { useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { HelpSectionTitle } from "@/components/features/help/HelpSectionTitle";
import { HelpTooltip } from "@/components/features/help/HelpTooltip";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { LeaderboardListSkeleton } from "@/components/ui/Skeleton";
import { useGlobalLeaderboard, useWeeklyLeaderboard, type LeaderboardSort } from "@/hooks/useLeaderboard";
import { useActivePolla, useTournamentProgress } from "@/hooks/useGroups";
import { PhaseHistoryPanel } from "@/components/features/dashboard/PhaseHistoryPanel";
import { useAuth } from "@/hooks/useAuth";
import { StaggerItem } from "@/components/ui/StaggerItem";
import { useMyRival } from "@/hooks/useRival";
import { Card } from "@/components/ui/Card";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/utils";
import type { LeaderboardEntry } from "@/types/api";
import { LeaderboardPodium } from "@/components/features/leaderboard/LeaderboardPodium";
import { TabPill } from "@/components/ui/TabPill";
import { QueryState } from "@/components/ui/QueryState";

const PAGE_SIZE = 20;
const MIN_WAGERS = 1;

// ── Podium card heights por posición ──────────────────────────────
const PODIUM_CONFIG = [
  { order: 2, height: "h-[160px]", medal: "🥇", ringColor: "ring-yellow-400/60 shadow-yellow-400/20", borderColor: "border-yellow-500/50", bg: "bg-yellow-500/8" },
  { order: 1, height: "h-[130px]", medal: "🥈", ringColor: "ring-zinc-400/50 shadow-zinc-400/10", borderColor: "border-zinc-400/35", bg: "bg-white/[0.04]" },
  { order: 3, height: "h-[110px]", medal: "🥉", ringColor: "ring-amber-600/50 shadow-amber-600/10", borderColor: "border-amber-700/40", bg: "bg-amber-900/10" },
] as const;


// ── Tabla general paginada ────────────────────────────────────────
function LeaderboardTable({
  entries,
  currentUserId,
  page,
  pageSize,
}: {
  entries: LeaderboardEntry[];
  currentUserId?: string;
  page: number;
  pageSize: number;
}) {
  const rankOffset = (page - 1) * pageSize;

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[2rem_1fr_3.5rem_3.5rem_4rem] gap-x-2 px-3 py-2 bg-white/[0.04] border-b border-white/10 text-[10px] uppercase tracking-wider text-muted/60">
        <span>#</span>
        <span>Jugador</span>
        <span className="text-right">Apuestas</span>
        <span className="text-right">Acierto</span>
        <span className="text-right">Puntos</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-white/[0.06]">
        {entries.map((entry, i) => {
          const rank = rankOffset + i + 1;
          const isMe = entry.user_id === currentUserId;
          const rankEmoji =
            rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;

          return (
            <StaggerItem
              key={entry.user_id}
              index={Math.min(i, 12)}
              className={cn(
                "grid grid-cols-[2rem_1fr_3.5rem_3.5rem_4rem] gap-x-2 px-3 py-2.5 items-center text-sm transition-[background-color,transform] duration-fast ease-entrance hover:-translate-y-px",
                isMe ? "bg-accent/8 hover:bg-accent/12" : "hover:bg-white/[0.03]",
              )}
            >
              {/* Rank */}
              <span className={cn(
                "font-display text-center text-sm shrink-0",
                rank === 1 ? "text-yellow-400" : rank === 2 ? "text-zinc-300" : rank === 3 ? "text-amber-600" : "text-muted/50",
              )}>
                {rankEmoji ?? rank}
              </span>

              {/* Player */}
              <div className="flex items-center gap-2 min-w-0">
                <UserAvatar
                  username={entry.username}
                  avatarDisplay={entry.avatar_display}
                  size="sm"
                />
                <Link href={`/u/${encodeURIComponent(entry.username)}`} className="min-w-0 group">
                  <UserDisplayName
                    username={entry.username}
                    firstName={entry.first_name}
                    lastName={entry.last_name}
                    layout="stack"
                    nameClassName={cn("text-xs group-hover:text-accent transition-colors", isMe && "text-accent")}
                    usernameClassName="text-[10px]"
                  />
                </Link>
                {isMe && (
                  <span className="text-[9px] text-accent bg-accent/15 px-1 py-0.5 rounded shrink-0">Tú</span>
                )}
              </div>

              {/* Bets */}
              <span className="text-right text-xs text-muted tabular-nums">
                {entry.total_bets}
              </span>

              {/* Accuracy */}
              <span className="text-right text-xs text-muted tabular-nums">
                {entry.accuracy_pct}%
              </span>

              {/* Points */}
              <span className={cn(
                "text-right font-display font-bold tabular-nums",
                isMe ? "text-accent" : rank <= 3 ? "text-white" : "text-white/80",
              )}>
                {entry.total_points}
                <span className="text-[9px] font-normal text-muted ml-0.5">pts</span>
              </span>
            </StaggerItem>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────
export default function LeaderboardPage() {
  const [view, setView] = useState<"global" | "weekly">("global");
  const [displayMode, setDisplayMode] = useState<"top3" | "tabla">("top3");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<LeaderboardSort>("points");
  const { user } = useAuth();
  const { data: rivalData } = useMyRival(!!user);
  const { data: polla } = useActivePolla();
  const {
    data: tournamentProgress,
    isLoading: progressLoading,
    isError: progressError,
    refetch: refetchProgress,
  } = useTournamentProgress();
  const currency = polla?.currency ?? "PEN";

  const {
    data: global,
    isLoading: globalLoading,
    isError: globalError,
    refetch: refetchGlobal,
  } = useGlobalLeaderboard(page, PAGE_SIZE, sort, MIN_WAGERS);
  const {
    data: weekly,
    isLoading: weeklyLoading,
    isError: weeklyError,
    refetch: refetchWeekly,
  } = useWeeklyLeaderboard(page, PAGE_SIZE, sort, MIN_WAGERS);

  const data = view === "global" ? global : weekly;
  const isLoading = view === "global" ? globalLoading : weeklyLoading;
  const isError = view === "global" ? globalError : weeklyError;
  const refetchLeaderboard = view === "global" ? refetchGlobal : refetchWeekly;

  return (
    <PageShell maxWidth="md">
      {rivalData?.rival && (
        <Card className="mb-6 p-4 border-warning/25 bg-warning/5">
          <p className="text-xs text-warning/80 uppercase tracking-wide mb-1">Rival frecuente</p>
          <UserDisplayName
            username={rivalData.rival.opponent_username ?? "?"}
            firstName={rivalData.rival.opponent_first_name}
            lastName={rivalData.rival.opponent_last_name}
            className="font-display text-xl"
          />
          <p className="text-sm text-muted mt-1">
            Historial: {rivalData.rival.wins} victorias, {rivalData.rival.losses} derrotas
            {rivalData.rival.draws > 0 ? `, ${rivalData.rival.draws} empates` : ""}
          </p>
        </Card>
      )}

      {(tournamentProgress?.phase_winners?.length ?? 0) > 0 && (
        <Card className="mb-6 p-4">
          <PhaseHistoryPanel
            phases={tournamentProgress!.phase_winners}
            currency={currency}
            currentPhaseKey={tournamentProgress?.current_phase_key}
            isLoading={progressLoading}
            isError={progressError}
            onRetry={() => void refetchProgress()}
          />
        </Card>
      )}

      {/* ── Título + filtros período ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
        <HelpSectionTitle as="h1" helpKey="page.leaderboard">
          Ranking
        </HelpSectionTitle>
        <div className="flex flex-wrap gap-2 items-center">
          <HelpTooltip helpKey="page.leaderboard.period" label="Período del ranking" />
          <Chip active={view === "global"} onClick={() => { setView("global"); setPage(1); }}>
            Global
          </Chip>
          <Chip active={view === "weekly"} onClick={() => { setView("weekly"); setPage(1); }}>
            Esta semana
          </Chip>
        </div>
      </div>

      {/* ── Ordenar ── */}
      <div className="flex flex-wrap gap-2 mb-2">
        <span className="text-xs text-muted self-center mr-2 inline-flex items-center gap-1">
          Ordenar por
          <HelpTooltip helpKey="page.leaderboard.sort" label="Orden del ranking" />
        </span>
        <Chip active={sort === "points"} onClick={() => { setSort("points"); setPage(1); }} className="!px-3 !py-1.5 !text-xs">
          Puntos
        </Chip>
        <Chip active={sort === "accuracy"} onClick={() => { setSort("accuracy"); setPage(1); }} className="!px-3 !py-1.5 !text-xs">
          % acierto
        </Chip>
        <Chip active={sort === "bets"} onClick={() => { setSort("bets"); setPage(1); }} className="!px-3 !py-1.5 !text-xs">
          Más apuestas
        </Chip>
      </div>
      <p className="text-xs text-muted mb-5">
        Mínimo {MIN_WAGERS} apuesta(s) registrada(s). El % acierto usa solo apuestas liquidadas.
      </p>

      <TabPill
        layoutId="leaderboard-display-mode"
        className="mb-6 w-fit"
        items={[
          { id: "top3", label: "🏆 Podio" },
          { id: "tabla", label: "Tabla general" },
        ]}
        value={displayMode}
        onChange={setDisplayMode}
      />

      {/* ── Contenido ── */}
      <QueryState
        isLoading={isLoading}
        isError={isError}
        isEmpty={!data?.length}
        onRetry={() => refetchLeaderboard()}
        errorMessage="No se pudo cargar el ranking."
        loadingSlot={<LeaderboardListSkeleton count={6} />}
        emptySlot={<p className="text-muted text-center py-20">Sin datos de ranking aún</p>}
      >
      {displayMode === "top3" ? (
         <>
          <LeaderboardPodium entries={data ?? []} currentUserId={user?.id} />
        </>
      ) : (
        <>
          <LeaderboardTable
            entries={data ?? []}
            currentUserId={user?.id}
            page={page}
            pageSize={PAGE_SIZE}
          />
          <div className="flex justify-center gap-3 mt-6">
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <span className="px-4 py-2 text-muted self-center text-sm">Página {page}</span>
            <Button
              variant="secondary"
              size="sm"
              disabled={!data || data.length < PAGE_SIZE}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </>
      )}
      </QueryState>

    </PageShell>
  );
}