import type { EntityId, PlayerView } from "../sim";
import { buildButtons, buttonAt, buttonState, type PanelAction, panelClick } from "./buildPanel";
import type { Rect } from "./layout";
import { trainButtonAt, trainButtons, trainButtonState, trainClick, trainerOf } from "./trainPanel";

// The side panel as one set of buttons, whichever menu it shows: the HQ's
// build buttons, or the selected Barracks' or Vehicle Factory's train buttons.
// A number key presses a button exactly as a left-click on it does, so both go
// through sidePanelPress and cannot drift apart.

/** Number keys 1 to 4 press the panel's buttons from the top; there are never more than four. */
const KEY_LABELS = ["1", "2", "3", "4"] as const;

/** What the side panel reads from a PlayerView. */
export type SidePanelView = Pick<PlayerView, "credits" | "production" | "buildings">;

/** Which button: the one under a point on screen, or the one a number key names (0 is the top button). */
export type ButtonTarget = { readonly point: { readonly x: number; readonly y: number } } | { readonly key: number };

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
    const buttons = trainButtons(area, trainer.kind);
    const kind =
      "key" in target ? (buttons[target.key]?.kind ?? null) : trainButtonAt(buttons, target.point.x, target.point.y);
    const command = kind ? trainClick(trainer.id, trainer.training, view.credits, kind, button) : null;
    return command ? { type: "command", command } : null;
  }
  const buttons = buildButtons(area);
  const kind =
    "key" in target ? (buttons[target.key]?.kind ?? null) : buttonAt(buttons, target.point.x, target.point.y);
  if (!kind) return null;
  // Cancelling stays a mouse action: a second tap of the key that started a Building must not throw it away.
  if ("key" in target && buttonState(view, kind) === "building") return null;
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
    const buttons = trainButtons(area, trainer.kind);
    const kind =
      "key" in target ? (buttons[target.key]?.kind ?? null) : trainButtonAt(buttons, target.point.x, target.point.y);
    return kind !== null && trainButtonState(view.credits, trainer.training, kind).status === "unaffordable";
  }
  const buttons = buildButtons(area);
  const kind =
    "key" in target ? (buttons[target.key]?.kind ?? null) : buttonAt(buttons, target.point.x, target.point.y);
  return kind !== null && buttonState(view, kind) === "unaffordable";
}
