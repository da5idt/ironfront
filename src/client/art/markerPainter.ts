import { ART } from "./artPalette";

// Selection brackets and health bars in the pixel world's own chunky pixels,
// so the interface over the Map matches the art under it. Everything here is
// in art pixels, for a layer of PixelWorld.

const { marker } = ART;

/** Corner brackets round a rect, with a dark edge below and right so they read on any ground. */
export function drawBrackets(art: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, arm: number): void {
  art.fillStyle = marker.healthBack;
  bracketCorners(art, x + 1, y + 1, w, h, arm);
  art.fillStyle = marker.selection;
  bracketCorners(art, x, y, w, h, arm);
}

/** The four corners in the current fill colour. Written out: it runs for every selected Unit in every frame. */
function bracketCorners(art: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, arm: number): void {
  const right = x + w - 1;
  const bottom = y + h - 1;
  art.fillRect(x, y, arm, 1);
  art.fillRect(x, y, 1, arm);
  art.fillRect(right - arm + 1, y, arm, 1);
  art.fillRect(right, y, 1, arm);
  art.fillRect(x, bottom, arm, 1);
  art.fillRect(x, bottom - arm + 1, 1, arm);
  art.fillRect(right - arm + 1, bottom, arm, 1);
  art.fillRect(right, bottom - arm + 1, 1, arm);
}

/** Height of a health bar: a dark frame round one row of colour. */
export const HEALTH_BAR_PX = 3;

/** A health bar `w` wide with its top-left at x, y. Green, then amber under half, then red under a quarter. */
export function drawHealthBar(art: CanvasRenderingContext2D, x: number, y: number, w: number, share: number): void {
  const s = Math.max(0, Math.min(1, share));
  art.fillStyle = marker.healthBack;
  art.fillRect(x, y, w, HEALTH_BAR_PX);
  // Anything still alive shows at least one pixel of health.
  const filled = s > 0 ? Math.max(1, Math.round((w - 2) * s)) : 0;
  art.fillStyle = s > 0.5 ? marker.healthGood : s > 0.25 ? ART.lamp.amberOn : marker.healthLow;
  art.fillRect(x + 1, y + 1, filled, HEALTH_BAR_PX - 2);
}
