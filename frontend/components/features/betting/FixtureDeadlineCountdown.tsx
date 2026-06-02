"use client";

import { useEffect, useState } from "react";
import { formatDeadlineRemaining, isDeadlineUrgent } from "@/lib/matchTiming";
import { cn } from "@/lib/utils";

interface FixtureDeadlineCountdownProps {
  deadlineMs: number;
  label: string;
  className?: string;
  compact?: boolean;
}

export function FixtureDeadlineCountdown({
  deadlineMs,
  label,
  className,
  compact = false,
}: FixtureDeadlineCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = formatDeadlineRemaining(deadlineMs, now);
  const closed = remaining === "Cerrado";
  const urgent = !closed && isDeadlineUrgent(deadlineMs, now);

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs",
        urgent ? "text-warning" : closed ? "text-muted" : "text-accent/90",
        className,
      )}
      title={label}
    >
      {!compact && <span className="text-muted shrink-0">{label}</span>}
      <span className={cn("font-mono font-medium tabular-nums", urgent && "animate-pulse")}>
        {compact ? `${label}: ` : ""}
        {remaining}
      </span>
    </div>
  );
}
