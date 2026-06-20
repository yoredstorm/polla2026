"use client";

import { MotionSafe } from "@/components/ui/MotionSafe";
import { entranceTransition, pageEnter } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface PageEnterProps {
  children: React.ReactNode;
  className?: string;
}

/** Subtle page content entrance — used inside PageShell. */
export function PageEnter({ children, className }: PageEnterProps) {
  return (
    <MotionSafe
      initial={pageEnter.initial}
      animate={pageEnter.animate}
      transition={entranceTransition()}
      className={cn(className)}
    >
      {children}
    </MotionSafe>
  );
}
