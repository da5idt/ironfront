import type { CommandOf, CommandResult, CommandType } from "./commands";
import { OK, reject } from "./commands";
import { handleCancelBuilding, handlePlaceBuilding, handleStartBuilding } from "./building";
import { handleAttack } from "./combat";
import { handleHarvest } from "./harvest";
import { handleCancelTraining, handleSetRallyPoint, handleTrain } from "./training";
import { handleMove } from "./movement";
import type { MatchState } from "./state";
import { ownUnits } from "./state";
import type { PlayerId } from "./types";

// One handler per Command type. A handler validates the Command and, only if it
// is valid, changes the Match. Features fill in their handler here.

export type CommandHandler<T extends CommandType> = (
  m: MatchState,
  player: PlayerId,
  command: CommandOf<T>,
) => CommandResult;

const stop: CommandHandler<"stop"> = (m, player, command) => {
  const units = ownUnits(m, player, command.unitIds);
  if (units.length === 0) return reject("no own Units selected");
  for (const u of units) u.order = { type: "idle" };
  return OK;
};

export const COMMAND_HANDLERS: { readonly [K in CommandType]: CommandHandler<K> } = {
  move: handleMove,
  attack: handleAttack,
  harvest: handleHarvest,
  stop,
  setRallyPoint: handleSetRallyPoint,
  startBuilding: handleStartBuilding,
  cancelBuilding: handleCancelBuilding,
  placeBuilding: handlePlaceBuilding,
  train: handleTrain,
  cancelTraining: handleCancelTraining,
};
