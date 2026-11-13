// Shared vocabulary for the Simulation. Names follow GLOSSARY.md.

/** A Player is identified by its index in the Match: 0 or 1. */
export type PlayerId = 0 | 1;
export const PLAYER_IDS: readonly PlayerId[] = [0, 1];

export type EntityId = number;

export type Terrain = "open" | "rough" | "rock" | "water";

export type UnitKind = "rifleman" | "raider" | "harvester";
export type BuildingKind = "hq" | "refinery" | "barracks" | "vehicleFactory" | "turret";

/** A Cell coordinate: whole numbers, x to the right, y down. */
export interface CellPos {
  readonly x: number;
  readonly y: number;
}

/** A position in Cell units. The centre of Cell (3, 4) is (3.5, 4.5). */
export interface Vec {
  readonly x: number;
  readonly y: number;
}

/**
 * Where Cell (x, y) sits in a per-Cell array of a Map `width` wide (terrain,
 * Ore, visibility), which all run row by row from the top left.
 */
export function cellIndexIn(map: { readonly width: number }, x: number, y: number): number {
  return y * map.width + x;
}

export function isPassableTerrain(t: Terrain): boolean {
  return t === "open" || t === "rough";
}
