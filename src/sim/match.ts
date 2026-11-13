import type { Command, CommandResult } from "./commands";
import { reject } from "./commands";
import { COMMAND_HANDLERS, type CommandHandler } from "./handlers";
import type { MapDef } from "./mapdef";
import { parseMap } from "./mapdef";
import { createRng } from "./rng";
import type { MatchState, MatchStatus, PlayerState } from "./state";
import { addBuilding, spawnUnit } from "./state";
import { SYSTEMS } from "./systems";
import { ECONOMY } from "./tuning";
import type { PlayerId } from "./types";
import { PLAYER_IDS } from "./types";
import { buildPlayerView, type PlayerView } from "./view";

/** A Match in progress. Opaque outside src/sim: use the functions below. */
export type Match = MatchState;

export function createMatch(map: MapDef, seed: number): Match {
  const parsed = parseMap(map);
  const cells = parsed.width * parsed.height;
  const players: [PlayerState, PlayerState] = [
    { id: 0, credits: ECONOMY.startingCredits },
    { id: 1, credits: ECONOMY.startingCredits },
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
    nextId: 1,
    status: { state: "running" },
  };
  for (const player of PLAYER_IDS) {
    const start = map.starts[player];
    addBuilding(m, player, "hq", start.hq);
    addBuilding(m, player, "refinery", start.refinery);
    spawnUnit(m, player, "harvester", start.harvester);
    for (const cell of start.riflemen) spawnUnit(m, player, "rifleman", cell);
  }
  return m;
}

/** Applies a Command for a Player at once, or rejects it and changes nothing. */
export function issueCommand(m: Match, player: PlayerId, command: Command): CommandResult {
  if (m.status.state !== "running") return reject("the Match is over");
  const handler = COMMAND_HANDLERS[command.type] as CommandHandler<typeof command.type>;
  return handler(m, player, command as never);
}

/** Advances the Match by one Tick. Does nothing once the Match is over. */
export function advanceTick(m: Match): void {
  if (m.status.state !== "running") return;
  for (const u of m.units.values()) {
    u.prevX = u.x;
    u.prevY = u.y;
  }
  for (const system of SYSTEMS) system(m);
  m.tick++;
}

export function getPlayerView(m: Match, player: PlayerId): PlayerView {
  return buildPlayerView(m, player);
}

export function getMatchStatus(m: Match): MatchStatus {
  return m.status;
}
