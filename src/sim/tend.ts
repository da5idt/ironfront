import { distanceTo } from "./combat";
import type { CommandResult } from "./commands";
import { OK, reject } from "./commands";
import type { CommandHandler } from "./handlers";
import { claimedCells, type MovePlan, planMove, stepAlong, unitCell } from "./movement";
import type { BuildingState, MatchState, UnitState } from "./state";
import { cellIndex, isUnit, isWalkable, ownUnits } from "./state";
import { BUILDING_STATS, TEND, TEND_RATES, tendRate, TICKS_PER_SECOND, UNIT_STATS } from "./tuning";
import type { CellPos, EntityId, PlayerId, TendTargetClass, Vec } from "./types";

// Support Units restoring health to their own Player's Units and Buildings. Rules:
// - What a Unit can help, and how fast, is a number per Unit kind and target
//   class in the tuning file. A Unit with no number for a target cannot help it.
// - A Tend Command names one own target. Each Unit in it that can help walks
//   until it is beside the target (in a Cell touching the target's Cell or
//   footprint) and restores health every Tick it is beside it. The others are
//   left as they were. A Unit never Tends itself.
// - A Tend Command on a target at full health is rejected, like one no Unit in
//   it can help: there is nothing to restore, so the Units keep doing what
//   they were doing.
// - The Unit stands on the nearest side of the target it has a route to, so a
//   target with one side walled off is helped from another.
// - A Unit at 0 health does no work: one killed in a Tick restores nothing in it.
// - A target that moves is followed, but only so far: once it is more than the
//   leash from the straight line between where it and the Unit were when the
//   Tend began, the Unit gives up. Measured from that line, not from where the
//   Unit is now, so a Unit sent across the Map still goes, and a target that
//   walks to meet its support Unit is met, not dropped.
// - It ends, leaving the Unit idle, when the target is at full health, is gone,
//   is beyond the leash or cannot be reached. Several Units may work on one target; the rates add.
// - An idle Unit that can Tend looks, every so often, for the nearest own
//   target below full health it can help within the seek radius, and Tends it
//   as if told to. Idle means no Command in progress, so a Unit on a move, or
//   on a Tend it was given, is never pulled away.
// - By itself it goes only to a target that is standing still: one found, at
//   this look, where it stood at the last. Without that it would give up on a
//   marching target at the leash, start afresh on it or on the next of its
//   group at the following look, and trail a hurt group across the Map, a leash
//   at a time. A target that has stopped within the seek radius is helped,
//   wherever it came from. A Tend Command is always obeyed, moving target or not.
// - A Unit that finds no way to a target leaves that one alone for a while when
//   it looks by itself (the Tend back-off), so a walled-in target costs a route
//   now and then, not on every look, and does not keep the Unit from others it
//   can reach. Each such target has its own back-off. A Tend Command is always
//   tried.
// - Health comes back in whole points, at the Unit's rate a second.
// - Health never goes above full, and nothing is paid.
// - Only own targets: a Player always sees its own Units and Buildings, and
//   their health, so whether a Tend Command is accepted never depends on
//   anything out of sight.

/** What a Tend is aimed at. */
type TendTarget = UnitState | BuildingState;

/** A Unit walking to, or working beside, the target of a Tend. */
export interface Tending {
  readonly type: "tend";
  readonly targetId: EntityId;
  /** Where the target was when the Tend began: one end of the line the leash is measured from. */
  readonly targetFrom: Vec;
  /** Where the Unit was when the Tend began: the other end of the line the leash is measured from. */
  readonly unitFrom: Vec;
  /** The walk to a Cell beside the target, or null while standing. */
  walk: MovePlan | null;
  /** Ticks spent at work beside the target, which sets how many whole health points are due. */
  workedTicks: number;
}

function startTend(u: UnitState, t: TendTarget): void {
  u.order = { type: "tend", targetId: t.id, targetFrom: { x: t.x, y: t.y }, unitFrom: { x: u.x, y: u.y }, walk: null, workedTicks: 0 };
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
export function isBeside(cell: CellPos, t: TendTarget): boolean {
  const box = targetBox(t);
  return cell.x >= box.x - 1 && cell.x <= box.x + box.width && cell.y >= box.y - 1 && cell.y <= box.y + box.height;
}

/** Added to the distance of a Cell another own Unit holds: more than any Map is wide. */
const HELD_CELL_PENALTY = 1e6;

/**
 * The Cells beside the target the Unit could stand in, nearest to it first,
 * with those another own Unit holds last, so two Units on one target take a
 * side each and share one only when every side is held. Empty when there is
 * nowhere to stand at all.
 */
function standGoals(m: MatchState, u: UnitState, t: TendTarget): CellPos[] {
  const box = targetBox(t);
  const claimed = claimedCells(m, u.owner, [u]);
  const scored: { cell: CellPos; score: number }[] = [];
  for (let y = box.y - 1; y <= box.y + box.height; y++) {
    for (let x = box.x - 1; x <= box.x + box.width; x++) {
      const inside = x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height;
      if (inside || !isWalkable(m, x, y)) continue;
      // A held Cell is taken only when no free one is left, however near it is.
      const held = claimed.has(cellIndex(m, x, y)) ? HELD_CELL_PENALTY : 0;
      scored.push({ cell: { x, y }, score: Math.hypot(x + 0.5 - u.x, y + 0.5 - u.y) + held });
    }
  }
  // The sort keeps Cells of equal score in the order found, so replays agree.
  return scored.sort((a, b) => a.score - b.score).map((s) => s.cell);
}

/**
 * The walk to a Cell beside the target: to the first of the nearest few the
 * Unit has a route to, because the nearest by straight line may be cut off
 * while another side is open. With a route to none of them it walks as near as
 * it can get to the nearest; null when there is nowhere to stand at all.
 */
function planStand(m: MatchState, u: UnitState, t: TendTarget): MovePlan | null {
  const goals = standGoals(m, u, t).slice(0, TEND.standTries);
  let nearest: MovePlan | null = null;
  for (const goal of goals) {
    const plan = planMove(m, u, goal);
    const end = plan.path.at(-1) ?? unitCell(u);
    if (end.x === goal.x && end.y === goal.y) return plan;
    nearest ??= plan;
  }
  return nearest;
}

export const handleTend: CommandHandler<"tend"> = (m, player, command): CommandResult => {
  // Another Player's Units named in the Command are dropped and the own ones
  // still obey, as with every other Command: a selection can go stale between
  // the click and the Tick (a Unit lost, or one that was never the Player's),
  // and the rest of it should not stand idle for that. Only a Command with no
  // own Unit in it is rejected.
  const units = ownUnits(m, player, command.unitIds);
  if (units.length === 0) return reject("no own Units selected");
  const target = ownTarget(m, player, command.targetId);
  if (!target) return reject("target is not an own Unit or Building");
  const able = units.filter((u) => rateFor(u, target) > 0);
  if (able.length === 0) return reject("no selected Unit can help that target");
  if (target.hp >= maxHp(target)) return reject("that target is at full health");
  for (const u of able) startTend(u, target);
  return OK;
};

/** How far `p` is from the nearest point of the straight line from `a` to `b`. */
function gapToLine(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const along = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + along * dx), p.y - (a.y + along * dy));
}

/** One Tick of a Tend: walk until beside the target, and restore health while beside it. */
function advanceTend(m: MatchState, u: UnitState, tending: Tending): void {
  const target = ownTarget(m, u.owner, tending.targetId);
  const full = target ? maxHp(target) : 0;
  if (!target || target.hp >= full) {
    u.order = { type: "idle" };
    return;
  }
  if (isUnit(target) && gapToLine(target, tending.targetFrom, tending.unitFrom) > TEND.leash) {
    u.order = { type: "idle" };
    return;
  }
  if (!isBeside(unitCell(u), target) && !(tending.walk && isBeside(tending.walk.goal, target))) {
    tending.walk = planStand(m, u, target);
    if (!tending.walk) {
      giveUpOnUnreachable(m, u, target);
      return;
    }
  }
  // Judged where the walk ends, not when it is planned: a route planned again on the way (a Building went up) may stop short too.
  let stoppedShort = false;
  if (tending.walk && stepAlong(m, u, tending.walk) === "arrived") {
    const cell = unitCell(u);
    stoppedShort = cell.x !== tending.walk.goal.x || cell.y !== tending.walk.goal.y;
    tending.walk = null;
  }
  if (!isBeside(unitCell(u), target)) {
    // Still on the way, or the target moved on as the Unit arrived (a new route next Tick), unless no route reaches it.
    if (stoppedShort) giveUpOnUnreachable(m, u, target);
    return;
  }
  // The rate is spread over the Ticks of a second in whole points, some Ticks
  // giving more than others, so health stays a whole number and any second of
  // work restores the rate exactly.
  const rate = rateFor(u, target);
  const due = (ticks: number): number => Math.floor((ticks * rate) / TICKS_PER_SECOND);
  target.hp = Math.min(full, target.hp + due(tending.workedTicks + 1) - due(tending.workedTicks));
  tending.workedTicks++;
  // Once for a target, however many Units are at work on it: it is one effect to draw and hear.
  if (!m.tends.some((t) => t.targetId === target.id)) m.tends.push({ targetId: target.id, tick: m.tick });
}

/** Ends a Tend the Unit found no way to the target of, and starts the Tend back-off so it does not come straight back by itself. */
function giveUpOnUnreachable(m: MatchState, u: UnitState, t: TendTarget): void {
  u.order = { type: "idle" };
  u.tendBackOff.set(t.id, m.tick + TEND.backOffTicks);
}

/** Drops the targets that are gone and the back-offs that are over, so the memory does not grow through a long Match. */
function forgetStale(m: MatchState, u: UnitState): void {
  const gone = (id: EntityId): boolean => !m.units.has(id) && !m.buildings.has(id);
  for (const [id, untilTick] of u.tendBackOff) {
    if (m.tick >= untilTick || gone(id)) u.tendBackOff.delete(id);
  }
}

/**
 * One look around: notes where everything the Unit could help within the seek
 * radius stands, and returns what an idle Unit goes to by itself: the nearest
 * of them that stands where it stood at the last look. Ties go to the lowest
 * id so replays agree.
 */
function look(m: MatchState, u: UnitState): TendTarget | undefined {
  let best: TendTarget | undefined;
  let bestD = Infinity;
  const stoodAt = new Map<EntityId, Vec>();
  const consider = (t: TendTarget): void => {
    if (t.owner !== u.owner || t.hp <= 0 || t.hp >= maxHp(t) || rateFor(u, t) <= 0) return;
    const d = distanceTo(t, u);
    if (d > TEND.seekRadius) return;
    stoodAt.set(t.id, { x: t.x, y: t.y });
    const stood = u.stoodAt.get(t.id);
    if (!stood || stood.x !== t.x || stood.y !== t.y) return;
    if (m.tick < (u.tendBackOff.get(t.id) ?? 0)) return;
    if (d < bestD || (d === bestD && best !== undefined && t.id < best.id)) {
      best = t;
      bestD = d;
    }
  };
  for (const t of m.units.values()) consider(t);
  for (const b of m.buildings.values()) consider(b);
  u.stoodAt = stoodAt;
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
    // Killed this Tick and not yet removed: it does no more work.
    if (u.hp <= 0) continue;
    // Offset by id so the Units of a group do not all look on the same Tick.
    if (canTend(u) && (m.tick + u.id) % TEND.seekTicks === 0) {
      forgetStale(m, u);
      // Every look notes what stands where, at work or not, so a Unit that ends one Tend can go straight to the next.
      const target = look(m, u);
      if (target && u.order.type === "idle") startTend(u, target);
    }
    if (u.order.type === "tend") advanceTend(m, u, u.order);
  }
}

/** The nearest Cell beside the target the Unit could stand in, or null when there is none: Boarding walks to it as a Tend does. */
export function standGoal(m: MatchState, u: UnitState, t: TendTarget): CellPos | null {
  return standGoals(m, u, t)[0] ?? null;
}
