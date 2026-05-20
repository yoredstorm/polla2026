/** Mirrors backend/app/core/match_timing.py */

const MS_MINUTE = 60 * 1000;
const MS_HOUR = 60 * MS_MINUTE;

export const BETTING_CLOSE_MS = MS_MINUTE;
export const USER_CHANGE_REQUEST_MS = MS_HOUR;
export const ADMIN_RESOLVE_MS = MS_MINUTE;

type FixtureTiming = {
  match_date: string;
  status: string;
  betting_closes_at?: string | null;
  change_request_closes_at?: string | null;
  admin_resolve_closes_at?: string | null;
};

function kickoffMs(fixture: FixtureTiming): number {
  return new Date(fixture.match_date).getTime();
}

export function getBettingClosesAt(fixture: FixtureTiming): number {
  if (fixture.betting_closes_at) return new Date(fixture.betting_closes_at).getTime();
  return kickoffMs(fixture) - BETTING_CLOSE_MS;
}

export function getChangeRequestClosesAt(fixture: FixtureTiming): number {
  if (fixture.change_request_closes_at) {
    return new Date(fixture.change_request_closes_at).getTime();
  }
  return kickoffMs(fixture) - USER_CHANGE_REQUEST_MS;
}

export function getAdminResolveClosesAt(fixture: FixtureTiming): number {
  if (fixture.admin_resolve_closes_at) {
    return new Date(fixture.admin_resolve_closes_at).getTime();
  }
  return kickoffMs(fixture) - ADMIN_RESOLVE_MS;
}

export function isBettingWindowOpen(fixture: FixtureTiming): boolean {
  if (fixture.status !== "scheduled") return false;
  return Date.now() < getBettingClosesAt(fixture);
}

export function isChangeRequestWindowOpen(fixture: FixtureTiming): boolean {
  if (fixture.status !== "scheduled") return false;
  return Date.now() < getChangeRequestClosesAt(fixture);
}

export function isAdminResolveWindowOpen(fixture: FixtureTiming): boolean {
  if (fixture.status !== "scheduled") return false;
  return Date.now() < getAdminResolveClosesAt(fixture);
}

export function formatDeadlineRemaining(deadlineMs: number, nowMs = Date.now()): string {
  const diff = deadlineMs - nowMs;
  if (diff <= 0) return "Cerrado";

  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  const hms = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  if (days > 0) {
    const dayLabel = days === 1 ? "día" : "días";
    return `${days} ${dayLabel} ${hms}`;
  }
  if (h > 0) return hms;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function isDeadlineUrgent(deadlineMs: number, nowMs = Date.now()): boolean {
  const diff = deadlineMs - nowMs;
  return diff > 0 && diff < 5 * MS_MINUTE;
}
