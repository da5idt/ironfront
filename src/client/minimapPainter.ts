import type { PlayerView } from "../sim";
import type { Camera, Size } from "./camera";
import type { Rect } from "./layout";
import { cameraFrame, minimapArea } from "./minimap";
import {
  FOG_ALPHA,
  MINIMAP_BACK,
  MINIMAP_BORDER,
  MINIMAP_FRAME,
  ORE_COLOUR,
  TEAM_COLOURS,
  TERRAIN_COLOURS,
} from "./palette";

// Draws the minimap from a PlayerView only, so it shows no more than the Player knows.

export class MinimapPainter {
  /** One pixel per Cell: terrain, Ore, Buildings and fog, scaled up when drawn. */
  private readonly layer: HTMLCanvasElement = document.createElement("canvas");
  /** Views are rebuilt each Tick, so identity means "unchanged". */
  private layerFor: PlayerView | null = null;

  draw(ctx: CanvasRenderingContext2D, view: PlayerView, box: Rect, cam: Camera, mapView: Size, alpha: number): void {
    const mapCells = { width: view.map.width, height: view.map.height };
    const area = minimapArea(box, mapCells);
    const scale = area.width / mapCells.width;

    ctx.fillStyle = MINIMAP_BACK;
    ctx.fillRect(box.x, box.y, box.width, box.height);

    if (this.layerFor !== view) {
      paintLayer(this.layer, view);
      this.layerFor = view;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.layer, area.x, area.y, area.width, area.height);
    ctx.imageSmoothingEnabled = true;

    // Units move every frame, so they are dots on top rather than part of the cached layer.
    const dot = Math.max(2, scale * 1.2);
    for (const u of view.units) {
      const mx = u.prevX + (u.x - u.prevX) * alpha;
      const my = u.prevY + (u.y - u.prevY) * alpha;
      ctx.fillStyle = TEAM_COLOURS[u.owner].light;
      ctx.fillRect(area.x + mx * scale - dot / 2 - 1, area.y + my * scale - dot / 2 - 1, dot + 2, dot + 2);
      ctx.fillStyle = TEAM_COLOURS[u.owner].fill;
      ctx.fillRect(area.x + mx * scale - dot / 2, area.y + my * scale - dot / 2, dot, dot);
    }

    const frame = cameraFrame(box, mapCells, cam, mapView);
    ctx.strokeStyle = MINIMAP_FRAME;
    ctx.lineWidth = 1;
    ctx.strokeRect(frame.x + 0.5, frame.y + 0.5, Math.max(0, frame.width - 1), Math.max(0, frame.height - 1));

    ctx.strokeStyle = MINIMAP_BORDER;
    ctx.strokeRect(box.x - 0.5, box.y - 0.5, box.width + 1, box.height + 1);
  }
}

function paintLayer(layer: HTMLCanvasElement, view: PlayerView): void {
  const { width, height, terrain, ore, visibility } = view.map;
  if (layer.width !== width || layer.height !== height) {
    layer.width = width;
    layer.height = height;
  }
  const colours = new Array<string>(width * height);
  for (let i = 0; i < colours.length; i++) {
    colours[i] = (ore[i] ?? 0) > 0 ? ORE_COLOUR : TERRAIN_COLOURS[terrain[i]!];
  }
  // Own, seen and remembered Buildings alike. Fog dims Building Cells only half
  // as much, so a remembered enemy Building still stands out at minimap size.
  const isBuilding = new Uint8Array(width * height);
  for (const b of view.buildings) {
    for (let y = b.y; y < b.y + b.height; y++) {
      for (let x = b.x; x < b.x + b.width; x++) {
        colours[y * width + x] = TEAM_COLOURS[b.owner].fill;
        isBuilding[y * width + x] = 1;
      }
    }
  }
  const ctx = layer.getContext("2d")!;
  const image = ctx.createImageData(width, height);
  for (let i = 0; i < colours.length; i++) {
    const [r, g, b] = rgb(colours[i]!);
    const keep = 1 - FOG_ALPHA[visibility[i]!] / 255 / (isBuilding[i] ? 2 : 1);
    image.data[i * 4] = r * keep;
    image.data[i * 4 + 1] = g * keep;
    image.data[i * 4 + 2] = b * keep;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

const rgbCache = new Map<string, readonly [number, number, number]>();

/** "#rrggbb" to channels; the palette's solid colours are all in that form. */
function rgb(hex: string): readonly [number, number, number] {
  let c = rgbCache.get(hex);
  if (!c) {
    const n = Number.parseInt(hex.slice(1), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, c);
  }
  return c;
}
