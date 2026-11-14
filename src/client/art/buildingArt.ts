import { BUILDING_STATS, type BuildingKind, type PlayerId } from "../../sim";
import { ART, type Ramp } from "./artPalette";
import { hash2 } from "./hash";
import { createPixelBuffer, type PixelBuffer } from "./pixelBuffer";
import { type Brush, brushOn, type Legend } from "./spriteTemplate";
import { ART_CELL_PX } from "./terrainArt";

// The five Buildings, painted in code (ADR 0003). Every one is seen the same
// way: roof from above, front wall facing the viewer, light from the top
// left. A Building fills its footprint at 12 art pixels per Cell. All frames
// are painted once at startup by the sprite sheet; nothing here runs per frame.

/** Ways a Unit or a Turret's gun can face: 0 is east, then clockwise on screen (4 south, 8 west, 12 north). */
export const FACINGS = 16;
/** Frames of idle animation shown per second of game time. */
export const BUILDING_FPS = 8;
/** Below this share of its health a Building smokes and burns. Presentation only, so not in the game's tuning table. */
export const DAMAGED_BELOW = 0.5;
/** How long a newly placed Building takes to rise from the ground. */
export const BUILD_UP_SECONDS = 0.9;
/** Side of the Turret gun's square sprite; its middle sits on the middle of the Turret's Cell. */
export const TURRET_GUN_PX = 20;
/** Where a Turret's gun points until something aims it: south-east. */
export const TURRET_REST_FACING = 2;
/** Art pixels of room above a Building for its smoke to rise into. */
export const SMOKE_RISE = 20;
/** Room to the right of a Building for its smoke to drift into. */
const SMOKE_DRIFT = 8;

/** Idle frames per kind; every moving part's cycle divides it, so the loop has no jump. */
export const IDLE_FRAMES: Readonly<Record<BuildingKind, number>> = {
  hq: 32,
  refinery: 16,
  barracks: 16,
  vehicleFactory: 32,
  turret: 8,
};
export const DAMAGE_FRAMES = 16;

const C = ART.concrete;
const K = C[0];
const { glass, windowLight, lamp, khaki, sandbag, tank, hazard, ore, fire, smoke } = ART;

/** The legend every template shares; D, T and L are the owner's team colour. */
function legendFor(team: Ramp): Legend {
  return {
    k: K,
    "1": C[1],
    "2": C[2],
    "3": C[3],
    "4": C[4],
    "5": C[5],
    "6": C[6],
    D: team.dark,
    T: team.mid,
    L: team.light,
    a: khaki.dark,
    b: khaki.mid,
    c: khaki.light,
    s: sandbag.dark,
    S: sandbag.mid,
    Z: sandbag.light,
  };
}

/** One idle frame of a Building in its owner's colours. */
export function paintBuilding(kind: BuildingKind, team: PlayerId, frame: number): PixelBuffer {
  const { width, height } = BUILDING_STATS[kind];
  const b = brushOn(createPixelBuffer(width * ART_CELL_PX, height * ART_CELL_PX));
  const f = ((frame % IDLE_FRAMES[kind]) + IDLE_FRAMES[kind]) % IDLE_FRAMES[kind];
  PAINTERS[kind](b, ART.team[team], f);
  return b.buf;
}

type Painter = (b: Brush, team: Ramp, frame: number) => void;

/** A concrete slab the size of the footprint, worn with a few darker and lighter flecks. */
function slab(b: Brush, w: number, h: number, salt: number): void {
  b.box(0, 0, w, h, C[3], C[5], C[2], K);
  for (let i = 0; i < (w * h) / 36; i++) {
    b.px(2 + Math.floor(hash2(i, salt, 1) * (w - 4)), 2 + Math.floor(hash2(salt, i, 2) * (h - 4)), hash2(i, i, salt) > 0.5 ? C[2] : C[4]);
  }
}

function litWindow(b: Brush, x: number, y: number, on = true): void {
  b.rect(x, y, 2, 2, on ? windowLight.mid : windowLight.dark);
  if (on) b.px(x, y, windowLight.light);
}

const FAN_PLUS = ["..55..", "..55..", "55kk55", "55kk55", "..55..", "..55.."];
const FAN_CROSS = ["5....5", ".5..5.", "..kk..", "..kk..", ".5..5.", "5....5"];

/** A roof fan in its housing, 8 by 8; the blades swap between two positions each frame, which reads as spin. */
function bigFan(b: Brush, x: number, y: number, phase: number, legend: Legend): void {
  b.box(x, y, 8, 8, C[5], C[6], C[3], K);
  b.rect(x + 1, y + 1, 6, 6, C[2]);
  b.grid(x + 1, y + 1, phase % 2 ? FAN_CROSS : FAN_PLUS, legend);
}

/** The small cooling unit, 6 by 6. */
function smallFan(b: Brush, x: number, y: number, phase: number): void {
  b.box(x, y, 6, 6, C[5], C[6], C[3], K);
  b.rect(x + 1, y + 1, 4, 4, C[2]);
  const blades = phase % 2
    ? [[2, 1], [3, 4], [1, 3], [4, 2]]
    : [[1, 1], [4, 1], [1, 4], [4, 4]];
  for (const [dx, dy] of blades) b.px(x + dx!, y + dy!, C[5]);
  b.rect(x + 2, y + 2, 2, 2, K);
}

const CHEVRON = ["...L...", "..LLT..", ".LL.TT.", "LL...TT", ".......", ".LLTTT."];

/**
 * HQ: a long command hall with the team emblem, a cooling fan and a vehicle
 * door, beside a taller tower with a turning radar dish, a blinking mast and
 * a lit operations room.
 */
const paintHq: Painter = (b, t, f) => {
  const L = legendFor(t);
  slab(b, 36, 36, 40);
  b.px(1, 34, lamp.flood);
  b.px(34, 34, lamp.flood);

  // Command hall roof.
  b.box(3, 4, 20, 24, C[4], C[6], C[3], K);
  for (const y of [11, 18, 24]) {
    b.rect(5, y, 16, 1, C[3]);
    b.rect(5, y + 1, 16, 1, C[5]);
  }
  // Shade where the hall meets the taller tower.
  b.rect(21, 5, 1, 22, C[2]);
  b.box(6, 8, 9, 9, t.dark, t.mid, t.dark, K);
  b.grid(7, 10, CHEVRON, L);
  smallFan(b, 16, 6, f);
  for (let x = 6; x < 14; x += 2) b.rect(x, 20, 1, 3, C[2]);
  b.box(16, 19, 4, 4, C[3], C[5], C[2], K);
  // Roof-edge rail posts along the hall's left side.
  for (const y of [7, 13, 21]) b.px(4, y, C[6]);

  // Hall front wall.
  b.rect(3, 28, 20, 7, K);
  b.rect(4, 28, 18, 6, C[3]);
  b.rect(4, 28, 18, 1, t.mid);
  b.rect(4, 29, 18, 1, C[2]);
  litWindow(b, 5, 30);
  litWindow(b, 19, 30);
  b.rect(9, 30, 8, 4, K);
  b.rect(9, 30, 8, 1, t.dark);
  for (let x = 10; x < 16; x += 2) b.rect(x, 31, 1, 3, C[1]);
  b.px(8, 30, lamp.flood);
  b.px(17, 30, lamp.flood);

  // Tower roof.
  b.box(23, 2, 11, 21, C[5], C[6], C[4], K);
  for (const y of [15, 18]) b.rect(25, y, 7, 1, C[4]);
  // The radar dish: an ellipse seen edge-on from above, turning once per loop.
  b.box(25, 5, 7, 7, C[3], C[4], C[2], K);
  const a = (f / IDLE_FRAMES.hq) * Math.PI * 2;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  for (let py = -4; py <= 4; py++) {
    for (let px = -4; px <= 4; px++) {
      const u = (px * dx + py * dy) / 3.4;
      const v = (-px * dy + py * dx) / 1.7;
      const d = u * u + v * v;
      if (d <= 1) b.px(28 + px, 8 + py, d > 0.55 ? C[5] : -px * dy + py * dx < 0 ? ART.steelShine : C[6]);
    }
  }
  b.px(28 - dy * 2, 8 + dx * 2, t.light);
  b.px(28, 8, C[3]);
  // Mast with a blinking light.
  b.rect(30, 15, 3, 2, K);
  b.rect(31, 12, 1, 4, C[2]);
  b.px(31, 11, Math.floor(f / 4) % 2 ? lamp.redOn : lamp.redOff);
  b.rect(25, 20, 3, 1, t.mid);

  // Tower front wall with the operations room.
  b.rect(23, 23, 11, 12, K);
  b.rect(24, 23, 9, 11, C[3]);
  b.rect(24, 23, 9, 1, t.mid);
  b.rect(24, 24, 9, 1, C[2]);
  b.rect(25, 26, 7, 3, glass.dark);
  // Screens flickering behind the glass.
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 2; j++) b.px(25 + i, 27 + j, hash2(i + j * 7, Math.floor(f / 2), 5) > 0.45 ? glass.light : glass.mid);
  }
  b.rect(26, 30, 5, 4, K);
  b.rect(26, 30, 5, 1, t.dark);
  b.px(28, 32, lamp.flood);
};

const STACK = [".kkkk.", "k6655k", "k6..4k", "k5..4k", "k5443k", "k6543k", "k6543k", "k6543k", ".kkkk."];

/**
 * Refinery: a copper storage tank piped into a processing hall with a glowing
 * stack, an Ore hopper in the roof and an unloading bay with a running belt.
 */
const paintRefinery: Painter = (b, t, f) => {
  const L = legendFor(t);
  slab(b, 36, 24, 41);

  // The tank: a cylinder seen from above and in front, so its top is a disc and its wall a band below.
  const cx = 8.5;
  const topY = 7.5;
  const botY = 12.5;
  const inBody = (x: number, y: number, r: number) =>
    Math.hypot(x - cx, y - topY) <= r || Math.hypot(x - cx, y - botY) <= r || (Math.abs(x - cx) <= r && y >= topY && y <= botY);
  for (let y = 0; y < 22; y++) {
    for (let x = 0; x < 18; x++) {
      if (!inBody(x, y, 7.5)) continue;
      const dTop = Math.hypot(x - cx, y - topY);
      let colour: string = K;
      if (dTop <= 6.5) {
        const lit = x - cx + (y - topY);
        colour = lit < -4 ? tank.light : lit > 4.5 ? tank.dark : tank.mid;
      } else if (dTop > 7.5 && inBody(x, y, 6.5)) {
        // A band in the owner's colour runs round the wall, following its curve.
        const band = Math.hypot(x - cx, y - (topY + 3.2)) <= 6.5 && Math.hypot(x - cx, y - (topY + 1.2)) > 6.5;
        const ramp = band ? t : tank;
        colour = x <= 3 ? ramp.light : x <= 10 ? ramp.mid : ramp.dark;
      }
      b.px(x, y, colour);
    }
  }
  // Rivets round the lid, a walkway and the hatch with its warning lamp.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    b.px(cx + Math.cos(a) * 5, topY + Math.sin(a) * 5, i < 4 ? tank.dark : tank.light);
  }
  b.rect(11, 7, 4, 1, C[2]);
  b.rect(11, 8, 4, 1, C[5]);
  b.box(7, 6, 4, 4, C[3], C[5], C[2], K);
  b.px(9, 8, Math.floor(f / 4) % 2 ? lamp.amberOn : lamp.amberOff);

  // Pipe from the tank into the hall.
  b.rect(15, 9, 5, 4, K);
  b.rect(15, 10, 5, 1, C[6]);
  b.rect(15, 11, 5, 1, C[4]);
  b.rect(17, 9, 1, 4, K);

  // Processing hall roof.
  b.box(19, 2, 16, 14, C[4], C[6], C[3], K);
  // The stack stands tall at the back, with a furnace glow that swells and fades and a wisp of smoke.
  b.grid(20, 2, STACK, L);
  const glow = [1, 2, 3, 2][Math.floor(f / 2) % 4]!;
  b.rect(22, 4, 2, 2, fire[glow]!);
  b.px(22, 4, fire[Math.min(3, glow + 1)]!);
  const puff = f % 8;
  b.px(22 + (puff >> 2), 1 - (puff >> 1), smoke[3], 220 - puff * 22);
  b.rect(26, 5, 2, 1, C[6]);
  b.rect(26, 6, 2, 1, C[2]);
  smallFan(b, 28, 3, f);
  // The Ore hopper, heaped, under a rim in the owner's colour.
  b.box(21, 10, 13, 5, t.mid, t.light, t.dark, K);
  b.rect(22, 11, 11, 3, K);
  for (let y = 11; y < 14; y++) {
    for (let x = 23; x < 32; x++) {
      const n = hash2(x, y, 9);
      b.px(x, y, n > 0.8 ? ore.light : n > 0.45 ? ore.mid : n > 0.15 ? ore.dark : ore.shadow);
    }
  }

  // Hall front wall and the unloading bay.
  b.rect(19, 15, 16, 7, K);
  b.rect(20, 15, 14, 6, C[3]);
  b.rect(20, 15, 14, 1, t.mid);
  b.rect(20, 16, 14, 1, C[2]);
  b.rect(23, 17, 9, 4, K);
  for (let x = 23; x < 32; x++) b.px(x, 17, (x >> 1) & 1 ? hazard.yellow : hazard.black);
  b.rect(23, 20, 9, 1, C[1]);
  for (let x = 23; x < 32; x += 2) b.px(x + (Math.floor(f / 2) % 2), 20, C[2]);
  // Ore riding the belt out of the bay.
  for (let i = 0; i < 3; i++) b.px(23 + ((i * 3 + Math.floor(f / 2)) % 8), 19, i === 0 ? ore.light : ore.mid);
  litWindow(b, 20, 18);
  b.px(33, 17, lamp.flood);
  for (const [x, colour] of [[24, ore.mid], [27, ore.dark], [30, ore.light], [21, ore.dark]] as const) b.px(x, 22, colour);
};

const CRATES = ["aaaa.aaa", "accb.acb", "acbb.abb", "akkk.akk"];
const SANDBAGS = [".ZZS.ZZS.ZZS", "kZSskZSskZSs", ".kkk.kkk.kkk"];

/** A hut with a pitched khaki roof (ridge running back from the viewer) and a band in the owner's colour. */
function hut(b: Brush, t: Ramp, x: number, y: number, w: number, roofH: number, bandY: number, doorX: number): void {
  const ridge = x + Math.floor(w / 2);
  b.rect(x, y, w, roofH, K);
  b.rect(x + 1, y + 1, ridge - x - 1, roofH - 1, khaki.mid);
  b.rect(ridge + 1, y + 1, x + w - ridge - 2, roofH - 1, khaki.dark);
  b.rect(ridge, y + 1, 1, roofH - 1, khaki.light);
  b.rect(x + 1, y + 1, ridge - x - 1, 1, khaki.light);
  // Seams in the canvas show on the lit slope only; the shaded one stays calm.
  for (let ry = y + 4; ry < y + roofH - 1; ry += 3) b.rect(x + 1, ry, ridge - x - 1, 1, khaki.dark);
  b.rect(x + 1, bandY, ridge - x - 1, 2, t.mid);
  b.rect(ridge + 1, bandY, x + w - ridge - 2, 2, t.dark);
  b.rect(ridge, bandY, 1, 2, t.light);
  // Front wall, with the eave's shadow along its top.
  const wy = y + roofH;
  b.rect(x, wy, w, 6, K);
  b.rect(x + 1, wy, w - 2, 5, C[4]);
  b.rect(x + 1, wy, w - 2, 1, C[2]);
  b.rect(x + 1, wy + 4, w - 2, 1, C[3]);
  b.rect(doorX, wy + 1, 3, 4, K);
  b.rect(doorX, wy + 1, 3, 1, t.dark);
}

/**
 * Barracks: two khaki-roofed huts in a yard of packed earth, with crates, a
 * wall of sandbags and the owner's flag flying from a pole.
 */
const paintBarracks: Painter = (b, t, f) => {
  const L = legendFor(t);
  // The yard: packed earth with a ragged edge, so it sits in the ground rather than on it.
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 24; x++) {
      const edge = x === 0 || x === 23 || y === 0 || y === 23;
      const corner = (x < 2 || x > 21) && (y < 2 || y > 21);
      if (corner || (edge && hash2(x, y, 31) < 0.4)) continue;
      const n = hash2(x, y, 32);
      b.px(x, y, n > 0.97 ? ART.pebble.light : ART.packedEarth[Math.floor(n * 3)]!);
    }
  }
  hut(b, t, 1, 1, 11, 11, 7, 5);
  litWindow(b, 2, 14);
  litWindow(b, 9, 14);
  b.px(6, 12, lamp.flood);
  hut(b, t, 13, 1, 10, 11, 8, 18);
  litWindow(b, 15, 14);

  b.grid(1, 21, SANDBAGS, L);
  b.grid(15, 19, CRATES, L);
  // Footpaths worn from the doors across the yard.
  for (const [x, y] of [[6, 18], [6, 19], [7, 20], [19, 18], [13, 19], [13, 21], [12, 22]] as const) b.px(x, y, ART.packedEarth[2]);

  // The flagpole stands in the gap between the huts; the flag ripples along its length.
  b.rect(12, 2, 1, 16, C[6]);
  b.px(12, 18, K);
  b.px(12, 1, Math.floor(f / 4) % 2 ? lamp.redOn : lamp.redOff);
  const phase = Math.floor(f / 2) % 4;
  for (let col = 0; col < 6; col++) {
    const dip = (col + 4 - phase) % 4 < 2 ? 0 : 1;
    b.px(13 + col, 1 + dip, K);
    b.px(13 + col, 2 + dip, t.light);
    b.px(13 + col, 3 + dip, t.mid);
    b.px(13 + col, 4 + dip, t.dark);
    b.px(13 + col, 5 + dip, K);
  }
  b.px(19, 3 + ((2 + 4 - phase) % 4 < 2 ? 0 : 1), K);
};

const EXHAUSTS = ["kkk.kkk", "k1k.k1k", "kkk.kkk"];

/**
 * Vehicle Factory: an assembly hall under a saw-tooth roof of skylights (with
 * welding flashes showing through), a yellow gantry crane riding over it, two
 * big roof fans, and a wide roller door between hazard-striped pillars with
 * running lights over it.
 */
const paintVehicleFactory: Painter = (b, t, f) => {
  const L = legendFor(t);
  slab(b, 36, 36, 42);
  b.box(1, 1, 34, 24, C[4], C[6], C[3], K);

  // Saw-tooth roof: each tooth is a lit ridge, a strip of glass and the shadow it casts on the next.
  for (const [tooth, y0] of [3, 8, 13, 18].entries()) {
    b.rect(3, y0, 21, 1, C[6]);
    b.rect(3, y0 + 1, 21, 2, glass.mid);
    b.rect(3, y0 + 3, 21, 1, glass.dark);
    b.rect(3, y0 + 4, 21, 1, tooth === 3 ? C[3] : C[2]);
    for (let x = 3; x < 24; x++) {
      if (hash2(x, tooth, 7) > 0.8) b.px(x, y0 + 1, glass.light);
    }
    for (let x = 3; x <= 23; x += 5) b.rect(x, y0 + 1, 1, 3, C[3]);
  }
  // A welder at work under the glass: a flash that jumps from bay to bay.
  const weld = Math.floor(f / 8);
  if (f % 8 < 3) {
    const wx = 5 + ((weld * 7) % 17);
    const wy = [3, 13, 8, 18][weld % 4]! + 2;
    b.px(wx, wy, ART.weldSpark);
    if (f % 8 === 1) {
      b.px(wx - 1, wy, glass.light);
      b.px(wx + 1, wy, glass.light);
      b.px(wx, wy - 1, ART.weldSpark);
    }
  }

  // A gantry crane rides the roof slowly from back to front and home again, its trolley working along the beam.
  const there = f < 16 ? f : 32 - f;
  const craneY = 4 + Math.round(there * 0.9);
  b.rect(2, craneY, 23, 1, hazard.yellow);
  b.rect(2, craneY + 1, 23, 1, ore.dark);
  b.rect(2, craneY - 1, 2, 4, K);
  b.rect(23, craneY - 1, 2, 4, K);
  const trolley = 6 + Math.round((f % 16 < 8 ? f % 16 : 16 - (f % 16)) * 1.5);
  b.rect(trolley, craneY - 1, 4, 4, K);
  b.rect(trolley + 1, craneY, 2, 2, C[5]);
  b.px(trolley + 1, craneY, C[6]);

  // Service strip down the right of the roof: fans and exhausts.
  b.rect(25, 2, 1, 22, C[2]);
  bigFan(b, 26, 2, f, L);
  bigFan(b, 26, 11, f + 1, L);
  b.grid(26, 20, EXHAUSTS, L);
  b.px(33, 21, Math.floor(f / 4) % 2 ? lamp.redOn : lamp.redOff);
  // The roof's front edge in the owner's colour.
  b.rect(2, 23, 23, 1, t.mid);
  b.rect(2, 23, 1, 1, t.light);

  // Front wall.
  b.rect(1, 24, 34, 9, K);
  b.rect(2, 25, 32, 7, C[3]);
  b.rect(2, 25, 32, 1, t.mid);
  b.rect(2, 26, 32, 1, C[2]);
  // Roller door, part open on the dark hall and a waiting vehicle's lamps.
  b.rect(8, 27, 20, 5, K);
  b.rect(8, 27, 20, 1, t.dark);
  b.rect(8, 28, 20, 1, C[2]);
  b.rect(8, 29, 20, 1, C[1]);
  b.px(14, 31, lamp.flood);
  b.px(21, 31, lamp.flood);
  for (const x0 of [6, 28]) {
    for (let y = 27; y < 32; y++) for (let x = x0; x < x0 + 2; x++) b.px(x, y, (x + y) % 4 < 2 ? hazard.yellow : hazard.black);
  }
  // Running lights over the door.
  const lit = Math.floor(f / 2) % 4;
  for (let i = 0; i < 4; i++) b.rect(10 + i * 5, 26, 2, 1, i === lit ? lamp.amberOn : lamp.amberOff);
  litWindow(b, 3, 28);
  b.rect(31, 28, 2, 4, K);
  b.px(31, 27, lamp.flood);

  // Apron: guide lines and tyre marks.
  b.rect(7, 33, 1, 2, hazard.yellow);
  b.rect(28, 33, 1, 2, hazard.yellow);
  for (const x of [12, 13, 22, 23]) b.rect(x, 33, 1, 2, C[2]);
};

/** Turret: a round concrete emplacement with a sunken ring for the gun, which is a sprite of its own. */
const paintTurret: Painter = (b, t, f) => {
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      const d = Math.hypot(x - 5.5, y - 5.5);
      if (d > 6.1) continue;
      let colour: string = K;
      if (d <= 3) colour = C[2];
      else if (d <= 3.9) colour = K;
      else if (d <= 5.1) colour = x + y <= 7 ? C[5] : x + y >= 15 ? C[3] : C[4];
      b.px(x, y, colour);
    }
  }
  // Marks in the owner's colour at the four compass points.
  b.rect(5, 1, 2, 1, t.light);
  b.rect(1, 5, 1, 2, t.mid);
  b.rect(10, 5, 1, 2, t.dark);
  b.rect(5, 10, 2, 1, t.dark);
  b.px(2, 2, C[6]);
  b.px(9, 2, C[2]);
  b.px(2, 9, C[2]);
  b.px(9, 9, Math.floor(f / 4) % 2 ? lamp.redOn : lamp.redOff);
};

const PAINTERS: Readonly<Record<BuildingKind, Painter>> = {
  hq: paintHq,
  refinery: paintRefinery,
  barracks: paintBarracks,
  vehicleFactory: paintVehicleFactory,
  turret: paintTurret,
};

/** The Turret's gun, a domed head and a barrel, facing one of the 16 ways. */
export function paintTurretGun(team: PlayerId, facing: number): PixelBuffer {
  const t = ART.team[team];
  const b = brushOn(createPixelBuffer(TURRET_GUN_PX, TURRET_GUN_PX));
  const mid = TURRET_GUN_PX / 2 - 0.5;
  const a = (facing / FACINGS) * Math.PI * 2;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  // The barrel is two pixel rows side by side, so it stays centred on a middle that falls between pixels.
  const core: { x: number; y: number; lit: boolean }[] = [];
  for (const side of [-0.5, 0.5]) {
    const ox = -dy * side;
    const oy = dx * side;
    for (let r = 2; r <= 7; r += 0.5) {
      core.push({ x: Math.floor(mid + 0.5 + dx * r + ox), y: Math.floor(mid + 0.5 + dy * r + oy), lit: ox + oy < 0 });
    }
  }
  for (const p of core) b.rect(p.x - 1, p.y - 1, 3, 3, K);
  for (const p of core) if (!p.lit) b.px(p.x, p.y, C[4]);
  for (const p of core) if (p.lit) b.px(p.x, p.y, C[6]);
  b.disc(mid, mid, 3, K);
  b.rect(mid - 1.5, mid - 1.5, 4, 4, t.mid);
  b.rect(mid + 0.5, mid + 1.5, 2, 1, t.dark);
  b.px(mid + 1.5, mid + 0.5, t.dark);
  b.rect(mid - 1.5, mid - 1.5, 2, 1, t.light);
  b.px(mid - 1.5, mid - 0.5, t.light);
  return b.buf;
}

const FLAME_LEGEND: Legend = { r: fire[0], o: fire[1], y: fire[2], w: fire[3] };
const FLAMES = [
  [".r..", ".or.", "oyo.", "oywo", "ryyr"],
  ["..r.", ".oo.", ".oyo", "oywo", "ryyr"],
  [".r..", "ro..", "oyo.", "owyo", "ryyr"],
  ["..r.", "..or", ".oyo", "oywo", "ryyr"],
];

interface DamageSpots {
  /** Where it burns, in the Building's own pixels. */
  readonly fires: readonly (readonly [number, number])[];
  readonly cracks: readonly (readonly [number, number, number, number])[];
}

const DAMAGE: Readonly<Record<BuildingKind, DamageSpots>> = {
  hq: {
    fires: [[13, 14], [28, 19]],
    cracks: [[6, 25, 11, 21], [11, 21, 13, 23], [24, 17, 28, 20], [5, 13, 3, 16]],
  },
  refinery: { fires: [[8, 8], [26, 7]], cracks: [[3, 5, 6, 9], [22, 9, 25, 6], [31, 13, 33, 10]] },
  barracks: { fires: [[5, 6], [18, 10]], cracks: [[3, 3, 5, 5], [16, 8, 20, 13]] },
  vehicleFactory: { fires: [[12, 10], [29, 15]], cracks: [[5, 5, 10, 9], [14, 16, 20, 19], [27, 12, 31, 17]] },
  turret: { fires: [[3, 3]], cracks: [[7, 2, 9, 4]] },
};

/**
 * One frame of a damaged Building's cracks, scorch, fire and smoke, to lay
 * over its sprite. The buffer is taller and wider than the Building, as the
 * smoke rises SMOKE_RISE above it; lay it SMOKE_RISE higher than the sprite.
 */
export function paintDamage(kind: BuildingKind, frame: number): PixelBuffer {
  const { width, height } = BUILDING_STATS[kind];
  const b = brushOn(createPixelBuffer(width * ART_CELL_PX + SMOKE_DRIFT, height * ART_CELL_PX + SMOKE_RISE));
  const f = ((frame % DAMAGE_FRAMES) + DAMAGE_FRAMES) % DAMAGE_FRAMES;
  const { fires, cracks } = DAMAGE[kind];
  const blot = kind === "turret" ? 1.6 : 3;
  for (const [x0, y0, x1, y1] of cracks) b.line(x0, y0 + SMOKE_RISE, x1, y1 + SMOKE_RISE, K);
  for (const [n, [fx, fy0]] of fires.entries()) {
    const fy = fy0 + SMOKE_RISE;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dy * dy <= blot * blot && hash2(dx + 20, dy, n) > 0.25) b.px(fx + dx, fy + dy, hash2(dx, dy + 20, n) > 0.5 ? smoke[0] : smoke[1]);
      }
    }
    // Smoke first, so the flames show through its foot: puffs that swell and thin as they rise.
    // Each depends only on its place in the loop, so the loop has no jump.
    const puffs = kind === "turret" ? 7 : 12;
    for (let i = 0; i < puffs; i++) {
      const ph = (f / DAMAGE_FRAMES + i / puffs + n * 0.37) % 1;
      const x = fx + Math.sin(i * 2.3 + ph * Math.PI * 2) * 1.5 + ph * 5;
      const y = fy - 3 - ph * (SMOKE_RISE - 4);
      const colour = smoke[Math.min(3, Math.floor(ph * 3.2))]!;
      const alpha = Math.round((1 - ph * 0.6) * 250);
      const r = 0.8 + ph * (kind === "turret" ? 1.8 : 2.8);
      for (let sy = -3; sy <= 3; sy++) {
        for (let sx = -3; sx <= 3; sx++) if (sx * sx + sy * sy <= r * r) b.px(x + sx, y + sy, colour, alpha);
      }
    }
    // A flame that changes shape four times a loop.
    b.grid(fx - 1, fy - 4, FLAMES[(f + n) % FLAMES.length]!, FLAME_LEGEND);
  }
  return b.buf;
}
