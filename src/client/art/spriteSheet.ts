import type { BuildingKind, PlayerId, UnitKind } from "../../sim";
import { ART } from "./artPalette";
import {
  DAMAGE_FRAMES,
  FACINGS,
  IDLE_FRAMES,
  paintBuilding,
  paintDamage,
  paintTurretGun,
  SMOKE_RISE,
} from "./buildingArt";
import type { PixelBuffer } from "./pixelBuffer";
import { silhouette } from "./spriteTemplate";
import { paintUnit, UNIT_FRAMES } from "./unitArt";

// The sprite sheet (ADR 0003): every sprite as plain pixel buffers, painted
// the first time it is asked for and kept, so nothing is painted per frame.
// DOM-free; the client turns the buffers into canvases once (BuildingPainter).

export {
  BUILD_UP_SECONDS,
  BUILDING_FPS,
  DAMAGED_BELOW,
  FACINGS,
  SMOKE_RISE,
  TURRET_GUN_PX,
  TURRET_REST_FACING,
} from "./buildingArt";
export { UNIT_FRAMES, UNIT_SPRITE_PX } from "./unitArt";

/** How dark a Building's cast shadow is (0..255). */
const SHADOW_ALPHA = 90;

export interface BuildingSprite {
  /** The idle loop, at BUILDING_FPS. Frame 0 is the still picture (remembered Buildings, buttons). */
  readonly frames: readonly PixelBuffer[];
  /** The sprite's shape in shadow, to lay under it a little down and to the right. */
  readonly shadow: PixelBuffer;
  /**
   * Turret only: the gun for each of the FACINGS (0 east, clockwise on
   * screen), TURRET_GUN_PX square, to centre on the Turret's Cell.
   */
  readonly gun: readonly PixelBuffer[] | null;
}

export interface DamageSprite {
  /** Fire and smoke loop, the same for both teams. Wider than the Building, and `rise` taller. */
  readonly frames: readonly PixelBuffer[];
  /** How far above the Building's top the frames start. */
  readonly rise: number;
}

export interface UnitSprite {
  /** By facing (0 east, clockwise on screen), then by frame (see unitFrame). Each UNIT_SPRITE_PX square, shadow included. */
  readonly frames: readonly (readonly PixelBuffer[])[];
  /** The same frames as the Unit looks below DAMAGED_BELOW of its health. */
  readonly damaged: readonly (readonly PixelBuffer[])[];
}

const buildings = new Map<string, BuildingSprite>();
const units = new Map<string, UnitSprite>();
const damage = new Map<BuildingKind, DamageSprite>();

export function buildingSprite(kind: BuildingKind, team: PlayerId): BuildingSprite {
  const key = `${kind}/${team}`;
  let sprite = buildings.get(key);
  if (!sprite) {
    const frames = Array.from({ length: IDLE_FRAMES[kind] }, (_, f) => paintBuilding(kind, team, f));
    sprite = {
      frames,
      shadow: silhouette(frames[0]!, ART.fog, SHADOW_ALPHA),
      gun: kind === "turret" ? Array.from({ length: FACINGS }, (_, facing) => paintTurretGun(team, facing)) : null,
    };
    buildings.set(key, sprite);
  }
  return sprite;
}

export function unitSprite(kind: UnitKind, team: PlayerId): UnitSprite {
  const key = `${kind}/${team}`;
  let sprite = units.get(key);
  if (!sprite) {
    const sheet = (damaged: boolean) =>
      Array.from({ length: FACINGS }, (_, facing) =>
        Array.from({ length: UNIT_FRAMES[kind] }, (_, frame) => paintUnit(kind, team, facing, frame, damaged)),
      );
    sprite = { frames: sheet(false), damaged: sheet(true) };
    units.set(key, sprite);
  }
  return sprite;
}

export function damageSprite(kind: BuildingKind): DamageSprite {
  let sprite = damage.get(kind);
  if (!sprite) {
    sprite = { frames: Array.from({ length: DAMAGE_FRAMES }, (_, f) => paintDamage(kind, f)), rise: SMOKE_RISE };
    damage.set(kind, sprite);
  }
  return sprite;
}

/** Which frame of a loop shows at a time in seconds; `offset` keeps neighbours out of step. */
export function loopFrame(frames: number, fps: number, seconds: number, offset = 0): number {
  const f = Math.floor(seconds * fps) + offset;
  return ((f % frames) + frames) % frames;
}
