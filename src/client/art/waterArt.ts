import { ART } from "./artPalette";
import { hash2 } from "./hash";

// Water shimmer: a few sparkle pixels per Cell that blink on and off, drawn
// over the cached terrain each frame. Cheap, and the terrain is never redrawn.

export interface Glint {
  /** Art pixel inside the Cell, 0..11. */
  readonly x: number;
  readonly y: number;
  readonly colour: string;
}

/** Sparkles per Cell; each blinks on its own cycle. */
const GLINTS_PER_CELL = 2;
/** Seconds for one blink cycle. */
const CYCLE_SECONDS = 2.6;
/** Share of the cycle a sparkle is lit; the rest it is plain water. */
const LIT_SHARE = 0.3;

/** The sparkles lit on water Cell (cx, cy) at a moment, in Cell-local art pixels. */
export function waterGlints(cx: number, cy: number, seconds: number): Glint[] {
  const out: Glint[] = [];
  for (let i = 0; i < GLINTS_PER_CELL; i++) {
    const phase = (seconds / CYCLE_SECONDS + hash2(cx, cy, 20 + i)) % 1;
    if (phase >= LIT_SHARE) continue;
    // Pixels 4..7 only: the shore band (sand, wet sand, foam) is at most 4 pixels deep.
    const x = 4 + Math.floor(hash2(cx, cy, 30 + i) * 4);
    const y = 4 + Math.floor(hash2(cx, cy, 40 + i) * 4);
    // Bright at the peak of the blink, dim as it rises and fades.
    const bright = phase > LIT_SHARE * 0.3 && phase < LIT_SHARE * 0.7;
    out.push({ x, y, colour: bright ? ART.glint.bright : ART.glint.dim });
  }
  return out;
}
