import type { BuildingKind, TendTargetClass, UnitClass, UnitKind } from "./types";

// Every balance number lives here so a tweak is a one-line change.
// Times are in Ticks (20 per second); distances in Cells.

export const TICKS_PER_SECOND = 20;

/** What a weapon does; Units and Turrets share the shape so one firing rule serves both. */
export interface WeaponStats {
  readonly damage: number;
  readonly range: number;
  readonly reloadTicks: number;
}

/**
 * Whether these numbers make a weapon at all. An unarmed Unit or Building has
 * no damage, and every rule that asks "can it shoot?" asks here, so a new
 * unarmed kind needs no list of kinds anywhere.
 */
export function isArmed(weapon: WeaponStats): boolean {
  return weapon.damage > 0;
}

export interface UnitStats extends WeaponStats {
  readonly name: string;
  readonly class: UnitClass;
  readonly cost: number;
  readonly trainTicks: number;
  readonly maxHp: number;
  /** Cells per second on open ground. */
  readonly speed: number;
  readonly sight: number;
}

export interface BuildingStats extends WeaponStats {
  readonly name: string;
  readonly cost: number;
  readonly buildTicks: number;
  readonly maxHp: number;
  /** Footprint in Cells. */
  readonly width: number;
  readonly height: number;
  readonly sight: number;
}

export const UNIT_STATS: Readonly<Record<UnitKind, UnitStats>> = {
  rifleman: {
    name: "Rifleman",
    class: "infantry",
    cost: 100,
    trainTicks: 5 * TICKS_PER_SECOND,
    maxHp: 50,
    speed: 1.5,
    damage: 6,
    range: 3.5,
    reloadTicks: 15,
    sight: 5,
  },
  medic: {
    name: "Medic",
    class: "infantry",
    cost: 200,
    trainTicks: 6 * TICKS_PER_SECOND,
    maxHp: 40,
    speed: 1.5,
    damage: 0,
    range: 0,
    reloadTicks: 0,
    sight: 5,
  },
  mechanic: {
    name: "Mechanic",
    class: "infantry",
    cost: 300,
    trainTicks: 7 * TICKS_PER_SECOND,
    maxHp: 50,
    speed: 1.5,
    damage: 0,
    range: 0,
    reloadTicks: 0,
    sight: 5,
  },
  raider: {
    name: "Raider",
    class: "vehicle",
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
    class: "vehicle",
    cost: 700,
    trainTicks: 12 * TICKS_PER_SECOND,
    maxHp: 300,
    speed: 2,
    damage: 0,
    range: 0,
    reloadTicks: 0,
    sight: 3,
  },
  troopCarrier: {
    name: "Troop Carrier",
    class: "vehicle",
    cost: 600,
    trainTicks: 10 * TICKS_PER_SECOND,
    maxHp: 220,
    speed: 3.5,
    // A light gun: it is there to answer Infantry, and is no match for a Raider.
    damage: 5,
    range: 4,
    reloadTicks: 12,
    sight: 6,
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
  hospital: {
    name: "Hospital",
    cost: 800,
    buildTicks: 15 * TICKS_PER_SECOND,
    maxHp: 700,
    width: 2,
    height: 2,
    sight: 4,
    damage: 0,
    range: 0,
    reloadTicks: 0,
  },
};

/** Health a second a Unit restores in what it Tends, by what the target is; 0 where it cannot help. */
export type TendRates = Readonly<Record<TendTargetClass, number>>;

/** The Unit kinds that can Tend. A kind not listed here helps nothing. */
export const TEND_RATES: Readonly<Partial<Record<UnitKind, TendRates>>> = {
  medic: { infantry: 8, vehicle: 0, building: 0 },
  mechanic: { infantry: 0, vehicle: 10, building: 15 },
};

/**
 * Health a second a Unit of that kind restores in a target of that class; 0
 * when it cannot help it. Every rule that asks "can it help?" asks here, so a
 * new support kind is a new line of numbers above.
 */
export function tendRate(kind: UnitKind, target: TendTargetClass): number {
  return TEND_RATES[kind]?.[target] ?? 0;
}

export const TEND = {
  /** The seek radius: how far an idle support Unit looks for something of its own Player's to help. */
  seekRadius: 6,
  /** The leash: how far a target may move from the line between where it and the Unit were when the Tend began before the Unit gives up on it. */
  leash: 8,
  /** How often an idle support Unit looks: slow enough to be cheap, quick enough to feel willing. */
  seekTicks: Math.ceil(TICKS_PER_SECOND / 2),
  /** The Tend back-off: how long an idle support Unit leaves alone a target it found no way to, before it looks at it again. */
  backOffTicks: 5 * TICKS_PER_SECOND,
  /**
   * Most Cells beside a target a Unit plans a route to before it settles for
   * getting as near as it can. Every Cell round a 3 by 3 Building, the largest
   * there is, so a target with one Cell beside it that can be walked to is
   * reached. Each try that fails costs a search of the ground the Unit can
   * walk, which is why there is a limit at all.
   */
  standTries: 16,
} as const;

export const TROOP_CARRIER = {
  /** Most Passengers a Troop Carrier holds. */
  capacity: 5,
  /** How far, in Cells, a Troop Carrier reaches for idle Infantry of its own Player when it is Collecting. */
  collectRadius: 2,
  /**
   * Most steps on foot, Cell to Cell, between a Unit it takes when Collecting and a Cell touching its own.
   * One more than open ground ever asks within the radius, so a corner in the way is walked round and a river is not.
   */
  collectWalk: 3,
} as const;

/**
 * How many Passengers a Unit of that kind has room for; 0 for a kind that
 * carries nobody. Every rule that asks "can it carry?" asks here.
 */
export function passengerRoom(kind: UnitKind): number {
  return kind === "troopCarrier" ? TROOP_CARRIER.capacity : 0;
}

/** True for a Unit kind that carries Passengers. */
export function isTroopCarrier(kind: UnitKind): boolean {
  return passengerRoom(kind) > 0;
}

/** True for a Unit kind of the Infantry class. */
export function isInfantry(kind: UnitKind): boolean {
  return UNIT_STATS[kind].class === "infantry";
}

export const PLACEMENT = {
  /** Most empty Cells allowed between a new Building and the nearest own Building. */
  maxGap: 3,
} as const;

export const MOVEMENT = {
  /** How many of the nearest free Cells a Unit on an Attack-move looks through for a spot of its own in range, when it stopped on top of another. */
  spotSearchCells: 24,
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

/** How hard the Computer Opponent plays. */
export const OPPONENT = {
  /** Units in the first attack wave; each wave after asks for waveGrowth more, up to waveCap. */
  firstWave: 6,
  waveGrowth: 3,
  waveCap: 24,
  /** No wave before this Tick, so the person has time to build before the first attack (4.5 minutes). */
  firstWaveTick: 270 * TICKS_PER_SECOND,
  /** Least time from one wave setting off to the next. */
  waveIntervalTicks: 90 * TICKS_PER_SECOND,
  /** After the build order: most Barracks and Turrets the Opponent adds while Credits allow. */
  mostBarracks: 3,
  mostTurrets: 6,
  /** Harvesters wanted per Refinery, and in all. */
  harvestersPerRefinery: 2,
  mostHarvesters: 5,
  /** Army size (Riflemen and Raiders) the Opponent stops training at. */
  mostArmy: 40,
  /** Medics kept at the rally point; a loss is trained again. */
  mostMedics: 2,
  /** Mechanics kept for the base; a loss is trained again. */
  mostMechanics: 2,
  /** Troop Carriers kept for the attack waves: one, as a wave takes one at most. */
  mostTroopCarriers: 1,
  /** Longest a wave waits at home for its Riflemen to Board; then it leaves with whoever is aboard. */
  boardTicks: 12 * TICKS_PER_SECOND,
  /** Units each training Building keeps queued; a short queue keeps Credits free for the build order. */
  queueDepth: 2,
  /** Ore within this many Cells of an enemy fighter seen lately is unsafe for Harvesters. */
  dangerRadius: 8,
  /** How long a sighting of an enemy fighter keeps ground unsafe. */
  dangerTicks: 60 * TICKS_PER_SECOND,
  /** Once the enemy base is found, the scout explores everything this many Cells from the HQ, looking for Ore. */
  homeExploreRadius: 28,
  /** How long a Mechanic that found no way to a damaged Building is kept off it before it is sent there again. */
  tendRetryTicks: 60 * TICKS_PER_SECOND,
} as const;

export const TRAINING = {
  /** Most Units one Building can have queued, the one in training included. */
  queueSize: 5,
} as const;
