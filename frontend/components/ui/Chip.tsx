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
        "px-4 py-2 rounded-full text-sm transition-colors duration-200 cursor-pointer focus-ring",
        active
          ? "bg-accent text-background font-bold"
          : "bg-white/5 text-muted hover:bg-white/10 hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}
