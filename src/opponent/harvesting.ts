import {
  BUILDING_STATS,
  type CellPos,
  cellIndexIn,
  type Command,
  ECONOMY,
  type EntityId,
  OPPONENT,
  type PlayerView,
  UNIT_STATS,
  type UnitView,
} from "../sim";
import { hqCentre, ownBuildings } from "./base";

// Where the Computer Opponent's Harvesters dig. The Simulation keeps a Harvester
// working the field it was sent to, so the Opponent only has to choose fields:
// the known Ore nearest its Refineries, avoiding ground where enemy fighters
// were seen lately, so its economy doesn't walk into an army and die out.

/** Where enemy fighters were last seen, by id, kept between thinks. */
export type DangerMemory = Map<EntityId, { readonly x: number; readonly y: number; readonly tick: number }>;

/** Notes Visible armed enemy Units and forgets sightings older than OPPONENT.dangerTicks. */
export function rememberDanger(memory: DangerMemory, view: PlayerView): void {
  for (const u of view.units) {
    if (u.owner === view.playerId || UNIT_STATS[u.kind].damage === 0) continue;
    memory.set(u.id, { x: u.x, y: u.y, tick: view.tick });
  }
  for (const [id, seen] of memory) if (view.tick - seen.tick > OPPONENT.dangerTicks) memory.delete(id);
}

/** True when no enemy fighter was seen lately, and no known enemy Turret stands, near the Cell. */
export function isSafe(view: PlayerView, memory: DangerMemory, cell: CellPos): boolean {
  const x = cell.x + 0.5;
  const y = cell.y + 0.5;
  for (const seen of memory.values()) if (Math.hypot(seen.x - x, seen.y - y) <= OPPONENT.dangerRadius) return false;
  return !view.buildings.some(
    (b) =>
      b.owner !== view.playerId &&
      BUILDING_STATS[b.kind].damage > 0 &&
      Math.hypot(b.x + b.width / 2 - x, b.y + b.height / 2 - y) <= BUILDING_STATS[b.kind].range + 2,
  );
}

function knownOre(view: PlayerView, cell: CellPos): boolean {
  return view.map.ore[cellIndexIn(view.map, cell.x, cell.y)]! > 0;
}

/** Cells round a chosen Ore Cell that count as the same field. */
const FIELD_RADIUS = 3;

/**
 * True while known Ore is left near the chosen Cell. The Simulation moves a
 * Harvester on to the next Cell of its field by itself, so the Opponent only
 * steps in once the whole field is dug out.
 */
function fieldHasOre(view: PlayerView, field: CellPos): boolean {
  const { width, height } = view.map;
  for (let y = Math.max(0, field.y - FIELD_RADIUS); y <= Math.min(height - 1, field.y + FIELD_RADIUS); y++) {
    for (let x = Math.max(0, field.x - FIELD_RADIUS); x <= Math.min(width - 1, field.x + FIELD_RADIUS); x++) {
      if (knownOre(view, { x, y })) return true;
    }
  }
  return false;
}

/**
 * The known Ore Cell nearest `from` that is safe, or the nearest of any when
 * none is; null when the Opponent knows of no Ore. Known Ore includes
 * remembered amounts in Fogged Cells. Ties go to the top-most, then left-most Cell.
 */
export function chooseOre(view: PlayerView, memory: DangerMemory, from: { x: number; y: number }): CellPos | null {
  let best: CellPos | null = null;
  let bestSafe = false;
  let bestD = Infinity;
  const { width, height } = view.map;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = { x, y };
      if (!knownOre(view, cell)) continue;
      const d = (x + 0.5 - from.x) ** 2 + (y + 0.5 - from.y) ** 2;
      // Only a nearer Cell can beat a safe one, so skip the safety check for the rest.
      if (bestSafe && d >= bestD) continue;
      const safe = isSafe(view, memory, cell);
      if ((safe && !bestSafe) || (safe === bestSafe && d < bestD)) {
        best = cell;
        bestSafe = safe;
        bestD = d;
      }
    }
  }
  return best;
}

/** The centre of the own Refinery nearest the Harvester, or of the HQ when there is none. */
function homeOf(view: PlayerView, u: UnitView): { x: number; y: number } {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const b of ownBuildings(view)) {
    if (b.kind !== "refinery") continue;
    const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const d = Math.hypot(c.x - u.x, c.y - u.y);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  const hq = hqCentre(view);
  return best ?? { x: hq.x + 0.5, y: hq.y + 0.5 };
}

/** Thinks a Harvester may stand still with the same load before it counts as idle. */
const IDLE_THINKS = 6;

/**
 * Gives each Harvester an Ore Cell to work and changes it only when its field
 * is dug out, turns unsafe, or the Harvester has stopped working. A full
 * Harvester is left to unload first. `fields` holds each Harvester's Cell
 * between thinks.
 *
 * A field is noted as soon as the Command is given, without waiting to hear
 * whether it was accepted. That is sound because the Simulation judges a
 * harvest Command by the Ore the Player believes is there, which is exactly
 * what this view shows: a known Ore Cell picked for an own Harvester can't be
 * refused. Should one be refused anyway, the Harvester stands still and the
 * idle check re-chooses after IDLE_THINKS, so no order repeats every think.
 */
export function harvestCommands(
  view: PlayerView,
  memory: DangerMemory,
  fields: Map<EntityId, CellPos>,
  stillFor: (u: UnitView) => number,
): Command[] {
  const commands: Command[] = [];
  for (const u of view.units) {
    if (u.owner !== view.playerId || u.kind !== "harvester") continue;
    const field = fields.get(u.id);
    const idle = stillFor(u) >= IDLE_THINKS;
    if (field && !idle && fieldHasOre(view, field) && isSafe(view, memory, field)) continue;
    if (u.cargo >= ECONOMY.harvesterCapacity) continue;
    const ore = chooseOre(view, memory, homeOf(view, u));
    // Nothing better than where it is going: leave it be rather than repeat the order.
    if (!ore || (!idle && field && ore.x === field.x && ore.y === field.y)) continue;
    fields.set(u.id, ore);
    commands.push({ type: "harvest", unitIds: [u.id], target: ore });
  }
  return commands;
}
