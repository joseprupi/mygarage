"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use, useState } from "react";

import { authApi, vehicleApi } from "@/lib/api/client";
import { eventTypeLabel } from "@/lib/events";
import { PostCard } from "@/components/PostCard";

const tabs = ["posts", "gallery", "history", "specs"] as const;

export default function VehiclePage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = use(params);
  const [tab, setTab] = useState<(typeof tabs)[number]>("posts");
  const vehicle = useQuery({ queryKey: ["vehicle", vehicleId], queryFn: () => vehicleApi.get(vehicleId) });
  const me = useQuery({ queryKey: ["me"], queryFn: authApi.me, retry: false });
  const currentUser = me.data as { id: string } | undefined;
  const posts = useQuery({ queryKey: ["vehiclePosts", vehicleId], queryFn: () => vehicleApi.posts(vehicleId), enabled: tab === "posts" });
  const gallery = useQuery({ queryKey: ["vehicleGallery", vehicleId], queryFn: () => vehicleApi.gallery(vehicleId), enabled: tab === "gallery" });
  const events = useQuery({ queryKey: ["vehicleEvents", vehicleId], queryFn: () => vehicleApi.events(vehicleId), enabled: tab === "history" });

  if (vehicle.isLoading) return <div>Loading vehicle...</div>;
  if (vehicle.error) return <div>Failed to load vehicle.</div>;
  if (!vehicle.data) return <div>Vehicle not found.</div>;

  const isOwner = Boolean(currentUser && currentUser.id === vehicle.data.owner_user_id);
  const v = vehicle.data;
  const specs: [string, string][] = [
    ["Year", v.year != null ? String(v.year) : ""],
    ["Make", v.make ?? ""],
    ["Model", v.model ?? ""],
    ["Trim", v.trim ?? ""],
    ["Nickname", v.nickname ?? ""],
    ["VIN", v.vin ?? ""],
    ["Mileage", v.mileage != null ? `${v.mileage.toLocaleString()} mi` : ""],
    ["Color", v.color ?? ""],
    ["Transmission", v.transmission ?? ""],
    ["Engine", v.engine ?? ""],
    ["Drivetrain", v.drivetrain ?? ""],
    ["Visibility", v.visibility ?? ""]
  ];

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
        {vehicle.data.cover_image_url && (
          <img src={vehicle.data.cover_image_url} alt="" className="aspect-[16/9] w-full object-cover" />
        )}
        <div className="space-y-3 p-6">
          <p className="text-sm uppercase tracking-wide text-blue-600">{vehicle.data.nickname}</p>
          <h1 className="text-3xl font-bold">
            {[vehicle.data.year, vehicle.data.make, vehicle.data.model].filter(Boolean).join(" ")}
          </h1>
          <p className="text-slate-600">{vehicle.data.description}</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {vehicle.data.owner && <Link href={`/u/${vehicle.data.owner.username}`}>@{vehicle.data.owner.username}</Link>}
            <span className="rounded-full bg-slate-100 px-3 py-1">{vehicle.data.visibility}</span>
            {isOwner && (
              <Link className="rounded-full border px-3 py-1" href={`/vehicles/${vehicle.data.id}/edit`}>
                Edit vehicle
              </Link>
            )}
            <Link className="rounded-full bg-asphalt px-3 py-1 text-white" href={`/vehicles/${vehicle.data.id}/events/new`}>
              Add event
            </Link>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-auto">
        {tabs.map((item) => (
          <button
            className={`rounded-full px-4 py-2 text-sm ${tab === item ? "bg-asphalt text-white" : "bg-white"}`}
            key={item}
            onClick={() => setTab(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "posts" && (
        posts.error ? <p className="text-sm text-red-600">Failed to load posts.</p> :
        posts.isLoading ? <p className="text-sm text-slate-500">Loading...</p> :
        <div className="space-y-5">{posts.data?.map((post) => <PostCard post={post} key={post.id} />)}</div>
      )}
      {tab === "gallery" && (
        gallery.error ? <p className="text-sm text-red-600">Failed to load gallery.</p> :
        gallery.isLoading ? <p className="text-sm text-slate-500">Loading...</p> :
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {gallery.data?.flatMap((post) =>
            post.media.map((media) => (
              <img className="aspect-square rounded-2xl object-cover" src={media.thumbnail_url ?? media.url} alt="" key={media.url} loading="lazy" />
            ))
          )}
        </div>
      )}
      {tab === "history" && (
        events.error ? <p className="text-sm text-red-600">Failed to load events.</p> :
        events.isLoading ? <p className="text-sm text-slate-500">Loading...</p> :
        <div className="space-y-4">
          {events.data?.map((event) => (
            <article className="rounded-2xl bg-white p-4 shadow-sm" key={event.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">
                  {eventTypeLabel(event.event_type)}
                </span>
                {isOwner && (
                  <Link
                    className="text-xs text-slate-500 hover:text-asphalt"
                    href={`/vehicles/${vehicleId}/events/${event.id}/edit`}
                  >
                    Edit
                  </Link>
                )}
              </div>
              <h2 className="mt-2 font-bold">{event.title}</h2>
              <p className="text-sm text-slate-500">
                {event.event_date} {event.mileage ? `· ${event.mileage.toLocaleString()} mi` : ""}
                {event.cost_cents ? ` · $${(event.cost_cents / 100).toFixed(2)}` : ""}
              </p>
              <p className="mt-2 text-sm">{event.description}</p>
            </article>
          ))}
        </div>
      )}
      {tab === "specs" && (
        <dl className="grid gap-3 rounded-3xl bg-white p-6 text-sm shadow-sm sm:grid-cols-2">
          {specs.map(([label, value]) => (
            <div key={label}>
              <dt className="font-semibold">{label}</dt>
              <dd className="text-slate-600">{value || "Not set"}</dd>
            </div>
          ))}
          {v.description && (
            <div className="sm:col-span-2">
              <dt className="font-semibold">Description</dt>
              <dd className="text-slate-600">{v.description}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}
