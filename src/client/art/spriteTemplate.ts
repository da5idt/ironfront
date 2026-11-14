import { createPixelBuffer, type PixelBuffer, rgbOf, setPixel } from "./pixelBuffer";

// The tools sprites are made with (ADR 0003): compact character grids painted
// through a legend, plus a few block shapes for the big flat parts. All of it
// writes plain pixel buffers, so sprites are generated and tested without a DOM.

/** Which colour each template character paints. "." and " " are always clear. */
export type Legend = Readonly<Record<string, string>>;

/** Paints a character grid into `buf` with its top-left corner at x, y. */
export function paintTemplate(buf: PixelBuffer, rows: readonly string[], legend: Legend, x = 0, y = 0): void {
  for (const [ry, row] of rows.entries()) {
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx]!;
      if (ch === "." || ch === " ") continue;
      const colour = legend[ch];
      if (colour === undefined) throw new Error(`Template character "${ch}" is not in the legend`);
      setPixel(buf, x + rx, y + ry, colour);
    }
  }
}

/** Block shapes on one buffer, so a sprite's painter reads as a list of parts. */
export interface Brush {
  readonly buf: PixelBuffer;
  px(x: number, y: number, colour: string, alpha?: number): void;
  rect(x: number, y: number, w: number, h: number, colour: string): void;
  /** An outlined block lit from the top left: `hi` on its top and left edges, `lo` on its bottom and right. */
  box(x: number, y: number, w: number, h: number, fill: string, hi: string, lo: string, outline: string): void;
  line(x0: number, y0: number, x1: number, y1: number, colour: string): void;
  /** A filled circle about a centre that may sit between pixels. */
  disc(cx: number, cy: number, r: number, colour: string): void;
  grid(x: number, y: number, rows: readonly string[], legend: Legend): void;
}

export function brushOn(buf: PixelBuffer): Brush {
  const px = (x: number, y: number, colour: string, alpha = 255) => setPixel(buf, Math.round(x), Math.round(y), colour, alpha);
  const rect = (x: number, y: number, w: number, h: number, colour: string) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) setPixel(buf, xx, yy, colour);
  };
  return {
    buf,
    px,
    rect,
    box(x, y, w, h, fill, hi, lo, outline) {
      rect(x, y, w, h, outline);
      rect(x + 1, y + 1, w - 2, h - 2, fill);
      rect(x + 1, y + h - 2, w - 2, 1, lo);
      rect(x + w - 2, y + 1, 1, h - 2, lo);
      rect(x + 1, y + 1, w - 2, 1, hi);
      rect(x + 1, y + 1, 1, h - 2, hi);
    },
    line(x0, y0, x1, y1, colour) {
      const n = Math.max(Math.abs(Math.round(x1) - Math.round(x0)), Math.abs(Math.round(y1) - Math.round(y0)));
      for (let i = 0; i <= n; i++) {
        const t = n === 0 ? 0 : i / n;
        px(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, colour);
      }
    },
    disc(cx, cy, r, colour) {
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) setPixel(buf, x, y, colour);
        }
      }
    },
    grid: (x, y, rows, legend) => paintTemplate(buf, rows, legend, x, y),
  };
}

/**
 * The sprite washed toward one colour, keeping its light and dark, for the
 * placement preview (green where the Building fits, red where it does not).
 */
export function tintSprite(sprite: PixelBuffer, hex: string, strength: number): PixelBuffer {
  const out = createPixelBuffer(sprite.width, sprite.height);
  const tint = rgbOf(hex);
  for (let i = 0; i < sprite.data.length; i += 4) {
    for (let c = 0; c < 3; c++) out.data[i + c] = sprite.data[i + c]! + (tint[c]! - sprite.data[i + c]!) * strength;
    out.data[i + 3] = sprite.data[i + 3]!;
  }
  return out;
}

/** The sprite's outline filled with one colour at one opacity: its cast shadow. */
export function silhouette(sprite: PixelBuffer, hex: string, alpha: number): PixelBuffer {
  const out = createPixelBuffer(sprite.width, sprite.height);
  for (let y = 0; y < sprite.height; y++) {
    for (let x = 0; x < sprite.width; x++) {
      if (sprite.data[(y * sprite.width + x) * 4 + 3]! > 0) setPixel(out, x, y, hex, alpha);
    }
  }
  return out;
}
