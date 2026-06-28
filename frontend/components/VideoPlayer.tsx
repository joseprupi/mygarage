"use client";

import { Play } from "lucide-react";

// Dependency-free Cloudflare Stream player: the stored video media item's `url`
// IS the iframe URL (customer-<code>.cloudflarestream.com/<uid>/iframe).
export function VideoPlayer({
  iframeUrl,
  className
}: {
  iframeUrl: string;
  className?: string;
}) {
  return (
    <div className={className ?? "relative aspect-video w-full overflow-hidden rounded-2xl bg-black"}>
      <iframe
        src={iframeUrl}
        title="Video player"
        loading="lazy"
        className="absolute inset-0 h-full w-full border-0"
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
        allowFullScreen
      />
    </div>
  );
}

// Centered play badge overlay for video thumbnails. Sits inside a `relative`
// parent and ignores pointer events so the parent button handles the click.
export function PlayBadge({ size = "lg" }: { size?: "sm" | "lg" }) {
  const box = size === "sm" ? "h-7 w-7" : "h-12 w-12";
  const icon = size === "sm" ? 14 : 22;
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className={`flex ${box} items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/30`}>
        <Play size={icon} fill="currentColor" />
      </span>
    </span>
  );
}
