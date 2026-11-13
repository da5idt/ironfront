import type { CellPos, Terrain } from "./types";

/**
 * A Map as hand-written game data. `rows` is one string per row of Cells:
 *   `.` open, `,` rough, `#` rock, `~` water, `*` Ore (open ground holding Ore).
 */
export interface MapDef {
  readonly name: string;
  readonly rows: readonly string[];
  /** One starting position per Player, Player 0 first. */
  readonly starts: readonly [StartDef, StartDef];
}

/** Where a Player's starting Buildings and Units go. Building positions are top-left Cells. */
export interface StartDef {
  readonly hq: CellPos;
  readonly refinery: CellPos;
  readonly harvester: CellPos;
  readonly riflemen: readonly CellPos[];
}

export interface ParsedMap {
  readonly width: number;
  readonly height: number;
  /** Indexed by y * width + x. */
  readonly terrain: readonly Terrain[];
  readonly hasOre: readonly boolean[];
}

const LEGEND: Record<string, { terrain: Terrain; ore: boolean }> = {
  ".": { terrain: "open", ore: false },
  ",": { terrain: "rough", ore: false },
  "#": { terrain: "rock", ore: false },
  "~": { terrain: "water", ore: false },
  "*": { terrain: "open", ore: true },
};

export function parseMap(def: MapDef): ParsedMap {
  const height = def.rows.length;
  const width = def.rows[0]?.length ?? 0;
  if (width === 0) throw new Error(`Map ${def.name} has no Cells`);
  const terrain: Terrain[] = [];
  const hasOre: boolean[] = [];
  def.rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`Map ${def.name}: row ${y} has ${row.length} Cells, expected ${width}`);
    }
    for (const ch of row) {
      const cell = LEGEND[ch];
      if (!cell) throw new Error(`Map ${def.name}: unknown Cell '${ch}' in row ${y}`);
      terrain.push(cell.terrain);
      hasOre.push(cell.ore);
    }
  });
  return { width, height, terrain, hasOre };
}
