import { BUILDING_STATS, TRAINING, UNIT_STATS, type UnitKind } from "../sim";
import { BUTTON_MARGIN, BUTTONS_HEADER } from "./buildPanel";
import { drawMenuButton } from "./buttonPainter";
import type { Rect } from "./layout";
import { BUTTON_EDGE, BUTTON_PROGRESS, HUD_TEXT } from "./palette";
import { type Trainer, trainButtons, trainButtonState, type TrainButtonState } from "./trainPanel";

// Draws the selected Barracks or Vehicle Factory's train buttons from the same
// pure functions main.ts hit-tests with, laid out like the build buttons
// (buttonPainter.ts).

function hints(state: TrainButtonState): readonly string[] {
  if (state.status === "full") return ["queue full"];
  if (state.status === "unaffordable") return ["not enough", "Credits"];
  return state.queued > 0 ? ["click: one more", "right-click: cancel"] : ["click to train"];
}

/** A Unit's sprite is small, so its picture may be blown up well past the Map's 2 to fill the well. */
const LARGEST_PICTURE_SCALE = 5;

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
    const stats = UNIT_STATS[kind];
    drawMenuButton(ctx, rect, {
      index,
      name: stats.name,
      cost: stats.cost,
      greyed,
      picture: icon(kind),
      largestScale: LARGEST_PICTURE_SCALE,
      // Dim only when a click would do nothing and none of this Unit is on its way.
      pictureDimmed: greyed && state.queued === 0,
      builtShare: null,
      corner: state.queued > 0 ? `x${state.queued}` : null,
      hints: hints(state),
      bar: state.progress !== null ? { share: state.progress, colour: BUTTON_PROGRESS } : null,
      edge: { colour: BUTTON_EDGE, thick: 1 },
    });
  }
}
