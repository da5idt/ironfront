import { BUILDING_STATS, type PlayerView } from "../sim";
import { BUTTON_MARGIN, BUTTONS_HEADER, buildButtons, buttonState, type ButtonState } from "./buildPanel";
import type { Rect } from "./layout";
import {
  BUTTON_BG,
  BUTTON_DISABLED_TEXT,
  BUTTON_EDGE,
  BUTTON_KEY_BG,
  BUTTON_PROGRESS,
  BUTTON_READY,
  HUD_TEXT,
} from "./palette";
import { buttonKeyLabel } from "./sidePanel";

// Draws the HQ's build buttons from the same pure functions main.ts hit-tests with.

const HINTS: Record<ButtonState, string> = {
  available: "",
  unaffordable: "not enough Credits",
  busy: "HQ busy",
  building: "click to cancel",
  ready: "click to place, right-click cancels",
};

export function drawBuildPanel(ctx: CanvasRenderingContext2D, view: PlayerView, area: Rect): void {
  ctx.textBaseline = "middle";
  ctx.font = "bold 13px system-ui, sans-serif";
  ctx.fillStyle = HUD_TEXT;
  ctx.textAlign = "left";
  ctx.fillText("Build", area.x + BUTTON_MARGIN, area.y + BUTTONS_HEADER / 2);
  for (const [index, { kind, rect }] of buildButtons(area).entries()) {
    const state = buttonState(view, kind);
    const greyed = state === "unaffordable" || state === "busy";
    ctx.fillStyle = BUTTON_BG;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    if (state === "building" || state === "ready") {
      const progress = view.production?.progress ?? 0;
      ctx.fillStyle = state === "ready" ? BUTTON_READY : BUTTON_PROGRESS;
      ctx.fillRect(rect.x, rect.y, rect.width * progress, rect.height);
    }
    ctx.strokeStyle = BUTTON_EDGE;
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);

    const stats = BUILDING_STATS[kind];
    const nameX = drawKeyBadge(ctx, buttonKeyLabel(index), rect);
    ctx.fillStyle = greyed ? BUTTON_DISABLED_TEXT : HUD_TEXT;
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(stats.name, nameX, rect.y + 15);
    ctx.textAlign = "right";
    ctx.fillText(`${stats.cost}`, rect.x + rect.width - 8, rect.y + 15);
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(HINTS[state], rect.x + 8, rect.y + 32);
  }
}

const KEY_BADGE = 16;

/**
 * The number key that presses this button, in a small box at its top left, so
 * the shortcut needs no remembering. Returns where the button's name starts.
 */
export function drawKeyBadge(ctx: CanvasRenderingContext2D, label: string | null, rect: Rect): number {
  if (label === null) return rect.x + 8;
  const x = rect.x + 6;
  const y = rect.y + 15 - KEY_BADGE / 2;
  ctx.fillStyle = BUTTON_KEY_BG;
  ctx.fillRect(x, y, KEY_BADGE, KEY_BADGE);
  ctx.fillStyle = HUD_TEXT;
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, x + KEY_BADGE / 2, y + KEY_BADGE / 2 + 1);
  return x + KEY_BADGE + 6;
}
