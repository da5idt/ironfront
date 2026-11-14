import { describe, expect, it } from "vitest";
import type { Terrain } from "../../sim";
import { ART } from "./artPalette";
import { type PixelBuffer, pixelAt } from "./pixelBuffer";
import { ART_CELL_PX, paintTerrain } from "./terrainArt";

/** A Map from rows of the map-file legend: . open, , rough, # rock, ~ water. */
function mapOf(...rows: string[]) {
  const legend: Record<string, Terrain> = { ".": "open", ",": "rough", "#": "rock", "~": "water" };
  return { width: rows[0]!.length, height: rows.length, terrain: rows.join("").split("").map((c) => legend[c]!) };
}

describe("terrain painting", () => {
  it("paints 12 pixels per Cell", () => {
    const art = paintTerrain(mapOf("...", "~~~"));
    expect(ART_CELL_PX).toBe(12);
    expect(art.width).toBe(36);
    expect(art.height).toBe(24);
    expect(art.data.length).toBe(36 * 24 * 4);
  });

  it("textures each kind of ground with several shades of its own colours", () => {
    const families: Record<string, readonly string[]> = {
      ".": [...ART.terrain.open, ART.grassTuft.dark, ART.grassTuft.light],
      ",": [...ART.terrain.rough, ART.pebble.dark, ART.pebble.light],
      "#": [...ART.terrain.rock, ART.rockFace.crack, ART.rockFace.shade, ART.rockFace.light],
      "~": [...ART.terrain.water],
    };
    for (const [ch, family] of Object.entries(families)) {
      // The middle Cell of a 3x3 patch of one kind: nothing else touches it.
      const art = paintTerrain(mapOf(ch.repeat(3), ch.repeat(3), ch.repeat(3)));
      const colours = coloursIn(art, 1, 1);
      expect(colours.size, `shades of ${ch}`).toBeGreaterThanOrEqual(3);
      for (const c of colours) expect(family, `${c} in ${ch}`).toContain(c);
    }
  });

  it("draws a sandy shore on the side of a water Cell that meets land", () => {
    // Water in the middle column, land to its left only.
    const art = paintTerrain(mapOf(".~~", ".~~", ".~~"));
    const sand = new Set<string>(ART.shore.sand);
    const at = (x: number, y: number) => pixelAt(art, ART_CELL_PX + x, ART_CELL_PX + y)!;
    // The column touching the land is sand all the way down...
    for (let y = 0; y < ART_CELL_PX; y++) expect(sand.has(at(0, y)), `left edge y=${y}`).toBe(true);
    // ...and the far side, against more water, has none.
    for (let y = 0; y < ART_CELL_PX; y++) expect(sand.has(at(ART_CELL_PX - 1, y)), `right edge y=${y}`).toBe(false);
  });

  it("leaves open water without a shore", () => {
    const art = paintTerrain(mapOf("~~~", "~~~", "~~~"));
    for (const c of coloursIn(art, 1, 1)) expect(ART.shore.sand).not.toContain(c);
  });

  it("rounds a shore into the corner where land touches water only diagonally", () => {
    const art = paintTerrain(mapOf(".~~", "~~~", "~~~"));
    const sand = new Set<string>(ART.shore.sand);
    expect(sand.has(pixelAt(art, ART_CELL_PX, ART_CELL_PX)!)).toBe(true);
    expect(sand.has(pixelAt(art, ART_CELL_PX + 6, ART_CELL_PX + 6)!)).toBe(false);
  });

  it("frays the edge between two kinds of land instead of a straight seam", () => {
    // Rough ground in the middle, grass to its right.
    const art = paintTerrain(mapOf(",,.", ",,.", ",,."));
    const grass = new Set<string>([...ART.terrain.open, ART.grassTuft.dark, ART.grassTuft.light]);
    let grassOnRoughSide = 0;
    for (let y = 0; y < ART_CELL_PX; y++) {
      if (grass.has(pixelAt(art, 2 * ART_CELL_PX - 1, ART_CELL_PX + y)!)) grassOnRoughSide++;
      expect(grass.has(pixelAt(art, ART_CELL_PX + 3, ART_CELL_PX + y)!), `inner y=${y}`).toBe(false);
    }
    expect(grassOnRoughSide).toBeGreaterThan(0);
    expect(grassOnRoughSide).toBeLessThan(ART_CELL_PX);
  });

  it("gives rock a dark face where it drops to other ground below", () => {
    const art = paintTerrain(mapOf("###", "###", "...", "..."));
    const face = new Set<string>([ART.rockFace.crack, ART.rockFace.shade]);
    for (let x = 0; x < ART_CELL_PX; x++) {
      expect(face.has(pixelAt(art, ART_CELL_PX + x, 2 * ART_CELL_PX - 1)!), `bottom row x=${x}`).toBe(true);
    }
  });

  it("paints the same Map the same way every time", () => {
    const rows = [".,#~", "~~..", "#,,~"];
    expect(paintTerrain(mapOf(...rows)).data).toEqual(paintTerrain(mapOf(...rows)).data);
  });
});

/** The distinct colours in one Cell of the painted art. */
function coloursIn(art: PixelBuffer, cx: number, cy: number): Set<string> {
  const out = new Set<string>();
  for (let y = 0; y < ART_CELL_PX; y++) {
    for (let x = 0; x < ART_CELL_PX; x++) out.add(pixelAt(art, cx * ART_CELL_PX + x, cy * ART_CELL_PX + y)!);
  }
  return out;
}
