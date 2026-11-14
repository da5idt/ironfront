import { type EntityId, type PlayerId, TICKS_PER_SECOND } from "../../sim";
import { BUILD_UP_SECONDS } from "./buildingArt";

// Which of the Player's own Buildings are newly placed and still rising from
// the ground. Pure helpers for the presentation module, which holds the
// result in its state (Presentation.placedAt) along with everything else it
// remembers of the last view; nothing is kept here.

/** The parts of a Player view this reads. */
export interface BuildUpView {
  readonly tick: number;
  readonly playerId: PlayerId;
  readonly buildings: readonly { readonly id: EntityId; readonly owner: PlayerId; readonly remembered: boolean }[];
}

/** The Tick each Building still rising first appeared. */
export type PlacedAt = ReadonlyMap<EntityId, number>;

const RISE_TICKS = BUILD_UP_SECONDS * TICKS_PER_SECOND;

/**
 * The Buildings still rising in the new view. `before` is what the last view
 * left: its notes and the Buildings that were in it. Null (the start of a
 * Match, or another Player's view) means what is there is already built.
 */
export function risingBuildings(
  before: { readonly placedAt: PlacedAt; readonly buildings: { has(id: EntityId): boolean } } | null,
  view: BuildUpView,
): PlacedAt {
  const placedAt = new Map<EntityId, number>();
  if (!before) return placedAt;
  for (const b of view.buildings) {
    // Only the Player's own: the other Player's Buildings come into sight already built.
    if (b.owner !== view.playerId || b.remembered) continue;
    const since = before.buildings.has(b.id) ? before.placedAt.get(b.id) : view.tick;
    if (since !== undefined && view.tick - since < RISE_TICKS) placedAt.set(b.id, since);
  }
  return placedAt;
}

/** How far a Building has risen at `tick` (which may be between Ticks): 0 just placed, 1 standing. */
export function buildUpProgress(placedAt: PlacedAt, id: EntityId, tick: number): number {
  const since = placedAt.get(id);
  if (since === undefined) return 1;
  return Math.max(0, Math.min(1, (tick - since) / RISE_TICKS));
}
