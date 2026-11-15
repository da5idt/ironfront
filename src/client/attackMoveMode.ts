import type { CellPos, Command, EntityId } from "../sim";
import type { Size } from "./camera";
import type { Selection } from "./selection";

// Giving an Attack-move: the A key arms it, the next left-click on the Map or
// the minimap issues it for the selected Units, and a right-click or Escape
// backs out. Pure, like placing.ts, so main.ts only feeds it clicks and acts
// on the outcome.

/** Shown over the Map while an Attack-move waits for its click. */
export const ATTACK_MOVE_HINT = "Attack-move: left-click where to go. Right-click or Esc cancels.";

/**
 * Whether the A key arms an Attack-move: only with Units selected, and not
 * while a Building is on the cursor, whose next click is already spoken for.
 */
export function canArmAttackMove(selection: Selection, placing: boolean): boolean {
  return selection.size > 0 && !placing;
}

export type AttackMoveOutcome =
  /** Issue the Command, mark the Cell and leave the mode: one click, one Attack-move. */
  | { readonly type: "issue"; readonly command: Extract<Command, { type: "attackMove" }> }
  /** Leave the mode without a Command. */
  | { readonly type: "cancel" }
  /** Stay armed: the click was not on the Map. */
  | { readonly type: "stay" };

/**
 * A click while an Attack-move is armed. `cell` is the Cell under the mouse,
 * on the Map view or through the minimap, or null when the click was on neither.
 */
export function attackMoveClick(
  selection: Selection,
  cell: CellPos | null,
  mapCells: Size,
  button: "left" | "right",
): AttackMoveOutcome {
  if (button === "right" || selection.size === 0) return { type: "cancel" };
  if (!cell || cell.x < 0 || cell.y < 0 || cell.x >= mapCells.width || cell.y >= mapCells.height) return { type: "stay" };
  const unitIds: EntityId[] = [...selection];
  return { type: "issue", command: { type: "attackMove", unitIds, target: cell } };
}
