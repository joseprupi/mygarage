"use client";

import { useState } from "react";

import { mediaApi } from "@/lib/api/client";
import type { EventDocument } from "@/lib/types";

export function DocumentUploader({
  onUploaded
}: {
  onUploaded: (document: EventDocument) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      // Direct upload streams through the API to storage, so it works even when
      // the browser cannot reach the object store host directly (e.g. a tunnel).
      const { url } = await mediaApi.upload(file, "vehicle_event_document");
      onUploaded({
        url,
        filename: file.name,
        content_type: file.type || "application/pdf"
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
        accept="application/pdf"
        className="hidden"
        disabled={busy}
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = "";
        }}
      />
      {busy ? "Uploading..." : "Upload PDF"}
      {error && <p className="mt-2 text-red-600">{error}</p>}
    </label>
  );
}
