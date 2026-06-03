"use client";

import { Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSiteMarquee } from "@/hooks/useSiteMarquee";

export interface PromoMarqueePreview {
  enabled: boolean;
  message: string;
}

interface PromoMarqueeProps {
  preview?: PromoMarqueePreview;
  className?: string;
}

function MarqueeContent({ message }: { message: string }) {
  const segment = `${message}   •   `;
  const repeated = segment.repeat(4);

  return (
    <>
      <p className="sr-only" aria-live="polite">
        {message}
      </p>
      <div
        className="hidden motion-reduce:block px-4 py-2.5 text-center text-sm text-white/90 overflow-x-auto"
        aria-hidden="true"
      >
        {message}
      </div>
      <div
        className="motion-reduce:hidden overflow-hidden py-2.5"
        aria-hidden="true"
      >
        <div className="promo-marquee-track flex w-max whitespace-nowrap">
          <span className="px-4 text-sm font-medium text-white/95 tracking-wide">
            {repeated}
          </span>
          <span className="px-4 text-sm font-medium text-white/95 tracking-wide" aria-hidden="true">
            {repeated}
          </span>
        </div>
      </div>
    </>
  );
}

export function PromoMarquee({ preview, className }: PromoMarqueeProps) {
  const query = useSiteMarquee();

  const enabled = preview ? preview.enabled : query.data?.enabled;
  const message = (preview ? preview.message : query.data?.message)?.trim() ?? "";

  if (!preview) {
    if (query.isLoading) return null;
    if (query.isError) return null;
  }

  if (!enabled || !message) return null;

  return (
    <div
      className={cn(
        "relative z-30 w-full border-b border-accent/30",
        "bg-gradient-to-r from-accent/15 via-accent/10 to-accent/15",
        "shadow-[inset_0_1px_0_rgba(0,255,136,0.12)]",
        className,
      )}
      role="region"
      aria-label="Anuncio promocional"
    >
      <div className="max-w-7xl mx-auto flex items-stretch min-h-[2.5rem]">
        <div
          className="flex shrink-0 items-center justify-center px-3 md:px-4 bg-accent/10 border-r border-accent/20"
          aria-hidden="true"
        >
          <Megaphone className="h-4 w-4 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <MarqueeContent message={message} />
        </div>
      </div>
    </div>
  );
}
