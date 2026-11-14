import type { EntityId, PlayerView } from "../sim";
import { buildButtons, buttonAt, buttonState, type PanelAction, panelClick } from "./buildPanel";
import type { Rect } from "./layout";
import { trainButtonAt, trainButtons, trainButtonState, trainClick, trainerOf } from "./trainPanel";

// The side panel as one set of buttons, whichever menu it shows: the HQ's
// build buttons, or the selected Barracks' or Vehicle Factory's train buttons.
// A number key and a click both go through sidePanelPress, so a key starts,
// places and trains exactly as a left-click on its button does. The one
// difference is on purpose: a key never cancels (cancelling is a right-click).

/** Number keys 1 to 4 press the panel's buttons from the top; there are never more than four. */
const KEY_LABELS = ["1", "2", "3", "4"] as const;

/** What the side panel reads from a PlayerView. */
export type SidePanelView = Pick<PlayerView, "credits" | "production" | "buildings">;

/** Which button: the one under a point on screen, or the one at an index from the top (0 is the top button), as a number key names it. */
export type ButtonTarget = { readonly point: { readonly x: number; readonly y: number } } | { readonly index: number };

/**
 * What the targeted button builds or trains, or null when the target names no
 * button. `under` is the menu's own hit test for a point.
 */
function targeted<B extends { readonly kind: unknown }>(
  buttons: readonly B[],
  target: ButtonTarget,
  under: (buttons: readonly B[], x: number, y: number) => B["kind"] | null,
): B["kind"] | null {
  if ("index" in target) return buttons[target.index]?.kind ?? null;
  return under(buttons, target.point.x, target.point.y);
}

/** The button a key presses, 0 for the top one, or null for a key that presses none. */
export function keyButtonIndex(code: string): number | null {
  const match = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (!match) return null;
  const index = KEY_LABELS.indexOf(match[1] as (typeof KEY_LABELS)[number]);
  return index >= 0 ? index : null;
}

/** The key number a button shows, or null for a button no key reaches. */
export function buttonKeyLabel(index: number): string | null {
  return KEY_LABELS[index] ?? null;
}

/** What pressing a button means; null when there is no such button or it is greyed out. */
export function sidePanelPress(
  view: SidePanelView,
  selectedBuilding: EntityId | null,
  area: Rect,
  target: ButtonTarget,
  button: "left" | "right",
): PanelAction | null {
  const trainer = trainerOf(view.buildings, selectedBuilding);
  if (trainer) {
    const kind = targeted(trainButtons(area, trainer.kind), target, trainButtonAt);
    const command = kind ? trainClick(trainer.id, trainer.training, view.credits, kind, button) : null;
    return command ? { type: "command", command } : null;
  }
  const kind = targeted(buildButtons(area), target, buttonAt);
  if (!kind) return null;
  // Cancelling stays a mouse action: a second tap of the key that started a Building must not throw it away.
  if ("index" in target && buttonState(view, kind) === "building") return null;
  return panelClick(view, kind, button);
}

/**
 * True when a left press lands on a button that is greyed out only because
 * the Player cannot pay for it: the moment for the "Not enough Credits"
 * alert. A busy HQ or a full queue refuses for another reason and is not one.
 */
export function creditsShortPress(
  view: SidePanelView,
  selectedBuilding: EntityId | null,
  area: Rect,
  target: ButtonTarget,
  button: "left" | "right",
): boolean {
  if (button !== "left") return false;
  const trainer = trainerOf(view.buildings, selectedBuilding);
  if (trainer) {
    const kind = targeted(trainButtons(area, trainer.kind), target, trainButtonAt);
    return kind !== null && trainButtonState(view.credits, trainer.training, kind).status === "unaffordable";
  }
  const kind = targeted(buildButtons(area), target, buttonAt);
  return kind !== null && buttonState(view, kind) === "unaffordable";
}
