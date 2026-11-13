import type { BuildingView, CellPos, PlayerView } from "../sim";

// Where the Computer Opponent's base is, as its own view shows it. Shared by the
// economy and the Harvester planning, which both measure from home.

export function ownBuildings(view: PlayerView): BuildingView[] {
  return view.buildings.filter((b) => b.owner === view.playerId);
}

export function hqCentre(view: PlayerView): CellPos {
  const own = ownBuildings(view);
  const hq = own.find((b) => b.kind === "hq") ?? own[0];
  if (!hq) return { x: 0, y: 0 };
  return { x: hq.x + Math.floor(hq.width / 2), y: hq.y + Math.floor(hq.height / 2) };
}
