"use client";

import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAdministeredCompetitions } from "@/hooks/useCompetitions";
import type { Notification, NotificationPayload } from "@/types/api";

const COMPETITION_SCOPED_ACTIONS = new Set([
  "entry_pending",
  "extra_bet_pending",
  "phase_entry_pending",
]);

const SUPER_ADMIN_ACTIONS = new Set([
  "change_request_pending",
  "password_reset_pending",
  ...COMPETITION_SCOPED_ACTIONS,
]);

export function useNotificationAdminSlugs(): Set<string> {
  const { user } = useAuth();
  const { data: administered } = useAdministeredCompetitions();
  return useMemo(() => {
    const slugs = new Set<string>();
    if (user?.is_admin) return slugs;
    for (const c of administered ?? []) {
      slugs.add(c.slug);
    }
    return slugs;
  }, [user?.is_admin, administered]);
}

export function canActOnAdminNotification(
  n: Notification,
  opts: { isSuperAdmin: boolean; administeredSlugs: Set<string> },
): boolean {
  if (n.read_at) return false;
  if (opts.isSuperAdmin) return SUPER_ADMIN_ACTIONS.has(n.type);
  const slug = n.payload?.competition_slug;
  if (!slug || !opts.administeredSlugs.has(slug)) return false;
  return COMPETITION_SCOPED_ACTIONS.has(n.type);
}

export function isAdminActionableNotification(
  n: Notification,
  opts: { isSuperAdmin: boolean; administeredSlugs: Set<string> },
): boolean {
  return canActOnAdminNotification(n, opts);
}
