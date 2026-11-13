// The Computer Opponent's own seeded random numbers (mulberry32). It has its
// own so its choices never disturb the Simulation's, and a Match with an
// Opponent replays exactly from the two seeds.

export interface Rng {
  state: number;
}

export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

/** An integer in [0, n). Advances the generator. */
export function nextInt(rng: Rng, n: number): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
}
