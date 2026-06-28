"use client";

import { useRef, useState } from "react";

import { ApiError, mediaApi, uploadFileToUrl } from "@/lib/api/client";
import type { Media } from "@/lib/types";

// Cloudflare's direct-creator-upload POST path caps a single file at 200 MB.
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
// Poll the processing status for up to ~5 minutes (100 × 3s).
const POLL_INTERVAL_MS = 3000;
const POLL_ATTEMPTS = 100;

export function VideoUploader({
  onUploaded,
  maxDurationSeconds
}: {
  onUploaded: (media: Media) => void;
  maxDurationSeconds?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Shown (and persists) when the backend reports video uploads aren't
  // configured (503) — the normal case until the owner adds Cloudflare creds.
  const [disabledNote, setDisabledNote] = useState<string | null>(null);

  async function pollUntilReady(uid: string): Promise<number | null> {
    for (let i = 0; i < POLL_ATTEMPTS; i++) {
      const result = await mediaApi.videoStatus(uid).catch(() => null);
      if (result?.ready) return result.durationSeconds;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    return null;
  }

  async function handleFile(file: File) {
    setError(null);
    setDisabledNote(null);
    if (file.size > MAX_VIDEO_BYTES) {
      setError("Video is too large (max 200 MB).");
      return;
    }
    setBusy(true);
    setProgress(0);
    setStatus("Preparing…");
    try {
      let target;
      try {
        target = await mediaApi.videoDirectUpload(maxDurationSeconds);
      } catch (err) {
        if (err instanceof ApiError && err.status === 503) {
          setDisabledNote("Video uploads aren't enabled yet.");
          return;
        }
        throw err;
      }
      setStatus("Uploading…");
      await uploadFileToUrl(target.uploadUrl, file, (fraction) =>
        setProgress(Math.round(fraction * 100))
      );
      setStatus("Processing…");
      const duration = await pollUntilReady(target.uid);
      onUploaded({
        media_type: "video",
        url: target.iframeUrl,
        thumbnail_url: target.thumbnailUrl,
        duration_seconds: duration
      });
      setStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Video upload failed");
    } finally {
      setBusy(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const uploading = busy && status === "Uploading…";

  return (
    <div className="space-y-2">
      <label className="block cursor-pointer rounded-2xl border border-dashed bg-white p-4 text-center text-sm">
        <input
          ref={inputRef}
          accept="video/*"
          className="hidden"
          disabled={busy}
          type="file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        {busy ? `${status ?? "Working…"}${uploading ? ` ${progress}%` : ""}` : "Add video"}
      </label>
      {uploading && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full bg-petrol transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      {disabledNote && <p className="text-sm text-slate-500">{disabledNote}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
