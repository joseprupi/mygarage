// Generates a pixel-art car avatar as an inline SVG data URI. The color is
// derived from a seed (e.g. username) so each user consistently gets their own
// colored car, while a circular crop never clips the (inset) artwork.

// 16x16 grid, side-view car, inset with padding on all sides.
const ART = [
  "................",
  "................",
  "................",
  "................",
  "......BBBB......",
  ".....BGGGGB.....",
  "....BBBBBBBB....",
  "...BBBBBBBBBBL..",
  "...BBBBBBBBBB...",
  "...BTTBBBBTTB...",
  "...TTTT..TTTT...",
  "....TT....TT....",
  "................",
  "................",
  "................",
  "................"
];

function hslHex(h: number, s: number, l: number): string {
  // h in [0,360), s/l in [0,1]
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = (
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]
  ).map((v) => Math.round((v + m) * 255));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function hueFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
}

export function carAvatarUri(seed: string): string {
  const hue = hueFromSeed(seed || "car");
  const colors: Record<string, string> = {
    B: hslHex(hue, 0.68, 0.58), // body
    G: "#cfeaf5", // glass
    T: "#2b2b33", // tyres
    L: "#ffd23f" // headlight
  };
  const bg = hslHex(hue, 0.7, 0.92);
  const cell = 10;
  const size = 16 * cell;
  let rects = "";
  ART.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const ch = row[x];
      if (colors[ch]) {
        rects += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="${colors[ch]}"/>`;
      }
    }
  });
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="${bg}"/>${rects}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
