import type { CommandResult } from "./commands";
import { OK, reject } from "./commands";
import { type BuildingSighting, isFootprintVisible, isVisible } from "./fog";
import type { CommandHandler } from "./handlers";
import { claimedCells, freeCellNear, planMove, stepAlong, unitCell, walkingTo } from "./movement";
import type { BuildingState, MatchState, UnitState } from "./state";
import { cellIndex, ownUnits, removeBuilding } from "./state";
import { BUILDING_STATS, UNIT_STATS, type WeaponStats } from "./tuning";
import type { CellPos, EntityId, PlayerId, Vec } from "./types";

// Units shooting at Units and Buildings. Rules:
// - Nobody shoots at what its Player cannot see: an attack Command needs a
//   Visible enemy Unit, or an enemy Building seen now or remembered under Fog
//   of War. A Unit sent at a remembered Building walks there and gives up if
//   the Building turns out to be gone, and a chase ends when the target Unit
//   walks out of sight.
// - An attack order chases the target into range, fires on reload, and ends
//   (the Unit goes idle) when the target dies or can no longer be reached.
// - Idle Units hold their ground and fire at the nearest Visible enemy Unit in
//   range, so they return fire; only with no enemy Unit in range do they fire
//   at an enemy Building. Units on a move order do not fire until they arrive:
//   a move is how the person pulls Units out of a fight.
// - Turrets fire by themselves at the nearest Visible enemy Unit in range,
//   never at Buildings: they defend a base, they don't besiege one.
// - All shots in a Tick land before the dead are removed, so two Units that
//   kill each other in the same Tick both die, whatever their ids.

/** Anything that can be shot. */
type Target = UnitState | BuildingState;

/** A target as a Player knows it: a remembered Building may already be gone. */
type KnownTarget = Target | BuildingSighting;

function isUnit(t: KnownTarget): t is UnitState {
  return !("width" in t);
}

function canSeeUnit(m: MatchState, player: PlayerId, u: UnitState): boolean {
  return isVisible(m.fog[player], cellIndex(m, Math.floor(u.x), Math.floor(u.y)));
}

function canSeeBuilding(m: MatchState, player: PlayerId, b: BuildingState): boolean {
  return isFootprintVisible(m, m.fog[player], b);
}

/**
 * The live enemy `id` names, as `player` knows it: a Visible Unit, or a
 * Building the Player has a sighting of (seen now or remembered). For a
 * remembered Building that has since gone, the sighting itself.
 */
function knownTarget(m: MatchState, player: PlayerId, id: EntityId): KnownTarget | undefined {
  const u = m.units.get(id);
  if (u) return u.owner !== player && u.hp > 0 && canSeeUnit(m, player, u) ? u : undefined;
  const seen = m.fog[player].sightings.get(id);
  if (!seen) return undefined;
  const live = m.buildings.get(id);
  return live && live.hp > 0 ? live : seen;
}

/** True when the target is really there to be hit, not a memory of a Building. */
function isLive(m: MatchState, t: KnownTarget): t is Target {
  return t.hp > 0 && (isUnit(t) ? m.units.get(t.id) === t : m.buildings.get(t.id) === t);
}

/**
 * The point of the target that range is measured to, seen from `from`: a
 * Unit's position, or the nearest point of a Building's footprint, so a big
 * Building can be hit from any side without walking round to its middle.
 */
function aimPoint(t: KnownTarget, from: Vec): Vec {
  if (isUnit(t)) return { x: t.x, y: t.y };
  // The far edges are a hair inside, so the point always floors into a footprint
  // Cell: on the edge itself it would belong to the Cell beside the Building
  // (or, on the Map's right edge, wrap to the next row of Cells).
  return {
    x: clamp(from.x, t.x, t.x + t.width - INSIDE_EDGE),
    y: clamp(from.y, t.y, t.y + t.height - INSIDE_EDGE),
  };
}

/** How far inside a footprint's far edges an aim point stays: far below anything range or drawing can tell apart. */
const INSIDE_EDGE = 1e-6;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * The Cell of the target a chasing Unit heads for: the target Unit's own, or
 * the footprint Cell on the side nearest the Unit.
 */
function targetCell(t: KnownTarget, from: Vec): CellPos {
  if (isUnit(t)) return unitCell(t);
  const p = aimPoint(t, from);
  return { x: Math.min(Math.floor(p.x), t.x + t.width - 1), y: Math.min(Math.floor(p.y), t.y + t.height - 1) };
}

/**
 * The Cell a chasing Unit walks towards: the free Cell nearest the target that
 * no other own Unit stands on or is heading for, so attackers fan out round
 * the target instead of queueing up on one Cell. A footprint can't be stood
 * on, so for a Building that is a Cell beside it. Units are handled in id
 * order and each keeps its Cell while the target stays put, so it is stable.
 */
function chaseGoal(m: MatchState, u: UnitState, t: KnownTarget): CellPos {
  const anchor = targetCell(t, u);
  return freeCellNear(m, anchor, claimedCells(m, u.owner, [u])) ?? anchor;
}

/** True when another own Unit is standing less than a Cell from this one, so they would overlap. */
function crowdsStanding(m: MatchState, u: UnitState): boolean {
  for (const v of m.units.values()) {
    if (v !== u && v.owner === u.owner && !walkingTo(v) && Math.hypot(v.x - u.x, v.y - u.y) < 1) return true;
  }
  return false;
}

function canFight(u: UnitState): boolean {
  return UNIT_STATS[u.kind].damage > 0;
}

function distanceTo(t: KnownTarget, from: Vec): number {
  const p = aimPoint(t, from);
  return Math.hypot(p.x - from.x, p.y - from.y);
}

function inRange(u: UnitState, t: KnownTarget): boolean {
  return distanceTo(t, u) <= UNIT_STATS[u.kind].range;
}

export const handleAttack: CommandHandler<"attack"> = (m, player, command): CommandResult => {
  const target = knownTarget(m, player, command.targetId);
  if (!target) return reject("target is not an enemy this Player can see");
  const units = ownUnits(m, player, command.unitIds).filter(canFight);
  if (units.length === 0) return reject("no own armed Units selected");
  for (const u of units) u.order = { type: "attack", targetId: target.id, chase: null };
  return OK;
};

/** A Unit or Turret firing from `from` with its weapon, if reloaded. */
function fire(m: MatchState, shooter: { cooldown: number }, from: Vec, weapon: WeaponStats, t: Target): void {
  if (shooter.cooldown > 0) return;
  const p = aimPoint(t, from);
  t.hp -= weapon.damage;
  shooter.cooldown = weapon.reloadTicks;
  m.shots.push({ fromX: from.x, fromY: from.y, toX: p.x, toY: p.y, tick: m.tick });
}

function canFire(b: BuildingState): boolean {
  return BUILDING_STATS[b.kind].damage > 0;
}

/** A Turret shoots from the centre of its footprint. */
function centre(b: BuildingState): Vec {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** The nearest of the candidates within `range` of `from`; ties go to the lowest id so replays agree. */
function nearest<T extends Target>(candidates: Iterable<T>, from: Vec, range: number): T | undefined {
  let best: T | undefined;
  let bestD = Infinity;
  for (const t of candidates) {
    const d = distanceTo(t, from);
    if (d > range) continue;
    if (d < bestD || (d === bestD && best !== undefined && t.id < best.id)) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

function* visibleEnemyUnits(m: MatchState, player: PlayerId): Iterable<UnitState> {
  for (const t of m.units.values()) if (t.owner !== player && t.hp > 0 && canSeeUnit(m, player, t)) yield t;
}

function* visibleEnemyBuildings(m: MatchState, player: PlayerId): Iterable<BuildingState> {
  for (const b of m.buildings.values()) if (b.owner !== player && b.hp > 0 && canSeeBuilding(m, player, b)) yield b;
}

/** What an idle Unit fires at: enemy Units first, as they shoot back; Buildings only when no Unit is in range. */
function idleTarget(m: MatchState, u: UnitState): Target | undefined {
  const range = UNIT_STATS[u.kind].range;
  return nearest(visibleEnemyUnits(m, u.owner), u, range) ?? nearest(visibleEnemyBuildings(m, u.owner), u, range);
}

function pursue(m: MatchState, u: UnitState, order: Extract<UnitState["order"], { type: "attack" }>): void {
  const target = knownTarget(m, u.owner, order.targetId);
  if (!target) {
    u.order = { type: "idle" };
    return;
  }
  let goal: CellPos | null = null;
  if (inRange(u, target)) {
    // In range of a remembered Building that is gone: wait for the Fog of War
    // to show it gone (the next Tick, as range is within sight), which ends the order.
    if (isLive(m, target)) fire(m, u, u, UNIT_STATS[u.kind], target);
    // Attackers coming the same way reach range at the same spot, so a later
    // one walks on (still firing) to a Cell of its own. When no free Cell in
    // range is left it shares rather than walk out of range.
    const arrived = order.chase !== null && order.chase.path.length === 0;
    if (!arrived && crowdsStanding(m, u)) goal = chaseGoal(m, u, target);
    if (!goal || !inRange({ ...u, x: goal.x + 0.5, y: goal.y + 0.5 }, target)) {
      order.chase = null;
      return;
    }
  }
  goal ??= chaseGoal(m, u, target);
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
  for (const b of m.buildings.values()) {
    if (b.cooldown > 0) b.cooldown--;
  }
  for (const u of m.units.values()) {
    if (!canFight(u)) continue;
    if (u.order.type === "attack") {
      pursue(m, u, u.order);
    } else if (u.order.type === "idle") {
      const t = idleTarget(m, u);
      if (t) fire(m, u, u, UNIT_STATS[u.kind], t);
    }
  }
  for (const b of m.buildings.values()) {
    if (!canFire(b)) continue;
    const weapon = BUILDING_STATS[b.kind];
    const from = centre(b);
    const t = nearest(visibleEnemyUnits(m, b.owner), from, weapon.range);
    if (t) fire(m, b, from, weapon, t);
  }
}

/** Per-Tick system: Units and Buildings at zero health leave the Match. */
export function removeDead(m: MatchState): void {
  for (const u of [...m.units.values()]) {
    if (u.hp <= 0) m.units.delete(u.id);
  }
  for (const b of [...m.buildings.values()]) {
    if (b.hp <= 0) removeBuilding(m, b);
  }
}
