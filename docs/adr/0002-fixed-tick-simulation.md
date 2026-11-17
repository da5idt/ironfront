# Game rules run in a fixed-tick simulation, separate from drawing

All game rules live in a simulation that advances in fixed Ticks (20 per second) and changes only through Commands. It has no access to the screen, the clock, the mouse or `Math.random` (it uses a seeded random generator), so the same Map, seed and Commands always produce the same Match. Drawing reads the simulation's state and interpolates between Ticks; input turns clicks into Commands. We chose this over updating units in the render loop because it makes every rule testable without a browser, keeps the person playing and the Computer Opponent on exactly the same rules, and leaves replays and multiplayer possible later.

## Consequences

- Tests drive a Match by issuing Commands and advancing Ticks, then assert on what a Player can see. That is the main test seam.
- Nothing in the simulation may read wall-clock time, real randomness or the DOM. Review should treat that as a bug.

## Amendment, 2026-11-16: tests read balance numbers from the tuning file

Tests of the rules still drive a Match through the Simulation's seam (`src/sim/index.ts`), with one exception besides pure helper modules: they read balance numbers from `src/sim/tuning.ts` directly. The seam then exports only the numbers that code outside `src/sim` uses, and does not grow with every number a test wants to name. A test still may not reach past the seam for anything that changes or reads a Match.
