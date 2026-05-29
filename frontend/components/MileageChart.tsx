"use client";

type Point = { date: string; miles: number };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Timezone-safe label from a YYYY-MM-DD string (avoid Date() UTC day-shift).
function formatDate(d: string): string {
  const [y, m] = d.split("-");
  const month = MONTHS[Number(m) - 1];
  return month ? `${month} '${y.slice(2)}` : d;
}

// Parse YYYY-MM-DD to a sortable timestamp (UTC midnight).
function toTime(d: string): number {
  return Date.parse(`${d}T00:00:00Z`);
}

export function MileageChart({ points }: { points: Point[] }) {
  const sorted = [...points].sort((a, b) => toTime(a.date) - toTime(b.date));
  if (sorted.length < 2) return null;

  // Plot geometry (viewBox user units; scales responsively via width 100%).
  const W = 600;
  const H = 180;
  const padTop = 14;
  const padBottom = 26;
  const padLeft = 52;
  const padRight = 14;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;

  const times = sorted.map((p) => toTime(p.date));
  const miles = sorted.map((p) => p.miles);
  const tMin = times[0];
  const tMax = times[times.length - 1];
  const mMin = Math.min(...miles);
  const mMax = Math.max(...miles);
  const tSpan = tMax - tMin || 1;
  const mSpan = mMax - mMin || 1;

  const x = (t: number) => padLeft + ((t - tMin) / tSpan) * plotW;
  const y = (m: number) =>
    mMax === mMin ? padTop + plotH / 2 : padTop + plotH - ((m - mMin) / mSpan) * plotH;

  const coords = sorted.map((p, i) => ({ px: x(times[i]), py: y(p.miles) }));
  const linePts = coords.map((c) => `${c.px},${c.py}`).join(" ");
  const baseY = H - padBottom;
  const areaPts = `${coords[0].px},${baseY} ${linePts} ${coords[coords.length - 1].px},${baseY}`;

  return (
    <div className="surface rounded-2xl p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Mileage</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label="Mileage over time">
        {/* baseline */}
        <line x1={padLeft} y1={baseY} x2={W - padRight} y2={baseY} stroke="#e2e8f0" strokeWidth={1} />
        {/* area fill */}
        <polygon points={areaPts} fill="#2563eb" fillOpacity={0.08} />
        {/* line */}
        <polyline
          points={linePts}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* dots */}
        {coords.map((c, i) => (
          <circle key={i} cx={c.px} cy={c.py} r={3} fill="#2563eb" stroke="#fff" strokeWidth={1.5} />
        ))}
        {/* y-axis labels: max (top) + min (bottom) */}
        <text x={padLeft - 8} y={padTop + 4} textAnchor="end" fontSize={11} fill="#94a3b8">
          {mMax.toLocaleString()} mi
        </text>
        <text x={padLeft - 8} y={baseY} textAnchor="end" fontSize={11} fill="#94a3b8">
          {mMin.toLocaleString()} mi
        </text>
        {/* x-axis labels: first + last date */}
        <text x={padLeft} y={H - 8} textAnchor="start" fontSize={11} fill="#94a3b8">
          {formatDate(sorted[0].date)}
        </text>
        <text x={W - padRight} y={H - 8} textAnchor="end" fontSize={11} fill="#94a3b8">
          {formatDate(sorted[sorted.length - 1].date)}
        </text>
      </svg>
    </div>
  );
}
