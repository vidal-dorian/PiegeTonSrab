# Handoff: Piège Ton Srab, a trap-the-level multiplayer platformer

This document hands a game project over to Claude Code. The design was worked out in a conversation between Dorian (the developer and owner of this repo) and Claude. Everything below is the result of that conversation. No code exists yet.

Dorian is a web developer (Next.js, C#/ASP.NET, PHP/Laravel, Docker). He has not built a game before. He prefers to understand what is built over hiding it behind abstractions, and he wants direct feedback: when a choice of his has a real drawback, say so. Talk to him in French. All in-game text is French. Code, comments and commit messages are in English.

## What the game is

A 2D side-view platformer played online by a group of friends, in the browser. Everyone races through the same level. Before each round, every player adds one object to the level: a trap to kill the others, or a helper. The level fills up round after round, so the players build the difficulty themselves. That is what makes it replayable: the content comes from the players, and the game balances itself because a level nobody can finish scores nothing.

Decided (2026-11-25, by Dorian): the game is named "Piège Ton Srab". The menu title, the page title and the README use it. The npm packages still have their neutral `@game/*` names; renaming them was not asked for.

## How to read the decisions below

Each section separates two kinds of statement:

- **Decided**: Dorian explicitly agreed. Do not change these without asking him.
- **Default**: proposed by Claude and not objected to, or never discussed. Use them to get started, and feel free to raise them with Dorian when they start to matter.

## Round and game structure

Decided:

- A round lasts about 1 to 2 minutes in total.
- A round has a placement step, then a race, then a short score display.
- One life per round. A dead player watches until the round ends. The round ends as soon as every player has finished or died, or when the race timer runs out.
- The same level is kept for the whole game, so objects accumulate.
- A game ends when a player reaches a target score. Two presets: short game, 10 points (about 5 minutes); long game, 25 points (about 15 minutes). The game stops at the end of the round in which someone reaches the target. On a tie for first place, one more round is played.

Default:

- Timings: 35 seconds for placement (Decided; drawing and placing happen on the same screen), 45 seconds maximum for the race, 5 seconds for the score display.
- Draw: each player is offered random objects and keeps as many as they place this round (see below). Proposed: offer the number to keep plus 2 (4 offered for 2 kept, 5 for 3).
- Placement is simultaneous and hidden: players see who has finished placing, never where.
- Placement rules: an object cannot be placed on the start, on the finish, or on top of another object.
- Players per room: 2 to 5 (raised from 4 by Dorian on 2026-11-25). The game is designed for 3 to 5; with 2 it still works but traps matter less.
- The level starts with no player-placed objects.
- Levels are hand-made at first.

Decided (2026-11-24):

- Each player places 3 objects per round at the start of a game, then 2 objects per round once a given number of rounds have been played. Keep both counts and the switch-over round in the game config so they can be changed after playtests. This replaces the earlier one-object-per-round design wherever it appears below.
- Decided (2026-11-25, by Dorian): 3 objects in rounds 1 to 3, then 2 from round 4 on (`objectsEarly` 3, `objectsLate` 2, `switchAfterRound` 3 in `DEFAULT_GAME_CONFIG`). This settles both the switch-over round and the earlier doubt about "2 objects drawn at random".
- Decided (2026-11-25, by Dorian): with 5 players, 2 objects from round 1 (`lateOnlyFromPlayers` 5). Objects pile up on one map, so 5 players at 3-then-2 filled it about 25 % faster than 4; this keeps a full room close to a 4-player game.
- Placement lasts 35 seconds (replaces the 25-second default).
- Some levels scroll horizontally, with a camera following the player. Single-screen levels (32 by 18 cells, as in the mockups) remain possible; the level format and the camera must support any width.
- The placement screen shows the whole level zoomed out to fit, so no scrolling is needed while placing.
- During the race, opponents who are off screen are shown by arrows on the screen edges.
- A dead player chooses which living player their camera follows.

Decided (2026-11-24): dead players can place blocks during the race. Living players only place objects during the placement step, never during the race. This gives dead players something to do while they watch, without weakening the traps for the living (a living player cannot bridge over the saw that threatens them).

Decided (2026-11-24), details of the rule above:

- Dead players place platforms only, never traps. A platform scores nothing, so dying early never becomes a way to earn kill points.
- One block per dead player per round, placed by clicking a cell (the same targeting as the placement screen).
- A block cannot be placed on the start, on the finish, on another object, or on or right next to a living player (so nobody gets stuck inside a block that appears on them). The reachability check applies as for normal placement.
- These blocks disappear at the end of the round, so the level does not fill up faster than the placement step intends.
- Network: the dead player's client sends the placement to the server, which validates it and broadcasts it with the round time at which it appears. Every client then adds it to the collision grid. This is one more exception to "objects are not synchronised" (see Network model).

Default: maximum level width about 2 screens (64 cells).

Decided (2026-11-24): a path from the start to the finish must always exist. Otherwise a single player can wall off the level (with saws, for example) and nobody can score until the end of the game. Placement validation must therefore check that the finish stays reachable, not only that the target cell is free.

Default, not yet discussed with Dorian:

- Reachability is checked on the grid with the character's real abilities (run, jump, wall jump, springs and vines once they exist), using the same tuning values as the controller. Cells occupied or swept by a killing object count as blocked, including the whole path of moving objects (moving saw, ball and chain, cannon line of fire), so the check stays static and does not depend on timing.
- Placement is simultaneous, so placements that are each legal on their own can block the path together. The server applies the round's placements one at a time, in the order they were validated, and rejects any that would cut the last path. A rejected object is lost, and its owner is told so.
- The placement screen shows the player straight away when the cell they are aiming at would cut the path, so a rejection at the end of placement stays rare.

Defaults added while building step 3 (2026-11-24), not yet discussed with Dorian:

- Placement: a card is picked from the tray, then a cell is clicked; clicking one of this round's objects takes it back. "Valider la pose" is enabled once all of the round's objects are placed. When the timer runs out, objects not placed are lost.
- A 1.5-second "Prêt ?" countdown separates placement from the race; it does not count in the race time.
- With a single player, the "everyone finished, nobody scores" rule is skipped, otherwise a solo game could never score. This is only for local testing.
- Objects can be placed anywhere that is free, including in mid-air (floating spikes, floating saws).
- Interface (menu, timer, tray, scores) is HTML over the Phaser canvas rather than drawn in Phaser.

Decided (2026-11-24, step 4): when the host starts a game, a carousel spins through the maps and stops on one drawn at random by the server; every round of that game is played on it. More maps will be added later (list in `packages/shared/src/levelList.ts`).

Defaults added while building step 4 (2026-11-24), not yet discussed with Dorian:

- Colyseus is used for rooms, connections and reconnection only. Its automatic state sync is not used: every exchange is an explicit message, all listed in `packages/shared/src/protocol.ts`.
- All game logic (lobby, rounds, placement checks, scoring) is one network-free class, `GameSession`, in the shared package. The server room only plugs it into Colyseus, and the offline solo mode runs the same class in the browser.
- A room is joined with a 4-letter code (no I or O) or a link `?salon=CODE`. Up to 5 players (`MAX_PLAYERS`), colours by order of arrival (black, white, blue, green, purple; `packages/client/src/render/playerColors.ts`, one colour per seat). The first player is the host and picks 10 or 25 points; if the host leaves, the next player becomes host.
- The host can start alone; the solo scoring exception then applies. This is meant for testing.
- Nobody can join a game in progress. A dropped player has 30 seconds to reconnect and gets the current phase back.
- Placement checks on the client and on the server both use `DEFAULT_MOVEMENT`, so tuning-panel values must be pasted there before they count for the server.
- Other players are drawn 100 ms in the past, interpolated between position updates (20 per second).
- A dead player's block becomes solid 300 ms after the server accepts it, and never inside a running player's body.
- After a death or a finish, the camera follows a living player; left and right arrows switch players.

Decided (2026-11-24, build step 5):

- Objects are no longer chosen: each player gets exactly the objects they must place this round, drawn at random (`extraOffered` is 0 in the game config). The player still chooses where to put them, in which order, and which way a cannon points. A hand never holds the same object three times.
- Players collide. This replaces "Players do not collide with each other" in the network model. Landing on another player's head bounces you higher than a jump (holding jump gives the full bounce) and slams the other player down with a short stun (no jump, slow run). Touching sideways pushes both players apart.
- The game has 10 maps: Le Parc, La Tour, La Grotte, Les Toits, L'Usine, Le Puits (one screen, 32 wide), Le Grand Huit, Le Labyrinthe, La Jungle, Le Pont. Each was checked with `packages/shared/scripts/check-level.ts`: finishable with its own objects, at most 1.3 % of free cells where a single saw would be refused, reach graph built in under 400 ms. Known weak spot (from the map critique): four maps share the same "ground lane + floating upper lane, left to right" skeleton (Parc, Toits, Jungle, Pont), no map reads right to left, and cannons, spikes and `=` platforms each appear in only one map.

Defaults added while building step 5 (2026-11-24), not yet discussed with Dorian:

- Contacts are resolved by the player they push, so each machine still only moves its own character. The stomper's machine detects the stomp against the ghost it sees (about 100 ms in the past), bounces, and sends `stomp`; the server checks it is plausible (both running, last poses within 3 cells, not twice within 350 ms) and broadcasts `stomped`; the victim's machine slams its own character. A bump needs no message: both machines see the touch and each pushes its own character away. A bump only fires when a touch starts, and no contact counts in the first 0.8 s of the race, because everyone starts on the same cell.
- ~~Stomps and bumps never score.~~ Replaced on 2026-11-25 by the push-kill rule (see Scoring). A stomp or bump on its own still scores nothing; only the trap death that follows it does.
- The score leader (alone in first place, with points) wears an orange crown.
- Cannon: placed with a direction (R or right click turns it during placement, default left). It is a solid block and fires a ball every 2 s (first shot between 0.6 s and 2.6 s into the race, depending on its id, so cannons are not in step). A ball flies at 7 cells per second until the first solid cell. The line of fire is measured when the race starts; blocks placed by dead players during the race do not stop balls. For the reachability check, the whole line of fire counts as deadly.
- Spring: a solid block; landing on top throws the character 7 cells up, whatever the jump button does. Nobody can stand on it.
- Vine: the anchor block is solid, the rope hangs up to 4 cells below it (shorter if something is in the way). A player touching the rope in mid-air grabs it, keeps their momentum, swings (left and right pump the swing) and lets go with jump, with an upward push. Only one player holds a vine: the client grabs at once and tells the server; if someone else got it first, the server says so and the client lets go. The reachability check never uses vines, so a vine can only add routes.
- Maps can contain objects, written as characters in the level rows (`*` saw, `^` spikes, `=` platform, `T` spring, `V` vine, `<` `>` `A` `U` cannons). They are there from the first round, belong to nobody and never score kills.
- Draw weights: saw 1, spikes 1, cannon 0.8, spring 0.8, platform 0.8, vine 0.6.
- Movement values for these (spring height, stomp bounce, slam speed, stun time, bump speed, swing pump) live in `DEFAULT_MOVEMENT` and in the tuning panel ("Interactions").

## Scoring

Decided:

| Event | Points |
|---|---|
| Reaching the finish | 2 |
| Reaching the finish first | +1 |
| Being the only player to reach the finish | +1 |
| Your object kills a player | +1 per player killed |
| You pushed that player into your own object | +2 instead of +1 |

At most 2 victims count per trap owner per round (`killCap`), so kills are worth at most 4 points a round.

- If every player reaches the finish, nobody scores anything that round (the level was too easy).
- If no player reaches the finish, nobody scores anything that round, trap kills included. This removes the incentive to make the level impossible.
- Dying to your own object gives you nothing.
- If a player touches several traps, the kill goes to the last one touched.

Decided (2026-11-25, by Dorian), push-kills:

- A player who dies in a trap shortly after being stomped or bumped still gives the trap's owner the kill point (+1), even when someone else did the pushing. The pusher gets nothing for pushing someone into another player's trap.
- If the pusher is the trap's owner, the kill is worth +2.
- Deaths in your own trap, in a map object or in a pit still score nothing, and so does any round where everyone or nobody finished.

Defaults added while building the push-kill rule (2026-11-25), not yet discussed with Dorian:

- Push credit window: 1.2 s (`TIMING.pushCredit`), not the 1.5 s first suggested. A stomp stuns for 0.55 s, a 10-cell fall takes about 0.6 s and a shove off a ledge into a trap below about 0.4 s, so 1.2 s covers real pushes; 1.5 s would leave about 1.3 s of full control after a bump (about 9 cells of running), which is a trap the victim walked into. The clock starts when the push lands on the victim's own machine, so lag does not shorten it. Only the latest push counts.
- Who pushed is reported by the victim: its `died` message carries an optional `pushedBy` (stomper, or the other player of a bump that actually moved it; a player on a vine is not shoved). The server accepts it if it names a known player other than the victim, the death is on an object, and the race is past the 0.8 s start grace; otherwise it is ignored. A pit death never carries a pusher. Stomps are not cross-checked against the server's own stomp record, because bumps leave no trace on the server anyway; this is the same trust as for reported deaths (see Network model), and a lying client can only give points to someone else. The reasoning is in the `checkPusher` doc comment in `packages/shared/src/session.ts`.
- Cap ordering: when an owner has more than 2 victims, the 2 most valuable count (push-kills first), so the cap is 2 victims, not 2 points.
- The score table's "Pièges" column shows kill points, with the number of push-kills next to it (for example "3 (1 poussé)"). In-race notices say who pushed whom into whose trap ("Tu as poussé Bob dans ton piège ! +2", "Carol a poussé Bob dans le piège d'Alice"), with a "+2" burst where the victim died.

## Rules screen and tutorial

Decided (2026-11-25, by Dorian): the game has a rules screen and a short tutorial, 20 to 30 seconds at most.

How they are reached:

- Main menu: "Tutoriel (30 s)" and "Règles". Until the tutorial has been finished or skipped once, both buttons sit at the top under "Nouveau ? Commence ici ↓", with the tutorial in orange; afterwards they move to the bottom under "Apprendre". The flag is localStorage `pts.tutorialDone` = `"1"`; delete it to see the new-player menu again.
- Lobby: a "Règles" button next to "Quitter".
- The rules panel (`packages/client/src/ui/rulesScreen.ts`) is HTML over the canvas, in French. It closes with ✕, Échap, "Compris !" or a click outside, and also when the scene changes (for example the game starts while someone is reading).
- The tutorial is the Phaser scene `tutorial` (`packages/client/src/scenes/TutorialScene.ts`, logic in `packages/client/src/tutorial/`). Entrée or "Étape suivante" skips a step, Échap or "Passer le tuto" goes back to the menu. Skipping, reaching the end card or pressing "Jouer" sets the flag.

Defaults added while building them (2026-11-25), not yet discussed with Dorian:

- The rules panel takes times, object counts, the kill cap and the 10/25 targets from the config, and the object list from `OBJECT_DEFS`. The point values (+2, +1, +1, +1, +2) are written by hand, because the scoring code has them as plain numbers: if scoring changes, update `rulesScreen.ts` and the tutorial texts by hand. The panel also states that the level is kept between rounds and that an object cutting every path to the flag is refused.
- Tutorial script, on one 1280x720 screen that is not one of the race maps: (1) run and jump over a 2-wide pit; (2) place a saw on the scripted rival's path, the rival dies in it, "+1 : il est mort dans TON piège"; (3) stomp the rival, "POF ! Il est sonné.", then the tip "Pousse un rival dans TON piège : +2"; (4) run to the flag, "+2 en arrivant, +1 si tu es premier"; end card with a points recap, "Jouer" and "Revoir". The rival is a real movement controller with scripted inputs and dies through the normal hazard check.
- It never stalls: a step not done in time is done for the player (the saw after 6 s, other steps after 3 to 5 s). Falling in the pit puts the player back at the step's checkpoint ("Oups ! On reprend d'ici."). Timers run on real time, not Phaser frame time, so a slow machine does not stretch it.
- Measured: about 21 s for a player who reads the prompts, 29.3 s for a player who touches nothing, about 18.5 s for a bot that reacts instantly (see Open questions).
- On the end card, "Jouer" is not focused and Entrée only counts as "Jouer" after 0.7 s, so a player pressing Entrée to skip lines does not skip the end card by accident.

## Character movement

Decided:

- Three inputs only: left, right, jump. Keyboard and gamepad.
- Single run speed, no sprint.
- Variable jump height: short press, small jump; long press, full jump.
- Wall jump, and wall slide (slower fall while pressed against a wall).
- No double jump, no dash.
- Coyote time and jump buffering, about 0.1 second each.
- Full air control.

Starting values, to be tuned by hand (Default): cell size 40 px, character about one cell, run speed 7 cells per second, maximum jump height 3 cells, jump length at full speed 5 cells. Level design rule that follows: a 4-cell gap is comfortable, 5 is the limit, 6 needs a vine or a spring.

Movement feel is the single most important thing in this project. Write the character controller by hand (do not use the engine's physics for it), keep every tuning value in one config object, and get Dorian to play it before building anything on top.

## Objects

Decided: 15 objects in total, in three families. The colour of an object tells the player what it does (see Art direction).

Kills (red):

| Object | Behaviour |
|---|---|
| Saw | Fixed, kills on contact |
| Moving saw | Travels back and forth over 3 cells |
| Spikes | Kill a player who lands on them |
| Cannon | Fires a ball every 2 seconds |
| Crusher | Slams down when a player passes underneath |
| Ball and chain | Rotates around its anchor point |

Helps (orange). These are meant to be double-edged: a spring placed in front of a saw kills.

| Object | Behaviour |
|---|---|
| Spring | Bounces the player very high |
| Conveyor belt | Speeds the player up in one direction |
| Vine | See below |
| Bubble | Absorbs one hit, single use, first player to touch it takes it |

Neutral (black and white):

| Object | Behaviour |
|---|---|
| Platform | A solid block |
| Moving platform | Moves in a loop |
| Fragile platform | Collapses after one player has stood on it |
| Glue | Slows the player and reduces jump height |
| Eraser | Removes an object already placed. Must stay rare in the draw. |

The vine was Dorian's own addition. Placing it on an empty cell creates a one-cell solid anchor block with the vine hanging below it (3 or 4 cells long). A player who touches it in mid-air grabs it automatically, keeps their momentum, swings like a pendulum, and lets go by pressing jump. Only one player can hold it at a time; the others pass through. Start with a rigid rope of fixed length, no rope simulation.

First batch to implement (Decided): saw, spikes, cannon, spring, platform, vine. The other nine come after the first playtests with friends.

## Art direction

Decided: a sketchbook look, taken from Dorian's own design system, "Vidal Street": paper background, black felt-pen outlines, flat fills, solid offset shadows with no blur, and very few colours. He compared it with a cel-shaded version and chose this one for its minimalism.

Colour rules (Decided):

- Red means it kills. Nothing else is red.
- Orange means it helps, and is also used for the interface (timer, finish flag, main button).
- Players are black, white, blue and green. No player is orange or red.
- Never rely on colour alone: object cards also carry a text label ("TUE" or "AIDE").

Values used in the mockups:

| Role | Value |
|---|---|
| Paper background | `#f5f2ea` |
| Grid and hatching lines | `#dcd8cc` |
| Ink (outlines, text, shadows) | `#161616` |
| Surfaces (platforms, cards) | `#ffffff` |
| Orange | `#f07a2e` |
| Danger red | `#b3361a` |
| Players | `#161616`, `#ffffff`, `#2b59c3`, `#3fa35c` |

- Outlines are 2.5 px. Shadows are solid and offset down-right (`3px 5px 0 #161616`).
- Fonts (Google Fonts): Fredoka for titles and buttons, Rubik for interface text, Permanent Marker for short handwritten notes.
- Platforms are white with light diagonal hatching. Characters are small pebble-shaped blobs with two eyes.
- A dead player leaves an ink stain in their colour where they died. Stains stay for the rest of the game.

Two screens were mocked up: the race, and the placement screen (level with a grid, a dashed preview cell showing where the object will land, a tray with the three drawn objects, one orange "Valider la pose" button, and the placement status of each player). The mockups live in a private Claude artifact that Claude Code cannot open; ask Dorian for screenshots if you need them.

## Technical choices

Decided:

- Client: Phaser 4 with TypeScript, used for rendering, scenes and input.
- Server: Colyseus on Node.js, for rooms, reconnection and shared state. Same language on both sides so that object logic and message types can be shared.
- Hosting: Dorian's Raspberry Pi, in Docker, behind his existing Cloudflare Tunnel.

Network model (Decided):

- Each client simulates its own character and sends its position to the server about 20 times per second. Other players are drawn as interpolated ghosts. ~~Players do not collide with each other.~~ Players collide since build step 5 (see above).
- Objects are not synchronised. Their state is a pure function of the round clock, which every client shares. Any object logic must therefore be deterministic and driven by elapsed round time, never by per-frame accumulation. Objects triggered by a player (crusher, fragile platform, bubble, vine occupancy) and blocks placed by dead players during the race are the exception and need a server message. Stomps between players also go through the server (see build step 5 above).
- The server is the referee: it runs the timers, receives placements, checks that they are legal, attributes kills and counts points.
- Cheating is not a concern. A client could lie about its position; among friends this is accepted.

Known limits Dorian has been told about: the Raspberry Pi is a single point of failure, latency depends on the route through Cloudflare, and Phaser 4 is recent (first stable release in April 2026), so many online tutorials still target version 3. Check the current Phaser 4 and Colyseus documentation instead of relying on memory.

Colyseus was accepted with one reservation: it is an abstraction layer, which goes against Dorian's preference. If it gets in the way, a plain WebSocket server is an acceptable replacement for five players. Ask before switching.

## Build order

Each step must end with something playable. Do not start a step before the previous one has been played by Dorian.

1. **Character alone.** Empty test level, run, variable jump, wall slide, wall jump, coyote time, jump buffer. Done when Dorian says it feels good.
2. **One level and three objects.** Saw, spikes, platform, plus death and the finish. Playable solo.
3. **Round loop, local.** Draw, placement (including the check that the finish stays reachable), race, score, on one machine with one player.
4. **Multiplayer.** Rooms, ghosts, shared round clock, server-side scoring, blocks placed by dead players. This is the first playtest with friends.
5. **Rest of the first batch and the look.** Cannon, spring, vine, then the sketchbook art direction. Built on 2026-11-24 together with player contacts, the random draw and 10 maps; on 2026-11-25 push-kill scoring, the rules screen and the tutorial were added. Waiting for Dorian's playtest.
6. **Deployment** to the Raspberry Pi.

The playtest comes at step 4, before the art, on purpose: use plain rectangles until then, so that rule changes are cheap.

## Open questions for Dorian

- Maximum width of scrolling levels (proposed: about 2 screens, 64 cells).
- Whether a catch-up bonus is needed for the last-placed player (only if playtests show the leader running away).
- How rare the eraser should be.
- Push credit window: 1.2 s today (`TIMING.pushCredit`). Worth checking in the playtest that pushes into traps feel credited and walk-ins do not.
- Tutorial floor: a very fast player finishes in about 18.5 s, under the 20 s asked. Raising it means keeping the explanation lines on screen longer, and then the do-nothing run would go past 30 s unless the auto-help delays get shorter.

## Where to start

Set up the repo (client and server packages, shared types), then do step 1 only. Before writing code, tell Dorian in a few lines how you plan to structure the project and wait for his answer.
