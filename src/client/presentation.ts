import { ECONOMY, type EntityId, type PlayerId, type PlayerView, type ShotView, type UnitKind, type UnitView } from "../sim";
import { FACINGS, TURRET_REST_FACING } from "./art/buildingArt";
import { HARVESTER_LOADS, STEP_CELLS, STEP_PHASES, unitFrame } from "./art/unitArt";

// The presentation module (ADR 0003): what the client shows that the
// Simulation knows nothing about, such as which way a Unit faces and where a
// Turret aims. Pure: it takes the last presentation and the new Player view
// and gives the next presentation plus what just happened, for sounds and
// effects. It reads only the Player view, so Fog of War holds for free, and
// it never changes the Match (ADR 0002).

/** Steps of the 16 facings a Unit turns in one Tick: half a turn takes a fifth of a second. */
export const UNIT_TURN_PER_TICK = 2;
/** A Turret's gun is heavier: half a turn takes two fifths of a second. */
export const TURRET_TURN_PER_TICK = 1;

/** A place on the Map in Cell units, like a Unit's position. */
export interface MapPoint {
  readonly x: number;
  readonly y: number;
}

/** How one Unit in the view is shown. Kind, owner and place are kept so a later view can tell what vanished, and where. */
export interface UnitLook {
  readonly kind: UnitKind;
  readonly owner: PlayerId;
  readonly x: number;
  readonly y: number;
  /** Which of the FACINGS it shows: 0 east, then clockwise on screen. */
  readonly facing: number;
  /** The facing it is turning to. */
  readonly wanted: number;
  readonly moving: boolean;
  /** Cells covered since it last stood still; drives walk steps and turning wheels. */
  readonly walked: number;
  /** A Harvester's load, from 0 (empty) to HARVESTER_LOADS - 1 (full); 0 for other Units. */
  readonly load: number;
  /** Which frame of the Unit's sprite shows: a Rifleman's step, a vehicle's wheels, a Harvester's load. */
  readonly frame: number;
}

/** Where a Turret's gun points. Only Turrets that have fired are noted; the rest sit at TURRET_REST_FACING. */
export interface TurretLook {
  readonly facing: number;
  readonly wanted: number;
}

export interface Presentation {
  readonly playerId: PlayerId;
  readonly tick: number;
  /** Every Unit in the last view. */
  readonly units: ReadonlyMap<EntityId, UnitLook>;
  readonly turrets: ReadonlyMap<EntityId, TurretLook>;
}

/**
 * What happened in the Tick just shown, for sounds, alerts and effects. The
 * shapes match the sound effects' events (sfx/eventSounds.ts), so they can be
 * played as they are; extra fields are for the effects.
 */
export type PresentationEvent =
  | {
      readonly kind: "shotFired";
      readonly weapon: Weapon;
      /** The Unit or Turret that fired, or null when it is no longer in the view (it died in the same Tick). */
      readonly shooter: EntityId | null;
      readonly from: MapPoint;
      readonly to: MapPoint;
    }
  /** A shot from out of sight landing where the Player can see. */
  | { readonly kind: "impact"; readonly at: MapPoint };

export type Weapon = "rifle" | "raiderGun" | "turretCannon";

const UNIT_WEAPON: Readonly<Record<UnitKind, Weapon | null>> = { rifleman: "rifle", raider: "raiderGun", harvester: null };

export interface Presented {
  readonly state: Presentation;
  readonly events: readonly PresentationEvent[];
}

/** Which of the FACINGS points along dx, dy (y grows down the screen). */
export function facingToward(dx: number, dy: number): number {
  const steps = Math.round((Math.atan2(dy, dx) / (Math.PI * 2)) * FACINGS);
  return ((steps % FACINGS) + FACINGS) % FACINGS;
}

/** Which of the FACINGS a Turret's gun shows. */
export function turretFacing(state: Presentation | null, id: EntityId): number {
  return state?.turrets.get(id)?.facing ?? TURRET_REST_FACING;
}

/** `facing` turned toward `wanted` the short way round, by at most `steps`. */
function turned(facing: number, wanted: number, steps: number): number {
  const half = FACINGS / 2;
  // The difference in -8..7, so the turn goes the short way.
  const diff = ((wanted - facing + FACINGS + half) % FACINGS) - half;
  const step = Math.max(-steps, Math.min(steps, diff));
  return (facing + step + FACINGS) % FACINGS;
}

/** A Unit seen for the first time faces a way of its own, so a group does not stand in formation. */
function firstFacing(id: EntityId): number {
  return (id * 5) % FACINGS;
}

/** How full a Harvester shows: empty only when it carries nothing, full only when it can carry no more. */
function loadOf(u: UnitView): number {
  if (u.cargo <= 0) return 0;
  if (u.cargo >= ECONOMY.harvesterCapacity) return HARVESTER_LOADS - 1;
  return Math.min(HARVESTER_LOADS - 2, 1 + Math.floor((u.cargo / ECONOMY.harvesterCapacity) * (HARVESTER_LOADS - 2)));
}

/** `aim` is where its shot of this Tick went, if it fired. */
function unitLook(prev: UnitLook | undefined, u: UnitView, aim: MapPoint | undefined): UnitLook {
  const dx = u.x - u.prevX;
  const dy = u.y - u.prevY;
  const step = Math.hypot(dx, dy);
  const moving = step > 1e-6;
  const was = prev?.facing ?? firstFacing(u.id);
  let facing: number;
  let wanted: number;
  if (aim) {
    // A shot leaves along the barrel, so the Unit is already round when it shows.
    wanted = facingToward(aim.x - u.x, aim.y - u.y);
    facing = wanted;
  } else {
    wanted = moving ? facingToward(dx, dy) : (prev?.wanted ?? was);
    facing = prev ? turned(was, wanted, UNIT_TURN_PER_TICK) : wanted;
  }
  const walked = moving ? (prev?.walked ?? 0) + step : 0;
  const load = loadOf(u);
  const phase = moving ? Math.floor(walked / STEP_CELLS) % STEP_PHASES : null;
  return { kind: u.kind, owner: u.owner, x: u.x, y: u.y, facing, wanted, moving, walked, load, frame: unitFrame(u.kind, phase, load) };
}

const samePlace = (ax: number, ay: number, bx: number, by: number) => Math.abs(ax - bx) < 1e-6 && Math.abs(ay - by) < 1e-6;

/**
 * The next presentation, given the last one (null at the start) and the new
 * Player view. Call it once for every Tick's view; the Tick is the view's.
 */
export function present(prev: Presentation | null, view: PlayerView): Presented {
  // A new Match (Ticks start again) or another Player's view: nothing carries over.
  const last = prev !== null && prev.playerId === view.playerId && view.tick >= prev.tick ? prev : null;
  // The same Tick again (the view was only refreshed after a Command): nothing has moved on.
  if (last && last.tick === view.tick) return { state: last, events: [] };

  const events: PresentationEvent[] = [];
  const unitAims = new Map<EntityId, MapPoint>();
  const turretAims = new Map<EntityId, MapPoint>();
  for (const s of view.shots) {
    const from = { x: s.fromX, y: s.fromY };
    const to = { x: s.toX, y: s.toY };
    // The view folds a shot from out of sight onto its landing point.
    if (samePlace(from.x, from.y, to.x, to.y)) {
      events.push({ kind: "impact", at: to });
      continue;
    }
    const shooter = shooterOf(view, last, s);
    if (shooter.unit !== null) unitAims.set(shooter.unit, to);
    if (shooter.turret !== null) turretAims.set(shooter.turret, to);
    events.push({ kind: "shotFired", weapon: shooter.weapon, shooter: shooter.unit ?? shooter.turret, from, to });
  }

  const units = new Map<EntityId, UnitLook>();
  for (const u of view.units) units.set(u.id, unitLook(last?.units.get(u.id), u, unitAims.get(u.id)));

  const turrets = new Map<EntityId, TurretLook>();
  for (const b of view.buildings) {
    if (b.kind !== "turret") continue;
    const before = last?.turrets.get(b.id);
    const aim = turretAims.get(b.id);
    if (!before && !aim) continue;
    const wanted = aim ? facingToward(aim.x - (b.x + b.width / 2), aim.y - (b.y + b.height / 2)) : before!.wanted;
    turrets.set(b.id, { facing: turned(before?.facing ?? TURRET_REST_FACING, wanted, TURRET_TURN_PER_TICK), wanted });
  }

  return { state: { playerId: view.playerId, tick: view.tick, units, turrets }, events };
}

/**
 * Who fired a shot: the Simulation's shots do not say, but a shot starts
 * where its shooter stood, so the place names it.
 */
function shooterOf(
  view: PlayerView,
  last: Presentation | null,
  s: ShotView,
): { unit: EntityId | null; turret: EntityId | null; weapon: Weapon } {
  for (const b of view.buildings) {
    if (b.kind === "turret" && !b.remembered && samePlace(b.x + b.width / 2, b.y + b.height / 2, s.fromX, s.fromY)) {
      return { unit: null, turret: b.id, weapon: "turretCannon" };
    }
  }
  for (const u of view.units) {
    const weapon = UNIT_WEAPON[u.kind];
    // A Unit may fire and then walk on in the same Tick, so where it was counts too.
    if (weapon && (samePlace(u.x, u.y, s.fromX, s.fromY) || samePlace(u.prevX, u.prevY, s.fromX, s.fromY))) {
      return { unit: u.id, turret: null, weapon };
    }
  }
  // Gone from the view: it fired and died in the same Tick. The last presentation still knows what stood there.
  for (const u of last?.units.values() ?? []) {
    const weapon = UNIT_WEAPON[u.kind];
    if (weapon && samePlace(u.x, u.y, s.fromX, s.fromY)) return { unit: null, turret: null, weapon };
  }
  // Only a Turret is left: Buildings do not move, and a destroyed one is out of the view.
  return { unit: null, turret: null, weapon: "turretCannon" };
}
