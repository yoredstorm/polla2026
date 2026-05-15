"use client";

import Image from "next/image";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

function initialsFromTeamName(name: string): string | null {
  const t = name.trim();
  if (!t || /^TBD$/i.test(t)) return null;
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0];
    const b = parts[1][0];
    if (a && b) return (a + b).toUpperCase();
  }
  if (t.length >= 2) return t.slice(0, 2).toUpperCase();
  if (t.length === 1) return t.toUpperCase();
  return null;
}

interface TeamAvatarProps {
  logoUrl: string | null;
  teamName: string;
  size?: number;
  className?: string;
}

export function TeamAvatar({ logoUrl, teamName, size = 40, className }: TeamAvatarProps) {
  const initials = initialsFromTeamName(teamName);
  const iconSize = Math.round(size * 0.45);

  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt={teamName}
        width={size}
        height={size}
        className={cn("shrink-0 object-contain", className)}
        unoptimized
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={teamName}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 font-display font-semibold text-muted",
        className
      )}
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.35) }}
    >
      {initials ? (
        <span className="text-accent/90">{initials}</span>
      ) : (
        <HelpCircle className="text-muted" size={iconSize} strokeWidth={1.75} aria-hidden />
      )}
    </div>
  );
}
