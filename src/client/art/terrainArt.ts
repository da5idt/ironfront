import type { Terrain } from "../../sim";
import { ART } from "./artPalette";
import { hash2 } from "./hash";
import { createPixelBuffer, type PixelBuffer, setPixel } from "./pixelBuffer";

/** Art pixels per Cell; drawn at 2x so a Cell stays 24 screen pixels (camera CELL_PX). */
export const ART_CELL_PX = 12;

export interface TerrainMap {
  readonly width: number;
  readonly height: number;
  /** Indexed by y * width + x, as in the Player view. */
  readonly terrain: readonly Terrain[];
}

/** The whole Map's ground, painted once: terrain never changes during a Match. */
export function paintTerrain(map: TerrainMap): PixelBuffer {
  const U = ART_CELL_PX;
  const buf = createPixelBuffer(map.width * U, map.height * U);
  for (let py = 0; py < buf.height; py++) {
    for (let px = 0; px < buf.width; px++) {
      const cx = Math.floor(px / U);
      const cy = Math.floor(py / U);
      const kind = map.terrain[cy * map.width + cx]!;
      const lx = px - cx * U;
      const ly = py - cy * U;
      const colour =
        kind === "water" ? waterPixel(map, cx, cy, lx, ly, px, py) : landPixel(map, kind, cx, cy, lx, ly, px, py);
      setPixel(buf, px, py, colour);
    }
  }
  return buf;
}

function kindAt(map: TerrainMap, x: number, y: number): Terrain | null {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  return map.terrain[y * map.width + x]!;
}

function landPixel(
  map: TerrainMap,
  kind: Terrain,
  cx: number,
  cy: number,
  lx: number,
  ly: number,
  px: number,
  py: number,
): string {
  const U = ART_CELL_PX;
  if (kind === "rock") {
    // Rock is raised: a lit lip on top and a shadowed face where it drops away below.
    const below = kindAt(map, cx, cy + 1);
    if (below !== null && below !== "rock") {
      if (ly === U - 1) return ART.rockFace.crack;
      if (ly === U - 2) return ART.rockFace.shade;
    }
    const above = kindAt(map, cx, cy - 1);
    if (ly === 0 && above !== null && above !== "rock" && hash2(px, py, 7) > 0.3) return ART.rockFace.light;
    return groundPixel(kind, px, py);
  }
  // Grass and rough ground fray into each other over two pixels, so the Cell grid doesn't show.
  const sides = [
    [cx - 1, cy, lx],
    [cx + 1, cy, U - 1 - lx],
    [cx, cy - 1, ly],
    [cx, cy + 1, U - 1 - ly],
  ] as const;
  for (const [nx, ny, dist] of sides) {
    if (dist > 1) continue;
    const other = kindAt(map, nx, ny);
    if (other === null || other === kind || other === "rock" || other === "water") continue;
    if (hash2(px, py, 8) > (dist === 0 ? 0.5 : 0.8)) return groundPixel(other, px, py);
  }
  return groundPixel(kind, px, py);
}

/** Off the Map counts as more of the same, so the Map's border draws no shore. */
function isLand(map: TerrainMap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  return map.terrain[y * map.width + x] !== "water";
}

/**
 * How far a pixel of a water Cell is from the nearest land, in art pixels.
 * Sides count straight in; a corner where land only touches diagonally is
 * measured as a radius, so the shore rounds that corner off.
 */
function distanceToLand(map: TerrainMap, cx: number, cy: number, lx: number, ly: number): number {
  const U = ART_CELL_PX;
  const fx = U - 1 - lx;
  const fy = U - 1 - ly;
  let d = Infinity;
  if (isLand(map, cx - 1, cy)) d = Math.min(d, lx);
  if (isLand(map, cx + 1, cy)) d = Math.min(d, fx);
  if (isLand(map, cx, cy - 1)) d = Math.min(d, ly);
  if (isLand(map, cx, cy + 1)) d = Math.min(d, fy);
  if (isLand(map, cx - 1, cy - 1)) d = Math.min(d, Math.hypot(lx, ly));
  if (isLand(map, cx + 1, cy - 1)) d = Math.min(d, Math.hypot(fx, ly));
  if (isLand(map, cx - 1, cy + 1)) d = Math.min(d, Math.hypot(lx, fy));
  if (isLand(map, cx + 1, cy + 1)) d = Math.min(d, Math.hypot(fx, fy));
  return d;
}

function waterPixel(map: TerrainMap, cx: number, cy: number, lx: number, ly: number, px: number, py: number): string {
  const d = distanceToLand(map, cx, cy, lx, ly);
  // The sand band wobbles by a pixel in 3-pixel steps, so long shores don't look ruled.
  const sandWidth = 2 + (hash2(Math.floor(px / 3), Math.floor(py / 3), 4) > 0.5 ? 1 : 0);
  if (d < sandWidth - 1) return ART.shore.sand[Math.floor(hash2(px, py, 5) * ART.shore.sand.length)]!;
  if (d < sandWidth) return ART.shore.wet;
  if (d < sandWidth + 1 && hash2(px, py, 6) > 0.3) return ART.shore.foam;
  return groundPixel("water", px, py);
}

/** Boulder size in art pixels: one stone centre per block, jittered inside it. */
const BOULDER_PX = 5;

/** Where a pixel sits on its boulder: offset from the stone's centre, and how far it is from the next stone. */
function boulderAt(px: number, py: number): { dx: number; dy: number; seam: number } {
  const bx = Math.floor(px / BOULDER_PX);
  const by = Math.floor(py / BOULDER_PX);
  let best = Infinity;
  let second = Infinity;
  let dx = 0;
  let dy = 0;
  for (let j = by - 1; j <= by + 1; j++) {
    for (let i = bx - 1; i <= bx + 1; i++) {
      const cx = (i + 0.2 + hash2(i, j, 12) * 0.6) * BOULDER_PX;
      const cy = (j + 0.2 + hash2(i, j, 13) * 0.6) * BOULDER_PX;
      const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
      if (d < best) {
        second = best;
        best = d;
        dx = px + 0.5 - cx;
        dy = py + 0.5 - cy;
      } else if (d < second) second = d;
    }
  }
  return { dx, dy, seam: second - best };
}

/** One pixel of untouched ground: noise picks a shade, rarer hashes add detail. */
function groundPixel(kind: Terrain, px: number, py: number): string {
  const ramp = ART.terrain[kind];
  // Coarse 3x3 blobs plus fine grain, so the texture has clumps rather than static.
  const coarse = kind === "water" ? hash2(Math.floor(px / 6), Math.floor(py / 2), 1) : hash2(Math.floor(px / 3), Math.floor(py / 3), 1);
  const n = coarse * 0.7 + hash2(px, py, 2) * 0.3;
  const base = ramp[Math.min(ramp.length - 1, Math.floor(n * ramp.length))]!;
  const detail = hash2(px, py, 3);
  switch (kind) {
    case "open":
      // A tuft is a light blade with its shadow below it.
      if (detail > 0.975) return ART.grassTuft.light;
      if (hash2(px, py - 1, 3) > 0.975) return ART.grassTuft.dark;
      return base;
    case "rough":
      if (detail > 0.95) return ART.pebble.light;
      if (hash2(px - 1, py - 1, 3) > 0.95) return ART.pebble.dark;
      return base;
    case "rock": {
      // Boulders: each pixel belongs to the nearest of a scatter of stone centres. Where two
      // stones meet is a dark seam; each stone is lit on its top-left and shaded bottom-right.
      const s = boulderAt(px, py);
      if (s.seam < 1 || detail > 0.97) return ART.rockFace.crack;
      if (s.dx + s.dy < -2) return ART.rockFace.light;
      if (s.dx + s.dy > 2) return ART.rockFace.shade;
      return base;
    }
    case "water":
      return base;
  }
}
