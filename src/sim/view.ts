import type { MatchState } from "./state";
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
}

export interface MapView {
  readonly width: number;
  readonly height: number;
  /** Indexed by y * width + x. */
  readonly terrain: readonly Terrain[];
  readonly ore: readonly number[];
}

export interface PlayerView {
  readonly tick: number;
  readonly playerId: PlayerId;
  readonly credits: number;
  readonly map: MapView;
  readonly units: readonly UnitView[];
  readonly buildings: readonly BuildingView[];
  /** Shots fired during the last Tick, for drawing tracers. */
  readonly shots: readonly ShotView[];
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

export function buildPlayerView(m: MatchState, playerId: PlayerId): PlayerView {
  const units: UnitView[] = [];
  for (const u of m.units.values()) {
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
    buildings.push({
      id: b.id,
      kind: b.kind,
      owner: b.owner,
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      hp: b.hp,
      maxHp: BUILDING_STATS[b.kind].maxHp,
    });
  }
  return {
    tick: m.tick,
    playerId,
    credits: m.players[playerId].credits,
    map: { width: m.width, height: m.height, terrain: m.terrain.slice(), ore: m.ore.slice() },
    units,
    buildings,
    shots: m.shots.map((s) => ({ ...s })),
  };
}
