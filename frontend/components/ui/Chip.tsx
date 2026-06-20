"use client";

import { cn } from "@/lib/utils";

interface ChipProps {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  type?: "button" | "submit";
}

export function Chip({ active, onClick, children, className, type = "button" }: ChipProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      aria-pressed={active ?? false}
      className={cn(
        "px-4 py-2 rounded-full text-sm pressable cursor-pointer focus-ring",
        "transition-[colors,transform,box-shadow] duration-fast ease-entrance",
        active
          ? "bg-accent text-background font-bold shadow-glow-sm scale-[1.02]"
          : "bg-white/5 text-muted hover:bg-white/10 hover:text-white hover:-translate-y-px",
        className,
      )}
    >
      {children}
    </button>
  );
}
