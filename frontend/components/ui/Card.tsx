import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "glass" | "solid";
  glow?: boolean;
  live?: boolean;
  interactive?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className,
      variant = "glass",
      glow = false,
      live = false,
      interactive = false,
      children,
      ...props
    },
    ref,
  ) => (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border backdrop-blur-sm",
        variant === "glass" ? "border-white/10 bg-glass" : "border-white/10 bg-surface",
        glow && "border-accent/40 shadow-glow-accent",
        live && "border-danger/50 shadow-glow-danger",
        interactive && "card-interactive",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
Card.displayName = "Card";
