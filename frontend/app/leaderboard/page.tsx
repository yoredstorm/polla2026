"use client";
import { useState } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { LeaderboardListSkeleton } from "@/components/ui/Skeleton";
import { useGlobalLeaderboard, useWeeklyLeaderboard, type LeaderboardSort } from "@/hooks/useLeaderboard";
import { useAuth } from "@/hooks/useAuth";
import { LeaderboardEntryCard } from "@/components/leaderboard/LeaderboardEntryCard";
import { LeaderboardPodium } from "@/components/leaderboard/LeaderboardPodium";
import { useMyRival } from "@/hooks/useRival";
import { Card } from "@/components/ui/Card";
import { UserDisplayName } from "@/components/ui/UserDisplayName";

const PAGE_SIZE = 20;
const MIN_WAGERS = 1;

export default function LeaderboardPage() {
  const [view, setView] = useState<"global" | "weekly">("global");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<LeaderboardSort>("points");
  const { user } = useAuth();
  const { data: rivalData } = useMyRival(!!user);

  const { data: global, isLoading: globalLoading } = useGlobalLeaderboard(page, PAGE_SIZE, sort, MIN_WAGERS);
  const { data: weekly, isLoading: weeklyLoading } = useWeeklyLeaderboard(page, PAGE_SIZE, sort, MIN_WAGERS);

  const data = view === "global" ? global : weekly;
  const isLoading = view === "global" ? globalLoading : weeklyLoading;
  const rest = data && data.length > 3 ? data.slice(3) : [];

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

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="font-display text-3xl text-white text-glow-accent">Ranking</h1>
        <div className="flex flex-wrap gap-2">
          <Chip active={view === "global"} onClick={() => { setView("global"); setPage(1); }}>
            Global
          </Chip>
          <Chip active={view === "weekly"} onClick={() => { setView("weekly"); setPage(1); }}>
            Esta semana
          </Chip>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-2">
        <span className="text-xs text-muted self-center mr-2">Ordenar por</span>
        <Chip active={sort === "points"} onClick={() => { setSort("points"); setPage(1); }} className="!px-3 !py-1.5 !text-xs">
          Puntos
        </Chip>
        <Chip active={sort === "accuracy"} onClick={() => { setSort("accuracy"); setPage(1); }} className="!px-3 !py-1.5 !text-xs">
          % acierto
        </Chip>
        <Chip active={sort === "bets"} onClick={() => { setSort("bets"); setPage(1); }} className="!px-3 !py-1.5 !text-xs">
          Mas apuestas
        </Chip>
      </div>
      <p className="text-xs text-muted mb-6">
        Minimo {MIN_WAGERS} apuesta(s) registrada(s). El % acierto usa solo apuestas liquidadas.
      </p>

      {isLoading ? (
        <LeaderboardListSkeleton count={6} />
      ) : !data || data.length === 0 ? (
        <p className="text-muted text-center py-20">Sin datos de ranking aun</p>
      ) : (
        <>
          {page === 1 && <LeaderboardPodium entries={data} currentUserId={user?.id} />}
          <div className="space-y-3">
            {(page === 1 ? rest : data).map((entry, i) => (
              <LeaderboardEntryCard
                key={entry.user_id}
                entry={entry}
                isMe={entry.user_id === user?.id}
                rankIndex={page === 1 ? i + 3 : i}
              />
            ))}
          </div>
        </>
      )}

      <div className="flex justify-center gap-3 mt-8">
        <Button
          variant="secondary"
          size="sm"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </Button>
        <span className="px-4 py-2 text-muted self-center">Pagina {page}</span>
        <Button
          variant="secondary"
          size="sm"
          disabled={!data || data.length < PAGE_SIZE}
          onClick={() => setPage((p) => p + 1)}
        >
          Siguiente
        </Button>
      </div>
    </PageShell>
  );
}
