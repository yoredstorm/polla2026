"use client";
import type { QueryClient } from "@tanstack/react-query";
import { getApiBase } from "@/lib/api";
import {
  handleRealtimeMessage,
  softInvalidateOnReconnect,
  type WsEvent,
} from "@/lib/realtimeSync";
import { ensureFreshSession } from "@/lib/api";

function getWsUrl(): string {
  return getApiBase().replace(/^http/, "ws") + "/api/v1/ws/notifications";
}

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

const PING_INTERVAL_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;

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

/** Avoid browser warning when cleanup runs while still CONNECTING (login redirect / Strict Mode). */
function safeCloseSocket(ws: WebSocket | null) {
  if (!ws) return;
  if (ws.readyState === WebSocket.CONNECTING) {
    ws.onopen = () => {
      ws.close();
    };
    return;
  }
  ws.close();
}
/** Avoid onerror → close() races when React remounts during CONNECTING. */
let closingIntentionally = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let pongTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
let listeners = 0;
let onConnected: (() => void) | null = null;
let onDisconnected: (() => void) | null = null;
let onStale: (() => void) | null = null;
let lastMessageAt = Date.now();
/** After 4401, stop reconnect loop until a new connectNotificationsWs session. */
let stopReconnectUntilNewSession = false;

export function setNotificationWsCallbacks(cb: {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onStale?: () => void;
}) {
  onConnected = cb.onConnected ?? null;
  onDisconnected = cb.onDisconnected ?? null;
  onStale = cb.onStale ?? null;
}

function clearPingTimers() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  if (pongTimer) {
    clearTimeout(pongTimer);
    pongTimer = null;
  }
}

function schedulePongTimeout() {
  if (pongTimer) clearTimeout(pongTimer);
  pongTimer = setTimeout(() => {
    safeCloseSocket(socket);
  }, PONG_TIMEOUT_MS);
}

function startPingLoop() {
  clearPingTimers();
  pingTimer = setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send("ping");
      schedulePongTimeout();
    }
  }, PING_INTERVAL_MS);
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
    const jitter = Math.random() * 500;
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      connect();
    }, reconnectDelay + jitter);
  }

  function connect() {
    socket = new WebSocket(getWsUrl());

    socket.onopen = async () => {
      reconnectDelay = 1000;
      stopReconnectUntilNewSession = false;
      lastMessageAt = Date.now();
      startPingLoop();
      onConnected?.();
      if (await ensureFreshSession()) {
        softInvalidateOnReconnect(queryClient);
      }
    };

    socket.onmessage = (ev) => {
      lastMessageAt = Date.now();
      void (async () => {
        try {
          const msg = JSON.parse(ev.data) as WsEvent;
          if (msg.type === "pong") {
            if (pongTimer) clearTimeout(pongTimer);
            return;
          }
          await handleRealtimeMessage(queryClient, msg);
          if (msg.type === "notification" && shouldShowNotificationToast(msg.data.type, msg.data.title)) {
            showToast(msg.data.title, "info");
          }
          if (msg.type === "polla_updated" && msg.data.reason === "entry_confirmed") {
            showToast("El pozo global ha crecido", "info");
          }
        } catch {
          // ignore malformed messages
        }
      })();
    };

    socket.onclose = (ev) => {
      clearPingTimers();
      onDisconnected?.();
      if (ev.code === WS_CLOSE_UNAUTHORIZED) {
        stopReconnectUntilNewSession = true;
        return;
      }
      scheduleReconnect();
    };

    socket.onerror = () => {
      safeCloseSocket(socket);
    };
  }

  connect();

  const staleCheck = setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN && Date.now() - lastMessageAt > 45_000) {
      onStale?.();
      void ensureFreshSession().then((ok) => {
        if (ok) softInvalidateOnReconnect(queryClient);
      });
      lastMessageAt = Date.now();
    }
  }, 15_000);

  return () => {
    clearInterval(staleCheck);
    disconnectNotificationsWs();
  };
}

export function disconnectNotificationsWs() {
  listeners = Math.max(0, listeners - 1);
  if (listeners > 0) return;
  clearPingTimers();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    safeCloseSocket(socket);
    socket = null;
  }
}
