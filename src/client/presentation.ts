import {
  type BuildingKind,
  type BuildingView,
  cellIndexIn,
  ECONOMY,
  type EntityId,
  type PlayerId,
  type PlayerView,
  type ShotView,
  TICKS_PER_SECOND,
  UNIT_STATS,
  type UnitKind,
  type UnitView,
  type Visibility,
} from "../sim";
import { type BuildUps, buildUpProgress, noteBuildings } from "./art/buildUp";
import { FACINGS, TURRET_REST_FACING } from "./art/buildingArt";
import {
  AFTER_BLAST_GAP_SECONDS,
  EFFECT_SECONDS,
  type EffectKind,
  MARK_SECONDS,
  type MarkKind,
  MAX_EFFECTS,
  MAX_MARKS,
  MOST_AFTER_BLASTS,
  type Weapon,
} from "./art/effectArt";
import { hash2 } from "./art/hash";
import { HARVESTER_LOADS, STEP_CELLS, STEP_PHASES, unitFrame } from "./art/unitArt";

// The presentation module (ADR 0003): what the client shows that the
// Simulation knows nothing about, such as which way a Unit faces and where a
// Turret aims, the flashes and blasts of a fight and the wrecks it leaves.
// Pure: it takes the last presentation and the new Player view
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

/** How one Unit in the view is shown. Kind, owner, place and health are kept so a later view can tell what vanished or was hit, and where. */
export interface UnitLook {
  readonly kind: UnitKind;
  readonly owner: PlayerId;
  readonly x: number;
  readonly y: number;
  readonly hp: number;
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

/**
 * Something short-lived drawn over the Map: a muzzle flash, a tracer, an
 * impact, an explosion or a Rifleman falling. It shows from Tick `start`
 * (which may be a few Ticks ahead, for blasts that follow one another) until
 * Tick `end`; its lifetime in seconds is in EFFECT_SECONDS.
 */
export interface Effect {
  readonly kind: EffectKind;
  /** Where it is: the shooter for a muzzle flash and a tracer's start, else the middle of the effect. */
  readonly at: MapPoint;
  /** Where a tracer ends; the same as `at` for everything else. */
  readonly to: MapPoint;
  /** The gun, for a muzzle flash, tracer or impact; null otherwise, and for an impact from out of sight. */
  readonly weapon: Weapon | null;
  /** Which of the FACINGS a shot left along, or the Unit faced as it fell. */
  readonly facing: number;
  /** Whose Rifleman is falling; unused by the other kinds. */
  readonly team: PlayerId;
  readonly start: number;
  readonly end: number;
}

/** What a death leaves on the ground for a while: a vehicle's wreck, a fallen Rifleman, a Building's rubble. */
export interface Mark {
  readonly kind: MarkKind;
  /** Its middle. */
  readonly at: MapPoint;
  /** Which Unit it was; null for rubble. */
  readonly unit: UnitKind | null;
  readonly team: PlayerId;
  /** The way the Unit faced when it died. */
  readonly facing: number;
  /** The Building's footprint in Cells; 0 for a Unit's mark. */
  readonly width: number;
  readonly height: number;
  readonly start: number;
  /** The Tick it is gone by; it fades out over the last MARK_FADE_SECONDS before. */
  readonly end: number;
}

export interface Presentation {
  readonly playerId: PlayerId;
  readonly tick: number;
  /** Every Unit in the last view. */
  readonly units: ReadonlyMap<EntityId, UnitLook>;
  readonly turrets: ReadonlyMap<EntityId, TurretLook>;
  /** Every Building in the last view, remembered ones too, so the next view can tell what was placed, hit or destroyed. */
  readonly buildings: ReadonlyMap<EntityId, BuildingView>;
  /** The last view's Fog of War, to tell a Building going up in sight from one coming into sight. */
  readonly visibility: readonly Visibility[];
  /** Whether the HQ's Building was finished and waiting in the last view. */
  readonly ready: boolean;
  /** Oldest first, never more than MAX_EFFECTS. */
  readonly effects: readonly Effect[];
  /** Oldest first, never more than MAX_MARKS. */
  readonly marks: readonly Mark[];
  /** Which of the Player's own Buildings are newly placed and still rising. */
  readonly buildUps: BuildUps;
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
  | { readonly kind: "impact"; readonly at: MapPoint }
  /**
   * A Unit that was in the view is gone from a Cell the Player still sees, or
   * was the Player's own: it died. `vehicle` is false for a Rifleman.
   */
  | {
      readonly kind: "unitDied";
      readonly unit: UnitKind;
      readonly vehicle: boolean;
      readonly owner: PlayerId;
      readonly at: MapPoint;
    }
  /** A Building that stood in sight is gone; `at` is its centre. */
  | {
      readonly kind: "buildingDestroyed";
      readonly building: BuildingKind;
      readonly owner: PlayerId;
      readonly at: MapPoint;
    }
  /** A Building went down: the Player's own, or the other Player's where this one was looking. */
  | { readonly kind: "buildingPlaced"; readonly building: BuildingKind; readonly owner: PlayerId; readonly at: MapPoint }
  /** The Player's HQ has finished its Building, which now waits to be placed. */
  | { readonly kind: "buildingReady" }
  /** One of the Player's own Barracks or Vehicle Factories has trained a Unit. */
  | { readonly kind: "unitTrained"; readonly unit: UnitKind }
  /** One of the Player's own Units or Buildings was hit or lost this Tick; at most one a Tick. */
  | { readonly kind: "underAttack"; readonly at: MapPoint };

export type { Weapon } from "./art/effectArt";

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
  return { kind: u.kind, owner: u.owner, x: u.x, y: u.y, hp: u.hp, facing, wanted, moving, walked, load, frame: unitFrame(u.kind, phase, load) };
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

  const { tick } = view;
  const me = view.playerId;
  const events: PresentationEvent[] = [];
  const effects = last ? last.effects.filter((e) => e.end > tick) : [];
  const marks = last ? last.marks.filter((m) => m.end > tick) : [];
  const visibleAt = (x: number, y: number) =>
    view.map.visibility[cellIndexIn(view.map, Math.floor(x), Math.floor(y))] === "visible";
  /** True when every Cell within `reach` (under a Cell) of the place is Visible. */
  const visibleAround = (x: number, y: number, reach: number) =>
    visibleAt(x, y) &&
    visibleAt(x - reach, y - reach) &&
    visibleAt(x + reach, y - reach) &&
    visibleAt(x - reach, y + reach) &&
    visibleAt(x + reach, y + reach);
  const effect = (kind: EffectKind, at: MapPoint, more: Partial<Effect> = {}): void => {
    const start = more.start ?? tick;
    effects.push({ kind, at, to: at, weapon: null, facing: 0, team: me, ...more, start, end: start + ticksOf(EFFECT_SECONDS[kind]) });
  };
  const mark = (kind: MarkKind, at: MapPoint, more: Partial<Mark>): void => {
    marks.push({ kind, at, unit: null, team: me, facing: 0, width: 0, height: 0, ...more, start: tick, end: tick + ticksOf(MARK_SECONDS[kind]) });
  };

  const unitAims = new Map<EntityId, MapPoint>();
  const turretAims = new Map<EntityId, MapPoint>();
  for (const s of view.shots) {
    const from = { x: s.fromX, y: s.fromY };
    const to = { x: s.toX, y: s.toY };
    // The view folds a shot from out of sight onto its landing point.
    if (samePlace(from.x, from.y, to.x, to.y)) {
      events.push({ kind: "impact", at: to });
      effect("impact", to);
      continue;
    }
    const shooter = shooterOf(view, last, s);
    if (shooter.unit !== null) unitAims.set(shooter.unit, to);
    if (shooter.turret !== null) turretAims.set(shooter.turret, to);
    const { weapon } = shooter;
    events.push({ kind: "shotFired", weapon, shooter: shooter.unit ?? shooter.turret, from, to });
    const facing = facingToward(to.x - from.x, to.y - from.y);
    effect("muzzle", from, { weapon, facing });
    effect("tracer", from, { to, weapon, facing });
    // The view shows a shot into Fog of War whole, but what it hit there is not this Player's to see.
    if (visibleAt(to.x, to.y)) effect("impact", to, { weapon, start: tick + ticksOf(EFFECT_SECONDS.tracer) });
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

  const buildings = new Map<EntityId, BuildingView>();
  for (const b of view.buildings) buildings.set(b.id, b);

  if (last) {
    let hit: MapPoint | null = null;

    // The Simulation takes a Unit out of the Match only when it dies, so one missing from the view either
    // died or is out of sight. The Player's own are always in the view: missing is dead, wherever it was.
    // The other Player's died only if this Player still sees everywhere it could be by now: where it
    // stood and one Tick's travel round it. Otherwise it may just have gone out of sight, and a death
    // there is not this Player's to know (Fog of War).
    for (const [id, was] of last.units) {
      if (units.has(id)) continue;
      const own = was.owner === me;
      if (!own && !visibleAround(was.x, was.y, UNIT_STATS[was.kind].speed / TICKS_PER_SECOND)) continue;
      const at = { x: was.x, y: was.y };
      const vehicle = was.kind !== "rifleman";
      events.push({ kind: "unitDied", unit: was.kind, vehicle, owner: was.owner, at });
      if (vehicle) effect("smallExplosion", at);
      else effect("fall", at, { team: was.owner, facing: was.facing });
      mark(vehicle ? "wreck" : "body", at, { unit: was.kind, team: was.owner, facing: was.facing });
      if (own) hit ??= at;
    }
    for (const [id, u] of units) {
      const was = last.units.get(id);
      if (was && u.owner === me && u.hp < was.hp) hit ??= { x: u.x, y: u.y };
    }

    // A Building that was there (not just remembered) and is in the view no longer was destroyed in
    // sight: one destroyed out of sight stays in the view as remembered until the Player looks again,
    // and then it is only found gone.
    for (const [id, was] of last.buildings) {
      const now = buildings.get(id);
      const at = centreOf(was);
      if (now) {
        if (was.owner === me && now.hp < was.hp) hit ??= at;
        continue;
      }
      if (was.remembered) continue;
      events.push({ kind: "buildingDestroyed", building: was.kind, owner: was.owner, at });
      effect("bigExplosion", at);
      // Smaller blasts walk across the footprint after the big one, so a large Building goes up in stages.
      const after = Math.min(MOST_AFTER_BLASTS, was.width * was.height);
      for (let i = 0; i < after; i++) {
        effect(
          "smallExplosion",
          {
            x: was.x + 0.3 + hash2(id, i, 21) * (was.width - 0.6),
            y: was.y + 0.3 + hash2(id, i, 22) * (was.height - 0.6),
          },
          { start: tick + ticksOf(AFTER_BLAST_GAP_SECONDS * (i + 1)) },
        );
      }
      mark("rubble", at, { team: was.owner, width: was.width, height: was.height });
      if (was.owner === me) hit ??= at;
    }
    if (hit) events.push({ kind: "underAttack", at: hit });

    for (const b of view.buildings) {
      if (b.remembered || last.buildings.has(b.id)) continue;
      // The other Player's Building is new only if this Player was already looking at the ground it
      // stands on; otherwise it has stood there a while and has just come into sight.
      if (b.owner !== me && !wasVisible(last, view, b)) continue;
      events.push({ kind: "buildingPlaced", building: b.kind, owner: b.owner, at: centreOf(b) });
    }

    if (view.production?.ready && !last.ready) events.push({ kind: "buildingReady" });

    // A new Unit of the Player's own was trained if a Barracks or Vehicle Factory that had its kind at the
    // head of its queue now has a shorter queue. (The Harvester that comes with a Refinery was not.)
    const usedTrainers = new Set<EntityId>();
    for (const u of view.units) {
      if (u.owner !== me || last.units.has(u.id)) continue;
      for (const [id, was] of last.buildings) {
        const queue = was.owner === me ? was.training?.queue : undefined;
        if (!queue || queue[0] !== u.kind || usedTrainers.has(id)) continue;
        if ((buildings.get(id)?.training?.queue.length ?? 0) >= queue.length) continue;
        usedTrainers.add(id);
        events.push({ kind: "unitTrained", unit: u.kind });
        break;
      }
    }
  }

  return {
    state: {
      playerId: me,
      tick,
      units,
      turrets,
      buildings,
      visibility: view.map.visibility,
      ready: view.production?.ready ?? false,
      // The oldest make room: in a fight too big to show whole, the newest flashes are the ones to see.
      effects: effects.length > MAX_EFFECTS ? effects.slice(-MAX_EFFECTS) : effects,
      marks: marks.length > MAX_MARKS ? marks.slice(-MAX_MARKS) : marks,
      buildUps: noteBuildings(last?.buildUps ?? null, view),
    },
    events,
  };
}

const ticksOf = (seconds: number) => Math.round(seconds * TICKS_PER_SECOND);

const centreOf = (b: BuildingView): MapPoint => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** True when any Cell of the Building's footprint was Visible in the last view. */
function wasVisible(last: Presentation, view: PlayerView, b: BuildingView): boolean {
  for (let dy = 0; dy < b.height; dy++) {
    for (let dx = 0; dx < b.width; dx++) {
      if (last.visibility[cellIndexIn(view.map, b.x + dx, b.y + dy)] === "visible") return true;
    }
  }
  return false;
}

/**
 * How far a Building has risen from the ground at `tick` (which may be
 * between Ticks): 0 just placed, 1 standing.
 */
export function buildingRise(state: Presentation | null, b: BuildingView, tick: number): number {
  if (!state || b.remembered) return 1;
  // Placed since the last Tick was shown (the view is refreshed at once after the Command): it has yet to start rising.
  if (b.owner === state.playerId && !state.buildings.has(b.id)) return 0;
  return buildUpProgress(state.buildUps, b.id, tick);
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
