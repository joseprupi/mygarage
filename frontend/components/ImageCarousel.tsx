"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import type { Media } from "@/lib/types";
import { PlayBadge, VideoPlayer } from "@/components/VideoPlayer";

export function ImageCarousel({ media }: { media: Media[] }) {
  const [index, setIndex] = useState(0);
  // Tracks whether the current video slide has been swapped to the iframe
  // player. Reset whenever the slide changes.
  const [playing, setPlaying] = useState(false);
  if (media.length === 0) return null;
  const current = media[index];
  const isVideo = current.media_type === "video";
  const previous = () => {
    setPlaying(false);
    setIndex((value) => (value === 0 ? media.length - 1 : value - 1));
  };
  const next = () => {
    setPlaying(false);
    setIndex((value) => (value === media.length - 1 ? 0 : value + 1));
  };

  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-200">
      {isVideo && playing ? (
        <VideoPlayer iframeUrl={current.url} className="relative aspect-[4/3] w-full bg-black" />
      ) : isVideo ? (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label="Play video"
          className="relative block w-full"
        >
          <img
            src={current.thumbnail_url ?? current.url}
            alt=""
            loading="lazy"
            className="aspect-[4/3] w-full object-cover"
          />
          <PlayBadge />
        </button>
      ) : (
        <img
          src={current.thumbnail_url ?? current.url}
          data-full-src={current.url}
          alt=""
          loading="lazy"
          width={current.width ?? 1200}
          height={current.height ?? 900}
          className="aspect-[4/3] w-full object-cover"
        />
      )}
      {media.length > 1 && (
        <>
          <button
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1 text-white"
            onClick={previous}
            type="button"
            aria-label="Previous image"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1 text-white"
            onClick={next}
            type="button"
            aria-label="Next image"
          >
            <ChevronRight size={20} />
          </button>
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1">
            {media.map((item, itemIndex) => (
              <span
                className={`h-1.5 w-1.5 rounded-full ${itemIndex === index ? "bg-white" : "bg-white/50"}`}
                key={item.url}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
