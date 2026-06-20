"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MotionSafe, getMotionProps } from "@/components/ui/MotionSafe";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { ChallengeQuotaData } from "@/lib/challengeQuota";
import { hasChallengeQuotaLimits } from "@/lib/challengeQuota";
import { MOTION, entranceTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface QuotaRowProps {
  label: string;
  used: number;
  limit: number;
  remaining: number | null | undefined;
  exhaustedCopy: string;
  pulse: boolean;
  compact?: boolean;
}

function QuotaRow({
  label,
  used,
  limit,
  remaining,
  exhaustedCopy,
  pulse,
  compact,
}: QuotaRowProps) {
  const reduced = useReducedMotion();
  const rem = remaining ?? Math.max(0, limit - used);
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const exhausted = rem <= 0;

  return (
    <MotionSafe
      animate={pulse && !reduced ? { scale: [1, 1.02, 1] } : { scale: 1 }}
      transition={{ duration: MOTION.duration.normal }}
      className={cn("space-y-1.5", compact ? "" : "mb-3 last:mb-0")}
    >
      <div className="flex justify-between items-baseline gap-2 text-xs">
        <span className="text-muted">{label}</span>
        <span className="text-white/90 font-medium tabular-nums">
          {exhausted ? (
            <span className="text-amber-300">{exhaustedCopy}</span>
          ) : (
            <>
              <AnimatePresence mode="popLayout">
                {pulse && !reduced && (
                  <motion.span
                    key="minus"
                    {...getMotionProps(reduced, {
                      initial: { opacity: 0, y: -4 },
                      animate: { opacity: 1, y: 0 },
                      exit: { opacity: 0 },
                      transition: entranceTransition(),
                    })}
                    className="text-accent mr-1 inline-block"
                  >
                    −1
                  </motion.span>
                )}
              </AnimatePresence>
              {rem} restante{rem === 1 ? "" : "s"} · {used}/{limit}
            </>
          )}
        </span>
      </div>
      <div
        className="h-2 rounded-full bg-white/10 overflow-hidden"
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label={label}
      >
        <MotionSafe
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{
            duration: MOTION.duration.normal,
            ease: MOTION.ease.entrance,
          }}
          className={cn(
            "h-full rounded-full",
            exhausted ? "bg-amber-500/80" : "bg-accent",
          )}
        />
      </div>
    </MotionSafe>
  );
}

export interface ChallengeQuotaBarsProps {
  quota: ChallengeQuotaData | undefined;
  variant?: "default" | "compact";
  className?: string;
  animateTick?: number;
}

export function ChallengeQuotaBars({
  quota,
  variant = "default",
  className,
  animateTick = 0,
}: ChallengeQuotaBarsProps) {
  const prevDaily = useRef<number | null>(null);
  const prevTournament = useRef<number | null>(null);
  const [pulseDaily, setPulseDaily] = useState(false);
  const [pulseTournament, setPulseTournament] = useState(false);

  const dailyRem = quota?.daily_remaining;
  const tourRem = quota?.tournament_remaining;

  useEffect(() => {
    if (dailyRem == null) return;
    if (prevDaily.current != null && dailyRem < prevDaily.current) {
      setPulseDaily(true);
      const t = setTimeout(() => setPulseDaily(false), 500);
      prevDaily.current = dailyRem;
      return () => clearTimeout(t);
    }
    prevDaily.current = dailyRem;
  }, [dailyRem, animateTick]);

  useEffect(() => {
    if (tourRem == null) return;
    if (prevTournament.current != null && tourRem < prevTournament.current) {
      setPulseTournament(true);
      const t = setTimeout(() => setPulseTournament(false), 500);
      prevTournament.current = tourRem;
      return () => clearTimeout(t);
    }
    prevTournament.current = tourRem;
  }, [tourRem, animateTick]);

  if (!hasChallengeQuotaLimits(quota)) return null;

  const compact = variant === "compact";
  const showDaily = quota!.daily_limit != null && quota!.daily_limit! > 0;
  const showTournament = quota!.tournament_limit != null && quota!.tournament_limit! > 0;

  return (
    <div
      className={cn(
        compact ? "space-y-2" : "rounded-xl border border-white/10 bg-white/[0.03] p-4",
        className,
      )}
    >
      {!compact && (
        <p className="text-xs text-muted mb-3">Cupos de retos (Te reto)</p>
      )}
      {showDaily && (
        <QuotaRow
          label="Retos hoy"
          used={quota!.daily_used ?? 0}
          limit={quota!.daily_limit!}
          remaining={quota!.daily_remaining}
          exhaustedCopy="Agotado hoy"
          pulse={pulseDaily}
          compact={compact}
        />
      )}
      {showTournament && (
        <QuotaRow
          label="Retos del mundial"
          used={quota!.tournament_used ?? 0}
          limit={quota!.tournament_limit!}
          remaining={quota!.tournament_remaining}
          exhaustedCopy="Agotado"
          pulse={pulseTournament}
          compact={compact}
        />
      )}
      {quota?.daily_resets_at && showDaily && (
        <p className={cn("text-[10px] text-muted/70", compact ? "mt-1" : "mt-2")}>
          El conteo diario se reinicia a medianoche
          {quota.timezone ? ` (${quota.timezone.replace("_", " ")})` : ""}.
        </p>
      )}
    </div>
  );
}
