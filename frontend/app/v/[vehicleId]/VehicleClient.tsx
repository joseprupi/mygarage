"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { Suspense, use, useState } from "react";
import { ChevronDown, ChevronUp, Download, ExternalLink, Pencil, Plus } from "lucide-react";

import { eventApi, eventDocumentApi, eventMediaApi, getToken, modApi, ownershipApi, reportApi, transferApi, vehicleApi, apiUrl } from "@/lib/api/client";
import { useMe } from "@/lib/useMe";
import type { RecallsResponse } from "@/lib/types";
import { carAvatarUri } from "@/lib/avatar";
import { eventTypeBadge, eventTypeLabel } from "@/lib/events";
import { formatDate, formatMoney } from "@/lib/format";
import { PostCard } from "@/components/PostCard";
import { Lightbox, type LightboxItem } from "@/components/Lightbox";
import { LoadErrorCard } from "@/components/LoadErrorCard";
import { MileageChart } from "@/components/MileageChart";
import { tagLabel } from "@/lib/events";
import { computeVehicleStats, type GapInfo } from "@/lib/stats";
import { ReportDialog } from "@/components/ReportDialog";
import { ShareButton } from "@/components/ShareButton";
import { PlayBadge } from "@/components/VideoPlayer";
import { VehicleModForm } from "@/components/VehicleModForm";
import type { EventMedia, Media, VehicleMod, VehicleOwnership, VehicleTransfer } from "@/lib/types";

// Map a post/mod Media list to lightbox items (video → iframe url, image → full url).
const toLightboxItems = (media: Media[]): LightboxItem[] =>
  media.map((m) => ({ url: m.url, type: m.media_type }));

// Map EventMedia[] to lightbox items — excludes items the viewer cannot see (private/null url).
const eventMediaToLightboxItems = (media: EventMedia[]): LightboxItem[] =>
  media
    .filter((m) => m.canView && m.url !== null)
    .map((m) => ({ url: m.url!, type: m.mediaType }));

// Human-readable labels for provenance editedFields values.
const EDITED_FIELD_LABELS: Record<string, string> = {
  event_date: "date",
  cost_cents: "cost",
  mileage: "mileage",
  shop_name: "shop",
  fuel_gallons: "gallons",
  fuel_price_cents: "price/gal"
};

// Human-readable labels for PII kind identifiers.
const PII_KIND_LABELS: Record<string, string> = {
  name: "name",
  address: "address",
  phone: "phone",
  email: "email",
  license_number: "driver's license",
  signature: "signature",
  vin: "VIN",
  plate: "license plate",
  payment_card: "payment card",
  other: "other personal info"
};

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
  const ownerFilterParam = searchParams.get("owner") ?? "all";
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [lightbox, setLightbox] = useState<{ items: LightboxItem[]; index: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showAllStats, setShowAllStats] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  // Mods (Specs tab): which form is open ("new" to add, a mod id to edit, null to hide).
  const [modForm, setModForm] = useState<"new" | string | null>(null);
  const [modError, setModError] = useState<string | null>(null);
  // Recall card expand state: set of campaignNumbers that are expanded.
  const [expandedRecalls, setExpandedRecalls] = useState<Set<string>>(new Set());
  // VIN decode-on-page state (Specs tab "Decode VIN" / "Re-decode" button).
  const [vinDecoding, setVinDecoding] = useState(false);
  const [vinDecodeError, setVinDecodeError] = useState<string | null>(null);
  const [dismissedGapIds, setDismissedGapIds] = useState<Set<string>>(new Set());
  const [statsScope, setStatsScope] = useState<"current" | "lifetime">("current");
  const [ownershipForm, setOwnershipForm] = useState<null | "new" | string>(null);
  const [ownershipError, setOwnershipError] = useState<string | null>(null);
  const [ownershipFormData, setOwnershipFormData] = useState({
    label: "Previous owner",
    startDate: "",
    startMileage: "",
    endDate: "",
    endMileage: ""
  });
  const [ownershipSubmitting, setOwnershipSubmitting] = useState(false);
  const [ownershipSectionOpen, setOwnershipSectionOpen] = useState(false);
  const [mediaPublicError, setMediaPublicError] = useState<string | null>(null);
  // Transfer modal state
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferData, setTransferData] = useState({
    handoverDate: new Date().toISOString().slice(0, 10),
    handoverMileage: "",
    showOwnerName: true,
    keepDocuments: true,
    keepPostsTagged: true
  });
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [pendingTransfer, setPendingTransfer] = useState<VehicleTransfer | null | undefined>(undefined);
  const [reportVehicleOpen, setReportVehicleOpen] = useState(false);
  const queryClient = useQueryClient();
  const vehicle = useQuery({ queryKey: ["vehicle", vehicleId], queryFn: () => vehicleApi.get(vehicleId) });
  const me = useMe();
  const currentUser = me.data as { id: string; settings?: { detectMissedFillups?: boolean; includeEstimatedFuel?: boolean } } | undefined;
  const posts = useQuery({ queryKey: ["vehiclePosts", vehicleId], queryFn: () => vehicleApi.posts(vehicleId), enabled: tab === "posts" });
  const gallery = useQuery({ queryKey: ["vehicleGallery", vehicleId], queryFn: () => vehicleApi.gallery(vehicleId), enabled: tab === "gallery" });
  // Specs also needs events: when the vehicle has no mileage of its own we
  // derive it from the latest recorded reading in the history.
  const events = useQuery({ queryKey: ["vehicleEvents", vehicleId], queryFn: () => vehicleApi.events(vehicleId), enabled: tab === "history" || tab === "specs" });
  // Mods feed both the Specs tab (full CRUD list) and the History timeline/chart.
  const mods = useQuery({ queryKey: ["vehicleMods", vehicleId], queryFn: () => vehicleApi.mods(vehicleId), enabled: tab === "specs" || tab === "history" });
  // Ownership periods (History tab only — non-critical, page degrades gracefully if absent).
  const ownerships = useQuery({
    queryKey: ["vehicleOwnerships", vehicleId],
    queryFn: () => ownershipApi.list(vehicleId),
    enabled: tab === "history",
    retry: false
  });
  // Recalls — fetched when Specs tab is active. Non-critical; won't block render.
  const recallsQuery = useQuery<RecallsResponse>({
    queryKey: ["vehicleRecalls", vehicleId],
    queryFn: () => vehicleApi.recalls(vehicleId),
    enabled: tab === "specs",
    retry: false
  });

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

  async function decodeVinOnPage() {
    if (vinDecoding) return;
    setVinDecodeError(null);
    setVinDecoding(true);
    try {
      await vehicleApi.decodeVin(vehicleId);
      await queryClient.invalidateQueries({ queryKey: ["vehicle", vehicleId] });
    } catch (err) {
      setVinDecodeError(err instanceof Error ? err.message : "Decode failed");
    } finally {
      setVinDecoding(false);
    }
  }

  function toggleRecall(campaignNumber: string) {
    setExpandedRecalls((prev) => {
      const next = new Set(prev);
      if (next.has(campaignNumber)) next.delete(campaignNumber);
      else next.add(campaignNumber);
      return next;
    });
  }

  function selectTab(next: Tab) {
    router.replace(next === "posts" ? `/v/${vehicleId}` : `/v/${vehicleId}?tab=${next}`, { scroll: false });
  }

  function setOwnerFilter(value: string) {
    const params = new URLSearchParams();
    params.set("tab", "history");
    if (value !== "all") params.set("owner", value);
    router.replace(`/v/${vehicleId}?${params.toString()}`, { scroll: false });
  }

  if (vehicle.isLoading) return <div>Loading vehicle...</div>;
  if (vehicle.error) return <LoadErrorCard error={vehicle.error} noun="vehicle" />;
  if (!vehicle.data) return <div>Vehicle not found.</div>;

  const isOwner = Boolean(currentUser && currentUser.id === vehicle.data.owner_user_id);
  const v = vehicle.data;

  // Ownership periods
  const allOwnerships = ownerships.data ?? [];
  const currentPeriod = allOwnerships.find((o) => o.isCurrent) ?? null;
  const ownershipLabel = (period: VehicleOwnership): string => {
    if (period.ownerUserId && period.ownerUsername && period.showOwnerName) {
      return `@${period.ownerUsername}`;
    }
    return period.label ?? "Previous owner";
  };

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

  // All events (unfiltered) — used for chart, cost totals, type chips.
  const allEvents = events.data ?? [];

  // Ownership filter: narrow events by period before applying the type filter.
  const ownerFilteredEvents = allEvents.filter((e) => {
    if (ownerFilterParam === "all") return true;
    if (ownerFilterParam === "current")
      return currentPeriod ? e.ownershipId === currentPeriod.id : !e.isPreviousOwner;
    if (ownerFilterParam === "unknown") return e.ownershipId === null && e.isPreviousOwner;
    return e.ownershipId === ownerFilterParam;
  });
  const presentEventTypes = Array.from(new Set(ownerFilteredEvents.map((e) => e.event_type)));
  const filteredEvents = ownerFilteredEvents.filter(
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

  // Stats scope toggle: "Your ownership" (default) shows only the current period's events.
  // "Lifetime" uses all events. Stat tiles + breakdown + export are all driven by statsEvents.
  const statsEvents = statsScope === "current" && currentPeriod
    ? allEvents.filter((e) => e.ownershipId === currentPeriod.id)
    : allEvents;

  // Cost summary — respects the stats scope toggle.
  const totalCostCents = statsEvents.reduce((sum, e) => sum + (e.cost_cents ?? 0), 0);
  const costByType = statsEvents.reduce<Record<string, number>>((acc, e) => {
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
  const stats = computeVehicleStats(v, statsEvents, {
    detectMissedFillups: currentUser?.settings?.detectMissedFillups ?? true,
    includeEstimatedFuel: currentUser?.settings?.includeEstimatedFuel ?? true,
  });
  const activeGaps = stats.gaps.filter((g) => !dismissedGapIds.has(g.beforeEventId));
  const gapMap = new Map<string, GapInfo>(activeGaps.map((g) => [g.beforeEventId, g]));
  const mileagePoints = Object.entries(mileageByDate)
    .map(([date, miles]) => ({ date, miles }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Chart boundary lines at period transitions (every period after the first).
  const chartBoundaries = allOwnerships
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .slice(1)
    .map((o) => ({ date: o.startDate, label: ownershipLabel(o) }))
    .filter((b) => mileagePoints.some((p) => p.date >= b.date));

  // Ownership filter UI: show chips when there are multiple attribution buckets.
  const hasUnknownPeriodEvents = allEvents.some((e) => e.ownershipId === null && e.isPreviousOwner);
  const nonCurrentPeriods = allOwnerships.filter((o) => !o.isCurrent);
  const showOwnershipFilter =
    allOwnerships.length > 1 || (allOwnerships.length >= 1 && hasUnknownPeriodEvents);

  // Ownership period CRUD helpers (owner only).
  async function addOwnershipPeriod() {
    if (ownershipSubmitting) return;
    setOwnershipError(null);
    if (!ownershipFormData.startDate) {
      setOwnershipError("Start date is required.");
      return;
    }
    setOwnershipSubmitting(true);
    try {
      await ownershipApi.create(vehicleId, {
        label: ownershipFormData.label.trim() || null,
        startDate: ownershipFormData.startDate,
        startMileage: ownershipFormData.startMileage ? Number(ownershipFormData.startMileage) : null,
        endDate: ownershipFormData.endDate || null,
        endMileage: ownershipFormData.endMileage ? Number(ownershipFormData.endMileage) : null
      });
      await queryClient.invalidateQueries({ queryKey: ["vehicleOwnerships", vehicleId] });
      setOwnershipForm(null);
      setOwnershipFormData({ label: "Previous owner", startDate: "", startMileage: "", endDate: "", endMileage: "" });
    } catch (err) {
      setOwnershipError(err instanceof Error ? err.message : "Unable to save period");
    } finally {
      setOwnershipSubmitting(false);
    }
  }

  async function saveOwnershipPeriod(id: string) {
    if (ownershipSubmitting) return;
    setOwnershipError(null);
    setOwnershipSubmitting(true);
    const period = allOwnerships.find((o) => o.id === id);
    try {
      await ownershipApi.update(id, {
        label: ownershipFormData.label.trim() || null,
        startDate: ownershipFormData.startDate || undefined,
        startMileage: ownershipFormData.startMileage ? Number(ownershipFormData.startMileage) : null,
        endDate: ownershipFormData.endDate || null,
        endMileage: ownershipFormData.endMileage ? Number(ownershipFormData.endMileage) : null
      });
      await queryClient.invalidateQueries({ queryKey: ["vehicleOwnerships", vehicleId] });
      // The current period's start_date/mileage sync back to vehicle.purchase_date/mileage.
      if (period?.isCurrent) {
        await queryClient.invalidateQueries({ queryKey: ["vehicle", vehicleId] });
      }
      setOwnershipForm(null);
    } catch (err) {
      setOwnershipError(err instanceof Error ? err.message : "Unable to update period");
    } finally {
      setOwnershipSubmitting(false);
    }
  }

  async function deleteOwnershipPeriod(id: string) {
    if (!window.confirm("Delete this ownership period? This cannot be undone.")) return;
    setOwnershipError(null);
    try {
      await ownershipApi.remove(id);
      await queryClient.invalidateQueries({ queryKey: ["vehicleOwnerships", vehicleId] });
    } catch (err) {
      setOwnershipError(err instanceof Error ? err.message : "Unable to delete period");
    }
  }

  async function openTransferModal() {
    setTransferError(null);
    setTransferOpen(true);
    // Pre-fill mileage from vehicle if available
    setTransferData((d) => ({
      ...d,
      handoverDate: new Date().toISOString().slice(0, 10),
      handoverMileage: v?.mileage != null ? String(v.mileage) : d.handoverMileage
    }));
    // Load pending transfer (if any)
    try {
      const p = await transferApi.pending(vehicleId);
      setPendingTransfer(p);
    } catch {
      setPendingTransfer(null);
    }
  }

  async function submitTransfer() {
    if (transferSubmitting) return;
    setTransferError(null);
    setTransferSubmitting(true);
    try {
      const t = await transferApi.create(vehicleId, {
        handoverDate: transferData.handoverDate || null,
        handoverMileage: transferData.handoverMileage ? Number(transferData.handoverMileage) : null,
        showOwnerName: transferData.showOwnerName,
        keepDocuments: transferData.keepDocuments,
        keepPostsTagged: transferData.keepPostsTagged
      });
      setPendingTransfer(t);
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Failed to create transfer");
    } finally {
      setTransferSubmitting(false);
    }
  }

  async function revokeTransfer(id: string) {
    if (!window.confirm("Revoke this transfer link? The receiver will no longer be able to accept.")) return;
    try {
      await transferApi.revoke(id);
      setPendingTransfer(null);
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Failed to revoke");
    }
  }

  async function exportHistory() {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const token = getToken();
      const res = await fetch(apiUrl(`/vehicles/${vehicleId}/history/export`), {
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
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              {/* Recalls indicator — shown when we have recall data and count > 0 */}
              {recallsQuery.data && recallsQuery.data.count > 0 && (
                <button
                  type="button"
                  className="chip shrink-0 bg-red-100 font-semibold text-red-700 hover:bg-red-200"
                  onClick={() => selectTab("specs")}
                  title="Safety recalls — click to view"
                >
                  {recallsQuery.data.count} recall{recallsQuery.data.count !== 1 ? "s" : ""}
                </button>
              )}
              <ShareButton
                title="Share vehicle"
                url={typeof window !== "undefined" ? `${window.location.origin}/v/${v.id}` : `/v/${v.id}`}
              />
              {isOwner ? (
                <>
                  <Link className="btn btn-secondary shrink-0" href={`/vehicles/${v.id}/edit`}>
                    <Pencil size={15} />
                    Edit
                  </Link>
                  <button
                    type="button"
                    className="btn btn-secondary shrink-0"
                    onClick={openTransferModal}
                  >
                    Transfer
                  </button>
                </>
              ) : currentUser ? (
                <button
                  type="button"
                  className="btn btn-secondary shrink-0 text-xs"
                  onClick={() => setReportVehicleOpen(true)}
                >
                  Report
                </button>
              ) : null}
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
          {(allEvents.length > 0 || stats.summary.length > 0) && (
            <div className="surface rounded-2xl p-4">
              {currentPeriod && (
                <div className="mb-3 flex gap-1">
                  <button
                    type="button"
                    onClick={() => setStatsScope("current")}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      statsScope === "current" ? "bg-asphalt text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {isOwner ? "Your ownership" : "Current owner"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatsScope("lifetime")}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      statsScope === "lifetime" ? "bg-asphalt text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Lifetime
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                <div className="rounded-xl border border-slate-200 px-3 py-2 text-center">
                  <p className="text-lg font-extrabold">{statsEvents.length}</p>
                  <p className="text-xs font-semibold text-slate-500">Events</p>
                </div>
                {stats.summary.map((row) => (
                  <div key={row.label} className="rounded-xl border border-slate-200 px-3 py-2 text-center">
                    <p className="text-lg font-extrabold">{row.value}</p>
                    <p className="text-xs font-semibold text-slate-500">{row.label}</p>
                  </div>
                ))}
              </div>
              {Object.keys(costByType).length > 0 && (
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
              )}
              {stats.sections.length > 0 && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setShowAllStats((v) => !v)}
                    className="text-sm font-semibold text-petrol hover:underline"
                  >
                    {showAllStats ? "Hide stats" : "All stats →"}
                  </button>
                  {showAllStats && (
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      {stats.sections.map((section) => (
                        <div key={section.title} className="overflow-hidden rounded-xl border border-slate-200">
                          <p className="bg-slate-50 px-3 py-2 text-xs font-extrabold uppercase tracking-wide">
                            {section.title}
                          </p>
                          {section.rows.map((row, i) => (
                            <div
                              key={`${row.label}-${i}`}
                              className={`flex justify-between gap-3 px-3 py-1.5 text-sm ${i % 2 ? "bg-slate-50" : ""}`}
                            >
                              <span className={row.label.startsWith("  ") ? "pl-3 text-slate-400" : "text-slate-600"}>
                                {row.label.trim()}
                              </span>
                              <span className="font-semibold">{row.value}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {mileagePoints.length >= 2 && <MileageChart points={mileagePoints} boundaries={chartBoundaries} />}
          {/* Type filter chips */}
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
          {/* Ownership filter chips */}
          {showOwnershipFilter && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Owner</span>
              <button
                type="button"
                onClick={() => setOwnerFilter("all")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  ownerFilterParam === "all"
                    ? "bg-asphalt text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All
              </button>
              {currentPeriod && (
                <button
                  type="button"
                  onClick={() => setOwnerFilter("current")}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    ownerFilterParam === "current"
                      ? "bg-asphalt text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {isOwner ? "Your ownership" : "Current owner"}
                </button>
              )}
              {nonCurrentPeriods.map((period) => (
                <button
                  key={period.id}
                  type="button"
                  onClick={() => setOwnerFilter(period.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    ownerFilterParam === period.id
                      ? "bg-asphalt text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {ownershipLabel(period)}
                </button>
              ))}
              {hasUnknownPeriodEvents && (
                <button
                  type="button"
                  onClick={() => setOwnerFilter("unknown")}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    ownerFilterParam === "unknown"
                      ? "bg-asphalt text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Previous owner
                </button>
              )}
            </div>
          )}
          {/* Export + ownership period editing row */}
          <div className="flex items-center justify-between gap-3">
            {isOwner && allOwnerships.length > 0 && (
              <button
                type="button"
                className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
                onClick={() => setOwnershipSectionOpen((o) => !o)}
              >
                Ownership periods
                {ownershipSectionOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            )}
            {(events.data?.length ?? 0) > 0 && (
              <button
                type="button"
                onClick={exportHistory}
                disabled={exporting}
                className="btn btn-secondary ml-auto shrink-0 disabled:opacity-60"
              >
                <Download size={15} />
                {exporting ? "Exporting…" : "Export CSV + photos"}
              </button>
            )}
          </div>
          {exportError && <p className="text-right text-sm text-red-600">{exportError}</p>}
          {/* Ownership periods management (owner only) */}
          {isOwner && ownershipSectionOpen && (
            <div className="surface space-y-3 rounded-2xl p-4">
              <h3 className="text-sm font-bold">Ownership periods</h3>
              {ownershipError && <p className="text-sm text-red-600">{ownershipError}</p>}
              {allOwnerships
                .slice()
                .sort((a, b) => a.ordinal - b.ordinal)
                .map((period) => (
                  <div key={period.id}>
                    {ownershipForm === period.id ? (
                      <form
                        className="space-y-2 rounded-xl border border-slate-200 p-3"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void saveOwnershipPeriod(period.id);
                        }}
                      >
                        <p className="text-xs font-semibold text-slate-500">
                          {period.isCurrent ? "Edit your ownership start" : "Edit period"}
                        </p>
                        {!period.ownerUserId && (
                          <label className="block space-y-1 text-xs">
                            <span>Label</span>
                            <input
                              className="input text-sm"
                              placeholder="e.g. Previous owner, First owner"
                              value={ownershipFormData.label}
                              onChange={(e) => setOwnershipFormData((d) => ({ ...d, label: e.target.value }))}
                            />
                          </label>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block space-y-1 text-xs">
                            <span>{period.isCurrent ? "You took over (date)" : "Start date"}</span>
                            <input
                              className="input text-sm"
                              type="date"
                              value={ownershipFormData.startDate}
                              onChange={(e) => setOwnershipFormData((d) => ({ ...d, startDate: e.target.value }))}
                            />
                          </label>
                          <label className="block space-y-1 text-xs">
                            <span>{period.isCurrent ? "Mileage at purchase" : "Start mileage"}</span>
                            <input
                              className="input text-sm"
                              type="text"
                              inputMode="numeric"
                              placeholder="e.g. 145000"
                              value={ownershipFormData.startMileage}
                              onChange={(e) =>
                                setOwnershipFormData((d) => ({
                                  ...d,
                                  startMileage: e.target.value.replace(/[^\d]/g, "")
                                }))
                              }
                            />
                          </label>
                          {!period.isCurrent && (
                            <>
                              <label className="block space-y-1 text-xs">
                                <span>End date</span>
                                <input
                                  className="input text-sm"
                                  type="date"
                                  value={ownershipFormData.endDate}
                                  onChange={(e) => setOwnershipFormData((d) => ({ ...d, endDate: e.target.value }))}
                                />
                              </label>
                              <label className="block space-y-1 text-xs">
                                <span>End mileage</span>
                                <input
                                  className="input text-sm"
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="e.g. 239000"
                                  value={ownershipFormData.endMileage}
                                  onChange={(e) =>
                                    setOwnershipFormData((d) => ({
                                      ...d,
                                      endMileage: e.target.value.replace(/[^\d]/g, "")
                                    }))
                                  }
                                />
                              </label>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-3 pt-1">
                          <button
                            className="btn btn-primary px-4 py-1.5 text-xs disabled:opacity-60"
                            type="submit"
                            disabled={ownershipSubmitting}
                          >
                            {ownershipSubmitting ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            className="text-xs text-slate-500 hover:text-slate-800"
                            onClick={() => setOwnershipForm(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2 text-sm">
                        <div>
                          <span className="font-medium">{ownershipLabel(period)}</span>
                          <span className="ml-2 text-slate-400 text-xs">
                            {formatDate(period.startDate)}
                            {period.startMileage != null
                              ? ` · ${period.startMileage.toLocaleString()} mi`
                              : ""}
                            {period.endDate ? ` – ${formatDate(period.endDate)}` : " – present"}
                          </span>
                        </div>
                        <div className="flex shrink-0 gap-3">
                          <button
                            type="button"
                            className="text-xs text-slate-500 hover:text-petrol"
                            onClick={() => {
                              setOwnershipFormData({
                                label: period.label ?? "Previous owner",
                                startDate: period.startDate,
                                startMileage: period.startMileage != null ? String(period.startMileage) : "",
                                endDate: period.endDate ?? "",
                                endMileage: period.endMileage != null ? String(period.endMileage) : ""
                              });
                              setOwnershipForm(period.id);
                            }}
                          >
                            Edit
                          </button>
                          {!period.ownerUserId && (
                            <button
                              type="button"
                              className="text-xs text-slate-500 hover:text-red-600"
                              onClick={() => void deleteOwnershipPeriod(period.id)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              {/* Add previous owner form */}
              {ownershipForm === "new" ? (
                <form
                  className="space-y-2 rounded-xl border border-slate-200 p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void addOwnershipPeriod();
                  }}
                >
                  <p className="text-xs font-semibold text-slate-500">Add previous owner</p>
                  <p className="text-xs text-slate-400">Avoid real names of people who aren&apos;t on CarFable.</p>
                  <label className="block space-y-1 text-xs">
                    <span>Label</span>
                    <input
                      className="input text-sm"
                      placeholder="e.g. Previous owner"
                      value={ownershipFormData.label}
                      onChange={(e) => setOwnershipFormData((d) => ({ ...d, label: e.target.value }))}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block space-y-1 text-xs">
                      <span>Start date *</span>
                      <input
                        className="input text-sm"
                        type="date"
                        required
                        value={ownershipFormData.startDate}
                        onChange={(e) => setOwnershipFormData((d) => ({ ...d, startDate: e.target.value }))}
                      />
                    </label>
                    <label className="block space-y-1 text-xs">
                      <span>Start mileage</span>
                      <input
                        className="input text-sm"
                        type="text"
                        inputMode="numeric"
                        placeholder="e.g. 0"
                        value={ownershipFormData.startMileage}
                        onChange={(e) =>
                          setOwnershipFormData((d) => ({
                            ...d,
                            startMileage: e.target.value.replace(/[^\d]/g, "")
                          }))
                        }
                      />
                    </label>
                    <label className="block space-y-1 text-xs">
                      <span>End date</span>
                      <input
                        className="input text-sm"
                        type="date"
                        value={ownershipFormData.endDate}
                        onChange={(e) => setOwnershipFormData((d) => ({ ...d, endDate: e.target.value }))}
                      />
                    </label>
                    <label className="block space-y-1 text-xs">
                      <span>End mileage</span>
                      <input
                        className="input text-sm"
                        type="text"
                        inputMode="numeric"
                        placeholder="e.g. 239000"
                        value={ownershipFormData.endMileage}
                        onChange={(e) =>
                          setOwnershipFormData((d) => ({
                            ...d,
                            endMileage: e.target.value.replace(/[^\d]/g, "")
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      className="btn btn-primary px-4 py-1.5 text-xs disabled:opacity-60"
                      type="submit"
                      disabled={ownershipSubmitting}
                    >
                      {ownershipSubmitting ? "Saving…" : "Add period"}
                    </button>
                    <button
                      type="button"
                      className="text-xs text-slate-500 hover:text-slate-800"
                      onClick={() => setOwnershipForm(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  className="text-xs font-semibold text-petrol hover:underline"
                  onClick={() => {
                    setOwnershipFormData({
                      label: "Previous owner",
                      startDate: "",
                      startMileage: "",
                      endDate: currentPeriod?.startDate ?? "",
                      endMileage: currentPeriod?.startMileage != null ? String(currentPeriod.startMileage) : ""
                    });
                    setOwnershipForm("new");
                  }}
                >
                  + Add previous owner
                </button>
              )}
            </div>
          )}
          {(() => {
            // Build timeline elements with ownership dividers (only when filter is "all").
            const showDividers = ownerFilterParam === "all" && allOwnerships.length > 0;
            const elements: React.ReactNode[] = [];
            let lastOwnerKey: string | null = null;

            // Helper: get the ownership key for a timeline entry.
            const getOwnerKey = (entry: (typeof timeline)[0]): string => {
              if (entry.kind === "event") {
                return entry.event.ownershipId ?? (entry.event.isPreviousOwner ? "unknown" : "current");
              }
              // Mod: attribute by date range.
              const p = allOwnerships.find(
                (o) => o.startDate <= entry.date && (o.endDate == null || o.endDate >= entry.date)
              );
              return p?.id ?? "unknown";
            };

            // Top divider: always show the current period header first.
            if (showDividers && currentPeriod) {
              lastOwnerKey = currentPeriod.id;
              const topMi = currentPeriod.startMileage != null ? ` · ${currentPeriod.startMileage.toLocaleString()} mi` : "";
              elements.push(
                <div key="div-top" className="flex items-center gap-2 border-t border-dashed border-slate-200 py-2 text-xs text-slate-400">
                  <span className="text-slate-300">▸</span>
                  <span>
                    <span className="font-medium text-slate-500">{ownershipLabel(currentPeriod)}</span>
                    {" · "}{formatDate(currentPeriod.startDate)}{topMi}
                  </span>
                </div>
              );
            }

            for (const entry of timeline) {
              const key = showDividers ? getOwnerKey(entry) : null;

              if (showDividers && key !== lastOwnerKey) {
                const period = allOwnerships.find((o) => o.id === key);
                let divText: React.ReactNode;
                if (key === "unknown" || !period) {
                  // Implicit "before known owners" bucket.
                  const untilDate = currentPeriod ? formatDate(currentPeriod.startDate) : "";
                  divText = (
                    <>
                      <span className="font-medium text-slate-500">Previous owner</span>
                      {untilDate ? ` · until ${untilDate}` : ""}
                    </>
                  );
                } else {
                  const mi = period.startMileage != null ? ` · ${period.startMileage.toLocaleString()} mi` : "";
                  divText = (
                    <>
                      <span className="font-medium text-slate-500">{ownershipLabel(period)}</span>
                      {" · "}{formatDate(period.startDate)}{mi}
                    </>
                  );
                }
                elements.push(
                  <div key={`div-${key}-${entry.date}`} className="flex items-center gap-2 border-t border-dashed border-slate-200 py-2 text-xs text-slate-400">
                    <span className="text-slate-300">▸</span>
                    <span>{divText}</span>
                  </div>
                );
                lastOwnerKey = key;
              }

              if (entry.kind === "event") {
                const event = entry.event;
                const gap = isOwner ? gapMap.get(event.id) : undefined;
                elements.push(
                  <div key={entry.key}>
                  <article className="surface rounded-2xl p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${eventTypeBadge(event.event_type)}`}
                      >
                        {eventTypeLabel(event.event_type)}
                      </span>
                      <div className="flex items-center gap-2">
                        {event.hidden && isOwner && (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-500">hidden</span>
                        )}
                        {event.isPreviousOwner && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-400">prev. owner</span>
                        )}
                        {isOwner && (
                          <button
                            type="button"
                            className="text-xs font-medium text-slate-400 hover:text-slate-700"
                            onClick={async () => {
                              try {
                                await eventApi.setHidden(event.id, !event.hidden);
                                await queryClient.invalidateQueries({ queryKey: ["vehicleEvents", vehicleId] });
                              } catch {
                                // silent fail — the toggle stays at its previous value
                              }
                            }}
                          >
                            {event.hidden ? "Unhide" : "Hide"}
                          </button>
                        )}
                        {event.canEdit && (
                          <Link
                            className="text-xs font-medium text-slate-500 hover:text-petrol"
                            href={`/vehicles/${vehicleId}/events/${event.id}/edit`}
                          >
                            Edit
                          </Link>
                        )}
                      </div>
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
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm text-slate-500">
                        {event.event_date ? formatDate(event.event_date) : ""}
                        {event.mileage ? ` · ${event.mileage.toLocaleString()} mi` : ""}
                        {event.cost_cents ? ` · ${formatMoney(event.cost_cents)}` : ""}
                      </p>
                      {/* Provenance badge — visible to everyone as a trust signal. */}
                      {event.source === "scan" && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                          From receipt
                        </span>
                      )}
                      {event.source === "scan_edited" && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                          From receipt
                          {event.editedFields.length > 0 && (
                            <> · edited: {event.editedFields.map((f) => EDITED_FIELD_LABELS[f] ?? f).join(", ")}</>
                          )}
                        </span>
                      )}
                    </div>
                    {(event.shop_name || event.location) && (
                      <p className="text-sm text-slate-500">
                        {[event.shop_name, event.location].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {event.description && (
                      <p className="mt-2 whitespace-pre-line text-sm">{event.description}</p>
                    )}
                    {event.media.length > 0 && (() => {
                      // Pre-compute the viewable lightbox items for this event.
                      const lbItems = eventMediaToLightboxItems(event.media);
                      return (
                        <div className="mt-3 space-y-2">
                          <div className="flex gap-2 overflow-x-auto pb-1">
                            {event.media.map((m) => {
                              if (!m.canView) {
                                // Non-viewable: show blurred placeholder + lock.
                                return (
                                  <div
                                    key={m.id}
                                    className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100"
                                    title="Receipt on file"
                                  >
                                    {m.blurUrl ? (
                                      <img
                                        src={m.blurUrl}
                                        alt=""
                                        className="h-full w-full object-cover blur-sm"
                                      />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center text-2xl text-slate-300">
                                        📄
                                      </div>
                                    )}
                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/35 text-white">
                                      <span className="text-base leading-none">🔒</span>
                                      <span className="mt-0.5 text-center text-[9px] leading-tight">
                                        Receipt on file
                                      </span>
                                    </div>
                                  </div>
                                );
                              }
                              // Viewable — find lightbox index within viewable items only.
                              const viewableItems = event.media.filter((x) => x.canView && x.url !== null);
                              const lbIndex = viewableItems.findIndex((x) => x.id === m.id);
                              return (
                                <button
                                  type="button"
                                  key={m.id}
                                  onClick={() => setLightbox({ items: lbItems, index: lbIndex })}
                                  className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100"
                                >
                                  <img
                                    src={m.thumbnailUrl ?? m.url!}
                                    alt=""
                                    loading="lazy"
                                    className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                                  />
                                  {/* Lock overlay when private but viewable (owner sees own private items) */}
                                  {!m.isPublic && (
                                    <span
                                      className="absolute bottom-0.5 right-0.5 rounded-full bg-black/50 px-1 text-[10px] leading-4 text-white"
                                      title="Private"
                                    >
                                      🔒
                                    </span>
                                  )}
                                  {m.mediaType === "video" && <PlayBadge size="sm" />}
                                </button>
                              );
                            })}
                          </div>
                          {/* Owner-only: PII status + visibility controls per media item. */}
                          {isOwner && event.media.some((m) => m.piiStatus !== "none" || !m.isPublic) && (
                            <div className="space-y-1.5">
                              {mediaPublicError && (
                                <p className="text-xs text-red-600">{mediaPublicError}</p>
                              )}
                              {event.media.map((m, idx) => (
                                <div
                                  key={m.id}
                                  className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs"
                                >
                                  <span className="shrink-0 font-medium text-slate-500">
                                    Photo {idx + 1}
                                  </span>
                                  {m.piiStatus === "detected" && (
                                    <span className="text-amber-700">
                                      Contains personal info:{" "}
                                      {m.piiKinds.map((k) => PII_KIND_LABELS[k] ?? k).join(", ")}
                                    </span>
                                  )}
                                  {m.piiStatus === "unknown" && (
                                    <span className="text-slate-400">Checking for personal info…</span>
                                  )}
                                  <label className="ml-auto flex cursor-pointer items-center gap-1.5">
                                    <input
                                      type="checkbox"
                                      className="h-3.5 w-3.5 accent-petrol disabled:cursor-not-allowed"
                                      checked={m.isPublic}
                                      disabled={m.piiStatus !== "none"}
                                      onChange={async (e) => {
                                        setMediaPublicError(null);
                                        try {
                                          await eventMediaApi.setPublic(m.id, e.target.checked);
                                          await queryClient.invalidateQueries({ queryKey: ["vehicleEvents", vehicleId] });
                                        } catch (err) {
                                          setMediaPublicError(err instanceof Error ? err.message : "Failed to update visibility");
                                        }
                                      }}
                                    />
                                    <span className={m.piiStatus !== "none" ? "text-slate-400" : ""}>
                                      {m.piiStatus === "none"
                                        ? "Visible to everyone"
                                        : m.piiStatus === "detected"
                                          ? "Locked private — contains personal info"
                                          : "Locked until checked"}
                                    </span>
                                  </label>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {event.documents?.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <ul className="space-y-1">
                          {event.documents.map((doc) => {
                            if (!doc.canView) {
                              return (
                                <li
                                  key={doc.id}
                                  className="inline-flex items-center gap-1.5 text-sm text-slate-400"
                                >
                                  🔒 Receipt on file
                                </li>
                              );
                            }
                            return (
                              <li key={doc.id}>
                                <a
                                  href={doc.url!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-sm text-petrol hover:underline"
                                >
                                  📄 {doc.filename}
                                  {!doc.isPublic && (
                                    <span className="text-xs text-slate-400">(private)</span>
                                  )}
                                </a>
                              </li>
                            );
                          })}
                        </ul>
                        {/* Owner-only: visibility controls for document items. */}
                        {isOwner && event.documents.some((d) => d.piiStatus !== "none" || !d.isPublic) && (
                          <div className="space-y-1.5 pt-1">
                            {event.documents.map((doc, idx) => (
                              <div
                                key={doc.id}
                                className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs"
                              >
                                <span className="shrink-0 font-medium text-slate-500">
                                  Doc {idx + 1} — {doc.filename}
                                </span>
                                {doc.piiStatus === "detected" && (
                                  <span className="text-amber-700">
                                    Contains personal info:{" "}
                                    {doc.piiKinds.map((k) => PII_KIND_LABELS[k] ?? k).join(", ")}
                                  </span>
                                )}
                                {doc.piiStatus === "unknown" && (
                                  <span className="text-slate-400">Checking for personal info…</span>
                                )}
                                <label className="ml-auto flex cursor-pointer items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 accent-petrol disabled:cursor-not-allowed"
                                    checked={doc.isPublic}
                                    disabled={doc.piiStatus !== "none"}
                                    onChange={async (e) => {
                                      setMediaPublicError(null);
                                      try {
                                        await eventDocumentApi.setPublic(doc.id, e.target.checked);
                                        await queryClient.invalidateQueries({ queryKey: ["vehicleEvents", vehicleId] });
                                      } catch (err) {
                                        setMediaPublicError(err instanceof Error ? err.message : "Failed to update visibility");
                                      }
                                    }}
                                  />
                                  <span className={doc.piiStatus !== "none" ? "text-slate-400" : ""}>
                                    {doc.piiStatus === "none"
                                      ? "Visible to everyone"
                                      : doc.piiStatus === "detected"
                                        ? "Locked private — contains personal info"
                                        : "Locked until checked"}
                                  </span>
                                </label>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                  {gap && (
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                      <span>
                        <span className="font-medium">Possible missed fill-up</span>
                        {" "}~{gap.date} · ~{gap.estGallons.toFixed(1)} gal
                        {gap.estCostCents != null ? ` · ~$${(gap.estCostCents / 100).toFixed(0)}` : ""}
                      </span>
                      <div className="flex shrink-0 gap-2">
                        <a
                          href={`/vehicles/${vehicleId}/events/new?type=fuel&date=${gap.date}&gallons=${gap.estGallons.toFixed(1)}${gap.estCostCents != null ? `&costCents=${gap.estCostCents}` : ""}`}
                          className="rounded-full bg-asphalt px-3 py-1 text-xs font-semibold text-white hover:opacity-80"
                        >
                          Add it
                        </a>
                        <button
                          type="button"
                          className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-100"
                          onClick={async () => {
                            await eventApi.update(gap.beforeEventId, { fuelMissedPrevious: false });
                            setDismissedGapIds((prev) => new Set([...prev, gap.beforeEventId]));
                          }}
                        >
                          Not missed
                        </button>
                      </div>
                    </div>
                  )}
                  </div>
                ); // close elements.push for event card
              } else {
                const mod = entry.mod;
                elements.push(
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
              }
            }
            return elements;
          })()}
        </div>
      )}
      {tab === "specs" && (
        <div className="space-y-6">
          {/* ── Decoded VIN Specifications card ─────────────────────────────── */}
          {v.specs ? (
            <div className="surface rounded-3xl p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold">Specifications</h2>
                {isOwner && v.vin && (
                  <button
                    type="button"
                    className="btn btn-secondary text-xs disabled:opacity-60"
                    disabled={vinDecoding}
                    onClick={() => void decodeVinOnPage()}
                  >
                    {vinDecoding ? "Decoding…" : "Re-decode"}
                  </button>
                )}
              </div>
              {vinDecodeError && (
                <p className="mb-3 text-sm text-red-600">{vinDecodeError}</p>
              )}
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {v.specs.displacementL != null || v.specs.engineCylinders != null ? (
                  <div>
                    <dt className="font-semibold">Engine</dt>
                    <dd className="text-slate-600">
                      {[
                        v.specs.displacementL != null ? `${v.specs.displacementL.toFixed(1)}L` : null,
                        v.specs.engineCylinders != null ? `V${v.specs.engineCylinders}` : null,
                        v.specs.engineHp != null ? `· ${v.specs.engineHp} hp` : null
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </dd>
                  </div>
                ) : null}
                {v.specs.driveType && (
                  <div>
                    <dt className="font-semibold">Drivetrain</dt>
                    <dd className="text-slate-600">{v.specs.driveType}</dd>
                  </div>
                )}
                {v.specs.bodyClass && (
                  <div>
                    <dt className="font-semibold">Body</dt>
                    <dd className="text-slate-600">{v.specs.bodyClass}</dd>
                  </div>
                )}
                {v.specs.fuelType && (
                  <div>
                    <dt className="font-semibold">Fuel</dt>
                    <dd className="text-slate-600">{v.specs.fuelType}</dd>
                  </div>
                )}
                {v.specs.transmission && (
                  <div>
                    <dt className="font-semibold">Transmission</dt>
                    <dd className="text-slate-600">{v.specs.transmission}</dd>
                  </div>
                )}
                {v.specs.plantCountry && (
                  <div>
                    <dt className="font-semibold">Built in</dt>
                    <dd className="text-slate-600">{v.specs.plantCountry}</dd>
                  </div>
                )}
              </dl>
            </div>
          ) : (
            /* No specs yet */
            isOwner ? (
              <div className="surface rounded-3xl p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold">Specifications</h2>
                    {v.vin ? (
                      <p className="mt-1 text-sm text-slate-500">
                        Decode the VIN to auto-fill engine, drivetrain, and body specs.
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-slate-500">
                        Add the VIN in <a href={`/vehicles/${v.id}/edit`} className="text-petrol hover:underline">Edit</a> to auto-fill specs.
                      </p>
                    )}
                    {vinDecodeError && <p className="mt-2 text-sm text-red-600">{vinDecodeError}</p>}
                  </div>
                  {v.vin && (
                    <button
                      type="button"
                      className="btn btn-secondary shrink-0 disabled:opacity-60"
                      disabled={vinDecoding}
                      onClick={() => void decodeVinOnPage()}
                    >
                      {vinDecoding ? "Decoding…" : "Decode VIN"}
                    </button>
                  )}
                </div>
              </div>
            ) : null
          )}

          {/* ── Vehicle overview fields (year/make/model/etc.) ─────────────── */}
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

          {/* ── Recalls ─────────────────────────────────────────────────────── */}
          <div className="surface rounded-3xl p-6">
            <h2 className="mb-4 text-lg font-bold">Recalls</h2>
            {recallsQuery.isLoading ? (
              <p className="text-sm text-slate-500">Loading recalls…</p>
            ) : recallsQuery.data?.unavailable ? (
              <p className="text-sm text-slate-500">Recall service unavailable.</p>
            ) : recallsQuery.error ? (
              <p className="text-sm text-slate-500">Recall data could not be loaded.</p>
            ) : recallsQuery.data && recallsQuery.data.count === 0 ? (
              <p className="text-sm text-slate-500">
                No recalls found for {[v.year, v.make, v.model].filter(Boolean).join(" ")}.
              </p>
            ) : recallsQuery.data ? (
              <div className="space-y-3">
                {[...recallsQuery.data.results]
                  .sort((a, b) =>
                    (b.reportReceivedDate ?? "").localeCompare(a.reportReceivedDate ?? "")
                  )
                  .map((recall) => {
                    const expanded = expandedRecalls.has(recall.campaignNumber);
                    return (
                      <div
                        key={recall.campaignNumber}
                        className="rounded-2xl border border-slate-200 p-4"
                      >
                        <div className="flex flex-wrap items-start gap-2">
                          <span className="chip shrink-0 font-mono text-xs">
                            {recall.campaignNumber}
                          </span>
                          {recall.parkIt && (
                            <span className="chip shrink-0 bg-red-600 font-semibold text-white">
                              Do not drive
                            </span>
                          )}
                          {!recall.parkIt && recall.parkOutside && (
                            <span className="chip shrink-0 bg-amber-500 font-semibold text-white">
                              Park outside
                            </span>
                          )}
                          {recall.reportReceivedDate && (
                            <span className="text-xs text-slate-400 self-center">
                              {recall.reportReceivedDate}
                            </span>
                          )}
                        </div>
                        {recall.component && (
                          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {recall.component}
                          </p>
                        )}
                        {recall.summary && (
                          <p className={`mt-1 text-sm ${expanded ? "" : "line-clamp-2"}`}>
                            {recall.summary}
                          </p>
                        )}
                        {(recall.consequence || recall.remedy) && !expanded && (
                          <button
                            type="button"
                            className="mt-1 text-xs font-semibold text-petrol hover:underline"
                            onClick={() => toggleRecall(recall.campaignNumber)}
                          >
                            More
                          </button>
                        )}
                        {expanded && (
                          <>
                            {recall.consequence && (
                              <div className="mt-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Consequence
                                </p>
                                <p className="text-sm">{recall.consequence}</p>
                              </div>
                            )}
                            {recall.remedy && (
                              <div className="mt-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Remedy
                                </p>
                                <p className="text-sm">{recall.remedy}</p>
                              </div>
                            )}
                            <button
                              type="button"
                              className="mt-1 text-xs font-semibold text-petrol hover:underline"
                              onClick={() => toggleRecall(recall.campaignNumber)}
                            >
                              Less
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
              </div>
            ) : null}
          </div>

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

      {/* Transfer ownership modal */}
      {transferOpen && isOwner && (
        <TransferModal
          vehicleLabel={[v.year, v.make, v.model].filter(Boolean).join(" ")}
          pending={pendingTransfer}
          data={transferData}
          onChange={setTransferData}
          submitting={transferSubmitting}
          error={transferError}
          onSubmit={submitTransfer}
          onRevoke={(id) => void revokeTransfer(id)}
          onClose={() => { setTransferOpen(false); setPendingTransfer(undefined); }}
        />
      )}

      {reportVehicleOpen && (
        <ReportDialog
          target={{ type: "vehicle", id: v.id, label: [v.year, v.make, v.model].filter(Boolean).join(" ") }}
          onClose={() => setReportVehicleOpen(false)}
        />
      )}
    </section>
  );
}

// ─── Transfer Ownership Modal ────────────────────────────────────────────────

function TransferModal({
  vehicleLabel,
  pending,
  data,
  onChange,
  submitting,
  error,
  onSubmit,
  onRevoke,
  onClose
}: {
  vehicleLabel: string;
  pending: VehicleTransfer | null | undefined;
  data: {
    handoverDate: string;
    handoverMileage: string;
    showOwnerName: boolean;
    keepDocuments: boolean;
    keepPostsTagged: boolean;
  };
  onChange: React.Dispatch<React.SetStateAction<{
    handoverDate: string;
    handoverMileage: string;
    showOwnerName: boolean;
    keepDocuments: boolean;
    keepPostsTagged: boolean;
  }>>;
  submitting: boolean;
  error: string | null;
  onSubmit: () => void;
  onRevoke: (id: string) => void;
  onClose: () => void;
}) {
  const { useEffect, useId, useState: useLocalState } = React;
  const titleId = useId();
  const [copied, setCopied] = useLocalState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  const loading = pending === undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="surface flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-3xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-base font-semibold">Transfer ownership — {vehicleLabel}</h2>
          <button
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-asphalt"
            onClick={onClose}
            aria-label="Close"
            type="button"
          >
            ✕
          </button>
        </header>

        {loading ? (
          <p className="py-6 text-center text-sm text-slate-500">Loading…</p>
        ) : pending ? (
          /* Pending transfer — show code + link */
          <div className="space-y-4">
            <p className="text-sm text-slate-600">A transfer link is active. Share it with the new owner.</p>
            <div className="rounded-2xl border border-dashed border-petrol/40 bg-petrol/5 p-4 text-center">
              <p className="font-mono text-2xl font-bold tracking-widest text-petrol">{pending.code}</p>
              <p className="mt-1 text-xs text-slate-500">Expires {new Date(pending.expiresAt).toLocaleDateString()}</p>
            </div>
            <div className="flex gap-2">
              <input
                className="input flex-1 font-mono text-xs"
                readOnly
                value={pending.url}
              />
              <button
                type="button"
                className="btn btn-primary shrink-0"
                onClick={() => void copyLink(pending.url)}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="button"
              className="text-xs text-slate-500 hover:text-red-600"
              onClick={() => onRevoke(pending.id)}
            >
              Revoke link
            </button>
          </div>
        ) : (
          /* No pending transfer — show form */
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
          >
            <p className="text-sm text-slate-600">
              The vehicle history, mods, and media stay with the car. A one-time link (7-day expiry) lets the new owner accept.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1 text-sm">
                <span>Handover date</span>
                <input
                  type="date"
                  className="input text-sm"
                  value={data.handoverDate}
                  onChange={(e) => onChange((d) => ({ ...d, handoverDate: e.target.value }))}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span>Handover mileage</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="input text-sm"
                  placeholder="e.g. 95000"
                  value={data.handoverMileage}
                  onChange={(e) => onChange((d) => ({ ...d, handoverMileage: e.target.value.replace(/[^\d]/g, "") }))}
                />
              </label>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-slate-700">Options</legend>
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-petrol"
                  checked={data.showOwnerName}
                  onChange={(e) => onChange((d) => ({ ...d, showOwnerName: e.target.checked }))}
                />
                <span className="space-y-0.5">
                  <span className="block font-medium">Show my name on the previous-owner period</span>
                  <span className="block text-xs text-slate-500">Unchecking shows "Previous owner" instead of your username.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-petrol"
                  checked={data.keepDocuments}
                  onChange={(e) => onChange((d) => ({ ...d, keepDocuments: e.target.checked }))}
                />
                <span className="space-y-0.5">
                  <span className="block font-medium">Keep receipts/documents attached</span>
                  <span className="block text-xs text-slate-500">Unchecking removes document files from your period's events (amounts stay).</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-petrol"
                  checked={data.keepPostsTagged}
                  onChange={(e) => onChange((d) => ({ ...d, keepPostsTagged: e.target.checked }))}
                />
                <span className="space-y-0.5">
                  <span className="block font-medium">Keep my posts tagged to this vehicle</span>
                  <span className="block text-xs text-slate-500">Posts remain yours; the vehicle's Posts tab keeps showing them with attribution.</span>
                </span>
              </label>
            </fieldset>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="btn btn-primary disabled:opacity-60"
                disabled={submitting}
              >
                {submitting ? "Generating…" : "Generate transfer link"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
