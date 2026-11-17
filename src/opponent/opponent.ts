import {
  type BuildingView,
  type CellPos,
  cellIndexIn,
  type Command,
  createRng,
  type EntityId,
  isArmed,
  isPassableTerrain,
  isTroopCarrier,
  nextInt,
  OPPONENT,
  passengerRoom,
  type PlayerId,
  type PlayerView,
  type Rng,
  isInfantry,
  UNIT_STATS,
  type UnitView,
  type Vec,
} from "../sim";
import { hqCentre, isOpenGround, ownBuildings, ownPassengers, type Standing } from "./base";
import { createCarrierMemory, driveToParking, isParked, ownCarriers, parkCommands, recall } from "./carrier";
import { buildCommands, rallyCommands, rallyPoint, trainCommands, type WaveNeeds } from "./economy";
import { type DangerMemory, harvestCommands, rememberDanger } from "./harvesting";
import { createMedicMemory, createTendMemory, medicCommands, tendCommands } from "./support";
import { DEFEND_RADIUS, distanceTo, distanceToCell, nearest, STUCK_THINKS, waveReady, waveThreshold } from "./tactics";

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
  /** Thinks in a row it has not moved (and, for a Harvester, its cargo not changed). */
  still: number;
}

/** How near the gathering point a wave Unit counts as arrived. */
const GATHER_RADIUS = 5;
/** Share of a wave that must reach the gathering point before it attacks. */
const GATHER_SHARE = 0.75;
/** Longest a wave waits for stragglers, in thinks (60 seconds). */
const GATHER_THINKS = 120;
/**
 * How near a wave Unit an enemy Turret must be to become its goal: a little past
 * a Turret's own range, so the Unit turns on it about when it starts being shot.
 */
const TURRET_REACH = 8;
/** Cells short of the target where a wave gathers, so fast Raiders don't arrive alone. */
const GATHER_DISTANCE = 14;

/** How often a wave's Troop Carrier is aimed again at where the wave has got to, in thinks (2 seconds). */
const FOLLOW_THINKS = 4;
/** How near the Cell it would be aimed at the Troop Carrier needs no new Command. */
const FOLLOW_SLACK = 1.5;

/** A wave still at home, while some of its Units Board the Troop Carrier parked there. */
interface BoardingWave {
  readonly phase: "board";
  readonly gatherAt: CellPos;
  readonly carrierId: EntityId;
  /** The wave's Units told to Board. */
  readonly toBoard: readonly EntityId[];
  /** Those of them seen inside at some think. */
  readonly seenInside: Set<EntityId>;
  /** The Tick by which the wave leaves home, whoever is aboard. */
  readonly boardBy: number;
  /** When the wave before this one set off, to go back to should this one be called off. */
  readonly waveTickBefore: number | null;
}

/** The Troop Carrier that travels with a wave, until it is empty. */
interface WaveCarrier {
  readonly carrierId: EntityId;
  /** The wave's Units inside it at the last think. */
  inside: readonly EntityId[];
}

/** A wave that has left home: on the way to its gathering point, then attacking. */
interface WaveOut {
  phase: "gather" | "attack";
  readonly gatherAt: CellPos;
  /** Thinks since it set off. */
  thinks: number;
  withCarrier: WaveCarrier | null;
}

type Wave = BoardingWave | WaveOut;

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
  const tendJobs = createTendMemory();
  const medics = createMedicMemory();
  const carriers = createCarrierMemory();
  const standing: Standing = {
    thinks: (id) => notes.get(id)?.still ?? 0,
    restart: (id) => {
      const n = notes.get(id);
      if (n) n.still = 0;
    },
  };

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
    // Passengers are off the Map but alive: their notes are kept for when they get out.
    const alive = new Set([...own, ...ownPassengers(view)].map((u) => u.id));
    for (const id of notes.keys()) if (!alive.has(id)) notes.delete(id);
    for (const id of fields.keys()) if (!alive.has(id)) fields.delete(id);
    for (const u of own) note(u);
    rememberDanger(danger, view);
    // A Troop Carrier is armed, but it is no fighter: it is led on its own, and
    // a move home with the others would end among the Medics and Mechanics.
    const army = own.filter((u) => isArmed(UNIT_STATS[u.kind]) && !isTroopCarrier(u.kind));

    // Decided before the wave is led: a Troop Carrier the wave lets go in this think still
    // shows its Passengers, and must not be taken for one at home that Collected the wrong Units.
    const parking = parkCommands(view, carriers, standing, waveCarrierId());
    // Worked out before a wave is launched in this think, so the wave that leaves now is not yet counted as sent.
    const needs = waveNeeds(army);

    return [
      ...buildCommands(view, placeFailures, needs),
      ...trainCommands(view, needs),
      ...rallyCommands(view),
      ...harvestCommands(view, danger, fields, (u) => standing.thinks(u.id)),
      ...defend(view, army),
      ...attack(view, army),
      ...scout(view, army),
      ...parking,
      ...tendCommands(view, tendJobs, standing),
      ...medicCommands(view, medics, standing),
    ];
  }

  /**
   * What the waves can spare for support. Nothing before the first has set
   * off; after that a support Unit goes ahead of more army only while the army
   * at home is already enough for the next wave, so support is not paid for
   * with that wave's Units, and a Player short of army (its wave out, or its
   * base under attack) trains army first.
   */
  function waveNeeds(army: readonly UnitView[]): WaveNeeds {
    return {
      firstWaveSent: wavesSent > 0,
      nextWaveCovered: withRole(army, "home").length >= waveThreshold(wavesSent),
    };
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
    // A wave that has not left yet is still the army at home: it stays to defend, and leaves afterwards.
    const calledOff = wave?.phase === "board" && (threats.length > 0 || hit.length > 0) ? callOff(view, wave) : [];
    const defenders = [...withRole(army, "home"), ...withRole(army, "defend")];
    if (threats.length === 0) {
      const beside = hit.length > 0 && defenders.length > 0 ? cellBeside(view, hit[0]!) : null;
      if (beside) {
        // Something unseen is shooting: walk over and let the Units return fire.
        for (const u of defenders) Object.assign(notes.get(u.id)!, { role: "defend", target: null });
        return [...calledOff, { type: "move", unitIds: defenders.map((u) => u.id), target: beside }];
      }
      const idleDefenders = withRole(army, "defend").filter((u) => notes.get(u.id)!.still >= STUCK_THINKS);
      return [...calledOff, ...sendHome(view, idleDefenders)];
    }
    for (const u of defenders) notes.get(u.id)!.role = "defend";
    return [...calledOff, ...attackOrders(view, defenders, (u) => nearest(threats, u)?.id ?? null)];
  }

  /**
   * Ends a wave that is still boarding as if it had not been sent: its Units
   * are the army at home again, those inside get out, and the next wave is due
   * when this one was.
   */
  function callOff(view: PlayerView, w: BoardingWave): Command[] {
    standDown();
    uncount(w);
    const carrier = ownCarriers(view).find((c) => c.id === w.carrierId);
    return carrier?.passengers?.length ? [{ type: "unload", unitIds: [carrier.id] }] : [];
  }

  /** Takes a wave that never left home out of the count, so the next one is as large and as soon as this one was. */
  function uncount(w: BoardingWave): void {
    wavesSent--;
    lastWaveTick = w.waveTickBefore;
  }

  /** The Troop Carrier with the wave, which is not one at home. */
  function waveCarrierId(): EntityId | null {
    if (!wave) return null;
    return wave.phase === "board" ? wave.carrierId : (wave.withCarrier?.carrierId ?? null);
  }

  /**
   * Launches a wave once enough Units wait at home, then leads it: gather short
   * of the target, then attack. With a Troop Carrier parked at home, up to as
   * many of the wave's Riflemen as it holds Board it first.
   */
  function attack(view: PlayerView, army: readonly UnitView[]): Command[] {
    const hasTarget = view.buildings.some((b) => b.owner !== playerId);
    const commands = !wave && hasTarget ? launch(view, withRole(army, "home")) : [];
    if (!wave) return commands;
    const inWave = withRole(army, "wave");
    const carrier = ownCarriers(view).find((c) => c.id === waveCarrierId());
    const aboard = (carrier?.passengers ?? []).some((p) => notes.get(p.id)?.role === "wave");
    if (inWave.length === 0 && !aboard) {
      // Left at the front it would stand alone in the other Player's way, and the next wave looks for it at home.
      if (carrier && wave.phase !== "board") commands.push(driveToParking(view, carriers, standing, carrier));
      // Lost before it left home, it was never sent: the wave due is this one again.
      if (wave.phase === "board") uncount(wave);
      wave = null;
      return commands;
    }
    if (wave.phase === "board") return [...commands, ...boardOrSetOff(view, wave, carrier, inWave)];
    const out = wave;
    out.thinks++;
    commands.push(...leadCarrier(view, out, carrier, inWave));
    if (out.phase === "gather") {
      const gathered = inWave.filter((u) => isGathered(out, u));
      // Passengers still on their way count as not gathered, whatever share of the others has arrived.
      const waiting = gathered.length < inWave.length * GATHER_SHARE || out.withCarrier !== null;
      if (waiting && out.thinks < GATHER_THINKS) return commands;
      out.phase = "attack";
      // Out of time with the Troop Carrier still on its way: its Passengers get out where it is and walk.
      // (One that has gathered was told to Unload just now, when it was led.)
      if (out.withCarrier && carrier && !isGathered(out, carrier)) commands.push({ type: "unload", unitIds: [carrier.id] });
    }
    if (!hasTarget) {
      // Its Troop Carrier may still be out and full: left where it is, it would stand
      // at the front with its note saying parked, and the next wave would be sent there to Board.
      if (out.withCarrier && carrier) commands.push(recall(view, carriers, standing, carrier));
      standDown();
      return [...commands, ...sendHome(view, inWave)];
    }
    return [...commands, ...waveCommands(view, inWave)];
  }

  /**
   * Ends the wave with Units left: all of them are the army at home again.
   * Those inside its Troop Carrier are not on the Map to be sent anywhere; the
   * Troop Carrier is one at home from now on, which puts them out and sends
   * them back. A Troop Carrier that has left home is recalled before this.
   */
  function standDown(): void {
    for (const n of notes.values()) if (n.role === "wave") Object.assign(n, { role: "home", target: null });
    wave = null;
  }

  /** Sends the next wave, if one is due: straight off, or first to Board a Troop Carrier parked at home. */
  function launch(view: PlayerView, home: readonly UnitView[]): Command[] {
    if (!waveReady({ wave: wavesSent, army: home.length, tick: view.tick, lastWaveTick })) return [];
    // The wave is just the threshold's worth, oldest Units first; the rest stay to defend.
    const sent = [...home].sort((a, b) => a.id - b.id).slice(0, waveThreshold(wavesSent));
    const target = nearestEnemyBuilding(view, hqCentre(view))!;
    const gatherAt = stepToward(target, hqCentre(view), GATHER_DISTANCE);
    const waveTickBefore = lastWaveTick;
    wavesSent++;
    lastWaveTick = view.tick;
    for (const u of sent) notes.get(u.id)!.role = "wave";
    // One Troop Carrier at most, and only one waiting at home: the wave is never held up for one.
    const carrier = ownCarriers(view).find((c) => isParked(carriers, c));
    const toBoard = carrier
      ? sent.filter((u) => isInfantry(u.kind)).slice(0, passengerRoom(carrier.kind))
      : [];
    if (!carrier || toBoard.length === 0) {
      wave = { phase: "gather", gatherAt, thinks: 0, withCarrier: null };
      // An Attack-move, so a wave met on its way out fights back instead of walking on under fire.
      return [{ type: "attackMove", unitIds: sent.map((u) => u.id), target: gatherAt }];
    }
    const unitIds = toBoard.map((u) => u.id);
    // They have stood at the rally point: counted from now, standing means the Board has ended.
    for (const id of unitIds) standing.restart(id);
    wave = {
      phase: "board",
      gatherAt,
      carrierId: carrier.id,
      toBoard: unitIds,
      seenInside: new Set(),
      boardBy: view.tick + OPPONENT.boardTicks,
      waveTickBefore,
    };
    return [{ type: "board", unitIds, targetId: carrier.id }];
  }

  /**
   * A wave at home while its Units Board: it sets off when nobody is still on
   * the way to the Troop Carrier, when the time allowed is up, or at once when
   * the Troop Carrier is gone or has put out someone it held (it was hit).
   */
  function boardOrSetOff(
    view: PlayerView,
    w: BoardingWave,
    carrier: UnitView | undefined,
    inWave: readonly UnitView[],
  ): Command[] {
    const inside = w.toBoard.filter((id) => carrier?.passengers?.some((p) => p.id === id));
    const putOut = inWave.some((u) => w.seenInside.has(u.id));
    for (const id of inside) w.seenInside.add(id);
    // One that stands on the Map is not coming: its Board ended without it getting in.
    const coming = w.toBoard.filter((id) => inWave.some((u) => u.id === id) && standing.thinks(id) < STUCK_THINKS);
    if (carrier && !putOut && coming.length > 0 && view.tick < w.boardBy) return [];
    // An empty Troop Carrier stays parked: it would bring nobody.
    const withCarrier = carrier && inside.length > 0 ? { carrierId: carrier.id, inside } : null;
    wave = { phase: "gather", gatherAt: w.gatherAt, thinks: 0, withCarrier };
    // The Troop Carrier is not sent with them: it is led after them, or it would be there long before them.
    return inWave.length > 0 ? [{ type: "attackMove", unitIds: inWave.map((u) => u.id), target: w.gatherAt }] : [];
  }

  /**
   * The wave's Troop Carrier on the way: every few thinks it is sent by
   * Attack-move to where the wave's foremost Unit is, so it arrives with the
   * wave and not alone ahead of it. At the gathering point it Unloads, again
   * at each think while a Passenger has no free Cell to get out onto. Once it
   * is empty, there or because it was hit on the way, it leaves the wave and
   * drives home: at the front it would stand alone in the other Player's
   * way, and the next wave looks for it parked at home. (Nothing else calls
   * for the drive: a move on which it held or put out a Passenger ends
   * without Collecting, so it would not take the wave's Riflemen back in.)
   */
  function leadCarrier(
    view: PlayerView,
    w: WaveOut,
    carrier: UnitView | undefined,
    inWave: readonly UnitView[],
  ): Command[] {
    const led = w.withCarrier;
    if (!led) return [];
    const commands: Command[] = [];
    // Out short of the gathering point (it was hit, or is gone): they go on by foot, and are not told to Board again.
    const outOnTheWay = inWave.filter((u) => led.inside.includes(u.id) && !isGathered(w, u)).map((u) => u.id);
    if (outOnTheWay.length > 0 && w.phase === "gather") commands.push({ type: "attackMove", unitIds: outOnTheWay, target: w.gatherAt });
    led.inside = led.inside.filter((id) => carrier?.passengers?.some((p) => p.id === id));
    if (!carrier || led.inside.length === 0) {
      w.withCarrier = null;
      if (carrier) commands.push(driveToParking(view, carriers, standing, carrier));
      return commands;
    }
    if (isGathered(w, carrier) || w.phase === "attack") return [...commands, { type: "unload", unitIds: [carrier.id] }];
    if (w.thinks % FOLLOW_THINKS !== 0) return commands;
    const next = foremostCell(w.gatherAt, inWave);
    if (distanceToCell(next, carrier) <= FOLLOW_SLACK) return commands;
    return [...commands, { type: "attackMove", unitIds: [carrier.id], target: next }];
  }

  /**
   * Leads a wave onto the enemy's Buildings by Attack-move, so each Unit fights
   * whatever comes into its range on the way and takes on what shoots back first.
   * Its goal is the known Building nearest it, or a Turret near enough to matter:
   * a Turret out-ranges every Unit, so one left alone beside the goal would shoot
   * the wave while the wave shot at a wall.
   *
   * An Attack-move ends where the Unit arrives, which can be short of a
   * Building's walls: a Unit standing with nothing in range is told to attack
   * the Building itself.
   */
  function waveCommands(view: PlayerView, units: readonly UnitView[]): Command[] {
    const enemyBuildings = view.buildings.filter((b) => b.owner !== playerId);
    const turrets = enemyBuildings.filter((b) => b.kind === "turret");
    const goals = new Map<EntityId, BuildingView>();
    /** Units to send toward each goal by Attack-move, by the goal's id. */
    const advancing = new Map<EntityId, EntityId[]>();
    /** Units to set on each goal directly, by the goal's id. */
    const closingIn = new Map<EntityId, EntityId[]>();
    for (const u of units) {
      const goal = nearest(turrets, u, TURRET_REACH) ?? nearest(enemyBuildings, u);
      if (!goal) continue;
      const n = notes.get(u.id)!;
      const isNewGoal = goal.id !== n.target;
      const standsIdle = n.still >= STUCK_THINKS && !hasEnemyInRange(view, u);
      if (!isNewGoal && !standsIdle) continue;
      n.target = goal.id;
      n.still = 0;
      goals.set(goal.id, goal);
      const group = isNewGoal ? advancing : closingIn;
      group.set(goal.id, [...(group.get(goal.id) ?? []), u.id]);
    }
    const attackMoves = [...advancing].map(([id, unitIds]): Command => {
      const goal = goals.get(id)!;
      return { type: "attackMove", unitIds, target: cellBeside(view, goal) ?? { x: goal.x, y: goal.y } };
    });
    const attacks = [...closingIn].map(([targetId, unitIds]): Command => ({ type: "attack", unitIds, targetId }));
    return [...attackMoves, ...attacks];
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

/** Whether a Unit of the wave has reached its gathering point. */
function isGathered(w: { readonly gatherAt: CellPos }, u: UnitView): boolean {
  return Math.hypot(u.x - w.gatherAt.x, u.y - w.gatherAt.y) <= GATHER_RADIUS;
}

/**
 * The Cell of the Unit nearest the gathering point (the lowest id among those
 * as near), or the gathering point itself once that Unit has gathered or no
 * Unit is left on the Map.
 */
function foremostCell(gatherAt: CellPos, units: readonly UnitView[]): CellPos {
  let foremost: UnitView | null = null;
  let left = Infinity;
  for (const u of units) {
    const d = Math.hypot(u.x - gatherAt.x, u.y - gatherAt.y);
    if (d < left || (d === left && foremost !== null && u.id < foremost.id)) {
      foremost = u;
      left = d;
    }
  }
  if (!foremost || left <= GATHER_RADIUS) return gatherAt;
  return { x: Math.floor(foremost.x), y: Math.floor(foremost.y) };
}

function inRange(view: PlayerView, u: UnitView, targetId: EntityId): boolean {
  const t = view.units.find((x) => x.id === targetId) ?? view.buildings.find((b) => b.id === targetId);
  return t !== undefined && distanceTo(t, u) <= UNIT_STATS[u.kind].range;
}

/** Whether an enemy Unit the Player can see, or an enemy Building it knows of, is within the Unit's weapon range. */
function hasEnemyInRange(view: PlayerView, u: UnitView): boolean {
  const enemies = [...view.units, ...view.buildings].filter((t) => t.owner !== view.playerId);
  return enemies.some((t) => inRange(view, u, t.id));
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
