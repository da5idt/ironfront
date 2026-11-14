import { ART_CELL_PX } from "./terrainArt";

// Fog of War edges in the pixel look: where fog levels meet, each side gives
// way to the other over a few art pixels with an ordered dither, so the edge
// reads as chunky pixels rather than a blur or a hard Cell-sized step.

/** How many art pixels deep one Cell's fog reaches into its neighbour. */
const EDGE_PX = 4;

/** 4x4 ordered-dither thresholds; laid out by Map pixel so dither lines up across Cells. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Neighbour offsets in the order of the 3x3 input, centre skipped. */
const NEIGHBOURS = [
  [-1, -1, 0],
  [0, -1, 1],
  [1, -1, 2],
  [-1, 0, 3],
  [1, 0, 5],
  [-1, 1, 6],
  [0, 1, 7],
  [1, 1, 8],
] as const;

/**
 * Fog opacity (0..255) per art pixel of Cell (cx, cy), row by row.
 * `around` is the fog opacity of the Cell and its eight neighbours, row by row
 * with the Cell in the middle; off-Map neighbours should repeat the centre.
 */
export function paintFogCell(around: ArrayLike<number>, cx: number, cy: number): Uint8Array {
  const U = ART_CELL_PX;
  const out = new Uint8Array(U * U);
  const centre = around[4]!;
  const levels = Array.from(new Set(Array.from(around))).sort((a, b) => a - b);
  for (let ly = 0; ly < U; ly++) {
    for (let lx = 0; lx < U; lx++) {
      // The strongest pull from any differing neighbour, half-way at the shared edge.
      let target = centre;
      let pull = 0;
      for (const [dx, dy, k] of NEIGHBOURS) {
        const a = around[k]!;
        if (a === centre) continue;
        const ex = dx < 0 ? lx + 0.5 : dx > 0 ? U - lx - 0.5 : 0;
        const ey = dy < 0 ? ly + 0.5 : dy > 0 ? U - ly - 0.5 : 0;
        const w = 0.5 * (1 - Math.hypot(ex, ey) / EDGE_PX);
        const p = w * Math.abs(a - centre);
        if (w > 0 && p > pull) {
          pull = p;
          target = centre + w * (a - centre);
        }
      }
      out[ly * U + lx] = dither(target, levels, cx * U + lx, cy * U + ly);
    }
  }
  return out;
}

/** Picks one of the given levels around `v`, more often the nearer one. */
function dither(v: number, levels: readonly number[], px: number, py: number): number {
  let lo = levels[0]!;
  let hi = levels[levels.length - 1]!;
  for (const l of levels) {
    if (l <= v) lo = l;
    if (l >= v) {
      hi = l;
      break;
    }
  }
  if (hi === lo) return lo;
  const t = (v - lo) / (hi - lo);
  const threshold = (BAYER[(py & 3) * 4 + (px & 3)]! + 0.5) / 16;
  return t > threshold ? hi : lo;
}
