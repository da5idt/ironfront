import { ECONOMY, type PlayerView, TICKS_PER_SECOND, type Visibility } from "../../sim";
import type { Camera } from "../camera";
import type { Rect } from "../layout";
import { FOG_ALPHA } from "../palette";
import { ART } from "./artPalette";
import { paintFogCell } from "./fogArt";
import { ORE_LEVELS, ORE_VARIANTS, oreLevel, oreVariant, paintOreCell } from "./oreArt";
import { type PixelBuffer, rgbOf } from "./pixelBuffer";
import { ART_CELL_PX, paintTerrain } from "./terrainArt";
import { eachWaterGlint } from "./waterArt";

// The pixel world (ADR 0003): ground, Ore and whatever stands on the ground
// are drawn into a low-resolution canvas at 12 art pixels per Cell, then
// copied to the screen at 2x with smoothing off, so a Cell stays 24 screen
// pixels (camera CELL_PX) and all camera and click maths is unchanged. Fog of
// War is kept at the same art resolution and scaled the same way, and a second
// low-resolution layer goes over the fog for what is never dimmed by it.

/** Screen pixels per art pixel. */
export const ART_SCALE = 2;

export function toCanvas(buf: PixelBuffer): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = buf.width;
  canvas.height = buf.height;
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(buf.data), buf.width, buf.height), 0, 0);
  return canvas;
}

/**
 * Paints sprites into a layer of the pixel world. The context it gets counts
 * in art pixels from the Map's top-left corner, so the Cell at cx, cy starts
 * at cx * ART_CELL_PX, cy * ART_CELL_PX whatever the camera shows.
 */
export type ArtLayer = (art: CanvasRenderingContext2D) => void;

export class PixelWorld {
  private readonly lowRes = document.createElement("canvas");
  private readonly lowCtx: CanvasRenderingContext2D;
  /** The layer above the fog; clear wherever nothing is painted. */
  private readonly over = document.createElement("canvas");
  private readonly overCtx: CanvasRenderingContext2D;
  /** Terrain never changes, so it is painted once for the whole Map. */
  private terrain: HTMLCanvasElement | null = null;
  private isWater: Uint8Array | null = null;
  /** [level][variant], painted once. */
  private readonly oreSprites: HTMLCanvasElement[][] = Array.from({ length: ORE_LEVELS + 1 }, (_, level) =>
    Array.from({ length: ORE_VARIANTS }, (_, v) => toCanvas(paintOreCell(level, v))),
  );
  private readonly fog = document.createElement("canvas");
  private fogImage: ImageData | null = null;
  private fogCtx: CanvasRenderingContext2D | null = null;
  /** The visibility the fog canvas shows; only Cells that change (and their neighbours) are repainted. */
  private fogShows: readonly Visibility[] | null = null;
  /** Where the water Cell being drawn starts in the low-resolution canvas, for paintGlint. */
  private glintX = 0;
  private glintY = 0;
  /** One function for every water Cell of every frame, rather than a new one each. */
  private readonly paintGlint = (x: number, y: number, colour: string): void => {
    this.lowCtx.fillStyle = colour;
    this.lowCtx.fillRect(this.glintX + x, this.glintY + y, 1, 1);
  };

  constructor() {
    this.lowCtx = this.lowRes.getContext("2d")!;
    this.overCtx = this.over.getContext("2d")!;
  }

  /** Sizes a low-resolution canvas to cover `dest`; returns the art pixel of the Map at its top-left corner. */
  private fit(canvas: HTMLCanvasElement, cam: Camera, dest: Rect): { ox: number; oy: number } {
    const lw = Math.ceil(dest.width / ART_SCALE) + 1;
    const lh = Math.ceil(dest.height / ART_SCALE) + 1;
    if (canvas.width !== lw || canvas.height !== lh) {
      canvas.width = lw;
      canvas.height = lh;
    }
    // Whole art pixels for the low-res canvas; the leftover screen pixel goes into the copy to the screen.
    return { ox: Math.floor(cam.x / ART_SCALE), oy: Math.floor(cam.y / ART_SCALE) };
  }

  /** Copies a low-resolution canvas to the screen at 2x, crisp. */
  private present(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    cam: Camera,
    dest: Rect,
    origin: { ox: number; oy: number },
  ): void {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      canvas,
      dest.x - (cam.x - origin.ox * ART_SCALE),
      dest.y - (cam.y - origin.oy * ART_SCALE),
      canvas.width * ART_SCALE,
      canvas.height * ART_SCALE,
    );
    ctx.imageSmoothingEnabled = true;
  }

  private paintLayer(lc: CanvasRenderingContext2D, origin: { ox: number; oy: number }, layer: ArtLayer): void {
    lc.save();
    lc.translate(-origin.ox, -origin.oy);
    lc.imageSmoothingEnabled = false;
    layer(lc);
    lc.restore();
  }

  /**
   * Terrain, Ore and water shimmer for the part of the Map the camera sees,
   * into `dest` on screen. `onGround` paints what stands on the ground and
   * goes under the fog: Buildings, so that remembered ones are dimmed by it.
   */
  drawGround(
    ctx: CanvasRenderingContext2D,
    view: PlayerView,
    cam: Camera,
    dest: Rect,
    alpha: number,
    onGround: ArtLayer,
  ): void {
    const U = ART_CELL_PX;
    const { width, height, ore, visibility } = view.map;
    if (!this.terrain) {
      this.terrain = toCanvas(paintTerrain(view.map));
      this.isWater = Uint8Array.from(view.map.terrain, (t) => (t === "water" ? 1 : 0));
    }
    const origin = this.fit(this.lowRes, cam, dest);
    const { ox, oy } = origin;
    const lw = this.lowRes.width;
    const lh = this.lowRes.height;
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
          this.glintX = cx * U - ox;
          this.glintY = cy * U - oy;
          eachWaterGlint(cx, cy, seconds, this.paintGlint);
        }
      }
    }

    this.paintLayer(lc, origin, onGround);
    this.present(ctx, this.lowRes, cam, dest, origin);
  }

  /**
   * A layer of the pixel world over the fog, for what the fog never dims:
   * Units, effects, selection brackets, health bars and the placement preview.
   */
  drawAboveFog(ctx: CanvasRenderingContext2D, cam: Camera, dest: Rect, layer: ArtLayer): void {
    const origin = this.fit(this.over, cam, dest);
    this.overCtx.clearRect(0, 0, this.over.width, this.over.height);
    this.paintLayer(this.overCtx, origin, layer);
    this.present(ctx, this.over, cam, dest, origin);
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
      this.fogCtx = this.fog.getContext("2d")!;
      this.fogImage = this.fogCtx.createImageData(width * U, height * U);
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
      }
    }
    // Only the repainted Cells go to the canvas, a run of neighbours in a row at a time. One box round
    // all of them would be most of the Map whenever Units far apart move in the same Tick.
    const ctx = this.fogCtx!;
    for (let cy = 0; cy < height; cy++) {
      for (let cx = 0; cx < width; cx++) {
        if (!dirty[cy * width + cx]) continue;
        const from = cx;
        while (cx + 1 < width && dirty[cy * width + cx + 1]) cx++;
        ctx.putImageData(this.fogImage, 0, 0, from * U, cy * U, (cx - from + 1) * U, U);
      }
    }
  }
}
