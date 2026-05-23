"use client";

import { useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getHelpText, type HelpKey } from "@/lib/systemHelp";

export interface HelpTooltipProps {
  helpKey: HelpKey;
  label?: string;
  className?: string;
  iconClassName?: string;
  side?: "top" | "bottom" | "left" | "right";
}

export function HelpTooltip({
  helpKey,
  label,
  className,
  iconClassName,
  side = "top",
}: HelpTooltipProps) {
  const [open, setOpen] = useState(false);
  const text = getHelpText(helpKey, "short");
  const ariaLabel = label ? `Ayuda sobre ${label}` : "Ayuda";

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    // Solo tomar control en touch; en desktop el hover de Radix es suficiente
    if (window.matchMedia("(hover: none)").matches) {
      setOpen((v) => !v);
    }
  }

  return (
    <Tooltip.Root
      open={window !== undefined && window.matchMedia("(hover: none)").matches ? open : undefined}
      onOpenChange={(v) => {
        if (!window.matchMedia("(hover: none)").matches) setOpen(v);
      }}
    >
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center shrink-0 rounded-full p-0.5",
            "text-muted hover:text-accent transition-colors duration-200 cursor-pointer focus-ring",
            className,
          )}
          aria-label={ariaLabel}
          onClick={handleClick}
        >
          <HelpCircle className={cn("w-4 h-4", iconClassName)} strokeWidth={1.75} aria-hidden />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            "z-[100] max-w-[280px] rounded-xl border border-white/15 bg-surface px-3 py-2.5",
            "text-xs leading-relaxed text-white/90 shadow-lg shadow-black/40",
            "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          )}
        >
          {text}
          <Tooltip.Arrow className="fill-surface" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}