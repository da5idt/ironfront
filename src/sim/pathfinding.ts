import type { CellPos } from "./types";

// Pure grid search: A* for routes and a nearest-Cells search for spreading a
// group out. Knows nothing about Matches, so it is tested on its own.

/** What the search needs to know about the Map. */
export interface Grid {
  readonly width: number;
  readonly height: number;
  walkable(x: number, y: number): boolean;
  /** Multiplier for entering a walkable Cell, at least 1 (1 = open ground). */
  cost(x: number, y: number): number;
}

const SQRT2 = Math.SQRT2;

// Fixed neighbour order keeps ties, and so the whole Match, deterministic.
const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

/** Lower bound on the cost from a to b with 8-way moves on open ground. */
function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
}

/**
 * The cheapest 8-way route from `start` to `goal`, as the Cells to step into
 * (start left out, goal last). Diagonal steps never cut past a blocked Cell.
 * When the goal can't be reached, the route ends at the reachable Cell nearest
 * to it instead, so a Unit ordered somewhere unreachable still gets as close as
 * it can. Returns null only if `start` is off the grid.
 */
export function findPath(grid: Grid, start: CellPos, goal: CellPos): CellPos[] | null {
  const { width, height } = grid;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  if (!inside(start.x, start.y)) return null;

  const n = width * height;
  const g = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new MinHeap();
  const startI = start.y * width + start.x;
  const goalI = inside(goal.x, goal.y) ? goal.y * width + goal.x : -1;

  g[startI] = 0;
  heap.push(startI, octile(start.x, start.y, goal.x, goal.y), octile(start.x, start.y, goal.x, goal.y));
  let best = startI;
  let bestH = octile(start.x, start.y, goal.x, goal.y);

  while (heap.size > 0) {
    const i = heap.pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (i === goalI) {
      best = i;
      break;
    }
    const x = i % width;
    const y = (i - x) / width;
    const h = octile(x, y, goal.x, goal.y);
    if (h < bestH) {
      best = i;
      bestH = h;
    }
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inside(nx, ny) || !grid.walkable(nx, ny)) continue;
      const diagonal = dx !== 0 && dy !== 0;
      if (diagonal && (!grid.walkable(x + dx, y) || !grid.walkable(x, y + dy))) continue;
      const ni = ny * width + nx;
      if (closed[ni]) continue;
      const cost = g[i]! + (diagonal ? SQRT2 : 1) * grid.cost(nx, ny);
      if (cost < g[ni]!) {
        g[ni] = cost;
        parent[ni] = i;
        const nh = octile(nx, ny, goal.x, goal.y);
        heap.push(ni, cost + nh, nh);
      }
    }
  }

  const path: CellPos[] = [];
  for (let i = best; i !== startI; i = parent[i]!) {
    const x = i % width;
    path.push({ x, y: (i - x) / width });
  }
  return path.reverse();
}

/**
 * Up to `count` distinct walkable Cells nearest to `target` (straight-line
 * distance, ties by row then column), nearest first. Used to give each Unit in
 * a group its own end Cell.
 */
export function nearbyCells(grid: Grid, target: CellPos, count: number): CellPos[] {
  if (count <= 0) return [];
  const maxRadius = Math.ceil(Math.hypot(grid.width, grid.height));
  for (let r = Math.max(1, Math.ceil(Math.sqrt(count))); ; r *= 2) {
    const found: { x: number; y: number; d: number }[] = [];
    for (let y = Math.max(0, target.y - r); y <= Math.min(grid.height - 1, target.y + r); y++) {
      for (let x = Math.max(0, target.x - r); x <= Math.min(grid.width - 1, target.x + r); x++) {
        const d = (x - target.x) ** 2 + (y - target.y) ** 2;
        // Only the disc is complete; corners of the square may miss nearer Cells further out.
        if (d <= r * r && grid.walkable(x, y)) found.push({ x, y, d });
      }
    }
    if (found.length >= count || r >= maxRadius) {
      found.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
      return found.slice(0, count).map(({ x, y }) => ({ x, y }));
    }
  }
}

/**
 * The Cell matching `test` that is fewest 8-way steps from `start` (the start
 * itself counts), walking only through walkable Cells and never cutting a
 * corner. Only walkable Cells (and the start) are tested. Ties go to the fixed
 * neighbour order. Null when nothing matching is reachable.
 */
export function nearestReachable(
  grid: Grid,
  start: CellPos,
  test: (x: number, y: number) => boolean,
): CellPos | null {
  const { width, height } = grid;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  if (!inside(start.x, start.y)) return null;
  const seen = new Uint8Array(width * height);
  seen[start.y * width + start.x] = 1;
  const queue: number[] = [start.y * width + start.x];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % width;
    const y = (i - x) / width;
    if (test(x, y)) return { x, y };
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inside(nx, ny) || seen[ny * width + nx] || !grid.walkable(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!grid.walkable(x + dx, y) || !grid.walkable(x, y + dy))) continue;
      seen[ny * width + nx] = 1;
      queue.push(ny * width + nx);
    }
  }
  return null;
}

/** Binary min-heap of Cell indices by f, then h, then insertion order. */
class MinHeap {
  private readonly items: { i: number; f: number; h: number; seq: number }[] = [];
  private seq = 0;

  get size(): number {
    return this.items.length;
  }

  push(i: number, f: number, h: number): void {
    const items = this.items;
    items.push({ i, f, h, seq: this.seq++ });
    let k = items.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (!less(items[k]!, items[p]!)) break;
      [items[k], items[p]] = [items[p]!, items[k]!];
      k = p;
    }
  }

  pop(): number {
    const items = this.items;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < items.length && less(items[l]!, items[m]!)) m = l;
        if (r < items.length && less(items[r]!, items[m]!)) m = r;
        if (m === k) break;
        [items[k], items[m]] = [items[m]!, items[k]!];
        k = m;
      }
    }
    return top.i;
  }
}

function less(a: { f: number; h: number; seq: number }, b: { f: number; h: number; seq: number }): boolean {
  return a.f < b.f || (a.f === b.f && (a.h < b.h || (a.h === b.h && a.seq < b.seq)));
}
