"use client";
import { cn } from "@/lib/utils";
import { getApiBase } from "@/lib/api";

const SIZES = {
  xs: "w-6 h-6 text-[10px]",
  sm: "w-10 h-10 text-sm",
  md: "w-12 h-12 text-base",
  lg: "w-20 h-20 text-2xl",
} as const;

export type UserAvatarSize = keyof typeof SIZES;

function hashColor(username: string): string {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = username.charCodeAt(i) + ((h << 5) - h);
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 55% 40%)`;
}

export function resolveAvatarSrc(display: string | null | undefined): string | null {
  if (!display) return null;
  if (display.startsWith("/api/")) return `${getApiBase()}${display}`;
  return display;
}

interface UserAvatarProps {
  username: string;
  avatarDisplay?: string | null;
  size?: UserAvatarSize;
  className?: string;
}

export function UserAvatar({ username, avatarDisplay, size = "sm", className }: UserAvatarProps) {
  const src = resolveAvatarSrc(avatarDisplay);
  const initial = (username || "?").charAt(0).toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        alt={`Avatar de ${username}`}
        className={cn("rounded-full object-cover border border-white/15 shrink-0", SIZES[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-display font-bold text-white border border-white/15 shrink-0",
        SIZES[size],
        className,
      )}
      style={{ backgroundColor: hashColor(username) }}
      aria-hidden
    >
      {initial}
    </div>
  );
}

