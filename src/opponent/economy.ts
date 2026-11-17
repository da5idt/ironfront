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
import { hqCentre, ownBuildings, ownPassengers } from "./base";
import { findBuildSite } from "./buildSite";
import { chooseOre, type DangerMemory } from "./harvesting";

// The Computer Opponent's base and economy: what the HQ builds next, where it
// goes, what the Barracks, Vehicle Factory and Hospital train, and keeping Harvesters busy.

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

/**
 * What the attack waves can spare for support (the Hospital, Medics, Mechanics
 * and the Troop Carrier), as the Opponent leading the waves tells it.
 */
export interface WaveNeeds {
  /**
   * Whether the first wave has set off. Until then nothing is spent on
   * support, so the first wave finds the base and the army exactly as large as
   * they were before the Opponent kept any.
   */
  readonly firstWaveSent: boolean;
  /** Whether the army at home is already enough for the next wave. */
  readonly nextWaveCovered: boolean;
}

/**
 * The one Hospital, wanted once the build order stands and the first wave has
 * set off, and then before the extras still to come: those go on for most of
 * a Match, and behind them it would come too late to Heal anyone who comes home hurt.
 */
function nextHospital(own: readonly BuildingView[], waves: WaveNeeds): BuildingKind | null {
  return waves.firstWaveSent && count(own, "hospital") === 0 ? "hospital" : null;
}

function nextBuilding(own: readonly BuildingView[], waves: WaveNeeds): BuildingKind | null {
  return nextInOrder(own) ?? nextHospital(own, waves) ?? nextExtra(own);
}

/**
 * Credits to hold back while the HQ saves for its next Building, so training
 * never starves the base. Once the HQ is busy (already paid) training gets the lot.
 */
function buildReserve(view: PlayerView, waves: WaveNeeds): number {
  if (view.production) return 0;
  const next = nextBuilding(ownBuildings(view), waves);
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
export function buildCommands(view: PlayerView, placeFailures: { count: number }, waves: WaveNeeds): Command[] {
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
  const kind = nextBuilding(ownBuildings(view), waves);
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

/** Units of a kind the Player has, counting those queued and those inside its Troop Carriers. */
function owned(view: PlayerView, kind: UnitKind): number {
  const queued = ownBuildings(view).reduce((n, b) => n + (b.training?.queue.filter((k) => k === kind).length ?? 0), 0);
  const onMap = view.units.filter((u) => u.owner === view.playerId && u.kind === kind).length;
  return onMap + ownPassengers(view).filter((p) => p.kind === kind).length + queued;
}

/**
 * The kinds kept that are no fighters (the support Units and the Troop
 * Carrier) and how many of each, in the order they are wanted when equally short.
 */
const NON_FIGHTERS_KEPT: readonly (readonly [UnitKind, number])[] = [
  ["medic", OPPONENT.mostMedics],
  ["mechanic", OPPONENT.mostMechanics],
  ["troopCarrier", OPPONENT.mostTroopCarriers],
];

/**
 * The support Units and the Troop Carrier the Player is short of, the kind
 * with the smallest share of its number first, so one of each comes before a
 * second of any. A kind nothing standing can train is left out, so waiting
 * for the Hospital holds nothing else up.
 */
function nonFightersWanted(view: PlayerView): UnitKind[] {
  const own = ownBuildings(view);
  return NON_FIGHTERS_KEPT.map(([kind, most], place) => ({ kind, share: owned(view, kind) / most, place }))
    .filter(({ kind, share }) => share < 1 && own.some((b) => b.training && TRAINS[b.kind]?.includes(kind)))
    .sort((a, b) => a.share - b.share || a.place - b.place)
    .map(({ kind }) => kind);
}

/**
 * Queues at most one Unit of each kind per think, in order of need: Harvesters
 * up to the target, then whichever of Raiders and Riflemen is short of one
 * Raider to two Riflemen. When the most needed Unit can't be paid for yet the
 * Opponent saves for it rather than spending on the next, so Raiders and
 * Harvesters aren't crowded out by cheap Riflemen.
 *
 * Medics, Mechanics and the Troop Carrier are wanted only once the build order
 * stands and the first wave has set off, so the opening of a Match is what it was
 * without them. From then on, while the army at home covers the next wave,
 * the one most wanted of them goes ahead of the army: behind the army, which
 * is short of its number for most of a Match, they came too late to matter or
 * never. Otherwise, and for the others, they come last, from what the army
 * leaves over.
 */
export function trainCommands(view: PlayerView, waves: WaveNeeds): Command[] {
  const own = ownBuildings(view);
  const riflemen = owned(view, "rifleman");
  const raiders = owned(view, "raider");
  const nonFighters = waves.firstWaveSent && nextInOrder(own) === null ? nonFightersWanted(view) : [];
  const wants: UnitKind[] = [];
  if (owned(view, "harvester") < harvestersWanted(view)) wants.push("harvester");
  if (waves.nextWaveCovered) wants.push(...nonFighters.splice(0, 1));
  if (riflemen + raiders < OPPONENT.mostArmy) wants.push(...(raiders * 2 < riflemen ? RAIDER_FIRST : RIFLEMAN_FIRST));
  wants.push(...nonFighters);
  // A Harvester pays for itself, so it may spend what the build order holds back;
  // everything else leaves a Harvester's worth while Harvesters are short.
  const reserve = buildReserve(view, waves) + harvesterHoldBack(view);
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
