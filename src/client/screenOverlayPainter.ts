import type { Size } from "./camera";
import { BUTTON_BG, BUTTON_EDGE, HUD_TEXT, SCREEN_DIM, SCREEN_TONES } from "./palette";
import type { ScreenOverlay } from "./screenOverlay";

/** Dims everything and writes the title, with the button below it if there is one. */
export function drawScreenOverlay(ctx: CanvasRenderingContext2D, o: ScreenOverlay, screen: Size): void {
  ctx.fillStyle = SCREEN_DIM;
  ctx.fillRect(0, 0, screen.width, screen.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = SCREEN_TONES[o.tone];
  ctx.font = "bold 64px sans-serif";
  ctx.fillText(o.title, screen.width / 2, screen.height / 2 - 30);
  if (o.button) {
    const r = o.button.rect;
    ctx.fillStyle = BUTTON_BG;
    ctx.fillRect(r.x, r.y, r.width, r.height);
    ctx.strokeStyle = BUTTON_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 1, r.y + 1, r.width - 2, r.height - 2);
    ctx.fillStyle = HUD_TEXT;
    ctx.font = "bold 20px sans-serif";
    ctx.fillText(o.button.label, r.x + r.width / 2, r.y + r.height / 2);
  }
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}
