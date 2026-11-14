import { describe, expect, it } from "vitest";
import type { PlayerId, UnitKind } from "../../sim";
import { ART } from "./artPalette";
import { type PixelBuffer, pixelAt } from "./pixelBuffer";
import { FACINGS } from "./buildingArt";
import { unitSprite } from "./spriteSheet";
import { HARVESTER_LOADS, paintUnit, UNIT_FRAMES, UNIT_SPRITE_PX, unitFrame } from "./unitArt";

const KINDS: readonly UnitKind[] = ["rifleman", "raider", "harvester"];
const TEAMS: readonly PlayerId[] = [0, 1];

const same = (a: PixelBuffer, b: PixelBuffer) => a.data.every((v, i) => v === b.data[i]);

/** Pixels of the sprite itself: the soft shadow under it is the only part that is not solid. */
function solid(buf: PixelBuffer): { x: number; y: number; colour: string }[] {
  const out: { x: number; y: number; colour: string }[] = [];
  for (let y = 0; y < buf.height; y++) {
    for (let x = 0; x < buf.width; x++) {
      if (buf.data[(y * buf.width + x) * 4 + 3] === 255) out.push({ x, y, colour: pixelAt(buf, x, y)! });
    }
  }
  return out;
}

const count = (buf: PixelBuffer, colours: readonly string[]) => solid(buf).filter((p) => colours.includes(p.colour)).length;

/** Where the pixels of some colours sit on average, from the sprite's middle. */
function centreOf(buf: PixelBuffer, colours: readonly string[]): { x: number; y: number } {
  const px = solid(buf).filter((p) => colours.includes(p.colour));
  const mid = (UNIT_SPRITE_PX - 1) / 2;
  return {
    x: px.reduce((s, p) => s + p.x - mid, 0) / px.length,
    y: px.reduce((s, p) => s + p.y - mid, 0) / px.length,
  };
}

function box(buf: PixelBuffer): { width: number; height: number } {
  const px = solid(buf);
  const xs = px.map((p) => p.x);
  const ys = px.map((p) => p.y);
  return { width: Math.max(...xs) - Math.min(...xs) + 1, height: Math.max(...ys) - Math.min(...ys) + 1 };
}

const ORE = [ART.ore.dark, ART.ore.mid, ART.ore.light];

describe("Unit sprites", () => {
  it("come in all 16 facings for both teams, every frame the same square size", () => {
    expect(FACINGS).toBe(16);
    for (const kind of KINDS) {
      for (const team of TEAMS) {
        const { frames, damaged } = unitSprite(kind, team);
        for (const sheet of [frames, damaged]) {
          expect(sheet).toHaveLength(16);
          for (const facing of sheet) {
            expect(facing).toHaveLength(UNIT_FRAMES[kind]);
            for (const f of facing) expect([f.width, f.height]).toEqual([UNIT_SPRITE_PX, UNIT_SPRITE_PX]);
          }
        }
      }
    }
  });

  it("look different in every facing", () => {
    for (const kind of KINDS) {
      const { frames } = unitSprite(kind, 0);
      expect(new Set(frames.map((f) => f[0]!.data.join())).size, kind).toBe(16);
    }
  });

  it("differ between the teams only where a pixel is in the team's colour, step for step", () => {
    const steps = ["dark", "mid", "light"] as const;
    for (const kind of KINDS) {
      const a = unitSprite(kind, 0);
      const b = unitSprite(kind, 1);
      for (const [sheetA, sheetB] of [[a.frames, b.frames], [a.damaged, b.damaged]] as const) {
        for (let facing = 0; facing < FACINGS; facing++) {
          for (let frame = 0; frame < UNIT_FRAMES[kind]; frame++) {
            const fa = sheetA[facing]![frame]!;
            const fb = sheetB[facing]![frame]!;
            let teamPixels = 0;
            for (let y = 0; y < fa.height; y++) {
              for (let x = 0; x < fa.width; x++) {
                const pa = pixelAt(fa, x, y);
                const step = steps.find((s) => ART.team[0][s] === pa);
                if (step) teamPixels++;
                expect(pixelAt(fb, x, y), `${kind} facing ${facing} frame ${frame} at ${x},${y}`).toBe(
                  step ? ART.team[1][step] : pa,
                );
              }
            }
            // Enough of it that the owner reads at a glance, even on the smallest Unit.
            expect(teamPixels, `${kind} facing ${facing} frame ${frame}`).toBeGreaterThanOrEqual(kind === "rifleman" ? 4 : 12);
          }
        }
      }
    }
  });

  it("come out the same every time they are painted", () => {
    for (const kind of KINDS) {
      for (const facing of [0, 3, 9]) {
        expect(same(paintUnit(kind, 1, facing, 1, false), paintUnit(kind, 1, facing, 1, false))).toBe(true);
        expect(same(paintUnit(kind, 0, facing, 0, true), paintUnit(kind, 0, facing, 0, true))).toBe(true);
      }
    }
  });

  it("are painted once and then handed out from the sheet", () => {
    expect(unitSprite("raider", 1)).toBe(unitSprite("raider", 1));
  });

  it("have silhouettes of their own: a tiny Rifleman, a mid-sized Raider and a bulky Harvester", () => {
    for (let facing = 0; facing < FACINGS; facing++) {
      const size = (kind: UnitKind) => solid(unitSprite(kind, 0).frames[facing]![0]!).length;
      expect(size("rifleman") * 2, `facing ${facing}`).toBeLessThan(size("raider"));
      expect(size("raider") * 1.25, `facing ${facing}`).toBeLessThan(size("harvester"));
    }
  });

  it("show damage as scorch marks on the same shape", () => {
    for (const kind of KINDS) {
      const { frames, damaged } = unitSprite(kind, 0);
      expect(count(frames[2]![0]!, [ART.scorch]), kind).toBe(0);
      expect(count(damaged[2]![0]!, [ART.scorch]), kind).toBeGreaterThan(0);
      expect(solid(damaged[2]![0]!).length).toBe(solid(frames[2]![0]!).length);
    }
  });
});

describe("vehicles", () => {
  it("are long the way they face: east at 0, south at 4", () => {
    for (const kind of ["raider", "harvester"] as const) {
      const { frames } = unitSprite(kind, 0);
      const east = box(frames[0]![0]!);
      const south = box(frames[4]![0]!);
      expect(east.width, kind).toBeGreaterThan(east.height);
      expect(south.height, kind).toBeGreaterThan(south.width);
    }
  });

  it("point their front along the facing, clockwise on screen: the Harvester's striped scoop leads", () => {
    const scoop = (facing: number) => centreOf(unitSprite("harvester", 0).frames[facing]![0]!, [ART.hazard.yellow]);
    expect(scoop(0).x).toBeGreaterThan(5);
    expect(Math.abs(scoop(0).y)).toBeLessThan(1);
    expect(scoop(4).y).toBeGreaterThan(5);
    expect(scoop(8).x).toBeLessThan(-5);
    expect(scoop(12).y).toBeLessThan(-5);
    expect(scoop(2).x).toBeGreaterThan(3);
    expect(scoop(2).y).toBeGreaterThan(3);
  });

  it("point the Raider's windscreen ahead of its gun mount", () => {
    const glass = (facing: number) => centreOf(unitSprite("raider", 0).frames[facing]![0]!, [ART.glass.mid, ART.glass.light, ART.glass.dark]);
    expect(glass(0).x).toBeGreaterThan(0.5);
    expect(glass(8).x).toBeLessThan(-0.5);
    expect(glass(4).y).toBeGreaterThan(0.5);
    expect(glass(12).y).toBeLessThan(-0.5);
  });
});

describe("which frame of a Unit's sprite shows", () => {
  it("stands a Rifleman still on frame 0 and steps him left, together, right, together as he walks", () => {
    expect(unitFrame("rifleman", null, 0)).toBe(0);
    expect([0, 1, 2, 3].map((phase) => unitFrame("rifleman", phase, 0))).toEqual([1, 0, 2, 0]);
    const { frames } = unitSprite("rifleman", 0);
    for (let facing = 0; facing < FACINGS; facing++) {
      const [stand, left, right] = frames[facing]!;
      expect(same(stand!, left!), `facing ${facing}`).toBe(false);
      expect(same(stand!, right!), `facing ${facing}`).toBe(false);
      expect(same(left!, right!), `facing ${facing}`).toBe(false);
    }
  });

  it("shows Ore in a Harvester's bin only when it is loaded, and more when it is full", () => {
    expect(HARVESTER_LOADS).toBe(3);
    for (let facing = 0; facing < FACINGS; facing++) {
      const ore = (load: number) => count(unitSprite("harvester", 0).frames[facing]![unitFrame("harvester", null, load)]!, ORE);
      expect(ore(0), `facing ${facing}`).toBe(0);
      expect(ore(1), `facing ${facing}`).toBeGreaterThan(3);
      expect(ore(2), `facing ${facing}`).toBeGreaterThan(ore(1) * 1.5);
    }
  });

  it("turns a vehicle's wheels and tracks between two frames as it drives", () => {
    for (const kind of ["raider", "harvester"] as const) {
      const still = unitFrame(kind, null, 0);
      const rolling = [0, 1, 2, 3].map((phase) => unitFrame(kind, phase, 0));
      expect(new Set(rolling).size, kind).toBe(2);
      expect(rolling).toContain(still);
      const { frames } = unitSprite(kind, 0);
      expect(same(frames[1]![rolling[0]!]!, frames[1]![rolling[1]!]!), kind).toBe(false);
    }
  });
});
