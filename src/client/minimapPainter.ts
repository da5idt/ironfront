import { ECONOMY, type PlayerView } from "../sim";
import { ART } from "./art/artPalette";
import { hash2 } from "./art/hash";
import { ORE_LEVELS, oreLevel } from "./art/oreArt";
import { rgbOf } from "./art/pixelBuffer";
import type { Camera, Size } from "./camera";
import type { Rect } from "./layout";
import { cameraFrame, minimapArea } from "./minimap";
import { FOG_ALPHA, MINIMAP_BACK, MINIMAP_FRAME } from "./palette";

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

    drawBevel(ctx, box);
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
    // Whole pixels keep the dots as crisp as the rest of the pixel art.
    const dot = Math.max(2, Math.round(scale * 1.2));
    for (const u of view.units) {
      const mx = u.prevX + (u.x - u.prevX) * alpha;
      const my = u.prevY + (u.y - u.prevY) * alpha;
      const x = Math.round(area.x + mx * scale - dot / 2);
      const y = Math.round(area.y + my * scale - dot / 2);
      ctx.fillStyle = ART.player[u.owner].dark;
      ctx.fillRect(x - 1, y - 1, dot + 2, dot + 2);
      ctx.fillStyle = ART.player[u.owner].light;
      ctx.fillRect(x, y, dot, dot);
    }

    const frame = cameraFrame(box, mapCells, cam, mapView);
    ctx.strokeStyle = MINIMAP_FRAME;
    ctx.lineWidth = 1;
    ctx.strokeRect(frame.x + 0.5, frame.y + 0.5, Math.max(0, frame.width - 1), Math.max(0, frame.height - 1));
  }
}

/** A sunken metal frame around the minimap: dark inner line, shadow top-left, light bottom-right. */
function drawBevel(ctx: CanvasRenderingContext2D, box: Rect): void {
  const { dark, mid, light } = ART.frame;
  ctx.fillStyle = mid;
  ctx.fillRect(box.x - 4, box.y - 4, box.width + 8, box.height + 8);
  ctx.fillStyle = light;
  ctx.fillRect(box.x - 4, box.y + box.height + 2, box.width + 8, 2);
  ctx.fillRect(box.x + box.width + 2, box.y - 4, 2, box.height + 8);
  ctx.fillStyle = ART.concrete[1];
  ctx.fillRect(box.x - 4, box.y - 4, box.width + 8, 2);
  ctx.fillRect(box.x - 4, box.y - 4, 2, box.height + 8);
  ctx.fillStyle = dark;
  ctx.fillRect(box.x - 1, box.y - 1, box.width + 2, box.height + 2);
}

function paintLayer(layer: HTMLCanvasElement, view: PlayerView): void {
  const { width, height, terrain, ore, visibility } = view.map;
  if (layer.width !== width || layer.height !== height) {
    layer.width = width;
    layer.height = height;
  }
  const colours = new Array<string>(width * height);
  for (let i = 0; i < colours.length; i++) {
    const level = oreLevel(ore[i] ?? 0, ECONOMY.orePerCell);
    const x = i % width;
    const y = (i - x) / width;
    if (level > 0) {
      // Rich Ore bright, nearly spent Ore dull, as on the Map.
      colours[i] = level === ORE_LEVELS ? ART.ore.light : level > 1 ? ART.ore.mid : ART.ore.dark;
    } else {
      // Two neighbouring shades per Cell give the ground a pixel texture even at this size.
      const ramp = ART.terrain[terrain[i]!];
      colours[i] = ramp[1 + (hash2(x, y, 60) > 0.5 ? 1 : 0)]!;
    }
  }
  // Own, seen and remembered Buildings alike. Fog dims Building Cells only half
  // as much, so a remembered enemy Building still stands out at minimap size.
  const isBuilding = new Uint8Array(width * height);
  for (const b of view.buildings) {
    for (let y = b.y; y < b.y + b.height; y++) {
      for (let x = b.x; x < b.x + b.width; x++) {
        const edge = x === b.x || y === b.y || x === b.x + b.width - 1 || y === b.y + b.height - 1;
        colours[y * width + x] = edge ? ART.player[b.owner].mid : ART.player[b.owner].light;
        isBuilding[y * width + x] = 1;
      }
    }
  }
  const ctx = layer.getContext("2d")!;
  const image = ctx.createImageData(width, height);
  const fog = rgbOf(ART.fog);
  for (let i = 0; i < colours.length; i++) {
    const c = rgbOf(colours[i]!);
    const cover = FOG_ALPHA[visibility[i]!] / 255 / (isBuilding[i] ? 2 : 1);
    for (let k = 0; k < 3; k++) image.data[i * 4 + k] = c[k]! * (1 - cover) + fog[k]! * cover;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}
