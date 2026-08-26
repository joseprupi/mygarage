"use client";

import { useState } from "react";

import { mediaApi } from "@/lib/api/client";
import type { Media } from "@/lib/types";

type Purpose = "post_media" | "vehicle_cover" | "vehicle_event_media" | "vehicle_mod_media" | "avatar";

export function ImageUploader({
  purpose,
  onUploaded
}: {
  purpose: Purpose;
  onUploaded: (media: Media) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    // Create a local object URL now so we can:
    // 1. Use it for dimension-reading without a second URL creation.
    // 2. Pass it back as localPreviewUrl for private-bucket purposes (vehicle_event_media)
    //    where the returned `url` is a non-displayable storage path.
    const localPreviewUrl = URL.createObjectURL(file);
    try {
      const [{ url }, dimensions] = await Promise.all([
        mediaApi.upload(file, purpose),
        readDimensions(localPreviewUrl)
      ]);
      onUploaded({
        url,
        thumbnail_url: url,
        media_type: "image",
        width: dimensions.width,
        height: dimensions.height,
        localPreviewUrl // callers use this for in-form preview; they own the URL lifetime
      });
      // Note: we intentionally do NOT revoke localPreviewUrl here.
      // The form component that receives it will revoke it (or it will be reclaimed on page unload).
    } catch (err) {
      URL.revokeObjectURL(localPreviewUrl);
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="block rounded-2xl border border-dashed bg-white p-4 text-center text-sm">
      <input
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={busy}
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {busy ? "Uploading..." : "Upload image"}
      {error && <p className="mt-2 text-red-600">{error}</p>}
    </label>
  );
}

function readDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.width, height: image.height });
    image.onerror = () => resolve({ width: 1, height: 1 });
    image.src = url;
  });
}
