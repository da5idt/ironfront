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

/** The Opponent's notes on its Mechanics. A Player view does not say what a Unit is doing. */
export interface TendMemory {
  /** The Building each Mechanic at work was last told to Tend, by Mechanic. */
  readonly jobs: Map<EntityId, EntityId>;
  /** The Buildings a Mechanic found no way to, each with the Tick from which it may be sent there again, by Mechanic. */
  readonly noWay: Map<EntityId, Map<EntityId, number>>;
}

export function createTendMemory(): TendMemory {
  return { jobs: new Map(), noWay: new Map() };
}

/** How near its Building a Mechanic standing still counts as at work on it, not stopped short. */
const AT_WORK = 1.5;

/**
 * Tend Commands for Mechanics with nothing to do, onto the Opponent's damaged
 * Buildings, and a move home for those whose work is done. A Mechanic gets the
 * Command once per Building. One that has stopped short of its Building, which
 * is how a Tend that found no way there looks from the view, is kept off that
 * Building for a while: sent again at once it would stop short again, think
 * after think, for as long as the Building is damaged.
 */
export function tendCommands(view: PlayerView, memory: TendMemory, standing: Standing): Command[] {
  const { jobs, noWay } = memory;
  const mechanics = view.units.filter((u) => u.owner === view.playerId && u.kind === "mechanic");
  const damaged = ownBuildings(view).filter((b) => b.hp < b.maxHp);
  // A Mechanic inside a Troop Carrier is not lost: its job is kept, so its Building
  // is not taken for one with nobody on it, and it is sent again if it gets out short.
  const inside = ownPassengers(view);
  const alive = (id: EntityId): boolean => mechanics.some((u) => u.id === id) || inside.some((p) => p.id === id);
  for (const id of jobs.keys()) if (!alive(id)) jobs.delete(id);
  for (const [id, buildings] of noWay) {
    for (const [building, until] of buildings) if (view.tick >= until) buildings.delete(building);
    if (!alive(id) || buildings.size === 0) noWay.delete(id);
  }

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
    const gaveUp = target && standing.thinks(u.id) >= STUCK_THINKS && distanceTo(target, u) > AT_WORK;
    if (target && !gaveUp) continue;
    if (target) noWay.set(u.id, new Map(noWay.get(u.id)).set(target.id, view.tick + OPPONENT.tendRetryTicks));
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
      safe.filter((b) => !noWay.get(u.id)?.has(b.id)),
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
 * not yet seen to stop, and where each stopped the last time it was sent.
 */
export interface MedicMemory {
  readonly onTheWay: Set<EntityId>;
  readonly stoppedAt: Map<EntityId, Vec>;
}

export function createMedicMemory(): MedicMemory {
  return { onTheWay: new Set(), stoppedAt: new Map() };
}

/** How far from the rally point, in Cells, a Medic may stand before it is sent back: half the reach it looks for work in. */
const STRAYED = TEND.seekRadius / 2;
/** How near where it last stopped a Medic sent home counts as not having left since. */
const SAME_PLACE = 0.5;

/**
 * A move back to the rally point for Medics that Healing has led away from
 * it: each walk to someone hurt can end a few Cells farther off, and over a
 * long Match that adds up to a Medic out of reach of the Units that come home.
 * A Medic is left alone while anyone it could Heal is hurt within its reach,
 * since a move would end its Tend, and where it stopped short the last time
 * it was sent, since the Units crowding the rally point let it no nearer.
 */
export function medicCommands(view: PlayerView, memory: MedicMemory, standing: Standing): Command[] {
  const own = view.units.filter((u) => u.owner === view.playerId);
  const medics = own.filter((u) => u.kind === "medic");
  for (const id of memory.onTheWay) if (!medics.some((u) => u.id === id)) memory.onTheWay.delete(id);
  for (const id of memory.stoppedAt.keys()) if (!medics.some((u) => u.id === id)) memory.stoppedAt.delete(id);

  const rally = rallyPoint(view);
  const hurt = own.filter((u) => u.hp < u.maxHp && tendRate("medic", UNIT_STATS[u.kind].class) > 0);
  const back: EntityId[] = [];
  for (const u of medics) {
    if (standing.thinks(u.id) < STUCK_THINKS) continue;
    if (memory.onTheWay.delete(u.id)) memory.stoppedAt.set(u.id, { x: u.x, y: u.y });
    if (distanceToCell(rally, u) <= STRAYED) continue;
    if (hurt.some((h) => h.id !== u.id && distanceTo(h, u) <= TEND.seekRadius)) continue;
    const last = memory.stoppedAt.get(u.id);
    if (last && Math.hypot(u.x - last.x, u.y - last.y) <= SAME_PLACE) continue;
    memory.onTheWay.add(u.id);
    standing.restart(u.id);
    back.push(u.id);
  }
  return back.length > 0 ? [{ type: "move", unitIds: back, target: rally }] : [];
}
