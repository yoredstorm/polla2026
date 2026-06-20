"use client";

import { MotionSafe } from "@/components/ui/MotionSafe";
import { MOTION } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface TabPillItem<T extends string> {
  id: T;
  label: string;
}

interface TabPillProps<T extends string> {
  items: TabPillItem<T>[];
  value: T;
  onChange: (id: T) => void;
  layoutId?: string;
  className?: string;
  size?: "sm" | "md";
}

export function TabPill<T extends string>({
  items,
  value,
  onChange,
  layoutId = "tab-pill-indicator",
  className,
  size = "md",
}: TabPillProps<T>) {
  return (
    <div
      className={cn(
        "flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10",
        className,
      )}
      role="tablist"
    >
      {items.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "relative flex-1 font-medium pressable focus-ring rounded-lg transition-colors duration-fast ease-entrance",
              size === "sm" ? "py-1.5 text-xs px-2" : "py-2 text-sm px-3",
              active ? "text-background" : "text-muted hover:text-white",
            )}
          >
            {active && (
              <MotionSafe
                layoutId={layoutId}
                className="absolute inset-0 rounded-lg bg-accent shadow-glow-sm"
                transition={MOTION.spring}
              />
            )}
            <span className="relative z-[1]">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
