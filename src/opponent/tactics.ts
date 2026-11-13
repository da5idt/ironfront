import {
  type BuildingView,
  type EntityId,
  type PlayerView,
  TICKS_PER_SECOND,
  UNIT_STATS,
  type UnitView,
  type Vec,
} from "../sim";

// The Computer Opponent's fighting decisions that are worth testing on their own:
// how big an attack wave must be, and what a Unit should shoot.

/** Units in the first attack wave; each wave after asks for WAVE_GROWTH more, up to WAVE_CAP. */
export const FIRST_WAVE = 6;
export const WAVE_GROWTH = 3;
export const WAVE_CAP = 24;

/** Idle army Units the Opponent waits for before sending wave `wave` (counting from 0). */
export function waveThreshold(wave: number): number {
  return Math.min(WAVE_CAP, FIRST_WAVE + WAVE_GROWTH * wave);
}

/** No wave before this Tick, so the person has time to build before the first attack (4.5 minutes). */
export const FIRST_WAVE_TICK = 270 * TICKS_PER_SECOND;
/** Least time from one wave setting off to the next. */
export const WAVE_INTERVAL_TICKS = 90 * TICKS_PER_SECOND;

export interface WaveState {
  /** Waves sent so far. */
  readonly wave: number;
  /** Army Units waiting at home. */
  readonly army: number;
  readonly tick: number;
  /** When the last wave set off, or null before the first. */
  readonly lastWaveTick: number | null;
}

/** Whether the Opponent sends its next attack wave now. */
export function waveReady(s: WaveState): boolean {
  if (s.tick < FIRST_WAVE_TICK) return false;
  if (s.lastWaveTick !== null && s.tick - s.lastWaveTick < WAVE_INTERVAL_TICKS) return false;
  return s.army >= waveThreshold(s.wave);
}

/** How far from a Unit an enemy counts as in its way and worth turning on. */
export const REACH = 8;

/**
 * What a Unit at `from` should attack, or null when no enemy is known. In reach,
 * the order is: armed Units (they shoot back), other Units, Turrets (they shoot
 * back too), then any Building. Out of reach, the nearest known enemy Building,
 * remembered ones included, since the Opponent attacks what it last saw.
 */
export function chooseTarget(view: PlayerView, from: Vec): EntityId | null {
  const enemyUnits = view.units.filter((u) => u.owner !== view.playerId);
  const enemyBuildings = view.buildings.filter((b) => b.owner !== view.playerId);
  const armed = enemyUnits.filter((u) => UNIT_STATS[u.kind].damage > 0);
  const turrets = enemyBuildings.filter((b) => b.kind === "turret");
  const pick =
    nearest(armed, from, REACH) ??
    nearest(enemyUnits, from, REACH) ??
    nearest(turrets, from, REACH) ??
    nearest(enemyBuildings, from, Infinity);
  return pick?.id ?? null;
}

/** From `from` to a Unit's position, or to the nearest point of a Building's footprint. */
export function distanceTo(t: UnitView | BuildingView, from: Vec): number {
  if (!("width" in t)) return Math.hypot(t.x - from.x, t.y - from.y);
  const x = Math.min(t.x + t.width, Math.max(t.x, from.x));
  const y = Math.min(t.y + t.height, Math.max(t.y, from.y));
  return Math.hypot(x - from.x, y - from.y);
}

/** Ties go to the lowest id so the choice is the same every run. */
function nearest<T extends UnitView | BuildingView>(candidates: readonly T[], from: Vec, range: number): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const t of candidates) {
    const d = distanceTo(t, from);
    if (d > range) continue;
    if (d < bestD || (d === bestD && best !== null && t.id < best.id)) {
      best = t;
      bestD = d;
    }
  }
  return best;
}
