// Server-side data for the logged-out home page (app/page.tsx). Everything is
// derived from the featured vehicle's public endpoints, fetched anonymously, so
// the numbers on the landing are the same ones any visitor can check on /v/{id}.
// Never throws: each part is null when its data is missing.

import { serverFetch } from "@/lib/api/serverBase";
import { FEATURED_VEHICLE_ID } from "@/lib/featured";
import type { EventMedia, Vehicle, VehicleEvent, VehicleOwnership } from "@/lib/types";

export type LandingEventRow = {
  id: string;
  eventType: string;
  title: string;
  date: string | null;
  mileage: number | null;
  costCents: number | null;
  fromReceipt: boolean;
  previousOwner: boolean;
  receiptCount: number;
};

export type LandingHeroPair = {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  eventType: string;
  title: string;
  costCents: number | null;
  date: string | null;
  mileage: number | null;
  shop: string | null;
  fromReceipt: boolean;
};

export type LandingCar = {
  id: string;
  label: string;
  coverUrl: string | null;
  recordCount: number;
  firstYear: number | null;
  years: number | null;
  owners: number | null;
  receipts: number;
  totalCents: number;
  milesSpan: number | null;
  chartPoints: { date: string; miles: number }[];
  chartBoundary: { date: string; label: string } | null;
  rows: LandingEventRow[];
};

export type LandingData = {
  hero: LandingHeroPair | null;
  car: LandingCar | null;
};

const year = (d: string) => Number(d.slice(0, 4));
const receiptCount = (e: VehicleEvent) => (e.media?.length ?? 0) + (e.documents?.length ?? 0);
const isFromReceipt = (e: VehicleEvent) => e.source === "scan" || e.source === "scan_edited";

// Newest first: by event date, then creation time; undated events last.
function newestFirst(a: VehicleEvent, b: VehicleEvent): number {
  const ad = a.event_date ?? "";
  const bd = b.event_date ?? "";
  if (ad !== bd) return bd.localeCompare(ad);
  return (b.created_at ?? "").localeCompare(a.created_at ?? "");
}

/** The hero shows a receipt with personal details blurred, so only the public redacted copy qualifies. */
function publicImageUrl(m: EventMedia): string | null {
  if (m.mediaType !== "image") return null;
  if (m.visibility === "redacted" && m.redactedUrl) return m.redactedUrl;
  return null;
}

function pickHero(events: VehicleEvent[]): LandingHeroPair | null {
  let best: { e: VehicleEvent; m: EventMedia; url: string } | null = null;
  for (const e of events) {
    for (const m of e.media ?? []) {
      const url = publicImageUrl(m);
      if (!url) continue;
      if (!best || (e.cost_cents ?? 0) > (best.e.cost_cents ?? 0)) best = { e, m, url };
      break; // first public image of each event is enough
    }
  }
  if (!best) return null;
  const { e, m, url } = best;
  const hasDims = !!m.width && !!m.height;
  return {
    imageUrl: url,
    // Receipts are portrait photos; 3:4 when the API doesn't know the size.
    imageWidth: hasDims ? m.width! : 620,
    imageHeight: hasDims ? m.height! : 827,
    eventType: e.event_type,
    title: e.title,
    costCents: e.cost_cents ?? null,
    date: e.event_date ?? null,
    mileage: e.mileage ?? null,
    shop: e.shop_name ?? null,
    fromReceipt: isFromReceipt(e)
  };
}

function toRow(e: VehicleEvent): LandingEventRow {
  return {
    id: e.id,
    eventType: e.event_type,
    title: e.title,
    date: e.event_date ?? null,
    mileage: e.mileage ?? null,
    costCents: e.cost_cents ?? null,
    fromReceipt: isFromReceipt(e),
    previousOwner: !!e.isPreviousOwner,
    receiptCount: receiptCount(e)
  };
}

// The most recent event plus the three most expensive others (preferring ones
// with a receipt on file, since the section is about receipts), newest first.
function pickRows(events: VehicleEvent[]): LandingEventRow[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort(newestFirst);
  const latest = sorted[0];
  const others = sorted.slice(1).sort((a, b) => (b.cost_cents ?? 0) - (a.cost_cents ?? 0));
  const withReceipt = others.filter((e) => receiptCount(e) > 0);
  const withoutReceipt = others.filter((e) => receiptCount(e) === 0);
  const picked = [...withReceipt, ...withoutReceipt].slice(0, 3);
  return [latest, ...picked].sort(newestFirst).map(toRow);
}

function buildCar(v: Vehicle, events: VehicleEvent[], ownerships: VehicleOwnership[] | null): LandingCar {
  const label = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
  const dated = events.filter((e) => !!e.event_date).map((e) => e.event_date!).sort();
  const firstYear = dated.length ? year(dated[0]) : null;
  const lastYear = dated.length ? year(dated[dated.length - 1]) : null;

  const miles = events.map((e) => e.mileage).filter((m): m is number => typeof m === "number");
  const milesSpan = miles.length >= 2 ? Math.max(...miles) - Math.min(...miles) : null;

  // Same rule as the vehicle page chart: one reading per date, highest wins.
  const byDate: Record<string, number> = {};
  for (const e of events) {
    if (e.event_date && e.mileage != null) byDate[e.event_date] = Math.max(byDate[e.event_date] ?? e.mileage, e.mileage);
  }
  const chartPoints = Object.entries(byDate)
    .map(([date, m]) => ({ date, miles: m }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const current = ownerships?.find((o) => o.isCurrent) ?? null;
  let chartBoundary: LandingCar["chartBoundary"] = null;
  if (current && ownerships && ownerships.length > 1) {
    const who = current.ownerUsername && current.showOwnerName ? `Sold to @${current.ownerUsername}` : "Sold to current owner";
    chartBoundary = { date: current.startDate, label: who };
  }

  return {
    id: v.id,
    label,
    coverUrl: v.cover_image_url ?? null,
    recordCount: events.length,
    firstYear,
    years: firstYear != null && lastYear != null ? lastYear - firstYear : null,
    owners: ownerships ? Math.max(ownerships.length, 1) : null,
    receipts: events.reduce((n, e) => n + receiptCount(e), 0),
    totalCents: events.reduce((n, e) => n + (e.cost_cents ?? 0), 0),
    milesSpan,
    chartPoints,
    chartBoundary,
    rows: pickRows(events)
  };
}

export async function loadLanding(): Promise<LandingData> {
  const id = encodeURIComponent(FEATURED_VEHICLE_ID);
  const [vehicle, events, ownerships] = await Promise.all([
    serverFetch<Vehicle>(`/vehicles/${id}`),
    serverFetch<VehicleEvent[]>(`/vehicles/${id}/events`),
    serverFetch<VehicleOwnership[]>(`/vehicles/${id}/ownerships`)
  ]);
  const evs = Array.isArray(events) ? events : null;
  const owns = Array.isArray(ownerships) ? ownerships : null;
  try {
    return {
      hero: evs ? pickHero(evs) : null,
      car: vehicle && evs && evs.length > 0 ? buildCar(vehicle, evs, owns) : null
    };
  } catch {
    return { hero: null, car: null };
  }
}
