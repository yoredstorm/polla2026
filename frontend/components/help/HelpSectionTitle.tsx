"use client";

import { cn } from "@/lib/utils";
import type { HelpKey } from "@/lib/systemHelp";
import { HelpTooltip } from "@/components/help/HelpTooltip";

type HeadingLevel = "h1" | "h2" | "h3";

const headingClasses: Record<HeadingLevel, string> = {
  h1: "font-display text-3xl text-white text-glow-accent",
  h2: "font-display text-xl text-white",
  h3: "font-display text-lg text-white",
};

export interface HelpSectionTitleProps {
  as?: HeadingLevel;
  helpKey: HelpKey;
  label?: string;
  className?: string;
  children: React.ReactNode;
}

export function HelpSectionTitle({
  as: Tag = "h2",
  helpKey,
  label,
  className,
  children,
}: HelpSectionTitleProps) {
  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      <Tag className={headingClasses[Tag]}>{children}</Tag>
      <HelpTooltip helpKey={helpKey} label={label ?? (typeof children === "string" ? children : undefined)} />
    </div>
  );
}
