"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use, useState } from "react";

import { authApi, vehicleApi } from "@/lib/api/client";
import { carAvatarUri } from "@/lib/avatar";
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
      <div className="surface overflow-hidden rounded-3xl">
        {vehicle.data.cover_image_url && (
          <img src={vehicle.data.cover_image_url} alt="" className="aspect-[16/9] w-full object-cover" />
        )}
        <div className="space-y-4 p-6">
          <div>
            {v.nickname && (
              <p className="text-xs font-semibold uppercase tracking-widest text-petrol">{v.nickname}</p>
            )}
            <h1 className="mt-1 text-3xl font-bold">
              {[v.year, v.make, v.model].filter(Boolean).join(" ")}
            </h1>
          </div>
          {v.description && <p className="text-slate-600">{v.description}</p>}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-3">
              {v.owner && (
                <Link href={`/u/${v.owner.username}`} className="flex items-center gap-2 hover:text-petrol">
                  <span className="h-8 w-8 overflow-hidden rounded-full ring-1 ring-slate-200">
                    <img
                      src={v.owner.avatar_url || carAvatarUri(v.owner.username)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </span>
                  <span className="text-sm font-semibold">@{v.owner.username}</span>
                </Link>
              )}
              {isOwner && <span className="chip">{v.visibility}</span>}
            </div>
            {isOwner && (
              <div className="flex items-center gap-2">
                <Link className="btn btn-secondary" href={`/vehicles/${v.id}/edit`}>
                  Edit
                </Link>
                <Link className="btn btn-primary" href={`/vehicles/${v.id}/events/new`}>
                  Add event
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-auto">
        {tabs.map((item) => (
          <button
            className={`tab ${tab === item ? "tab-active" : "tab-idle"}`}
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
              <div className="aspect-square overflow-hidden rounded-2xl bg-slate-100" key={media.url}>
                <img
                  className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                  src={media.thumbnail_url ?? media.url}
                  alt=""
                  loading="lazy"
                />
              </div>
            ))
          )}
        </div>
      )}
      {tab === "history" && (
        events.error ? <p className="text-sm text-red-600">Failed to load events.</p> :
        events.isLoading ? <p className="text-sm text-slate-500">Loading...</p> :
        <div className="space-y-4">
          {events.data?.map((event) => (
            <article className="surface rounded-2xl p-4" key={event.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-petrol/10 px-2.5 py-1 text-xs font-medium text-petrol">
                  {eventTypeLabel(event.event_type)}
                </span>
                {isOwner && (
                  <Link
                    className="text-xs font-medium text-slate-500 hover:text-petrol"
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
        <dl className="surface grid gap-4 rounded-3xl p-6 text-sm sm:grid-cols-2">
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
