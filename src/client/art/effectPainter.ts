import { type PlayerId, TICKS_PER_SECOND, type UnitKind } from "../../sim";
import type { Effect, Mark } from "../presentation";
import { ART } from "./artPalette";
import { FACINGS } from "./buildingArt";
import {
  type BlastName,
  BLASTS,
  blastSize,
  FALL_FRAMES,
  FALL_PX,
  impactBlast,
  MARK_FADE_SECONDS,
  MUZZLE_FRAMES,
  MUZZLE_PX,
  MUZZLE_REACH,
  paintBlast,
  paintBody,
  paintFall,
  paintMuzzle,
  paintRubble,
  paintWreck,
  type Weapon,
  WRECK_PX,
} from "./effectArt";
import type { PixelBuffer } from "./pixelBuffer";
import { toCanvas } from "./pixelWorld";
import { ART_CELL_PX } from "./terrainArt";

// Draws the presentation's effects and marks into the pixel world. Every
// picture is painted once at startup into a strip of frames; drawing one copies
// a square of its strip, so a big fight costs a few hundred small copies.

const WEAPONS: readonly Weapon[] = ["rifle", "raiderGun", "turretCannon"];
const VEHICLES: readonly UnitKind[] = ["raider", "harvester"];
const TEAMS: readonly PlayerId[] = [0, 1];
const U = ART_CELL_PX;

/** How many steps a mark's fade-out takes: whole steps suit the pixel look better than a smooth fade. */
const FADE_STEPS = 6;
/** How much of its flight a tracer's streak covers, by weapon: the rifle's is a short dash, the cannon's a shell. */
const STREAK_PX: Readonly<Record<Weapon, number>> = { rifle: 6, raiderGun: 8, turretCannon: 3 };
/** How strongly the line a round has flown still shows behind it, so the eye can follow who shot whom. */
const WAKE_ALPHA = 0.3;

/** Buffers of one size side by side in one canvas: `columns` across, as many rows as it takes. */
function strip(cells: readonly PixelBuffer[], columns: number): HTMLCanvasElement {
  const size = cells[0]!.width;
  const canvas = document.createElement("canvas");
  canvas.width = columns * size;
  canvas.height = Math.ceil(cells.length / columns) * size;
  const c = canvas.getContext("2d")!;
  for (const [i, buf] of cells.entries()) {
    c.putImageData(
      new ImageData(new Uint8ClampedArray(buf.data), buf.width, buf.height),
      (i % columns) * size,
      Math.floor(i / columns) * size,
    );
  }
  return canvas;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export class EffectPainter {
  /** Each blast's frames, left to right. */
  private readonly blasts = new Map<BlastName, HTMLCanvasElement>();
  /** Per weapon: facings across, frames down. */
  private readonly muzzles = new Map<Weapon, HTMLCanvasElement>();
  /** Per team: the fall's frames across; the mirrored fall on the second row. */
  private readonly falls = new Map<PlayerId, HTMLCanvasElement>();
  /** Per team: the two ways a body lies. */
  private readonly bodies = new Map<PlayerId, HTMLCanvasElement>();
  /** Per vehicle: facings across. */
  private readonly wrecks = new Map<UnitKind, HTMLCanvasElement>();
  /** By footprint, made the first time a Building of that size is destroyed. */
  private readonly rubble = new Map<string, HTMLCanvasElement>();

  constructor() {
    for (const name of Object.keys(BLASTS) as BlastName[]) {
      const frames = BLASTS[name].frames;
      this.blasts.set(name, strip(range(frames).map((f) => paintBlast(name, f)), frames));
    }
    for (const weapon of WEAPONS) {
      const cells = range(MUZZLE_FRAMES).flatMap((frame) => range(FACINGS).map((facing) => paintMuzzle(weapon, facing, frame)));
      this.muzzles.set(weapon, strip(cells, FACINGS));
    }
    for (const team of TEAMS) {
      const cells = [false, true].flatMap((flip) => range(FALL_FRAMES).map((f) => paintFall(team, f, flip)));
      this.falls.set(team, strip(cells, FALL_FRAMES));
      this.bodies.set(team, strip([paintBody(team, false), paintBody(team, true)], 2));
    }
    for (const kind of VEHICLES) {
      this.wrecks.set(kind, strip(range(FACINGS).map((facing) => paintWreck(kind, facing)), FACINGS));
    }
  }

  /** Wrecks, bodies and rubble, into the pixel world's ground layer (under the fog). `time` is game time in Ticks. */
  drawMarks(art: CanvasRenderingContext2D, marks: readonly Mark[], time: number): void {
    const fadeTicks = MARK_FADE_SECONDS * TICKS_PER_SECOND;
    for (const m of marks) {
      const left = (m.end - time) / fadeTicks;
      if (left <= 0) continue;
      art.globalAlpha = left >= 1 ? 1 : Math.ceil(left * FADE_STEPS) / FADE_STEPS;
      const x = Math.round(m.at.x * U);
      const y = Math.round(m.at.y * U);
      if (m.kind === "rubble") {
        const key = `${m.width}x${m.height}`;
        let sprite = this.rubble.get(key);
        if (!sprite) {
          sprite = toCanvas(paintRubble(m.width, m.height));
          this.rubble.set(key, sprite);
        }
        art.drawImage(sprite, x - sprite.width / 2, y - sprite.height / 2);
      } else if (m.kind === "wreck" && m.unit) {
        const S = WRECK_PX;
        art.drawImage(this.wrecks.get(m.unit)!, m.facing * S, 0, S, S, x - S / 2, y - S / 2, S, S);
      } else {
        const S = FALL_PX;
        art.drawImage(this.bodies.get(m.team)!, fallsLeft(m.facing) ? S : 0, 0, S, S, x - S / 2, y - S / 2 + 1, S, S);
      }
    }
    art.globalAlpha = 1;
  }

  /** Flashes, tracers, blasts and falling Riflemen, into the pixel world's layer above the fog. `time` is game time in Ticks. */
  drawEffects(art: CanvasRenderingContext2D, effects: readonly Effect[], time: number): void {
    for (const e of effects) {
      if (time < e.start || time >= e.end) continue;
      const progress = (time - e.start) / (e.end - e.start);
      const x = e.at.x * U;
      const y = e.at.y * U;
      switch (e.kind) {
        case "muzzle": {
          const weapon = e.weapon ?? "rifle";
          const angle = (e.facing / FACINGS) * Math.PI * 2;
          const S = MUZZLE_PX;
          const mx = Math.round(x + Math.cos(angle) * MUZZLE_REACH[weapon]);
          const my = Math.round(y + Math.sin(angle) * MUZZLE_REACH[weapon]);
          const frame = Math.min(MUZZLE_FRAMES - 1, Math.floor(progress * MUZZLE_FRAMES));
          const half = (S - 1) / 2;
          art.drawImage(this.muzzles.get(weapon)!, e.facing * S, frame * S, S, S, mx - half, my - half, S, S);
          break;
        }
        case "tracer":
          this.drawTracer(art, e, progress);
          break;
        case "impact":
          this.drawBlast(art, impactBlast(e.weapon), x, y, progress);
          break;
        case "smallExplosion":
        case "bigExplosion":
          this.drawBlast(art, e.kind, x, y, progress);
          break;
        case "fall": {
          const S = FALL_PX;
          const frame = Math.min(FALL_FRAMES - 1, Math.floor(progress * FALL_FRAMES));
          art.drawImage(
            this.falls.get(e.team)!,
            frame * S,
            fallsLeft(e.facing) ? S : 0,
            S,
            S,
            Math.round(x) - S / 2,
            Math.round(y) - S / 2 + 1,
            S,
            S,
          );
          break;
        }
      }
    }
  }

  private drawBlast(art: CanvasRenderingContext2D, name: BlastName, x: number, y: number, progress: number): void {
    const shape = BLASTS[name];
    const S = blastSize(shape);
    const frame = Math.min(shape.frames - 1, Math.floor(progress * shape.frames));
    art.drawImage(this.blasts.get(name)!, frame * S, 0, S, S, Math.round(x - S / 2), Math.round(y - S / 2), S, S);
  }

  /** A bright streak flying from the barrel to the target: a few pixels, drawn straight into the layer. */
  private drawTracer(art: CanvasRenderingContext2D, e: Effect, progress: number): void {
    const weapon = e.weapon ?? "rifle";
    const dx = (e.to.x - e.at.x) * U;
    const dy = (e.to.y - e.at.y) * U;
    const length = Math.hypot(dx, dy);
    if (length < 1) return;
    const ux = dx / length;
    const uy = dy / length;
    const from = Math.min(length, MUZZLE_REACH[weapon]);
    // The head reaches the target as the tracer's time runs out, when the impact takes over.
    const head = from + (length - from) * Math.min(1, progress * 1.1);
    const streak = STREAK_PX[weapon];
    const tail = Math.max(from, head - streak);
    const ax = e.at.x * U;
    const ay = e.at.y * U;
    // The cannon's shell trails smoke all the way back to the gun; a bullet leaves a faint bright wake.
    art.globalAlpha = weapon === "turretCannon" ? 0.5 : WAKE_ALPHA;
    art.fillStyle = weapon === "turretCannon" ? ART.smoke[3] : ART.fire[2];
    for (let d = from; d < tail; d += weapon === "turretCannon" ? 2 : 1) {
      art.fillRect(Math.round(ax + ux * d), Math.round(ay + uy * d), 1, 1);
    }
    art.globalAlpha = 1;
    for (let d = tail; d <= head; d++) {
      const nearHead = head - d < 2;
      art.fillStyle = nearHead ? ART.fire[3] : weapon === "rifle" ? ART.fire[2] : ART.fire[1];
      const px = Math.round(ax + ux * d);
      const py = Math.round(ay + uy * d);
      if (weapon === "turretCannon") art.fillRect(px - 1, py - 1, 2, 2);
      else art.fillRect(px, py, 1, 1);
    }
    if (weapon === "raiderGun") {
      // A second round behind the first: the Raider's gun fires bursts.
      art.fillStyle = ART.fire[2];
      const second = head - streak - 4;
      for (let d = Math.max(from, second - 3); d <= second; d++) art.fillRect(Math.round(ax + ux * d), Math.round(ay + uy * d), 1, 1);
    }
  }
}

/** A Rifleman facing left of straight up or down falls to the left, so the fallen do not all lie the same way. */
function fallsLeft(facing: number): boolean {
  return facing > FACINGS / 4 && facing <= (FACINGS * 3) / 4;
}
