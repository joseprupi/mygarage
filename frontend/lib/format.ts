// Single source of truth for date & money formatting. "Dates are the product" —
// every visible date/cost goes through here so the history reads consistently.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Day-precision parts. YYYY-MM-DD strings are parsed by hand: new Date("2026-06-12")
// is UTC midnight, which renders as the previous day in western timezones.
function dateParts(d: string): { y: number; m: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (match) return { y: Number(match[1]), m: Number(match[2]), day: Number(match[3]) };
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return { y: date.getFullYear(), m: date.getMonth() + 1, day: date.getDate() };
}

// "Jun 12, 2026" — accepts YYYY-MM-DD or full ISO timestamps.
export function formatDate(d: string): string {
  const p = dateParts(d);
  const month = p && MONTHS[p.m - 1];
  return p && month ? `${month} ${p.day}, ${p.y}` : d;
}

// "Jun 12, '26" — compact variant for chart axes.
export function formatShortDate(d: string): string {
  const p = dateParts(d);
  const month = p && MONTHS[p.m - 1];
  return p && month ? `${month} ${p.day}, '${String(p.y).slice(2)}` : d;
}

// "Jun 12, 2026, 3:04 PM" — for post/comment timestamps (no seconds).
export function formatDateTime(d: string): string {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${formatDate(d)}, ${time}`;
}

// "$329.99" — costs are stored as integer cents, USD-only for now.
export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
