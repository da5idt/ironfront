import type { BuildingView, Command, EntityId, PlayerView, UnitView } from "../sim";
import { ownBuildings, ownPassengers, type Standing } from "./base";
import { rallyPoint } from "./economy";
import { DEFEND_RADIUS, distanceTo, STUCK_THINKS } from "./tactics";

// The Computer Opponent's support Units once they are trained. Medics need no
// Commands: they wait at the rally point and Heal by themselves whoever comes
// home hurt. Mechanics do, because the Buildings they Repair are mostly farther
// from the rally point than an idle support Unit looks.

/**
 * The Opponent's notes on its Mechanics at work: the Building each was last
 * told to Tend, by Mechanic. A Player view does not say what a Unit is doing.
 */
export type TendMemory = Map<EntityId, EntityId>;

/** How near its Building a Mechanic standing still counts as at work on it, not stopped short. */
const AT_WORK = 1.5;

/**
 * Tend Commands for Mechanics with nothing to do, onto the Opponent's damaged
 * Buildings, and a move home for those whose work is done. A Mechanic gets the
 * Command once per Building; it gets it again only when it has stopped short
 * of the Building, which is how a Tend that found no way there looks from the view.
 */
export function tendCommands(view: PlayerView, jobs: TendMemory, standing: Standing): Command[] {
  const mechanics = view.units.filter((u) => u.owner === view.playerId && u.kind === "mechanic");
  const damaged = ownBuildings(view).filter((b) => b.hp < b.maxHp);
  // A Mechanic inside a Troop Carrier is not lost: its job is kept, so its Building
  // is not taken for one with nobody on it, and it is sent again if it gets out short.
  const inside = ownPassengers(view);
  for (const id of jobs.keys()) {
    if (!mechanics.some((u) => u.id === id) && !inside.some((p) => p.id === id)) jobs.delete(id);
  }

  const free: UnitView[] = [];
  const done: UnitView[] = [];
  for (const u of mechanics) {
    const job = jobs.get(u.id);
    if (job === undefined) {
      free.push(u);
      continue;
    }
    const target = damaged.find((b) => b.id === job);
    const gaveUp = target && standing.thinks(u.id) >= STUCK_THINKS && distanceTo(target, u) > AT_WORK;
    if (target && !gaveUp) continue;
    jobs.delete(u.id);
    free.push(u);
    if (!target) done.push(u);
  }

  // Mechanics are unarmed: a Building is Repaired once none of the other Player's Units is seen near it.
  const others = view.units.filter((u) => u.owner !== view.playerId);
  const safe = damaged.filter((b) => !others.some((u) => distanceTo(b, u) <= DEFEND_RADIUS));
  const crews = new Map<EntityId, EntityId[]>();
  for (const b of damaged) crews.set(b.id, [...jobs].filter(([, job]) => job === b.id).map(([id]) => id));
  const sent = new Map<EntityId, EntityId[]>();
  const goingHome: EntityId[] = [];
  for (const u of free) {
    const target = neediest(safe, crews);
    if (!target) {
      if (done.includes(u)) goingHome.push(u.id);
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
