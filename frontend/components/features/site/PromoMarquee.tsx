"use client";

import { cn } from "@/lib/utils";
import { useSiteMarquee } from "@/hooks/useSiteMarquee";

export interface PromoMarqueePreview {
  enabled: boolean;
  message: string;
}

interface PromoMarqueeProps {
  preview?: PromoMarqueePreview;
  className?: string;
  /** When true, skips outer spacing (e.g. admin preview box). */
  embedded?: boolean;
}

function MarqueeContent({ message }: { message: string }) {
  const segment = `${message}   ◆   `;
  const repeated = segment.repeat(4);

  return (
    <>
      <p className="sr-only" aria-live="polite">
        {message}
      </p>
      <div
        className="relative z-[4] hidden motion-reduce:flex items-center justify-center px-4 py-3 min-h-[2.75rem]"
        aria-hidden="true"
      >
        <p className="font-display led-marquee-text text-center leading-tight">{message}</p>
      </div>
      <div
        className="relative z-[4] motion-reduce:hidden overflow-hidden py-3 min-h-[2.75rem] flex items-center"
        aria-hidden="true"
      >
        <div className="promo-marquee-track flex w-max whitespace-nowrap items-center">
          <span className="font-display led-marquee-text px-6">{repeated}</span>
          <span className="font-display led-marquee-text px-6" aria-hidden="true">
            {repeated}
          </span>
        </div>
      </div>
    </>
  );
}

export function PromoMarquee({ preview, className, embedded = false }: PromoMarqueeProps) {
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
        "relative z-30 w-full",
        !embedded && "px-3 md:px-4 mt-3 md:mt-4 mb-1",
        className,
      )}
      role="region"
      aria-label="Anuncio promocional"
    >
      <div
        className={cn(
          "max-w-7xl mx-auto rounded-xl p-[3px] led-marquee-bezel",
          !embedded && "led-marquee-screen-pulse",
        )}
      >
        <div
          className={cn(
            "led-marquee-screen rounded-[10px] flex items-stretch min-h-[3rem]",
          )}
        >
          <div className="led-marquee-scanlines led-marquee-scanlines-animated" aria-hidden="true" />
          <div className="led-marquee-vignette" aria-hidden="true" />

          <div
            className="relative z-[5] flex shrink-0 flex-col items-center justify-center gap-0.5 px-3 md:px-4 border-r border-accent/25 bg-black/35 min-w-[4.5rem]"
            aria-hidden="true"
          >
          <span className="font-display led-marquee-badge text-[10px] md:text-xs">PROMO</span>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-40 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_#00ff88]" />
            </span>
          </div>

          <div className="relative z-[4] flex-1 min-w-0">
            <MarqueeContent message={message} />
          </div>
        </div>
      </div>
    </div>
  );
}
