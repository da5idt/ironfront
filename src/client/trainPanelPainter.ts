import { BUILDING_STATS, TRAINING, UNIT_STATS, type UnitKind } from "../sim";
import { BUTTON_MARGIN, BUTTONS_HEADER } from "./buildPanel";
import { drawKeyBadgeAt, KEY_BADGE, WELL, WELL_INSET } from "./buttonPainter";
import type { Rect } from "./layout";
import { BUTTON_BG, BUTTON_COST, BUTTON_DISABLED_TEXT, BUTTON_EDGE, BUTTON_PROGRESS, BUTTON_WELL, HUD_TEXT } from "./palette";
import { buttonKeyLabel } from "./sidePanel";
import { type Trainer, trainButtons, trainButtonState, type TrainButtonState } from "./trainPanel";

// Draws the selected Barracks or Vehicle Factory's train buttons from the same
// pure functions main.ts hit-tests with, laid out like the build buttons:
// the Unit's picture in a well on the left, its name, key and cost beside it.

/** Up to two short lines under the cost; the text column is narrow beside the picture. */
function hints(state: TrainButtonState): readonly string[] {
  if (state.status === "full") return ["queue full"];
  if (state.status === "unaffordable") return ["not enough", "Credits"];
  return state.queued > 0 ? ["click: one more", "right-click: cancel"] : ["click to train"];
}

/** Screen pixels per art pixel of a Unit's picture: as large as fits the well, in whole pixels so it stays crisp. */
function iconScale(icon: { width: number; height: number }, well: Rect): number {
  return Math.max(2, Math.min(5, Math.floor(Math.min((well.width * 0.85) / icon.width, (well.height * 0.85) / icon.height))));
}

/** `icon` gives a Unit's still picture in the Player's colours. */
export function drawTrainPanel(
  ctx: CanvasRenderingContext2D,
  credits: number,
  building: Trainer,
  area: Rect,
  icon: (kind: UnitKind) => HTMLCanvasElement,
): void {
  const { training } = building;
  ctx.textBaseline = "middle";
  ctx.font = "bold 13px system-ui, sans-serif";
  ctx.fillStyle = HUD_TEXT;
  ctx.textAlign = "left";
  ctx.fillText(BUILDING_STATS[building.kind].name, area.x + BUTTON_MARGIN, area.y + BUTTONS_HEADER / 2);
  ctx.textAlign = "right";
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillText(
    `queue ${training.queue.length}/${TRAINING.queueSize}`,
    area.x + area.width - BUTTON_MARGIN,
    area.y + BUTTONS_HEADER / 2,
  );

  for (const [index, { kind, rect }] of trainButtons(area, building.kind).entries()) {
    const state = trainButtonState(credits, training, kind);
    const greyed = state.status !== "available";
    ctx.fillStyle = BUTTON_BG;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

    const well = { x: rect.x + WELL_INSET, y: rect.y + WELL_INSET, width: WELL, height: rect.height - WELL_INSET * 2 };
    ctx.fillStyle = BUTTON_WELL;
    ctx.fillRect(well.x, well.y, well.width, well.height);
    const picture = icon(kind);
    const scale = iconScale(picture, well);
    const pw = picture.width * scale;
    const ph = picture.height * scale;
    ctx.imageSmoothingEnabled = false;
    // Dim only when a click would do nothing and none of this Unit is on its way.
    ctx.globalAlpha = greyed && state.queued === 0 ? 0.3 : 1;
    ctx.drawImage(picture, well.x + Math.round((well.width - pw) / 2), well.y + Math.round((well.height - ph) / 2), pw, ph);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    if (state.queued > 0) {
      // How many are queued, on the picture's corner, where the eye already is.
      ctx.fillStyle = HUD_TEXT;
      ctx.font = "bold 12px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`x${state.queued}`, well.x + well.width - 4, well.y + well.height - 9);
    }

    const stats = UNIT_STATS[kind];
    const textX = well.x + well.width + 8;
    const textW = rect.x + rect.width - 8 - textX;
    ctx.fillStyle = greyed ? BUTTON_DISABLED_TEXT : HUD_TEXT;
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(stats.name, textX, rect.y + 13, textW);
    const key = buttonKeyLabel(index);
    if (key !== null) drawKeyBadgeAt(ctx, key, textX, rect.y + 24);
    ctx.fillStyle = greyed ? BUTTON_DISABLED_TEXT : BUTTON_COST;
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${stats.cost}`, key === null ? textX : textX + KEY_BADGE + 6, rect.y + 32);
    ctx.fillStyle = greyed ? BUTTON_DISABLED_TEXT : HUD_TEXT;
    ctx.font = "11px system-ui, sans-serif";
    for (const [line, text] of hints(state).entries()) ctx.fillText(text, textX, rect.y + 50 + line * 13, textW);
    if (state.progress !== null) {
      const bar = { x: textX, y: rect.y + rect.height - 9, width: textW, height: 4 };
      ctx.fillStyle = BUTTON_WELL;
      ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
      ctx.fillStyle = BUTTON_PROGRESS;
      ctx.fillRect(bar.x, bar.y, Math.round(bar.width * state.progress), bar.height);
    }

    ctx.strokeStyle = BUTTON_EDGE;
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
  }
}
