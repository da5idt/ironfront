# Ironfront

An original real-time strategy game: two sides gather Ore, build a base, train units and fight until one side has no buildings left.

## The match

**Match**:
One game from start to victory or defeat, played on one Map by two Players.
_Avoid_: Game, round, level, mission

**Player**:
One side in a Match, controlled either by the person playing or by the Computer Opponent. Every Building and Unit belongs to exactly one Player.
_Avoid_: Team, faction, army, side

**Computer Opponent**:
The Player whose decisions are made by the game.
_Avoid_: AI, bot, enemy, CPU

**Parking Cell**:
The Cell near its HQ, to one side of where its new Units gather, on which the Computer Opponent keeps a Troop Carrier that is not out with an attack. Standing there it is out of reach of the Medics and Mechanics it would otherwise Collect, and it is where Riflemen about to attack Board it. A Troop Carrier that finds no way onto it counts as parked where it stopped only near it (tuning: `OPPONENT.parkedNearCells`). One that stopped farther off, as one recalled from an attack can, is not Boarded where it stands: it is sent to its Parking Cell again every so often (tuning: `OPPONENT.parkAgainTicks`).
_Avoid_: Garage, depot, bay, parking spot

**Tick**:
One fixed step of game time. The Match advances only in whole Ticks, at a fixed rate.
_Avoid_: Frame, turn, update

**Command**:
An order a Player gives, such as move, attack, Attack-move, Tend, Board, Unload, harvest, build or train. The person playing and the Computer Opponent give the same Commands.
_Avoid_: Action, input, order

**Attack-move**:
A Command that sends Units to a Cell and has them stop to fight any enemy that comes into weapon range on the way, then carry on. They do not leave their route to chase.
_Avoid_: Aggressive move, a-move, assault

**Tend**:
A Command that sends support Units to one of the Player's own Units or Buildings to restore its health. Each Unit that can help the target walks until it is beside it and works until it is at full health, is gone, has moved too far off, or a new Command arrives. A Unit that cannot help that target ignores the Command, and a Tend on a target already at full health is rejected. An idle support Unit Tends the nearest target it can help by itself, but only one that is standing still, so it does not trail a marching group.
_Avoid_: Assist, support (as a Command), treat, fix

**Seek radius**:
How far an idle support Unit looks, every so often, for a target to Tend by itself: an own Unit or Building below full health that it can help and that is standing still. To a Building it is measured from the nearest point of the footprint.
_Avoid_: Aggro range, scan range, auto-heal range

**Leash**:
How far the target of a Tend may move before the support Unit gives up on it and stands idle. It is measured from the straight line between where the target and the support Unit were when the Tend began, not from where the support Unit is now. Buildings never move, so it only matters for Units.
_Avoid_: Tether, chase range, follow distance

**Tend back-off**:
The wait after a support Unit found no way to a target: until it is over, the Unit does not go to that target by itself, though it still goes to others. Each target has its own, a Tend Command is always tried whatever the back-off, and getting into a Troop Carrier ends them all.
_Avoid_: Cooldown, blacklist, retry timer

**Leave-alone time**:
The Computer Opponent's own wait after it took one of its support Units to have no way to a target (tuning: `OPPONENT.leaveAloneTicks`). Until it is over, a Mechanic gets no Tend Command onto that Building, and a hurt Unit does not keep that Medic away from the rally point. The Opponent keeps it in its own notes, one for each support Unit and target, from what its view shows: a Unit that has stopped where it cannot be at work. It is not the Tend back-off, which is the support Unit's own wait and never holds up a Tend Command.
_Avoid_: Tend back-off (for this wait), cooldown, blacklist, retry timer

**Board**:
A Command that sends Infantry to one of the Player's own Troop Carriers to get in. Each walks until it is in a Cell touching the Troop Carrier's and becomes a Passenger if there is room; with no room it stops beside it. Vehicles ignore the Command.
_Avoid_: Load, embark, enter, mount, garrison

**Unload**:
A Command that has every Passenger of a Troop Carrier get out onto a free Cell beside it, nearest first; a Passenger with no free Cell stays inside. The Command is rejected when none of the Troop Carriers holds a Passenger. A Troop Carrier that loses health Unloads by itself on that Tick. Units that get out are idle. (A Harvester emptying its Ore at a Refinery is not this.)
_Avoid_: Disembark, deploy, drop off, eject, evacuate

**Collecting**:
What a Troop Carrier does, once, on the Tick it finishes a move or an Attack-move that took it far enough, in a straight line, from where that move began (tuning: `TROOP_CARRIER.collectAfterCells`), that it began with no Passengers and had none on since: idle Infantry of its own Player within the Collecting radius (tuning: `TROOP_CARRIER.collectRadius`) become its Passengers from where they stand, nearest first and lowest id first among those as near as each other, until it is full. It takes only Units that have a short way on foot to a Cell touching its own (tuning: `TROOP_CARRIER.collectWalk`), so none across water or behind a wall. No Command asks for it, and a Unit it takes is shown and heard getting in exactly as one that Boards. A Troop Carrier that stands takes nobody, so Units that got out, and Units sent beside a parked one, stay on the Map until it has been sent off empty and has stopped again that far from where it set off; sent to the Cell it stands on, nudged a Cell along, or sent somewhere it has no way to, it has not gone far enough. A move on which it held a Passenger or put one out ends without it, and so does a stop on a Tick it lost health.
_Avoid_: Auto-load, auto-board, pick-up mode

**Victory**:
The end of a Match when the other Player has no Buildings left.
_Avoid_: Win condition

## The map

**Map**:
The battlefield: a grid of Cells with terrain, Ore Fields and each Player's starting position.
_Avoid_: Level, scenario, world

**Cell**:
One square of the Map grid. Terrain, Ore and Building footprints are measured in Cells.
_Avoid_: Tile, square

**Fog of War**:
What a Player cannot currently see. Cells never seen are **Unexplored**; Cells seen before but not seen now are **Fogged** and show terrain and Buildings as last seen, but no Units.
_Avoid_: Shroud, darkness, vision

## Economy

**Ore**:
The one harvestable resource, found in Ore Fields on the Map.
_Avoid_: Resource, crystal, minerals

**Ore Field**:
A group of Cells holding Ore. Each Cell's Ore runs out as it is harvested.

**Credits**:
A Player's money. Harvesters turn Ore into Credits at a Refinery, and Players spend Credits to build and train.
_Avoid_: Money, cash, funds, gold

## Buildings

**Building**:
A structure a Player places on the Map. It occupies a fixed footprint of Cells and never moves.
_Avoid_: Structure

**HQ**:
The Building each Player starts with. It builds the other Buildings.
_Avoid_: Construction yard, base, command center

**Refinery**:
The Building where Harvesters unload Ore for Credits.

**Barracks**:
The Building that trains Riflemen.

**Vehicle Factory**:
The Building that trains Raiders, Harvesters, Mechanics and Troop Carriers.
_Avoid_: War factory, factory

**Turret**:
A defensive Building that attacks enemy Units in range by itself.
_Avoid_: Tower, defense

**Hospital**:
A Building the HQ builds, for the care of hurt Units. It trains Medics.
_Avoid_: Infirmary, clinic, med bay, field hospital

## Units

**Unit**:
Anything a Player trains that moves. Every Unit kind is either Infantry or a Vehicle.

**Infantry**:
The class of Units that go on foot: the Rifleman, the Medic and the Mechanic. It names the class, never one kind of Unit.
_Avoid_: Foot soldiers, footmen, grunts

**Vehicle**:
The class of Units that drive: the Raider, the Harvester and the Troop Carrier.
_Avoid_: Machine, mech, car

**Rifleman**:
The armed Infantry Unit, trained at the Barracks.
_Avoid_: Soldier, trooper; "infantry" for this one kind (Infantry is the whole class)

**Medic**:
An unarmed Infantry Unit, trained at the Hospital, that Heals other Infantry, never itself. It never fires, and an Attack-move is a plain move for it.
_Avoid_: Doctor, healer, nurse, field medic

**Heal**:
To restore health to an Infantry Unit, which is what a Medic does when it Tends one. It costs nothing and never goes above full health.
_Avoid_: Cure, mend, patch up, regenerate

**Mechanic**:
An unarmed Infantry Unit, trained at the Vehicle Factory, that Repairs Vehicles and Buildings and does nothing for Infantry. It never fires, and an Attack-move is a plain move for it.
_Avoid_: Engineer, repairman, technician, fitter

**Repair**:
To restore health to a Vehicle or a Building, which is what a Mechanic does when it Tends one. It costs nothing and never goes above full health.
_Avoid_: Fix, mend, patch up, rebuild, service

**Support Unit**:
A Unit that can Tend: the Medic and the Mechanic. What each kind can help, and how fast, is a number in the tuning file; a kind with no number there is not one.
_Avoid_: Helper, healer, support (alone), utility Unit

**Raider**:
The light attack Vehicle.
_Avoid_: Buggy, jeep, light tank

**Harvester**:
The Vehicle that collects Ore from Ore Fields and carries it to a Refinery. It is unarmed.
_Avoid_: Collector, miner, worker

**Troop Carrier**:
A fast armoured Vehicle with a light gun, trained at the Vehicle Factory. It carries up to five Infantry as Passengers, who Board it and get out when it Unloads.
_Avoid_: APC, transport, personnel carrier, truck

**Passenger**:
An Infantry Unit inside a Troop Carrier. It is off the Map: it holds no Cell, cannot be seen, hit, Tended or given a Command, does not fire and gives no sight. It keeps its health, and still counts as a living Unit. Only its owner knows how many Passengers a Troop Carrier holds. If the Troop Carrier is destroyed with a Passenger still inside, the Passenger is lost with it.
_Avoid_: Rider, occupant, cargo (cargo is the Ore a Harvester carries), load, garrison

## Controls

**Passenger mark**:
One of the small marks over a Troop Carrier of the person playing, one for each place inside: bright for a place a Passenger has taken, dark for a free one. The other Player's Troop Carriers show none.
_Avoid_: Pip, seat icon

**Control Group**:
A selection of Units the person playing has saved under a number from 1 to 9, to get back with one key. It belongs to the person's controls, not to the Match: the Computer Opponent has none and no rule depends on it.
_Avoid_: Squad, team, hotkey group
