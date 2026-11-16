import { type PlayerId, UNIT_STATS, type UnitKind } from "../../sim";
import { ART, type Ramp } from "./artPalette";
import { FACINGS } from "./buildingArt";
import { hash2 } from "./hash";
import { createPixelBuffer, type PixelBuffer, pixelAt, setPixel } from "./pixelBuffer";

// The Units, painted in code (ADR 0003), in the Buildings' style: dark
// outlines, three-step ramps, light from the top left. The Vehicles are
// built from blocks in the vehicle's own space and turned to each facing, so
// the light stays put while the vehicle turns under it. Infantry stand
// upright in every facing: the Rifleman shows the way he faces with his rifle
// and face, the Medic with its face and the satchel it carries in front, the
// Mechanic with its face and the tool in its hand.
// Painted once at startup by the sprite sheet; nothing here runs per frame.

/** Side of every Unit's square sprite; its middle sits on the Unit's position. */
export const UNIT_SPRITE_PX = 20;
/** How full a Harvester's bin can look: empty, part full, full. */
export const HARVESTER_LOADS = 3;
/** Cells a Unit covers per step of its walk or wheel cycle. */
export const STEP_CELLS = 0.15;
/** Steps in the cycle: Infantry go left, together, right, together. */
export const STEP_PHASES = 4;
/** Two tread positions are enough for wheels and tracks to read as turning. */
const WHEEL_FRAMES = 2;

const ON_FOOT_STAND = 0;
const ON_FOOT_CYCLE = [1, ON_FOOT_STAND, 2, ON_FOOT_STAND] as const;
/** A stand and two strides. */
const ON_FOOT_FRAMES = 3;

/** Frames per facing: a stand and two strides on foot; a Raider's wheels; a Harvester's tracks for each load. */
export const UNIT_FRAMES: Readonly<Record<UnitKind, number>> = {
  rifleman: ON_FOOT_FRAMES,
  medic: ON_FOOT_FRAMES,
  mechanic: ON_FOOT_FRAMES,
  raider: WHEEL_FRAMES,
  harvester: HARVESTER_LOADS * WHEEL_FRAMES,
};

/**
 * Which frame shows. `phase` is how far through its step cycle a moving Unit
 * is (0..STEP_PHASES - 1), or null when it stands; `load` is a Harvester's.
 */
export function unitFrame(kind: UnitKind, phase: number | null, load: number): number {
  switch (kind) {
    case "rifleman":
    case "medic":
    case "mechanic":
      return phase === null ? ON_FOOT_STAND : ON_FOOT_CYCLE[phase % STEP_PHASES]!;
    case "raider":
      return phase === null ? 0 : phase % WHEEL_FRAMES;
    case "harvester":
      return load * WHEEL_FRAMES + (phase === null ? 0 : phase % WHEEL_FRAMES);
  }
}

const C = ART.concrete;
const K = C[0];
const { glass, khaki, hazard, ore, smoke, skin, ward, aid, hardHat, overalls } = ART;

/** How dark the shadow a Unit casts on the ground is (0..255). */
const SHADOW_ALPHA = 90;
/** Share of a damaged Unit's pixels that are scorched black, and that are sooted. */
const SCORCHED = 0.1;
const SOOTED = 0.24;

const flat = (colour: string): Ramp => ({ dark: colour, mid: colour, light: colour });
const STEEL: Ramp = { dark: C[2], mid: C[4], light: C[6] };
const DECK: Ramp = { dark: C[1], mid: C[3], light: C[5] };
const GUNMETAL: Ramp = { dark: K, mid: C[2], light: C[4] };
const TYRE_A: Ramp = { dark: K, mid: C[1], light: C[2] };
const TYRE_B: Ramp = { dark: C[1], mid: C[2], light: C[3] };
const HOLD: Ramp = { dark: K, mid: C[1], light: C[1] };

/** One block of a vehicle, in the vehicle's own space: x runs forward from its middle, y to its right, in art pixels. */
interface Part {
  /** Height off the ground; a higher block hides a lower one and catches the light on its top-left edges. */
  readonly z: number;
  has(x: number, y: number): boolean;
  /** The block's colours, which may change across it (treads, heaped Ore). */
  ramp(x: number, y: number): Ramp;
}

const block = (z: number, x0: number, x1: number, halfWidth: number, ramp: Ramp): Part => ({
  z,
  has: (x, y) => x >= x0 && x <= x1 && Math.abs(y) <= halfWidth,
  ramp: () => ramp,
});

/** Treads that shift half a pitch between the two wheel frames. */
const treads = (roll: number) => (x: number): Ramp => (Math.floor(x + 20 + roll) % 2 === 0 ? TYRE_A : TYRE_B);

/** Raider: a low wedge on four open wheels, with a gun on a ring mount behind the windscreen. */
function raiderParts(colours: Ramp, roll: number): Part[] {
  const tread = treads(roll);
  return [
    {
      z: 0,
      // The tyres stand just proud of the body: enough to show as wheels, not enough to break the wedge.
      has: (x, y) => ((x >= -5.8 && x <= -2.4) || (x >= 1.8 && x <= 5.2)) && Math.abs(y) >= 2.4 && Math.abs(y) <= 4,
      ramp: tread,
    },
    // The body narrows to the nose, which is what makes it read as fast.
    { z: 1, has: (x, y) => x >= -6.2 && x <= 6.8 && Math.abs(y) <= 3.1 - Math.max(0, x - 2.2) * 0.42, ramp: () => colours },
    block(2, -5.2, -0.4, 2.1, DECK),
    block(2, 0.2, 2.2, 2.2, glass),
    { z: 3, has: (x, y) => (x + 2.8) ** 2 + y ** 2 <= 1.8 ** 2, ramp: () => GUNMETAL },
  ];
}

/** Harvester: a heavy tracked hull, an open bin behind the cab and a striped scoop across the front. */
function harvesterParts(colours: Ramp, roll: number, load: number): Part[] {
  const tread = treads(roll);
  const heap = (x: number, y: number): Ramp => {
    const h = hash2(Math.floor(x + 20), Math.floor(y + 20), 61);
    return flat(h < 0.3 ? ore.light : h < 0.55 ? ore.dark : ore.mid);
  };
  const inHold = (x: number, y: number) => x >= -5.3 && x <= 0.8 && Math.abs(y) <= 2.6;
  const parts: Part[] = [
    { z: 0, has: (x, y) => x >= -7.2 && x <= 6.4 && Math.abs(y) >= 3 && Math.abs(y) <= 5.2, ramp: tread },
    block(1, -6.6, 7, 3.7, STEEL),
    {
      z: 1,
      has: (x, y) => x >= 7 && x <= 8.4 && Math.abs(y) <= 4.6,
      ramp: (_x, y) => flat(Math.floor(y + 20) % 2 === 0 ? hazard.yellow : hazard.black),
    },
    // The bin's rim is a ring, so the hold (or the Ore in it) shows inside.
    { z: 3, has: (x, y) => x >= -6.4 && x <= 1.9 && Math.abs(y) <= 3.7 && !inHold(x, y), ramp: () => colours },
    { z: 2, has: inHold, ramp: () => HOLD },
    block(4, 3, 6.6, 2.9, colours),
    block(5, 4.9, 6.1, 2.2, glass),
  ];
  // Part full: Ore lies in the back of the bin, below its rim. Full: it heaps over the rim.
  if (load === 1) parts.push({ z: 2.5, has: (x, y) => inHold(x, y) && x <= -1.9, ramp: heap });
  if (load >= 2) parts.push({ z: 3.5, has: inHold, ramp: heap });
  return parts;
}

/** Points across one pixel that are tested against the blocks, so a turned edge lands on the nearer side. */
const SAMPLES = [-1 / 3, 0, 1 / 3];

/**
 * Turns the blocks to the facing and paints them, lit from the top left: an
 * edge that drops away up or to the left is light, one that drops away down
 * or to the right is dark.
 */
function paintParts(buf: PixelBuffer, parts: readonly Part[], facing: number): void {
  const N = UNIT_SPRITE_PX;
  const a = (facing / FACINGS) * Math.PI * 2;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const top = (x: number, y: number): Part | null => {
    // Into the vehicle's own space: forward along the facing, right across it.
    const lx = x * cos + y * sin;
    const ly = -x * sin + y * cos;
    let best: Part | null = null;
    for (const p of parts) if (p.has(lx, ly) && (!best || p.z >= best.z)) best = p;
    return best;
  };
  const height = new Float32Array(N * N).fill(-1);
  const ramps: (Ramp | null)[] = new Array<Ramp | null>(N * N).fill(null);
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const x = px + 0.5 - N / 2;
      const y = py + 0.5 - N / 2;
      const hits: Part[] = [];
      for (const sy of SAMPLES) {
        for (const sx of SAMPLES) {
          const p = top(x + sx, y + sy);
          if (p) hits.push(p);
        }
      }
      // Under half covered: the pixel stays clear, which keeps turned edges from growing.
      if (hits.length < 5) continue;
      let part = top(x, y);
      if (!part) part = hits.reduce((m, p) => (hits.filter((h) => h === p).length > hits.filter((h) => h === m).length ? p : m));
      height[py * N + px] = part.z;
      ramps[py * N + px] = part.ramp(x * cos + y * sin, -x * sin + y * cos);
    }
  }
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? -1 : height[y * N + x]!);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const ramp = ramps[y * N + x];
      if (!ramp) continue;
      const h = at(x, y);
      const lit = at(x - 1, y) < h || at(x, y - 1) < h;
      const shaded = at(x + 1, y) < h || at(x, y + 1) < h;
      setPixel(buf, x, y, lit === shaded ? ramp.mid : lit ? ramp.light : ramp.dark);
    }
  }
}

/** A dark line round everything painted so far, as on the Buildings. */
function outline(buf: PixelBuffer): void {
  const N = buf.width;
  const edge: [number, number][] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (pixelAt(buf, x, y) !== null) continue;
      const beside = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx!;
        const ny = y + dy!;
        return nx >= 0 && ny >= 0 && nx < N && ny < N && pixelAt(buf, nx, ny) !== null;
      });
      if (beside) edge.push([x, y]);
    }
  }
  for (const [x, y] of edge) setPixel(buf, x, y, K);
}

/** A straight run of pixels from the sprite's middle outward along a facing, for barrels. */
function ray(facing: number, from: number, to: number, originX = 0, originY = 0): [number, number][] {
  const a = (facing / FACINGS) * Math.PI * 2;
  const mid = UNIT_SPRITE_PX / 2;
  const out: [number, number][] = [];
  for (let r = from; r <= to; r += 0.5) {
    const x = Math.floor(mid + originX + Math.cos(a) * r);
    const y = Math.floor(mid + originY + Math.sin(a) * r);
    if (!out.some(([ox, oy]) => ox === x && oy === y)) out.push([x, y]);
  }
  return out;
}

function paintRaider(buf: PixelBuffer, colours: Ramp, facing: number, frame: number): void {
  paintParts(buf, raiderParts(colours, frame % WHEEL_FRAMES), facing);
  // The gun runs from its mount out over the bonnet; painted after the blocks so it stays one clean pixel wide.
  const a = (facing / FACINGS) * Math.PI * 2;
  const barrel = ray(facing, 1.2, 7, -Math.cos(a) * 2.8, -Math.sin(a) * 2.8);
  for (const [x, y] of barrel) setPixel(buf, x, y, ART.steelShine);
  outline(buf);
}

function paintHarvester(buf: PixelBuffer, colours: Ramp, facing: number, frame: number): void {
  paintParts(buf, harvesterParts(colours, frame % WHEEL_FRAMES, Math.floor(frame / WHEEL_FRAMES)), facing);
  outline(buf);
}

/** Where a figure on foot stands in its sprite: its left column and the top row of its head. */
const FIGURE_LEFT = 8;
const FIGURE_TOP = 5;

/** The row under the headgear: the face shows only on the side the figure looks to; from behind it is all `back`. */
function paintFace(buf: PixelBuffer, dx: number, dy: number, back: string): void {
  for (const i of [-1, 0, 1]) {
    const shows = dy * 0.8 + i * dx > 0.25;
    setPixel(buf, FIGURE_LEFT + 1 + i, FIGURE_TOP + 2, shows ? (i < 0 ? skin.light : skin.dark) : back);
  }
}

/** Legs: seen from the side a stride opens and closes them; seen from front or back one leg leads. */
function paintLegs(buf: PixelBuffer, dx: number, frame: number): void {
  const left = FIGURE_LEFT;
  const legRow = FIGURE_TOP + 6;
  const sideways = Math.abs(dx) > 0.7;
  const legs: [number, number][] =
    frame === 0
      ? [[left, legRow], [left, legRow + 1], [left + 2, legRow], [left + 2, legRow + 1]]
      : sideways
        ? frame === 1
          ? [[left, legRow], [left - 1, legRow + 1], [left + 2, legRow], [left + 3, legRow + 1]]
          : [[left + 1, legRow], [left + 1, legRow + 1]]
        : frame === 1
          ? [[left, legRow], [left, legRow + 1], [left + 2, legRow]]
          : [[left, legRow], [left + 2, legRow], [left + 2, legRow + 1]];
  for (const [x, y] of legs) setPixel(buf, x, y, y === legRow ? C[4] : C[2]);
}

/**
 * Medic: a pale cap and coat with a green band and a green satchel, so it is
 * never taken for a Rifleman, whose headgear is his Player's colour over
 * khaki. The Medic's Player shows on its sleeves and belt instead. It carries
 * no weapon: the satchel hangs on the side it faces and stays close to the
 * body, where a rifle would reach out.
 */
function paintMedic(buf: PixelBuffer, colours: Ramp, facing: number, frame: number): void {
  const a = (facing / FACINGS) * Math.PI * 2;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const left = FIGURE_LEFT;
  const topRow = FIGURE_TOP;
  // Cap, two rows, with the green band across its middle.
  setPixel(buf, left, topRow, ward.light);
  setPixel(buf, left + 1, topRow, ward.light);
  setPixel(buf, left + 2, topRow, ward.mid);
  setPixel(buf, left, topRow + 1, ward.mid);
  setPixel(buf, left + 1, topRow + 1, aid.mark);
  setPixel(buf, left + 2, topRow + 1, ward.dark);
  paintFace(buf, dx, dy, ward.dark);
  // Coat, two rows, over a belt in the Player's colour, with a sleeve in that colour at each shoulder.
  for (let row = 0; row < 2; row++) {
    setPixel(buf, left, topRow + 3 + row, ward.light);
    setPixel(buf, left + 1, topRow + 3 + row, ward.mid);
    setPixel(buf, left + 2, topRow + 3 + row, ward.dark);
  }
  setPixel(buf, left, topRow + 5, colours.mid);
  setPixel(buf, left + 1, topRow + 5, colours.mid);
  setPixel(buf, left + 2, topRow + 5, colours.dark);
  for (const row of [0, 1]) {
    setPixel(buf, left - 1, topRow + 3 + row, row === 0 ? colours.light : colours.mid);
    setPixel(buf, left + 3, topRow + 3 + row, colours.dark);
  }
  paintLegs(buf, dx, frame);
  // The satchel swings round the coat with the facing. It is put on before the outline, so where it
  // passes the coat's edge the outline closes round it and the figure stays one compact shape.
  const midX = left + 1.5;
  const midY = topRow + 4.5;
  const bag: [number, number] = [Math.floor(midX + dx * SATCHEL_REACH), Math.floor(midY + dy * SATCHEL_REACH)];
  const strap: [number, number] = [Math.floor(midX + dx * SATCHEL_REACH * 0.4), Math.floor(midY + dy * SATCHEL_REACH * 0.4)];
  setPixel(buf, strap[0], strap[1], aid.shade);
  setPixel(buf, bag[0], bag[1], aid.mark);
  outline(buf);
}

/** How far from the middle of the coat the Medic's satchel hangs, in art pixels: on the coat's edge, not beyond the sleeves. */
const SATCHEL_REACH = 1.45;

/**
 * Mechanic: a yellow hard hat with a brim over oil-dark overalls, so it is
 * taken for neither the Rifleman (his Player's colour over khaki) nor the
 * Medic (pale, with green). Its Player shows on its sleeves and belt, as on
 * the Medic. It carries no weapon: a short tool with a bright steel head is
 * held on the side it faces, close to the body.
 */
function paintMechanic(buf: PixelBuffer, colours: Ramp, facing: number, frame: number): void {
  const a = (facing / FACINGS) * Math.PI * 2;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const left = FIGURE_LEFT;
  const topRow = FIGURE_TOP;
  // Hard hat: a crown, and a brim a pixel wider than the head on each side.
  setPixel(buf, left, topRow, hardHat.light);
  setPixel(buf, left + 1, topRow, hardHat.light);
  setPixel(buf, left + 2, topRow, hardHat.mid);
  setPixel(buf, left - 1, topRow + 1, hardHat.mid);
  setPixel(buf, left, topRow + 1, hardHat.mid);
  setPixel(buf, left + 1, topRow + 1, hardHat.mid);
  setPixel(buf, left + 2, topRow + 1, hardHat.dark);
  setPixel(buf, left + 3, topRow + 1, hardHat.dark);
  paintFace(buf, dx, dy, hardHat.dark);
  // Overalls, two rows, over a belt in the Player's colour, with a sleeve in that colour at each shoulder.
  for (let row = 0; row < 2; row++) {
    setPixel(buf, left, topRow + 3 + row, overalls.light);
    setPixel(buf, left + 1, topRow + 3 + row, overalls.mid);
    setPixel(buf, left + 2, topRow + 3 + row, overalls.dark);
  }
  setPixel(buf, left, topRow + 5, colours.mid);
  setPixel(buf, left + 1, topRow + 5, colours.mid);
  setPixel(buf, left + 2, topRow + 5, colours.dark);
  for (const row of [0, 1]) {
    setPixel(buf, left - 1, topRow + 3 + row, row === 0 ? colours.light : colours.mid);
    setPixel(buf, left + 3, topRow + 3 + row, colours.dark);
  }
  paintLegs(buf, dx, frame);
  // The tool swings round the body with the facing: a dark handle from the middle and one bright pixel for its head.
  const midX = left + 1.5;
  const midY = topRow + 4.5;
  setPixel(buf, Math.floor(midX + dx * TOOL_REACH * 0.4), Math.floor(midY + dy * TOOL_REACH * 0.4), K);
  setPixel(buf, Math.floor(midX + dx * TOOL_REACH), Math.floor(midY + dy * TOOL_REACH), ART.steelShine);
  outline(buf);
}

/** How far from the middle of the overalls the head of the Mechanic's tool is, in art pixels: at the body's edge, where a rifle would reach well past it. */
const TOOL_REACH = 1.45;

/**
 * Rifleman: a helmet in his Player's colour over a khaki jacket and dark legs.
 * He stands upright whichever way he faces; his face shows on the side he
 * looks to and his rifle points there.
 */
function paintRifleman(buf: PixelBuffer, colours: Ramp, facing: number, frame: number): void {
  const a = (facing / FACINGS) * Math.PI * 2;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const left = FIGURE_LEFT;
  const topRow = FIGURE_TOP;
  // Helmet, two rows.
  setPixel(buf, left, topRow, colours.light);
  setPixel(buf, left + 1, topRow, colours.light);
  setPixel(buf, left + 2, topRow, colours.mid);
  setPixel(buf, left, topRow + 1, colours.mid);
  setPixel(buf, left + 1, topRow + 1, colours.mid);
  setPixel(buf, left + 2, topRow + 1, colours.dark);
  // From behind it is all helmet.
  paintFace(buf, dx, dy, colours.dark);
  // Jacket, three rows ending in a belt, with an arm at each shoulder.
  for (let row = 0; row < 3; row++) {
    setPixel(buf, left, topRow + 3 + row, row === 2 ? khaki.dark : khaki.light);
    setPixel(buf, left + 1, topRow + 3 + row, row === 2 ? khaki.dark : khaki.mid);
    setPixel(buf, left + 2, topRow + 3 + row, row === 2 ? K : khaki.dark);
  }
  for (const row of [0, 1]) {
    setPixel(buf, left - 1, topRow + 3 + row, row === 0 ? khaki.light : khaki.mid);
    setPixel(buf, left + 3, topRow + 3 + row, khaki.dark);
  }
  paintLegs(buf, dx, frame);
  // Looking away, the rifle is on the far side of him: only what sticks out past his body shows.
  const behind = dy < -0.3;
  const body: [number, number][] = [];
  for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) if (pixelAt(buf, x, y) !== null) body.push([x, y]);
  outline(buf);
  // Held at the chest and levelled along the facing.
  const rifle = ray(facing, 0.5, 5, -0.5, -0.5);
  for (const [i, [x, y]] of rifle.entries()) {
    if (behind && body.some(([bx, by]) => bx === x && by === y)) continue;
    setPixel(buf, x, y, i === rifle.length - 1 ? C[5] : K);
  }
}

/** Burns and soot on a damaged Unit: the same shape with some pixels blackened. */
function scorch(buf: PixelBuffer, salt: number, blotch: number): void {
  for (let y = 0; y < buf.height; y++) {
    for (let x = 0; x < buf.width; x++) {
      if (pixelAt(buf, x, y) === null) continue;
      // On a vehicle the blotches are two pixels across, so the damage reads as patches rather than noise.
      const h = hash2(Math.floor(x / blotch), Math.floor(y / blotch), salt);
      if (h < SCORCHED) setPixel(buf, x, y, ART.scorch);
      else if (h < SOOTED && pixelAt(buf, x, y) !== K) setPixel(buf, x, y, hash2(x, y, salt) < 0.5 ? smoke[1] : smoke[2]);
    }
  }
}

/** A soft shadow on the ground, a pixel down and to the right of the sprite. */
function castShadow(buf: PixelBuffer): void {
  const N = buf.width;
  const cast: [number, number][] = [];
  for (let y = 1; y < N; y++) {
    for (let x = 1; x < N; x++) {
      if (pixelAt(buf, x, y) === null && pixelAt(buf, x - 1, y - 1) !== null) cast.push([x, y]);
    }
  }
  for (const [x, y] of cast) setPixel(buf, x, y, ART.fog, SHADOW_ALPHA);
}

const SALT: Readonly<Record<UnitKind, number>> = { rifleman: 71, raider: 72, harvester: 73, medic: 74, mechanic: 75 };

const PAINTERS: Readonly<Record<UnitKind, (buf: PixelBuffer, colours: Ramp, facing: number, frame: number) => void>> = {
  rifleman: paintRifleman,
  medic: paintMedic,
  mechanic: paintMechanic,
  raider: paintRaider,
  harvester: paintHarvester,
};

/** One frame of a Unit in its owner's colours, facing one of the 16 ways; `damaged` gives its look below half health. */
export function paintUnit(kind: UnitKind, owner: PlayerId, facing: number, frame: number, damaged: boolean): PixelBuffer {
  const buf = createPixelBuffer(UNIT_SPRITE_PX, UNIT_SPRITE_PX);
  const ramp = ART.player[owner];
  const f = ((frame % UNIT_FRAMES[kind]) + UNIT_FRAMES[kind]) % UNIT_FRAMES[kind];
  const way = ((facing % FACINGS) + FACINGS) % FACINGS;
  PAINTERS[kind](buf, ramp, way, f);
  // A figure on foot is too small for patches: its burns are single pixels.
  if (damaged) scorch(buf, SALT[kind], UNIT_STATS[kind].class === "infantry" ? 1 : 2);
  castShadow(buf);
  return buf;
}
