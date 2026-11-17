import {
  type BuildingView,
  type Command,
  type EntityId,
  OPPONENT,
  type PlayerView,
  TEND,
  tendRate,
  UNIT_STATS,
  type UnitView,
  type Vec,
} from "../sim";
import { ownBuildings, ownPassengers, type Standing } from "./base";
import { rallyPoint } from "./economy";
import { DEFEND_RADIUS, distanceTo, distanceToCell, STUCK_THINKS } from "./tactics";

// The Computer Opponent's support Units once they are trained. Medics need no
// Command to work: they wait at the rally point and Heal by themselves whoever
// comes home hurt, and are only sent back there when that has taken them off
// it. Mechanics do, because the Buildings they Repair are mostly farther from
// the rally point than an idle support Unit looks.

/**
 * Leave-alone times: for each support Unit, the targets the Opponent took it to have no way to, each with the
 * Tick the wait is over. (The Simulation's Tend back-off is the Unit's own wait; it never holds up a Tend
 * Command and no view shows it, so the Opponent keeps this one itself.)
 */
type LeftAlone = Map<EntityId, Map<EntityId, number>>;

function leaveAlone(leftAlone: LeftAlone, unit: EntityId, target: EntityId, tick: number): void {
  leftAlone.set(unit, new Map(leftAlone.get(unit)).set(target, tick + OPPONENT.leaveAloneTicks));
}

/** Drops the Leave-alone times that are over. */
function endLeaveAlone(leftAlone: LeftAlone, tick: number): void {
  for (const [id, targets] of leftAlone) {
    for (const [target, until] of targets) if (tick >= until) targets.delete(target);
    if (targets.size === 0) leftAlone.delete(id);
  }
}

/** The Opponent's notes on its Mechanics. A Player view does not say what a Unit is doing. */
export interface TendMemory {
  /** The Building each Mechanic at work was last told to Tend, by Mechanic. */
  readonly jobs: Map<EntityId, EntityId>;
  /** The Buildings each Mechanic found no way to and gets no Tend Command onto until the Leave-alone time is over. */
  readonly leftAlone: LeftAlone;
}

export function createTendMemory(): TendMemory {
  return { jobs: new Map(), leftAlone: new Map() };
}

/** Forgets the notes on Units the Opponent no longer has. */
function forgetGone(notes: Set<EntityId> | Map<EntityId, unknown>, has: (id: EntityId) => boolean): void {
  for (const id of notes.keys()) if (!has(id)) notes.delete(id);
}

/**
 * Tend Commands for Mechanics with nothing to do, onto the Opponent's damaged
 * Buildings, and a move home for those whose work is done. A Mechanic gets the
 * Command once per Building. One that has stopped short of its Building, which
 * is how a Tend that found no way there looks from the view, gets no Tend
 * Command onto that Building until the Leave-alone time is over: given one at once it
 * would stop short again, think after think, for as long as the Building is
 * damaged.
 */
export function tendCommands(view: PlayerView, memory: TendMemory, standing: Standing): Command[] {
  const { jobs, leftAlone } = memory;
  const mechanics = view.units.filter((u) => u.owner === view.playerId && u.kind === "mechanic");
  const damaged = ownBuildings(view).filter((b) => b.hp < b.maxHp);
  // A Mechanic inside a Troop Carrier is not lost: its job is kept, so its Building
  // is not taken for one with nobody on it. If it gets out and stops on the way, it is
  // seen to have given up like any other: the Building is left alone for a while and it goes home.
  const inside = ownPassengers(view);
  const alive = (id: EntityId): boolean => mechanics.some((u) => u.id === id) || inside.some((p) => p.id === id);
  forgetGone(jobs, alive);
  forgetGone(leftAlone, alive);
  endLeaveAlone(leftAlone, view.tick);

  const free: UnitView[] = [];
  /** Those whose job has ended, done or given up: they go home unless another Building needs them. */
  const ended: UnitView[] = [];
  for (const u of mechanics) {
    const job = jobs.get(u.id);
    if (job === undefined) {
      free.push(u);
      continue;
    }
    const target = damaged.find((b) => b.id === job);
    const gaveUp = target && standing.thinks(u.id) >= STUCK_THINKS && distanceTo(target, u) > OPPONENT.atWorkCells;
    if (target && !gaveUp) continue;
    if (target) leaveAlone(leftAlone, u.id, target.id, view.tick);
    jobs.delete(u.id);
    free.push(u);
    ended.push(u);
  }

  // Mechanics are unarmed: a Building is Repaired once none of the other Player's Units is seen near it.
  const others = view.units.filter((u) => u.owner !== view.playerId);
  const safe = damaged.filter((b) => !others.some((u) => distanceTo(b, u) <= DEFEND_RADIUS));
  const crews = new Map<EntityId, EntityId[]>();
  for (const b of damaged) crews.set(b.id, [...jobs].filter(([, job]) => job === b.id).map(([id]) => id));
  const sent = new Map<EntityId, EntityId[]>();
  const goingHome: EntityId[] = [];
  for (const u of free) {
    const target = neediest(
      safe.filter((b) => !leftAlone.get(u.id)?.has(b.id)),
      crews,
    );
    if (!target) {
      if (ended.includes(u)) goingHome.push(u.id);
      continue;
    }
    jobs.set(u.id, target.id);
    standing.restart(u.id);
    crews.get(target.id)!.push(u.id);
    sent.set(target.id, [...(sent.get(target.id) ?? []), u.id]);
  }

  const commands: Command[] = [...sent].map(([targetId, unitIds]) => ({ type: "tend", unitIds, targetId }));
  // Back to the rally point, where Vehicles home from a fight stop within its reach.
  if (goingHome.length > 0) commands.push({ type: "move", unitIds: goingHome, target: rallyPoint(view) });
  return commands;
}

/** The Building with the fewest Mechanics on it, then the one missing the larger share of its health, then the lowest id. */
function neediest(
  buildings: readonly BuildingView[],
  crews: ReadonlyMap<EntityId, readonly EntityId[]>,
): BuildingView | null {
  const key = (b: BuildingView) => [crews.get(b.id)!.length, b.hp / b.maxHp, b.id] as const;
  let best: BuildingView | null = null;
  for (const b of buildings) {
    if (!best) {
      best = b;
      continue;
    }
    const [k, bestKey] = [key(b), key(best)];
    const differs = k.findIndex((v, i) => v !== bestKey[i]);
    if (differs >= 0 && k[differs]! < bestKey[differs]!) best = b;
  }
  return best;
}

/**
 * The Opponent's notes on its Medics: those sent back to the rally point and
 * not yet seen to stop, where each stopped the last time it was sent, and the
 * hurt Units each was taken to have no way to.
 */
export interface MedicMemory {
  readonly onTheWay: Set<EntityId>;
  readonly stoppedAt: Map<EntityId, Vec>;
  /** The hurt Units that do not keep each Medic away from the rally point until the Leave-alone time is over. */
  readonly leftAlone: LeftAlone;
}

export function createMedicMemory(): MedicMemory {
  return { onTheWay: new Set(), stoppedAt: new Map(), leftAlone: new Map() };
}

/**
 * A move back to the rally point for Medics that Healing has led away from
 * it: each walk to someone hurt can end a few Cells farther off, and over a
 * long Match that adds up to a Medic out of reach of the Units that come home.
 * A Medic is left alone while a move would end a Tend: while it is Healing,
 * and while a hurt Infantry Unit stands still within its seek radius, which
 * it goes to by itself. One that is hurt but on the move it never goes to, so
 * that one does not keep it out. Nor does one it has no way to, across water
 * say: the view does not show that, but an idle Medic with a way sets off
 * within a think or two, so when the Medic and the hurt Unit have both stood
 * for a few thinks, the Opponent takes it that there is none and leaves that
 * Unit alone for a while. The Medic is also left where it stopped the last
 * time it was sent, if that was not at the rally point, since the Units
 * crowding it let the Medic no nearer.
 */
export function medicCommands(view: PlayerView, memory: MedicMemory, standing: Standing): Command[] {
  const own = view.units.filter((u) => u.owner === view.playerId);
  const medics = own.filter((u) => u.kind === "medic");
  const isMedic = (id: EntityId): boolean => medics.some((u) => u.id === id);
  forgetGone(memory.onTheWay, isMedic);
  forgetGone(memory.stoppedAt, isMedic);
  forgetGone(memory.leftAlone, isMedic);
  endLeaveAlone(memory.leftAlone, view.tick);

  const rally = rallyPoint(view);
  const canHeal = own.filter((u) => tendRate("medic", UNIT_STATS[u.kind].class) > 0);
  // Standing where it stood at the last think: the Opponent's own count, as a view does not say who is moving.
  const hurtAndStill = canHeal.filter((u) => u.hp < u.maxHp && standing.thinks(u.id) > 0);
  // The view names the target of a Tend, not who works on it: a Medic beside a Unit being Healed is taken to be at it.
  const beingHealed = view.tends.filter((t) => canHeal.some((u) => u.id === t.targetId));
  const back: EntityId[] = [];
  for (const u of medics) {
    if (standing.thinks(u.id) < STUCK_THINKS) continue;
    if (memory.onTheWay.delete(u.id)) memory.stoppedAt.set(u.id, { x: u.x, y: u.y });
    if (distanceToCell(rally, u) <= OPPONENT.medicStrayCells) continue;
    if (beingHealed.some((t) => t.targetId !== u.id && distanceTo(u, t) <= OPPONENT.healingWithinCells)) continue;
    const leftAlone = memory.leftAlone.get(u.id);
    const mayGoTo = hurtAndStill.filter(
      (h) => h.id !== u.id && distanceTo(h, u) <= TEND.seekRadius && !leftAlone?.has(h.id),
    );
    const stoodBy = (h: UnitView): boolean => Math.min(standing.thinks(u.id), standing.thinks(h.id)) >= OPPONENT.medicNoWayThinks;
    for (const h of mayGoTo.filter(stoodBy)) leaveAlone(memory.leftAlone, u.id, h.id, view.tick);
    if (mayGoTo.some((h) => !stoodBy(h))) continue;
    const last = memory.stoppedAt.get(u.id);
    if (last && distanceTo(u, last) <= OPPONENT.medicSamePlaceCells) continue;
    memory.onTheWay.add(u.id);
    standing.restart(u.id);
    back.push(u.id);
  }
  return back.length > 0 ? [{ type: "move", unitIds: back, target: rally }] : [];
}
