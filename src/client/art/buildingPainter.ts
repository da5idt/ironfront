import { BUILDING_STATS, type BuildingKind, type BuildingView, type CellPos, type EntityId, PLAYER_IDS, type PlayerId, TICKS_PER_SECOND } from "../../sim";
import { ART } from "./artPalette";
import { hash2 } from "./hash";
import { toCanvas } from "./pixelWorld";
import {
  BUILDING_FPS,
  type BuildingSprite,
  buildingSprite,
  DAMAGED_BELOW,
  damageSprite,
  loopFrame,
  TURRET_GUN_PX,
  TURRET_REST_FACING,
} from "./spriteSheet";
import { tintSprite } from "./spriteTemplate";
import { ART_CELL_PX } from "./terrainArt";

// Draws Buildings into the pixel world from the sprite sheet. Every sprite is
// turned into a canvas once, here at startup; drawing a frame only copies them.

const KINDS = Object.keys(BUILDING_STATS) as BuildingKind[];

/** How far down and right a Building's shadow falls, in art pixels. */
const SHADOW_OFFSET = 2;
/** How strongly the placement preview is washed green or red. */
const PLACING_TINT = 0.55;
const PLACING_ALPHA = 0.85;

interface BuildingCanvases {
  readonly frames: readonly HTMLCanvasElement[];
  readonly shadow: HTMLCanvasElement;
  readonly gun: readonly HTMLCanvasElement[] | null;
  /** The still picture with the gun on it, for buttons. */
  readonly icon: HTMLCanvasElement;
  /** The placement preview: [fits, blocked]. */
  readonly placing: readonly [HTMLCanvasElement, HTMLCanvasElement];
}

/** What the placement preview needs: the same shape as Overlay.placement. */
export interface PlacingPreview {
  readonly kind: BuildingKind;
  readonly at: CellPos;
  readonly valid: boolean;
}

const gunOffset = (TURRET_GUN_PX - ART_CELL_PX) / 2;

/** The still picture of a Building, with a Turret's gun at rest on it. */
function iconOf(sprite: BuildingSprite): HTMLCanvasElement {
  const still = toCanvas(sprite.frames[0]!);
  if (!sprite.gun) return still;
  const icon = document.createElement("canvas");
  icon.width = TURRET_GUN_PX;
  icon.height = TURRET_GUN_PX;
  const c = icon.getContext("2d")!;
  c.drawImage(still, gunOffset, gunOffset);
  c.drawImage(toCanvas(sprite.gun[TURRET_REST_FACING]!), 0, 0);
  return icon;
}

function tinted(icon: HTMLCanvasElement, colour: string): HTMLCanvasElement {
  const data = icon.getContext("2d")!.getImageData(0, 0, icon.width, icon.height);
  return toCanvas(tintSprite({ width: icon.width, height: icon.height, data: data.data }, colour, PLACING_TINT));
}

export class BuildingPainter {
  /** By kind, then by Player (a PlayerId is its index): looked up several times a Building in every frame, so no key is built. */
  private readonly sprites = new Map<BuildingKind, readonly BuildingCanvases[]>();
  private readonly damage = new Map<BuildingKind, readonly HTMLCanvasElement[]>();

  constructor() {
    for (const kind of KINDS) {
      this.damage.set(kind, damageSprite(kind).frames.map(toCanvas));
      this.sprites.set(
        kind,
        PLAYER_IDS.map((team) => {
          const sprite = buildingSprite(kind, team);
          const icon = iconOf(sprite);
          return {
            frames: sprite.frames.map(toCanvas),
            shadow: toCanvas(sprite.shadow),
            gun: sprite.gun?.map(toCanvas) ?? null,
            icon,
            placing: [tinted(icon, ART.placing.fits), tinted(icon, ART.placing.blocked)],
          };
        }),
      );
    }
  }

  private of(kind: BuildingKind, team: PlayerId): BuildingCanvases {
    return this.sprites.get(kind)![team]!;
  }

  /** The Building's still picture, for a button. A Turret's is TURRET_GUN_PX square, as its gun overhangs the Cell. */
  icon(kind: BuildingKind, team: PlayerId): HTMLCanvasElement {
    return this.of(kind, team).icon;
  }

  /**
   * All Buildings of a view, into the pixel world's ground layer. `time` is
   * game time in Ticks (it may be between two), so everything holds still
   * while paused. `risen` says how far each Building has risen from the
   * ground (0 just placed, 1 standing), and `turretFacing` which of the
   * FACINGS each Turret's gun points.
   */
  draw(
    art: CanvasRenderingContext2D,
    buildings: readonly BuildingView[],
    time: number,
    risen: (b: BuildingView) => number,
    turretFacing: (id: EntityId) => number,
  ): void {
    const U = ART_CELL_PX;
    const seconds = time / TICKS_PER_SECOND;
    // Remembered Buildings are as last seen, so they neither rise nor move.
    const rise = (b: BuildingView) => (b.remembered ? 1 : risen(b));
    // Three passes, so no Building's shadow or smoke is hidden by a neighbour drawn after it.
    for (const b of buildings) {
      const progress = rise(b);
      if (progress <= 0) continue;
      art.globalAlpha = progress;
      art.drawImage(this.of(b.kind, b.owner).shadow, b.x * U + SHADOW_OFFSET, b.y * U + SHADOW_OFFSET);
    }
    art.globalAlpha = 1;
    for (const b of buildings) {
      const sprite = this.of(b.kind, b.owner);
      const frame = sprite.frames[b.remembered ? 0 : loopFrame(sprite.frames.length, BUILDING_FPS, seconds, b.id * 5)]!;
      const x = b.x * U;
      const y = b.y * U;
      const progress = rise(b);
      if (progress < 1) {
        this.drawRising(art, frame, x, y, progress, b.id);
        continue;
      }
      art.drawImage(frame, x, y);
      if (sprite.gun) art.drawImage(sprite.gun[turretFacing(b.id)]!, x - gunOffset, y - gunOffset);
    }
    for (const b of buildings) {
      if (b.hp >= b.maxHp * DAMAGED_BELOW || rise(b) < 1) continue;
      const frames = this.damage.get(b.kind)!;
      const { rise: above } = damageSprite(b.kind);
      const w = b.width * U;
      const h = b.height * U;
      // A remembered Building keeps its scars, but its fire and smoke hold still and stay inside its dimmed Cells.
      if (b.remembered) art.drawImage(frames[0]!, 0, above, w, h, b.x * U, b.y * U, w, h);
      else art.drawImage(frames[loopFrame(frames.length, BUILDING_FPS, seconds, b.id * 3)]!, b.x * U, b.y * U - above);
    }
  }

  /** A newly placed Building going up: it shows from the ground upward behind a bright working edge and some dust. */
  private drawRising(art: CanvasRenderingContext2D, frame: HTMLCanvasElement, x: number, y: number, progress: number, id: EntityId): void {
    const w = frame.width;
    const h = frame.height;
    const rows = Math.round(h * progress);
    art.globalAlpha = 0.45;
    art.fillStyle = ART.concrete[1];
    art.fillRect(x, y, w, h - rows);
    art.globalAlpha = 1;
    if (rows > 0) art.drawImage(frame, 0, h - rows, w, rows, x, y + h - rows, w, rows);
    const edge = y + h - rows - 1;
    art.fillStyle = ART.lamp.flood;
    art.fillRect(x, edge, w, 1);
    const step = Math.floor(progress * 12);
    for (let i = 0; i < w / 3; i++) {
      art.fillStyle = hash2(i, step, id) > 0.5 ? ART.weldSpark : ART.smoke[3];
      art.fillRect(x + Math.floor(hash2(i, step, id + 1) * w), edge - 1 - Math.floor(hash2(step, i, id) * 3), 1, 1);
    }
  }

  /** The Building being placed, in `team`'s colours washed green where it fits and red where it does not. */
  drawPlacing(art: CanvasRenderingContext2D, placing: PlacingPreview, team: PlayerId): void {
    const sprite = this.of(placing.kind, team);
    const off = sprite.gun ? gunOffset : 0;
    const x = placing.at.x * ART_CELL_PX;
    const y = placing.at.y * ART_CELL_PX;
    const { width, height } = BUILDING_STATS[placing.kind];
    // The footprint itself, so the Cells the Building will take are exact even where the sprite has clear corners.
    art.globalAlpha = 0.3;
    art.fillStyle = placing.valid ? ART.placing.fits : ART.placing.blocked;
    art.fillRect(x, y, width * ART_CELL_PX, height * ART_CELL_PX);
    art.globalAlpha = PLACING_ALPHA;
    art.drawImage(sprite.placing[placing.valid ? 0 : 1], x - off, y - off);
    art.globalAlpha = 1;
  }
}
