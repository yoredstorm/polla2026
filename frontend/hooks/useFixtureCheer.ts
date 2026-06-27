"use client";

import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import type { FixtureCheerTeam } from "@/lib/teamCheer";

export function useFixtureCheer(fixtureId: string) {
  return useMutation({
    mutationFn: (team: FixtureCheerTeam) =>
      api.post<{ ok: boolean; team: FixtureCheerTeam }>(
        `/social/fixtures/${fixtureId}/cheer`,
        { team },
      ),
  });
}

export function getCheerErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "error" in err) {
    const e = (err as { error?: { message?: string } }).error;
    if (e?.message) return e.message;
  }
  return fallback;
}

export function getCheerRetryAfter(err: unknown): number | null {
  if (err && typeof err === "object" && "error" in err) {
    const e = (err as { error?: { retry_after?: number } }).error;
    if (typeof e?.retry_after === "number" && e.retry_after > 0) {
      return e.retry_after;
    }
  }
  return null;
}
