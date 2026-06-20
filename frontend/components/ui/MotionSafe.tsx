"use client";

import { motion, type MotionProps } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

type MotionElement = "div" | "section" | "span";

const motionComponents = {
  div: motion.div,
  section: motion.section,
  span: motion.span,
} as const;

type MotionSafeProps = MotionProps & {
  children?: React.ReactNode;
  className?: string;
  /** Prefer MotionSafe over raw motion.* for reduced-motion support. */
  as?: MotionElement;
};

export function getMotionProps(
  reduced: boolean,
  props: Pick<MotionProps, "initial" | "animate" | "exit" | "transition">,
): Pick<MotionProps, "initial" | "animate" | "exit" | "transition"> {
  if (reduced) {
    return {
      initial: false,
      animate: undefined,
      exit: undefined,
      transition: { duration: 0 },
    };
  }
  return props;
}

export function MotionSafe({
  children,
  className,
  initial,
  animate,
  exit,
  transition,
  as = "div",
  ...rest
}: MotionSafeProps) {
  const reduced = useReducedMotion();
  const Component = motionComponents[as];

  return (
    <Component
      className={className}
      initial={reduced ? false : initial}
      animate={reduced ? undefined : animate}
      exit={reduced ? undefined : exit}
      transition={reduced ? { duration: 0 } : transition}
      {...rest}
    >
      {children}
    </Component>
  );
}

export function MotionSafeSpan(props: Omit<MotionSafeProps, "as">) {
  return <MotionSafe {...props} as="span" />;
}
