import type { PlayerFog } from "./fog";
import type { HarvestOrder } from "./harvest";
import type { MovePlan } from "./movement";
import type { Rng } from "./rng";
import { startHarvesting } from "./harvest";
import { BUILDING_STATS, UNIT_STATS } from "./tuning";
import type { BuildingKind, CellPos, EntityId, PlayerId, Terrain, UnitKind } from "./types";
import { isPassableTerrain } from "./types";

// Internal state of a Match. Only code inside src/sim may touch it; everything
// outside reads a PlayerView (view.ts). Tests use the public seam in index.ts.

/** What a Unit is currently doing. Later features add their own variants. */
export type UnitOrder =
  | { readonly type: "idle" }
  | { readonly type: "move"; readonly plan: MovePlan }
  | { readonly type: "attack"; readonly targetId: EntityId; chase: MovePlan | null }
  | HarvestOrder;

/** A shot fired during a Tick, kept so drawing can show a tracer. Positions in Cell units. */
export interface Shot {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly tick: number;
}

export interface UnitState {
  readonly id: EntityId;
  readonly kind: UnitKind;
  readonly owner: PlayerId;
  /** Position in Cell units (Cell centre = whole + 0.5). */
  x: number;
  y: number;
  /** Position at the start of the current Tick, for smooth drawing. */
  prevX: number;
  prevY: number;
  hp: number;
  /** Ticks until the Unit's weapon can fire again. */
  cooldown: number;
  order: UnitOrder;
  /** Ore carried; only Harvesters ever hold any. */
  cargo: number;
}

export interface BuildingState {
  readonly id: EntityId;
  readonly kind: BuildingKind;
  readonly owner: PlayerId;
  /** Top-left Cell of the footprint. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  hp: number;
  /** Ticks until the Building's weapon can fire again; only Turrets have one. */
  cooldown: number;
  /** Units waiting to be trained, oldest first; only the first one progresses. Empty for Buildings that don't train. */
  readonly queue: UnitKind[];
  /** Ticks spent on the first Unit in the queue. */
  trainTicksDone: number;
  /** Where newly trained Units head, or null to stay by the Building. */
  rallyPoint: CellPos | null;
}

/** The Building the HQ is working on. It is finished once `ticksDone` reaches its build time. */
export interface ProductionState {
  readonly kind: BuildingKind;
  ticksDone: number;
}

export interface PlayerState {
  readonly id: PlayerId;
  credits: number;
  /** One Building at a time, from start until it is placed or cancelled. */
  production: ProductionState | null;
}

export type MatchStatus =
  | { readonly state: "running" }
  | { readonly state: "victory"; readonly winner: PlayerId };

export interface MatchState {
  tick: number;
  readonly rng: Rng;
  readonly width: number;
  readonly height: number;
  /** Indexed by cellIndex(). */
  readonly terrain: readonly Terrain[];
  /** Ore left in each Cell. */
  readonly ore: number[];
  /** Id of the Building covering each Cell, or 0. */
  readonly buildingAt: number[];
  readonly players: readonly [PlayerState, PlayerState];
  /** Insertion-ordered, so iteration is deterministic. */
  readonly units: Map<EntityId, UnitState>;
  readonly buildings: Map<EntityId, BuildingState>;
  /** Fog of War per Player, indexed by PlayerId. */
  readonly fog: readonly [PlayerFog, PlayerFog];
  nextId: EntityId;
  status: MatchStatus;
  /** Shots fired during the last Tick; replaced every Tick. */
  shots: Shot[];
}

export function cellIndex(m: MatchState, x: number, y: number): number {
  return y * m.width + x;
}

export function inBounds(m: MatchState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < m.width && y < m.height;
}

export function terrainAt(m: MatchState, x: number, y: number): Terrain | undefined {
  return inBounds(m, x, y) ? m.terrain[cellIndex(m, x, y)] : undefined;
}

/** True when a Unit may stand in the Cell: on the Map, passable terrain, no Building. */
export function isWalkable(m: MatchState, x: number, y: number): boolean {
  if (!inBounds(m, x, y)) return false;
  const i = cellIndex(m, x, y);
  return isPassableTerrain(m.terrain[i]!) && m.buildingAt[i] === 0;
}

export function spawnUnit(m: MatchState, owner: PlayerId, kind: UnitKind, cell: CellPos): UnitState {
  const x = cell.x + 0.5;
  const y = cell.y + 0.5;
  const unit: UnitState = {
    id: m.nextId++,
    kind,
    owner,
    x,
    y,
    prevX: x,
    prevY: y,
    hp: UNIT_STATS[kind].maxHp,
    cooldown: 0,
    // Harvesters go to work as soon as they exist, so nobody has to tell them.
    order: kind === "harvester" ? startHarvesting() : { type: "idle" },
    cargo: 0,
  };
  m.units.set(unit.id, unit);
  return unit;
}

/** Adds a Building with its footprint. Callers check placement rules first. */
export function addBuilding(m: MatchState, owner: PlayerId, kind: BuildingKind, at: CellPos): BuildingState {
  const stats = BUILDING_STATS[kind];
  const building: BuildingState = {
    id: m.nextId++,
    kind,
    owner,
    x: at.x,
    y: at.y,
    width: stats.width,
    height: stats.height,
    hp: stats.maxHp,
    cooldown: 0,
    queue: [],
    trainTicksDone: 0,
    rallyPoint: null,
  };
  for (let dy = 0; dy < building.height; dy++) {
    for (let dx = 0; dx < building.width; dx++) {
      m.buildingAt[cellIndex(m, at.x + dx, at.y + dy)] = building.id;
    }
  }
  m.buildings.set(building.id, building);
  return building;
}

export function removeBuilding(m: MatchState, building: BuildingState): void {
  for (let dy = 0; dy < building.height; dy++) {
    for (let dx = 0; dx < building.width; dx++) {
      const i = cellIndex(m, building.x + dx, building.y + dy);
      if (m.buildingAt[i] === building.id) m.buildingAt[i] = 0;
    }
  }
  m.buildings.delete(building.id);
}

/** The Player's own Units among the given ids. Unknown and enemy ids are dropped. */
export function ownUnits(m: MatchState, player: PlayerId, ids: readonly EntityId[]): UnitState[] {
  const out: UnitState[] = [];
  for (const id of ids) {
    const u = m.units.get(id);
    if (u && u.owner === player) out.push(u);
  }
  return out;
}
