import type { CommandResult } from "./commands";
import { OK, reject } from "./commands";
import type { CommandHandler } from "./handlers";
import { findPath, type Grid, nearbyCells } from "./pathfinding";
import type { MatchState, UnitState } from "./state";
import { cellIndex, inBounds, isWalkable, ownUnits, terrainAt } from "./state";
import { MOVEMENT, TICKS_PER_SECOND, UNIT_STATS } from "./tuning";
import type { CellPos, PlayerId } from "./types";

// Getting Units from one Cell to another. `orderMoveTo` and `stepAlong` are the
// building blocks later orders (harvest, attack) reuse to walk somewhere.

/** Where a Unit is walking and the Cells still to step into, goal last. */
export interface MovePlan {
  readonly goal: CellPos;
  path: CellPos[];
}

/** The Cell a Unit is standing in. */
export function unitCell(u: UnitState): CellPos {
  return { x: Math.floor(u.x), y: Math.floor(u.y) };
}

function terrainSpeed(m: MatchState, cell: CellPos): number {
  return terrainAt(m, cell.x, cell.y) === "rough" ? MOVEMENT.roughSpeedMultiplier : 1;
}

/** The Match as the pathfinder sees it: slow ground costs more to cross. */
export function matchGrid(m: MatchState): Grid {
  return {
    width: m.width,
    height: m.height,
    walkable: (x, y) => isWalkable(m, x, y),
    cost: (x, y) => 1 / terrainSpeed(m, { x, y }),
  };
}

/** Plans a route for the Unit to `goal`, or as close to it as it can get. */
export function planMove(m: MatchState, u: UnitState, goal: CellPos): MovePlan {
  return { goal, path: findPath(matchGrid(m), unitCell(u), goal) ?? [] };
}

/** Sends one Unit walking to a Cell, replacing whatever it was doing. */
export function orderMoveTo(m: MatchState, u: UnitState, goal: CellPos): void {
  u.order = { type: "move", plan: planMove(m, u, goal) };
}

/**
 * Moves the Unit one Tick along its plan. Speed comes from the Unit's stats and
 * the ground it stands on; leftover distance carries past a waypoint so speed
 * stays even. If the next Cell has become blocked (a Building went up), the
 * route is planned again from here.
 */
export function stepAlong(m: MatchState, u: UnitState, plan: MovePlan): "moving" | "arrived" {
  let budget = (UNIT_STATS[u.kind].speed / TICKS_PER_SECOND) * terrainSpeed(m, unitCell(u));
  while (budget > 0) {
    const next = plan.path[0];
    if (!next) break;
    if (!isWalkable(m, next.x, next.y)) {
      plan.path = planMove(m, u, plan.goal).path;
      continue;
    }
    const tx = next.x + 0.5;
    const ty = next.y + 0.5;
    const d = Math.hypot(tx - u.x, ty - u.y);
    if (d <= budget) {
      u.x = tx;
      u.y = ty;
      budget -= d;
      plan.path.shift();
    } else {
      u.x += ((tx - u.x) / d) * budget;
      u.y += ((ty - u.y) / d) * budget;
      budget = 0;
    }
  }
  return plan.path.length === 0 ? "arrived" : "moving";
}

/**
 * Gives each Unit its own end Cell near the target so a group spreads out
 * instead of stacking, keeping off Cells other own Units hold (claimedCells).
 * Units are taken in id order and each takes the nearest Cell left, which
 * keeps the result deterministic.
 */
export function groupGoals(m: MatchState, units: readonly UnitState[], target: CellPos): Map<UnitState, CellPos> {
  const player = units[0]?.owner ?? 0;
  const goals = new Map<UnitState, CellPos>();
  // Ground packed with own Units still takes a move; then the group stands among them.
  let free = freeCellsNear(m, target, units.length, claimedCells(m, player, units));
  if (free.length === 0) free = freeCellsNear(m, target, units.length, new Set());
  if (free.length === 0) return goals;
  const pool = free.slice();
  for (const u of [...units].sort((a, b) => a.id - b.id)) {
    // A crowded spot may have fewer free Cells than Units; then they share.
    if (pool.length === 0) pool.push(...free);
    let best = 0;
    let bestD = Infinity;
    pool.forEach((c, i) => {
      const d = (c.x + 0.5 - u.x) ** 2 + (c.y + 0.5 - u.y) ** 2;
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    goals.set(u, pool.splice(best, 1)[0]!);
  }
  return goals;
}

/**
 * Cells the Player's Units have a claim on, as cellIndex values: where each is
 * walking to, or where it stands when it isn't walking. Units joining a spot
 * (a group move, a rally point, an attack) keep off these so they don't stack.
 */
export function claimedCells(m: MatchState, player: PlayerId, except: readonly UnitState[] = []): Set<number> {
  const claimed = new Set<number>();
  for (const v of m.units.values()) {
    if (v.owner !== player || except.includes(v)) continue;
    const goal = v.order.type === "move" ? v.order.plan.goal : v.order.type === "attack" ? v.order.chase?.goal : null;
    const c = goal ?? unitCell(v);
    claimed.add(cellIndex(m, c.x, c.y));
  }
  return claimed;
}

/** Up to `count` walkable Cells nearest `target` that are not in `taken`, nearest first. */
function freeCellsNear(m: MatchState, target: CellPos, count: number, taken: ReadonlySet<number>): CellPos[] {
  const grid = matchGrid(m);
  const free = { ...grid, walkable: (x: number, y: number) => grid.walkable(x, y) && !taken.has(cellIndex(m, x, y)) };
  return nearbyCells(free, target, count);
}

/** The walkable Cell nearest `target` that is not in `taken`, or null when there is none. */
export function freeCellNear(m: MatchState, target: CellPos, taken: ReadonlySet<number>): CellPos | null {
  return freeCellsNear(m, target, 1, taken)[0] ?? null;
}

export const handleMove: CommandHandler<"move"> = (m, player, command): CommandResult => {
  const units = ownUnits(m, player, command.unitIds);
  if (units.length === 0) return reject("no own Units selected");
  if (!inBounds(m, command.target.x, command.target.y)) return reject("target is off the Map");
  const goals = groupGoals(m, units, command.target);
  if (goals.size === 0) return reject("nowhere to stand near the target");
  for (const [u, goal] of goals) orderMoveTo(m, u, goal);
  return OK;
};

/** Per-Tick system: walks every Unit with a move order, and idles it on arrival. */
export function moveUnits(m: MatchState): void {
  for (const u of m.units.values()) {
    if (u.order.type === "move" && stepAlong(m, u, u.order.plan) === "arrived") u.order = { type: "idle" };
  }
}
