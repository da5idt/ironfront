import { BUILDING_STATS, type BuildingKind, type PlayerView } from "../sim";
import { BUTTON_MARGIN, BUTTONS_HEADER, buildButtons, buttonLook, type ButtonState } from "./buildPanel";
import type { Rect } from "./layout";
import {
  BUTTON_BG,
  BUTTON_COST,
  BUTTON_DISABLED_TEXT,
  BUTTON_EDGE,
  BUTTON_KEY_BG,
  BUTTON_PLACING_EDGE,
  BUTTON_PROGRESS,
  BUTTON_READY,
  BUTTON_READY_EDGE,
  BUTTON_WELL,
  HUD_TEXT,
} from "./palette";
import { buttonKeyLabel } from "./sidePanel";

// Draws the HQ's build buttons from the same pure functions main.ts hit-tests with.

type Look = ButtonState | "placing";

/** Up to two short lines under the cost; the text column is narrow beside the picture. */
const HINTS: Record<Look, readonly string[]> = {
  available: [],
  unaffordable: ["not enough", "Credits"],
  busy: ["HQ busy"],
  building: ["click to cancel"],
  ready: ["ready: click,", "then pick a spot"],
  placing: ["placing: pick a spot", "Esc cancels"],
};

/** The picture's well: room for a 3 by 3 Cell Building at twice its art size. */
const WELL = 72;
const WELL_INSET = 4;

/** Screen pixels per art pixel of a button picture: 2 like the Map, or 3 where a small sprite would look lost. */
function iconScale(icon: { width: number; height: number }): number {
  return Math.max(icon.width, icon.height) * 3 <= WELL * 0.85 ? 3 : 2;
}

/**
 * `placing` is the Building the person is placing, if any; `icon` gives a
 * Building's still picture in the Player's colours.
 */
export function drawBuildPanel(
  ctx: CanvasRenderingContext2D,
  view: PlayerView,
  area: Rect,
  placing: BuildingKind | null,
  icon: (kind: BuildingKind) => HTMLCanvasElement,
): void {
  ctx.textBaseline = "middle";
  ctx.font = "bold 13px system-ui, sans-serif";
  ctx.fillStyle = HUD_TEXT;
  ctx.textAlign = "left";
  ctx.fillText("Build", area.x + BUTTON_MARGIN, area.y + BUTTONS_HEADER / 2);
  for (const [index, { kind, rect }] of buildButtons(area).entries()) {
    const look = buttonLook(view, kind, placing);
    const greyed = look === "unaffordable" || look === "busy";
    const progress = view.production?.progress ?? 0;
    ctx.fillStyle = BUTTON_BG;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

    // The picture, drawn crisp at a whole multiple of its art pixels.
    const well = { x: rect.x + WELL_INSET, y: rect.y + WELL_INSET, width: WELL, height: rect.height - WELL_INSET * 2 };
    ctx.fillStyle = BUTTON_WELL;
    ctx.fillRect(well.x, well.y, well.width, well.height);
    const picture = icon(kind);
    const scale = iconScale(picture);
    const pw = picture.width * scale;
    const ph = picture.height * scale;
    const px = well.x + Math.round((well.width - pw) / 2);
    const py = well.y + Math.round((well.height - ph) / 2);
    ctx.imageSmoothingEnabled = false;
    // Dim while it cannot be started and while it is being built; the built share shows bright from the ground up.
    ctx.globalAlpha = greyed || look === "building" ? 0.3 : 1;
    ctx.drawImage(picture, px, py, pw, ph);
    ctx.globalAlpha = 1;
    if (look === "building") {
      const rows = Math.round(picture.height * progress);
      ctx.drawImage(picture, 0, picture.height - rows, picture.width, rows, px, py + (picture.height - rows) * scale, pw, rows * scale);
    }
    ctx.imageSmoothingEnabled = true;

    const stats = BUILDING_STATS[kind];
    const textX = well.x + well.width + 8;
    const textW = rect.x + rect.width - 8 - textX;
    ctx.fillStyle = greyed ? BUTTON_DISABLED_TEXT : HUD_TEXT;
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(stats.name, textX, rect.y + 13, textW);
    // The key number sits beside the cost: the name needs the whole line next to the picture.
    const key = buttonKeyLabel(index);
    if (key !== null) drawKeyBadgeAt(ctx, key, textX, rect.y + 24);
    const costX = key === null ? textX : textX + KEY_BADGE + 6;
    ctx.fillStyle = greyed ? BUTTON_DISABLED_TEXT : BUTTON_COST;
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${stats.cost}`, costX, rect.y + 32);
    ctx.fillStyle = greyed ? BUTTON_DISABLED_TEXT : HUD_TEXT;
    ctx.font = "11px system-ui, sans-serif";
    for (const [line, text] of HINTS[look].entries()) ctx.fillText(text, textX, rect.y + 50 + line * 13, textW);
    if (look === "building" || look === "ready" || look === "placing") {
      const bar = { x: textX, y: rect.y + rect.height - 9, width: textW, height: 4 };
      ctx.fillStyle = BUTTON_WELL;
      ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
      ctx.fillStyle = look === "building" ? BUTTON_PROGRESS : BUTTON_READY;
      ctx.fillRect(bar.x, bar.y, Math.round(bar.width * progress), bar.height);
    }

    // The frame says what the button is doing: ready to place, or being placed right now.
    const edge = look === "placing" ? BUTTON_PLACING_EDGE : look === "ready" ? BUTTON_READY_EDGE : BUTTON_EDGE;
    const thick = look === "placing" || look === "ready" ? 2 : 1;
    ctx.fillStyle = edge;
    ctx.fillRect(rect.x, rect.y, rect.width, thick);
    ctx.fillRect(rect.x, rect.y + rect.height - thick, rect.width, thick);
    ctx.fillRect(rect.x, rect.y, thick, rect.height);
    ctx.fillRect(rect.x + rect.width - thick, rect.y, thick, rect.height);
  }
}

const KEY_BADGE = 16;

/**
 * The number key that presses this button, in a small box at its top left, so
 * the shortcut needs no remembering. Returns where the text beside it starts.
 */
export function drawKeyBadge(ctx: CanvasRenderingContext2D, label: string | null, rect: Rect): number {
  if (label === null) return rect.x + 8;
  const x = rect.x + 6;
  drawKeyBadgeAt(ctx, label, x, rect.y + 15 - KEY_BADGE / 2);
  return x + KEY_BADGE + 6;
}

/** The key badge alone, with its top-left corner at x, y. */
function drawKeyBadgeAt(ctx: CanvasRenderingContext2D, label: string, x: number, y: number): void {
  ctx.fillStyle = BUTTON_KEY_BG;
  ctx.fillRect(x, y, KEY_BADGE, KEY_BADGE);
  ctx.fillStyle = HUD_TEXT;
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, x + KEY_BADGE / 2, y + KEY_BADGE / 2 + 1);
}
