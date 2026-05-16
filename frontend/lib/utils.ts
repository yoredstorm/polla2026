import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, isPast, differenceInHours } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMatchDate(dateStr: string): string {
  return format(new Date(dateStr), "MMM d, yyyy HH:mm");
}

export function formatCountdown(dateStr: string): string {
  const date = new Date(dateStr);
  if (isPast(date)) return "Started";
  return formatDistanceToNow(date, { addSuffix: true });
}

export function isWithin24Hours(dateStr: string): boolean {
  return Math.abs(differenceInHours(new Date(dateStr), new Date())) < 24;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "live": return "text-danger";
    case "finished": return "text-muted";
    case "scheduled": return "text-accent";
    default: return "text-muted";
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case "live": return "EN VIVO";
    case "finished": return "Finalizado";
    case "scheduled": return "Programado";
    case "cancelled": return "Cancelado";
    default: return status;
  }
}

export function getPointsColor(points: number | null): string {
  if (points === null) return "text-muted";
  if (points === 3) return "text-accent";
  if (points > 0) return "text-warning";
  return "text-danger";
}

export function formatAmount(amount: string | number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount));
}

/** Same 1h-before-kickoff rule as the backend (scheduled fixtures only). */
export function isChangeRequestWindowOpen(fixture: { match_date: string; status: string }): boolean {
  if (fixture.status !== "scheduled") return false;
  const kickoff = new Date(fixture.match_date).getTime();
  const cutoffMs = 60 * 60 * 1000;
  return Date.now() < kickoff - cutoffMs;
}
