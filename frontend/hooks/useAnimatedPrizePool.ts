"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PollaUpdatedData } from "@/lib/realtimeSync";
import { setPollaUpdatedHandler } from "@/lib/realtimeSync";

export function parsePrizePool(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

export function useAnimatedPrizePool(serverValue: number | null) {
  const [displayed, setDisplayed] = useState<number | null>(serverValue);
  const [isAnimating, setIsAnimating] = useState(false);
  const rafRef = useRef<number | null>(null);
  const displayedRef = useRef(serverValue);

  // API / React Query is the source of truth whenever it changes
  useEffect(() => {
    if (serverValue == null) return;
    if (isAnimating) return;

    const prev = displayedRef.current;
    if (prev == null || Math.abs(prev - serverValue) >= 0.005) {
      setDisplayed(serverValue);
      displayedRef.current = serverValue;
    }
  }, [serverValue, isAnimating]);

  const animateTo = useCallback((target: number, from?: number) => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);

    const start = from ?? displayedRef.current ?? target;
    if (!Number.isFinite(target)) return;

    if (Math.abs(target - start) < 0.005) {
      setDisplayed(target);
      displayedRef.current = target;
      setIsAnimating(false);
      return;
    }

    setIsAnimating(true);
    const diff = target - start;
    const steps = Math.min(60, Math.max(1, Math.ceil(Math.abs(diff))));
    const stepSize = diff / steps;
    let current = start;
    let step = 0;

    const tick = () => {
      step += 1;
      if (step >= steps) {
        setDisplayed(target);
        displayedRef.current = target;
        setIsAnimating(false);
        rafRef.current = null;
        return;
      }
      current += stepSize;
      const rounded = Math.round(current * 100) / 100;
      setDisplayed(rounded);
      displayedRef.current = rounded;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const onPollaUpdated = (data: PollaUpdatedData) => {
      const target = parsePrizePool(data.prize_pool);
      const prev = parsePrizePool(data.previous_prize_pool);
      if (target == null) return;
      const from = prev ?? displayedRef.current ?? target;
      animateTo(target, from);
    };
    setPollaUpdatedHandler(onPollaUpdated);
    return () => setPollaUpdatedHandler(null);
  }, [animateTo]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { displayed, isAnimating };
}
