import { ART } from "./artPalette";
import { hash2 } from "./hash";

// Water shimmer: a few sparkle pixels per Cell that blink on and off, drawn
// over the cached terrain each frame. Cheap, and the terrain is never redrawn.

/** Sparkles per Cell; each blinks on its own cycle. */
const GLINTS_PER_CELL = 2;
/** Seconds for one blink cycle. */
const CYCLE_SECONDS = 2.6;
/** Share of the cycle a sparkle is lit; the rest it is plain water. */
const LIT_SHARE = 0.3;

/**
 * Calls `lit` for each sparkle lit on water Cell (cx, cy) at a moment, with
 * its art pixel inside the Cell (0..11) and its colour. A callback and not a
 * list: this runs for every water Cell on screen in every frame, and a list
 * per Cell would be so much litter for the garbage collector.
 */
export function eachWaterGlint(
  cx: number,
  cy: number,
  seconds: number,
  lit: (x: number, y: number, colour: string) => void,
): void {
  for (let i = 0; i < GLINTS_PER_CELL; i++) {
    const phase = (seconds / CYCLE_SECONDS + hash2(cx, cy, 20 + i)) % 1;
    if (phase >= LIT_SHARE) continue;
    // Pixels 4..7 only: the shore band (sand, wet sand, foam) is at most 4 pixels deep.
    const x = 4 + Math.floor(hash2(cx, cy, 30 + i) * 4);
    const y = 4 + Math.floor(hash2(cx, cy, 40 + i) * 4);
    // Bright at the peak of the blink, dim as it rises and fades.
    const bright = phase > LIT_SHARE * 0.3 && phase < LIT_SHARE * 0.7;
    lit(x, y, bright ? ART.glint.bright : ART.glint.dim);
  }
}
