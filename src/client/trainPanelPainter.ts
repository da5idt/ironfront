import { BUILDING_STATS, TRAINING, UNIT_STATS } from "../sim";
import { BUTTON_MARGIN, BUTTONS_HEADER } from "./buildPanel";
import type { Rect } from "./layout";
import { BUTTON_BG, BUTTON_DISABLED_TEXT, BUTTON_EDGE, BUTTON_PROGRESS, HUD_TEXT } from "./palette";
import { type Trainer, trainButtons, trainButtonState, type TrainButtonState } from "./trainPanel";

// Draws the selected Barracks or Vehicle Factory's train buttons from the same
// pure functions main.ts hit-tests with.

function hint(state: TrainButtonState): string {
  if (state.status === "full") return "queue full";
  if (state.status === "unaffordable") return "not enough Credits";
  return state.queued > 0 ? "click to train, right-click cancels" : "click to train";
}

export function drawTrainPanel(ctx: CanvasRenderingContext2D, credits: number, building: Trainer, area: Rect): void {
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

  for (const { kind, rect } of trainButtons(area, building.kind)) {
    const state = trainButtonState(credits, training, kind);
    ctx.fillStyle = BUTTON_BG;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    if (state.progress !== null) {
      ctx.fillStyle = BUTTON_PROGRESS;
      ctx.fillRect(rect.x, rect.y, rect.width * state.progress, rect.height);
    }
    ctx.strokeStyle = BUTTON_EDGE;
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);

    const stats = UNIT_STATS[kind];
    ctx.fillStyle = state.status === "available" ? HUD_TEXT : BUTTON_DISABLED_TEXT;
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(state.queued > 0 ? `${stats.name} x${state.queued}` : stats.name, rect.x + 8, rect.y + 15);
    ctx.textAlign = "right";
    ctx.fillText(`${stats.cost}`, rect.x + rect.width - 8, rect.y + 15);
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(hint(state), rect.x + 8, rect.y + 32);
  }
}
