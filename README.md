# Ironfront

A personal real-time strategy game inspired by the classic base-building RTS games of the 1990s: gather resources, build a base, train units, and outmaneuver your opponent.

This is a hobby project for personal use. It is an original game and is not affiliated with or endorsed by any existing game or publisher.

## Status

Early prototype: the Map and starting bases draw in the browser, and the camera scrolls. Spec #2 tracks the rest of the first playable Match.

## Play it locally

Needs Node 22 (see `.nvmrc`).

```sh
npm ci
npm run dev        # opens the game at http://localhost:5173
```

Scroll with the arrow keys, WASD, or by moving the mouse to the screen edge.

## Develop

```sh
npm test           # Vitest, no browser needed
npm run typecheck  # TypeScript strict
npm run build      # production build into dist/
```

Game rules live in `src/sim` and are tested through its public seam (`src/sim/index.ts`): create a Match, issue Commands, advance Ticks, read a Player's view. Drawing and input live in `src/client`. See `GLOSSARY.md` and `docs/adr/` for the vocabulary and design decisions.

## License

[MIT](LICENSE) © 2026 David Traynham
