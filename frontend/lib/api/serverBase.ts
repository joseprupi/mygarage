// Server-only API helpers for generateMetadata (SSR). The browser client in
// client.ts uses `NEXT_PUBLIC_API_BASE_URL ?? "/api"`, but the "/api" default
// is a *relative* path resolved by a Next rewrite — it has no origin and is
// therefore unusable from a server-side fetch. Resolve a real origin here.

// Canonical public site origin. Stored media URLs are often relative
// ("/media/..."), so og:image needs this prefix to become absolute.
export const SITE_ORIGIN = "https://carfable.com";

// Resolve the backend origin reachable from the server (SSR/Node), NOT the
// browser. In prod NEXT_PUBLIC_API_BASE_URL is the absolute Cloud Run URL
// (reachable from SSR); in dev it's unset/relative, so fall back to the local
// backend on :8010 (the next.config rewrite default of :8000 is wrong here).
export function serverApiBase(): string {
  const pub = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (pub && pub.startsWith("http")) return pub.replace(/\/+$/, "");
  return process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:8010";
}

// Fetch a public resource for metadata. Never throws — returns null on any
// failure (network error, 404, private/forbidden) so generateMetadata can fall
// back to default metadata without breaking the page render.
export async function serverFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${serverApiBase()}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Turn a possibly-relative media URL into an absolute one for og:image.
// Generated avatars are inline `data:` URIs — skip those (useless as OG images).
export function absoluteMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("data:")) return undefined;
  if (url.startsWith("/")) return `${SITE_ORIGIN}${url}`;
  return `${SITE_ORIGIN}/${url}`;
}
