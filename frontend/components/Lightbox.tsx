"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { useDialogFocus } from "@/lib/useDialogFocus";
import { VideoPlayer } from "@/components/VideoPlayer";

export type LightboxItem = { url: string; type: "image" | "video" };

export function Lightbox({
  items,
  startIndex = 0,
  onClose
}: {
  items: LightboxItem[];
  startIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const dialogRef = useDialogFocus<HTMLDivElement>();

  useEffect(() => setIndex(startIndex), [startIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % items.length);
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + items.length) % items.length);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [items.length, onClose]);

  if (items.length === 0) return null;
  const active = items[index];

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Media viewer"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
        onClick={onClose}
        aria-label="Close"
      >
        <X size={22} />
      </button>

      {items.length > 1 && (
        <>
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i - 1 + items.length) % items.length);
            }}
            aria-label="Previous"
          >
            <ChevronLeft size={26} />
          </button>
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i + 1) % items.length);
            }}
            aria-label="Next"
          >
            <ChevronRight size={26} />
          </button>
        </>
      )}

      {active.type === "video" ? (
        <div className="w-[92vw] max-w-4xl" onClick={(e) => e.stopPropagation()}>
          <VideoPlayer iframeUrl={active.url} />
        </div>
      ) : (
        <img
          src={active.url}
          alt=""
          className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {items.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-white/80">
          {index + 1} / {items.length}
        </div>
      )}
    </div>
  );
}
