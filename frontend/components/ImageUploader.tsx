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
    try {
      // Direct upload streams through the API to storage, so it works even when
      // the browser cannot reach the object store host directly (e.g. a tunnel).
      const { url } = await mediaApi.upload(file, purpose);
      const dimensions = await readDimensions(file);
      onUploaded({
        url,
        thumbnail_url: url,
        media_type: "image",
        width: dimensions.width,
        height: dimensions.height
      });
    } catch (err) {
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

function readDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.width, height: image.height });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      resolve({ width: 1, height: 1 });
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });
}
