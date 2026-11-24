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
npm run dev        # client, http://localhost:5173
npm run server     # game server, ws://localhost:2567 (Colyseus 0.18 expects Node 22)
npm test           # controller tests
npm run typecheck
```

Colyseus 0.18 requires Node 22 (it happens to start on Node 20, but that is not supported).
The client connects to the server on the same host, port 2567; set `VITE_SERVER_URL` to change it.

## Playing

The menu offers: create an online room (share the code or the link), join one with its code,
an offline solo game (10 or 25 points, same rules running in the browser), and free practice.
Free practice has an editor (E, then 1-3 and click) to place objects by hand.

Controls: Q/A left, D right, Space / Z / Up jump, Escape back to the menu, gamepad supported.
In free practice: R restart, N next level.
Tab shows or hides the tuning panel. Tuned values are kept in the browser between reloads;
"Copier la config" copies them as JSON to paste into `DEFAULT_TUNING` in `packages/client/src/config.ts`.
