import {
  type BuildingKind,
  type BuildingView,
  type Command,
  type EntityId,
  TRAINING,
  type TrainingView,
  TRAINS,
  UNIT_STATS,
  type UnitKind,
} from "../sim";
import { BUILD_BUTTON_HEIGHT, BUTTON_GAP, BUTTON_MARGIN, BUTTONS_HEADER } from "./buildPanel";
import { contains, type Rect } from "./layout";

// The side panel's train buttons, shown in place of the HQ's build buttons
// while an own Barracks or Vehicle Factory is selected. Pure, like buildPanel.ts,
// so main.ts hit-tests and the painter draws from the same functions.

export interface TrainButton {
  readonly kind: UnitKind;
  readonly rect: Rect;
}

export interface TrainButtonState {
  /** "unaffordable" and "full" are greyed out. */
  readonly status: "available" | "unaffordable" | "full";
  /** How many of this Unit are in the queue. */
  readonly queued: number;
  /** Progress of this Unit when it is the one in training, else null. */
  readonly progress: number | null;
}

/** An own Building that trains Units, as the view shows it. */
export type Trainer = BuildingView & { readonly training: TrainingView };

/** The selected Building when it is an own one that trains Units; null sends the panel back to the HQ's buttons. */
export function trainerOf(buildings: readonly BuildingView[], selected: EntityId | null): Trainer | null {
  if (selected === null) return null;
  // The view only fills in `training` for the Player's own trainers.
  return buildings.find((b): b is Trainer => b.id === selected && b.training !== null) ?? null;
}

export function trainButtons(area: Rect, building: BuildingKind): TrainButton[] {
  return (TRAINS[building] ?? []).map((kind, i) => ({
    kind,
    rect: {
      x: area.x + BUTTON_MARGIN,
      // The same size as a build button, so both menus show a picture the same way.
      y: area.y + BUTTONS_HEADER + i * (BUILD_BUTTON_HEIGHT + BUTTON_GAP),
      width: Math.max(0, area.width - BUTTON_MARGIN * 2),
      height: BUILD_BUTTON_HEIGHT,
    },
  }));
}

export function trainButtonAt(buttons: readonly TrainButton[], x: number, y: number): UnitKind | null {
  return buttons.find((b) => contains(b.rect, x, y))?.kind ?? null;
}

export function trainButtonState(credits: number, training: TrainingView, kind: UnitKind): TrainButtonState {
  const queued = training.queue.filter((k) => k === kind).length;
  const progress = training.queue[0] === kind ? training.progress : null;
  const status =
    training.queue.length >= TRAINING.queueSize
      ? "full"
      : credits >= UNIT_STATS[kind].cost
        ? "available"
        : "unaffordable";
  return { status, queued, progress };
}

/**
 * Left-click queues one more. Right-click cancels, but only on the button of
 * the newest queued Unit: cancelTraining always takes the newest, and a
 * right-click on another button would otherwise cancel a Unit it doesn't show.
 */
export function trainClick(
  buildingId: EntityId,
  training: TrainingView,
  credits: number,
  kind: UnitKind,
  button: "left" | "right",
): Command | null {
  if (button === "right") {
    return training.queue.at(-1) === kind ? { type: "cancelTraining", buildingId } : null;
  }
  return trainButtonState(credits, training, kind).status === "available" ? { type: "train", buildingId, kind } : null;
}
