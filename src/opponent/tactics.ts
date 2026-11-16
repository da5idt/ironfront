import { type BuildingView, OPPONENT, type UnitView, type Vec } from "../sim";

// The Computer Opponent's fighting decisions that are worth testing on their own:
// how big an attack wave must be, and which of several candidates is nearest.

/** How close to a Building one of the other Player's Units counts as attacking the base. */
export const DEFEND_RADIUS = 10;
/** Thinks a Unit may stand still short of its target before its Command is given again. */
export const STUCK_THINKS = 3;

/** Idle army Units the Opponent waits for before sending wave `wave` (counting from 0). */
export function waveThreshold(wave: number): number {
  return Math.min(OPPONENT.waveCap, OPPONENT.firstWave + OPPONENT.waveGrowth * wave);
}

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
  if (s.tick < OPPONENT.firstWaveTick) return false;
  if (s.lastWaveTick !== null && s.tick - s.lastWaveTick < OPPONENT.waveIntervalTicks) return false;
  return s.army >= waveThreshold(s.wave);
}

/** From `from` to a Unit's position, or to the nearest point of a Building's footprint. */
export function distanceTo(t: UnitView | BuildingView, from: Vec): number {
  if (!("width" in t)) return Math.hypot(t.x - from.x, t.y - from.y);
  const x = Math.min(t.x + t.width, Math.max(t.x, from.x));
  const y = Math.min(t.y + t.height, Math.max(t.y, from.y));
  return Math.hypot(x - from.x, y - from.y);
}

/**
 * The candidate nearest `from` (distanceTo) within `range`, or null. Ties go
 * to the lowest id so the choice is the same every run, whatever the order.
 */
export function nearest<T extends UnitView | BuildingView>(
  candidates: readonly T[],
  from: Vec,
  range = Infinity,
): T | null {
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
