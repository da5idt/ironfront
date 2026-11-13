import type { BuildingKind, CellPos, EntityId, UnitKind } from "./types";

/**
 * Every order a Player can give. The person playing and the Computer Opponent
 * use exactly this set. Commands are plain data so they can be logged and replayed.
 */
export type Command =
  | { readonly type: "move"; readonly unitIds: readonly EntityId[]; readonly target: CellPos }
  | { readonly type: "attack"; readonly unitIds: readonly EntityId[]; readonly targetId: EntityId }
  | { readonly type: "harvest"; readonly unitIds: readonly EntityId[]; readonly target: CellPos }
  | { readonly type: "stop"; readonly unitIds: readonly EntityId[] }
  | { readonly type: "setRallyPoint"; readonly buildingId: EntityId; readonly target: CellPos }
  | { readonly type: "startBuilding"; readonly kind: BuildingKind }
  | { readonly type: "cancelBuilding" }
  | { readonly type: "placeBuilding"; readonly at: CellPos }
  | { readonly type: "train"; readonly buildingId: EntityId; readonly kind: UnitKind }
  | { readonly type: "cancelTraining"; readonly buildingId: EntityId };

export type CommandType = Command["type"];
export type CommandOf<T extends CommandType> = Extract<Command, { type: T }>;

/** Rejected Commands leave the Match unchanged. */
export type CommandResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export const OK: CommandResult = { ok: true };
export function reject(reason: string): CommandResult {
  return { ok: false, reason };
}
