import { BUILD_BUTTON_HEIGHT } from "./buildPanel";
import type { Rect } from "./layout";
import {
  BUTTON_BG,
  BUTTON_COST,
  BUTTON_DISABLED_TEXT,
  BUTTON_KEY_BG,
  BUTTON_WELL,
  HUD_TEXT,
} from "./palette";
import { buttonKeyLabel } from "./sidePanel";

// What the side panel's painters share: the build menu, the train menu and
// the sound strip all show a key in the same small badge, and both menus lay
// a button out the same way: a picture in a well on the left, then name, key,
// cost, hints and a progress bar beside it.

/** The picture's well on a build or train button: room for a 3 by 3 Cell Building at twice its art size. */
const WELL = 72;
const WELL_INSET = 4;

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

/** What one build or train button shows. */
export interface MenuButton {
  /** Its place in the menu, from 0: decides which key's badge it wears. */
  readonly index: number;
  readonly name: string;
  readonly cost: number;
  /** A click would do nothing: text and cost go grey. */
  readonly greyed: boolean;
  readonly picture: HTMLCanvasElement;
  /** The most screen pixels per art pixel the picture is blown up to; it gets fewer when it would not fit the well. */
  readonly largestScale: number;
  readonly pictureDimmed: boolean;
  /** The share of the picture, from the ground up, shown bright over the dimmed whole; null for none. */
  readonly builtShare: number | null;
  /** A few characters on the picture's corner, such as how many are queued; null for none. */
  readonly corner: string | null;
  /** Up to two short lines under the cost; the text column is narrow beside the picture. */
  readonly hints: readonly string[];
  /** A progress bar along the bottom; null for none. */
  readonly bar: { readonly share: number; readonly colour: string } | null;
  /** The frame, which says what the button is doing. */
  readonly edge: { readonly colour: string; readonly thick: number };
}

/**
 * Screen pixels per art pixel of a button's picture: as large as fits the
 * well with some air round it, in whole pixels so it stays crisp. The Map's 2
 * is kept even without the air, as long as the picture stays inside the well;
 * only a short window's small well takes it down to 1.
 */
export function pictureScale(picture: { width: number; height: number }, well: Rect, largest: number): number {
  const fit = (share: number): number =>
    Math.floor(Math.min((well.width * share) / picture.width, (well.height * share) / picture.height));
  const least = fit(1) >= 2 ? 2 : 1;
  return Math.max(least, Math.min(largest, fit(0.85)));
}

/** Where a button of some height puts its parts; every y is measured from the button's top. */
export interface MenuButtonParts {
  /** The picture's well is this wide and as tall as the button allows. */
  readonly wellWidth: number;
  /** Middle of the name's line. */
  readonly nameY: number;
  /** Top of the key's badge; null on a button with no room for it whole. */
  readonly keyY: number | null;
  /** Middle of the cost's line, level with the badge; null with it. */
  readonly costY: number | null;
  /** Middle of each line of hint there is room for: two, one or none. */
  readonly hintYs: readonly number[];
  /** Top of the progress bar; null on a button where it would run across the key and cost. */
  readonly barY: number | null;
}

/** The least height that still has a line for the hint between the cost and the bar. */
const HINT_NEEDS = 52;
/** The least height with the bar clear below the key's badge: what the layout holds the buttons to while it can. */
const BAR_NEEDS = 42;
/** The least height that holds the key's badge whole. */
const KEY_NEEDS = 36;

/**
 * A full-size button has two lines of hint under the cost. A shorter one, on
 * a short window, packs its rows closer and keeps one line; its well shrinks
 * to stay square, which gives that one line more width. Shorter still it
 * loses the hint, then the bar, then the key and cost: each part is shown
 * whole or not at all, and the name goes last.
 */
export function menuButtonParts(height: number): MenuButtonParts {
  if (height >= BUILD_BUTTON_HEIGHT) {
    return { wellWidth: WELL, nameY: 13, keyY: 24, costY: 24 + KEY_BADGE / 2, hintYs: [50, 63], barY: height - 9 };
  }
  return {
    wellWidth: Math.max(0, Math.min(WELL, height - WELL_INSET * 2)),
    nameY: 10,
    keyY: height >= KEY_NEEDS ? 18 : null,
    costY: height >= KEY_NEEDS ? 18 + KEY_BADGE / 2 : null,
    hintYs: height >= HINT_NEEDS ? [41] : [],
    barY: height >= BAR_NEEDS ? height - 6 : null,
  };
}

/** One build or train button in `rect`. Expects textBaseline "middle", as the panels set it. */
export function drawMenuButton(ctx: CanvasRenderingContext2D, rect: Rect, button: MenuButton): void {
  const { picture, greyed } = button;
  const parts = menuButtonParts(rect.height);
  ctx.save();
  // A button squeezed below what its rows need cuts them off at its own edge rather than draw over its neighbour.
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  ctx.fillStyle = BUTTON_BG;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  // The picture, drawn crisp at a whole multiple of its art pixels.
  const well = {
    x: rect.x + WELL_INSET,
    y: rect.y + WELL_INSET,
    width: parts.wellWidth,
    height: Math.max(0, rect.height - WELL_INSET * 2),
  };
  ctx.fillStyle = BUTTON_WELL;
  ctx.fillRect(well.x, well.y, well.width, well.height);
  const scale = pictureScale(picture, well, button.largestScale);
  const pw = picture.width * scale;
  const ph = picture.height * scale;
  const px = well.x + Math.round((well.width - pw) / 2);
  const py = well.y + Math.round((well.height - ph) / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = button.pictureDimmed ? 0.3 : 1;
  ctx.drawImage(picture, px, py, pw, ph);
  ctx.globalAlpha = 1;
  if (button.builtShare !== null) {
    const rows = Math.round(picture.height * button.builtShare);
    ctx.drawImage(picture, 0, picture.height - rows, picture.width, rows, px, py + (picture.height - rows) * scale, pw, rows * scale);
  }
  ctx.imageSmoothingEnabled = true;
  if (button.corner !== null) {
    // On the picture's corner, where the eye already is.
    ctx.fillStyle = HUD_TEXT;
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(button.corner, well.x + well.width - 4, well.y + well.height - 9);
  }

  const textX = well.x + well.width + 8;
  const textW = rect.x + rect.width - 8 - textX;
  ctx.fillStyle = greyed ? BUTTON_DISABLED_TEXT : HUD_TEXT;
  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(button.name, textX, rect.y + parts.nameY, textW);
  // The key number sits beside the cost: the name needs the whole line next to the picture.
  const key = parts.keyY === null ? null : buttonKeyLabel(button.index);
  if (key !== null && parts.keyY !== null) drawKeyBadgeAt(ctx, key, textX, rect.y + parts.keyY);
  if (parts.costY !== null) {
    ctx.fillStyle = greyed ? BUTTON_DISABLED_TEXT : BUTTON_COST;
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${button.cost}`, key === null ? textX : textX + KEY_BADGE + 6, rect.y + parts.costY);
  }
  ctx.fillStyle = greyed ? BUTTON_DISABLED_TEXT : HUD_TEXT;
  ctx.font = "11px system-ui, sans-serif";
  // With fewer lines than hints, the hints run on in the last line, squeezed to its width.
  const lines = parts.hintYs.length;
  const hints =
    button.hints.length > lines && lines > 0
      ? [...button.hints.slice(0, lines - 1), button.hints.slice(lines - 1).join(" ")]
      : button.hints.slice(0, lines);
  for (const [line, text] of hints.entries()) ctx.fillText(text, textX, rect.y + parts.hintYs[line]!, textW);
  if (button.bar && parts.barY !== null) {
    const bar = { x: textX, y: rect.y + parts.barY, width: textW, height: 4 };
    ctx.fillStyle = BUTTON_WELL;
    ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
    ctx.fillStyle = button.bar.colour;
    ctx.fillRect(bar.x, bar.y, Math.round(bar.width * button.bar.share), bar.height);
  }

  const { colour, thick } = button.edge;
  ctx.fillStyle = colour;
  ctx.fillRect(rect.x, rect.y, rect.width, thick);
  ctx.fillRect(rect.x, rect.y + rect.height - thick, rect.width, thick);
  ctx.fillRect(rect.x, rect.y, thick, rect.height);
  ctx.fillRect(rect.x + rect.width - thick, rect.y, thick, rect.height);
  ctx.restore();
}
