"use client";

import { MotionSafe } from "@/components/ui/MotionSafe";
import { entranceTransition } from "@/lib/motion";

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <MotionSafe
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ ...entranceTransition(), duration: 0.15 }}
    >
      {children}
    </MotionSafe>
  );
}
