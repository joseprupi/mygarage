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
