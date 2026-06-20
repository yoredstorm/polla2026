"use client";

import { MotionSafe } from "@/components/ui/MotionSafe";
import { StaggerItem } from "@/components/ui/StaggerItem";
import { entranceTransition, pageEnter } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface AuthPageEnterProps {
  children: React.ReactNode;
  className?: string;
}

export function AuthPageEnter({ children, className }: AuthPageEnterProps) {
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

export function AuthFormStagger({
  index,
  children,
  className,
}: {
  index: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <StaggerItem index={index} className={className}>
      {children}
    </StaggerItem>
  );
}
