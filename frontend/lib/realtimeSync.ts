"use client";
import type { QueryClient } from "@tanstack/react-query";
import type { ActivePolla } from "@/types/api";
import { ensureFreshSession } from "@/lib/api";
import { siteMarqueeQueryKey } from "@/hooks/useSiteMarquee";

export type PollaUpdatedData = {
  group_id: string;
  prize_pool: string;
  previous_prize_pool: string;
  member_count: number;
  delta: string;
  reason: string;
};

export type WsEvent =
  | { type: "snapshot"; unread_count: number }
  | { type: "unread_count"; count: number }
  | { type: "notification"; data: { title: string; body: string; type: string } }
  | { type: "notifications_resolved"; data: { types: string[]; count: number } }
  | { type: "polla_updated"; data: PollaUpdatedData }
  | { type: "fixture_updated"; data: Record<string, unknown> }
  | { type: "pong" }
  | { type: "data_refresh"; data: { reason?: string } }
  | { type: "site_marquee_updated"; data: Record<string, never> };

type PollaUpdatedHandler = (data: PollaUpdatedData) => void;

let pollaUpdatedHandler: PollaUpdatedHandler | null = null;

export function setPollaUpdatedHandler(handler: PollaUpdatedHandler | null) {
  pollaUpdatedHandler = handler;
}

type InvalidateOpts = { refetch?: boolean };

function invalidateKeys(
  queryClient: QueryClient,
  keys: readonly (readonly string[])[],
  opts: InvalidateOpts = {},
) {
  const refetchType = opts.refetch === false ? "none" : "active";
  for (const key of keys) {
    queryClient.invalidateQueries({ queryKey: [...key], refetchType });
  }
}

const NOTIFICATION_KEYS = [
  ["notifications"],
  ["notifications", "unread-count"],
] as const;

const ADMIN_POLLA_KEYS = [
  ["admin", "group-members"],
  ["admin", "non-members"],
  ["admin", "pending-extras"],
  ["admin", "groups"],
] as const;

const FIXTURE_FINISHED_KEYS = [
  ["fixtures"],
  ["fixture"],
  ["my-bets"],
  ["my-change-requests"],
  ["leaderboard"],
  ["pool", "active"],
  ["group-fixture-standings"],
] as const;

const DATA_REFRESH_KEYS = [
  ["pool", "active"],
  ["fixtures"],
  ["fixture"],
  ["my-bets"],
  ["my-change-requests"],
  ["leaderboard"],
  ["challenges"],
  ["challenges", "available-points"],
  ["admin"],
  ["notifications"],
] as const;

export function invalidateForNotificationType(
  queryClient: QueryClient,
  notificationType: string,
  opts: InvalidateOpts = { refetch: true },
) {
  invalidateKeys(queryClient, NOTIFICATION_KEYS, opts);

  if (notificationType === "fixture_finished" || notificationType === "fixture_betting_closed") {
    invalidateKeys(queryClient, FIXTURE_FINISHED_KEYS, opts);
    return;
  }

  if (
    notificationType === "fixture_betting_closed_admin" ||
    notificationType === "fixture_betting_soon_admin"
  ) {
    invalidateKeys(
      queryClient,
      [["admin"], ["fixtures"], ["fixture"], ["admin", "action-queue"]],
      opts,
    );
    return;
  }

  if (notificationType.startsWith("change_request")) {
    invalidateKeys(
      queryClient,
      [
        ["my-change-requests"],
        ["my-bets"],
        ["admin", "change-requests"],
        ["admin", "change-requests-count"],
      ],
      opts,
    );
    return;
  }

  if (
    notificationType === "entry_pending" ||
    notificationType === "extra_bet_pending"
  ) {
    invalidateKeys(
      queryClient,
      [["admin"], ["pool", "active"], ...ADMIN_POLLA_KEYS],
      opts,
    );
    return;
  }

  if (notificationType === "password_reset_pending") {
    invalidateKeys(
      queryClient,
      [
        ["admin", "password-reset-count"],
        ["admin", "password-reset-requests"],
      ],
      opts,
    );
  }
}

export async function handleRealtimeMessage(
  queryClient: QueryClient,
  msg: WsEvent,
  onPollaUpdated?: PollaUpdatedHandler,
) {
  if (msg.type === "unread_count") {
    queryClient.setQueryData(["notifications", "unread-count"], { count: msg.count });
    return;
  }
  if (msg.type === "snapshot") {
    queryClient.setQueryData(["notifications", "unread-count"], { count: msg.unread_count });
    invalidateKeys(queryClient, [["notifications"]], { refetch: true });
    return;
  }
  if (msg.type === "notifications_resolved") {
    invalidateKeys(queryClient, NOTIFICATION_KEYS, { refetch: true });
    return;
  }
  if (msg.type === "polla_updated") {
    queryClient.setQueryData<ActivePolla | null>(["pool", "active"], (old) => {
      if (!old) return old;
      return {
        ...old,
        prize_pool: msg.data.prize_pool,
        member_count: msg.data.member_count,
      };
    });
    const handler = onPollaUpdated ?? pollaUpdatedHandler;
    handler?.(msg.data);
    invalidateKeys(
      queryClient,
      [["leaderboard"], ["pool", "active"], ...ADMIN_POLLA_KEYS],
      { refetch: true },
    );
    return;
  }
  if (msg.type === "fixture_updated") {
    const ok = await ensureFreshSession();
    if (!ok) return;
    invalidateKeys(
      queryClient,
      [["fixtures"], ["fixture"], ["my-bets"], ["leaderboard"]],
      { refetch: true },
    );
    return;
  }
  if (msg.type === "notification") {
    invalidateKeys(queryClient, NOTIFICATION_KEYS, { refetch: true });

    const needsDataRefetch =
      msg.data.type === "fixture_finished" ||
      msg.data.type === "fixture_betting_closed" ||
      msg.data.type.startsWith("change_request") ||
      msg.data.type.startsWith("challenge") ||
      msg.data.type === "entry_pending" ||
      msg.data.type === "extra_bet_pending";

    if (needsDataRefetch) {
      const ok = await ensureFreshSession();
      if (!ok) return;
    }

    invalidateForNotificationType(queryClient, msg.data.type, {
      refetch: needsDataRefetch,
    });

    if (msg.data.type.startsWith("challenge")) {
      invalidateKeys(
        queryClient,
        [["challenges"], ["challenges", "available-points"], ["leaderboard"]],
        { refetch: true },
      );
    }
    return;
  }
  if (msg.type === "site_marquee_updated") {
    invalidateKeys(queryClient, [siteMarqueeQueryKey()], { refetch: true });
    return;
  }
  if (msg.type === "data_refresh") {
    const ok = await ensureFreshSession();
    if (!ok) return;
    invalidateKeys(queryClient, DATA_REFRESH_KEYS, { refetch: true });
    if (msg.data.reason === "bet_placed") {
      invalidateKeys(
        queryClient,
        [["group-fixture-standings"]],
        { refetch: true },
      );
    }
  }
}

/** Light invalidation on reconnect — refetch active queries */
export function softInvalidateOnReconnect(queryClient: QueryClient) {
  invalidateKeys(
    queryClient,
    [
      ["notifications", "unread-count"],
      ["notifications"],
      ["pool", "active"],
      ["fixtures"],
      ["my-bets"],
      ["leaderboard"],
      ["admin"],
      siteMarqueeQueryKey(),
    ],
    { refetch: true },
  );
}
