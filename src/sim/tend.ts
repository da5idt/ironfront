import type { CommandResult } from "./commands";
import { OK, reject } from "./commands";
import type { CommandHandler } from "./handlers";
import { claimedCells, type MovePlan, planMove, stepAlong, unitCell } from "./movement";
import type { BuildingState, MatchState, UnitState } from "./state";
import { cellIndex, isWalkable, ownUnits } from "./state";
import { BUILDING_STATS, TEND, TEND_RATES, tendRate, TICKS_PER_SECOND, UNIT_STATS } from "./tuning";
import type { CellPos, EntityId, PlayerId, TendTargetClass, Vec } from "./types";

// Support Units restoring health to their own Player's Units and Buildings. Rules:
// - What a Unit can help, and how fast, is a number per Unit kind and target
//   class in the tuning file. A Unit with no number for a target cannot help it.
// - A Tend Command names one own target. Each Unit in it that can help walks
//   until it is beside the target (in a Cell touching the target's Cell or
//   footprint) and restores health every Tick it is beside it. The others are
//   left as they were. A Unit never Tends itself.
// - A target that moves is followed, but only so far: once it is more than the
//   leash from where it was when the Tend began, the Unit gives up. Measured
//   from there, not from the Unit, so a Unit sent across the Map still goes.
// - It ends, leaving the Unit idle, when the target is at full health, is gone,
//   is beyond the leash or cannot be reached. Several Units may work on one target; the rates add.
// - An idle Unit that can Tend looks, every so often, for the nearest own
//   target below full health it can help within the seek radius, and Tends it
//   as if told to. Idle means no Command in progress, so a Unit on a move, or
//   on a Tend it was given, is never pulled away.
// - Health comes back in whole points, at the Unit's rate a second.
// - Health never goes above full, and nothing is paid.
// - Only own targets: a Player always sees its own Units and Buildings, so
//   whether a Tend Command is accepted never depends on anything out of sight.

/** What a Tend is aimed at. */
type TendTarget = UnitState | BuildingState;

/** A Unit walking to, or working beside, the target of a Tend. */
export interface TendOrder {
  readonly type: "tend";
  readonly targetId: EntityId;
  /** Where the target was when the Tend began; the leash is measured from here. */
  readonly from: Vec;
  /** The walk to a Cell beside the target, or null while standing. */
  walk: MovePlan | null;
  /** Ticks spent at work beside the target, which sets how many whole health points are due. */
  workedTicks: number;
}

function startTend(u: UnitState, t: TendTarget): void {
  u.order = { type: "tend", targetId: t.id, from: { x: t.x, y: t.y }, walk: null, workedTicks: 0 };
}

function isUnit(t: TendTarget): t is UnitState {
  return !("width" in t);
}

function targetClass(t: TendTarget): TendTargetClass {
  return isUnit(t) ? UNIT_STATS[t.kind].class : "building";
}

function maxHp(t: TendTarget): number {
  return isUnit(t) ? UNIT_STATS[t.kind].maxHp : BUILDING_STATS[t.kind].maxHp;
}

/** The Player's own live Unit or Building with that id. */
function ownTarget(m: MatchState, player: PlayerId, id: EntityId): TendTarget | undefined {
  const t = m.units.get(id) ?? m.buildings.get(id);
  return t && t.owner === player && t.hp > 0 ? t : undefined;
}

/** Health a second `u` restores in `t`; 0 when it cannot help it. */
function rateFor(u: UnitState, t: TendTarget): number {
  return u === t ? 0 : tendRate(u.kind, targetClass(t));
}

/** The Cells the target covers, as a box: one Cell for a Unit, the footprint for a Building. */
function targetBox(t: TendTarget): { x: number; y: number; width: number; height: number } {
  if (!isUnit(t)) return t;
  return { ...unitCell(t), width: 1, height: 1 };
}

/** True when the Cell touches the target's Cell or footprint, corners included. */
function isBeside(cell: CellPos, t: TendTarget): boolean {
  const box = targetBox(t);
  return cell.x >= box.x - 1 && cell.x <= box.x + box.width && cell.y >= box.y - 1 && cell.y <= box.y + box.height;
}

/**
 * The Cell beside the target the Unit walks to: the nearest one to it that no
 * other own Unit holds, so two Units on one target take a side each. With every
 * side held it shares one; null when there is nowhere to stand at all.
 */
function standGoal(m: MatchState, u: UnitState, t: TendTarget): CellPos | null {
  const box = targetBox(t);
  const claimed = claimedCells(m, u.owner, [u]);
  let best: CellPos | null = null;
  let bestScore = Infinity;
  for (let y = box.y - 1; y <= box.y + box.height; y++) {
    for (let x = box.x - 1; x <= box.x + box.width; x++) {
      const inside = x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height;
      if (inside || !isWalkable(m, x, y)) continue;
      // A held Cell is taken only when no free one is left, however near it is.
      const held = claimed.has(cellIndex(m, x, y)) ? HELD_CELL_PENALTY : 0;
      const score = Math.hypot(x + 0.5 - u.x, y + 0.5 - u.y) + held;
      if (score < bestScore) {
        best = { x, y };
        bestScore = score;
      }
    }
  }
  return best;
}

/** Added to the distance of a Cell another own Unit holds: more than any Map is wide. */
const HELD_CELL_PENALTY = 1e6;

export const handleTend: CommandHandler<"tend"> = (m, player, command): CommandResult => {
  const units = ownUnits(m, player, command.unitIds);
  if (units.length === 0) return reject("no own Units selected");
  const target = ownTarget(m, player, command.targetId);
  if (!target) return reject("target is not an own Unit or Building");
  const helpers = units.filter((u) => rateFor(u, target) > 0);
  if (helpers.length === 0) return reject("no selected Unit can help that target");
  for (const u of helpers) startTend(u, target);
  return OK;
};

/** One Tick of a Tend: walk until beside the target, and restore health while beside it. */
function advanceTend(m: MatchState, u: UnitState, order: TendOrder): void {
  const target = ownTarget(m, u.owner, order.targetId);
  const full = target ? maxHp(target) : 0;
  if (!target || target.hp >= full || Math.hypot(target.x - order.from.x, target.y - order.from.y) > TEND.leash) {
    u.order = { type: "idle" };
    return;
  }
  if (!isBeside(unitCell(u), target) && !(order.walk && isBeside(order.walk.goal, target))) {
    const goal = standGoal(m, u, target);
    if (!goal) {
      u.order = { type: "idle" };
      return;
    }
    order.walk = planMove(m, u, goal);
  }
  if (order.walk && stepAlong(m, u, order.walk) === "arrived") order.walk = null;
  if (!isBeside(unitCell(u), target)) {
    // The route ran out short of the target: it cannot be reached, so give up.
    if (!order.walk) u.order = { type: "idle" };
    return;
  }
  // The rate is spread over the Ticks of a second in whole points (8 a second is
  // 2 every 5 Ticks), so health stays a whole number and any second of work
  // restores the rate exactly.
  const rate = rateFor(u, target);
  const due = (ticks: number): number => Math.floor((ticks * rate) / TICKS_PER_SECOND);
  target.hp = Math.min(full, target.hp + due(order.workedTicks + 1) - due(order.workedTicks));
  order.workedTicks++;
  // Once for a target, however many Units are at work on it: it is one effect to draw and hear.
  if (!m.tends.some((t) => t.targetId === target.id)) m.tends.push({ targetId: target.id, tick: m.tick });
}

/** How far the target is from `from`: to a Unit's position, or to the nearest point of a Building's footprint. */
function distanceTo(t: TendTarget, from: Vec): number {
  if (isUnit(t)) return Math.hypot(t.x - from.x, t.y - from.y);
  const dx = Math.max(t.x - from.x, 0, from.x - (t.x + t.width));
  const dy = Math.max(t.y - from.y, 0, from.y - (t.y + t.height));
  return Math.hypot(dx, dy);
}

/**
 * What an idle Unit goes to help by itself: the nearest own Unit or Building
 * below full health that it can help, within the seek radius. Ties go to the
 * lowest id so replays agree.
 */
function seekTarget(m: MatchState, u: UnitState): TendTarget | undefined {
  let best: TendTarget | undefined;
  let bestD = Infinity;
  const consider = (t: TendTarget): void => {
    if (t.owner !== u.owner || t.hp <= 0 || t.hp >= maxHp(t) || rateFor(u, t) <= 0) return;
    const d = distanceTo(t, u);
    if (d > TEND.seekRadius) return;
    if (d < bestD || (d === bestD && best !== undefined && t.id < best.id)) {
      best = t;
      bestD = d;
    }
  };
  for (const t of m.units.values()) consider(t);
  for (const b of m.buildings.values()) consider(b);
  return best;
}

/** True for a Unit kind that can Tend anything at all. */
function canTend(u: UnitState): boolean {
  return TEND_RATES[u.kind] !== undefined;
}

/** Per-Tick system: sets idle support Units to work, then walks and works every Unit on a Tend. */
export function tendTargets(m: MatchState): void {
  m.tends = [];
  for (const u of m.units.values()) {
    // Offset by id so the Units of a group do not all look on the same Tick.
    if (u.order.type === "idle" && canTend(u) && (m.tick + u.id) % TEND.seekTicks === 0) {
      const target = seekTarget(m, u);
      if (target) startTend(u, target);
    }
    if (u.order.type === "tend") advanceTend(m, u, u.order);
  }
}
