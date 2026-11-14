import type { PlayerId, UnitKind } from "../../sim";
import { ART } from "./artPalette";
import { FACINGS } from "./buildingArt";
import { hash2 } from "./hash";
import { createPixelBuffer, type PixelBuffer, rgbOf, setPixel } from "./pixelBuffer";
import { ART_CELL_PX } from "./terrainArt";
import { paintUnit, UNIT_SPRITE_PX } from "./unitArt";

// Combat effects, painted in code (ADR 0003): blasts, muzzle flashes, a
// falling Rifleman, and what a fight leaves on the ground. Painted once by the
// effect painter and kept; nothing here runs per frame. How long each one
// shows is here too, with the other art constants, as it is presentation only.

/** The guns in the game; each has its own flash, tracer and impact. */
export type Weapon = "rifle" | "raiderGun" | "turretCannon";

/** How long each effect plays, in seconds of game time. */
export const EFFECT_SECONDS = {
  muzzle: 0.1,
  tracer: 0.1,
  impact: 0.25,
  smallExplosion: 0.6,
  bigExplosion: 0.9,
  fall: 0.4,
} as const;
export type EffectKind = keyof typeof EFFECT_SECONDS;

/** How long what a death leaves behind stays on the ground, in seconds; the last MARK_FADE_SECONDS of it fading out. */
export const MARK_SECONDS = { wreck: 30, body: 20, rubble: 60 } as const;
export type MarkKind = keyof typeof MARK_SECONDS;
export const MARK_FADE_SECONDS = 6;

/** Most effects and marks kept at once; the oldest go first, so a huge fight cannot slow the game down. */
export const MAX_EFFECTS = 240;
export const MAX_MARKS = 48;

/** Small blasts that follow the big one across a destroyed Building, at most. */
export const MOST_AFTER_BLASTS = 6;
/** Seconds between one of those and the next. */
export const AFTER_BLAST_GAP_SECONDS = 0.15;

/** How far from the shooter's middle the flash sits, in art pixels: the end of the barrel. */
export const MUZZLE_REACH: Readonly<Record<Weapon, number>> = { rifle: 5, raiderGun: 6, turretCannon: 10 };

const { fire, smoke } = ART;

/** A blast: a fireball of a few puffs that swells, cools from white through orange to smoke, and thins out. */
export interface BlastShape {
  /** Reach of the fireball at its largest, in art pixels; the sprite is a square of twice this and a margin. */
  readonly radius: number;
  readonly frames: number;
  readonly puffs: number;
  readonly sparks: number;
  readonly salt: number;
}

export const BLASTS = {
  smallExplosion: { radius: 9, frames: 8, puffs: 5, sparks: 6, salt: 11 },
  bigExplosion: { radius: 19, frames: 11, puffs: 9, sparks: 14, salt: 12 },
  rifleImpact: { radius: 2, frames: 3, puffs: 1, sparks: 2, salt: 13 },
  raiderGunImpact: { radius: 3, frames: 4, puffs: 2, sparks: 3, salt: 14 },
  turretCannonImpact: { radius: 5, frames: 5, puffs: 3, sparks: 5, salt: 15 },
} as const satisfies Record<string, BlastShape>;
export type BlastName = keyof typeof BLASTS;

/** Which blast a weapon's hit shows. A shot from out of sight (null) lands like a Raider's. */
export function impactBlast(weapon: Weapon | null): BlastName {
  return weapon === "rifle" ? "rifleImpact" : weapon === "turretCannon" ? "turretCannonImpact" : "raiderGunImpact";
}

export function blastSize(shape: BlastShape): number {
  return shape.radius * 2 + 6;
}

/** One frame of a blast, on a square of blastSize; its middle is the blast's place. */
export function paintBlast(name: BlastName, frame: number): PixelBuffer {
  const shape: BlastShape = BLASTS[name];
  const size = blastSize(shape);
  const buf = createPixelBuffer(size, size);
  const mid = size / 2;
  const R = shape.radius;
  const t = shape.frames <= 1 ? 0 : frame / (shape.frames - 1);
  // Quick out, slow after: most of the swelling happens in the first frames.
  const swell = 0.45 + 0.55 * Math.sqrt(t);
  // Smoke drifts up as the fire dies.
  const lift = t * t * R * 0.35;
  const puffs = Array.from({ length: shape.puffs }, (_, k) => {
    const angle = hash2(k, 1, shape.salt) * Math.PI * 2;
    const out = k === 0 ? 0 : (0.25 + 0.4 * hash2(k, 2, shape.salt)) * R * swell;
    return {
      x: mid + Math.cos(angle) * out,
      y: mid + Math.sin(angle) * out - lift,
      r: Math.max(1, (k === 0 ? 0.62 : 0.34 + 0.24 * hash2(k, 3, shape.salt)) * R * swell),
    };
  });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // How deep inside the nearest puff this pixel is: 1 at a puff's heart, 0 at its edge.
      let depth = 0;
      for (const p of puffs) depth = Math.max(depth, 1 - Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) / p.r);
      if (depth <= 0) continue;
      const grain = hash2(x, y, shape.salt + frame) - 0.5;
      const heat = depth * 0.9 + grain * 0.22 + 1 - t * 2.1;
      if (heat > 1.05) setPixel(buf, x, y, fire[3]);
      else if (heat > 0.75) setPixel(buf, x, y, fire[2]);
      else if (heat > 0.45) setPixel(buf, x, y, fire[1]);
      else if (heat > 0.2) setPixel(buf, x, y, fire[0]);
      else {
        // Smoke thins from its edges, pixel by pixel, rather than fading as a whole.
        const gone = (t - 0.55) / 0.45;
        if (hash2(x, y, shape.salt + 40) < gone * 1.15 - depth * 0.35) continue;
        setPixel(buf, x, y, depth + grain * 0.3 > 0.45 ? smoke[1] : depth + grain * 0.3 > 0.2 ? smoke[2] : smoke[3]);
      }
    }
  }
  // Sparks thrown clear of the fireball, burning out before the smoke goes.
  if (t < 0.75) {
    for (let s = 0; s < shape.sparks; s++) {
      const angle = hash2(s, 7, shape.salt) * Math.PI * 2;
      const reach = (0.5 + 0.75 * hash2(s, 8, shape.salt)) * (R + 2) * Math.min(1, 0.35 + t * 1.3);
      const sx = Math.floor(mid + Math.cos(angle) * reach);
      const sy = Math.floor(mid + Math.sin(angle) * reach - (1 - t) * 1.5);
      setPixel(buf, sx, sy, t < 0.3 ? fire[3] : t < 0.55 ? fire[2] : fire[1]);
    }
  }
  return buf;
}

/** Side of a muzzle flash's square sprite; its middle is the end of the barrel. */
export const MUZZLE_PX = 11;
export const MUZZLE_FRAMES = 2;

const MUZZLE_LENGTH: Readonly<Record<Weapon, number>> = { rifle: 2.4, raiderGun: 3.4, turretCannon: 4.8 };

/** One frame of a muzzle flash pointing along one of the 16 facings: a bright tongue, then a short glow. */
export function paintMuzzle(weapon: Weapon, facing: number, frame: number): PixelBuffer {
  const buf = createPixelBuffer(MUZZLE_PX, MUZZLE_PX);
  const mid = (MUZZLE_PX - 1) / 2;
  const angle = (facing / FACINGS) * Math.PI * 2;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const length = MUZZLE_LENGTH[weapon] * (frame === 0 ? 1 : 0.55);
  const width = weapon === "turretCannon" ? 1.9 : weapon === "raiderGun" ? 1.2 : 0.7;
  for (let y = 0; y < MUZZLE_PX; y++) {
    for (let x = 0; x < MUZZLE_PX; x++) {
      const along = (x - mid) * dx + (y - mid) * dy;
      const across = Math.abs((x - mid) * -dy + (y - mid) * dx);
      if (along < -0.6 || along > length) continue;
      // Widest at the barrel, a point at the far end.
      const room = width * (1 - Math.max(0, along) / (length + 0.5)) + 0.35;
      if (across > room) continue;
      const hot = across < room * 0.45 && along < length * 0.6;
      if (frame === 0) setPixel(buf, x, y, hot ? fire[3] : fire[2]);
      else setPixel(buf, x, y, hot ? fire[2] : fire[1]);
    }
  }
  return buf;
}

/** Side of the falling Rifleman's square sprite; his feet were at its middle. */
export const FALL_PX = 12;
export const FALL_FRAMES = 3;

const FALL_ROWS: readonly (readonly string[])[] = [
  // Knocked back, still on his feet.
  [
    "............",
    "............",
    "......hh....",
    ".....khhk...",
    ".....ktts...",
    "....kttkk...",
    "....kttk....",
    "....kddk....",
    "....kd.dk...",
    "....k..k....",
    "............",
    "............",
  ],
  // Going over.
  [
    "............",
    "............",
    "............",
    "............",
    ".......khk..",
    ".....kkhhk..",
    "...kkttttk..",
    "..kddtttk...",
    "..kdkkkk....",
    "...k........",
    "............",
    "............",
  ],
  // Down.
  [
    "............",
    "............",
    "............",
    "............",
    "............",
    "............",
    "..kkkkkkkk..",
    ".kddtttthhk.",
    ".kddtttkhhk.",
    "..kkkkk.kk..",
    "............",
    "............",
  ],
];

function paintRows(buf: PixelBuffer, rows: readonly string[], legend: Readonly<Record<string, string>>, alpha = 255): void {
  for (const [y, row] of rows.entries()) {
    for (let x = 0; x < row.length; x++) {
      const colour = legend[row[x]!];
      if (colour) setPixel(buf, x, y, colour, alpha);
    }
  }
}

function fallLegend(team: PlayerId): Readonly<Record<string, string>> {
  const ramp = ART.team[team];
  return { k: ART.concrete[0], h: ART.khaki.mid, s: ART.skin.light, t: ramp.mid, d: ramp.dark };
}

/** One frame of a Rifleman going down; `flip` mirrors it, so not every one falls the same way. */
export function paintFall(team: PlayerId, frame: number, flip: boolean): PixelBuffer {
  const buf = createPixelBuffer(FALL_PX, FALL_PX);
  const rows = FALL_ROWS[Math.max(0, Math.min(FALL_FRAMES - 1, frame))]!;
  paintRows(buf, flip ? rows.map((r) => [...r].reverse().join("")) : rows, fallLegend(team));
  return buf;
}

/** What a fallen Rifleman leaves: where he lies, on a dark stain, in his team's colours gone dull. */
export function paintBody(team: PlayerId, flip: boolean): PixelBuffer {
  const buf = createPixelBuffer(FALL_PX, FALL_PX);
  for (let y = 5; y < 11; y++) {
    for (let x = 0; x < FALL_PX; x++) {
      const d = Math.hypot((x - 5.5) / 5.6, (y - 8) / 2.6);
      if (d < 1 && hash2(x, y, 81) > d * d * 0.8) setPixel(buf, x, y, ART.scorch, 120);
    }
  }
  const lying = paintFall(team, FALL_FRAMES - 1, flip);
  const dull = rgbOf(ART.smoke[1]);
  for (let i = 0; i < lying.data.length; i += 4) {
    if (lying.data[i + 3] === 0) continue;
    for (let c = 0; c < 3; c++) buf.data[i + c] = lying.data[i + c]! * 0.6 + dull[c]! * 0.4;
    buf.data[i + 3] = 255;
  }
  return buf;
}

/** Side of a wreck's square sprite: the Unit's own, with room round it for the scorched ground. */
export const WRECK_PX = UNIT_SPRITE_PX + 4;

/** Burnt metal, darkest first: what a wreck's colours turn to. */
const BURNT = [ART.scorch, ART.concrete[0], ART.smoke[0], ART.concrete[1], ART.smoke[1], ART.concrete[2]] as const;

/** A burnt-out vehicle as it stood, on scorched ground; the same for both teams, as the paint has burnt off. */
export function paintWreck(kind: UnitKind, facing: number): PixelBuffer {
  const buf = createPixelBuffer(WRECK_PX, WRECK_PX);
  const mid = WRECK_PX / 2;
  const salt = kind === "raider" ? 91 : 92;
  const reach = kind === "raider" ? 9 : 11;
  for (let y = 0; y < WRECK_PX; y++) {
    for (let x = 0; x < WRECK_PX; x++) {
      const d = Math.hypot(x + 0.5 - mid, y + 0.5 - mid) / reach;
      // Solid under the hull, breaking up into flecks toward the edge.
      if (d < 1 && hash2(x, y, salt) > d * d * d) setPixel(buf, x, y, ART.scorch, d < 0.6 ? 170 : 110);
    }
  }
  const hull = paintUnit(kind, 0, facing, 0, true);
  const inset = (WRECK_PX - UNIT_SPRITE_PX) / 2;
  for (let y = 0; y < UNIT_SPRITE_PX; y++) {
    for (let x = 0; x < UNIT_SPRITE_PX; x++) {
      const i = (y * UNIT_SPRITE_PX + x) * 4;
      // The Unit's cast shadow is see-through; the wreck lies flat on its scorch and needs none.
      if (hull.data[i + 3]! < 255) continue;
      const luma = (0.299 * hull.data[i]! + 0.587 * hull.data[i + 1]! + 0.114 * hull.data[i + 2]!) / 255;
      const h = hash2(x, y, salt + 1);
      // Holes burnt through, and plates missing.
      if (h < 0.08) continue;
      const step = Math.min(BURNT.length - 1, Math.floor(luma * 1.25 * BURNT.length + (h - 0.5) * 1.2));
      // A few embers still glow. Their own roll, well mixed, so they do not line up with the holes.
      const ember = hash2(x * 7 + y * 13, y * 5 - x * 3, salt + 2) > 0.985;
      setPixel(buf, x + inset, y + inset, ember ? fire[0] : BURNT[Math.max(0, step)]!);
    }
  }
  return buf;
}

/** How far the scorched ground round a destroyed Building reaches past its footprint, in art pixels. */
export const RUBBLE_MARGIN = 5;

/** What a destroyed Building of a footprint leaves: scorched ground and broken concrete. */
export function paintRubble(width: number, height: number): PixelBuffer {
  const w = width * ART_CELL_PX + RUBBLE_MARGIN * 2;
  const h = height * ART_CELL_PX + RUBBLE_MARGIN * 2;
  const buf = createPixelBuffer(w, h);
  const salt = 100 + width * 7 + height;
  const C = ART.concrete;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 0 in the middle, 1 at the footprint's edge, past 1 in the margin.
      const d = Math.max(Math.abs(x + 0.5 - w / 2) / (w / 2 - RUBBLE_MARGIN), Math.abs(y + 0.5 - h / 2) / (h / 2 - RUBBLE_MARGIN));
      const edge = (d - 0.75) / 0.6;
      if (hash2(x, y, salt) < edge) continue;
      setPixel(buf, x, y, ART.scorch, d < 0.8 ? 200 : 140);
    }
  }
  // Chunks of wall and slab, thickest in the middle, each lit from the top left like the Buildings were.
  const chunks = Math.round(width * height * 9);
  for (let k = 0; k < chunks; k++) {
    const cw = 2 + Math.floor(hash2(k, 1, salt) * 4);
    const ch = 2 + Math.floor(hash2(k, 2, salt) * 3);
    // Two rolls averaged gather the chunks toward the middle.
    const fx = (hash2(k, 3, salt) + hash2(k, 4, salt)) / 2;
    const fy = (hash2(k, 5, salt) + hash2(k, 6, salt)) / 2;
    const x0 = Math.floor(RUBBLE_MARGIN - 1 + fx * (w - RUBBLE_MARGIN * 2 - cw + 2));
    const y0 = Math.floor(RUBBLE_MARGIN - 1 + fy * (h - RUBBLE_MARGIN * 2 - ch + 2));
    const shade = 1 + Math.floor(hash2(k, 7, salt) * 3);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        // Knock the corners off, so the chunks are not little boxes.
        if ((x === 0 || x === cw - 1) && (y === 0 || y === ch - 1) && hash2(k * 31 + x, y, salt) < 0.6) continue;
        const lit = x === 0 || y === 0;
        const dark = x === cw - 1 || y === ch - 1;
        setPixel(buf, x0 + x, y0 + y, lit ? C[shade + 2]! : dark ? C[shade - 1]! : C[shade]!);
      }
    }
    // The chunk's shadow, down and to the right.
    for (let x = 1; x <= cw; x++) setPixel(buf, x0 + x, y0 + ch, C[0], 200);
  }
  // Bent steel and a few embers still glowing.
  for (let k = 0; k < width * height * 2; k++) {
    const x0 = RUBBLE_MARGIN + Math.floor(hash2(k, 11, salt) * (w - RUBBLE_MARGIN * 2 - 4));
    const y0 = RUBBLE_MARGIN + Math.floor(hash2(k, 12, salt) * (h - RUBBLE_MARGIN * 2 - 3));
    const up = hash2(k, 13, salt) < 0.5 ? 1 : -1;
    for (let i = 0; i < 4; i++) setPixel(buf, x0 + i, y0 + (i > 1 ? up : 0) + 1, C[0]);
    setPixel(buf, x0 + 2, y0 + 3, hash2(k, 14, salt) < 0.5 ? fire[0] : fire[1]);
  }
  return buf;
}
