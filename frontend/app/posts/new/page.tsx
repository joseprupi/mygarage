"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

import { ImageUploader } from "@/components/ImageUploader";
import { VideoUploader } from "@/components/VideoUploader";
import { PlayBadge } from "@/components/VideoPlayer";
import { api, postApi } from "@/lib/api/client";
import { useMe } from "@/lib/useMe";
import type { Media, Vehicle } from "@/lib/types";

export default function NewPostPage() {
  const router = useRouter();
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [media, setMedia] = useState<Media[]>([]);
  const [vehicleIds, setVehicleIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const me = useMe();
  const user = me.data as { id: string } | undefined;
  const vehicles = useQuery({
    queryKey: ["myVehiclesForPost", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => api<Vehicle[]>(`/users/${user!.id}/vehicles`)
  });

  const hasContent = caption.trim().length > 0 || media.length > 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    if (!hasContent) {
      setError("Add a caption or a photo before publishing.");
      return;
    }
    setSubmitting(true);
    try {
      const post = await postApi.create({
        caption,
        visibility,
        vehicleIds,
        media: media.map((item, index) => ({ ...item, sort_order: index }))
      });
      router.push(`/posts/${post.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create post");
      setSubmitting(false);
    }
  }

  if (me.isPending) {
    return <div className="surface rounded-3xl p-6 text-sm text-slate-500">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="surface rounded-3xl p-6">
        <p className="mb-4">Log in to share a post.</p>
        <Link className="btn btn-primary" href="/auth">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <form className="surface space-y-5 rounded-3xl p-6" onSubmit={submit}>
      <h1 className="text-2xl font-bold">Create post</h1>
      <div className="grid gap-2 sm:grid-cols-2">
        <ImageUploader purpose="post_media" onUploaded={(item) => setMedia((items) => [...items, item])} />
        <VideoUploader onUploaded={(item) => setMedia((items) => [...items, item])} />
      </div>
      {media.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {media.map((item, index) => (
            <div className="relative aspect-square overflow-hidden rounded-xl bg-slate-100" key={item.url}>
              <img className="h-full w-full object-cover" src={item.thumbnail_url ?? item.url} alt="" />
              {item.media_type === "video" && <PlayBadge size="sm" />}
              <button
                type="button"
                aria-label="Remove media"
                className="absolute right-1 top-1 rounded-full bg-black/60 px-2 text-sm font-bold leading-6 text-white"
                onClick={() => setMedia((items) => items.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <textarea
        className="input min-h-32"
        placeholder="Caption"
        value={caption}
        onChange={(event) => setCaption(event.target.value)}
      />
      <div className="space-y-2">
        <p className="font-semibold">Tag your vehicles</p>
        {vehicles.data?.map((vehicle) => (
          <label className="flex items-center gap-2 text-sm" key={vehicle.id}>
            <input
              checked={vehicleIds.includes(vehicle.id)}
              type="checkbox"
              onChange={(event) =>
                setVehicleIds((ids) =>
                  event.target.checked ? [...ids, vehicle.id] : ids.filter((id) => id !== vehicle.id)
                )
              }
            />
            {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}
            {vehicle.nickname ? ` · “${vehicle.nickname}”` : ""}
          </label>
        ))}
      </div>
      <label className="block space-y-1 text-sm">
        <span>Visibility</span>
        <select className="input" value={visibility} onChange={(event) => setVisibility(event.target.value)}>
          <option value="public">Public</option>
          <option value="private">Private</option>
          <option value="unlisted">Unlisted</option>
        </select>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!hasContent && <p className="text-sm text-slate-500">Add a caption or a photo to publish.</p>}
      <button
        className="btn btn-primary px-5 py-3 disabled:opacity-60"
        disabled={submitting || !hasContent}
        type="submit"
      >
        {submitting ? "Publishing…" : "Publish"}
      </button>
    </form>
  );
}
