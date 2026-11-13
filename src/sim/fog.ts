import type { BuildingState, MatchState } from "./state";
import { cellIndex } from "./state";
import { BUILDING_STATS, UNIT_STATS } from "./tuning";
import { type EntityId, PLAYER_IDS, type PlayerId } from "./types";

// Fog of War: what each Player can see, recomputed every Tick from the sight
// of its Units and Buildings.

export type Visibility = "unexplored" | "fogged" | "visible";

const UNEXPLORED = 0;
const FOGGED = 1;
const VISIBLE = 2;
const NAMES: readonly Visibility[] = ["unexplored", "fogged", "visible"];

/** An enemy Building as it looked the last time any of its Cells was Visible. */
export type BuildingSighting = Readonly<Pick<BuildingState, "id" | "kind" | "owner" | "x" | "y" | "width" | "height" | "hp">>;

export interface PlayerFog {
  /** Per Cell, indexed by cellIndex(): UNEXPLORED, FOGGED or VISIBLE. */
  readonly cells: Uint8Array;
  /**
   * Enemy Buildings last seen, by id. A sighting outlives the Building: it is
   * only dropped when its Cells are seen again, so a Building destroyed out of
   * sight still shows until the Player looks.
   */
  readonly sightings: Map<EntityId, BuildingSighting>;
  /** Ore per Cell as last seen; 0 where never seen. */
  readonly ore: number[];
}

export function createFog(width: number, height: number): PlayerFog {
  return { cells: new Uint8Array(width * height), sightings: new Map(), ore: new Array<number>(width * height).fill(0) };
}

export function visibilityAt(fog: PlayerFog, i: number): Visibility {
  return NAMES[fog.cells[i]!]!;
}

export function isVisible(fog: PlayerFog, i: number): boolean {
  return fog.cells[i] === VISIBLE;
}

/** The per-Tick system. Runs after everything that moves or removes things. */
export function updateFog(m: MatchState): void {
  for (const player of PLAYER_IDS) updatePlayerFog(m, player);
}

function updatePlayerFog(m: MatchState, player: PlayerId): void {
  const { cells } = m.fog[player];
  for (let i = 0; i < cells.length; i++) if (cells[i] === VISIBLE) cells[i] = FOGGED;
  for (const u of m.units.values()) {
    if (u.owner === player) reveal(m, cells, u.x, u.y, u.x, u.y, UNIT_STATS[u.kind].sight);
  }
  for (const b of m.buildings.values()) {
    if (b.owner === player) reveal(m, cells, b.x, b.y, b.x + b.width, b.y + b.height, BUILDING_STATS[b.kind].sight);
  }
  const { ore } = m.fog[player];
  for (let i = 0; i < cells.length; i++) if (cells[i] === VISIBLE) ore[i] = m.ore[i]!;
  rememberBuildings(m, m.fog[player], player);
}

function rememberBuildings(m: MatchState, fog: PlayerFog, player: PlayerId): void {
  for (const [id, seen] of fog.sightings) {
    if (isFootprintVisible(m, fog, seen)) fog.sightings.delete(id);
  }
  for (const b of m.buildings.values()) {
    if (b.owner === player || !isFootprintVisible(m, fog, b)) continue;
    fog.sightings.set(b.id, { id: b.id, kind: b.kind, owner: b.owner, x: b.x, y: b.y, width: b.width, height: b.height, hp: b.hp });
  }
}

/** True when any Cell of the footprint is Visible: seeing a corner of a Building is seeing it. */
export function isFootprintVisible(m: MatchState, fog: PlayerFog, b: BuildingSighting): boolean {
  for (let dy = 0; dy < b.height; dy++) {
    for (let dx = 0; dx < b.width; dx++) {
      if (fog.cells[cellIndex(m, b.x + dx, b.y + dy)] === VISIBLE) return true;
    }
  }
  return false;
}

/**
 * Marks Visible every Cell whose centre lies within `sight` of the rectangle
 * (x0,y0)-(x1,y1) in Cell units. A Unit is a rectangle of zero size; a
 * Building's sight is measured from the edge of its footprint, so big
 * Buildings see further out than their centre alone would.
 */
function reveal(m: MatchState, cells: Uint8Array, x0: number, y0: number, x1: number, y1: number, sight: number): void {
  const cx0 = Math.max(0, Math.floor(x0 - sight));
  const cy0 = Math.max(0, Math.floor(y0 - sight));
  const cx1 = Math.min(m.width - 1, Math.floor(x1 + sight));
  const cy1 = Math.min(m.height - 1, Math.floor(y1 + sight));
  const r2 = sight * sight;
  for (let cy = cy0; cy <= cy1; cy++) {
    const py = cy + 0.5;
    const dy = py < y0 ? y0 - py : py > y1 ? py - y1 : 0;
    for (let cx = cx0; cx <= cx1; cx++) {
      const px = cx + 0.5;
      const dx = px < x0 ? x0 - px : px > x1 ? px - x1 : 0;
      if (dx * dx + dy * dy <= r2) cells[cellIndex(m, cx, cy)] = VISIBLE;
    }
  }
}
