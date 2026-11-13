# Browser game in TypeScript, no game engine

Ironfront runs in the browser, written in TypeScript and built with Vite, drawn with the plain HTML Canvas 2D API, and tested with Vitest. It runs on any computer with a browser, needs nothing installed beyond Node to develop, and agents can test it headlessly. We chose this over a desktop engine such as Godot or Unity, which is harder for agents to drive and test, and over a browser engine such as Phaser, because an RTS needs its own simulation, pathfinding and unit logic anyway, and an engine's scene and physics model would sit between us and the rules we want to test.

## Consequences

- Drawing, input and camera code are ours to write and keep small. Placeholder art is drawn in code, so the game has no third-party assets.
- Swapping to an engine later means rewriting the rendering and input layers, but not the game rules (see ADR 0002).
