// Plain RGBA pixel buffers, so art is generated and tested without a DOM;
// a thin client layer (toCanvas) turns them into canvases once at startup.

export interface PixelBuffer {
  readonly width: number;
  readonly height: number;
  /** RGBA, row by row, like ImageData.data. */
  readonly data: Uint8ClampedArray;
}

export function createPixelBuffer(width: number, height: number): PixelBuffer {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export type Rgb = readonly [number, number, number];

const rgbCache = new Map<string, Rgb>();

/** "#rrggbb" to channels; every colour in the art palette is in that form. */
export function rgbOf(hex: string): Rgb {
  let c = rgbCache.get(hex);
  if (!c) {
    const n = Number.parseInt(hex.slice(1), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, c);
  }
  return c;
}

export function setPixel(buf: PixelBuffer, x: number, y: number, hex: string, alpha = 255): void {
  if (x < 0 || y < 0 || x >= buf.width || y >= buf.height) return;
  const [r, g, b] = rgbOf(hex);
  const i = (y * buf.width + x) * 4;
  buf.data[i] = r;
  buf.data[i + 1] = g;
  buf.data[i + 2] = b;
  buf.data[i + 3] = alpha;
}

/** "#rrggbb" of a pixel, or null where it is fully transparent. */
export function pixelAt(buf: PixelBuffer, x: number, y: number): string | null {
  const i = (y * buf.width + x) * 4;
  if (buf.data[i + 3] === 0) return null;
  const n = (buf.data[i]! << 16) | (buf.data[i + 1]! << 8) | buf.data[i + 2]!;
  return `#${n.toString(16).padStart(6, "0")}`;
}
