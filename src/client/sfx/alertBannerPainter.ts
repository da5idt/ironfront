import type { Rect } from "../layout";
import { ALERT_BG, ALERT_EDGE, ALERT_TEXT } from "../palette";

// Shows an alert's text at the top of the Map view when it could not be
// spoken. The words are drawn small and blown up without smoothing, so they
// come out in the same chunky pixels as the world (ADR 0003: no font files).

/** Screen pixels per banner pixel, the same as the pixel world's. */
const SCALE = 2;
const FONT = "bold 10px monospace";
const TEXT_HEIGHT = 10;
const PAD_X = 6;
const PAD_Y = 4;
const EDGE = 1;
/** Gap between the top of the Map view and the banner, in screen pixels. */
const TOP_GAP = 12;
/** Text pixels fainter than this are dropped and the rest made solid, so the letters have hard edges. */
const INK_ALPHA = 110;

let cached: { readonly text: string; readonly canvas: HTMLCanvasElement } | null = null;

/** The banner at its small size; drawn once per text, as the same alert shows for seconds. */
function bannerCanvas(text: string): HTMLCanvasElement {
  if (cached?.text === text) return cached.canvas;
  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d")!;
  measure.font = FONT;
  canvas.width = Math.ceil(measure.measureText(text).width) + (PAD_X + EDGE) * 2;
  canvas.height = TEXT_HEIGHT + (PAD_Y + EDGE) * 2;
  // Resizing a canvas resets its context, so the font is set again below.
  const ctx = canvas.getContext("2d")!;
  ctx.font = FONT;
  ctx.textBaseline = "middle";
  ctx.fillStyle = ALERT_TEXT;
  ctx.fillText(text, PAD_X + EDGE, canvas.height / 2 + 1);
  const ink = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < ink.data.length; i += 4) ink.data[i] = ink.data[i]! >= INK_ALPHA ? 255 : 0;
  ctx.putImageData(ink, 0, 0);
  // The box goes in behind the letters.
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = ALERT_BG;
  ctx.fillRect(EDGE, EDGE, canvas.width - EDGE * 2, canvas.height - EDGE * 2);
  ctx.fillStyle = ALERT_EDGE;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  cached = { text, canvas };
  return canvas;
}

/** Draws the banner centred at the top of the Map view, in screen pixels. */
export function drawAlertBanner(ctx: CanvasRenderingContext2D, text: string, mapView: Rect): void {
  const small = bannerCanvas(text);
  const width = small.width * SCALE;
  const x = Math.round(mapView.x + (mapView.width - width) / 2);
  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, x, mapView.y + TOP_GAP, width, small.height * SCALE);
  ctx.imageSmoothingEnabled = smoothing;
}
