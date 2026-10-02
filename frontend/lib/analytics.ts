// Thin GA4 wrapper. gtag is only defined when NEXT_PUBLIC_GA_ID is set (prod),
// so in dev this is a no-op. Never throws — analytics must not break a click.

type GtagFn = (command: "event", name: string, params?: Record<string, unknown>) => void;

export function track(name: string, params?: Record<string, unknown>): void {
  try {
    if (typeof window === "undefined") return;
    const gtag = (window as unknown as { gtag?: GtagFn }).gtag;
    gtag?.("event", name, params);
  } catch {
    // ignore
  }
}
