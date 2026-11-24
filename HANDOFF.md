# Handoff: trap-the-level multiplayer platformer

This document hands a game project over to Claude Code. The design was worked out in a conversation between Dorian (the developer and owner of this repo) and Claude. Everything below is the result of that conversation. No code exists yet.

Dorian is a web developer (Next.js, C#/ASP.NET, PHP/Laravel, Docker). He has not built a game before. He prefers to understand what is built over hiding it behind abstractions, and he wants direct feedback: when a choice of his has a real drawback, say so. Talk to him in French. All in-game text is French. Code, comments and commit messages are in English.

## What the game is

A 2D side-view platformer played online by a group of friends, in the browser. Everyone races through the same level. Before each round, every player adds one object to the level: a trap to kill the others, or a helper. The level fills up round after round, so the players build the difficulty themselves. That is what makes it replayable: the content comes from the players, and the game balances itself because a level nobody can finish scores nothing.

The game has no name yet. Ask Dorian before naming the repo, the package or anything visible.

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
- Players per room: 2 to 4. The game is designed for 3 or 4; with 2 it still works but traps matter less.
- The level starts with no player-placed objects.
- Levels are hand-made at first.

Decided (2026-11-24):

- Each player places 3 objects per round at the start of a game, then 2 objects per round once a given number of rounds have been played. Keep both counts and the switch-over round in the game config (Default switch-over: after round 3) so they can be changed after playtests. This replaces the earlier one-object-per-round design wherever it appears below.
- Placement lasts 35 seconds (replaces the 25-second default).
- Some levels scroll horizontally, with a camera following the player. Single-screen levels (32 by 18 cells, as in the mockups) remain possible; the level format and the camera must support any width.
- The placement screen shows the whole level zoomed out to fit, so no scrolling is needed while placing.
- During the race, opponents who are off screen are shown by arrows on the screen edges.
- A dead player chooses which living player their camera follows.

Default: maximum level width about 2 screens (64 cells).

Decided (2026-11-24): a path from the start to the finish must always exist. Otherwise a single player can wall off the level (with saws, for example) and nobody can score until the end of the game. Placement validation must therefore check that the finish stays reachable, not only that the target cell is free.

Default, not yet discussed with Dorian:

- Reachability is checked on the grid with the character's real abilities (run, jump, wall jump, springs and vines once they exist), using the same tuning values as the controller. Cells occupied or swept by a killing object count as blocked, including the whole path of moving objects (moving saw, ball and chain, cannon line of fire), so the check stays static and does not depend on timing.
- Placement is simultaneous, so placements that are each legal on their own can block the path together. The server applies the round's placements one at a time, in the order they were validated, and rejects any that would cut the last path. A rejected object is lost, and its owner is told so.
- The placement screen shows the player straight away when the cell they are aiming at would cut the path, so a rejection at the end of placement stays rare.

## Scoring

Decided:

| Event | Points |
|---|---|
| Reaching the finish | 2 |
| Reaching the finish first | +1 |
| Being the only player to reach the finish | +1 |
| Your object kills a player | +1 per player killed, capped at 2 per round |

- If every player reaches the finish, nobody scores anything that round (the level was too easy).
- If no player reaches the finish, nobody scores anything that round, trap kills included. This removes the incentive to make the level impossible.
- Dying to your own object gives you nothing.
- If a player touches several traps, the kill goes to the last one touched.

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

- Each client simulates its own character and sends its position to the server about 20 times per second. Other players are drawn as interpolated ghosts. Players do not collide with each other.
- Objects are not synchronised. Their state is a pure function of the round clock, which every client shares. Any object logic must therefore be deterministic and driven by elapsed round time, never by per-frame accumulation. Objects triggered by a player (crusher, fragile platform, bubble, vine occupancy) are the exception and need a server message.
- The server is the referee: it runs the timers, receives placements, checks that they are legal, attributes kills and counts points.
- Cheating is not a concern. A client could lie about its position; among friends this is accepted.

Known limits Dorian has been told about: the Raspberry Pi is a single point of failure, latency depends on the route through Cloudflare, and Phaser 4 is recent (first stable release in April 2026), so many online tutorials still target version 3. Check the current Phaser 4 and Colyseus documentation instead of relying on memory.

Colyseus was accepted with one reservation: it is an abstraction layer, which goes against Dorian's preference. If it gets in the way, a plain WebSocket server is an acceptable replacement for four players. Ask before switching.

## Build order

Each step must end with something playable. Do not start a step before the previous one has been played by Dorian.

1. **Character alone.** Empty test level, run, variable jump, wall slide, wall jump, coyote time, jump buffer. Done when Dorian says it feels good.
2. **One level and three objects.** Saw, spikes, platform, plus death and the finish. Playable solo.
3. **Round loop, local.** Draw, placement (including the check that the finish stays reachable), race, score, on one machine with one player.
4. **Multiplayer.** Rooms, ghosts, shared round clock, server-side scoring. This is the first playtest with friends.
5. **Rest of the first batch and the look.** Cannon, spring, vine, then the sketchbook art direction.
6. **Deployment** to the Raspberry Pi.

The playtest comes at step 4, before the art, on purpose: use plain rectangles until then, so that rule changes are cheap.

## Open questions for Dorian

- The game's name.
- Maximum width of scrolling levels (proposed: about 2 screens, 64 cells).
- After how many rounds the object count drops from 3 to 2 (Default: after round 3).
- Whether a catch-up bonus is needed for the last-placed player (only if playtests show the leader running away).
- How rare the eraser should be.

## Where to start

Set up the repo (client and server packages, shared types), then do step 1 only. Before writing code, tell Dorian in a few lines how you plan to structure the project and wait for his answer.
