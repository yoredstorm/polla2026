"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface LiveBadgeProps {
  className?: string;
  pulse?: boolean;
}

export function LiveBadge({ className, pulse = true }: LiveBadgeProps) {
  const reduced = useReducedMotion();

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide",
        "px-2.5 py-1 rounded-full bg-danger/20 text-danger border border-danger/30",
        className,
      )}
    >
      <span className="relative flex h-2 w-2" aria-hidden>
        {pulse && !reduced && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75" />
        )}
        <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
      </span>
      En vivo
    </span>
  );
}

export function LiveBadgePulse({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return null;

  return (
    <motion.span
      className={cn("inline-block", className)}
      animate={{ scale: [1, 1.1, 1] }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      aria-hidden
    />
  );
}
