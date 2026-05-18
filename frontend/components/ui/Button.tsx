"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-accent text-background font-bold hover:bg-accent-dim shadow-glow-sm",
  secondary:
    "border border-white/15 bg-white/5 text-white hover:bg-white/10",
  ghost: "text-muted hover:text-white hover:bg-white/5",
  danger: "bg-danger/20 text-danger border border-danger/40 hover:bg-danger/30",
} as const;

const sizes = {
  sm: "px-3 py-1.5 text-xs rounded-lg",
  md: "px-4 py-2.5 text-sm rounded-xl",
  lg: "w-full py-3 text-base rounded-xl",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 transition-colors duration-200 cursor-pointer focus-ring disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
