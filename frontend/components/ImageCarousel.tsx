"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import type { Media } from "@/lib/types";

export function ImageCarousel({ media }: { media: Media[] }) {
  const [index, setIndex] = useState(0);
  if (media.length === 0) return null;
  const current = media[index];
  const previous = () => setIndex((value) => (value === 0 ? media.length - 1 : value - 1));
  const next = () => setIndex((value) => (value === media.length - 1 ? 0 : value + 1));

  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-200">
      <img
        src={current.thumbnail_url ?? current.url}
        data-full-src={current.url}
        alt=""
        loading="lazy"
        width={current.width ?? 1200}
        height={current.height ?? 900}
        className="aspect-[4/3] w-full object-cover"
      />
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
