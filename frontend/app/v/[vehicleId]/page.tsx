"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use, useState } from "react";
import { Pencil, Plus } from "lucide-react";

import { authApi, vehicleApi } from "@/lib/api/client";
import { carAvatarUri } from "@/lib/avatar";
import { eventTypeBadge, eventTypeLabel } from "@/lib/events";
import { PostCard } from "@/components/PostCard";
import { Lightbox } from "@/components/Lightbox";

const tabs = ["posts", "gallery", "history", "specs"] as const;

export default function VehiclePage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = use(params);
  const [tab, setTab] = useState<(typeof tabs)[number]>("posts");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
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
  const galleryImages = gallery.data?.flatMap((post) => post.media.map((m) => m.url)) ?? [];
  const presentEventTypes = Array.from(new Set(events.data?.map((e) => e.event_type) ?? []));
  const filteredEvents = (events.data ?? []).filter(
    (e) => eventFilter === "all" || e.event_type === eventFilter
  );

  return (
    <section className="space-y-4">
      {v.cover_image_url && (
        <div className="overflow-hidden rounded-3xl">
          <img src={v.cover_image_url} alt="" className="aspect-[16/9] w-full object-cover" />
        </div>
      )}

      <div className="surface sticky top-4 z-10 overflow-hidden rounded-3xl">
        <div className="p-6 pb-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              {v.nickname && (
                <p className="text-xs font-semibold uppercase tracking-widest text-petrol">{v.nickname}</p>
              )}
              <h1 className="mt-1 text-3xl font-bold">
                {[v.year, v.make, v.model].filter(Boolean).join(" ")}
              </h1>
            </div>
            {isOwner && (
              <Link className="btn btn-secondary shrink-0" href={`/vehicles/${v.id}/edit`}>
                <Pencil size={15} />
                Edit
              </Link>
            )}
          </div>

          {v.description && <p className="mt-3 text-slate-600">{v.description}</p>}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
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
              <Link className="btn btn-accent px-5 py-2.5 shadow-sm" href={`/vehicles/${v.id}/events/new`}>
                <Plus size={18} strokeWidth={2.5} />
                Add event
              </Link>
            )}
          </div>
        </div>

        <div className="mt-5 flex border-t border-slate-100">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`flex-1 border-b-2 px-2 py-3 text-sm font-medium capitalize transition ${
                tab === item
                  ? "border-asphalt text-asphalt"
                  : "border-transparent text-slate-400 hover:text-asphalt"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
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
          {galleryImages.map((url, i) => (
            <button
              type="button"
              className="aspect-square overflow-hidden rounded-2xl bg-slate-100"
              key={`${url}-${i}`}
              onClick={() => setLightbox({ images: galleryImages, index: i })}
            >
              <img
                className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                src={url}
                alt=""
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
      {tab === "history" && (
        events.error ? <p className="text-sm text-red-600">Failed to load events.</p> :
        events.isLoading ? <p className="text-sm text-slate-500">Loading...</p> :
        <div className="space-y-4">
          {presentEventTypes.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEventFilter("all")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  eventFilter === "all"
                    ? "bg-asphalt text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All
              </button>
              {presentEventTypes.map((type) => (
                <button
                  type="button"
                  key={type}
                  onClick={() => setEventFilter(type)}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${eventTypeBadge(type)} ${
                    eventFilter === type ? "ring-2 ring-asphalt ring-offset-1" : "opacity-70 hover:opacity-100"
                  }`}
                >
                  {eventTypeLabel(type)}
                </button>
              ))}
            </div>
          )}
          {filteredEvents.map((event) => (
            <article className="surface rounded-2xl p-4" key={event.id}>
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${eventTypeBadge(event.event_type)}`}
                >
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
              {event.description && <p className="mt-2 text-sm">{event.description}</p>}
              {event.media.length > 0 && (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {event.media.map((media, i) => (
                    <button
                      type="button"
                      key={media.url}
                      onClick={() =>
                        setLightbox({ images: event.media.map((m) => m.url), index: i })
                      }
                      className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100"
                    >
                      <img
                        src={media.thumbnail_url ?? media.url}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                      />
                    </button>
                  ))}
                </div>
              )}
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

      {lightbox && (
        <Lightbox images={lightbox.images} startIndex={lightbox.index} onClose={() => setLightbox(null)} />
      )}
    </section>
  );
}
