"use client";
import type { QueryClient } from "@tanstack/react-query";
import { getApiBase } from "@/lib/api";

function getWsUrl(): string {
  return getApiBase().replace(/^http/, "ws") + "/api/v1/ws/notifications";
}

type WsMessage =
  | { type: "snapshot"; unread_count: number }
  | { type: "unread_count"; count: number }
  | { type: "notification"; data: { title: string; body: string; type: string } };

/** Admin inbox items — update the bell badge, no popup toast (avoids duplicate with form success). */
const SILENT_NOTIFICATION_TYPES = new Set([
  "extra_bet_pending",
  "entry_pending",
  "change_request_pending",
  "change_request_expired_batch",
]);

const recentToastKeys = new Map<string, number>();
const TOAST_DEDUPE_MS = 4000;

/** WebSocket close code when access cookie is missing or invalid. */
const WS_CLOSE_UNAUTHORIZED = 4401;

function shouldShowNotificationToast(notificationType: string, title: string): boolean {
  if (SILENT_NOTIFICATION_TYPES.has(notificationType)) {
    return false;
  }
  const key = `${notificationType}:${title}`;
  const now = Date.now();
  const last = recentToastKeys.get(key);
  if (last != null && now - last < TOAST_DEDUPE_MS) {
    return false;
  }
  recentToastKeys.set(key, now);
  return true;
}

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
let listeners = 0;
let onConnected: (() => void) | null = null;
let onDisconnected: (() => void) | null = null;
/** After 4401, stop reconnect loop until a new connectNotificationsWs session. */
let stopReconnectUntilNewSession = false;

export function setNotificationWsCallbacks(cb: {
  onConnected?: () => void;
  onDisconnected?: () => void;
}) {
  onConnected = cb.onConnected ?? null;
  onDisconnected = cb.onDisconnected ?? null;
}

export function connectNotificationsWs(
  queryClient: QueryClient,
  showToast: (msg: string, type?: "success" | "error" | "info") => void,
) {
  listeners += 1;
  stopReconnectUntilNewSession = false;

  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return disconnectNotificationsWs;
  }

  function scheduleReconnect() {
    if (stopReconnectUntilNewSession || listeners <= 0) return;
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      connect();
    }, reconnectDelay);
  }

  function connect() {
    socket = new WebSocket(getWsUrl());

    socket.onopen = () => {
      reconnectDelay = 1000;
      stopReconnectUntilNewSession = false;
      onConnected?.();
    };

    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as WsMessage;
        if (msg.type === "unread_count") {
          queryClient.setQueryData(["notifications", "unread-count"], { count: msg.count });
        } else if (msg.type === "snapshot") {
          queryClient.setQueryData(["notifications", "unread-count"], { count: msg.unread_count });
        } else if (msg.type === "notification") {
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
          queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
          queryClient.invalidateQueries({ queryKey: ["fixtures"] });
          if (shouldShowNotificationToast(msg.data.type, msg.data.title)) {
            showToast(msg.data.title, "info");
          }
        }
      } catch {
        // ignore malformed messages
      }
    };

    socket.onclose = (ev) => {
      onDisconnected?.();
      if (ev.code === WS_CLOSE_UNAUTHORIZED) {
        stopReconnectUntilNewSession = true;
        return;
      }
      scheduleReconnect();
    };

    socket.onerror = () => {
      socket?.close();
    };
  }

  connect();

  return disconnectNotificationsWs;
}

export function disconnectNotificationsWs() {
  listeners = Math.max(0, listeners - 1);
  if (listeners > 0) return;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.close();
    socket = null;
  }
}
