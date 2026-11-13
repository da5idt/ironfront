import type { MapDef } from "../mapdef";

/**
 * Builds a small test Map from rows. Starts default to opposite corners with
 * room for the starting base, so tests only describe the terrain they care about.
 */
export function testMap(rows: readonly string[], starts?: MapDef["starts"]): MapDef {
  const w = rows[0]!.length;
  const h = rows.length;
  return {
    name: "test",
    rows,
    starts: starts ?? [
      {
        hq: { x: 0, y: 0 },
        refinery: { x: 4, y: 0 },
        harvester: { x: 5, y: 3 },
        riflemen: [
          { x: 0, y: 4 },
          { x: 1, y: 4 },
        ],
      },
      {
        hq: { x: w - 3, y: h - 3 },
        refinery: { x: w - 7, y: h - 2 },
        harvester: { x: w - 6, y: h - 4 },
        riflemen: [
          { x: w - 1, y: h - 5 },
          { x: w - 2, y: h - 5 },
        ],
      },
    ],
  };
}

/** An all-open Map of the given size. */
export function openMap(width: number, height: number): MapDef {
  return testMap(Array.from({ length: height }, () => ".".repeat(width)));
}
