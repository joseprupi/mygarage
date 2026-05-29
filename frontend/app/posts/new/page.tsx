"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ImageUploader } from "@/components/ImageUploader";
import { api, authApi, postApi } from "@/lib/api/client";
import type { Media, Vehicle } from "@/lib/types";

export default function NewPostPage() {
  const router = useRouter();
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [media, setMedia] = useState<Media[]>([]);
  const [vehicleIds, setVehicleIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const me = useQuery({ queryKey: ["me"], queryFn: authApi.me, retry: false });
  const user = me.data as { id: string } | undefined;
  const vehicles = useQuery({
    queryKey: ["myVehiclesForPost", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => api<Vehicle[]>(`/users/${user!.id}/vehicles`)
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
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
    }
  }

  return (
    <form className="space-y-5 rounded-3xl bg-white p-6 shadow-sm" onSubmit={submit}>
      <h1 className="text-2xl font-bold">Create post</h1>
      <ImageUploader purpose="post_media" onUploaded={(item) => setMedia((items) => [...items, item])} />
      <div className="grid grid-cols-3 gap-2">
        {media.map((item) => (
          <img className="aspect-square rounded-xl object-cover" src={item.thumbnail_url ?? item.url} alt="" key={item.url} />
        ))}
      </div>
      <textarea
        className="min-h-32 w-full rounded-xl border px-3 py-2"
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
          </label>
        ))}
      </div>
      <select className="rounded-xl border px-3 py-2" value={visibility} onChange={(event) => setVisibility(event.target.value)}>
        <option value="public">Public</option>
        <option value="private">Private</option>
        <option value="unlisted">Unlisted</option>
      </select>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="rounded-xl bg-asphalt px-5 py-3 font-semibold text-white" type="submit">
        Publish
      </button>
    </form>
  );
}
