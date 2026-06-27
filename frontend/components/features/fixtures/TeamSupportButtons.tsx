"use client";

import { useCallback, useEffect, useState } from "react";
import { PartyPopper } from "lucide-react";
import { showToastVariant } from "@/components/ui/Toast";
import {
  getCheerErrorMessage,
  getCheerRetryAfter,
  useFixtureCheer,
} from "@/hooks/useFixtureCheer";
import {
  fireTeamSupportConfetti,
  handleFixtureCheerEvent,
  type FixtureCheerTeam,
} from "@/lib/teamCheer";
import { cn } from "@/lib/utils";

interface TeamSupportButtonsProps {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  isLive: boolean;
  isLoggedIn: boolean;
  /** Render a single team button (home column or away column). */
  team: FixtureCheerTeam;
}

function formatCountdown(seconds: number): string {
  const mins = Math.ceil(seconds / 60);
  return mins <= 1 ? "1 min" : `${mins} min`;
}

export function TeamSupportButton({
  fixtureId,
  homeTeam,
  awayTeam,
  isLive,
  isLoggedIn,
  team,
}: TeamSupportButtonsProps) {
  const cheer = useFixtureCheer(fixtureId);
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  const teamName = team === "home" ? homeTeam : awayTeam;
  const remainingSec =
    blockedUntil !== null ? Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000)) : 0;
  const isBlocked = remainingSec > 0;
  const isPending = cheer.isPending;

  useEffect(() => {
    if (!isBlocked) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [isBlocked, tick]);

  useEffect(() => {
    if (blockedUntil !== null && blockedUntil <= Date.now()) {
      setBlockedUntil(null);
    }
  }, [blockedUntil, tick]);

  const handleSupport = useCallback(async () => {
    if (!isLoggedIn || !isLive || isBlocked || isPending) return;

    try {
      await cheer.mutateAsync(team);
      const payload = {
        fixture_id: fixtureId,
        team,
        home_team: homeTeam,
        away_team: awayTeam,
      };
      void fireTeamSupportConfetti(team);
      handleFixtureCheerEvent(payload, { fromLocal: true });
    } catch (err) {
      const retryAfter = getCheerRetryAfter(err);
      const message = getCheerErrorMessage(
        err,
        "No se pudo enviar tu apoyo. Intenta de nuevo.",
      );
      if (retryAfter) {
        setBlockedUntil(Date.now() + retryAfter * 1000);
      }
      showToastVariant("deadline", message);
    }
  }, [
    awayTeam,
    cheer,
    fixtureId,
    homeTeam,
    isBlocked,
    isLive,
    isLoggedIn,
    isPending,
    team,
  ]);

  if (!isLive || !isLoggedIn) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => void handleSupport()}
      disabled={isBlocked || isPending}
      aria-label={`Apoyar a ${teamName} con confetti`}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all",
        "border border-white/15 bg-white/5 text-white hover:bg-white/10",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      <PartyPopper className="h-4 w-4 shrink-0 text-amber-300" aria-hidden />
      {isBlocked ? (
        <span>En {formatCountdown(remainingSec)}</span>
      ) : (
        <span>Apoyar a {teamName}</span>
      )}
    </button>
  );
}

interface TeamSupportHintProps {
  isLive: boolean;
  isLoggedIn: boolean;
}

export function TeamSupportHint({ isLive, isLoggedIn }: TeamSupportHintProps) {
  if (!isLive || !isLoggedIn) return null;

  return (
    <p className="text-muted text-xs text-center mt-3 max-w-sm mx-auto">
      Apoya a tu equipo — todos en esta página verán el confetti.
    </p>
  );
}
