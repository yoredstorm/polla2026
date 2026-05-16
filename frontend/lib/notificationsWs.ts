"use client";
import type { QueryClient } from "@tanstack/react-query";

function getWsUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  let httpBase: string;
  if (typeof window !== "undefined") {
    httpBase = configured || `${window.location.protocol}//${window.location.hostname}:8000`;
  } else {
    httpBase = configured || "http://localhost:8000";
  }
  return httpBase.replace(/^http/, "ws") + "/api/v1/ws/notifications";
}

type WsMessage =
  | { type: "snapshot"; unread_count: number }
  | { type: "unread_count"; count: number }
  | { type: "notification"; data: { title: string; body: string; type: string } };

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
let listeners = 0;
let onConnected: (() => void) | null = null;
let onDisconnected: (() => void) | null = null;

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
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return disconnectNotificationsWs;
  }

  function connect() {
    socket = new WebSocket(getWsUrl());

    socket.onopen = () => {
      reconnectDelay = 1000;
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
          showToast(msg.data.title, "info");
        }
      } catch {
        // ignore malformed messages
      }
    };

    socket.onclose = () => {
      onDisconnected?.();
      if (listeners > 0) {
        reconnectTimer = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
          connect();
        }, reconnectDelay);
      }
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
