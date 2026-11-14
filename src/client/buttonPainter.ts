import { BUTTON_KEY_BG, HUD_TEXT } from "./palette";

// What the side panel's painters share: the build menu, the train menu and
// the sound strip all show a key in the same small badge, and both menus put
// a picture in the same well.

/** The picture's well on a build or train button: room for a 3 by 3 Cell Building at twice its art size. */
export const WELL = 72;
export const WELL_INSET = 4;

/** Side of the square badge that shows a button's key. */
export const KEY_BADGE = 16;

/**
 * The key that presses a button, in a small box with its top-left corner at
 * x, y, so the shortcut needs no remembering.
 */
export function drawKeyBadgeAt(ctx: CanvasRenderingContext2D, label: string, x: number, y: number): void {
  ctx.fillStyle = BUTTON_KEY_BG;
  ctx.fillRect(x, y, KEY_BADGE, KEY_BADGE);
  ctx.fillStyle = HUD_TEXT;
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, x + KEY_BADGE / 2, y + KEY_BADGE / 2 + 1);
}
