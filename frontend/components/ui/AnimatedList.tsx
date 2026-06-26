"use client";

import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { entranceTransition, exitTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface AnimatedListProps {
  children: React.ReactNode;
  className?: string;
  as?: "ul" | "div";
}

export function AnimatedList({ children, className, as = "ul" }: AnimatedListProps) {
  const Component = as;
  return (
    <Component className={className}>
      <AnimatePresence mode="popLayout" initial={false}>
        {children}
      </AnimatePresence>
    </Component>
  );
}

interface AnimatedListItemProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  highlight?: boolean;
  as?: "li" | "div";
  layoutId?: string;
}

export function AnimatedListItem({
  id,
  children,
  className,
  highlight = false,
  as = "li",
  layoutId,
}: AnimatedListItemProps) {
  const reduced = useReducedMotion();
  const Component = motion[as];

  return (
    <Component
      layout={!reduced}
      layoutId={layoutId ?? id}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, transition: exitTransition() }}
      transition={entranceTransition()}
      className={cn(
        highlight && "ring-2 ring-accent/40 rounded-xl",
        className,
      )}
    >
      {children}
    </Component>
  );
}
