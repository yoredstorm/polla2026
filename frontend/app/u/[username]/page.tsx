"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { HelpTooltip } from "@/components/features/help/HelpTooltip";
import { HelpSectionTitle } from "@/components/features/help/HelpSectionTitle";
import { useAuth } from "@/hooks/useAuth";
import {
  useUserPublicBets,
  useUserSummaryByUsername,
  writeStoredProfileInvite,
  readStoredProfileInvite,
} from "@/hooks/useUserProfile";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { BadgeGrid } from "@/components/features/gamification/BadgeGrid";
import { formatAmount } from "@/lib/utils";
import type { BadgeOut } from "@/types/api";
import { CopyProfileModal } from "@/components/features/betting/CopyProfileModal";
import { FollowButton } from "@/components/features/social/FollowButton";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
import { StaggerItem } from "@/components/ui/StaggerItem";
import { CopyBetDetailModal } from "@/components/features/betting/CopyBetDetailModal";
import type { Bet } from "@/types/api";

export default function UserPublicProfilePage() {
  const params = useParams();
  const username = (params.username as string) || "";
  const { user, isLoading: authLoading } = useAuth();
  const [inviteOverride, setInviteOverride] = useState<string | undefined>(undefined);
  const [inviteInput, setInviteInput] = useState("");
  const [page, setPage] = useState(1);
  const [hydrated, setHydrated] = useState(false);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copyingBet, setCopyingBet] = useState<Bet | null>(null);

  useEffect(() => {
    setHydrated(false);
    setInviteOverride(undefined);
    setInviteInput("");
    setPage(1);
  }, [username]);

  const { data: summary, isLoading: sumLoading, refetch: refetchSummary } = useUserSummaryByUsername(
    username,
    inviteOverride,
    !!user,
  );

  useEffect(() => {
    if (!summary?.user_id || hydrated) return;
    const stored = readStoredProfileInvite(summary.user_id);
    if (stored) setInviteOverride(stored);
    setHydrated(true);
  }, [summary?.user_id, hydrated, summary]);

  const isMe = Boolean(user && summary && user.username === summary.username);

  const canListBets = useMemo(() => {
    if (!summary) return false;
    if (summary.bets_profile_visibility === "public") return true;
    if (isMe) return true;
    return summary.total_bets !== null && summary.total_bets !== undefined;
  }, [summary, isMe]);

  const canShowBadges =
    summary?.bets_profile_visibility === "public" || isMe;

  const { data: badgesData } = useQuery({
    queryKey: ["user-badges", username],
    queryFn: () => api.get<{ badges: BadgeOut[] }>(`/users/by-username/${encodeURIComponent(username)}/badges`),
    enabled: !!username && canShowBadges,
  });

  const { data: betsPage, isLoading: betsLoading } = useUserPublicBets(
    summary?.user_id,
    page,
    inviteOverride,
    canListBets,
  );

  const showCopyBtn =
    canListBets &&
    !isMe &&
    summary?.bets_profile_visibility === "public" &&
    !!user;

  const { data: allBetsPage } = useUserPublicBets(
    summary?.user_id,
    1,
    inviteOverride,
    showCopyBtn && copyModalOpen,
    200,
  );

  useEffect(() => {
    setPage(1);
  }, [username, inviteOverride]);

  if (authLoading) {
    return (
      <PageShell maxWidth="md">
        <p className="text-center text-muted py-20">Cargando...</p>
      </PageShell>
    );
  }

  if (!user) {
    return (
      <PageShell maxWidth="sm">
        <p className="text-white mb-4 text-center">Inicia sesión para ver perfiles de apuestas.</p>
        <Link href="/login" className="text-accent underline block text-center cursor-pointer focus-ring">
          Ir a login
        </Link>
      </PageShell>
    );
  }

  function onSubmitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!summary?.user_id || !inviteInput.trim()) return;
    const code = inviteInput.trim();
    writeStoredProfileInvite(summary.user_id, code);
    setInviteOverride(code);
    void refetchSummary();
  }

  return (
    <PageShell maxWidth="md">
        {sumLoading || !summary ? (
          <p className="text-muted text-center py-16">Cargando perfil...</p>
        ) : (
          <>
            <StaggerItem index={0} className="rounded-2xl border border-white/10 bg-glass backdrop-blur-sm p-6 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <HelpSectionTitle as="h1" helpKey="page.publicProfile">
                  Perfil público
                </HelpSectionTitle>
              </div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <UserAvatar
                    username={summary.username}
                    avatarDisplay={summary.avatar_display}
                    size="lg"
                  />
                  <div className="min-w-0">
                    <UserDisplayName
                      username={summary.username}
                      firstName={summary.first_name}
                      lastName={summary.last_name}
                      nameClassName="font-display text-2xl sm:text-3xl"
                    />
                  </div>
                </div>
                {!isMe && <FollowButton username={summary.username} />}
              </div>
              <p className="text-sm text-muted mt-2">
                Visibilidad:{" "}
                {summary.bets_profile_visibility === "public"
                  ? "Público (cualquier usuario autenticado)"
                  : "Solo con código para ver apuestas"}
              </p>
              {summary.total_bets !== null && summary.total_bets !== undefined && (
                <p className="text-sm text-muted mt-1">{summary.total_bets} apuestas registradas</p>
              )}
              {isMe && (
                <p className="text-sm text-accent mt-3">
                  Este es tu perfil.{" "}
                  <Link href="/profile" className="underline">
                    Ajusta privacidad en tu perfil
                  </Link>
                  .
                </p>
              )}
              {showCopyBtn && (
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setCopyModalOpen(true)}
                    className="px-4 py-2 rounded-xl bg-accent/20 text-accent border border-accent/30 text-sm font-semibold hover:bg-accent/30 transition-colors"
                  >
                    Copiar todas las apuestas
                  </button>
                  <HelpTooltip helpKey="page.publicProfile.copy" label="Copiar apuestas" />
                </div>
              )}
            </StaggerItem>

            {canShowBadges && (
              <StaggerItem index={1} className="rounded-xl border border-white/10 bg-glass p-4 mb-6">
                <h2 className="font-display text-lg text-white mb-3">Medallas</h2>
                <BadgeGrid
                  badges={badgesData?.badges ?? []}
                  emptyLabel="Sin medallas por ahora."
                />
              </StaggerItem>
            )}

            {!canListBets && summary.bets_profile_visibility === "invite_only" && !isMe && (
              <form
                onSubmit={onSubmitCode}
                className="rounded-xl border border-white/10 bg-glass backdrop-blur-sm p-6 mb-6 space-y-4"
              >
                <p className="text-white text-sm">
                  Este usuario solo muestra sus apuestas a quien tenga su{" "}
                  <span className="text-accent">código para ver apuestas</span>.
                </p>
                <input
                  type="text"
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  placeholder="Pega el código aquí"
                  className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-muted"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-accent text-background font-semibold text-sm"
                >
                  Ver apuestas
                </button>
              </form>
            )}

            {canListBets && (
              <div className="space-y-4">
                <h2 className="font-display text-xl text-white">Apuestas</h2>
                {betsLoading ? (
                  <p className="text-muted">Cargando apuestas...</p>
                ) : !betsPage?.data.length ? (
                  <p className="text-muted">Sin apuestas aún.</p>
                ) : (
                  <ul className="space-y-3">
                    {betsPage.data.map((b) => {
                      const hideAmount = summary?.show_bet_amounts === false && !isMe;
                      const amountNum = parseFloat(b.amount);
                      return (
                        <li
                          key={b.id}
                          className="rounded-xl border border-white/10 bg-glass backdrop-blur-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                        >
                          <div>
                            <Link
                              href={`/fixtures/${b.fixture_id}`}
                              className="text-accent text-sm hover:underline"
                            >
                              Ver partido
                            </Link>
                            <p className="text-white mt-1">
                              Pronostico: {b.predicted_home_score} - {b.predicted_away_score}
                            </p>
                            <p className="text-xs text-muted flex items-center gap-2">
                              {amountNum > 0 && (
                                hideAmount ? (
                                  <span className="blur-sm select-none">$XX.XX</span>
                                ) : (
                                  <span>{formatAmount(b.amount, "USD")}</span>
                                )
                              )}
                              <span>Puntos {b.points_earned ?? "—"}</span>
                            </p>
                          </div>
                          {showCopyBtn && (
                            <button
                              onClick={() => setCopyingBet(b)}
                              className="text-xs px-3 py-1.5 rounded-lg bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition-colors font-medium shrink-0"
                            >
                              Copiar
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {betsPage && betsPage.pagination.total_pages > 1 && (
                  <div className="flex justify-center gap-3 pt-4">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="px-4 py-2 rounded-lg bg-white/5 text-muted hover:bg-white/10 disabled:opacity-30"
                    >
                      ← Anterior
                    </button>
                    <span className="text-muted py-2">
                      Página {page} / {betsPage.pagination.total_pages}
                    </span>
                    <button
                      type="button"
                      disabled={page >= betsPage.pagination.total_pages}
                      onClick={() => setPage((p) => p + 1)}
                      className="px-4 py-2 rounded-lg bg-white/5 text-muted hover:bg-white/10 disabled:opacity-30"
                    >
                      Siguiente →
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {showCopyBtn && (
          <CopyProfileModal
            open={copyModalOpen}
            onClose={() => setCopyModalOpen(false)}
            sourceBets={allBetsPage?.data ?? []}
            sourceUserId={summary.user_id}
            sourceUsername={summary?.username ?? username}
          />
        )}
        {copyingBet && (
          <CopyBetDetailModal
            bet={copyingBet}
            onClose={() => setCopyingBet(null)}
          />
        )}
    </PageShell>
  );
}
