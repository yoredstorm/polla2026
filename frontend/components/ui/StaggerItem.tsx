"use client";

import { MotionSafe } from "@/components/ui/MotionSafe";
import { entranceTransition, staggerDelay } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface StaggerItemProps {
  index?: number;
  children: React.ReactNode;
  className?: string;
}

/** Staggered list/card entrance with consistent timing. */
export function StaggerItem({ index = 0, children, className }: StaggerItemProps) {
  return (
    <MotionSafe
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={entranceTransition(staggerDelay(index))}
      className={cn(className)}
    >
      {children}
    </MotionSafe>
  );
}
