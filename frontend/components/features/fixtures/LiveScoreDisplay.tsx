"use client";

import { useEffect, useRef, useState } from "react";
import CountUp from "react-countup";
import { motion } from "motion/react";
import { LiveBadge, LiveBadgePulse } from "@/components/ui/LiveBadge";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

interface LiveScoreDisplayProps {
  homeScore: number;
  awayScore: number;
  isLive: boolean;
  statusLabel?: string;
  className?: string;
  onAnchorRef?: (el: HTMLElement | null) => void;
}

export function LiveScoreDisplay({
  homeScore,
  awayScore,
  isLive,
  statusLabel,
  className,
  onAnchorRef,
}: LiveScoreDisplayProps) {
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pulseKey, setPulseKey] = useState(0);
  const prevScores = useRef({ home: homeScore, away: awayScore });

  useEffect(() => {
    onAnchorRef?.(containerRef.current);
  }, [onAnchorRef]);

  useEffect(() => {
    const prev = prevScores.current;
    if (prev.home !== homeScore || prev.away !== awayScore) {
      setPulseKey((k) => k + 1);
      prevScores.current = { home: homeScore, away: awayScore };
    }
  }, [homeScore, awayScore]);

  return (
    <div ref={containerRef} className={cn("text-center", className)}>
      <div className="font-display text-5xl text-white flex items-center justify-center gap-3">
        <ScoreDigit value={homeScore} pulseKey={pulseKey} reduced={reduced} />
        <span className="text-muted">–</span>
        <ScoreDigit value={awayScore} pulseKey={pulseKey} reduced={reduced} />
      </div>
      <div className="mt-2 flex justify-center items-center gap-2">
        {isLive ? (
          <>
            <LiveBadge />
            <LiveBadgePulse key={pulseKey} />
          </>
        ) : (
          statusLabel && (
            <span className="inline-block text-sm font-medium px-3 py-1 rounded-full bg-white/10 text-muted">
              {statusLabel}
            </span>
          )
        )}
      </div>
    </div>
  );
}

function ScoreDigit({
  value,
  pulseKey,
  reduced,
}: {
  value: number;
  pulseKey: number;
  reduced: boolean;
}) {
  return (
    <motion.span
      key={`${value}-${pulseKey}`}
      initial={reduced ? false : { scale: 1.2, color: "#fbbf24" }}
      animate={{ scale: 1, color: "#ffffff" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="tabular-nums min-w-[2ch] text-center"
    >
      <CountUp end={value} duration={reduced ? 0 : 0.6} preserveValue />
    </motion.span>
  );
}
