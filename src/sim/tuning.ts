import type { BuildingKind, UnitKind } from "./types";

// Every balance number lives here so a tweak is a one-line change.
// Times are in Ticks (20 per second); distances in Cells.

export const TICKS_PER_SECOND = 20;

export interface UnitStats {
  readonly name: string;
  readonly cost: number;
  readonly trainTicks: number;
  readonly maxHp: number;
  /** Cells per second on open ground. */
  readonly speed: number;
  readonly damage: number;
  readonly range: number;
  readonly reloadTicks: number;
  readonly sight: number;
}

export interface BuildingStats {
  readonly name: string;
  readonly cost: number;
  readonly buildTicks: number;
  readonly maxHp: number;
  /** Footprint in Cells. */
  readonly width: number;
  readonly height: number;
  readonly sight: number;
  readonly damage: number;
  readonly range: number;
  readonly reloadTicks: number;
}

export const UNIT_STATS: Readonly<Record<UnitKind, UnitStats>> = {
  rifleman: {
    name: "Rifleman",
    cost: 100,
    trainTicks: 5 * TICKS_PER_SECOND,
    maxHp: 50,
    speed: 1.5,
    damage: 6,
    range: 3.5,
    reloadTicks: 15,
    sight: 5,
  },
  raider: {
    name: "Raider",
    cost: 300,
    trainTicks: 8 * TICKS_PER_SECOND,
    maxHp: 120,
    speed: 4,
    damage: 10,
    range: 4,
    reloadTicks: 12,
    sight: 6,
  },
  harvester: {
    name: "Harvester",
    cost: 700,
    trainTicks: 12 * TICKS_PER_SECOND,
    maxHp: 300,
    speed: 2,
    damage: 0,
    range: 0,
    reloadTicks: 0,
    sight: 3,
  },
};

export const BUILDING_STATS: Readonly<Record<BuildingKind, BuildingStats>> = {
  hq: {
    name: "HQ",
    cost: 3000,
    buildTicks: 0,
    maxHp: 1500,
    width: 3,
    height: 3,
    sight: 6,
    damage: 0,
    range: 0,
    reloadTicks: 0,
  },
  refinery: {
    name: "Refinery",
    cost: 1200,
    buildTicks: 20 * TICKS_PER_SECOND,
    maxHp: 900,
    width: 3,
    height: 2,
    sight: 4,
    damage: 0,
    range: 0,
    reloadTicks: 0,
  },
  barracks: {
    name: "Barracks",
    cost: 400,
    buildTicks: 10 * TICKS_PER_SECOND,
    maxHp: 600,
    width: 2,
    height: 2,
    sight: 4,
    damage: 0,
    range: 0,
    reloadTicks: 0,
  },
  vehicleFactory: {
    name: "Vehicle Factory",
    cost: 1500,
    buildTicks: 25 * TICKS_PER_SECOND,
    maxHp: 1000,
    width: 3,
    height: 3,
    sight: 4,
    damage: 0,
    range: 0,
    reloadTicks: 0,
  },
  turret: {
    name: "Turret",
    cost: 500,
    buildTicks: 12 * TICKS_PER_SECOND,
    maxHp: 400,
    width: 1,
    height: 1,
    sight: 6,
    damage: 15,
    range: 5.5,
    reloadTicks: 20,
  },
};

export const PLACEMENT = {
  /** Most empty Cells allowed between a new Building and the nearest own Building. */
  maxGap: 3,
} as const;

export const MOVEMENT = {
  /** Speed on rough ground as a share of speed on open ground. */
  roughSpeedMultiplier: 0.5,
} as const;

export const ECONOMY = {
  startingCredits: 2500,
  /** Ore in each Ore Cell when the Match starts. */
  orePerCell: 500,
  /** Ore a Harvester carries when full. */
  harvesterCapacity: 200,
  /** Ore a Harvester digs out of its Cell each Tick. */
  harvestPerTick: 2,
  /** Ticks a Harvester spends at the Refinery emptying a load. */
  unloadTicks: 2 * TICKS_PER_SECOND,
  /** Credits paid for each unit of Ore unloaded. */
  creditsPerOre: 1,
  /** How long a Harvester with nothing to do waits before looking for Ore or a Refinery again. */
  harvestRetryTicks: TICKS_PER_SECOND,
} as const;

export const TRAINING = {
  /** Most Units one Building can have queued, the one in training included. */
  queueSize: 5,
} as const;
