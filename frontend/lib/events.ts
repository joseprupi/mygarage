// Vehicle history event types. Values must match the backend EventType enum;
// labels are display-only (proper-cased).

export const EVENT_TYPES = [
  "purchase",
  "sale",
  "repair",
  "maintenance",
  "upgrade",
  "inspection",
  "detailing",
  "track_day",
  "road_trip",
  "accident",
  "note",
  "other"
] as const;

export function eventTypeLabel(type: string): string {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Per-type badge colors. Full literal class strings so Tailwind picks them up.
const EVENT_TYPE_BADGE: Record<string, string> = {
  purchase: "bg-emerald-100 text-emerald-700",
  sale: "bg-amber-100 text-amber-700",
  repair: "bg-red-100 text-red-700",
  maintenance: "bg-blue-100 text-blue-700",
  upgrade: "bg-violet-100 text-violet-700",
  inspection: "bg-teal-100 text-teal-700",
  detailing: "bg-sky-100 text-sky-700",
  track_day: "bg-orange-100 text-orange-700",
  road_trip: "bg-indigo-100 text-indigo-700",
  accident: "bg-rose-100 text-rose-700",
  note: "bg-slate-100 text-slate-600",
  other: "bg-slate-100 text-slate-600"
};

export function eventTypeBadge(type: string): string {
  return EVENT_TYPE_BADGE[type] ?? "bg-slate-100 text-slate-600";
}
