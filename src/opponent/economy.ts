import {
  BUILDING_STATS,
  type BuildingKind,
  type BuildingView,
  type CellPos,
  type Command,
  OPPONENT,
  type PlayerView,
  TRAINS,
  UNIT_STATS,
  type UnitKind,
} from "../sim";
import { hqCentre, ownBuildings } from "./base";
import { findBuildSite } from "./buildSite";
import { chooseOre, type DangerMemory } from "./harvesting";

// The Computer Opponent's base and economy: what the HQ builds next, where it
// goes, what the Barracks and Vehicle Factory train, and keeping Harvesters busy.

/**
 * The fixed build order, as how many of each kind should stand once that step
 * is done (the starting Refinery counts), so a lost Building is rebuilt before
 * the order moves on.
 */
export const BUILD_ORDER: readonly (readonly [BuildingKind, number])[] = [
  ["barracks", 1],
  ["refinery", 2],
  ["vehicleFactory", 1],
  ["turret", 1],
];

/** Cells from the HQ towards the Map's middle where new Units gather and Turrets go. */
const RALLY_DISTANCE = 7;

function count(buildings: readonly BuildingView[], kind: BuildingKind): number {
  return buildings.filter((b) => b.kind === kind).length;
}

/** The next Building the fixed build order still lacks, or null once it is all standing. */
export function nextInOrder(own: readonly BuildingView[]): BuildingKind | null {
  for (const [kind, total] of BUILD_ORDER) if (count(own, kind) < total) return kind;
  return null;
}

/** What to build after the order: Turrets and Barracks in turn, two Turrets per Barracks. */
function nextExtra(own: readonly BuildingView[]): BuildingKind | null {
  const barracks = count(own, "barracks");
  const turrets = count(own, "turret");
  if (turrets < OPPONENT.mostTurrets && (turrets < barracks * 2 || barracks >= OPPONENT.mostBarracks)) return "turret";
  if (barracks < OPPONENT.mostBarracks) return "barracks";
  return null;
}

function nextBuilding(own: readonly BuildingView[]): BuildingKind | null {
  return nextInOrder(own) ?? nextExtra(own);
}

/**
 * Credits to hold back while the HQ saves for its next Building, so training
 * never starves the base. Once the HQ is busy (already paid) training gets the lot.
 */
function buildReserve(view: PlayerView): number {
  if (view.production) return 0;
  const next = nextBuilding(ownBuildings(view));
  return next ? BUILDING_STATS[next].cost : 0;
}

/** A Cell `distance` from the HQ along the line to the Map's middle: the side attacks come from. */
export function towardsMiddle(view: PlayerView, distance: number): CellPos {
  const from = hqCentre(view);
  const dx = view.map.width / 2 - from.x;
  const dy = view.map.height / 2 - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: Math.round(from.x + (dx / len) * distance),
    y: Math.round(from.y + (dy / len) * distance),
  };
}

export function rallyPoint(view: PlayerView): CellPos {
  return towardsMiddle(view, RALLY_DISTANCE);
}

/** Where a kind of Building should go: Refineries by the Ore, Turrets on the side attacks come from. */
function siteWanted(view: PlayerView, kind: BuildingKind): CellPos {
  const hq = hqCentre(view);
  // The Ore the Harvesters would pick from home, so the new Refinery sits by the field they will work.
  if (kind === "refinery") return chooseOre(view, NO_DANGER, { x: hq.x + 0.5, y: hq.y + 0.5 }) ?? hq;
  if (kind === "turret") return towardsMiddle(view, RALLY_DISTANCE - 2);
  return hq;
}

/** A Refinery stays put, so enemy fighters passing by do not count; only known Turrets keep it from a field. */
const NO_DANGER: DangerMemory = new Map();

/** Thinks in a row a finished Building may find no site before the HQ gives up on it. */
const PLACE_ATTEMPTS = 30;

/** The HQ's next step: place what is finished, or start what comes next. */
export function buildCommands(view: PlayerView, placeFailures: { count: number }): Command[] {
  const production = view.production;
  if (production?.ready) {
    const at = findBuildSite(view, production.kind, siteWanted(view, production.kind));
    if (at) {
      placeFailures.count = 0;
      return [{ type: "placeBuilding", at }];
    }
    placeFailures.count++;
    if (placeFailures.count < PLACE_ATTEMPTS) return [];
    // Credits come back on cancel, so a Building with nowhere to go is not a loss.
    // The next Building starts with a clean count, or it would be cancelled on its first miss.
    placeFailures.count = 0;
    return [{ type: "cancelBuilding" }];
  }
  if (production || !ownBuildings(view).some((b) => b.kind === "hq")) return [];
  const kind = nextBuilding(ownBuildings(view));
  if (!kind) return [];
  // Short of Harvesters, the HQ leaves enough for one: Ore pays for everything else.
  const held = kind === "vehicleFactory" || kind === "refinery" ? 0 : harvesterHoldBack(view);
  return view.credits - held >= BUILDING_STATS[kind].cost ? [{ type: "startBuilding", kind }] : [];
}

function harvestersWanted(view: PlayerView): number {
  return Math.min(OPPONENT.mostHarvesters, count(ownBuildings(view), "refinery") * OPPONENT.harvestersPerRefinery);
}

/**
 * Credits kept back for a Harvester while the Opponent has fewer than it wants
 * and a Vehicle Factory to train one, so army and Turrets never spend the
 * economy into a corner it cannot climb out of.
 */
function harvesterHoldBack(view: PlayerView): number {
  const short = owned(view, "harvester") < harvestersWanted(view);
  return short && count(ownBuildings(view), "vehicleFactory") > 0 ? UNIT_STATS.harvester.cost : 0;
}

/** Units of a kind the Player has, counting those queued. */
function owned(view: PlayerView, kind: UnitKind): number {
  const queued = ownBuildings(view).reduce((n, b) => n + (b.training?.queue.filter((k) => k === kind).length ?? 0), 0);
  return view.units.filter((u) => u.owner === view.playerId && u.kind === kind).length + queued;
}

/**
 * Queues at most one Unit of each kind per think, in order of need: Harvesters
 * up to the target, then whichever of Raiders and Riflemen is short of one
 * Raider to two Riflemen. When the most needed Unit can't be paid for yet the
 * Opponent saves for it rather than spending on the next, so Raiders and
 * Harvesters aren't crowded out by cheap Riflemen.
 */
export function trainCommands(view: PlayerView): Command[] {
  const own = ownBuildings(view);
  const riflemen = owned(view, "rifleman");
  const raiders = owned(view, "raider");
  const wants: UnitKind[] = [];
  if (owned(view, "harvester") < harvestersWanted(view)) wants.push("harvester");
  if (riflemen + raiders < OPPONENT.mostArmy) wants.push(...(raiders * 2 < riflemen ? RAIDER_FIRST : RIFLEMAN_FIRST));
  // A Harvester pays for itself, so it may spend what the build order holds back;
  // everything else leaves a Harvester's worth while Harvesters are short.
  const reserve = buildReserve(view) + harvesterHoldBack(view);
  let spent = 0;
  const commands: Command[] = [];
  for (const kind of wants) {
    const budget = view.credits - spent - (kind === "harvester" ? 0 : reserve);
    const trainer = own.find(
      (b) => b.training && TRAINS[b.kind]?.includes(kind) && b.training.queue.length < OPPONENT.queueDepth,
    );
    if (!trainer) continue;
    if (budget < UNIT_STATS[kind].cost) break;
    commands.push({ type: "train", buildingId: trainer.id, kind });
    spent += UNIT_STATS[kind].cost;
  }
  return commands;
}

const RAIDER_FIRST: readonly UnitKind[] = ["raider", "rifleman"];
const RIFLEMAN_FIRST: readonly UnitKind[] = ["rifleman", "raider"];

/** Sends new Units to gather in front of the base. */
export function rallyCommands(view: PlayerView): Command[] {
  const target = rallyPoint(view);
  return ownBuildings(view)
    .filter((b) => b.training && (b.training.rallyPoint?.x !== target.x || b.training.rallyPoint?.y !== target.y))
    .map((b) => ({ type: "setRallyPoint", buildingId: b.id, target }));
}
