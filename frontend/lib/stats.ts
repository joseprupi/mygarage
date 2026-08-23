// Derived vehicle statistics from history events + the purchase origin.
// PORT of mobile/src/lib/stats.ts — keep the two in sync so web and app never disagree.

import type { Vehicle, VehicleEvent } from "@/lib/types";
import { formatMoney } from "@/lib/format";

export type StatRow = { label: string; value: string };
export type StatSection = { title: string; rows: StatRow[] };

type MileagePoint = { t: number; miles: number };

function toTime(d: string): number {
  return Date.parse(`${d}T00:00:00Z`);
}

export type VehicleStats = {
  /** The compact numbers for the History tab (already formatted). */
  summary: StatRow[];
  /** Full geek-mode table. */
  sections: StatSection[];
  hasAny: boolean;
};

export function computeVehicleStats(vehicle: Vehicle, events: VehicleEvent[]): VehicleStats {
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
  const costPerMile =
    milesDriven != null && milesDriven > 0 && totalSpendCents > 0
      ? totalSpendCents / 100 / milesDriven
      : null;
  const byCategory = new Map<string, number>();
  for (const e of events) {
    if (e.cost_cents) byCategory.set(e.event_type, (byCategory.get(e.event_type) ?? 0) + e.cost_cents);
  }

  // --- fuel ---
  const fuelEvents = events
    .filter((e) => e.event_type === "fuel")
    .sort((a, b) => toTime(a.event_date ?? "1970-01-01") - toTime(b.event_date ?? "1970-01-01"));
  const fillUps = fuelEvents.length;
  const totalGallons = fuelEvents.reduce((sum, e) => sum + (e.fuel_gallons ?? 0), 0);
  const fuelSpendCents = fuelEvents.reduce((sum, e) => sum + (e.cost_cents ?? 0), 0);
  const pricedGallons = fuelEvents.reduce(
    (sum, e) => sum + (e.fuel_price_cents != null && e.fuel_gallons ? e.fuel_gallons : 0),
    0,
  );
  const weightedPrice = fuelEvents.reduce(
    (sum, e) =>
      sum + (e.fuel_price_cents != null && e.fuel_gallons ? e.fuel_price_cents * e.fuel_gallons : 0),
    0,
  );
  const avgPricePerGal = pricedGallons > 0 ? weightedPrice / pricedGallons / 100 : null;
  const lastPrice = [...fuelEvents].reverse().find((e) => e.fuel_price_cents != null)?.fuel_price_cents;

  // MPG from consecutive fill-ups that both carry mileage; gallons of the later fill.
  const mpgSamples: number[] = [];
  let mpgMiles = 0;
  let mpgGallons = 0;
  const fuelWithMileage = fuelEvents.filter((e) => e.mileage != null);
  for (let i = 1; i < fuelWithMileage.length; i++) {
    const delta = (fuelWithMileage[i].mileage as number) - (fuelWithMileage[i - 1].mileage as number);
    const gal = fuelWithMileage[i].fuel_gallons;
    if (delta > 0 && gal && gal > 0 && delta / gal < 150) {
      mpgSamples.push(delta / gal);
      mpgMiles += delta;
      mpgGallons += gal;
    }
  }
  const avgMpg = mpgGallons > 0 ? mpgMiles / mpgGallons : null;

  // --- compact summary: pick up to 4 that exist ---
  const summary: StatRow[] = [];
  if (totalSpendCents > 0) summary.push({ label: "Total spend", value: formatMoney(totalSpendCents) });
  if (milesDriven != null && milesDriven > 0)
    summary.push({ label: "Miles driven", value: milesDriven.toLocaleString() });
  if (costPerMile != null) summary.push({ label: "Cost / mile", value: `$${costPerMile.toFixed(2)}` });
  if (avgMpg != null) summary.push({ label: "Avg MPG", value: avgMpg.toFixed(1) });
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
  if (totalSpendCents > 0) money.push({ label: "Total spend", value: formatMoney(totalSpendCents) });
  if (costPerMile != null) money.push({ label: "Cost / mile (all)", value: `$${costPerMile.toFixed(2)}` });
  for (const [type, cents] of [...byCategory.entries()].sort((a, b) => b[1] - a[1])) {
    money.push({ label: `  ${type}`, value: formatMoney(cents) });
  }

  const fuel: StatRow[] = [];
  if (fillUps > 0) {
    fuel.push({ label: "Fill-ups", value: String(fillUps) });
    if (totalGallons > 0) fuel.push({ label: "Gallons total", value: totalGallons.toFixed(1) });
    if (fuelSpendCents > 0) fuel.push({ label: "Fuel spend", value: formatMoney(fuelSpendCents) });
    if (avgMpg != null) fuel.push({ label: "Avg MPG", value: avgMpg.toFixed(1) });
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

  return { summary: summary.slice(0, 4), sections, hasAny: summary.length > 0 || sections.length > 0 };
}
