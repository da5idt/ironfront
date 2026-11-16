import { describe, expect, it } from "vitest";
import { PLAYER_IDS, UNIT_STATS, type UnitKind } from "../../sim";
import { ART } from "./artPalette";
import { type PixelBuffer, pixelAt } from "./pixelBuffer";
import { FACINGS } from "./buildingArt";
import { unitSprite } from "./spriteSheet";
import { HARVESTER_LOADS, paintUnit, UNIT_FRAMES, UNIT_SPRITE_PX, unitFrame } from "./unitArt";

const KINDS: readonly UnitKind[] = ["rifleman", "medic", "raider", "harvester", "troopCarrier"];

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
  it("come in all 16 facings for both Players, every frame the same square size", () => {
    expect(FACINGS).toBe(16);
    for (const kind of KINDS) {
      for (const owner of PLAYER_IDS) {
        const { frames, damaged } = unitSprite(kind, owner);
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

  it("differ between the Players only where a pixel is in the Player's colour, step for step", () => {
    const steps = ["dark", "mid", "light"] as const;
    for (const kind of KINDS) {
      const a = unitSprite(kind, 0);
      const b = unitSprite(kind, 1);
      for (const [sheetA, sheetB] of [[a.frames, b.frames], [a.damaged, b.damaged]] as const) {
        for (let facing = 0; facing < FACINGS; facing++) {
          for (let frame = 0; frame < UNIT_FRAMES[kind]; frame++) {
            const fa = sheetA[facing]![frame]!;
            const fb = sheetB[facing]![frame]!;
            let playerPixels = 0;
            for (let y = 0; y < fa.height; y++) {
              for (let x = 0; x < fa.width; x++) {
                const pa = pixelAt(fa, x, y);
                const step = steps.find((s) => ART.player[0][s] === pa);
                if (step) playerPixels++;
                expect(pixelAt(fb, x, y), `${kind} facing ${facing} frame ${frame} at ${x},${y}`).toBe(
                  step ? ART.player[1][step] : pa,
                );
              }
            }
            // Enough of it that the owner reads at a glance, even on the smallest Unit.
            expect(playerPixels, `${kind} facing ${facing} frame ${frame}`).toBeGreaterThanOrEqual(
              UNIT_STATS[kind].class === "infantry" ? 4 : 12,
            );
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

describe("the Medic", () => {
  const WARD = [ART.ward.dark, ART.ward.mid, ART.ward.light];
  const AID = [ART.aid.mark, ART.aid.shade];
  const KHAKI = [ART.khaki.dark, ART.khaki.mid, ART.khaki.light];
  const different = (a: PixelBuffer, b: PixelBuffer): number => {
    let n = 0;
    for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) if (pixelAt(a, x, y) !== pixelAt(b, x, y)) n++;
    return n;
  };

  it("is clearly not a Rifleman in either Player's colours: a pale coat with a green mark where he wears khaki, and no rifle", () => {
    for (const owner of PLAYER_IDS) {
      const medic = unitSprite("medic", owner);
      const rifleman = unitSprite("rifleman", owner);
      expect(UNIT_FRAMES.medic).toBe(3);
      for (let facing = 0; facing < FACINGS; facing++) {
        for (let frame = 0; frame < UNIT_FRAMES.medic; frame++) {
          const m = medic.frames[facing]![frame]!;
          const at = `Player ${owner} facing ${facing} frame ${frame}`;
          expect(count(m, WARD), at).toBeGreaterThanOrEqual(8);
          expect(count(m, AID), at).toBeGreaterThanOrEqual(2);
          expect(count(m, KHAKI), at).toBe(0);
          // Against every Rifleman frame of that facing, so no pose of one can pass for the other.
          for (const r of rifleman.frames[facing]!) {
            expect(count(r, [...WARD, ...AID]), at).toBe(0);
            expect(different(m, r), at).toBeGreaterThanOrEqual(12);
          }
        }
      }
    }
  });

  it("carries a satchel, not a rifle: nothing of the sprite reaches out along the facing", () => {
    for (let facing = 0; facing < FACINGS; facing++) {
      const medic = box(unitSprite("medic", 0).frames[facing]![0]!);
      expect(medic.width, `facing ${facing}`).toBeLessThanOrEqual(7);
      expect(medic.height, `facing ${facing}`).toBeLessThanOrEqual(11);
    }
    // The Rifleman's rifle sticks out sideways when he faces east.
    expect(box(unitSprite("rifleman", 0).frames[0]![0]!).width).toBeGreaterThan(7);
  });

  it("is Infantry-sized, far smaller than a Raider", () => {
    for (let facing = 0; facing < FACINGS; facing++) {
      const size = (kind: UnitKind) => solid(unitSprite(kind, 0).frames[facing]![0]!).length;
      expect(size("medic") * 2, `facing ${facing}`).toBeLessThan(size("raider"));
    }
  });

  it("shows which way it faces, and steps left, together, right, together as it walks", () => {
    expect(unitFrame("medic", null, 0)).toBe(0);
    expect([0, 1, 2, 3].map((phase) => unitFrame("medic", phase, 0))).toEqual([1, 0, 2, 0]);
    const { frames } = unitSprite("medic", 0);
    expect(new Set(frames.map((f) => f[0]!.data.join())).size).toBe(FACINGS);
    for (let facing = 0; facing < FACINGS; facing++) {
      const [stand, left, right] = frames[facing]!;
      expect(same(stand!, left!), `facing ${facing}`).toBe(false);
      expect(same(stand!, right!), `facing ${facing}`).toBe(false);
      expect(same(left!, right!), `facing ${facing}`).toBe(false);
    }
  });
});

describe("the Troop Carrier", () => {
  const KHAKI = [ART.khaki.dark, ART.khaki.mid, ART.khaki.light];
  const different = (a: PixelBuffer, b: PixelBuffer): number => {
    let n = 0;
    for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) if (pixelAt(a, x, y) !== pixelAt(b, x, y)) n++;
    return n;
  };
  const still = (kind: UnitKind, owner: 0 | 1, facing: number) => unitSprite(kind, owner).frames[facing]![unitFrame(kind, null, 0)]!;

  it("is clearly not a Raider or a Harvester in either Player's colours, whichever way it faces and whatever frame they show", () => {
    for (const owner of PLAYER_IDS) {
      for (let facing = 0; facing < FACINGS; facing++) {
        expect(unitSprite("troopCarrier", owner).frames[facing]).toHaveLength(2);
        for (const carrier of unitSprite("troopCarrier", owner).frames[facing]!) {
          for (const other of ["raider", "harvester"] as const) {
            for (const theirs of unitSprite(other, owner).frames[facing]!) {
              // More than half a Raider's worth of pixels: a different vehicle, not a detail.
              expect(different(carrier, theirs), `Player ${owner} facing ${facing} against the ${other}`).toBeGreaterThanOrEqual(60);
            }
          }
        }
      }
    }
  });

  it("is sized between the two: bigger than a Raider, smaller than a Harvester", () => {
    for (let facing = 0; facing < FACINGS; facing++) {
      const size = (kind: UnitKind) => solid(still(kind, 0, facing)).length;
      expect(size("raider") * 1.05, `facing ${facing}`).toBeLessThan(size("troopCarrier"));
      expect(size("troopCarrier") * 1.15, `facing ${facing}`).toBeLessThan(size("harvester"));
    }
  });

  it("is boxy: seen square on it fills its outline where the Raider's wedge and open wheels leave gaps", () => {
    for (const facing of [0, 4, 8, 12]) {
      const filled = (kind: UnitKind) => {
        const { width, height } = box(still(kind, 0, facing));
        return solid(still(kind, 0, facing)).length / (width * height);
      };
      expect(filled("troopCarrier"), `facing ${facing}`).toBeGreaterThan(0.9);
      expect(filled("raider"), `facing ${facing}`).toBeLessThan(filled("troopCarrier") - 0.04);
    }
  });

  it("wears its Player's colour on the hull and carries a khaki roll at the back, which neither other Vehicle has", () => {
    const PLAYER = [ART.player[0].dark, ART.player[0].mid, ART.player[0].light];
    for (let facing = 0; facing < FACINGS; facing++) {
      const carrier = still("troopCarrier", 0, facing);
      expect(count(carrier, PLAYER), `facing ${facing}`).toBeGreaterThanOrEqual(30);
      expect(count(carrier, KHAKI), `facing ${facing}`).toBeGreaterThanOrEqual(4);
      expect(count(still("raider", 0, facing), KHAKI)).toBe(0);
      expect(count(still("harvester", 0, facing), KHAKI)).toBe(0);
    }
    const roll = (facing: number) => centreOf(still("troopCarrier", 0, facing), KHAKI);
    expect(roll(0).x).toBeLessThan(-3);
    expect(roll(8).x).toBeGreaterThan(3);
    expect(roll(4).y).toBeLessThan(-3);
    expect(roll(12).y).toBeGreaterThan(3);
  });

  it("points its gun forward from a cupola near the front", () => {
    const barrel = (facing: number) => centreOf(still("troopCarrier", 0, facing), [ART.steelShine]);
    expect(barrel(0).x).toBeGreaterThan(3);
    expect(barrel(8).x).toBeLessThan(-3);
    expect(barrel(4).y).toBeGreaterThan(3);
    expect(barrel(12).y).toBeLessThan(-3);
  });

  it("stays inside its sprite with a clear pixel all round, so its outline and shadow are never cut off", () => {
    for (const { frames } of [unitSprite("troopCarrier", 0)]) {
      for (const facing of frames) {
        expect(facing).toHaveLength(2);
        for (const frame of facing) {
          expect(solid(frame).length).toBeGreaterThan(100);
          for (const p of solid(frame)) {
            expect(p.x > 0 && p.y > 0 && p.x < UNIT_SPRITE_PX - 1 && p.y < UNIT_SPRITE_PX - 1).toBe(true);
          }
        }
      }
    }
  });
});

describe("vehicles", () => {
  it("are long the way they face: east at 0, south at 4", () => {
    for (const kind of ["raider", "harvester", "troopCarrier"] as const) {
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
    for (const kind of ["raider", "harvester", "troopCarrier"] as const) {
      const still = unitFrame(kind, null, 0);
      const rolling = [0, 1, 2, 3].map((phase) => unitFrame(kind, phase, 0));
      expect(new Set(rolling).size, kind).toBe(2);
      expect(rolling).toContain(still);
      const { frames } = unitSprite(kind, 0);
      expect(same(frames[1]![rolling[0]!]!, frames[1]![rolling[1]!]!), kind).toBe(false);
    }
  });
});
