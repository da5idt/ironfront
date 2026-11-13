import { TICKS_PER_SECOND } from "../sim";

// The fixed-Tick clock (ADR 0002): real time accumulates and is spent in whole
// Ticks; drawing happens every frame and interpolates by what is left over.

export const TICK_MS = 1000 / TICKS_PER_SECOND;
/** After a long stall (tab hidden, breakpoint) don't try to catch up more than this. */
export const MAX_TICKS_PER_FRAME = 5;

export interface Clock {
  readonly accumulatedMs: number;
}

/** How many Ticks to run this frame, and the new clock. */
export function stepClock(clock: Clock, frameMs: number): { ticks: number; clock: Clock } {
  let acc = clock.accumulatedMs + Math.max(0, frameMs);
  let ticks = Math.floor(acc / TICK_MS);
  if (ticks > MAX_TICKS_PER_FRAME) {
    ticks = MAX_TICKS_PER_FRAME;
    acc = 0;
  } else {
    acc -= ticks * TICK_MS;
  }
  return { ticks, clock: { accumulatedMs: acc } };
}

/** How far between the last Tick and the next one we are, from 0 to 1. */
export function interpolationAlpha(clock: Clock): number {
  return Math.min(1, clock.accumulatedMs / TICK_MS);
}
