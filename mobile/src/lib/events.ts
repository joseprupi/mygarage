// Mirrors frontend/lib/events.ts — values must match the backend EventType enum.

export const EVENT_TYPES = [
  "purchase",
  "sale",
  "repair",
  "maintenance",
  "upgrade",
  "inspection",
  "detailing",
  "accident",
  "note",
  "other",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export function eventTypeLabel(type: string): string {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Badge colors (bg, text) per type — same hues as the web app.
export const EVENT_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  purchase: { bg: "#d1fae5", text: "#047857" },
  sale: { bg: "#fef3c7", text: "#b45309" },
  repair: { bg: "#fee2e2", text: "#b91c1c" },
  maintenance: { bg: "#dbeafe", text: "#1d4ed8" },
  upgrade: { bg: "#ede9fe", text: "#6d28d9" },
  inspection: { bg: "#ccfbf1", text: "#0f766e" },
  detailing: { bg: "#e0f2fe", text: "#0369a1" },
  accident: { bg: "#ffe4e6", text: "#be123c" },
  note: { bg: "#f1f5f9", text: "#475569" },
  other: { bg: "#f1f5f9", text: "#475569" },
};

export function eventTypeColors(type: string): { bg: string; text: string } {
  return EVENT_TYPE_COLORS[type] ?? EVENT_TYPE_COLORS.other;
}

export function formatMoney(cents: number | null | undefined, currency = "USD"): string | null {
  if (cents == null) return null;
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : `${currency} `;
  return `${symbol}${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
