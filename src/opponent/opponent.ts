import {
  type BuildingView,
  type CellPos,
  cellIndexIn,
  type Command,
  createRng,
  type EntityId,
  isPassableTerrain,
  nextInt,
  OPPONENT,
  type PlayerId,
  type PlayerView,
  type Rng,
  UNIT_STATS,
  type UnitView,
  type Vec,
} from "../sim";
import { hqCentre, ownBuildings } from "./base";
import { buildCommands, rallyCommands, rallyPoint, trainCommands } from "./economy";
import { type DangerMemory, harvestCommands, rememberDanger } from "./harvesting";
import { chooseTarget, distanceTo, nearest, waveReady, waveThreshold } from "./tactics";

// The Computer Opponent. It plays by the person's rules: it reads only its own
// PlayerView, so Fog of War applies, and answers with Commands the caller
// issues. Between calls it keeps its own notes (who is doing what, what it has
// seen), since a PlayerView says nothing about a Unit's orders.

/** The Opponent thinks once every this many Ticks; half a second is quick enough and keeps it cheap. */
export const THINK_EVERY_TICKS = 10;

export interface Opponent {
  /** Commands for this moment, from the Opponent's own view. Call it every THINK_EVERY_TICKS Ticks. */
  think(view: PlayerView): Command[];
}

/** What an army Unit is doing: waiting at the rally point, in an attack wave, defending, or scouting. */
type Role = "home" | "wave" | "defend" | "scout";

interface UnitNotes {
  role: Role;
  /** The last attack target given, so an order is not re-issued every think. */
  target: EntityId | null;
  lastX: number;
  lastY: number;
  lastCargo: number;
  /** Thinks in a row it has not moved (and, for a Harvester, its load not changed). */
  still: number;
}

/** How close to a Building an enemy Unit counts as attacking the base. */
const DEFEND_RADIUS = 10;
/** Thinks an attacker may stand still short of its target before the order is given again. */
const STUCK_THINKS = 3;
/** How near the gathering point a wave Unit counts as arrived. */
const GATHER_RADIUS = 5;
/** Share of a wave that must reach the gathering point before it attacks. */
const GATHER_SHARE = 0.75;
/** Longest a wave waits for stragglers, in thinks (60 seconds). */
const GATHER_THINKS = 120;
/** Cells short of the target where a wave gathers, so fast Raiders don't arrive alone. */
const GATHER_DISTANCE = 14;

interface Wave {
  phase: "gather" | "attack";
  gatherAt: CellPos;
  thinks: number;
}

export function createOpponent(playerId: PlayerId, seed: number): Opponent {
  const notes = new Map<EntityId, UnitNotes>();
  const buildingHp = new Map<EntityId, number>();
  const placeFailures = { count: 0 };
  // Its own generator, apart from the Match's, so its choices never disturb the
  // Simulation's and a Match with an Opponent replays exactly from the two seeds.
  const rng: Rng = createRng(seed);
  let wavesSent = 0;
  let lastWaveTick: number | null = null;
  let wave: Wave | null = null;
  let scoutGoal: CellPos | null = null;
  /** Home Cells the scout could not reach, as indexes, so it stops trying them. */
  const unreachable = new Set<number>();
  /** Set once nothing near home is left to explore, so the Map isn't scanned every think. */
  let homeExplored = false;
  const danger: DangerMemory = new Map();
  const fields = new Map<EntityId, CellPos>();

  function note(u: UnitView): UnitNotes {
    let n = notes.get(u.id);
    if (!n) {
      n = { role: "home", target: null, lastX: u.x, lastY: u.y, lastCargo: u.cargo, still: 0 };
      notes.set(u.id, n);
      return n;
    }
    const moved = Math.abs(u.x - n.lastX) > 0.01 || Math.abs(u.y - n.lastY) > 0.01 || u.cargo !== n.lastCargo;
    n.still = moved ? 0 : n.still + 1;
    n.lastX = u.x;
    n.lastY = u.y;
    n.lastCargo = u.cargo;
    return n;
  }

  function think(view: PlayerView): Command[] {
    if (view.playerId !== playerId || ownBuildings(view).length === 0) return [];
    const own = view.units.filter((u) => u.owner === playerId);
    const alive = new Set(own.map((u) => u.id));
    for (const id of notes.keys()) if (!alive.has(id)) notes.delete(id);
    for (const id of fields.keys()) if (!alive.has(id)) fields.delete(id);
    for (const u of own) note(u);
    rememberDanger(danger, view);
    const army = own.filter((u) => UNIT_STATS[u.kind].damage > 0);

    return [
      ...buildCommands(view, placeFailures),
      ...trainCommands(view),
      ...rallyCommands(view),
      ...harvestCommands(view, danger, fields, (u) => notes.get(u.id)!.still),
      ...defend(view, army),
      ...attack(view, army),
      ...scout(view, army),
    ];
  }

  function withRole(army: readonly UnitView[], role: Role): UnitView[] {
    return army.filter((u) => notes.get(u.id)!.role === role);
  }

  /** Sends Units home to the rally point and forgets their targets. */
  function sendHome(view: PlayerView, units: readonly UnitView[]): Command[] {
    if (units.length === 0) return [];
    for (const u of units) Object.assign(notes.get(u.id)!, { role: "home", target: null });
    return [{ type: "move", unitIds: units.map((u) => u.id), target: rallyPoint(view) }];
  }

  /**
   * Gives each Unit an attack order on its target, grouping Units with the same
   * target into one Command. An order already given is repeated only when the
   * Unit seems stuck short of its target.
   */
  function attackOrders(
    view: PlayerView,
    units: readonly UnitView[],
    pick: (u: UnitView) => EntityId | null,
  ): Command[] {
    const groups = new Map<EntityId, EntityId[]>();
    for (const u of units) {
      const target = pick(u);
      if (target === null) continue;
      const n = notes.get(u.id)!;
      const stuck = n.still >= STUCK_THINKS && !inRange(view, u, target);
      if (target === n.target && !stuck) continue;
      n.target = target;
      n.still = 0;
      groups.set(target, [...(groups.get(target) ?? []), u.id]);
    }
    return [...groups].map(([targetId, unitIds]) => ({ type: "attack", unitIds, targetId }));
  }

  /** Enemy Units Visible near the base, or near an own Building that lost health since the last think. */
  function defend(view: PlayerView, army: readonly UnitView[]): Command[] {
    const own = ownBuildings(view);
    const hit = own.filter((b) => b.hp < (buildingHp.get(b.id) ?? b.hp));
    buildingHp.clear();
    for (const b of own) buildingHp.set(b.id, b.hp);
    const threats = view.units.filter(
      (u) => u.owner !== playerId && own.some((b) => distanceTo(b, u) <= DEFEND_RADIUS),
    );
    const defenders = [...withRole(army, "home"), ...withRole(army, "defend")];
    if (threats.length === 0) {
      const beside = hit.length > 0 && defenders.length > 0 ? cellBeside(view, hit[0]!) : null;
      if (beside) {
        // Something unseen is shooting: walk over and let the Units return fire.
        for (const u of defenders) Object.assign(notes.get(u.id)!, { role: "defend", target: null });
        return [{ type: "move", unitIds: defenders.map((u) => u.id), target: beside }];
      }
      const idleDefenders = withRole(army, "defend").filter((u) => notes.get(u.id)!.still >= STUCK_THINKS);
      return sendHome(view, idleDefenders);
    }
    for (const u of defenders) notes.get(u.id)!.role = "defend";
    return attackOrders(view, defenders, (u) => nearest(threats, u)?.id ?? null);
  }

  /** Launches a wave once enough Units wait at home, then leads it: gather short of the target, then attack. */
  function attack(view: PlayerView, army: readonly UnitView[]): Command[] {
    const commands: Command[] = [];
    const home = withRole(army, "home");
    const hasTarget = view.buildings.some((b) => b.owner !== playerId);
    const ready = waveReady({ wave: wavesSent, army: home.length, tick: view.tick, lastWaveTick });
    if (!wave && hasTarget && ready) {
      // The wave is just the threshold's worth, oldest Units first; the rest stay to defend.
      const sent = [...home].sort((a, b) => a.id - b.id).slice(0, waveThreshold(wavesSent));
      const target = nearestEnemyBuilding(view, hqCentre(view))!;
      wave = { phase: "gather", gatherAt: stepToward(target, hqCentre(view), GATHER_DISTANCE), thinks: 0 };
      wavesSent++;
      lastWaveTick = view.tick;
      for (const u of sent) notes.get(u.id)!.role = "wave";
      commands.push({ type: "move", unitIds: sent.map((u) => u.id), target: wave.gatherAt });
    }
    const inWave = withRole(army, "wave");
    if (!wave) return commands;
    if (inWave.length === 0) {
      wave = null;
      return commands;
    }
    wave.thinks++;
    if (wave.phase === "gather") {
      const gathered = inWave.filter(
        (u) => Math.hypot(u.x - wave!.gatherAt.x, u.y - wave!.gatherAt.y) <= GATHER_RADIUS,
      );
      if (gathered.length < inWave.length * GATHER_SHARE && wave.thinks < GATHER_THINKS) return commands;
      wave.phase = "attack";
    }
    if (!hasTarget) {
      wave = null;
      return [...commands, ...sendHome(view, inWave)];
    }
    return [...commands, ...attackOrders(view, inWave, (u) => chooseTarget(view, u))];
  }

  /**
   * One Unit walks into the unknown. While no enemy Building is known it looks
   * for the other base: first the far corner, then anywhere unexplored. Once
   * the base is found it sweeps the ground round its own HQ, always on to the
   * unexplored Cell nearest itself, so the Harvesters know every Ore Field near
   * home before the first one runs dry.
   */
  function scout(view: PlayerView, army: readonly UnitView[]): Command[] {
    const scouts = withRole(army, "scout");
    const enemyKnown = view.buildings.some((b) => b.owner !== playerId);
    if (enemyKnown && (homeExplored || !unexploredNearHome(view, unreachable, hqCentre(view)))) {
      homeExplored = true;
      scoutGoal = null;
      return sendHome(view, scouts);
    }
    // The enemy base was just found: stop heading for it.
    if (enemyKnown && scoutGoal && !isNearHome(view, scoutGoal)) scoutGoal = null;
    let scoutUnit = scouts[0];
    if (!scoutUnit) {
      // The fastest Unit at home; ties to the lowest id.
      const home = withRole(army, "home").sort(
        (a, b) => UNIT_STATS[b.kind].speed - UNIT_STATS[a.kind].speed || a.id - b.id,
      );
      scoutUnit = home[0];
      if (!scoutUnit) return [];
      notes.get(scoutUnit.id)!.role = "scout";
      scoutGoal = null;
    }
    const n = notes.get(scoutUnit.id)!;
    // A goal is done once seen (sight reaches it before the Unit does), or given up when the Unit is stuck.
    if (scoutGoal && !explored(view, scoutGoal)) {
      if (n.still < STUCK_THINKS) return [];
      if (enemyKnown) unreachable.add(cellIndexIn(view.map, scoutGoal.x, scoutGoal.y));
    }
    if (enemyKnown) {
      scoutGoal = unexploredNearHome(view, unreachable, scoutUnit);
    } else {
      const far = farCorner(view);
      scoutGoal = scoutGoal === null && !explored(view, far) ? far : unexploredCell(view, rng);
    }
    if (!scoutGoal) return [];
    n.still = 0;
    return [{ type: "move", unitIds: [scoutUnit.id], target: scoutGoal }];
  }

  return { think };
}

function inRange(view: PlayerView, u: UnitView, targetId: EntityId): boolean {
  const t = view.units.find((x) => x.id === targetId) ?? view.buildings.find((b) => b.id === targetId);
  return t !== undefined && distanceTo(t, u) <= UNIT_STATS[u.kind].range;
}

/** The known enemy Building nearest `from`, remembered ones included. */
function nearestEnemyBuilding(view: PlayerView, from: CellPos): BuildingView | null {
  return nearest(
    view.buildings.filter((b) => b.owner !== view.playerId),
    from,
  );
}

/** A Cell `distance` from a Building, on the way back to `home`. */
function stepToward(
  b: { x: number; y: number; width: number; height: number },
  home: CellPos,
  distance: number,
): CellPos {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const len = Math.hypot(home.x - cx, home.y - cy) || 1;
  const d = Math.min(distance, len);
  return { x: Math.floor(cx + ((home.x - cx) / len) * d), y: Math.floor(cy + ((home.y - cy) / len) * d) };
}

/**
 * A walkable Cell touching the Building's footprint, or null when none is:
 * below it first (the usual way in), then the rest of the ring top-left first,
 * so a Building on the Map's edge or hemmed in still gets a reachable goal.
 */
function cellBeside(view: PlayerView, b: BuildingView): CellPos | null {
  const ring: CellPos[] = [{ x: b.x, y: b.y + b.height }];
  for (let y = b.y - 1; y <= b.y + b.height; y++) {
    for (let x = b.x - 1; x <= b.x + b.width; x++) {
      const inside = x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height;
      if (!inside) ring.push({ x, y });
    }
  }
  return ring.find((c) => isOpenGround(view, c)) ?? null;
}

/** On the Map, passable, and not under a Building the Player knows of. */
function isOpenGround(view: PlayerView, c: CellPos): boolean {
  const { width, height, terrain } = view.map;
  if (c.x < 0 || c.y < 0 || c.x >= width || c.y >= height) return false;
  if (!isPassableTerrain(terrain[cellIndexIn(view.map, c.x, c.y)]!)) return false;
  return !view.buildings.some((o) => c.x >= o.x && c.x < o.x + o.width && c.y >= o.y && c.y < o.y + o.height);
}

function explored(view: PlayerView, c: CellPos): boolean {
  return view.map.visibility[cellIndexIn(view.map, c.x, c.y)] !== "unexplored";
}

function isNearHome(view: PlayerView, c: CellPos): boolean {
  const hq = hqCentre(view);
  return Math.hypot(c.x - hq.x, c.y - hq.y) <= OPPONENT.homeExploreRadius;
}

/**
 * The walkable Unexplored Cell within OPPONENT.homeExploreRadius of the HQ that
 * is nearest `from`, skipping `skip`; ties to the top-most, then left-most.
 * Null once home is explored.
 */
function unexploredNearHome(view: PlayerView, skip: ReadonlySet<number>, from: Vec): CellPos | null {
  const { width, terrain, visibility } = view.map;
  const hq = hqCentre(view);
  let best: CellPos | null = null;
  let bestD = Infinity;
  for (let i = 0; i < visibility.length; i++) {
    if (visibility[i] !== "unexplored" || skip.has(i) || !isPassableTerrain(terrain[i]!)) continue;
    const c = { x: i % width, y: Math.floor(i / width) };
    if (Math.hypot(c.x - hq.x, c.y - hq.y) > OPPONENT.homeExploreRadius) continue;
    const d = Math.hypot(c.x + 0.5 - from.x, c.y + 0.5 - from.y);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** The corner opposite the HQ: on a two-Player Map the likeliest place for the other base. */
function farCorner(view: PlayerView): CellPos {
  const hq = hqCentre(view);
  return { x: view.map.width - 1 - hq.x, y: view.map.height - 1 - hq.y };
}

/** A random walkable Unexplored Cell, or null once everything has been seen. */
function unexploredCell(view: PlayerView, rng: Rng): CellPos | null {
  const { width, terrain, visibility } = view.map;
  const cells: number[] = [];
  for (let i = 0; i < visibility.length; i++) {
    if (visibility[i] === "unexplored" && isPassableTerrain(terrain[i]!)) cells.push(i);
  }
  if (cells.length === 0) return null;
  const i = cells[nextInt(rng, cells.length)]!;
  return { x: i % width, y: Math.floor(i / width) };
}
