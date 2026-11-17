import {
  type BuildingView,
  type CellPos,
  cellIndexIn,
  type EntityId,
  isPassableTerrain,
  type PassengerView,
  type PlayerView,
} from "../sim";

// Where the Computer Opponent's base is, as its own view shows it. Shared by the
// economy and the Harvester planning, which both measure from home.

export function ownBuildings(view: PlayerView): BuildingView[] {
  return view.buildings.filter((b) => b.owner === view.playerId);
}

export function hqCentre(view: PlayerView): CellPos {
  const own = ownBuildings(view);
  const hq = own.find((b) => b.kind === "hq") ?? own[0];
  if (!hq) return { x: 0, y: 0 };
  return { x: hq.x + Math.floor(hq.width / 2), y: hq.y + Math.floor(hq.height / 2) };
}

/**
 * The Player's Units inside its own Troop Carriers. They are off the Map and
 * so not among the view's Units, but they are alive: whoever counts what the
 * Player has must add them, or Units that Boarded look lost.
 */
export function ownPassengers(view: PlayerView): PassengerView[] {
  return view.units.filter((u) => u.owner === view.playerId).flatMap((u) => u.passengers ?? []);
}

/**
 * How long each own Unit has stood where it is, which the Opponent counts
 * from one think to the next: a Player view does not say what a Unit is doing,
 * so a Unit that has stopped is how a finished or failed Command looks.
 */
export interface Standing {
  /** Thinks in a row the Unit has not moved; 0 for one not seen before. */
  thinks(id: EntityId): number;
  /** Counts from now, for a Unit just given a Command it has not yet begun. */
  restart(id: EntityId): void;
}

/** On the Map, passable, and not under a Building the Player knows of. */
export function isOpenGround(view: PlayerView, c: CellPos): boolean {
  const { width, height, terrain } = view.map;
  if (c.x < 0 || c.y < 0 || c.x >= width || c.y >= height) return false;
  if (!isPassableTerrain(terrain[cellIndexIn(view.map, c.x, c.y)]!)) return false;
  return !view.buildings.some((o) => c.x >= o.x && c.x < o.x + o.width && c.y >= o.y && c.y < o.y + o.height);
}
