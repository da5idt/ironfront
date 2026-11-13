import type { CommandResult } from "./commands";
import { OK, reject } from "./commands";
import type { CommandHandler } from "./handlers";
import { visibilityAt } from "./fog";
import { type PlacementGround, placementProblem } from "./placement";
import type { BuildingState, MatchState, ProductionState } from "./state";
import { addBuilding, cellIndex, isWalkable, spawnUnit } from "./state";
import { BUILDING_STATS } from "./tuning";
import type { BuildingKind, CellPos, PlayerId } from "./types";

// Base building: the HQ builds one Building at a time. Credits are paid up
// front so a Player can never start more than it can afford; a finished
// Building waits for the Player to place it before the HQ starts another.

/** What the HQ can build, in panel order. */
export const HQ_BUILDS: readonly BuildingKind[] = ["refinery", "barracks", "vehicleFactory", "turret"];

/** Production as a Player sees it. */
export interface ProductionView {
  readonly kind: BuildingKind;
  /** 0 when started, 1 when finished. */
  readonly progress: number;
  /** Finished and waiting to be placed. */
  readonly ready: boolean;
}

function hasHq(m: MatchState, player: PlayerId): boolean {
  for (const b of m.buildings.values()) if (b.owner === player && b.kind === "hq") return true;
  return false;
}

function isFinished(p: ProductionState): boolean {
  return p.ticksDone >= BUILDING_STATS[p.kind].buildTicks;
}

export function productionView(m: MatchState, player: PlayerId): ProductionView | null {
  const p = m.players[player].production;
  if (!p) return null;
  const total = BUILDING_STATS[p.kind].buildTicks;
  return { kind: p.kind, progress: total === 0 ? 1 : Math.min(1, p.ticksDone / total), ready: isFinished(p) };
}

/** Per-Tick system: every Player's HQ works one Tick on its Building. */
export function buildProgress(m: MatchState): void {
  for (const player of m.players) {
    const p = player.production;
    if (p && !isFinished(p)) p.ticksDone++;
  }
}

export const handleStartBuilding: CommandHandler<"startBuilding"> = (m, player, command): CommandResult => {
  const state = m.players[player];
  if (!HQ_BUILDS.includes(command.kind)) return reject("the HQ cannot build that");
  if (!hasHq(m, player)) return reject("no HQ");
  if (state.production) {
    return reject(isFinished(state.production) ? "a finished Building waits to be placed" : "already building");
  }
  const cost = BUILDING_STATS[command.kind].cost;
  if (state.credits < cost) return reject("not enough Credits");
  state.credits -= cost;
  state.production = { kind: command.kind, ticksDone: 0 };
  return OK;
};

/** The real Match as the placement rule sees it: unlike a PlayerView, nothing standing in the way is hidden. */
function matchGround(m: MatchState, player: PlayerId): PlacementGround {
  const fog = m.fog[player];
  return {
    width: m.width,
    height: m.height,
    terrain: m.terrain,
    explored: (x, y) => visibilityAt(fog, cellIndex(m, x, y)) !== "unexplored",
    occupied: (x, y) => {
      if (m.buildingAt[cellIndex(m, x, y)] !== 0) return true;
      for (const u of m.units.values()) if (Math.floor(u.x) === x && Math.floor(u.y) === y) return true;
      return false;
    },
    ownBuildings: [...m.buildings.values()].filter((b) => b.owner === player),
  };
}

export const handlePlaceBuilding: CommandHandler<"placeBuilding"> = (m, player, command): CommandResult => {
  const state = m.players[player];
  const p = state.production;
  if (!p) return reject("nothing is being built");
  if (!isFinished(p)) return reject("the Building is not finished");
  const problem = placementProblem(matchGround(m, player), p.kind, command.at);
  if (problem) return reject(problem);
  const building = addBuilding(m, player, p.kind, command.at);
  state.production = null;
  if (building.kind === "refinery") {
    // spawnUnit starts a Harvester harvesting, so the free one earns from its first Tick.
    const cell = freeCellAround(m, building);
    if (cell) spawnUnit(m, player, "harvester", cell);
  }
  return OK;
};

/** How far out from a footprint to look for a free Cell before giving up. */
const MAX_SPAWN_RING = 3;

/** The first walkable Cell with no Unit on it, ring by ring around the footprint; null if crowded out. */
export function freeCellAround(m: MatchState, b: BuildingState): CellPos | null {
  const taken = new Set<number>();
  for (const u of m.units.values()) taken.add(cellIndex(m, Math.floor(u.x), Math.floor(u.y)));
  for (let r = 1; r <= MAX_SPAWN_RING; r++) {
    for (let y = b.y - r; y < b.y + b.height + r; y++) {
      for (let x = b.x - r; x < b.x + b.width + r; x++) {
        const onRing = y === b.y - r || y === b.y + b.height + r - 1 || x === b.x - r || x === b.x + b.width + r - 1;
        if (onRing && isWalkable(m, x, y) && !taken.has(cellIndex(m, x, y))) return { x, y };
      }
    }
  }
  return null;
}

export const handleCancelBuilding: CommandHandler<"cancelBuilding"> = (m, player): CommandResult => {
  const state = m.players[player];
  if (!state.production) return reject("nothing is being built");
  state.credits += BUILDING_STATS[state.production.kind].cost;
  state.production = null;
  return OK;
};
