import { productionView, type ProductionView } from "./building";
import {
  type BuildingSighting,
  isFootprintVisible,
  isVisible,
  type PlayerFog,
  type Visibility,
  visibilityAt,
} from "./fog";
import { cellIndex, type MatchState } from "./state";
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
 * Visible Cells only; `buildings` holds the Player's own Buildings plus enemy
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
    production: productionView(m, playerId),
  };
}
