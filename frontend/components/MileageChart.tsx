"use client";

import { formatShortDate } from "@/lib/format";

type Point = { date: string; miles: number };
type Boundary = { date: string; label: string };

// Parse YYYY-MM-DD to a sortable timestamp (UTC midnight).
function toTime(d: string): number {
  return Date.parse(`${d}T00:00:00Z`);
}

export function MileageChart({ points, boundaries }: { points: Point[]; boundaries?: Boundary[] }) {
  const sorted = [...points].sort((a, b) => toTime(a.date) - toTime(b.date));
  if (sorted.length < 2) return null;

  // Plot geometry (viewBox user units; scales responsively via width 100%).
  const W = 600;
  const H = 200;
  const padTop = 16;
  const padBottom = 28;
  const padLeft = 66; // room for "999,999 mi" y-axis labels (no clipping)
  const padRight = 16;
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

  // y ticks: min, mid, max (mid dropped when the line is flat).
  const yTicks = mMax === mMin ? [mMin] : [mMin, Math.round((mMin + mMax) / 2), mMax];
  // x ticks: first, middle (when >=3 points), last — at real data points.
  const xTickIdx =
    sorted.length >= 3 ? [0, Math.floor((sorted.length - 1) / 2), sorted.length - 1] : [0, sorted.length - 1];

  return (
    <div className="surface rounded-2xl p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Mileage</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label="Mileage over time">
        {/* y gridlines + labels (bottom gridline doubles as the baseline) */}
        {yTicks.map((v, i) => {
          const gy = y(v);
          return (
            <g key={`y${i}`}>
              <line x1={padLeft} y1={gy} x2={W - padRight} y2={gy} stroke="#eef2f7" strokeWidth={1} />
              <text x={padLeft - 8} y={gy} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#94a3b8">
                {v.toLocaleString()} mi
              </text>
            </g>
          );
        })}
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
        {/* ownership period boundaries */}
        {(boundaries ?? []).map((b, i) => {
          const bt = toTime(b.date);
          if (bt <= tMin || bt >= tMax) return null;
          const bx = x(bt);
          return (
            <g key={`boundary-${i}`}>
              <line x1={bx} y1={padTop} x2={bx} y2={baseY} stroke="#64748b" strokeWidth={1} strokeDasharray="4 3" />
              <text x={bx + 3} y={padTop + 11} fontSize={9} fill="#64748b">{b.label}</text>
            </g>
          );
        })}
        {/* x ticks + date labels */}
        {xTickIdx.map((idx, i) => {
          const cx = coords[idx].px;
          const anchor = i === 0 ? "start" : i === xTickIdx.length - 1 ? "end" : "middle";
          return (
            <g key={`x${idx}`}>
              <line x1={cx} y1={baseY} x2={cx} y2={baseY + 4} stroke="#cbd5e1" strokeWidth={1} />
              <text x={cx} y={H - 8} textAnchor={anchor} fontSize={10} fill="#94a3b8">
                {formatShortDate(sorted[idx].date)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
