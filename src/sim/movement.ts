import type { CommandResult } from "./commands";
import { OK, reject } from "./commands";
import type { CommandHandler } from "./handlers";
import { findPath, type Grid, nearbyCells } from "./pathfinding";
import type { MatchState, MoveStart, UnitState } from "./state";
import { cellIndex, inBounds, isMoveOrAttackMove, isWalkable, ownUnits, terrainAt } from "./state";
import { MOVEMENT, TICKS_PER_SECOND, UNIT_STATS } from "./tuning";
import type { CellPos, EntityId, PlayerId } from "./types";

// Getting Units from one Cell to another. `orderMoveTo` and `stepAlong` are the
// building blocks later orders (harvest, attack, Attack-move) reuse to walk somewhere.

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
  const at = unitCell(u);
  // Sent to the Cell it is in, the route is that Cell: a Unit that stopped off its centre ends on it, as after
  // any other move. Not when the Cell cannot be walked (a Building went up over it), which `stepAlong` would
  // plan again for ever.
  if (at.x === goal.x && at.y === goal.y && isWalkable(m, goal.x, goal.y)) return { goal, path: [goal] };
  return { goal, path: findPath(matchGrid(m), at, goal) ?? [] };
}

/**
 * The start of a move or an Attack-move the Unit is being set on now. One already on either keeps the start it
 * has, the same object: a second Command on the way, to the same Cell or another, is the same drive, and a
 * Troop Carrier is Collecting by how far it stops from where it last stood. Any other order between them,
 * a stop included, ends the drive.
 */
export function moveStart(u: UnitState): MoveStart {
  if (isMoveOrAttackMove(u.order)) return u.order.start;
  return { from: { x: u.x, y: u.y }, empty: u.passengers.length === 0 };
}

/** Sends one Unit walking to a Cell, replacing whatever it was doing. */
export function orderMoveTo(m: MatchState, u: UnitState, goal: CellPos): void {
  u.order = { type: "move", plan: planMove(m, u, goal), start: moveStart(u) };
}

/**
 * Per-Tick system, before anything walks: notes the move each Unit begins the
 * Tick on. Commands come between Ticks, so a Unit noted here that stands idle
 * later in the Tick got there by arriving and in no other way, and no arrival
 * has to say so itself.
 */
export function noteMoves(m: MatchState): void {
  for (const u of m.units.values()) u.moveAtTickStart = isMoveOrAttackMove(u.order) ? u.order.start : null;
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

/** Where the Unit is walking to, or null when it is standing. */
export function walkingTo(u: UnitState): CellPos | null {
  if (u.order.type === "move") return u.order.plan.goal;
  // An Attack-move that has stopped to fire is standing, so others keep off the Cell it is on, not the one it will go to.
  // One stepping aside to a spot of its own is walking there, not to the end of its route.
  if (u.order.type === "attackMove") return u.order.firing ? null : (u.order.spot?.goal ?? u.order.plan.goal);
  if (u.order.type === "attack") return u.order.chase?.goal ?? null;
  if (u.order.type === "tend" || u.order.type === "board") return u.order.walk?.goal ?? null;
  return null;
}

/**
 * Cells the Player's Units have a claim on, as cellIndex values: where each is
 * walking to, or, for one standing, every Cell whose centre is less than a Cell
 * from it (one standing between Cells, as an attacker that stopped in range
 * may, overlaps its neighbours). Units joining a spot (a group move, a rally
 * point, an attack) keep off these so they don't stack.
 */
export function claimedCells(m: MatchState, player: PlayerId, except: readonly UnitState[] = []): Set<number> {
  const claimed = new Set<number>();
  for (const v of m.units.values()) {
    if (v.owner !== player || except.includes(v)) continue;
    const goal = walkingTo(v);
    if (goal) {
      claimed.add(cellIndex(m, goal.x, goal.y));
      continue;
    }
    for (let y = Math.floor(v.y - 0.5); y <= Math.floor(v.y + 0.5); y++) {
      for (let x = Math.floor(v.x - 0.5); x <= Math.floor(v.x + 0.5); x++) {
        if (inBounds(m, x, y) && Math.hypot(x + 0.5 - v.x, y + 0.5 - v.y) < 1) claimed.add(cellIndex(m, x, y));
      }
    }
  }
  return claimed;
}

/** Up to `count` walkable Cells nearest `target` that are not in `taken`, nearest first. */
export function freeCellsNear(m: MatchState, target: CellPos, count: number, taken: ReadonlySet<number>): CellPos[] {
  const grid = matchGrid(m);
  const free = { ...grid, walkable: (x: number, y: number) => grid.walkable(x, y) && !taken.has(cellIndex(m, x, y)) };
  return nearbyCells(free, target, count);
}

/** The walkable Cell nearest `target` that is not in `taken`, or null when there is none. */
export function freeCellNear(m: MatchState, target: CellPos, taken: ReadonlySet<number>): CellPos | null {
  return freeCellsNear(m, target, 1, taken)[0] ?? null;
}

/**
 * Checks a Command that sends a Player's Units to a Cell (move, Attack-move)
 * and gives each Unit its goal, or the reason the Command is rejected.
 */
export function groupMoveGoals(
  m: MatchState,
  player: PlayerId,
  unitIds: readonly EntityId[],
  target: CellPos,
): Map<UnitState, CellPos> | CommandResult {
  const units = ownUnits(m, player, unitIds);
  if (units.length === 0) return reject("no own Units selected");
  if (!inBounds(m, target.x, target.y)) return reject("target is off the Map");
  const goals = groupGoals(m, units, target);
  return goals.size === 0 ? reject("nowhere to stand near the target") : goals;
}

export const handleMove: CommandHandler<"move"> = (m, player, command): CommandResult => {
  const goals = groupMoveGoals(m, player, command.unitIds, command.target);
  if (!(goals instanceof Map)) return goals;
  for (const [u, goal] of goals) orderMoveTo(m, u, goal);
  return OK;
};

/** Per-Tick system: walks every Unit with a move order, and idles it on arrival. */
export function moveUnits(m: MatchState): void {
  for (const u of m.units.values()) {
    if (u.order.type === "move" && stepAlong(m, u, u.order.plan) === "arrived") u.order = { type: "idle" };
  }
}
