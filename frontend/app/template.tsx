"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence } from "motion/react";
import { MotionSafe } from "@/components/ui/MotionSafe";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduced = useReducedMotion();

  return (
    <AnimatePresence mode="wait">
      <MotionSafe
        key={pathname}
        initial={{ opacity: 0, y: reduced ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduced ? 0 : -8 }}
        transition={{ duration: reduced ? 0.1 : 0.22, ease: "easeOut" }}
      >
        {children}
      </MotionSafe>
    </AnimatePresence>
  );
}
