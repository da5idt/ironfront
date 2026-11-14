import { ECONOMY, type PlayerView, TICKS_PER_SECOND, type Visibility } from "../../sim";
import type { Camera } from "../camera";
import type { Rect } from "../layout";
import { FOG_ALPHA } from "../palette";
import { ART } from "./artPalette";
import { paintFogCell } from "./fogArt";
import { ORE_LEVELS, ORE_VARIANTS, oreLevel, oreVariant, paintOreCell } from "./oreArt";
import { type PixelBuffer, rgbOf } from "./pixelBuffer";
import { ART_CELL_PX, paintTerrain } from "./terrainArt";
import { waterGlints } from "./waterArt";

// The pixel world (ADR 0003): ground and Ore are drawn into a low-resolution
// canvas at 12 art pixels per Cell, then copied to the screen at 2x with
// smoothing off, so a Cell stays 24 screen pixels (camera CELL_PX) and all
// camera and click maths is unchanged. Fog of War is kept at the same art
// resolution and scaled the same way.

/** Screen pixels per art pixel. */
export const ART_SCALE = 2;

export function toCanvas(buf: PixelBuffer): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = buf.width;
  canvas.height = buf.height;
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(buf.data), buf.width, buf.height), 0, 0);
  return canvas;
}

export class PixelWorld {
  private readonly lowRes = document.createElement("canvas");
  private readonly lowCtx: CanvasRenderingContext2D;
  /** Terrain never changes, so it is painted once for the whole Map. */
  private terrain: HTMLCanvasElement | null = null;
  private isWater: Uint8Array | null = null;
  /** [level][variant], painted once. */
  private readonly oreSprites: HTMLCanvasElement[][] = Array.from({ length: ORE_LEVELS + 1 }, (_, level) =>
    Array.from({ length: ORE_VARIANTS }, (_, v) => toCanvas(paintOreCell(level, v))),
  );
  private readonly fog = document.createElement("canvas");
  private fogImage: ImageData | null = null;
  /** The visibility the fog canvas shows; only Cells that change (and their neighbours) are repainted. */
  private fogShows: readonly Visibility[] | null = null;

  constructor() {
    this.lowCtx = this.lowRes.getContext("2d")!;
  }

  /** Terrain, Ore and water shimmer for the part of the Map the camera sees, into `dest` on screen. */
  drawGround(ctx: CanvasRenderingContext2D, view: PlayerView, cam: Camera, dest: Rect, alpha: number): void {
    const U = ART_CELL_PX;
    const { width, height, ore, visibility } = view.map;
    if (!this.terrain) {
      this.terrain = toCanvas(paintTerrain(view.map));
      this.isWater = Uint8Array.from(view.map.terrain, (t) => (t === "water" ? 1 : 0));
    }
    const lw = Math.ceil(dest.width / ART_SCALE) + 1;
    const lh = Math.ceil(dest.height / ART_SCALE) + 1;
    if (this.lowRes.width !== lw || this.lowRes.height !== lh) {
      this.lowRes.width = lw;
      this.lowRes.height = lh;
    }
    // Whole art pixels for the low-res canvas; the leftover screen pixel goes into the copy below.
    const ox = Math.floor(cam.x / ART_SCALE);
    const oy = Math.floor(cam.y / ART_SCALE);
    const lc = this.lowCtx;
    lc.fillStyle = "#000";
    lc.fillRect(0, 0, lw, lh);
    lc.drawImage(this.terrain, -ox, -oy);

    const x0 = Math.max(0, Math.floor(ox / U));
    const y0 = Math.max(0, Math.floor(oy / U));
    const x1 = Math.min(width - 1, Math.floor((ox + lw) / U));
    const y1 = Math.min(height - 1, Math.floor((oy + lh) / U));
    // Shimmer follows game time, so it holds still while paused.
    const seconds = (view.tick + alpha) / TICKS_PER_SECOND;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const i = cy * width + cx;
        if (visibility[i] === "unexplored") continue;
        const level = oreLevel(ore[i] ?? 0, ECONOMY.orePerCell);
        if (level > 0) lc.drawImage(this.oreSprites[level]![oreVariant(cx, cy)]!, cx * U - ox, cy * U - oy);
        else if (this.isWater![i]) {
          for (const g of waterGlints(cx, cy, seconds)) {
            lc.fillStyle = g.colour;
            lc.fillRect(cx * U + g.x - ox, cy * U + g.y - oy, 1, 1);
          }
        }
      }
    }

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.lowRes,
      dest.x - (cam.x - ox * ART_SCALE),
      dest.y - (cam.y - oy * ART_SCALE),
      lw * ART_SCALE,
      lh * ART_SCALE,
    );
    ctx.imageSmoothingEnabled = true;
  }

  /** Fog of War over everything drawn so far, with dithered pixel edges. */
  drawFog(ctx: CanvasRenderingContext2D, view: PlayerView, cam: Camera, dest: Rect): void {
    this.updateFog(view);
    const { width, height } = view.map;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.fog, dest.x - cam.x, dest.y - cam.y, width * ART_CELL_PX * ART_SCALE, height * ART_CELL_PX * ART_SCALE);
    ctx.imageSmoothingEnabled = true;
  }

  private updateFog(view: PlayerView): void {
    const { width, height, visibility } = view.map;
    if (visibility === this.fogShows) return;
    const U = ART_CELL_PX;
    let dirty: Uint8Array;
    if (!this.fogImage || this.fogShows?.length !== visibility.length) {
      this.fog.width = width * U;
      this.fog.height = height * U;
      this.fogImage = this.fog.getContext("2d")!.createImageData(width * U, height * U);
      const [r, g, b] = rgbOf(ART.fog);
      const d = this.fogImage.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
      }
      dirty = new Uint8Array(width * height).fill(1);
    } else {
      // A Cell's edge art depends on its neighbours, so a change repaints the 3x3 around it.
      dirty = new Uint8Array(width * height);
      const before = this.fogShows;
      for (let i = 0; i < visibility.length; i++) {
        if (visibility[i] === before[i]) continue;
        const x = i % width;
        const y = (i - x) / width;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < width && ny < height) dirty[ny * width + nx] = 1;
          }
        }
      }
    }
    this.fogShows = visibility;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    const around = new Array<number>(9);
    const data = this.fogImage.data;
    const rowPx = width * U;
    for (let cy = 0; cy < height; cy++) {
      for (let cx = 0; cx < width; cx++) {
        if (!dirty[cy * width + cx]) continue;
        const centre = FOG_ALPHA[visibility[cy * width + cx]!];
        for (let k = 0; k < 9; k++) {
          const nx = cx + (k % 3) - 1;
          const ny = cy + Math.floor(k / 3) - 1;
          // Off the Map repeats the Cell itself, so the Map's border has no fake edge.
          around[k] = nx >= 0 && ny >= 0 && nx < width && ny < height ? FOG_ALPHA[visibility[ny * width + nx]!] : centre;
        }
        const cell = paintFogCell(around, cx, cy);
        for (let ly = 0; ly < U; ly++) {
          for (let lx = 0; lx < U; lx++) data[((cy * U + ly) * rowPx + cx * U + lx) * 4 + 3] = cell[ly * U + lx]!;
        }
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx);
        maxY = Math.max(maxY, cy);
      }
    }
    if (maxX < 0) return;
    this.fog
      .getContext("2d")!
      .putImageData(this.fogImage, 0, 0, minX * U, minY * U, (maxX - minX + 1) * U, (maxY - minY + 1) * U);
  }
}
