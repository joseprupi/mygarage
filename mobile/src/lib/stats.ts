// Derived vehicle statistics from history events + the purchase origin.
// One source of truth for both the History-tab summary row and the Stats screen.

import type { Vehicle, VehicleEvent } from "@/lib/api";
import { formatMoney } from "@/lib/events";

export type StatRow = { label: string; value: string };
export type StatSection = { title: string; rows: StatRow[] };

export type GapInfo = {
  /** id of the earlier (older) full-tank fill that starts the gap segment */
  afterEventId: string;
  /** id of the later (newer) full-tank fill whose fuel_missed_previous we'd clear for "Not missed" */
  beforeEventId: string;
  /** ISO date of the midpoint between the two events */
  date: string;
  estGallons: number;
  estCostCents: number | null;
};

type MileagePoint = { t: number; miles: number };

function toTime(d: string): number {
  return Date.parse(`${d}T00:00:00Z`);
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export type VehicleStats = {
  /** The compact numbers for the History tab (already formatted). */
  summary: StatRow[];
  /** Full geek-mode table. */
  sections: StatSection[];
  hasAny: boolean;
  /** Inferred gap cards for the history timeline. */
  gaps: GapInfo[];
  missedCount: number;
  estimatedGallons: number;
  estimatedCents: number;
};

export type StatsOptions = {
  detectMissedFillups?: boolean;
  includeEstimatedFuel?: boolean;
};

export function computeVehicleStats(
  vehicle: Vehicle,
  events: VehicleEvent[],
  options: StatsOptions = {},
): VehicleStats {
  const detectMissed = options.detectMissedFillups ?? true;
  const includeEst = options.includeEstimatedFuel ?? true;
  // --- mileage timeline (events + purchase origin) ---
  const pts: MileagePoint[] = events
    .filter((e) => e.mileage != null && e.event_date)
    .map((e) => ({ t: toTime(e.event_date as string), miles: e.mileage as number }));
  if (vehicle.purchase_date && vehicle.mileage != null) {
    pts.push({ t: toTime(vehicle.purchase_date), miles: vehicle.mileage });
  }
  pts.sort((a, b) => a.t - b.t);

  const milesDriven = pts.length >= 2 ? pts[pts.length - 1].miles - pts[0].miles : null;
  const daySpan = pts.length >= 2 ? (pts[pts.length - 1].t - pts[0].t) / 86_400_000 : null;
  const milesPerYear =
    milesDriven != null && daySpan != null && daySpan >= 30
      ? Math.round((milesDriven / daySpan) * 365)
      : null;

  // --- money ---
  const totalSpendCents = events.reduce((sum, e) => sum + (e.cost_cents ?? 0), 0);
  const byCategory = new Map<string, number>();
  for (const e of events) {
    if (e.cost_cents) byCategory.set(e.event_type, (byCategory.get(e.event_type) ?? 0) + e.cost_cents);
  }

  // --- fuel: segment-based MPG with gap detection ---
  const allFuelEvents = events
    .filter((e) => e.event_type === "fuel")
    .sort((a, b) => toTime(a.event_date ?? "1970-01-01") - toTime(b.event_date ?? "1970-01-01"));

  // Weighted average price per gallon across all fills (fallback for phantom cost estimate)
  const pricedGallons = allFuelEvents.reduce(
    (sum, e) => sum + (e.fuel_price_cents != null && e.fuel_gallons ? e.fuel_gallons : 0),
    0,
  );
  const weightedPriceCents = allFuelEvents.reduce(
    (sum, e) =>
      sum + (e.fuel_price_cents != null && e.fuel_gallons ? e.fuel_price_cents * e.fuel_gallons : 0),
    0,
  );
  const avgPricePerGalCents = pricedGallons > 0 ? weightedPriceCents / pricedGallons : null;

  // Build segments between consecutive full-tank fills.
  // fuel_full_tank defaults to true; false = partial fill (accumulates into next full fill).
  type Seg = {
    startEvent: VehicleEvent;
    endEvent: VehicleEvent;
    miles: number;
    gallons: number;
    mpg: number;
    missedPrev: boolean | null;
    excludeBasic: boolean;
    inferredGap: boolean;
    estGallons: number;
    estCostCents: number | null;
  };

  const segments: Seg[] = [];
  let prevFull: VehicleEvent | null = null;
  let accGallons = 0;

  for (const ev of allFuelEvents) {
    if (ev.fuel_full_tank === false) {
      // Partial fill: accumulate gallons into next full segment
      accGallons += ev.fuel_gallons ?? 0;
    } else {
      // Full-tank fill (or default true)
      if (prevFull && prevFull.mileage != null && ev.mileage != null) {
        const miles = ev.mileage - prevFull.mileage;
        const gallons = (ev.fuel_gallons ?? 0) + accGallons;
        const mpg = gallons > 0 && miles > 0 ? miles / gallons : 0;
        const missed = ev.fuel_missed_previous ?? null;
        const excludeBasic = miles <= 0 || gallons <= 0 || mpg > 150;
        segments.push({
          startEvent: prevFull,
          endEvent: ev,
          miles,
          gallons,
          mpg,
          missedPrev: missed,
          excludeBasic,
          inferredGap: false,
          estGallons: 0,
          estCostCents: null,
        });
      }
      prevFull = ev;
      accGallons = 0;
    }
  }

  // Segments valid for MPG: not excluded by basic criteria, not explicitly flagged missed
  const validForMedian = segments.filter((s) => !s.excludeBasic && s.missedPrev !== true);
  const sortedMpgValues = validForMedian.map((s) => s.mpg).sort((a, b) => a - b);
  const medianMpg = sortedMpgValues.length >= 3 ? median(sortedMpgValues) : null;

  // Infer gaps: fuel_missed_previous === null and mpg > 1.6 × median
  // (only when detectMissed is enabled; explicit fuel_missed_previous flags are always respected)
  if (detectMissed && medianMpg != null) {
    for (const s of segments) {
      if (!s.excludeBasic && s.missedPrev === null && s.mpg > 1.6 * medianMpg) {
        s.inferredGap = true;
      }
    }
  }

  // Compute phantom fill-ups for inferred gaps
  const gaps: GapInfo[] = [];
  for (const s of segments) {
    if (!s.inferredGap || medianMpg == null) continue;
    const estGallons = Math.max(0, s.miles / medianMpg - s.gallons);
    if (estGallons <= 0) continue;
    const neighbourPrices = (
      [s.startEvent.fuel_price_cents, s.endEvent.fuel_price_cents] as (number | null)[]
    ).filter((p): p is number => p != null);
    const estPriceCents =
      neighbourPrices.length > 0
        ? neighbourPrices.reduce((a, b) => a + b, 0) / neighbourPrices.length
        : avgPricePerGalCents;
    const estCostCents = estPriceCents != null ? Math.round(estGallons * estPriceCents) : null;
    s.estGallons = estGallons;
    s.estCostCents = estCostCents;

    const startT = toTime(s.startEvent.event_date ?? "1970-01-01");
    const endT = toTime(s.endEvent.event_date ?? "1970-01-01");
    const midDate = new Date((startT + endT) / 2).toISOString().slice(0, 10);

    gaps.push({
      afterEventId: s.startEvent.id,
      beforeEventId: s.endEvent.id,
      date: midDate,
      estGallons,
      estCostCents,
    });
  }

  // Final MPG: include only trusted segments (no basic exclusion, no explicit miss, no inferred gap)
  const trustedSegs = segments.filter(
    (s) => !s.excludeBasic && !s.inferredGap && s.missedPrev !== true,
  );
  const mpgSamples = trustedSegs.map((s) => s.mpg);
  const mpgMilesTotal = trustedSegs.reduce((sum, s) => sum + s.miles, 0);
  const mpgGallonsTotal = trustedSegs.reduce((sum, s) => sum + s.gallons, 0);
  const avgMpg = mpgGallonsTotal > 0 ? mpgMilesTotal / mpgGallonsTotal : null;
  const isUnverified = avgMpg != null && trustedSegs.length < 3;
  const avgMpgLabel = isUnverified ? "Avg MPG (unverified)" : "Avg MPG";

  // Excluded segment count (all reasons)
  const excludedCount = segments.filter(
    (s) => s.excludeBasic || s.missedPrev === true || s.inferredGap,
  ).length;

  // Phantom totals
  const missedCount = gaps.length;
  const estimatedGallons = gaps.reduce((sum, g) => sum + g.estGallons, 0);
  const estimatedCents = gaps.reduce((sum, g) => sum + (g.estCostCents ?? 0), 0);

  // Raw fuel totals (logged events only)
  const fillUps = allFuelEvents.length;
  const loggedGallons = allFuelEvents.reduce((sum, e) => sum + (e.fuel_gallons ?? 0), 0);
  const loggedFuelSpendCents = allFuelEvents.reduce((sum, e) => sum + (e.cost_cents ?? 0), 0);
  // When includeEst is false, estimated gallons/costs are excluded from totals
  const totalGallons = loggedGallons + (includeEst ? estimatedGallons : 0);
  const fuelSpendCents = loggedFuelSpendCents + (includeEst ? estimatedCents : 0);

  const avgPricePerGal = avgPricePerGalCents != null ? avgPricePerGalCents / 100 : null;
  const lastPrice = [...allFuelEvents].reverse().find((e) => e.fuel_price_cents != null)?.fuel_price_cents;

  // Total spend includes estimated fuel costs (only when includeEst is on)
  const totalSpendCentsWithEst = totalSpendCents + (includeEst ? estimatedCents : 0);
  const costPerMile =
    milesDriven != null && milesDriven > 0 && totalSpendCentsWithEst > 0
      ? totalSpendCentsWithEst / 100 / milesDriven
      : null;

  // --- compact summary: pick up to 4 that exist ---
  const summary: StatRow[] = [];
  if (totalSpendCentsWithEst > 0) summary.push({ label: "Total spend", value: formatMoney(totalSpendCentsWithEst) ?? "" });
  if (milesDriven != null && milesDriven > 0)
    summary.push({ label: "Miles driven", value: milesDriven.toLocaleString() });
  if (costPerMile != null) summary.push({ label: "Cost / mile", value: `$${costPerMile.toFixed(2)}` });
  if (avgMpg != null) summary.push({ label: avgMpgLabel, value: avgMpg.toFixed(1) });
  else if (milesPerYear != null) summary.push({ label: "Miles / year", value: milesPerYear.toLocaleString() });

  // --- geek table ---
  const ownership: StatRow[] = [];
  if (vehicle.purchase_date) ownership.push({ label: "Owned since", value: vehicle.purchase_date });
  if (daySpan != null) ownership.push({ label: "Days tracked", value: String(Math.round(daySpan)) });
  if (milesDriven != null && milesDriven > 0)
    ownership.push({ label: "Miles driven", value: milesDriven.toLocaleString() });
  if (milesPerYear != null) ownership.push({ label: "Miles / year (pace)", value: milesPerYear.toLocaleString() });
  if (pts.length > 0)
    ownership.push({ label: "Last odometer", value: `${pts[pts.length - 1].miles.toLocaleString()} mi` });

  const money: StatRow[] = [];
  money.push({ label: "Events logged", value: String(events.length) });
  if (totalSpendCentsWithEst > 0) money.push({ label: "Total spend", value: formatMoney(totalSpendCentsWithEst) ?? "" });
  if (costPerMile != null) money.push({ label: "Cost / mile (all)", value: `$${costPerMile.toFixed(2)}` });
  for (const [type, cents] of [...byCategory.entries()].sort((a, b) => b[1] - a[1])) {
    money.push({ label: `  ${type}`, value: formatMoney(cents) ?? "" });
  }

  const fuel: StatRow[] = [];
  if (fillUps > 0) {
    fuel.push({ label: "Fill-ups", value: String(fillUps) });
    if (totalGallons > 0) fuel.push({ label: "Gallons total", value: totalGallons.toFixed(1) });
    if (fuelSpendCents > 0) {
      const spendStr = formatMoney(fuelSpendCents) ?? "";
      const estNote = includeEst && estimatedCents > 0 ? ` (incl. ~${formatMoney(estimatedCents) ?? ""} est.)` : "";
      fuel.push({ label: "Fuel spend", value: `${spendStr}${estNote}` });
    }
    if (missedCount > 0) fuel.push({ label: "Probable missed fill-ups", value: String(missedCount) });
    if (excludedCount > 0) fuel.push({ label: "Segments excluded", value: String(excludedCount) });
    if (avgMpg != null) fuel.push({ label: avgMpgLabel, value: avgMpg.toFixed(1) });
    if (mpgSamples.length > 0) {
      fuel.push({ label: "Best MPG (tank)", value: Math.max(...mpgSamples).toFixed(1) });
      fuel.push({ label: "Worst MPG (tank)", value: Math.min(...mpgSamples).toFixed(1) });
    }
    if (avgPricePerGal != null) fuel.push({ label: "Avg price / gal", value: `$${avgPricePerGal.toFixed(2)}` });
    if (lastPrice != null) fuel.push({ label: "Last price / gal", value: `$${(lastPrice / 100).toFixed(2)}` });
    if (milesDriven != null && milesDriven > 0 && fuelSpendCents > 0)
      fuel.push({ label: "Fuel cost / mile", value: `$${(fuelSpendCents / 100 / milesDriven).toFixed(2)}` });
  }

  const sections: StatSection[] = [
    { title: "Ownership", rows: ownership },
    { title: "Money", rows: money },
    { title: "Fuel", rows: fuel },
  ].filter((s) => s.rows.length > 0);

  return {
    summary: summary.slice(0, 4),
    sections,
    hasAny: summary.length > 0 || sections.length > 0,
    gaps,
    missedCount,
    estimatedGallons,
    estimatedCents,
  };
}
