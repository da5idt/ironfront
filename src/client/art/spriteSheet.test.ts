import { describe, expect, it } from "vitest";
import { type BuildingKind, PLAYER_IDS } from "../../sim";
import { ART } from "./artPalette";
import { FACINGS, paintBuilding, paintDamage, paintTurretGun } from "./buildingArt";
import type { PixelBuffer } from "./pixelBuffer";
import { pixelAt } from "./pixelBuffer";
import { buildingSprite, damageSprite, loopFrame, TURRET_GUN_PX } from "./spriteSheet";

const KINDS: readonly BuildingKind[] = ["hq", "refinery", "barracks", "vehicleFactory", "turret"];

/** Footprints in Cells times the 12 art pixels a Cell takes. */
const SIZES: Record<BuildingKind, [number, number]> = {
  hq: [36, 36],
  refinery: [36, 24],
  barracks: [24, 24],
  vehicleFactory: [36, 36],
  turret: [12, 12],
};

const same = (a: PixelBuffer, b: PixelBuffer) =>
  a.width === b.width && a.height === b.height && a.data.every((v, i) => v === b.data[i]);

function count(buf: PixelBuffer, colours: readonly string[]): number {
  let n = 0;
  for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) if (colours.includes(pixelAt(buf, x, y) ?? "")) n++;
  return n;
}

/** Where the opaque pixels' centre lies, from the buffer's middle. */
function lean(buf: PixelBuffer): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < buf.height; y++) {
    for (let x = 0; x < buf.width; x++) {
      if (pixelAt(buf, x, y) === null) continue;
      sx += x - (buf.width - 1) / 2;
      sy += y - (buf.height - 1) / 2;
      n++;
    }
  }
  return { x: sx / n, y: sy / n };
}

describe("Building sprites", () => {
  it("are 12 art pixels per Cell of the footprint, in every frame, for both Players", () => {
    for (const kind of KINDS) {
      for (const owner of PLAYER_IDS) {
        const { frames, shadow } = buildingSprite(kind, owner);
        expect(frames.length).toBeGreaterThan(0);
        for (const f of [...frames, shadow]) expect([f.width, f.height], kind).toEqual(SIZES[kind]);
      }
    }
  });

  it("are all different from each other", () => {
    const stills = KINDS.map((k) => buildingSprite(k, 0).frames[0]!);
    for (let i = 0; i < stills.length; i++) {
      for (let j = i + 1; j < stills.length; j++) expect(same(stills[i]!, stills[j]!)).toBe(false);
    }
  });

  it("differ between the Players only where a pixel is in the Player's colour, step for step", () => {
    const steps = ["dark", "mid", "light"] as const;
    for (const kind of KINDS) {
      const a = buildingSprite(kind, 0);
      const b = buildingSprite(kind, 1);
      expect(b.frames.length).toBe(a.frames.length);
      let playerPixels = 0;
      for (const [f, fa] of a.frames.entries()) {
        const fb = b.frames[f]!;
        for (let y = 0; y < fa.height; y++) {
          for (let x = 0; x < fa.width; x++) {
            const pa = pixelAt(fa, x, y);
            const pb = pixelAt(fb, x, y);
            const step = steps.find((s) => ART.player[0][s] === pa);
            if (step) {
              expect(pb, `${kind} frame ${f} at ${x},${y}`).toBe(ART.player[1][step]);
              playerPixels++;
            } else expect(pb, `${kind} frame ${f} at ${x},${y}`).toBe(pa);
          }
        }
      }
      // Enough of it that the owner reads at a glance.
      expect(playerPixels / a.frames.length, kind).toBeGreaterThanOrEqual(kind === "turret" ? 4 : 30);
    }
  });

  it("come out the same every time they are painted", () => {
    for (const kind of KINDS) {
      for (const frame of [0, 1, 5]) expect(same(paintBuilding(kind, 1, frame), paintBuilding(kind, 1, frame))).toBe(true);
    }
    expect(same(paintTurretGun(0, 3), paintTurretGun(0, 3))).toBe(true);
    expect(same(paintDamage("hq", 4), paintDamage("hq", 4))).toBe(true);
  });

  it("are painted once and then handed out from the sheet", () => {
    expect(buildingSprite("hq", 0)).toBe(buildingSprite("hq", 0));
    expect(damageSprite("refinery")).toBe(damageSprite("refinery"));
  });

  it("move while idle: the frames of an HQ, Refinery, Vehicle Factory and Barracks are not all alike", () => {
    for (const kind of ["hq", "refinery", "vehicleFactory", "barracks"] as const) {
      const { frames } = buildingSprite(kind, 0);
      expect(frames.length, kind).toBeGreaterThanOrEqual(4);
      expect(new Set(frames.map((f) => f.data.join())).size, kind).toBeGreaterThanOrEqual(4);
    }
  });

  it("show lit windows", () => {
    for (const kind of ["hq", "refinery", "vehicleFactory", "barracks"] as const) {
      expect(count(buildingSprite(kind, 0).frames[0]!, [ART.windowLight.mid, ART.windowLight.light]), kind).toBeGreaterThan(0);
    }
  });
});

describe("Turret gun", () => {
  it("has one sprite per facing, all the same size and all different", () => {
    expect(FACINGS).toBe(16);
    const { gun } = buildingSprite("turret", 0);
    expect(gun).toHaveLength(16);
    for (const g of gun!) expect([g.width, g.height]).toEqual([TURRET_GUN_PX, TURRET_GUN_PX]);
    expect(new Set(gun!.map((g) => g.data.join())).size).toBe(16);
  });

  it("is only on the Turret", () => {
    expect(buildingSprite("hq", 0).gun).toBeNull();
  });

  it("points east at facing 0 and turns clockwise on screen: south at 4, west at 8, north at 12", () => {
    const gun = buildingSprite("turret", 1).gun!;
    const at = (facing: number) => lean(gun[facing]!);
    expect(at(0).x).toBeGreaterThan(1);
    expect(Math.abs(at(0).y)).toBeLessThan(0.5);
    expect(at(4).y).toBeGreaterThan(1);
    expect(at(8).x).toBeLessThan(-1);
    expect(at(12).y).toBeLessThan(-1);
    // Halfway between east and south.
    expect(at(2).x).toBeGreaterThan(0.5);
    expect(at(2).y).toBeGreaterThan(0.5);
  });
});

describe("damaged look", () => {
  it("has fire that flickers and thinning smoke over it, with room above the Building to rise into", () => {
    for (const kind of KINDS) {
      const { frames, rise } = damageSprite(kind);
      expect(rise).toBeGreaterThan(0);
      expect(new Set(frames.map((f) => f.data.join())).size, kind).toBeGreaterThanOrEqual(4);
      for (const f of frames) {
        expect(f.height).toBe(SIZES[kind][1] + rise);
        expect(f.width).toBeGreaterThanOrEqual(SIZES[kind][0]);
        expect(count(f, ART.fire), kind).toBeGreaterThan(0);
        let thin = 0;
        for (let i = 3; i < f.data.length; i += 4) if (f.data[i]! > 0 && f.data[i]! < 255) thin++;
        expect(thin, kind).toBeGreaterThan(0);
      }
    }
  });
});

describe("which frame of a loop shows", () => {
  it("steps at the loop's rate and wraps round", () => {
    expect(loopFrame(4, 8, 0)).toBe(0);
    expect(loopFrame(4, 8, 0.125)).toBe(1);
    expect(loopFrame(4, 8, 0.49)).toBe(3);
    expect(loopFrame(4, 8, 0.5)).toBe(0);
  });

  it("puts neighbours out of step by an offset, however large", () => {
    expect(loopFrame(4, 8, 0, 1)).toBe(1);
    expect(loopFrame(4, 8, 0, 4 * 1000 + 3)).toBe(3);
  });
});
