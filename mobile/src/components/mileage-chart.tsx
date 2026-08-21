import { View } from "react-native";
import Svg, { Circle, Line, Polygon, Polyline, Text as SvgText } from "react-native-svg";

import type { VehicleEvent } from "@/lib/api";

// Mirrors the web MileageChart: single series, line + soft area, recessive
// grid, min/mid/max ticks. Same geometry so both platforms read identically.

type Point = { t: number; miles: number };

const W = 600;
const H = 200;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;
const PAD_LEFT = 66;
const PAD_RIGHT = 16;

const LINE = "#2563eb";
const AREA = "rgba(37, 99, 235, 0.08)";
const GRID = "#e2e8f0";
const INK_MUTED = "#64748b";

function shortDate(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export type MileageOrigin = { date: string; miles: number };

export function MileageChart({ events, origin }: { events: VehicleEvent[]; origin?: MileageOrigin }) {
  const raw: Point[] = events
    .filter((e) => e.mileage != null && e.event_date)
    .map((e) => ({ t: Date.parse(`${e.event_date}T00:00:00Z`), miles: e.mileage as number }));
  if (origin) raw.push({ t: Date.parse(`${origin.date}T00:00:00Z`), miles: origin.miles });
  const points = raw.sort((a, b) => a.t - b.t);
  if (points.length < 2) return null;

  const plotW = W - PAD_LEFT - PAD_RIGHT;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const tMin = points[0].t;
  const tMax = points[points.length - 1].t;
  const mMin = Math.min(...points.map((p) => p.miles));
  const mMax = Math.max(...points.map((p) => p.miles));
  const tSpan = tMax - tMin || 1;
  const mSpan = mMax - mMin || 1;

  const x = (t: number) => PAD_LEFT + ((t - tMin) / tSpan) * plotW;
  const y = (m: number) =>
    mMax === mMin ? PAD_TOP + plotH / 2 : PAD_TOP + plotH - ((m - mMin) / mSpan) * plotH;

  const coords = points.map((p) => ({ px: x(p.t), py: y(p.miles) }));
  const linePts = coords.map((c) => `${c.px},${c.py}`).join(" ");
  const baseY = H - PAD_BOTTOM;
  const areaPts = `${coords[0].px},${baseY} ${linePts} ${coords[coords.length - 1].px},${baseY}`;

  const yTicks = mMax === mMin ? [mMin] : [mMin, Math.round((mMin + mMax) / 2), mMax];
  const xTickIdx =
    points.length >= 3 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : [0, points.length - 1];

  return (
    <View style={{ borderWidth: 1, borderColor: GRID, borderRadius: 14, padding: 8 }}>
      <Svg width="100%" height={190} viewBox={`0 0 ${W} ${H}`}>
        {yTicks.map((m) => (
          <Line
            key={`grid-${m}`}
            x1={PAD_LEFT}
            y1={y(m)}
            x2={W - PAD_RIGHT}
            y2={y(m)}
            stroke={GRID}
            strokeWidth={1}
          />
        ))}
        {yTicks.map((m) => (
          <SvgText
            key={`ylab-${m}`}
            x={PAD_LEFT - 8}
            y={y(m) + 4}
            fontSize={12}
            fill={INK_MUTED}
            textAnchor="end"
          >
            {`${m.toLocaleString()} mi`}
          </SvgText>
        ))}
        <Polygon points={areaPts} fill={AREA} />
        <Polyline points={linePts} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" />
        {coords.map((c, i) => (
          <Circle key={`dot-${i}`} cx={c.px} cy={c.py} r={4} fill="#fff" stroke={LINE} strokeWidth={2} />
        ))}
        {xTickIdx.map((i) => (
          <SvgText
            key={`xlab-${i}`}
            x={coords[i].px}
            y={H - 8}
            fontSize={12}
            fill={INK_MUTED}
            textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
          >
            {shortDate(points[i].t)}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}
