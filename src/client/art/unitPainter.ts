import { type EntityId, type PlayerId, TICKS_PER_SECOND, UNIT_STATS, type UnitKind, type UnitView } from "../../sim";
import { ART } from "./artPalette";
import { hash2 } from "./hash";
import type { PixelBuffer } from "./pixelBuffer";
import { DAMAGED_BELOW, FACINGS, UNIT_FRAMES, UNIT_SPRITE_PX, unitSprite } from "./spriteSheet";
import { ART_CELL_PX } from "./terrainArt";
import { unitFrame } from "./unitArt";

// Draws Units into the pixel world from the sprite sheet. Each kind and team
// gets one canvas holding every facing and frame, made once at startup;
// drawing a Unit copies one square of it.

const KINDS = Object.keys(UNIT_STATS) as UnitKind[];
const TEAMS: readonly PlayerId[] = [0, 1];
const S = UNIT_SPRITE_PX;

/** The facing a Unit shows before anything has said which way it faces: south-east, toward the viewer. */
const REST_FACING = 2;
/** On its button a vehicle is side-on, where its shape is plainest; a Rifleman looks out of the picture. */
const ICON_FACING: Readonly<Record<UnitKind, number>> = { rifleman: 2, raider: 0, harvester: 0 };

/** What the painter needs to know of how a Unit is shown; the presentation module's UnitLook fits. */
export interface UnitPose {
  readonly facing: number;
  readonly frame: number;
}

/** Facings run across the sheet; frames run down it, the damaged ones below the whole ones. */
function sheetOf(kind: UnitKind, team: PlayerId): HTMLCanvasElement {
  const sprite = unitSprite(kind, team);
  const frames = UNIT_FRAMES[kind];
  const sheet = document.createElement("canvas");
  sheet.width = FACINGS * S;
  sheet.height = frames * 2 * S;
  const c = sheet.getContext("2d")!;
  const put = (buf: PixelBuffer, column: number, row: number) =>
    c.putImageData(new ImageData(new Uint8ClampedArray(buf.data), buf.width, buf.height), column * S, row * S);
  for (let facing = 0; facing < FACINGS; facing++) {
    for (let frame = 0; frame < frames; frame++) {
      put(sprite.frames[facing]![frame]!, facing, frame);
      put(sprite.damaged[facing]![frame]!, facing, frames + frame);
    }
  }
  return sheet;
}

/** The Unit's still picture cut down to what is painted, so a button can show it as large as fits. */
function iconOf(kind: UnitKind, team: PlayerId): HTMLCanvasElement {
  const buf = unitSprite(kind, team).frames[ICON_FACING[kind]]![unitFrame(kind, null, 0)]!;
  let x0 = S;
  let y0 = S;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (buf.data[(y * S + x) * 4 + 3] === 0) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  const icon = document.createElement("canvas");
  icon.width = x1 - x0 + 1;
  icon.height = y1 - y0 + 1;
  icon.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(buf.data), S, S), -x0, -y0);
  return icon;
}

export class UnitPainter {
  private readonly sheets = new Map<string, HTMLCanvasElement>();
  private readonly icons = new Map<string, HTMLCanvasElement>();

  constructor() {
    for (const kind of KINDS) {
      for (const team of TEAMS) {
        this.sheets.set(`${kind}/${team}`, sheetOf(kind, team));
        this.icons.set(`${kind}/${team}`, iconOf(kind, team));
      }
    }
  }

  /** The Unit's still picture, for a button. */
  icon(kind: UnitKind, team: PlayerId): HTMLCanvasElement {
    return this.icons.get(`${kind}/${team}`)!;
  }

  /**
   * All Units of a view, into a layer of the pixel world above the fog.
   * `alpha` (0..1) is how far the frame is between the last Tick and the
   * next, `time` is game time in Ticks, and `pose` says how each Unit is
   * shown; a Unit without one rests.
   */
  draw(
    art: CanvasRenderingContext2D,
    units: readonly UnitView[],
    alpha: number,
    time: number,
    pose: (id: EntityId) => UnitPose | undefined,
  ): void {
    const U = ART_CELL_PX;
    const seconds = time / TICKS_PER_SECOND;
    // Top of the Map first, so a Unit standing lower overlaps the one behind it.
    const ordered = units.length > 1 ? [...units].sort((a, b) => a.y - b.y) : units;
    for (const u of ordered) {
      const shown = pose(u.id);
      const damaged = u.hp < u.maxHp * DAMAGED_BELOW;
      const frames = UNIT_FRAMES[u.kind];
      const row = (shown?.frame ?? unitFrame(u.kind, null, 0)) + (damaged ? frames : 0);
      const cx = Math.round((u.prevX + (u.x - u.prevX) * alpha) * U);
      const cy = Math.round((u.prevY + (u.y - u.prevY) * alpha) * U);
      art.drawImage(
        this.sheets.get(`${u.kind}/${u.owner}`)!,
        (shown?.facing ?? REST_FACING) * S,
        row * S,
        S,
        S,
        cx - S / 2,
        cy - S / 2,
        S,
        S,
      );
      if (damaged && u.kind !== "rifleman") this.drawSmoke(art, cx, cy, seconds, u.id);
    }
    art.globalAlpha = 1;
  }

  /** A thin trail of smoke off a damaged vehicle: a few pixels that rise, drift and thin out. */
  private drawSmoke(art: CanvasRenderingContext2D, cx: number, cy: number, seconds: number, id: EntityId): void {
    for (let i = 0; i < 3; i++) {
      const age = (seconds * 0.9 + i / 3 + hash2(id, i, 5)) % 1;
      art.globalAlpha = 0.7 * (1 - age);
      art.fillStyle = ART.smoke[age < 0.4 ? 1 : age < 0.75 ? 2 : 3];
      const size = age < 0.5 ? 1 : 2;
      art.fillRect(cx - 1 + Math.round(age * 3 + hash2(i, id, 6) * 2), cy - 2 - Math.round(age * 8), size, size);
    }
    art.globalAlpha = 1;
  }
}
