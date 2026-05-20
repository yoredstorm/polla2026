"use client";
import { useEffect, useRef, useCallback } from "react";
import { getApiBase } from "@/lib/api";
import { buildApiUrl } from "@/lib/apiBase";

const INACTIVITY_MS = 15 * 60 * 1000; // 15 minutes
const DEBOUNCE_MS = 5_000; // debounce activity resets to every 5s
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "click",
];

export function useInactivityTimeout(enabled: boolean) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResetRef = useRef(Date.now());

  const handleTimeout = useCallback(() => {
    if (typeof window === "undefined") return;
    const path = window.location.pathname;
    if (path.startsWith("/login") || path.startsWith("/register")) return;

    fetch(buildApiUrl(getApiBase(), "/auth/logout"), {
      method: "POST",
      credentials: "include",
    })
      .catch(() => {})
      .finally(() => {
        window.location.href = "/login?reason=inactivity";
      });
  }, []);

  const resetTimer = useCallback(() => {
    const now = Date.now();
    if (now - lastResetRef.current < DEBOUNCE_MS) return;
    lastResetRef.current = now;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(handleTimeout, INACTIVITY_MS);
  }, [handleTimeout]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    timerRef.current = setTimeout(handleTimeout, INACTIVITY_MS);

    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [enabled, resetTimer, handleTimeout]);
}
