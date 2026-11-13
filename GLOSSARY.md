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

**Tick**:
One fixed step of game time. The Match advances only in whole Ticks, at a fixed rate.
_Avoid_: Frame, turn, update

**Command**:
An order a Player gives, such as move, attack, harvest, build or train. The person playing and the Computer Opponent give the same Commands.
_Avoid_: Action, input, order

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
The Building that trains Raiders and Harvesters.
_Avoid_: War factory, factory

**Turret**:
A defensive Building that attacks enemy Units in range by itself.
_Avoid_: Tower, defense

## Units

**Unit**:
Anything a Player trains that moves.

**Rifleman**:
The infantry Unit.
_Avoid_: Soldier, infantry, trooper

**Raider**:
The light attack vehicle.
_Avoid_: Buggy, jeep, light tank

**Harvester**:
The Unit that collects Ore from Ore Fields and carries it to a Refinery.
_Avoid_: Collector, miner, worker
