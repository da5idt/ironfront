import { ART } from "./artPalette";
import { hash2 } from "./hash";
import { createPixelBuffer, type PixelBuffer, setPixel } from "./pixelBuffer";
import { ART_CELL_PX } from "./terrainArt";

// Ore as clusters of gold nuggets that thin out as a Cell is harvested. Each
// level and layout variant is one small transparent sprite, painted once.

/** Visible fill levels for a Cell holding Ore; 0 means none. */
export const ORE_LEVELS = 4;
/** Nugget layouts, picked per Cell so a field doesn't look stamped. */
export const ORE_VARIANTS = 8;

/** Which fill level to draw for a Cell holding `amount` Ore out of a full Cell's `full`. */
export function oreLevel(amount: number, full: number): number {
  if (amount <= 0) return 0;
  return Math.min(ORE_LEVELS, Math.max(1, Math.ceil((amount / full) * ORE_LEVELS)));
}

/** The variant for a Cell, fixed for the Match so a Cell's nuggets don't jump about. */
export function oreVariant(cx: number, cy: number): number {
  return Math.floor(hash2(cx, cy, 50) * ORE_VARIANTS);
}

/** Big and small nuggets shown at each level; the big ones go first, so they stay longest. */
const NUGGETS_AT: readonly { readonly big: number; readonly small: number }[] = [
  { big: 0, small: 0 },
  { big: 0, small: 2 },
  { big: 1, small: 2 },
  { big: 3, small: 2 },
  { big: 4, small: 3 },
];

/** A Cell's Ore at one fill level and layout variant, transparent where the ground shows. */
export function paintOreCell(level: number, variant: number): PixelBuffer {
  const buf = createPixelBuffer(ART_CELL_PX, ART_CELL_PX);
  if (level <= 0) return buf;
  const { big, small } = NUGGETS_AT[Math.min(level, ORE_LEVELS)]!;
  // Darkened ground under the field, so even a nearly spent Cell still reads as Ore.
  for (let i = 0; i < 4 + level * 2; i++) {
    setPixel(buf, Math.floor(hash2(variant, i, 51) * 12), Math.floor(hash2(i, variant, 52) * 12), ART.ore.stain);
  }
  // The Cell splits into nine 4x4 slots; one nugget per slot, so nuggets never overlap.
  const slots = Array.from({ length: 9 }, (_, i) => i).sort((a, b) => hash2(variant, a, 53) - hash2(variant, b, 53));
  for (let n = 0; n < big + small; n++) {
    const slot = slots[n]!;
    const x = (slot % 3) * 4;
    // A pixel of jitter inside the slot keeps neighbouring nuggets from lining up in rows.
    const y = Math.floor(slot / 3) * 4 + (hash2(variant, slot, 54) > 0.5 ? 1 : 0);
    if (n < big) stamp(buf, x, y, BIG_NUGGET);
    else stamp(buf, x + (hash2(slot, variant, 55) > 0.5 ? 1 : 0), y, SMALL_NUGGET);
  }
  return buf;
}

// Nuggets lit from the top-left, shadow falling right and down. L light, M mid, D dark, S shadow.
const BIG_NUGGET = ["LMM.", "MDDS", ".SS."];
const SMALL_NUGGET = ["LM.", "MDS", ".S."];
const NUGGET_COLOURS: Record<string, string> = { L: ART.ore.light, M: ART.ore.mid, D: ART.ore.dark, S: ART.ore.shadow };

function stamp(buf: PixelBuffer, x: number, y: number, rows: readonly string[]): void {
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      const c = NUGGET_COLOURS[row[dx]!];
      if (c) setPixel(buf, x + dx, y + dy, c);
    }
  });
}
