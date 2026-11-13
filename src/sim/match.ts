import type { Command, CommandResult } from "./commands";
import { reject } from "./commands";
import { COMMAND_HANDLERS, type CommandHandler } from "./handlers";
import { createFog, updateFog } from "./fog";
import type { MapDef } from "./mapdef";
import { parseMap } from "./mapdef";
import { createRng } from "./rng";
import type { MatchState, MatchStatus, PlayerState } from "./state";
import { addBuilding, isWalkable, spawnUnit } from "./state";
import { SYSTEMS } from "./systems";
import { BUILDING_STATS, ECONOMY } from "./tuning";
import type { BuildingKind, CellPos, PlayerId, UnitKind } from "./types";
import { PLAYER_IDS } from "./types";
import { buildPlayerView, type PlayerView } from "./view";

declare const matchBrand: unique symbol;
/**
 * A Match in progress. Deliberately opaque: code outside src/sim can only pass
 * it to the functions below, which keeps the ADR 0002 seam honest.
 */
export interface Match {
  readonly [matchBrand]: true;
}

function state(match: Match): MatchState {
  return match as unknown as MatchState;
}

export function createMatch(map: MapDef, seed: number): Match {
  const parsed = parseMap(map);
  const cells = parsed.width * parsed.height;
  const players: [PlayerState, PlayerState] = [
    { id: 0, credits: ECONOMY.startingCredits, production: null },
    { id: 1, credits: ECONOMY.startingCredits, production: null },
  ];
  const m: MatchState = {
    tick: 0,
    rng: createRng(seed),
    width: parsed.width,
    height: parsed.height,
    terrain: parsed.terrain,
    ore: parsed.hasOre.map((has) => (has ? ECONOMY.orePerCell : 0)),
    buildingAt: new Array<number>(cells).fill(0),
    players,
    units: new Map(),
    buildings: new Map(),
    fog: [createFog(parsed.width, parsed.height), createFog(parsed.width, parsed.height)],
    nextId: 1,
    status: { state: "running" },
    shots: [],
  };
  for (const player of PLAYER_IDS) {
    const start = map.starts[player];
    placeStartingBuilding(m, map, player, "hq", start.hq);
    placeStartingBuilding(m, map, player, "refinery", start.refinery);
  }
  // Units after all Buildings, so a Unit inside either Player's base is caught.
  for (const player of PLAYER_IDS) {
    const start = map.starts[player];
    placeStartingUnit(m, map, player, "harvester", start.harvester);
    for (const cell of start.riflemen) placeStartingUnit(m, map, player, "rifleman", cell);
  }
  // So Tick 0 already shows the ground around each starting base.
  updateFog(m);
  return m as unknown as Match;
}

// A bad starting position is a mistake in the Map data, so it fails loudly
// instead of corrupting the Building grid.
function placeStartingBuilding(m: MatchState, map: MapDef, player: PlayerId, kind: BuildingKind, at: CellPos): void {
  const { width, height } = BUILDING_STATS[kind];
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      if (!isWalkable(m, at.x + dx, at.y + dy)) {
        throw new Error(
          `Map ${map.name}: Player ${player}'s ${kind} at ${at.x},${at.y} needs clear, passable Cells on the Map`,
        );
      }
    }
  }
  addBuilding(m, player, kind, at);
}

function placeStartingUnit(m: MatchState, map: MapDef, player: PlayerId, kind: UnitKind, at: CellPos): void {
  if (!isWalkable(m, at.x, at.y)) {
    throw new Error(`Map ${map.name}: Player ${player}'s ${kind} at ${at.x},${at.y} needs a clear, passable Cell`);
  }
  spawnUnit(m, player, kind, at);
}

/** Applies a Command for a Player at once, or rejects it and changes nothing. */
export function issueCommand(match: Match, player: PlayerId, command: Command): CommandResult {
  const m = state(match);
  if (m.status.state !== "running") return reject("the Match is over");
  const cell = targetCell(command);
  if (cell && !(Number.isInteger(cell.x) && Number.isInteger(cell.y))) return reject("that is not a Cell");
  const handler = COMMAND_HANDLERS[command.type] as CommandHandler<typeof command.type>;
  return handler(m, player, command as never);
}

/**
 * The Cell a Command points at, if it has one. Checked once here because a
 * Cell between whole positions slips past bounds and Fog of War checks
 * (no Cell index matches it) and can leave Units chasing a goal they never reach.
 */
function targetCell(command: Command): CellPos | null {
  switch (command.type) {
    case "move":
    case "harvest":
    case "setRallyPoint":
      return command.target;
    case "placeBuilding":
      return command.at;
    default:
      return null;
  }
}

/** Advances the Match by one Tick. Does nothing once the Match is over. */
export function advanceTick(match: Match): void {
  const m = state(match);
  if (m.status.state !== "running") return;
  for (const u of m.units.values()) {
    u.prevX = u.x;
    u.prevY = u.y;
  }
  for (const system of SYSTEMS) system(m);
  m.tick++;
}

export function getPlayerView(match: Match, player: PlayerId): PlayerView {
  return buildPlayerView(state(match), player);
}

export function getMatchStatus(match: Match): MatchStatus {
  return state(match).status;
}
