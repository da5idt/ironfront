import { BUILDING_STATS, type BuildingKind, type PlayerView } from "../sim";
import { BUTTON_MARGIN, BUTTONS_HEADER, buildButtons, buttonLook, type ButtonState } from "./buildPanel";
import { drawMenuButton } from "./buttonPainter";
import type { Rect } from "./layout";
import {
  BUTTON_EDGE,
  BUTTON_PLACING_EDGE,
  BUTTON_PROGRESS,
  BUTTON_READY,
  BUTTON_READY_EDGE,
  HUD_TEXT,
} from "./palette";

// Draws the HQ's build buttons from the same pure functions main.ts hit-tests with.

type Look = ButtonState | "placing";

const HINTS: Record<Look, readonly string[]> = {
  available: [],
  unaffordable: ["not enough", "Credits"],
  busy: ["HQ busy"],
  building: ["right-click", "to cancel"],
  ready: ["ready: click,", "then pick a spot"],
  placing: ["placing: pick a spot", "Esc cancels"],
};

/** A Building's picture is shown at 2 like the Map, or at 3 where a small sprite would look lost. */
const LARGEST_PICTURE_SCALE = 3;

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
    const stats = BUILDING_STATS[kind];
    // The frame says what the button is doing: ready to place, or being placed right now.
    const marked = look === "placing" || look === "ready";
    drawMenuButton(ctx, rect, {
      index,
      name: stats.name,
      cost: stats.cost,
      greyed,
      picture: icon(kind),
      largestScale: LARGEST_PICTURE_SCALE,
      // Dim while it cannot be started and while it is being built; the built share shows bright from the ground up.
      pictureDimmed: greyed || look === "building",
      builtShare: look === "building" ? progress : null,
      corner: null,
      hints: HINTS[look],
      bar: look === "building" || marked ? { share: progress, colour: look === "building" ? BUTTON_PROGRESS : BUTTON_READY } : null,
      edge: {
        colour: look === "placing" ? BUTTON_PLACING_EDGE : look === "ready" ? BUTTON_READY_EDGE : BUTTON_EDGE,
        thick: marked ? 2 : 1,
      },
    });
  }
}
