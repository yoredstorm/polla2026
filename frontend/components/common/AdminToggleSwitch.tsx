"use client";

import { cn } from "@/lib/utils";

interface AdminToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  activeClassName?: string;
  "aria-label": string;
}

export function AdminToggleSwitch({
  checked,
  onChange,
  disabled,
  activeClassName = "bg-accent",
  "aria-label": ariaLabel,
}: AdminToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onChange}
      disabled={disabled}
      className={cn(
        "min-h-11 min-w-11 w-11 h-6 rounded-full relative transition-[background-color] duration-fast ease-entrance inline-flex items-center shrink-0",
        checked ? activeClassName : "bg-white/20",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-fast ease-entrance",
          checked ? "left-5" : "left-0.5",
        )}
      />
    </button>
  );
}
