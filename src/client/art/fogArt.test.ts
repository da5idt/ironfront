import { describe, expect, it } from "vitest";
import { paintFogCell } from "./fogArt";

const U = 12;
const VISIBLE = 0;
const FOGGED = 140;
const UNEXPLORED = 255;

/** The fog of a Cell and its eight neighbours, row by row, centre in the middle. */
function around(centre: number, neighbours: Partial<Record<"n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se", number>>) {
  const { nw = centre, n = centre, ne = centre, w = centre, e = centre, sw = centre, s = centre, se = centre } = neighbours;
  return [nw, n, ne, w, centre, e, sw, s, se];
}

const column = (fog: Uint8Array, x: number) => Array.from({ length: U }, (_, y) => fog[y * U + x]!);
const row = (fog: Uint8Array, y: number) => Array.from({ length: U }, (_, x) => fog[y * U + x]!);

describe("Fog of War edges", () => {
  it("covers a Cell evenly when its neighbours share its fog", () => {
    expect(new Set(paintFogCell(around(FOGGED, {}), 4, 4))).toEqual(new Set([FOGGED]));
    expect(new Set(paintFogCell(around(VISIBLE, {}), 4, 4))).toEqual(new Set([VISIBLE]));
  });

  it("dithers a Fogged Cell's edge toward a Visible neighbour, and only there", () => {
    const fog = paintFogCell(around(FOGGED, { w: VISIBLE }), 4, 4);
    const edge = column(fog, 0);
    expect(edge).toContain(VISIBLE);
    expect(edge).toContain(FOGGED);
    expect(new Set(column(fog, U - 1))).toEqual(new Set([FOGGED]));
  });

  it("uses only the fog levels it was given, so the edge is crisp pixels, not a blur", () => {
    const fog = paintFogCell(around(FOGGED, { e: VISIBLE, s: UNEXPLORED, se: VISIBLE }), 2, 9);
    for (const a of fog) expect([VISIBLE, FOGGED, UNEXPLORED]).toContain(a);
  });

  it("lets fog creep a little way into a Visible Cell beside the dark", () => {
    const fog = paintFogCell(around(VISIBLE, { e: UNEXPLORED }), 7, 3);
    expect(column(fog, U - 1).some((a) => a > VISIBLE)).toBe(true);
    expect(new Set(column(fog, U / 2))).toEqual(new Set([VISIBLE]));
  });

  it("never thins inside an Unexplored Cell, whose ground is never seen", () => {
    // GLOSSARY, Fog of War: Cells never seen are Unexplored. The whole soft edge lies on the neighbour's side.
    const fog = paintFogCell(around(UNEXPLORED, { n: VISIBLE, e: VISIBLE, s: FOGGED, se: VISIBLE, nw: FOGGED }), 2, 9);
    expect(new Set(fog)).toEqual(new Set([UNEXPLORED]));
  });

  it("covers a Visible Cell almost wholly where it touches an Unexplored one, so the edge still fades and does not step", () => {
    const fog = paintFogCell(around(VISIBLE, { e: UNEXPLORED }), 7, 3);
    const dark = (x: number) => column(fog, x).filter((a) => a === UNEXPLORED).length;
    expect(dark(U - 1)).toBeGreaterThan(U * 0.75);
    expect(dark(U - 1)).toBeGreaterThan(dark(U - 3));
  });

  it("thins out with distance from the edge", () => {
    const fog = paintFogCell(around(FOGGED, { n: VISIBLE }), 5, 5);
    const clear = (y: number) => row(fog, y).filter((a) => a === VISIBLE).length;
    expect(clear(0)).toBeGreaterThan(clear(2));
    expect(clear(5)).toBe(0);
  });

  it("rounds a corner where the only lighter neighbour is diagonal", () => {
    const fog = paintFogCell(around(FOGGED, { ne: VISIBLE }), 1, 1);
    const topRight = [fog[U - 2]!, fog[U - 1]!, fog[U + U - 2]!, fog[U + U - 1]!];
    expect(topRight).toContain(VISIBLE);
    // The rest of the top edge borders a Fogged Cell, so it stays fogged away from the corner.
    expect(new Set(row(fog, 0).slice(0, U - 4))).toEqual(new Set([FOGGED]));
  });
});
