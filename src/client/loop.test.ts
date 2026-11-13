import { describe, expect, it } from "vitest";
import { interpolationAlpha, MAX_TICKS_PER_FRAME, stepClock, TICK_MS } from "./loop";

describe("fixed-Tick clock", () => {
  it("runs 20 Ticks per second whatever the frame rate", () => {
    for (const fps of [30, 60, 144]) {
      let clock = { accumulatedMs: 0 };
      let ticks = 0;
      for (let f = 0; f < fps * 3; f++) {
        const r = stepClock(clock, 1000 / fps);
        ticks += r.ticks;
        clock = r.clock;
      }
      expect(Math.abs(ticks - 60)).toBeLessThanOrEqual(1);
    }
  });

  it("keeps the leftover time for interpolation", () => {
    const r = stepClock({ accumulatedMs: 0 }, TICK_MS * 1.5);
    expect(r.ticks).toBe(1);
    expect(interpolationAlpha(r.clock)).toBeCloseTo(0.5);
  });

  it("doesn't spiral after a long stall", () => {
    const r = stepClock({ accumulatedMs: 0 }, 10_000);
    expect(r.ticks).toBe(MAX_TICKS_PER_FRAME);
    expect(r.clock.accumulatedMs).toBe(0);
  });
});
