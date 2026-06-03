/** Cross-tab sync when an admin saves marquee settings (same browser). */
const CHANNEL = "polla-site-marquee";

export function notifyMarqueeChanged(): void {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
  const bc = new BroadcastChannel(CHANNEL);
  bc.postMessage({ ts: Date.now() });
  bc.close();
}

export function subscribeMarqueeChanged(onChange: () => void): () => void {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
    return () => {};
  }
  const bc = new BroadcastChannel(CHANNEL);
  bc.onmessage = () => onChange();
  return () => bc.close();
}
