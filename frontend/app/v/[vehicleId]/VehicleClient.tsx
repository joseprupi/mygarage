"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useState } from "react";
import { Download, ExternalLink, Pencil, Plus } from "lucide-react";

import { getToken, modApi, vehicleApi } from "@/lib/api/client";
import { useMe } from "@/lib/useMe";
import { carAvatarUri } from "@/lib/avatar";
import { eventTypeBadge, eventTypeLabel } from "@/lib/events";
import { formatDate, formatMoney } from "@/lib/format";
import { PostCard } from "@/components/PostCard";
import { Lightbox, type LightboxItem } from "@/components/Lightbox";
import { LoadErrorCard } from "@/components/LoadErrorCard";
import { MileageChart } from "@/components/MileageChart";
import { tagLabel } from "@/lib/events";
import { ShareButton } from "@/components/ShareButton";
import { PlayBadge } from "@/components/VideoPlayer";
import { VehicleModForm } from "@/components/VehicleModForm";
import type { Media, VehicleMod } from "@/lib/types";

// Map a media list to lightbox items (video → iframe url, image → full url).
const toLightboxItems = (media: Media[]): LightboxItem[] =>
  media.map((m) => ({ url: m.url, type: m.media_type }));

const tabs = ["posts", "gallery", "history", "specs"] as const;
type Tab = (typeof tabs)[number];

// Filter sentinel for the History type filter: show only mods.
const MODS_FILTER = "mods";
// Badge styling for mod entries (timeline + filter chip).
const MOD_BADGE = "bg-indigo-100 text-indigo-700";

// Group an already-category-sorted mod list into [category, mods][] by walking
// consecutive runs — preserves the backend's category/sort_order ordering.
function groupMods(items: VehicleMod[]): [string, VehicleMod[]][] {
  const groups: [string, VehicleMod[]][] = [];
  for (const mod of items) {
    const last = groups[groups.length - 1];
    if (last && last[0] === mod.category) last[1].push(mod);
    else groups.push([mod.category, [mod]]);
  }
  return groups;
}

export function VehicleClient(props: { params: Promise<{ vehicleId: string }> }) {
  // useSearchParams needs a Suspense boundary at the page level.
  return (
    <Suspense fallback={<div>Loading vehicle...</div>}>
      <VehiclePageInner {...props} />
    </Suspense>
  );
}

function VehiclePageInner({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  // The active tab lives in the URL so /v/<id>?tab=history is shareable.
  const tabParam = searchParams.get("tab");
  const tab: Tab = (tabs as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "posts";
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [lightbox, setLightbox] = useState<{ items: LightboxItem[]; index: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  // Mods (Specs tab): which form is open ("new" to add, a mod id to edit, null to hide).
  const [modForm, setModForm] = useState<"new" | string | null>(null);
  const [modError, setModError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const vehicle = useQuery({ queryKey: ["vehicle", vehicleId], queryFn: () => vehicleApi.get(vehicleId) });
  const me = useMe();
  const currentUser = me.data as { id: string } | undefined;
  const posts = useQuery({ queryKey: ["vehiclePosts", vehicleId], queryFn: () => vehicleApi.posts(vehicleId), enabled: tab === "posts" });
  const gallery = useQuery({ queryKey: ["vehicleGallery", vehicleId], queryFn: () => vehicleApi.gallery(vehicleId), enabled: tab === "gallery" });
  // Specs also needs events: when the vehicle has no mileage of its own we
  // derive it from the latest recorded reading in the history.
  const events = useQuery({ queryKey: ["vehicleEvents", vehicleId], queryFn: () => vehicleApi.events(vehicleId), enabled: tab === "history" || tab === "specs" });
  // Mods feed both the Specs tab (full CRUD list) and the History timeline/chart.
  const mods = useQuery({ queryKey: ["vehicleMods", vehicleId], queryFn: () => vehicleApi.mods(vehicleId), enabled: tab === "specs" || tab === "history" });

  async function deleteMod(modId: string) {
    if (!window.confirm("Delete this mod? This cannot be undone.")) return;
    setModError(null);
    try {
      await modApi.delete(modId);
      await queryClient.invalidateQueries({ queryKey: ["vehicleMods", vehicleId] });
    } catch {
      setModError("Couldn't delete the mod. Try again in a moment.");
    }
  }

  function selectTab(next: Tab) {
    router.replace(next === "posts" ? `/v/${vehicleId}` : `/v/${vehicleId}?tab=${next}`, { scroll: false });
  }

  if (vehicle.isLoading) return <div>Loading vehicle...</div>;
  if (vehicle.error) return <LoadErrorCard error={vehicle.error} noun="vehicle" />;
  if (!vehicle.data) return <div>Vehicle not found.</div>;

  const isOwner = Boolean(currentUser && currentUser.id === vehicle.data.owner_user_id);
  const v = vehicle.data;
  const latestReading = (events.data ?? [])
    .filter((e) => e.mileage != null && e.event_date)
    .sort((a, b) => b.event_date!.localeCompare(a.event_date!))[0];
  const mileageValue =
    v.mileage != null
      ? `${v.mileage.toLocaleString()} mi`
      : latestReading
        ? `${latestReading.mileage!.toLocaleString()} mi (latest recorded, ${formatDate(latestReading.event_date!)})`
        : "";
  const specs: [string, string][] = [
    ["Year", v.year != null ? String(v.year) : ""],
    ["Make", v.make ?? ""],
    ["Model", v.model ?? ""],
    ["Trim", v.trim ?? ""],
    ["Nickname", v.nickname ?? ""],
    ["VIN", v.vin ?? ""],
    ["Mileage", mileageValue],
    ["Color", v.color ?? ""],
    ["Transmission", v.transmission ?? ""],
    ["Engine", v.engine ?? ""],
    ["Drivetrain", v.drivetrain ?? ""],
    ["Visibility", v.visibility ?? ""]
  ];
  // Owners see every row (so they know what's left to fill in); visitors only
  // see rows with real values — a wall of "Not set" reads as a thin history.
  const visibleSpecs = isOwner ? specs : specs.filter(([, value]) => value);
  const galleryMedia = gallery.data?.flatMap((post) => post.media) ?? [];
  const presentEventTypes = Array.from(new Set(events.data?.map((e) => e.event_type) ?? []));
  const filteredEvents = (events.data ?? []).filter(
    (e) => eventFilter === "all" || e.event_type === eventFilter
  );

  // Mods that carry an install date show on the History timeline; the rest still
  // live in the Specs Mods section. `hasDatedMods` drives the "Mods" filter chip.
  const allMods = mods.data ?? [];
  const datedMods = allMods.filter((m) => m.installed_date);
  const hasDatedMods = datedMods.length > 0;
  // Unified, date-descending timeline of events + mods. When a specific event
  // type is selected, filteredEvents is already narrowed and mods are hidden;
  // when "mods" is selected, filteredEvents is empty (no event_type === "mods").
  const showModsInTimeline = eventFilter === "all" || eventFilter === MODS_FILTER;
  const timeline: (
    | { kind: "event"; key: string; date: string; event: (typeof filteredEvents)[number] }
    | { kind: "mod"; key: string; date: string; mod: VehicleMod }
  )[] = [
    ...filteredEvents.map((event) => ({
      kind: "event" as const,
      key: `event-${event.id}`,
      date: event.event_date ?? "",
      event
    })),
    ...(showModsInTimeline
      ? datedMods.map((mod) => ({
          kind: "mod" as const,
          key: `mod-${mod.id}`,
          date: mod.installed_date ?? "",
          mod
        }))
      : [])
  ].sort((a, b) => b.date.localeCompare(a.date));

  // Cost summary over ALL events (ignores the active type filter).
  const allEvents = events.data ?? [];
  const totalCostCents = allEvents.reduce((sum, e) => sum + (e.cost_cents ?? 0), 0);
  const costByType = allEvents.reduce<Record<string, number>>((acc, e) => {
    if (e.cost_cents) acc[e.event_type] = (acc[e.event_type] ?? 0) + e.cost_cents;
    return acc;
  }, {});
  // Mileage points for the timeline chart: one per date, from BOTH events and
  // mods. On multiple readings for the same date, take the highest (odometer
  // reading) so it's deterministic regardless of order.
  const mileageByDate: Record<string, number> = {};
  for (const e of allEvents) {
    if (e.event_date && e.mileage != null) {
      mileageByDate[e.event_date] = Math.max(mileageByDate[e.event_date] ?? e.mileage, e.mileage);
    }
  }
  for (const m of allMods) {
    if (m.installed_date && m.mileage != null) {
      mileageByDate[m.installed_date] = Math.max(mileageByDate[m.installed_date] ?? m.mileage, m.mileage);
    }
  }
  if (v.purchase_date && v.mileage != null) {
    mileageByDate[v.purchase_date] = Math.max(mileageByDate[v.purchase_date] ?? v.mileage, v.mileage);
  }
  const mileagePoints = Object.entries(mileageByDate)
    .map(([date, miles]) => ({ date, miles }))
    .sort((a, b) => a.date.localeCompare(b.date));

  async function exportHistory() {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const token = getToken();
      const res = await fetch(`/api/vehicles/${vehicleId}/history/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${[v.year, v.make, v.model].filter(Boolean).join("-") || "vehicle"}-history.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Couldn't export the history. Try again in a moment.");
    } finally {
      setExporting(false);
    }
  }

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
            <div className="flex shrink-0 items-center gap-2">
              <ShareButton
                title="Share vehicle"
                url={typeof window !== "undefined" ? `${window.location.origin}/v/${v.id}` : `/v/${v.id}`}
              />
              {isOwner && (
                <Link className="btn btn-secondary shrink-0" href={`/vehicles/${v.id}/edit`}>
                  <Pencil size={15} />
                  Edit
                </Link>
              )}
            </div>
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
                      onError={(e) => {
                        e.currentTarget.src = carAvatarUri(v.owner!.username);
                      }}
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

        <div className="mt-5 flex gap-2 overflow-x-auto border-t border-slate-100 px-4 py-3">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => selectTab(item)}
              className={`tab ${tab === item ? "tab-active" : "tab-idle"}`}
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
          {galleryMedia.map((item, i) => (
            <button
              type="button"
              className="relative aspect-square overflow-hidden rounded-2xl bg-slate-100"
              key={`${item.url}-${i}`}
              onClick={() => setLightbox({ items: toLightboxItems(galleryMedia), index: i })}
            >
              <img
                className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                src={item.thumbnail_url ?? item.url}
                alt=""
                loading="lazy"
              />
              {item.media_type === "video" && <PlayBadge />}
            </button>
          ))}
        </div>
      )}
      {tab === "history" && (
        events.error ? <p className="text-sm text-red-600">Failed to load events.</p> :
        events.isLoading ? <p className="text-sm text-slate-500">Loading...</p> :
        <div className="space-y-4">
          {totalCostCents > 0 && (
            <div className="surface rounded-2xl p-4">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Total spent</p>
                  <p className="mt-1 text-2xl font-bold">{formatMoney(totalCostCents)}</p>
                </div>
                <span className="text-xs text-slate-500">
                  {allEvents.length} {allEvents.length === 1 ? "event" : "events"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(costByType).map(([type, cents]) => (
                  <span
                    key={type}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${eventTypeBadge(type)}`}
                  >
                    {eventTypeLabel(type)} · {formatMoney(cents)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {mileagePoints.length >= 2 && <MileageChart points={mileagePoints} />}
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {presentEventTypes.length + (hasDatedMods ? 1 : 0) > 1 && (
                <>
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
                  {hasDatedMods && (
                    <button
                      type="button"
                      onClick={() => setEventFilter(MODS_FILTER)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${MOD_BADGE} ${
                        eventFilter === MODS_FILTER ? "ring-2 ring-asphalt ring-offset-1" : "opacity-70 hover:opacity-100"
                      }`}
                    >
                      Mods
                    </button>
                  )}
                </>
              )}
            </div>
            {(events.data?.length ?? 0) > 0 && (
              <button
                type="button"
                onClick={exportHistory}
                disabled={exporting}
                className="btn btn-secondary shrink-0 disabled:opacity-60"
              >
                <Download size={15} />
                {exporting ? "Exporting…" : "Export CSV + photos"}
              </button>
            )}
          </div>
          {exportError && <p className="text-right text-sm text-red-600">{exportError}</p>}
          {timeline.map((entry) =>
            entry.kind === "event" ? (
              (() => {
                const event = entry.event;
                return (
                  <article className="surface rounded-2xl p-4" key={entry.key}>
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
                    {(event.tags?.length ?? 0) > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {event.tags!.map((tag) => (
                          <span key={tag} className="rounded-full bg-petrol/10 px-2 py-0.5 text-[11px] font-semibold capitalize text-petrol">
                            {tagLabel(tag)}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-sm text-slate-500">
                      {event.event_date ? formatDate(event.event_date) : ""}
                      {event.mileage ? ` · ${event.mileage.toLocaleString()} mi` : ""}
                      {event.cost_cents ? ` · ${formatMoney(event.cost_cents)}` : ""}
                    </p>
                    {(event.shop_name || event.location) && (
                      <p className="text-sm text-slate-500">
                        {[event.shop_name, event.location].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {event.description && (
                      <p className="mt-2 whitespace-pre-line text-sm">{event.description}</p>
                    )}
                    {event.media.length > 0 && (
                      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                        {event.media.map((media, i) => (
                          <button
                            type="button"
                            key={media.url}
                            onClick={() =>
                              setLightbox({ items: toLightboxItems(event.media), index: i })
                            }
                            className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100"
                          >
                            <img
                              src={media.thumbnail_url ?? media.url}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                            />
                            {media.media_type === "video" && <PlayBadge size="sm" />}
                          </button>
                        ))}
                      </div>
                    )}
                    {event.documents?.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {event.documents.map((doc) => (
                          <li key={doc.url}>
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-sm text-petrol hover:underline"
                            >
                              📄 {doc.filename}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                );
              })()
            ) : (
              (() => {
                const mod = entry.mod;
                return (
                  <article className="surface rounded-2xl p-4" key={entry.key}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${MOD_BADGE}`}>Mod</span>
                      <span className="text-xs font-medium text-slate-400">{mod.category}</span>
                    </div>
                    <h2 className="mt-2 font-bold">{mod.name}</h2>
                    <p className="text-sm text-slate-500">
                      {[
                        mod.installed_date ? formatDate(mod.installed_date) : null,
                        mod.brand || null,
                        mod.mileage != null ? `${mod.mileage.toLocaleString()} mi` : null,
                        mod.cost_cents != null ? formatMoney(mod.cost_cents) : null
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {mod.notes && <p className="mt-2 text-sm">{mod.notes}</p>}
                    {mod.media.length > 0 && (
                      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                        {mod.media.map((media, i) => (
                          <button
                            type="button"
                            key={media.url}
                            onClick={() => setLightbox({ items: toLightboxItems(mod.media), index: i })}
                            className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100"
                          >
                            <img
                              src={media.thumbnail_url ?? media.url}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                            />
                            {media.media_type === "video" && <PlayBadge size="sm" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })()
            )
          )}
        </div>
      )}
      {tab === "specs" && (
        <div className="space-y-6">
          <dl className="surface grid gap-4 rounded-3xl p-6 text-sm sm:grid-cols-2">
            {visibleSpecs.map(([label, value]) => (
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

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Mods</h2>
              {isOwner && modForm !== "new" && (
                <button
                  type="button"
                  className="btn btn-accent px-5 py-2.5 shadow-sm"
                  onClick={() => setModForm("new")}
                >
                  <Plus size={18} strokeWidth={2.5} />
                  Add mod
                </button>
              )}
            </div>
            {mods.error ? (
              <p className="text-sm text-red-600">Failed to load mods.</p>
            ) : mods.isLoading ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : (
              <>
                {modForm === "new" && (
                  <VehicleModForm vehicleId={vehicleId} onClose={() => setModForm(null)} />
                )}
                {modError && <p className="text-sm text-red-600">{modError}</p>}
                {(mods.data?.length ?? 0) === 0 && modForm !== "new" ? (
                  <div className="surface rounded-2xl p-6 text-center">
                    <p className="text-sm text-slate-600">No mods yet.</p>
                    {isOwner && (
                      <button
                        type="button"
                        className="btn btn-accent mt-3 px-5 py-2.5"
                        onClick={() => setModForm("new")}
                      >
                        <Plus size={18} strokeWidth={2.5} />
                        Add the first mod
                      </button>
                    )}
                  </div>
                ) : (
                  // The list comes back category-sorted, so consecutive grouping yields
                  // one header per category.
                  groupMods(mods.data ?? []).map(([category, items]) => (
                    <div key={category} className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">{category}</h3>
                      <div className="space-y-2">
                        {items.map((mod) =>
                          modForm === mod.id ? (
                            <VehicleModForm
                              key={mod.id}
                              vehicleId={vehicleId}
                              mod={mod}
                              onClose={() => setModForm(null)}
                            />
                          ) : (
                            <article className="surface rounded-2xl p-4" key={mod.id}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <h4 className="font-bold">{mod.name}</h4>
                                  {mod.brand && <p className="text-sm text-slate-500">{mod.brand}</p>}
                                </div>
                                {isOwner && (
                                  <div className="flex shrink-0 items-center gap-3">
                                    <button
                                      type="button"
                                      className="text-xs font-medium text-slate-500 hover:text-petrol"
                                      onClick={() => setModForm(mod.id)}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className="text-xs font-medium text-slate-500 hover:text-red-600"
                                      onClick={() => deleteMod(mod.id)}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                              {(mod.cost_cents != null || mod.installed_date || mod.mileage != null) && (
                                <p className="mt-1 text-sm text-slate-500">
                                  {[
                                    mod.installed_date ? formatDate(mod.installed_date) : null,
                                    mod.mileage != null ? `${mod.mileage.toLocaleString()} mi` : null,
                                    mod.cost_cents != null ? formatMoney(mod.cost_cents) : null
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                              )}
                              {mod.notes && <p className="mt-2 text-sm">{mod.notes}</p>}
                              {mod.link && (
                                <a
                                  href={mod.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-2 inline-flex items-center gap-1 text-sm text-petrol hover:underline"
                                >
                                  View part <ExternalLink size={13} />
                                </a>
                              )}
                              {mod.media.length > 0 && (
                                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                                  {mod.media.map((media, i) => (
                                    <button
                                      type="button"
                                      key={media.url}
                                      onClick={() => setLightbox({ items: toLightboxItems(mod.media), index: i })}
                                      className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100"
                                    >
                                      <img
                                        src={media.thumbnail_url ?? media.url}
                                        alt=""
                                        loading="lazy"
                                        className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                                      />
                                      {media.media_type === "video" && <PlayBadge size="sm" />}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </article>
                          )
                        )}
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </div>
      )}

      {lightbox && (
        <Lightbox items={lightbox.items} startIndex={lightbox.index} onClose={() => setLightbox(null)} />
      )}
    </section>
  );
}
