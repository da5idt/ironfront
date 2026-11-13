import {
  BUILDING_STATS,
  type BuildingKind,
  type BuildingView,
  type CellPos,
  type Command,
  type PlayerView,
  TRAINS,
  UNIT_STATS,
  type UnitKind,
  type UnitView,
} from "../sim";
import { findBuildSite } from "./buildSite";

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

/** After the build order: how many of each the Opponent adds while Credits allow. */
const MOST_BARRACKS = 3;
const MOST_TURRETS = 6;

/** Harvesters wanted per Refinery, and in all. */
const HARVESTERS_PER_REFINERY = 2;
const MOST_HARVESTERS = 5;

/** Army size (Riflemen and Raiders) the Opponent stops training at. */
const MOST_ARMY = 40;

/** Units each training Building keeps queued; a short queue keeps Credits free for the build order. */
const QUEUE_DEPTH = 2;

/** Cells from the HQ towards the Map's middle where new Units gather and Turrets go. */
const RALLY_DISTANCE = 7;

export function ownBuildings(view: PlayerView): BuildingView[] {
  return view.buildings.filter((b) => b.owner === view.playerId);
}

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
  if (turrets < MOST_TURRETS && (turrets < barracks * 2 || barracks >= MOST_BARRACKS)) return "turret";
  if (barracks < MOST_BARRACKS) return "barracks";
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

export function hqCentre(view: PlayerView): CellPos {
  const own = ownBuildings(view);
  const hq = own.find((b) => b.kind === "hq") ?? own[0];
  if (!hq) return { x: 0, y: 0 };
  return { x: hq.x + Math.floor(hq.width / 2), y: hq.y + Math.floor(hq.height / 2) };
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

/** The known Ore Cell nearest `from`, or null when the Opponent knows of none. */
export function nearestOre(view: PlayerView, from: { x: number; y: number }): CellPos | null {
  const { width, height, ore } = view.map;
  let best: CellPos | null = null;
  let bestD = Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (ore[y * width + x]! <= 0) continue;
      const d = (x + 0.5 - from.x) ** 2 + (y + 0.5 - from.y) ** 2;
      if (d < bestD) {
        best = { x, y };
        bestD = d;
      }
    }
  }
  return best;
}

/** Where a kind of Building should go: Refineries by the Ore, Turrets on the side attacks come from. */
function siteWanted(view: PlayerView, kind: BuildingKind): CellPos {
  const hq = hqCentre(view);
  if (kind === "refinery") return nearestOre(view, { x: hq.x + 0.5, y: hq.y + 0.5 }) ?? hq;
  if (kind === "turret") return towardsMiddle(view, RALLY_DISTANCE - 2);
  return hq;
}

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
    // Credits come back on cancel, so a Building with nowhere to go is not a loss.
    return placeFailures.count >= PLACE_ATTEMPTS ? [{ type: "cancelBuilding" }] : [];
  }
  if (production || !ownBuildings(view).some((b) => b.kind === "hq")) return [];
  const kind = nextBuilding(ownBuildings(view));
  return kind && view.credits >= BUILDING_STATS[kind].cost ? [{ type: "startBuilding", kind }] : [];
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
  const harvestersWanted = Math.min(MOST_HARVESTERS, count(own, "refinery") * HARVESTERS_PER_REFINERY);
  if (owned(view, "harvester") < harvestersWanted) wants.push("harvester");
  if (riflemen + raiders < MOST_ARMY) wants.push(...(raiders * 2 < riflemen ? RAIDER_FIRST : RIFLEMAN_FIRST));
  // A Harvester pays for itself, so it may spend what the build order holds back.
  const reserve = buildReserve(view);
  let spent = 0;
  const commands: Command[] = [];
  for (const kind of wants) {
    const budget = view.credits - spent - (kind === "harvester" ? 0 : reserve);
    const trainer = own.find(
      (b) => b.training && TRAINS[b.kind]?.includes(kind) && b.training.queue.length < QUEUE_DEPTH,
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

/** Thinks a Harvester may stand still with the same load before it counts as idle. */
const IDLE_THINKS = 6;

/** Sends Harvesters that stopped working back to the nearest Ore the Opponent knows of. */
export function harvestCommands(view: PlayerView, stillFor: (u: UnitView) => number): Command[] {
  const commands: Command[] = [];
  for (const u of view.units) {
    if (u.owner !== view.playerId || u.kind !== "harvester" || stillFor(u) < IDLE_THINKS) continue;
    const ore = nearestOre(view, u);
    if (ore) commands.push({ type: "harvest", unitIds: [u.id], target: ore });
  }
  return commands;
}
