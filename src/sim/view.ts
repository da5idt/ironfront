import { productionView, type ProductionView } from "./building";
import {
  type BuildingSighting,
  isFootprintVisible,
  isVisible,
  type PlayerFog,
  type Visibility,
  visibilityAt,
} from "./fog";
import { cellIndex, type MatchState, type PassengerEvent, type UnitState } from "./state";
import { type TrainingView, trainingView } from "./training";
import { BUILDING_STATS, UNIT_STATS } from "./tuning";
import type { BuildingKind, EntityId, PlayerId, Terrain, UnitKind } from "./types";

// A Player's view of the Match: everything the drawing code and the Computer
// Opponent are allowed to know. Plain data, safe to keep between Ticks.

export interface UnitView {
  readonly id: EntityId;
  readonly kind: UnitKind;
  readonly owner: PlayerId;
  readonly x: number;
  readonly y: number;
  /** Position one Tick earlier, so drawing can interpolate. */
  readonly prevX: number;
  readonly prevY: number;
  readonly hp: number;
  readonly maxHp: number;
  /** Ore carried; 0 for anything but a Harvester. */
  readonly cargo: number;
  /**
   * Who is inside one of the Player's own Units, in the order they got in:
   * empty for anything but a Troop Carrier with Passengers. Null for the other
   * Player's Units, whatever they hold: that is their owner's to know.
   */
  readonly passengers: readonly PassengerView[] | null;
}

/**
 * A Passenger: a Unit inside a Troop Carrier. It is off the Map, so it is not
 * in the view's `units`; its id is the one it had and will have when it gets out.
 */
export interface PassengerView {
  readonly id: EntityId;
  readonly kind: UnitKind;
}

export interface BuildingView {
  readonly id: EntityId;
  readonly kind: BuildingKind;
  readonly owner: PlayerId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly hp: number;
  readonly maxHp: number;
  /**
   * False when the Building is there now: always for the Player's own, and for
   * an enemy Building with any footprint Cell Visible. True for an enemy
   * Building remembered from an earlier sighting (its Cells are Fogged): kind,
   * place and hp are as last seen, and it may since have been destroyed. A
   * remembered Building stays until one of its Cells is Visible again. Its id
   * is the real Building's, so an attack Command on it still names the target.
   */
  readonly remembered: boolean;
  /**
   * Queue, progress and rally point of the Player's own Barracks or Vehicle
   * Factory. Null for every other Building, so enemy queues never leak.
   */
  readonly training: TrainingView | null;
}

export interface MapView {
  readonly width: number;
  readonly height: number;
  /**
   * Indexed by y * width + x. The whole Map's terrain is known from the start
   * (it never changes); Fog of War hides what is on it, not the ground.
   */
  readonly terrain: readonly Terrain[];
  /** Ore in Visible Cells, the last-seen amount in Fogged Cells, 0 in Unexplored Cells. */
  readonly ore: readonly number[];
  /** This Player's Fog of War per Cell, indexed like terrain. */
  readonly visibility: readonly Visibility[];
}

/**
 * Fog of War applies: `units` holds the Player's own Units and enemy Units in
 * Visible Cells only, and never a Passenger (see UnitView.passengers); `buildings` holds the Player's own Buildings plus enemy
 * Buildings seen now or remembered (see BuildingView.remembered). Nothing in
 * Unexplored Cells is listed.
 */
export interface PlayerView {
  readonly tick: number;
  readonly playerId: PlayerId;
  readonly credits: number;
  readonly map: MapView;
  readonly units: readonly UnitView[];
  readonly buildings: readonly BuildingView[];
  /**
   * Shots fired during the last Tick, for drawing tracers, under Fog of War:
   * a shot fired from a Visible Cell is shown whole; one fired from out of
   * sight that lands in a Visible Cell is shown as its impact alone (from =
   * to), so the person sees the hit but not where it came from; any other
   * shot is left out.
   */
  readonly shots: readonly ShotView[];
  /**
   * Units and Buildings worked on by a Tend during the last Tick, for drawing
   * and sound, under Fog of War. A target is listed on every Tick it is worked
   * on, also the Ticks that add no whole point of health: the Player's own
   * always, the other Player's only where the target can be seen now. Each
   * names the support Units at work on it under the same rule: the Player's
   * own always, the other Player's only those standing where they can be seen
   * now.
   */
  readonly tends: readonly TendView[];
  /**
   * Units that got into or out of a Troop Carrier during the last Tick, or by
   * a Command just before it, for drawing and sound, under Fog of War: the
   * Player's own always, the other Player's only where the Cell the Unit stood
   * in is Visible now. So of the other Player's Troop Carrier a Player learns
   * what it sees walk in or out, and never who is still inside.
   */
  readonly passengerEvents: readonly PassengerEventView[];
  /** What this Player's HQ is building, or null when it is free. */
  readonly production: ProductionView | null;
}

/** One shot, from shooter to target, in Cell units. */
export interface ShotView {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  /** The Tick it was fired in. */
  readonly tick: number;
}

/** One target being worked on by a Tend. The target is in this view's `units` or `buildings` under the same id. */
export interface TendView {
  readonly targetId: EntityId;
  /** The support Units at work on it that this view shows, lowest id first. Each is in this view's `units`. */
  readonly unitIds: readonly EntityId[];
  /** The target's position in Cell units: a Unit's own, or the centre of a Building's footprint. */
  readonly x: number;
  readonly y: number;
  /** The Tick it was worked on in. */
  readonly tick: number;
}

/** One Unit getting into or out of a Troop Carrier, as the Match notes it: nothing in it needs hiding once the event may be seen. */
export type PassengerEventView = PassengerEvent;

function buildingView(b: BuildingSighting, remembered: boolean, training: TrainingView | null = null): BuildingView {
  return {
    id: b.id,
    kind: b.kind,
    owner: b.owner,
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    hp: b.hp,
    maxHp: BUILDING_STATS[b.kind].maxHp,
    remembered,
    training,
  };
}

/** The shots a Player may see; the rule is on PlayerView.shots. */
function visibleShots(m: MatchState, fog: PlayerFog): ShotView[] {
  const seen = (x: number, y: number) => isVisible(fog, cellIndex(m, Math.floor(x), Math.floor(y)));
  const shots: ShotView[] = [];
  for (const s of m.shots) {
    if (seen(s.fromX, s.fromY)) shots.push({ ...s });
    else if (seen(s.toX, s.toY)) shots.push({ ...s, fromX: s.toX, fromY: s.toY });
  }
  return shots;
}

/** The Tends a Player may see; the rule is on PlayerView.tends. */
function visibleTends(m: MatchState, playerId: PlayerId, fog: PlayerFog): TendView[] {
  const seen = (u: UnitState | undefined): u is UnitState =>
    u !== undefined && (u.owner === playerId || isVisible(fog, cellIndex(m, Math.floor(u.x), Math.floor(u.y))));
  const tends: TendView[] = [];
  for (const t of m.tends) {
    const unitIds = t.unitIds.filter((id) => seen(m.units.get(id))).sort((a, b) => a - b);
    const u = m.units.get(t.targetId);
    if (u) {
      if (seen(u)) tends.push({ ...t, unitIds, x: u.x, y: u.y });
      continue;
    }
    const b = m.buildings.get(t.targetId);
    if (b && (b.owner === playerId || isFootprintVisible(m, fog, b))) {
      tends.push({ ...t, unitIds, x: b.x + b.width / 2, y: b.y + b.height / 2 });
    }
  }
  return tends;
}

/** The Units getting in and out a Player may see; the rule is on PlayerView.passengerEvents. */
function visiblePassengerEvents(m: MatchState, playerId: PlayerId, fog: PlayerFog): PassengerEventView[] {
  return m.passengerEvents
    .filter((e) => e.owner === playerId || isVisible(fog, cellIndex(m, Math.floor(e.x), Math.floor(e.y))))
    .map((e) => ({ ...e }));
}

export function buildPlayerView(m: MatchState, playerId: PlayerId): PlayerView {
  const fog = m.fog[playerId];
  const units: UnitView[] = [];
  for (const u of m.units.values()) {
    if (u.owner !== playerId && !isVisible(fog, cellIndex(m, Math.floor(u.x), Math.floor(u.y)))) continue;
    units.push({
      id: u.id,
      kind: u.kind,
      owner: u.owner,
      x: u.x,
      y: u.y,
      prevX: u.prevX,
      prevY: u.prevY,
      hp: u.hp,
      maxHp: UNIT_STATS[u.kind].maxHp,
      cargo: u.cargo,
      passengers: u.owner === playerId ? u.passengers.map((p) => ({ id: p.id, kind: p.kind })) : null,
    });
  }
  const buildings: BuildingView[] = [];
  for (const b of m.buildings.values()) {
    if (b.owner === playerId) buildings.push(buildingView(b, false, trainingView(b)));
  }
  for (const seen of fog.sightings.values()) {
    const live = m.buildings.get(seen.id);
    if (live && isFootprintVisible(m, fog, live)) buildings.push(buildingView(live, false));
    else buildings.push(buildingView(seen, true));
  }
  return {
    tick: m.tick,
    playerId,
    credits: m.players[playerId].credits,
    map: {
      width: m.width,
      height: m.height,
      terrain: m.terrain.slice(),
      // Ore can change between Ticks (a harvest Command), so Visible Cells read it live.
      ore: m.ore.map((amount, i) => (isVisible(fog, i) ? amount : fog.ore[i]!)),
      visibility: Array.from(fog.cells, (_, i) => visibilityAt(fog, i)),
    },
    units,
    buildings,
    shots: visibleShots(m, fog),
    tends: visibleTends(m, playerId, fog),
    passengerEvents: visiblePassengerEvents(m, playerId, fog),
    production: productionView(m, playerId),
  };
}
