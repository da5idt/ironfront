import type { CommandResult } from "./commands";
import { OK, reject } from "./commands";
import type { CommandHandler } from "./handlers";
import { planMove, stepAlong, unitCell } from "./movement";
import type { MatchState, UnitState } from "./state";
import { ownUnits } from "./state";
import { UNIT_STATS } from "./tuning";
import type { CellPos, EntityId, PlayerId, Vec } from "./types";

// Units shooting at each other. Rules:
// - An attack order chases the target into range, fires on reload, and ends
//   (the Unit goes idle) when the target dies or can no longer be reached.
// - Idle Units hold their ground and fire at the nearest enemy in range, so
//   they return fire. Units on a move order do not fire until they arrive:
//   a move is how the person pulls Units out of a fight.
// - All shots in a Tick land before the dead are removed, so two Units that
//   kill each other in the same Tick both die, whatever their ids.

/**
 * Anything a Unit can shoot at. Only Units for now; Buildings join this union
 * by extending `targetById`, `aimPoint` and `chaseGoal`.
 */
type Target = UnitState;

function targetById(m: MatchState, id: EntityId): Target | undefined {
  return m.units.get(id);
}

/** The point of the target that range is measured to, seen from `from`. */
function aimPoint(t: Target, _from: Vec): Vec {
  return { x: t.x, y: t.y };
}

/** The Cell a chasing Unit walks towards. */
function chaseGoal(t: Target): CellPos {
  return unitCell(t);
}

function canFight(u: UnitState): boolean {
  return UNIT_STATS[u.kind].damage > 0;
}

function inRange(u: UnitState, t: Target): boolean {
  const p = aimPoint(t, u);
  return Math.hypot(p.x - u.x, p.y - u.y) <= UNIT_STATS[u.kind].range;
}

/** A target is fair game while it is alive and belongs to the other Player. */
function isLiveEnemy(t: Target | undefined, owner: PlayerId): t is Target {
  return t !== undefined && t.owner !== owner && t.hp > 0;
}

export const handleAttack: CommandHandler<"attack"> = (m, player, command): CommandResult => {
  const target = targetById(m, command.targetId);
  if (!isLiveEnemy(target, player)) return reject("target is not an enemy");
  const units = ownUnits(m, player, command.unitIds).filter(canFight);
  if (units.length === 0) return reject("no own armed Units selected");
  for (const u of units) u.order = { type: "attack", targetId: target.id, chase: null };
  return OK;
};

function fire(m: MatchState, u: UnitState, t: Target): void {
  if (u.cooldown > 0) return;
  const stats = UNIT_STATS[u.kind];
  const p = aimPoint(t, u);
  t.hp -= stats.damage;
  u.cooldown = stats.reloadTicks;
  m.shots.push({ fromX: u.x, fromY: u.y, toX: p.x, toY: p.y, tick: m.tick });
}

/** The nearest live enemy in weapon range; ties go to the lowest id so replays agree. */
function nearestEnemyInRange(m: MatchState, u: UnitState): Target | undefined {
  let best: Target | undefined;
  let bestD = Infinity;
  for (const t of m.units.values()) {
    if (!isLiveEnemy(t, u.owner) || !inRange(u, t)) continue;
    const p = aimPoint(t, u);
    const d = Math.hypot(p.x - u.x, p.y - u.y);
    if (d < bestD || (d === bestD && best !== undefined && t.id < best.id)) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

function pursue(m: MatchState, u: UnitState, order: Extract<UnitState["order"], { type: "attack" }>): void {
  const target = targetById(m, order.targetId);
  if (!isLiveEnemy(target, u.owner)) {
    u.order = { type: "idle" };
    return;
  }
  if (inRange(u, target)) {
    order.chase = null;
    fire(m, u, target);
    return;
  }
  const goal = chaseGoal(target);
  if (!order.chase || order.chase.goal.x !== goal.x || order.chase.goal.y !== goal.y) {
    order.chase = planMove(m, u, goal);
  }
  // The route ran out short of range: the target cannot be reached, so give up.
  if (stepAlong(m, u, order.chase) === "arrived" && !inRange(u, target)) u.order = { type: "idle" };
}

/** Per-Tick system: reloads, chases and fires. */
export function fight(m: MatchState): void {
  m.shots = [];
  for (const u of m.units.values()) {
    if (u.cooldown > 0) u.cooldown--;
  }
  for (const u of m.units.values()) {
    if (!canFight(u)) continue;
    if (u.order.type === "attack") {
      pursue(m, u, u.order);
    } else if (u.order.type === "idle") {
      const t = nearestEnemyInRange(m, u);
      if (t) fire(m, u, t);
    }
  }
}

/** Per-Tick system: Units at zero health leave the Match. */
export function removeDead(m: MatchState): void {
  for (const u of [...m.units.values()]) {
    if (u.hp <= 0) m.units.delete(u.id);
  }
}
