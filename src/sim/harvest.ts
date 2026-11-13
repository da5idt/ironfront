import type { CommandResult } from "./commands";
import { OK, reject } from "./commands";
import type { CommandHandler } from "./handlers";
import { type MovePlan, matchGrid, planMove, stepAlong, unitCell } from "./movement";
import { nearestReachable } from "./pathfinding";
import type { BuildingState, MatchState, UnitState } from "./state";
import { cellIndex, inBounds, ownUnits } from "./state";
import { ECONOMY } from "./tuning";
import type { CellPos, EntityId, PlayerId } from "./types";

// The economy loop: a Harvester walks to Ore, digs until full, carries the load
// to the nearest own Refinery and turns it into Credits, then goes back for more.
//
// Harvesters start harvesting the moment they exist. A move or stop Command
// replaces the harvest order like any other, and the Harvester then stays where
// it was sent (keeping its cargo) until it is given a harvest Command again, so
// the player can park one out of harm's way without it wandering back.

type HarvestStep =
  | { readonly kind: "findOre"; readonly waitTicks: number }
  | { readonly kind: "toOre"; readonly plan: MovePlan }
  | { readonly kind: "dig" }
  | { readonly kind: "findRefinery"; readonly waitTicks: number }
  | { readonly kind: "toRefinery"; readonly plan: MovePlan; readonly refineryId: EntityId }
  | { readonly kind: "unload"; readonly refineryId: EntityId; readonly ticksLeft: number };

export interface HarvestOrder {
  readonly type: "harvest";
  step: HarvestStep;
  /**
   * The Ore Cell last dug or chosen by the player. The next Ore is looked for
   * from here, so a Harvester sent to a far field keeps working that field
   * instead of drifting back to whatever is nearest its Refinery.
   */
  field: CellPos | null;
}

export function startHarvesting(): HarvestOrder {
  return { type: "harvest", step: { kind: "findOre", waitTicks: 0 }, field: null };
}

function oreAt(m: MatchState, cell: CellPos): number {
  return m.ore[cellIndex(m, cell.x, cell.y)]!;
}

/** The Player's Refinery touching the Cell (sides or corners), if any. */
function refineryNextTo(m: MatchState, owner: PlayerId, cell: CellPos): BuildingState | undefined {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = cell.x + dx;
      const y = cell.y + dy;
      if (!inBounds(m, x, y)) continue;
      const b = m.buildings.get(m.buildingAt[cellIndex(m, x, y)]!);
      if (b && b.owner === owner && b.kind === "refinery") return b;
    }
  }
  return undefined;
}

function isOwnRefinery(m: MatchState, owner: PlayerId, id: EntityId): boolean {
  const b = m.buildings.get(id);
  return b !== undefined && b.owner === owner && b.kind === "refinery";
}

/** Works out what the Harvester does next from where it is now. */
function nextStep(m: MatchState, u: UnitState, order: HarvestOrder): HarvestStep {
  const { step } = order;
  const retry = ECONOMY.harvestRetryTicks;
  switch (step.kind) {
    case "findOre": {
      if (step.waitTicks > 0) return { kind: "findOre", waitTicks: step.waitTicks - 1 };
      const ore = nearestReachable(matchGrid(m), order.field ?? unitCell(u), (x, y) => m.ore[cellIndex(m, x, y)]! > 0);
      if (ore) return { kind: "toOre", plan: planMove(m, u, ore) };
      // Nothing left to dig: bank what is carried rather than sit on it.
      return u.cargo > 0 ? { kind: "findRefinery", waitTicks: 0 } : { kind: "findOre", waitTicks: retry };
    }
    case "toOre": {
      if (oreAt(m, step.plan.goal) === 0) return { kind: "findOre", waitTicks: 0 };
      if (stepAlong(m, u, step.plan) === "moving") return step;
      const here = unitCell(u);
      const arrived = here.x === step.plan.goal.x && here.y === step.plan.goal.y;
      return arrived ? { kind: "dig" } : { kind: "findOre", waitTicks: retry };
    }
    case "dig": {
      const here = unitCell(u);
      order.field = here;
      const i = cellIndex(m, here.x, here.y);
      const take = Math.min(ECONOMY.harvestPerTick, m.ore[i]!, ECONOMY.harvesterCapacity - u.cargo);
      m.ore[i]! -= take;
      u.cargo += take;
      if (u.cargo >= ECONOMY.harvesterCapacity) return { kind: "findRefinery", waitTicks: 0 };
      return m.ore[i] === 0 ? { kind: "findOre", waitTicks: 0 } : step;
    }
    case "findRefinery": {
      if (step.waitTicks > 0) return { kind: "findRefinery", waitTicks: step.waitTicks - 1 };
      const dock = nearestReachable(matchGrid(m), unitCell(u), (x, y) => !!refineryNextTo(m, u.owner, { x, y }));
      if (!dock) return { kind: "findRefinery", waitTicks: retry };
      const refinery = refineryNextTo(m, u.owner, dock)!;
      return { kind: "toRefinery", plan: planMove(m, u, dock), refineryId: refinery.id };
    }
    case "toRefinery": {
      if (!isOwnRefinery(m, u.owner, step.refineryId)) return { kind: "findRefinery", waitTicks: 0 };
      if (stepAlong(m, u, step.plan) === "moving") return step;
      const docked = refineryNextTo(m, u.owner, unitCell(u));
      return docked
        ? { kind: "unload", refineryId: docked.id, ticksLeft: ECONOMY.unloadTicks }
        : { kind: "findRefinery", waitTicks: retry };
    }
    case "unload": {
      if (!isOwnRefinery(m, u.owner, step.refineryId)) return { kind: "findRefinery", waitTicks: 0 };
      if (step.ticksLeft > 1) return { ...step, ticksLeft: step.ticksLeft - 1 };
      m.players[u.owner].credits += u.cargo * ECONOMY.creditsPerOre;
      u.cargo = 0;
      return { kind: "findOre", waitTicks: 0 };
    }
  }
}

/** Per-Tick system: moves every harvesting Harvester one step through its loop. */
export function harvestOre(m: MatchState): void {
  for (const u of m.units.values()) {
    if (u.order.type === "harvest") u.order.step = nextStep(m, u, u.order);
  }
}

/** Sends the Player's Harvesters to dig at an Ore Cell. Other Units in the Command are ignored. */
export const handleHarvest: CommandHandler<"harvest"> = (m, player, command): CommandResult => {
  const harvesters = ownUnits(m, player, command.unitIds).filter((u) => u.kind === "harvester");
  if (harvesters.length === 0) return reject("no own Harvesters selected");
  const { target } = command;
  if (!inBounds(m, target.x, target.y) || oreAt(m, target) === 0) return reject("no Ore there");
  for (const u of harvesters) {
    u.order = { type: "harvest", step: { kind: "toOre", plan: planMove(m, u, target) }, field: target };
  }
  return OK;
};
