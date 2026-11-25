# Piège Ton Srab

Online 2D platformer where players build the level by placing traps. See `HANDOFF.md` for the design.

## Layout

- `packages/client`: Phaser 4 + TypeScript + Vite. The game in the browser.
- `packages/server`: Colyseus server (rooms and reconnection); the game logic is `GameSession` in the shared package.
- `packages/shared`: code used by both sides: level format and the 10 maps (`src/levels`), objects, character
  controller and movement tuning, contacts between players, game rules (draw, scoring, end of game), the game
  session and the "finish still reachable" check.

## Commands

```bash
npm install        # first time (lockfile present; with npm 10.7 a fresh install without lockfile fails, use npm >= 10.9)
npm run dev        # client, http://localhost:5173
npm run server     # game server, ws://localhost:2567 (Colyseus 0.18 expects Node 22)
npm test           # tests (controller, objects, reachability, session, contacts, scoring, tutorial)
npm run typecheck
npx tsx packages/shared/scripts/check-level.ts --all   # check every map: finishable, critical cells, spawn pad, timing
npx tsx packages/shared/scripts/stress-level.ts --all --players 5 --rounds 10 --seeds 5
#   replay the placement side of whole games: refusals, lost objects, critical cells and route length per round
#   (--rounds 16 for a long game, --dump for final maps, --json out.json, --jobs 1 on a busy machine)
```

The stress targets every map was tuned against for 5 players are in `HANDOFF.md` ("Map stress test for 5 players").

Colyseus 0.18 requires Node 22 (it happens to start on Node 20, but that is not supported).
The client connects to the server on the same host, port 2567; set `VITE_SERVER_URL` to change it.

## Playing

The menu offers: create an online room (share the code or the link), join one with its code,
an offline solo game (10 or 25 points, same rules running in the browser), free practice,
"Tutoriel (30 s)" and "Règles". Until the tutorial has been finished or skipped once, those two buttons are at the
top of the menu; after that they move to the bottom under "Apprendre" (the flag is localStorage `pts.tutorialDone`;
delete it to get the new-player menu back). The lobby also has a "Règles" button.
The rules panel closes with ✕, Escape, "Compris !" or a click outside.
In the tutorial: Enter or "Étape suivante" skips a step, Escape or "Passer le tuto" goes back to the menu.
Free practice has an editor (E, then 1-6 to pick an object, T to turn a cannon, click) to place objects by hand.

Controls: Q/A left, D right, Space, Z/W or Up jump, S or Down drop a vine, Escape back to the menu, gamepad supported.
During placement: click to place or take back, 1-3 to pick which of your drawn objects goes next, R or right click
to turn a cannon (the dashed red line shows where it fires). Clicking a refused cell says why. A card with no
accepted cell left is stamped "Plus de place" and discarded; "Défausser" discards the selected card by hand
(click it to take it back). You can validate once everything is placed or discarded.
On a vine: left/right to swing, jump to let go with a push up, S or down arrow to drop. Land on another player's head to bounce and squash them;
bumping into someone sideways pushes you both apart.
A player who dies in a trap within 1.2 s of a stomp or bump gives the trap's owner the kill (+1), or +2 if the
owner did the pushing. A kill in your trap is always worth at least 0.5: victims past your 2nd in a round, and
every victim in a round nobody finishes, are worth 0.5.
In free practice: R restart, N next level.
Dev builds only (`npm run dev`): Tab shows or hides the tuning panel. Tuned values are kept in the browser between reloads;
"Copier la config" copies them as JSON to paste into `DEFAULT_TUNING` in `packages/client/src/config.ts`.
