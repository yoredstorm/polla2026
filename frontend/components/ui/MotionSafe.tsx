"use client";

import { motion, type MotionProps } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

type MotionSafeProps = MotionProps & {
  children: React.ReactNode;
  className?: string;
  as?: "motion.div" | "motion.section";
};

export function MotionSafe({
  children,
  className,
  initial,
  animate,
  transition,
  as = "motion.div",
  ...rest
}: MotionSafeProps) {
  const reduced = useReducedMotion();
  const Component = as === "motion.section" ? motion.section : motion.div;

  return (
    <Component
      className={className}
      initial={reduced ? false : initial}
      animate={reduced ? undefined : animate}
      transition={reduced ? { duration: 0 } : transition}
      {...rest}
    >
      {children}
    </Component>
  );
}
