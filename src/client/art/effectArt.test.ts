import { describe, expect, it } from "vitest";
import { ART } from "./artPalette";
import {
  type BlastName,
  BLASTS,
  blastSize,
  EFFECT_SECONDS,
  FALL_FRAMES,
  FALL_PX,
  HEAL_FRAMES,
  HEAL_PX,
  impactBlast,
  MARK_FADE_SECONDS,
  MARK_SECONDS,
  MUZZLE_FRAMES,
  MUZZLE_PX,
  paintBlast,
  paintBody,
  paintFall,
  paintHeal,
  paintMuzzle,
  paintRepair,
  paintRubble,
  paintWreck,
  REPAIR_FRAMES,
  REPAIR_PX,
  RUBBLE_MARGIN,
  WRECK_PX,
} from "./effectArt";
import { type PixelBuffer, pixelAt } from "./pixelBuffer";

function colours(buf: PixelBuffer): Set<string> {
  const seen = new Set<string>();
  for (let y = 0; y < buf.height; y++) {
    for (let x = 0; x < buf.width; x++) {
      const c = pixelAt(buf, x, y);
      if (c) seen.add(c);
    }
  }
  return seen;
}

const painted = (buf: PixelBuffer) => buf.data.filter((_, i) => i % 4 === 3 && buf.data[i]! > 0).length;
const same = (a: PixelBuffer, b: PixelBuffer) => a.data.every((v, i) => v === b.data[i]);
const PLAYER_COLOURS = [0, 1].flatMap((t) => Object.values(ART.player[t as 0 | 1]));

describe("blasts", () => {
  const names = Object.keys(BLASTS) as BlastName[];

  it("are squares sized for their reach, the same pixels every time", () => {
    for (const name of names) {
      const buf = paintBlast(name, 1);
      expect([buf.width, buf.height]).toEqual([blastSize(BLASTS[name]), blastSize(BLASTS[name])]);
      expect(same(buf, paintBlast(name, 1))).toBe(true);
    }
    expect(blastSize(BLASTS.bigExplosion)).toBeGreaterThan(blastSize(BLASTS.smallExplosion) * 1.5);
  });

  it("start as white-hot fire and end as thinning smoke with no fire left", () => {
    for (const name of ["smallExplosion", "bigExplosion"] as const) {
      const { frames } = BLASTS[name];
      const first = colours(paintBlast(name, 0));
      const last = colours(paintBlast(name, frames - 1));
      expect(first.has(ART.fire[3])).toBe(true);
      for (const hot of ART.fire) expect(last.has(hot)).toBe(false);
      expect(last.size).toBeGreaterThan(0);
      // Swells to its biggest and then thins out.
      const sizes = Array.from({ length: frames }, (_, f) => painted(paintBlast(name, f)));
      const biggest = sizes.indexOf(Math.max(...sizes));
      expect(biggest).toBeGreaterThan(0);
      expect(sizes[frames - 1]).toBeLessThan(sizes[biggest]! * 0.8);
    }
  });

  it("change from every frame to the next", () => {
    for (const name of names) {
      for (let f = 1; f < BLASTS[name].frames; f++) expect(same(paintBlast(name, f), paintBlast(name, f - 1))).toBe(false);
    }
  });

  it("give each weapon its own impact, the cannon's the biggest", () => {
    expect(impactBlast("rifle")).toBe("rifleImpact");
    expect(impactBlast("raiderGun")).toBe("raiderGunImpact");
    expect(impactBlast("turretCannon")).toBe("turretCannonImpact");
    // A shot from out of sight names no weapon.
    expect(impactBlast(null)).toBe("raiderGunImpact");
    expect(BLASTS.turretCannonImpact.radius).toBeGreaterThan(BLASTS.raiderGunImpact.radius);
    expect(BLASTS.raiderGunImpact.radius).toBeGreaterThan(BLASTS.rifleImpact.radius);
  });
});

describe("muzzle flashes", () => {
  it("point along each of the 16 facings and grow with the gun", () => {
    for (const weapon of ["rifle", "raiderGun", "turretCannon"] as const) {
      const seen = new Set<string>();
      for (let facing = 0; facing < 16; facing++) {
        const buf = paintMuzzle(weapon, facing, 0);
        expect([buf.width, buf.height]).toEqual([MUZZLE_PX, MUZZLE_PX]);
        seen.add(buf.data.join());
      }
      // The rifle's is only a few pixels, so close facings may share a picture; the eight main ones never do.
      expect(seen.size).toBeGreaterThanOrEqual(8);
      for (let f = 1; f < MUZZLE_FRAMES; f++) expect(painted(paintMuzzle(weapon, 0, f))).toBeLessThan(painted(paintMuzzle(weapon, 0, 0)));
    }
    expect(painted(paintMuzzle("turretCannon", 0, 0))).toBeGreaterThan(painted(paintMuzzle("raiderGun", 0, 0)));
    expect(painted(paintMuzzle("raiderGun", 0, 0))).toBeGreaterThan(painted(paintMuzzle("rifle", 0, 0)));
  });

  it("flash east of the barrel for facing 0 and south of it for facing 4", () => {
    const mid = (MUZZLE_PX - 1) / 2;
    const east = paintMuzzle("turretCannon", 0, 0);
    expect(pixelAt(east, mid + 3, mid)).not.toBeNull();
    expect(pixelAt(east, mid - 3, mid)).toBeNull();
    const south = paintMuzzle("turretCannon", 4, 0);
    expect(pixelAt(south, mid, mid + 3)).not.toBeNull();
    expect(pixelAt(south, mid, mid - 3)).toBeNull();
  });
});

describe("what a death leaves", () => {
  it("a falling Rifleman wears his Player's colours in every frame, and can fall either way", () => {
    for (let f = 0; f < FALL_FRAMES; f++) {
      const blue = paintFall(0, f, false);
      expect([blue.width, blue.height]).toEqual([FALL_PX, FALL_PX]);
      expect(colours(blue).has(ART.player[0].mid)).toBe(true);
      expect(colours(paintFall(1, f, false)).has(ART.player[1].mid)).toBe(true);
      expect(same(blue, paintFall(0, f, true))).toBe(false);
    }
    expect(same(paintBody(0, false), paintBody(1, false))).toBe(false);
  });

  it("a wreck is burnt bare: none of its Player's colour is left on it, and it keeps the way the vehicle faced", () => {
    for (const kind of ["raider", "harvester", "troopCarrier"] as const) {
      const pictures = new Set<string>();
      for (let facing = 0; facing < 16; facing++) {
        const wreck = paintWreck(kind, facing);
        expect([wreck.width, wreck.height]).toEqual([WRECK_PX, WRECK_PX]);
        for (const c of PLAYER_COLOURS) expect(colours(wreck).has(c)).toBe(false);
        pictures.add(wreck.data.join());
      }
      expect(pictures.size).toBe(16);
    }
  });

  it("rubble covers the Building's footprint and a margin of scorched ground", () => {
    for (const [w, h] of [
      [1, 1],
      [2, 2],
      [3, 2],
      [3, 3],
    ] as const) {
      const rubble = paintRubble(w, h);
      expect([rubble.width, rubble.height]).toEqual([w * 12 + RUBBLE_MARGIN * 2, h * 12 + RUBBLE_MARGIN * 2]);
      expect(same(rubble, paintRubble(w, h))).toBe(true);
      // Mostly covered inside the footprint, with broken concrete among the scorch.
      expect(painted(rubble)).toBeGreaterThan(w * h * 144 * 0.7);
      expect(colours(rubble).has(ART.concrete[3])).toBe(true);
    }
  });
});

/** The mean row of what is painted: lower numbers are higher up the picture. */
function meanRow(buf: PixelBuffer): number {
  let rows = 0;
  let count = 0;
  for (let y = 0; y < buf.height; y++) {
    for (let x = 0; x < buf.width; x++) {
      if (pixelAt(buf, x, y)) {
        rows += y;
        count++;
      }
    }
  }
  return rows / count;
}

describe("the heal and repair effects", () => {
  const heal = Array.from({ length: HEAL_FRAMES }, (_, f) => paintHeal(f));
  const repair = Array.from({ length: REPAIR_FRAMES }, (_, f) => paintRepair(f));
  /** Reds a Player or a wound could be read from: Player 1's colours, the low-health bar, the darkest fire. */
  const REDS: string[] = [...Object.values(ART.player[1]), ART.marker.healthLow, ART.fire[0], ART.lamp.redOn];

  it("are small squares with something painted in every frame, the same pixels every time", () => {
    expect(heal.length).toBeGreaterThanOrEqual(3);
    expect(repair.length).toBeGreaterThanOrEqual(3);
    for (const [f, buf] of heal.entries()) {
      expect([buf.width, buf.height]).toEqual([HEAL_PX, HEAL_PX]);
      expect(painted(buf)).toBeGreaterThan(0);
      expect(same(buf, paintHeal(f))).toBe(true);
    }
    for (const [f, buf] of repair.entries()) {
      expect([buf.width, buf.height]).toEqual([REPAIR_PX, REPAIR_PX]);
      expect(painted(buf)).toBeGreaterThan(0);
      expect(same(buf, paintRepair(f))).toBe(true);
    }
  });

  it("stay small: no bigger than a Cell and a bit, so they sit on their target and not on its neighbours", () => {
    expect(HEAL_PX).toBeLessThanOrEqual(16);
    expect(REPAIR_PX).toBeLessThanOrEqual(16);
  });

  it("change from every frame to the next", () => {
    expect(HEAL_FRAMES).toBeGreaterThanOrEqual(3);
    expect(REPAIR_FRAMES).toBeGreaterThanOrEqual(3);
    for (let f = 1; f < HEAL_FRAMES; f++) expect(same(heal[f]!, heal[f - 1]!)).toBe(false);
    for (let f = 1; f < REPAIR_FRAMES; f++) expect(same(repair[f]!, repair[f - 1]!)).toBe(false);
  });

  it("heal is the game's own green aid colour rising, with no red and neither Player's colour in it", () => {
    const seen = new Set(heal.flatMap((buf) => [...colours(buf)]));
    expect(seen.has(ART.aid.mark)).toBe(true);
    for (const c of [...REDS, ...PLAYER_COLOURS]) expect(seen.has(c)).toBe(false);
    // The motes drift up over the effect's life.
    expect(meanRow(heal[HEAL_FRAMES - 1]!)).toBeLessThan(meanRow(heal[0]!) - 2);
  });

  it("repair is a bright weld point throwing sparks that spread and cool, nothing like the heal", () => {
    const first = colours(repair[0]!);
    expect(first.has(ART.weldSpark)).toBe(true);
    const seen = new Set(repair.flatMap((buf) => [...colours(buf)]));
    expect(seen.has(ART.fire[2])).toBe(true);
    for (const c of PLAYER_COLOURS) expect(seen.has(c)).toBe(false);
    expect(seen.has(ART.aid.mark)).toBe(false);
    // The weld point has gone out by the last frame, and the sparks have fallen below where it was.
    const last = repair[REPAIR_FRAMES - 1]!;
    expect(colours(last).has(ART.weldSpark)).toBe(false);
    expect(meanRow(last)).toBeGreaterThan(meanRow(repair[0]!));
  });
});

describe("how long things show", () => {
  it("heal and repair are short enough to end soon after the work does", () => {
    expect(EFFECT_SECONDS.heal).toBeLessThanOrEqual(0.75);
    expect(EFFECT_SECONDS.repair).toBeLessThanOrEqual(0.75);
  });

  it("effects are over within a second, and marks stay much longer and fade at the end", () => {
    for (const s of Object.values(EFFECT_SECONDS)) expect(s).toBeLessThanOrEqual(1);
    for (const s of Object.values(MARK_SECONDS)) expect(s).toBeGreaterThan(MARK_FADE_SECONDS * 2);
  });
});
