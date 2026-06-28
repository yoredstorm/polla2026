/** Cross-tab sync when an admin saves marquee settings (same browser). */
const CHANNEL = "polla-competition-marquee";

export function notifyMarqueeChanged(slug: string): void {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
  const bc = new BroadcastChannel(CHANNEL);
  bc.postMessage({ slug, ts: Date.now() });
  bc.close();
}

export function subscribeMarqueeChanged(onChange: (slug: string) => void): () => void {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
    return () => {};
  }
  const bc = new BroadcastChannel(CHANNEL);
  bc.onmessage = (event: MessageEvent<{ slug?: string }>) => {
    if (event.data?.slug) onChange(event.data.slug);
  };
  return () => bc.close();
}
