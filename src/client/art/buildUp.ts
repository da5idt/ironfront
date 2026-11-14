import { type EntityId, type PlayerId, TICKS_PER_SECOND } from "../../sim";
import { BUILD_UP_SECONDS } from "./buildingArt";

// Notes when one of the Player's own Buildings first appears in the view, so
// the client can show it rising from the ground. Client-only and pure: it
// reads Player views and never touches the Match (ADR 0002). The presentation
// module of ticket #21 may take this over.

/** The parts of a Player view this reads. */
export interface BuildUpView {
  readonly tick: number;
  readonly playerId: PlayerId;
  readonly buildings: readonly { readonly id: EntityId; readonly owner: PlayerId; readonly remembered: boolean }[];
}

export interface BuildUps {
  readonly playerId: PlayerId;
  readonly tick: number;
  /** The Player's own Buildings in the last view. */
  readonly known: ReadonlySet<EntityId>;
  /** The Tick each Building still rising first appeared. */
  readonly placedAt: ReadonlyMap<EntityId, number>;
}

const RISE_TICKS = BUILD_UP_SECONDS * TICKS_PER_SECOND;

/** The next notes, given the last ones (null at the start) and the new view. */
export function noteBuildings(prev: BuildUps | null, view: BuildUpView): BuildUps {
  // A new Match (Ticks start again) or another Player's view: what is there is already built.
  const carriesOn = prev !== null && prev.playerId === view.playerId && view.tick >= prev.tick;
  const known = new Set<EntityId>();
  const placedAt = new Map<EntityId, number>();
  for (const b of view.buildings) {
    // Only the Player's own: the other Player's Buildings come into sight already built.
    if (b.owner !== view.playerId || b.remembered) continue;
    known.add(b.id);
    if (!carriesOn) continue;
    const since = prev.known.has(b.id) ? prev.placedAt.get(b.id) : view.tick;
    if (since !== undefined && view.tick - since < RISE_TICKS) placedAt.set(b.id, since);
  }
  return { playerId: view.playerId, tick: view.tick, known, placedAt };
}

/** How far a Building has risen at `tick` (which may be between Ticks): 0 just placed, 1 standing. */
export function buildUpProgress(ups: BuildUps, id: EntityId, tick: number): number {
  const since = ups.placedAt.get(id);
  if (since === undefined) return 1;
  return Math.max(0, Math.min(1, (tick - since) / RISE_TICKS));
}
