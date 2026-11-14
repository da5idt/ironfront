import { describe, expect, it } from "vitest";
import { ART } from "./artPalette";
import { eachWaterGlint } from "./waterArt";

/** The sparkles lit on a water Cell at a moment, gathered into a list. */
function waterGlints(cx: number, cy: number, seconds: number) {
  const glints: { x: number; y: number; colour: string }[] = [];
  eachWaterGlint(cx, cy, seconds, (x, y, colour) => glints.push({ x, y, colour }));
  return glints;
}

const times = Array.from({ length: 80 }, (_, i) => i * 0.05);

describe("water shimmer", () => {
  it("lets a glint come and go on a water Cell over a few seconds", () => {
    const shown = times.map((t) => waterGlints(5, 7, t).length);
    expect(shown.some((n) => n > 0)).toBe(true);
    expect(shown.some((n) => n === 0)).toBe(true);
  });

  it("keeps glints away from the shore band and in the shimmer colours", () => {
    for (let c = 0; c < 30; c++) {
      for (const t of times) {
        for (const g of waterGlints(c, c * 3, t)) {
          expect(g.x).toBeGreaterThanOrEqual(4);
          expect(g.x).toBeLessThanOrEqual(7);
          expect(g.y).toBeGreaterThanOrEqual(4);
          expect(g.y).toBeLessThanOrEqual(7);
          expect([ART.glint.dim, ART.glint.bright]).toContain(g.colour);
        }
      }
    }
  });

  it("shimmers out of step from Cell to Cell", () => {
    const at = (c: number) => times.map((t) => waterGlints(c, 0, t).length > 0).join();
    const patterns = new Set(Array.from({ length: 10 }, (_, c) => at(c)));
    expect(patterns.size).toBeGreaterThan(3);
  });
});
