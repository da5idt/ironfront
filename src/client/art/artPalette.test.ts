import { describe, expect, it } from "vitest";
import { ART } from "./artPalette";
import { rgbOf } from "./pixelBuffer";

const luma = (hex: string) => {
  const [r, g, b] = rgbOf(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

/** Every string in the table, wherever it is nested. */
function allColours(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (v && typeof v === "object") return Object.values(v).flatMap(allColours);
  return [];
}

describe("art palette", () => {
  it("holds only solid #rrggbb colours, which the pixel painters can read", () => {
    const colours = allColours(ART);
    expect(colours.length).toBeGreaterThan(40);
    for (const c of colours) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("runs every ramp from dark to light", () => {
    const ramps: (readonly string[])[] = [ART.concrete, ART.fire, ART.smoke, ART.shore.sand];
    for (const t of Object.values(ART.team)) ramps.push([t.dark, t.mid, t.light]);
    ramps.push([ART.glass.dark, ART.glass.mid, ART.glass.light]);
    ramps.push([ART.ore.shadow, ART.ore.dark, ART.ore.mid, ART.ore.light]);
    for (const ramp of ramps) {
      for (let i = 1; i < ramp.length; i++) expect(luma(ramp[i]!), ramp.join()).toBeGreaterThan(luma(ramp[i - 1]!));
    }
  });

  it("gives the two teams different colours at every step", () => {
    const [a, b] = [ART.team[0], ART.team[1]];
    expect(new Set([a.dark, a.mid, a.light, b.dark, b.mid, b.light]).size).toBe(6);
  });
});
