# Prototype (name to be decided)

Online 2D platformer where players build the level by placing traps. See `HANDOFF.md` for the design.

## Layout

- `packages/client`: Phaser 4 + TypeScript + Vite. The game in the browser.
- `packages/server`: Colyseus server, empty until step 4 of the build order.
- `packages/shared`: code used by both sides: level format, objects, character controller and movement
  tuning, game rules (draw, scoring, end of game) and the "finish still reachable" check.

## Commands

```bash
npm install        # first time (lockfile present; with npm 10.7 a fresh install without lockfile fails, use npm >= 10.9)
npm run dev        # http://localhost:5173
npm test           # controller tests
npm run typecheck
```

Node 20.15 works with the pinned versions (Vite 6). Moving to Node 22 would allow Vite 8.

## Playing

The menu offers a short game (10 points), a long game (25 points) and free practice.
Free practice has an editor (E, then 1-3 and click) to place objects by hand.

Controls: Q/A left, D right, Space / Z / Up jump, Escape back to the menu, gamepad supported.
In free practice: R restart, N next level.
Tab shows or hides the tuning panel. Tuned values are kept in the browser between reloads;
"Copier la config" copies them as JSON to paste into `DEFAULT_TUNING` in `packages/client/src/config.ts`.
