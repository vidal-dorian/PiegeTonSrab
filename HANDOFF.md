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
- Placement rules: an object cannot be placed on the spawn pad (see below), on the finish, or on top of another object.
- Players per room: 2 to 5 (raised from 4 by Dorian on 2026-11-25). The game is designed for 3 to 5; with 2 it still works but traps matter less.

Decided (2026-11-25, with Dorian): the start is a protected 5-seat spawn pad, so five players do not start stacked on one cell (where one trap next to S would kill everyone at once).

- The pad is the S cell plus 2 cells on each side on the same row (5 floor cells), and the 2 rows above them. Each seat (the player's colour index) spawns on its own pad cell: offsets 0, -1, +1, -2, +2 from S, so seat 0 (solo, practice, tutorial) is S itself and a small room stays bunched around S.
- Nothing can ever be placed on the pad: no round object, no dead player's block, no practice-editor object (`canPlaceAt` in `objects.ts` refuses every pad cell).
- A map's pad must be empty floor on solid ground (terrain or a map `=` platform, not a spring) with 2 empty rows above. `check-level` reports a broken pad and `packages/client/src/spawn.test.ts` checks every map. On a map whose pad is broken, a seat falls back to S. Code: the "Spawn pad" part of `packages/shared/src/level.ts`.
- Reachability stays rooted at S alone: the pad is flat, free floor that nothing can occupy, so every seat can walk to S.
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

- Placement: a card is picked from the tray, then a cell is clicked; clicking one of this round's objects takes it back. "Valider la pose" is enabled once each of the round's objects is placed or discarded (see "Placement feedback" below). When the timer runs out, objects not placed are lost.
- A 1.5-second "Prêt ?" countdown separates placement from the race; it does not count in the race time.
- With a single player, the "everyone finished, nobody scores" rule is skipped, otherwise a solo game could never score. This is only for local testing.
- Objects can be placed anywhere that is free, including in mid-air (floating spikes, floating saws).
- Interface (menu, timer, tray, scores) is HTML over the Phaser canvas rather than drawn in Phaser.

Placement feedback, added on 2026-11-25 (defaults, not yet discussed with Dorian): an action that fails always tells the player why, in French. Texts are in `packages/client/src/ui/feedback.ts`.

- A player may validate with objects that have no place left. On a crowded map late in a game, an object can have no accepted cell anywhere. A Web Worker (`packages/client/src/sim/placementRoom.ts` and `placementRoom.worker.ts`) looks for one, for every kind still in hand and every cannon direction. It first runs the cheap check on the existing reach graph, stopping at the first accepted cell, which is the usual outcome. Only if that refuses every cell does it run the real check (a full rebuild each), most promising cells first, for at most 12 s. If nothing is accepted, the card gets a red "Plus de place" stamp and is discarded, with a notice ("Plus aucune place pour ta Scie : elle est défaussée."). A new search starts whenever the player's pending objects change. A "Défausser" button also discards the selected card by hand; clicking a discarded card takes it back. "Valider la pose" unlocks once every object is placed, discarded or out of room. Discarded objects are simply not placed this round.
- The server (`session.ts`) accepts a validated placement with fewer objects than needed, and still rejects one with more. A player can only give up their own objects, which cannot hurt anyone else, so there is nothing to check.
- Clicking a refused cell shows the hover reason in a small label above the cell ("Bloquerait le chemin vers l'arrivée", "Case déjà prise", "Pas sur la zone de départ ni sur l'arrivée", "Pas dans le décor", ...) and shakes the dashed cell red. The same applies to a cannon that cannot be turned without blocking, to a click after validating, to dead players' blocks (checked before sending), and to a block the server refuses.
- End of placement: the `countdown` message carries `refusedObjects` (kind and reason: `path`, together with the others' objects it would have cut the last path; `taken`, a player who validated earlier had that cell; `invalid`, nothing can go there) and `unplaced` (objects still in hand when the timer ran out, only for a player who did not validate). The client shows one sentence per reason, for example "Ta Scie a été refusée : avec les objets des autres, elle aurait bloqué le chemin." or "Temps écoulé : 2 objets non posés (Canon, Ressort)."
- Other failures that used to be silent now have a message: joining a game in progress ("La partie a déjà commencé.", through the join error code `JOIN_REFUSED_CODE` instead of looking like "server down"), a vine held by someone else, a vine the server gives to someone else first, a number key on a card that cannot be used, and a host who leaves (the new host is told, and on the online end-of-game screen gets the "Rejouer" button).

Decided (2026-11-24, step 4): when the host starts a game, a carousel spins through the maps and stops on one drawn at random by the server; every round of that game is played on it. More maps will be added later (list in `packages/shared/src/levelList.ts`).

Defaults added while building step 4 (2026-11-24), not yet discussed with Dorian:

- Colyseus is used for rooms, connections and reconnection only. Its automatic state sync is not used: every exchange is an explicit message, all listed in `packages/shared/src/protocol.ts`.
- All game logic (lobby, rounds, placement checks, scoring) is one network-free class, `GameSession`, in the shared package. The server room only plugs it into Colyseus, and the offline solo mode runs the same class in the browser.
- A room is joined with a 4-letter code (no I or O) or a link `?salon=CODE`. Up to 5 players (`MAX_PLAYERS`), colours by order of arrival (black, white, blue, green, purple; `packages/client/src/render/playerColors.ts`, one colour per seat). The first player is the host and picks 10 or 25 points; if the host leaves, the next player becomes host.
- The host can start alone; the solo scoring exception then applies. This is meant for testing.
- Nobody can join a game in progress. A dropped player has 30 seconds to reconnect and gets the current phase back.
- Placement checks on the client and on the server both use `DEFAULT_MOVEMENT`, so tuning-panel values must be pasted there before they count for the server. The tuning panel (Tab) exists in dev builds only (Decided 2026-11-25, by Dorian: in a real game it let anyone change their own gravity); production builds play with the defaults and clear values an older build saved.
- Other players are drawn 100 ms in the past, interpolated between position updates (20 per second).
- A dead player's block becomes solid 300 ms after the server accepts it, and never inside a running player's body.
- After a death or a finish, the camera follows a living player; left and right arrows switch players.

Decided (2026-11-24, build step 5):

- Objects are no longer chosen: each player gets exactly the objects they must place this round, drawn at random (`extraOffered` is 0 in the game config). The player still chooses where to put them, in which order, and which way a cannon points. A hand never holds the same object three times.
- Players collide. This replaces "Players do not collide with each other" in the network model. Landing on another player's head bounces you higher than a jump (holding jump gives the full bounce) and slams the other player down with a short stun (no jump, slow run). Touching sideways pushes both players apart.
- The game has 10 maps: Le Parc, La Tour, La Grotte, Les Toits, L'Usine, Le Puits, Le Grand Huit, Le Labyrinthe, La Jungle, Le Pont. Each was checked with `packages/shared/scripts/check-level.ts`: finishable with its own objects, at most 1.3 % of free cells where a single saw would be refused, reach graph built in under 400 ms. Known weak spot (from the map critique): four maps share the same "ground lane + floating upper lane, left to right" skeleton (Parc, Toits, Jungle, Pont), no map reads right to left, and cannons, spikes and `=` platforms each appear in only one map.
- Update 2026-11-25: every map was then tuned for 5 players against the stress simulator's targets (see "Map stress test for 5 players" below). All ten are now 64 x 18. Le Puits was rebuilt (it was 32 wide and broke at 5 players) and is now the one map that reads right to left. La Tour, La Grotte, Le Grand Huit and Le Labyrinthe were reworked for more width, parallel lanes and room at the finish; Les Toits, L'Usine, La Jungle and Le Pont got local fixes; Le Parc only got a comment. `=` platforms now appear in two maps (Le Puits, Le Grand Huit); cannons (L'Usine) and spikes (La Jungle) are still in one map each, and Parc, Toits, Jungle and Pont still share a skeleton. Each map's header comment in `packages/shared/src/levels/` describes its layout, routes, built-in objects and 5-player intent.

Defaults added while building step 5 (2026-11-24), not yet discussed with Dorian:

- Contacts are resolved by the player they push, so each machine still only moves its own character. The stomper's machine detects the stomp against the ghost it sees (about 100 ms in the past), bounces, and sends `stomp`; the server checks it is plausible (both running, last poses within 3 cells, not twice within 350 ms) and broadcasts `stomped`; the victim's machine slams its own character. A bump needs no message: both machines see the touch and each pushes its own character away. A bump only fires when a touch starts, and no contact counts in the first 0.8 s of the race, because everyone starts on the same cell.
- ~~Stomps and bumps never score.~~ Replaced on 2026-11-25 by the push-kill rule (see Scoring). A stomp or bump on its own still scores nothing; only the trap death that follows it does.
- The score leader (alone in first place, with points) wears an orange crown.
- Cannon: placed with a direction (R or right click turns it during placement, default left). It is a solid block and fires a ball every 2 s (first shot between 0.6 s and 2.6 s into the race, depending on its id, so cannons are not in step). A ball flies at 7 cells per second until the first solid cell. The line of fire is measured when the race starts; blocks placed by dead players during the race do not stop balls. For the reachability check, the whole line of fire counts as deadly.
- Spring: a solid block; landing on top throws the character 7 cells up, whatever the jump button does. Nobody can stand on it.
- Vine: the anchor block is solid, the rope hangs up to 4 cells below it (shorter if something is in the way). A player touching the rope in mid-air grabs it, keeps their momentum, swings (left and right pump the swing) and lets go with jump, with an upward push, or with down (S, down arrow, d-pad or stick down), which keeps the swing's momentum with no push (Decided 2026-11-25, by Dorian). Down wins over jump in the same step. The vine let go of with down is not grabbed again until the body is out of its reach or lands, and holding down passes vines by. Only one player holds a vine: the client grabs at once and tells the server; if someone else got it first, the server says so and the client lets go. The reachability check never uses vines, so a vine can only add routes.
- Maps can contain objects, written as characters in the level rows (`*` saw, `^` spikes, `=` platform, `T` spring, `V` vine, `<` `>` `A` `U` cannons). They are there from the first round, belong to nobody and never score kills.
- Draw weights: saw 1, spikes 1, cannon 0.8, spring 0.8, platform 0.8, vine 0.6.
- Movement values for these (spring height, stomp bounce, slam speed, stun time, bump speed, swing pump) live in `DEFAULT_MOVEMENT` and in the tuning panel ("Interactions").

## Map stress test for 5 players

Added on 2026-11-25 (defaults, not yet discussed with Dorian). Objects stay on the map for the whole game, so a map that is fine at round 1 can be a wall of saws by round 10 with 5 players. `check-level` only looks at the empty map, so `packages/shared/scripts/stress-level.ts` replays the placement side of a whole game:

```bash
npx tsx packages/shared/scripts/stress-level.ts level6            # one map (or several, or --all)
npx tsx packages/shared/scripts/stress-level.ts --all --players 5 --rounds 10 --seeds 5 --json out.json
#   --rounds 16   long game     --dump  print each seed's final map     --show  print the race line only
#   --jobs N      worker processes (default: one per core; pass 1 when other heavy jobs share the machine)
```

- It uses the real rules from `src/` (`objectsForRound`, `drawOffer`, `canPlaceAt`, `PathGuard`, `prepareObjects`), so a rule change is followed automatically; at 5 players that means 2 objects per player from round 1. Each round, every player draws their objects and is applied in a random validation order, like `endPlacement`. A "plausible player" puts each object on the race line (cells that near-shortest routes pass through) 70 % of the time, anywhere legal otherwise, and tries another cell when one is refused, up to 10 cells; then the object counts as lost. From round 2, dead players drop 2 blocks per round, measured but not carried over.
- Per round it prints the median over seeds of: objects, free cells, `ref%` (share of tried cells refused), lost objects, `stand` (reachable standing cells), `crit%` (cells where one more saw would be refused, estimated on a sample), route hops and cells and `×r0` (route length against round 0), and the server cost: graph build, worst end of placement, rebuilds and slowest single check, in ms. The JSON also has every seed's rounds and final map.
- Everything is deterministic per (map, seed) except the timings. Timings depend on machine load: judge build cost on the median, not on one maximum.

Targets every map was tuned against, at 5 players, median over 5 seeds:

| | Target |
|---|---|
| T1 refusals | `ref%` pooled over rounds 8-10 of a 10-round run ≤ 40 %; over rounds 14-16 of a 16-round run ≤ 60 % |
| T2 critical cells | ≤ 22 % at round 10, ≤ 25 % at round 16; ≤ 1.5 % on the empty map (`check-level`) |
| T3 lost objects | no seed-round with a lost object in 10 rounds; at most 2 of 80 seed-rounds in 16 |
| T4 no collapse | at round 10, reachable standing cells ≥ 50 % of round 0, and route `×r0` between 0.85 and 1.7. Below 0.85 players built a shortcut that skips most of the map (the old Le Puits built a spring staircase to its top row); above 1.7 late races get too long for the 45 s timer |
| T5 room at the ends | at least about 14 free cells in the 7x7 box around F at round 16 (look with `--dump`); a valid spawn pad |
| T6 server cost | graph build median ≤ 300 ms and max ≤ 500 ms, worst end of placement ≤ 1.5 s |
| Static | `check-level` reachable, map at most 64 x 18 (a test enforces it), unique name, every built-in object makes sense |

Design guidance that came with them: more width and parallel lanes than a 4-player map, so 5 bodies do not queue in one corridor; at least two genuinely different routes in every section; no cheap bypass once a few platforms or springs are added; open space near the finish; a clear flow and a run of about 10 to 15 s on the empty map.

Result on 2026-11-25 (final run, all ten maps at once on 4 cores, 5 seeds): every map meets every target. Rounds 8-10 refusals 14 to 38 %, rounds 14-16 42 to 56 %, critical cells at round 10 8 to 22 %, at most 1 seed-round of 80 with a lost object in 16 rounds, standing cells at round 10 59 to 81 % of round 0, route ×1.25 to ×1.60 at round 10, at least 14 free cells around F, graph build median 103 to 230 ms and max under 480 ms, worst end of placement under 1.3 s. The tightest margins are L'Usine's critical cells at round 10 (21.5 %), La Jungle's refusals (37.5 %) and room around F (14 on one seed), and L'Usine's route at round 10 (×1.60). Single seeds can still pass a limit (for example a route of ×1.74 on one La Grotte seed): the targets are on the median.

## Scoring

Decided:

| Event | Points |
|---|---|
| Reaching the finish | 2 |
| Reaching the finish first | +1 |
| Being the only player to reach the finish | +1 |
| Your object kills a player | +1 per player killed |
| You pushed that player into your own object | +2 instead of +1 |
| Each victim past your 2 most valuable of the round, or any victim in a round nobody finished | 0.5 |

Decided (2026-11-25, by Dorian): a player killed by a trap you placed always gives you at least 0.5 point. Values live in `POINTS` (`packages/shared/src/rules.ts`); the rules screen and the tutorial read them from there.

Your 2 most valuable victims per round count at full value (`killCap`); each further victim is worth 0.5 (`POINTS.minKill`).

- If every player reaches the finish, nobody scores anything that round (the level was too easy). No trap kill can be lost there: a victim never finishes.
- If no player reaches the finish, nobody gets race points, but each trap kill is still worth 0.5, less than in a scored round, so walling the level never pays (and the placement guard refuses walls anyway).
- Dying to your own object gives you nothing.
- Death happens on the first step with any lethal contact. If several hazards touch in that step, the kill goes to a trap of a recent pusher, then to another player's trap (the one closest to the body's centre, then the newest), and only then to a map object or the victim's own trap (`findKiller`).
- Scores can be halves: they are shown with a French decimal comma ("2,5"); `gameWinner` and the target score work unchanged.

Decided (2026-11-25, by Dorian), push-kills:

- A player who dies in a trap shortly after being stomped or bumped still gives the trap's owner the kill point (+1), even when someone else did the pushing. The pusher gets nothing for pushing someone into another player's trap.
- If the pusher is the trap's owner, the kill is worth +2.
- Deaths in your own trap, in a map object or in a pit still score nothing, and so does any round where everyone finished. In a round nobody finished, a push-kill is worth 0.5 like any other trap kill.

Defaults added while building the push-kill rule (2026-11-25), not yet discussed with Dorian:

- Push credit window: 1.2 s (`TIMING.pushCredit`), not the 1.5 s first suggested. A stomp stuns for 0.55 s, a 10-cell fall takes about 0.6 s and a shove off a ledge into a trap below about 0.4 s, so 1.2 s covers real pushes; 1.5 s would leave about 1.3 s of full control after a bump (about 9 cells of running), which is a trap the victim walked into. The clock starts when the push lands on the victim's own machine, so lag does not shorten it. Every push in the window is kept: the trap's owner gets the credit if they are among the pushers of the last 1.2 s, otherwise the latest pusher does. The window counts simulated time only, so a frame stall does not expire it.
- Who pushed is reported by the victim: its `died` message carries an optional `pushedBy` (stomper, or the other player of a bump that actually moved it; a player on a vine is not shoved). The server accepts it if it names a known player other than the victim, the death is on an object, and the race is past the 0.8 s start grace; otherwise it is ignored. A pit death never carries a pusher. Stomps are not cross-checked against the server's own stomp record, because bumps leave no trace on the server anyway; this is the same trust as for reported deaths (see Network model), and a lying client can only give points to someone else. The reasoning is in the `checkPusher` doc comment in `packages/shared/src/session.ts`.
- Cap ordering: when an owner has more than 2 victims, the 2 most valuable count at full value (push-kills first), the rest 0.5 each.
- The score table's "Pièges" column shows kill points, with the victims and push-kills next to them when they differ (for example "2,5 (3 victimes)", "2 (1 victime, 1 poussé)"). In-race notices say who pushed whom into whose trap and show the real gain ("Tu as poussé Bob dans ton piège ! +2", "Bob est mort dans le piège d'Alice +0,5"), with a burst where the victim died. The gain assumes a scored round: in a round nobody finishes the table later shows 0,5 and the verdict line says why.

Defaults added with the 0.5 rule (2026-11-25, after an audit of 27 reproduced scoring issues), not yet discussed with Dorian:

- 0.5 is flat in a nobody-finished round (a push-kill too), so the whole rule fits in one line of the rules screen.
- `killCap` stays at 2 as the full-value cap: without it, 4 push-kills would give 8 points of a 10-point game in one round. The most kill points in one round is now 2+2+0.5+0.5… instead of 4.
- A death or finish reported up to 500 ms after the race closes still counts (`TIMING.lateReport`), for network latency.
- A racer who drops and reconnects during the countdown or the race runs again, and their trap death counts. A client that rejoins gets its real status (dead or finished players resume as spectators) and the round's trap deaths so far, so its kill notices stay right.
- The server only credits an object of the kill family (`OBJECT_DEFS[kind].family === "kill"`) and never a fall.
- A pit right after another player's spring or vine still scores 0: springs and vines are help objects, not traps.

## Rules screen and tutorial

Decided (2026-11-25, by Dorian): the game has a rules screen and a short tutorial, 20 to 30 seconds at most.

How they are reached:

- Main menu: "Tutoriel (30 s)" and "Règles". Until the tutorial has been finished or skipped once, both buttons sit at the top under "Nouveau ? Commence ici ↓", with the tutorial in orange; afterwards they move to the bottom under "Apprendre". The flag is localStorage `pts.tutorialDone` = `"1"`; delete it to see the new-player menu again.
- Lobby: a "Règles" button next to "Quitter".
- The rules panel (`packages/client/src/ui/rulesScreen.ts`) is HTML over the canvas, in French. It closes with ✕, Échap, "Compris !" or a click outside, and also when the scene changes (for example the game starts while someone is reading).
- The tutorial is the Phaser scene `tutorial` (`packages/client/src/scenes/TutorialScene.ts`, logic in `packages/client/src/tutorial/`). Entrée or "Étape suivante" skips a step, Échap or "Passer le tuto" goes back to the menu. Skipping, reaching the end card or pressing "Jouer" sets the flag.

Defaults added while building them (2026-11-25), not yet discussed with Dorian:

- The rules panel takes times, object counts, the kill cap and the 10/25 targets from the config, and the object list from `OBJECT_DEFS`. The point values come from `POINTS` in `packages/shared/src/rules.ts`, shown with `formatPoints` (decimal comma), so the panel and the tutorial bursts follow a scoring change; only the sentences around them are written by hand. The panel also states that the level is kept between rounds and that an object cutting every path to the flag is refused.
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

Eraser rules (Default, 2026-11-25): the eraser is a card, not an object, and takes the place of one of the round's objects. During placement the player clicks an object placed by another player in an earlier round (never their own, never the level's); it is marked with a cross and can be taken back like any other choice. At the end of placement the session applies all erasers first, in validation order, then the new objects. An eraser is lost if its target was already erased by someone else, or if removing it would cut the path to the finish (a platform, spring or vine can be the only step up, and removing a solid object can open a cannon's line of fire). A hand holds at most one eraser, with a 15% chance (`eraserChance` in the game config), and only once another player's object is in the level, so never in round 1 or in solo. It can be discarded like any card.

First batch to implement (Decided): saw, spikes, cannon, spring, platform, vine. The other nine come after the first playtests with friends.

## Art direction

Decided: a sketchbook look, taken from Dorian's own design system, "Vidal Street": paper background, black felt-pen outlines, flat fills, solid offset shadows with no blur, and very few colours. He compared it with a cel-shaded version and chose this one for its minimalism.

Colour rules (Decided):

- Red means it kills. Nothing else is red.
- Orange means it helps, and is also used for the interface (timer, finish flag, main button).
- Players are black, white, blue, green and, since rooms take 5 players, purple (`#8a4fc7`). No player is orange or red.
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
| Players | `#161616`, `#ffffff`, `#2b59c3`, `#3fa35c`, `#8a4fc7` (5th seat, added later) |

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
5. **Rest of the first batch and the look.** Cannon, spring, vine, then the sketchbook art direction. Built on 2026-11-24 together with player contacts, the random draw and 10 maps; on 2026-11-25 push-kill scoring, the rules screen and the tutorial were added, rooms went up to 5 players (5-seat spawn pad, 2 objects per player from round 1 at 5 players, all ten maps tuned with the stress simulator), and failed actions got explanations (placement feedback). Waiting for Dorian's playtest.
6. **Deployment** to the Raspberry Pi.

The playtest comes at step 4, before the art, on purpose: use plain rectangles until then, so that rule changes are cheap.

## Co-op mode: "Sauve Ton Srab" (branch `nouveau-jeu`)

A second game mode, started on 2026-11-25 on the branch `nouveau-jeu` (from main 4aec1cb). Pico Park-like
co-op: the players are tied by a rope and must help each other through puzzle levels themed on Ruben's
semester at the IUT de Rodez. It never changes the race mode: the race controller and reach graphs are
locked by `packages/client/src/controllerGolden.test.ts` (hashes recorded on main before any change).

Decided (2026-11-25, by Dorian):

- Online only, like the race mode: every player on their own computer, in a room (create, join by code or
  `?salon=` link). There is no "several players on one PC" mode; a dev-build tool (`?coopLocal=2`, two
  keyboard halves) only exists to test the rope alone.
- Any death restarts the whole level for everyone, objects included (Pico Park).
- Pure co-op: no object is designed to sabotage. The betrayals that happen anyway (walking away while a friend
  stands on your head, stepping off a plate...) are told by end-of-level titles. No score.
- One player plays Ruben, picked in the lobby, with a sweatband look; the others are his friends. The intro
  uses the real nicknames.
- The story intro (Ruben, BUT informatique at the IUT de Rodez, lost in class, always at the gym, uses Claude
  without knowing how) is made by a dedicated agent running Fable 5.2 at high effort, and by no other model.
  Every change to the animation goes back to that agent. Contract: `packages/client/src/coop/intro/introContract.ts`.
- Build everything in one go (levels included, tuned with test bots on the real physics); Dorian tests at the
  end. Each milestone is a separate, playable commit.

Defaults (proposed in the approved plan, not yet played by Dorian):

- Mode name "Sauve Ton Srab". Ruben weighs 2 on plates, seesaws and balances, pushes as two, has mass 2 on the
  rope, and cannot be carried (a friend he lands on gets squashed and he slides off). No setting turns this off.
- Rope: a chain in seat order with Ruben always last, 4.5 cells between neighbours for the whole campaign. Since
  rope v2 (below) that is a rest length along the rope's path: it wraps around the corners of all the fixed
  scenery (terrain, placed blocks `=`, springs; never the co-op things) and stretches 20 % before it stops dead. A hauled body rises at most 2.5 cells/s (Ruben 1.2); an idle
  anchor slowly slides towards the void unless it pushes away; a hanging body swings (pump, capped at 70°)
  and adds its weight to whoever holds it.
- Towers: standing on heads; a carrier cannot jump; no jump from a base in the air; no vertical speed kept
  when leaving a support (except seesaw and spring). Reach: alone a step of 2 (the jump peaks at exactly 3.0),
  a 2-tower 3, a 3-tower 4. No wall jump or wall slide in this mode. Bodies block each other sideways and never
  push each other; nothing ever crushes a body.
- The objective is Ruben's USB key: picked up on touch, taken from its holder with Down; the holder opens the
  classroom door by touching it; Down enters or leaves; the level is won when everyone is in. Holding R for
  1.5 s restarts the level (half the team from 3 players).
- Network: the server runs the authoritative co-op world (120 steps/s) from the players' inputs. Step A:
  30 compact snapshots per second, interpolated on every client. Step B: each client predicts the whole world
  ahead and reconciles on the snapshots (wired in M4; since the auto rule, on by itself when the round trip
  is short, see "Réactivité setting" below). The
  own-body-plus-ghosts model of the race mode was measured not to work for a rope or towers (a dragged
  friend moves at 0.01-0.07 cells/s instead of 3.5).
- Levels: 9 levels plus a finale in 3 parts. Their design sheets are in `docs/coop-levels.md`.

Build order (one commit per step): M0 base (golden test, controller hooks, intro contract); M1 co-op physics
and the dev tool; M2 the online room end to end (step A); M3 objects, titles, levels 1-5, intro integration;
M4 prediction (step B); M5 levels 6-10c, polish, docs.

Rope and inputs after the M1 review (2026-11-26, 15 confirmed findings fixed):

- Each taut link is solved on its own: what one end cannot take (a wall, its haul budget) goes to the other,
  so a pull passes through a friend standing still in the middle of the chain. A standing anchor never moves
  for the link to a friend hanging below it: it only slides, at 0.15 cells/s per unit of mass hanging below
  it in the whole chain, unless it pushes away. A body climbs over a lip only while the rope actually lifts
  it. The rope lifts at most at the haul speed but never cuts a body's own jump.
- Chains of three or more (second review round): a link whose straight line cuts through the terrain
  bends over one terrain corner; a friend pressed against the wall under that lip is pulled up the wall
  towards it (its length is still counted centre to centre). (Replaced by rope v2: wraps with history,
  length along the path.) A body in the air pulled into a wall slides
  along it when the link is at least 30° steep. A body holding a friend below it does not move for that
  link when it is held itself (standing, or hanging from a friend higher up), so a haul passes down the
  whole chain; a body rises no faster than what hangs below it or stands on it. The rope undoes this
  step's moves of whoever is right behind a body it pulls back, or under it (a train, a carrier), never
  pushing anyone further. The mantle needs someone up the rope walking away (directly or through
  friends standing still). A pile lifted under a ceiling rises only as far as its top can follow.
- Holding R is part of the world's inputs: the world counts the holders (one player, half the team from 3),
  restarts after 1.5 s and says who held it; the count is in the snapshots.
- Inputs are stamped with strictly increasing ticks (the server applies one change per step) and the
  heartbeat is an empty `coopIn` (it never takes a change's step).
- Prediction (step B, `packages/client/src/coop/net/predictor.ts`): the client runs the world ahead with its
  own inputs stamped for the next step it has not simulated, the others' held keys and the changes the server
  already queued for them (`coopSnap.pending`), and replays from each snapshot. The 0.06 cell measured at M1
  was one lucky run: see "Prediction wired (M4)" below for the bench over several runs.

Room and clock after the M3 network review (protocol version 4; version 5 adds `coopSnap.ack`, see M4;
version 6 adds the rope's wrap points to the snapshots, see rope v2):

- Level epochs: every `coopLevel` carries an `epoch`, bumped whenever tick 0 is set again (a level start, a
  rebuild, a resume, the clock moved after a server stall, which is now broadcast like a resume). Clients echo
  it in every `coopIn`; the server drops inputs of another epoch, clamps stamps to at most half a second
  ahead of its clock, ignores inputs outside a level, and forgets every queued input and held key whenever
  tick 0 moves. While the world waits for a dropped player the client reads its keys but sends heartbeats
  only (`packages/client/src/coop/net/inputSender.ts`); a new `coopLevel` starts the screen over, and its
  InputSource starts from the keys physically held (`keepHeldKeys`, a module-level tracker in `input.ts`:
  the OS auto-repeats only the last key pressed), so the keys still held are sent again. Ctrl, Cmd or Alt
  with a key is a browser shortcut, never a game key (Ctrl+R reloads).
- Online drawing follows a playout clock measured on the snapshots' arrivals (`net/playout.ts`), so frames
  keep blending at 20-80 ms of latency.
- A silent player (no message for 250 ms) touches nothing for those steps, but their held keys are kept.
- A dropped player inside their 30 s window stays in a rebuilt team and in the level after the intro; the
  level starts paused for them. The host role never goes to nobody: when the host leaves and everyone else
  is reconnecting, it goes to a remaining player, and whoever comes back while the host is away takes it.
- A reconnection in the "select" phase gets the end-of-level card again; the intro's `coopLobby` goes out
  before `coopIntro`, so a player still on the card's screen gets the intro. A join without a version is
  refused.
- `BaseLink.setHandler` hands queued messages over one at a time and stops when the handler steps down.

Merging `main` later: since this branch started, `main` changed `OnlineLink.connect` (comeback player key,
`?salon=` remembered in the URL). The co-op join goes through `joinRoom` in `packages/client/src/net/link.ts`,
which bypasses `connect`: when merging, give `joinRoom` the same join options (`key: playerKey()`) and URL
memory for race rooms, keep the generic `BaseLink<S>` with main's one-message-at-a-time handler loop, then
delete the dead `connect`.

Known rope quirks, measured by the level bots, to check when playing (none is a bug in the rules as written):

- A friend hanging from the rope weighs on whoever holds it, so an "= 1" plate goes off for a moment when the
  holder's neighbour jumps or drops below it with the rope taut (the 0.15 s hold hides short blips only).
  Keep "= 1" plates where nobody needs to hang from the one standing on them.
- (Gone with rope v2: a link is measured along its path now.) A link bent over a corner was measured centre to
  centre, so an anchor standing back from a pit's edge could be lifted off a balance pan by the friend hanging
  over the corner (La Salle: Ruben's neighbour still waits one cell from the pit; the bots were not changed).
- (Rope v2) A rope keeps the way it went: a friend who dropped through a hole stays threaded through it (wraps
  have history). Placed blocks `=` no longer let the rope through (see "Rope wraps placed blocks"): a level that
  needs the rope through a floor must use a thing.
- (Rope v2) A body dropped onto the rope dips below its resting depth, about 0.6 for one, about 1 for two
  dropping together, and an anchor standing still is dragged towards the edge meanwhile: an anchor that lowers
  while the friend still bounces takes him deeper than asked (Le Labo Réseau's cables).
- A haul that ends level with the hauler never climbs over the lip (the pull is flat): the hauler must stand
  higher than the lip or walk on. (Rope v2: a wrapped lip pulls the friend up towards its corner and the
  mantle reaches 0.9 there; a pull down to a hauler far to the side, under about 27°, mantles too.)
- What La Salle's first design needed and the engine does not do (options for M5): slack for a body thrown by
  a seesaw (the rope pulls a rising catapulted friend back, capping its flight near 4.3 at 2 players), and an
  impact on balance pans (a landing presses no harder than walking on).
- The descending side of a seesaw or balance still goes through a body under it (the rising side no longer
  does since the M3 review). Bounding it breaks La Salle's pulley, which relies on it.

Status at the end of M3 (2026-11-26):

- Done: the level things, titles and Claude's bubbles, the renderer, HUD, cleared card and level select,
  the intro (Fable 5.2) synced online, and levels 1 to 5 ("La Rentrée", "Le Labo Réseau", "L'Amphi",
  "La Salle de TP", "La Salle"). Each level has its bots at 2-5 players and shortcuts that must fail, and
  went through a critic pass and a re-check (notes and review tables in `docs/coop-levels/coop0N.md`).
- The M2+M3 review (server, engine, client) found 19 issues, all confirmed by a skeptic and fixed with
  regression tests, each fix checked again by a second skeptic.
- Checked: 508 tests, typecheck, build, `check-coop-level --all`, and a 3-browser online run (lobby, intro
  skipped by all, levels 1-5 with identical views, no console error).
- Known design debts, written in the level notes: in La Salle the flyer does not haul Ruben, and from 3
  players Ruben is only the counterweight; a jump at the wrong time wastes the barbell (signed). La Salle de
  TP is still the longest level. Three "must not reach" heights rest on the pinned 3.0 jump apex.
- Next: M4 wires the predictor (written and benched, not yet used by the screen).

Prediction wired (M4, 2026-11-26):

- What step B does on a player's screen (`packages/client/src/coop/net/predictedPlay.ts`, used by
  OnlineDriver in `CoopScene.ts`; no Phaser in it, so the bench runs the same code): the drawn world is the
  predictor's copy, running ahead of the server by the lead (half the shortest recent round trip + 25 ms +
  1 tick, at most 300 ms; the server clamps stamps at 500 ms). The predicted clock follows the server's clock
  plus the lead, a little faster or slower, never backwards, jumping forward only when 200 ms behind. Each
  predicted step reads the keys once and stamps them for that step through CoopInputSender (strictly
  increasing stamps, the level's epoch, heartbeats, nothing but heartbeats while paused), so the own body
  moves on the next frame and the server applies the key at the same step when it arrives in time. Every
  snapshot reloads the copy and replays it with the own inputs not yet covered and the others' held keys and
  queued changes; own inputs the server still holds late (in `pending` with a past stamp) are replayed one
  per step from the next tick, as the server applies them.
- Own inputs covered by a snapshot (after the M4 review): each `coopSnap` carries `ack`, every seat's last
  stamp received on this clock (protocol version 5). An own input is part of the snapshot only if it is
  acked and no longer in `pending`; one not received yet (an upstream stall: snapshots still come, inputs do
  not) is replayed from when it can arrive (`at` = max(stamp, estimated arrival, next tick)), instead of
  being taken as applied (a jump pressed in a 300 ms upstream stall used to fall back mid-air, sink 0.08 cell
  into the floor and jump again). The own held keys at the base are the server's (`held[me]`), so whatever
  the server forgot (a hidden tab, a silent player) is forgotten by the copy too. A hidden tab
  (`visibilitychange`) sends `coopIdle` and replays it at its estimated arrival (`CoopPredictor
  .forgetOwnInputs`): it used to leave the own body drawn 1.6-4 cells from the server's until the next key.
- Smoothing: whatever a correction moves (bodies, crates, platforms, seesaws, balances, gates) keeps its
  drawn place and the difference fades (half-life 60 ms), but a body's or crate's offset shrinks no faster
  than 8 cells/s (`MAX_FADE_SPEED`): a friend's jump learnt a round trip late glides there instead of
  jumping a cell in two frames. A rider's offset joins its carrier's the same way (it used to take it at
  once, a pop of up to 2 cells when a body landed on another one with a different offset). Offsets never
  stretch a rope link past max(its length in the copy, the rope) (along its path since rope v2, riders' piles
  included), never draw a pile's base lower than what
  it stands on, nor a rider lower on its carrier, and never draw a box into a solid cell (the offset keeps
  only what fits). A correction over 3 cells, or another attempt, snaps. The rope is drawn between the drawn
  bodies.
- What only the server decides: the copy never steps into a death, a restart (R or after a death) or the
  win; it stops before that step and waits for the next snapshot, and while the server's world is in a death
  freeze or won, the copy is that world. Events (deaths, squashes, the key, the door, terminals, Claude's
  bubbles), titles and the cleared card come from the server's messages only; the HUD (key, door count,
  attempt, restart count), the key and the door drawn in the level, and the death freeze come from the
  server's latest world (`Driver.authority`). Plates, gates, crates, seesaws and platforms are drawn from the
  copy. A new `coopLevel` restarts the screen, so the predictor is rebuilt on a new level, a rebuilt team, a
  resume or a moved clock. Spectators and `?coopLocal=2` keep their paths.
- Default at M4: OFF (`PREDICT_BY_DEFAULT`, since replaced by the auto rule of the "Réactivité" setting,
  below). The plan turns it on only if the bench passes, and at 50 ms it does
  not: with the plan's bench model (three players changing keys every ~200 ms, jumping every ~0.8 s) each
  player's own-body corrections p95 at 50 ms is 0.058 / 0.217 / 0.219 cell, over twice the 0.1 threshold
  for two players of three (8 runs, only the 10 s while the keys change; pooled 0.154, 5.7 % of snapshots
  over 0.1 cell). The first M4 figure, 0.108, also counted the idle seconds before and after the keys, all
  zeros; the next one, 0.182, pooled the players over 4 runs (a verdict that flipped with the seed set).
  With more jitter it grows (the review measured 0.236 at 50 +30 ms, 0.438 at 50 +60). Every big
  correction comes from another player's keys, which no client can know for a round trip (with only its own
  keys moving, none is over 0.1 cell).
- Known limit (the main reason to keep it off): the copy runs the other players a full lead ahead on their
  last known keys, and their changes reach it about a round trip plus half a snapshot late (about 115 ms
  at 50 ms one way, 250 ms at 120 ms). A friend who stops, turns or jumps is drawn wrong for that long and
  then corrected, and this player's own body is corrected with them whenever they touch it (walking in a
  line, carried, hauled). Remote bodies are drawn about 1 cell from the server's at the same tick (p95, sim,
  stress keys, 50 ms; the browser review measured 1.5-1.8 cells where step A stays under 0.21). The 8 cells/s glide, the rider glide and the clamps make the
  corrections smoother (sim, coop04, stress keys, 50 ms: frames where the own body's drawn speed changes by
  over 0.3 cell per frame while the server's does not: 0.45 % -> 0.16 %; remote bodies 1.9 % -> 1.5 %; the
  largest own jump between two frames 1.35 -> 0.66 cell), not right. Tried and dropped: letting the others'
  arrows go a few ticks after the last known input (remote error p95 1.05 -> 1.08-1.53 cells, own 0.31 ->
  0.44-0.82) and a velocity-continuous spring for the offsets (fewer jolts, larger errors, boxes into walls).
  What would fix it is a design change for Dorian: draw the others on the server's timeline and predict
  only this player and what it touches, against the plan's "everything stays attached".
- Also as designed: before a fall death, the copy stops at the step before the death and waits for the
  server, so the bodies hang still for about a lead plus a round trip (about 350 ms at 50 ms) before the
  0.8 s freeze.
- Bench (`coopPredictBench.test.ts`: a real CoopSession on a fake clock, three predicting clients with
  their clocks estimated from pings, msgpack, frames at 60/s; `benchNet.ts` holds the fake network):
  own-body corrections p95 (pooled; worst player) at 20 / 50 / 100 ms one way (+5 / 10 / 20 jitter) with
  keys every ~200 ms: 0.001; 0.009 / 0.154; 0.219 / 0.418; 0.597 cell (2.6 / 5.7 / 8.1 % over 0.1 cell),
  over the 10 s while keys change; keys every ~400 ms at 50 ms: 0.000; 0.005 (3.4 %). No press lost
  anywhere. Scenarios: a 300 ms TCP stall (one correction up
  to 1.4 cells then back to 0), a press during a 300 ms upstream-only stall (one jump arc, never below the
  floor), a hidden tab while a key is held (back to the server's within a snapshot or two), a pause and
  resume (nothing advances, heartbeats only, the latest snapshot drawn as it is, rebuilt on the new epoch),
  this screen's own link dead for 5 s (silent: the copy stops at most 2 s past the newest snapshot;
  reported lost: it holds at once), downlink-only stalls of 500 ms and 1.5 s (no frozen frame, own body
  at most 0.12 cell a frame) and of 2 s (eased stop and catch-up, 0.23), a level change, a death and restart
  (every screen stopped before the death and showed it only from the server), a haul by a remote player
  (p95 0.000; drawn links no longer than the world's), riding a remote player's head (while it rides, the
  rider is drawn on its carrier as in the copy; its corrections are the carrier's), stress keys on the
  sandbox and coop04 (no pile base drawn lower than its support, no rider lower on its carrier, no box more
  than a blended step into a wall, drawn links over the copy's by more than 0.1 cell in under 0.1 % of frames). Replaying 20 steps of
  a 5-player level: 0.3-1.2 ms (median, levels 1-5). The per-snapshot corrections are kept only when
  `CoopPredictor.record` is on (the bench); the screen keeps none.
- Browser (after the M4 review; 3 Chromium, one per player, 50 ms each way through `page.routeWebSocket`,
  which adds more on this machine: round trip measured 190 ms; software GL, Alice at about 22 frames/s
  with the two others capped at 5): keydown to 2 px of visible motion of the own body, median of 10
  presses: predicted 1 frame (1 ms after the key event; 1-2 frames), step A 9 frames (335 ms). With the
  CPU throttled 4x: predicted 1 frame at 12 frames/s (advance 2.5 ms median, 7.2 ms p95, 19.8 ms worst),
  step A 7 frames (464 ms) at 14 frames/s (advance 0.5 / 2.2 / 17.5 ms). Unthrottled on a quiet machine
  the predicted advance is 0.4 ms median, 5 ms worst: the 25-93 ms spikes the review saw came with another
  agent's browsers loading the machine. The three screens agree once settled (drawn and server bodies
  identical), no console error. A hidden tab while holding Right: the own body is drawn on the server's
  from the first check (0.5 s), where it stayed 3-4 cells off before.
- After the second M4 review (8 confirmed findings, all low):
  - While the world waits for a dropped player, a predicting screen used to stay frozen on its own guess
    about a lead ahead (a jump the server never applies hanging 1.2-1.6 cells up, walkers a cell ahead) and
    snap back on the resume. `PredictedPlay.setPaused(true)` now reloads the copy at the latest snapshot
    with no offset (`CoopPredictor.showBase`), as step A draws it.
  - A screen whose own link went silent (lost, no coopPause can reach it) kept playing the whole team on
    for the reconnection window (15 cells after 4 s). A first cap (the lead, a one-way trip and 250 ms
    past the newest snapshot) broke ordinary stalls: with a downlink-only stall (server running, inputs
    still going up) the own body froze for 15 / 73 frames at 500 ms / 1.5 s, then jumped up to 60 steps
    in one frame (1.3 / 7.8 cells); both-ways stalls of 250-400 ms went from about 0.13 to 0.35-1.2 cell
    in a frame. Now (`predictedPlay.ts`): the copy runs at full speed for 1.75 s past where it normally
    is (`STALE_FULL_TICKS`), then slows to a stop by 2 s (`STALE_EASE_TICKS`, exponential); a link the
    transport reports lost (Colyseus `onDrop`, `CoopScene` -> `OnlineDriver.setLinkLost`) holds it at
    once; once held back it catches up at 1.5 times the clock's speed instead of in one frame.
    Measured (sim, 50 ms one way, all holding Right on a flat floor): downlink stalls of 300 ms to 1.5 s: own largest move 0.124 cell a
    frame, no frozen frame (as before the cap); 2 s: 0.233; 2.5 s: 0.369 (60 steps at once: 0.85 / 0.95);
    both-ways 250 / 300 / 400 ms: 0.123 / 0.236 / 0.136 (as before the cap). Both-ways stalls of 800 ms
    and more still snap 3.7-5 cells when they end, as before the cap: the server stops a player silent
    for 250 ms, so its body is corrected back by what it walked on this screen. The price: a link
    that dies silently (no `onDrop`) is drawn up to 2 s of play ahead before it stops (lost-link
    probe, one friend walking: 8.9 cells at most, against 2.2 with the 250 ms cap and 15.8 growing
    without a cap); reported lost at once, 2.5 cells at most (the friends held behind where the
    server stopped them).
  - Bench: the verdict is per player over 8 runs (above). Tests that passed with their fix removed now
    fail: the upstream-stall jump checks the copy leaves the floor once (the drawn height hid a fall back
    and a second jump), the hidden tab bounds the correction on return (0.2 cell; 1.2 without the coopIdle
    replay), riders are checked against their carrier in the stress test, and unit tests cover the
    platform-base clamp and the 8 cells/s glide. The bench file has a 60 s timeout (its rooms went over
    vitest's 5 s default on a shared machine).

"Réactivité" setting and the auto rule (after M4, 2026-11-26, decided with Dorian):

- Rule (`packages/client/src/coop/net/reactivity.ts`): `?predict=1` / `?predict=0` always forces. Otherwise
  the player's setting in the co-op lobby, "Réactivité : Auto / Stable / Instantanée" (stable = step A,
  instantanée = step B), kept in localStorage (`coop.reactivity`, every access guarded; default auto; a
  choice made while storage fails lasts until the page is reloaded). In auto, the screen predicts when its
  recent round trip is under 60 ms (`AUTO_ON_BELOW_MS`) and draws step A over 80 ms (`AUTO_OFF_ABOVE_MS`);
  in between it keeps its previous auto choice (module-level memory, so a ping wobbling around one threshold
  does not flip the display every level); no round trip measured yet: step A.
- The round trip read is `ServerClock.recentRtt`, the 75th percentile of the last 12 pings (one per second,
  a burst of 6 on joining; the clock itself still trusts the best one), so jitter counts. The co-op link
  pings from the moment the room is joined, so the lobby (and the intro) fill the window before the first
  level.
- When: once per level start, when `CoopScene` builds `OnlineDriver`. A `coopLevel` that reaches the game
  screen playing that same level, with its clock already running (`levelContinues`: a resume after a dropped
  player, the clock moved after a server stall), continues the level and keeps its choice, so the display
  never switches in the middle of a level. One that reaches the lobby or an end card is a level start, even
  when its screen is built after the level's clock started (Phaser starts a scene on its next frame, and a
  hidden tab draws none); the lobby and a new setting also forget the level's choice. Spectators and
  `?coopLocal=2` keep their paths; step A, when chosen, is the same code as before.
- Lobby: the block sits above "Revoir l'intro / Quitter": three small buttons, one hint line per choice
  ("Instantanée si ton ping est bas, stable sinon." / "Tout reste fluide, tes touches répondent avec un petit
  retard." / "Tu bouges tout de suite, les autres peuvent être recalés."), and in auto the current decision
  and the ping, refreshed every second ("Auto : instantanée (ping 39 ms)"); when the address forces it,
  "Forcé par l'adresse (?predict) : …". The race mode has no such setting.
- Calibration (the plan's bench, three players changing keys every ~200 ms, 8 seeded runs per row, worst
  player's own-body corrections p95, threshold 0.1 cell; recent round trip as the bench's clients measure
  it, median):

  | one way + jitter | worst p95 | round trip | | one way + jitter | worst p95 | round trip |
  |---|---|---|---|---|---|---|
  | 20 +10 | 0.025 | 55 | | 32 +10 | 0.132 (both halves fail) | 79 |
  | 22 +10 | 0.029 | 59 | | 33 +10 | 0.083 | 80 |
  | 23 +10 | 0.048 | 61 | | 34 +10 | 0.096 (halves split) | 83 |
  | 24 +10 | 0.011 | 62 | | 35 +10 | 0.122 (halves split) | 84 |
  | 25 +10 | 0.089 | 64 | | 40 +10 | 0.122 (halves split) | 94 |
  | 26 +10 | 0.045 | 67 | | 45 +10 | 0.131 (halves split) | 104 |
  | 28 +10 | 0.055 | 70 | | 50 +10 | 0.219 (both halves fail) | 114 |
  | 30 +10 | 0.069 | 75 | | | | |
  | 20 +5 | 0.021 | 48 | | 20 +20 | 0.051 | 69 |
  | 25 +5 | 0.056 | 57 | | 25 +20 | 0.134 (both halves fail) | 78 |
  | 30 +5 | 0.053 | 67 | | 30 +20 | 0.076 | 88 |

  The worst player's p95 crosses 0.1 between 30 and 35 ms one way with 10 ms of jitter (noisy there: 0.07 to
  0.13), that is at a measured round trip of about 75-80 ms; with 20 ms of jitter at about 25 ms one way
  (78 ms). The rows above are one draw each: 8 other sets of 8 runs at 23 ms +10 gave 0.011 to 0.083, two
  with split halves. With 16 runs per set (12 sets per latency at 23, 28 and 40 ms, 6 at 25, 30, 32, 33, 35
  and 50; +10 jitter), the worst player's p95 is 0.015-0.058 at 23 ms (halves always agreeing), 0.025-0.083
  at 25, 0.037-0.084 at 28, 0.036-0.072 at 30, and the verdict fails in 1 of 6 sets at 32 ms (78 ms round
  trip), 2 at 33 (80), 3 at 35 (85), 10 of 12 at 40 (94), 6 of 6 at 50 (114). The bench places the crossing
  no more finely than that band. Auto turns prediction on under 60 ms (23 ms one way +10), 18 ms of round
  trip under where the first sets fail, and off over 80 ms (where they start failing).
- Bench check (`coopPredictBench.test.ts`, replacing the `PREDICT_BY_DEFAULT` check), 16 runs: at the
  one-way latency whose round trip is `AUTO_ON_BELOW_MS` (computed from the constant: 23 ms +10), the
  clients' median recent round trip is within 5 ms of it and every player's p95 is under 0.1 cell (under
  0.075, both halves of 8 runs agreeing): 0.000 / 0.000 / 0.025, round trips 56-64 ms. At 50 ms +10 the
  verdict fails (0.086 / 0.142 / 0.178; the halves are not asked, 8 runs passed there in 1 of 6 sets) and
  every client's round trip (112-117 ms) is over `AUTO_OFF_ABOVE_MS`, so auto draws step A even after a
  predicted level. The verdict alone cannot pin the low threshold (at 30 ms +10, a 75 ms round trip, it
  still passes with 0.04-0.07), so the bench records where it starts failing (`BENCH_CROSSING_RTT_MS`,
  78 ms) and checks that `AUTO_ON_BELOW_MS` sits at least 15 ms under it and `AUTO_OFF_ABOVE_MS` within
  5 ms of it: a low threshold of 65, 70 or 75 ms fails that check by name.
- Browser (3 Chromium, one per player, through a Node WebSocket proxy delaying each way + 5 ms jitter; my own
  server and Vite): at 15 ms one way the lobby shows "Auto : instantanée (ping 36-40 ms)" and level 1
  predicts on all three screens; switched to 50 ms in the middle of the level, all three keep predicting
  (also through a resume after Bob's link dropped: a new epoch, the same level); the next level start at
  50 ms draws step A on all three ("Auto : stable"). With Alice on "Instantanée" and Chloe on "Stable": at
  50 ms Alice predicts, Bob (auto) and Chloe do not; at 15 ms Alice and Bob predict, Chloe does not; Chloe's
  choice survives a reload. No console error.
- Known limit, seen in that browser run: the pongs are read on the page's main thread, so long frames add to
  the round trips measured during play. This machine (three software-GL browsers on 4 cores) ran the level
  at 13-15 frames/s, and its in-game round trips read 120-300 ms at 50 ms one way (102-110 ms in the lobby)
  and 64-235 ms at 15 ms; a level started after such a window drew step A at 15 ms. At 60 frames/s a frame
  adds at most about 16 ms. A slow computer therefore falls back to step A, which also spares it the
  replays. A level started after the lobby (or a long end-of-level card) reads the light screen's pings.

Rope v2: elastic, wraps around the terrain (after Dorian's playtest, 2026-11-27)

Dorian, after playing: "the rope is very stiff: either taut or slack. It should be a bit more supple: at max
length it should stretch slightly and come back. And I want physics between the rope and the scenery, e.g. two
players each walking away on either side of a block with the rope over it: the rope holds each of them."
Decided with him:

- Elastic, marked: 4.5 stays the rest length; past it a link is a damped spring up to a hard stop at 5.4
  (`ROPE_MAX_LENGTH`, 20 %), where it is rigid again. Tuning in `coopTuning.ts`: `ropeStretch` 0.2,
  `ropeStiffness` 240 (1/s² per unit of mass), `ropeDamping` 0.5 (damping ratio), `ropeRelax` 15 (1/s),
  `ropeMaxWraps` 8.
- Wraps around the fixed terrain only (solid tiles, glass and team-size walls included; one-way platforms,
  gates, crates, balances, seesaws, moving platforms and bodies are not obstacles, as before). The pulley has
  a little viscous friction since the review (`ropePulleyDamping`, below): otherwise the same tension all
  along the path.
- The wraps are world state: saved, loaded, hashed, in the snapshots (snapshot version 4, protocol 6; 7 since
  the review fixes changed the rules), replayed
  by the prediction, cleared on a level start, a restart and a rebuilt team.

How it works (`rope.ts`, `world.ts`):

- Each link keeps an ordered list of wrap points (convex terrain corners: one solid cell of the four around a
  grid point) with the way the path turns there (`CoopWorld.ropeWraps`). `sweepRope` runs twice a step (from
  the step's start to the bodies' own moves, then over the rope's pulls, the mantle and Ruben's slide): each
  end's move sweeps the triangle (its pivot, where it was, where it is); the first corner whose solid quarter
  lies on the swept side wraps, and a wrap point next to an end is let go when the rope turns the other way
  round it by more than about 1° (`UNWRAP_SIN`, so a rope lying across a corner does not flicker). The end
  moves in two phases (end a, then end b), and the triangle covers the whole move, so no speed takes the rope
  through a wall. A body put somewhere out of the blue (`placeBody`, entering the door) gets the shortest clear
  path over 0, 1 or 2 corners (`placeWraps`).
- Length = the sum of the path's parts. Every rule that looked at "the other end" now looks at the end's pivot
  (its wrap point, or the other body): pull directions, hanging and holding, rise caps, the anchor's slide
  direction, the swing cap, the mantle's direction and `haulsAway`. Straight links behave as before.
- Elastic part: a link longer than 4.5 pulls a body in the air with a damped spring on its speed (towards its
  pivot; force per unit of mass, so Ruben stretches it twice as much), and drags a body standing on something
  by position along the ground (`ropeRelax` x dt: 12.5 % of the stretch per step), split by mobility
  as before. A standing body is lifted only by the hard stop (with its haul budget): with a position lift a
  friend standing steeply below hovered just off the floor, unable to push. The rope's upward speed is capped
  at the haul speed (no trampoline). At 5.4 the old rigid solve applies (position passes, then the speed that
  stretches the link is removed from bodies in the air).
- A pull on a body never takes one of its riders past that rider's own hard stop (`riderShare`): a hauled
  friend carrying a friend whose rope is held below used to drag that link to 6.6.
- The mantle: over a wrapped lip it reaches 0.9 under the top (`MANTLE_WRAP_REACH`; the corner pull goes flat
  at 30° with the feet 0.68 under it), and it is refused only when the rope pulls down more steeply than about
  27° (`MANTLE_MAX_DROP`), not whenever the hauler is half a cell lower.
- `computeLoads` still gives a hanging body's weight to its highest taut neighbour: with a pulley the weight
  goes onto the anchor, not into the block (a friend hanging over a pulley from someone on a plate still
  weighs on that plate).

Measured (`coopRopeWrap.test.ts`, re-pins in the other rope tests; old -> new):

- Unchanged behaviours: drag of an idle friend 3.500 cells/s (link 4.500 -> 4.908), even tug 0.000 (link at the
  stop, 5.400), Ruben wins 2.333, anchor drift 0.150 and Ruben 2.00x (link 4.500 -> 4.644), haul caps 2.5 and
  1.2 (onto the 6-high ledge in 1.80 -> 1.56 s, Ruben 3.59 -> 3.21 s).
- Spring: a friend hanging still stretches a link by 0.144 (gravity / stiffness is 0.164; the step order makes
  it a little less), a friend + Ruben chain 0.458 / 0.265; a friend dropped 2 cells onto the rope peaks at 5.09,
  rebounds once to 4.60 and settles at 4.65 within 0.7 s; a tug sits at 5.400; let go, back to 4.53 in 0.24 s;
  Ruben falling at 22 cells/s stops at 5.40.
- Longest link: 4.85 -> 5.5 (stop + 0.1) in the chain tests and the random sandbox runs (20 seeds x 3 team
  sizes x 3000 steps; measured worst 5.45, 5.47 in the 5-player haul). "Taken up": 0.3 per step as before; under the stop in 6 / 14
  steps (2 / 3 bodies), at rest + 0.05 in 28 / 58 (was: at 4.5 in 8 / 15). Hanging over the sandbox trench:
  the head 15.29-15.44 (was under 15.5: the path over the rim's corner is longer than the chord), link 4.64.
- The pulley (the sandbox's): two friends walking off the pillar on either side hang 0.7 under the floors, held,
  level when they leave together (any split holds: equal masses), link 4.64; Ruben
  against a friend: the friend up at the corner, Ruben at the rope's end just above the pit's bottom, rising at
  most 1.2 cells/s. A friend standing 2 cells behind a 1-wide block holds a friend under its far lip (drift
  0.150 / Ruben 0.300), pushing away holds, walking on hauls him over (rope back off the block).
- Random play never takes the rope through the terrain (3 x 3000 steps, sampled every 0.02 cell), and a copy
  loaded mid-run, wraps and all, ends with the same hash.
- Budgets: a server step at 5 players (random keys, 3 x 3000 steps) median 18-38 µs, p95 33-128 µs (was 16-31 /
  32-121; under 0.2 ms); replaying 20 steps at 5 players 0.50-0.90 ms (under 2 ms); prediction bench: drawn
  links over the world's, along the path, p99.9 0.049, max 0.060.

Rope v2 review fixes (2026-11-27, 9 confirmed findings; `coopRopeV2Regression.test.ts` fails on the code
they were found in):

- A wrap point let go late (the ~1° `UNWRAP_SIN` margin) now sweeps the thin triangle it releases (next
  pivot, released corner, end): a corner lying along the same face wraps. Before, coop04's duct at 4-5
  players kept the rope through the corridor floor for up to 339 steps (0.5 deep) in 6 of 48 random runs.
- The elastic drag of a standing end never takes its other link past the hard stop (`otherLinkRoom`): an
  anchor between a walker and a chain hanging with its rise capped (coop02's cable shaft) was dragged
  into the stop and thrown back by it every step (0.3 cell at 60 Hz, links 5.6-6.1). Now no reversal,
  longest 5.47, the walker hauls the chain through the anchor as the rigid rope did.
- No endless bouncing (decision 1). Three cases bobbed or seesawed for ever, because asymmetric gravity
  (a body less than hangHeight under its pivot does not count as hanging) pumped up a motion that the
  damping, acting on the whole link's length rate, barely saw: a body held against a wall just under a
  wrapped corner (0.25 cell at 3 cells/s), the same under the sandbox pillar's corner held by a friend in
  the pit, and two friends on either side of the pulley (2.15 cells, a 3 s seesaw). Now:
  - the spring is a force against a wall: only its part along the wall moves the body, faded in below
    30° instead of switching (the switch made the lift jump 4x), and the press brakes the speed along
    the wall (`ropeWallFriction` 0.3 of the speed per cell/s of press, viscous);
  - the rope sliding round wrap points between two ends in the air is braked (`ropePulleyDamping` 4/s,
    on the difference of their speeds along the rope; a standing end's own move does not count, so
    hauling over a block is unchanged). Two friends on the pulley settle where they are (level when they
    left together, one up at a corner when not); Ruben against a friend settles too.
  All settle within 0.02 cell; the hard stop's velocity pass still slides a hauled body up a wall as before.
- The sandbox's pulley has 3-wide pits (pillar x 69-70, pits 66-68 and 71-73): from the 2-wide pits a
  friend walking off cleared the pit and landed on the far floor unless both left within 50 ms; now
  both are held over the corners with up to 0.2 s between them (and always when they walk off, then let go).
- Drawing: each drawn link is swept from the world's pose to the drawn bodies (`wrapsForPose`, through
  `render/ropeSegments.ts`), with the shortest clear path as a fallback when a drawn end cuts a corner.
  Step A (bodies blended between snapshots) and step B (smoothed bodies) drew a link straight through a
  corner for a frame or two around a wrap or unwrap (up to 0.38 deep); the level bots' step A frames
  now never go into the terrain.
- Left for Dorian (a design decision): a link can stay stretched (up to the stop, drawn orange-red) while
  both ends stand idle, when the lower one stands steeply under its pivot (it is never lifted below the
  stop) and the upper one is an anchor for it (it never gives ground). Letting the stretch come back
  through the upper one drags anchors towards edges and broke coop01 and coop04 at every team size, and
  lifting the lower one hovered it off the floor (see above). Moving either player ends it.
- Bots: coop05's shortcut "a tower from the seesaw to the mezzanine" lands the base on the cap within
  0.1 (it could sit on the edge of F0's head and block the climb); the shortcut still fails at its attempt.
- Second round (the rechecks found two fixes incomplete; three more tests in `coopRopeV2Regression.test.ts`):
  - coop02's anchor with the walker standing still, or after a haul: the drag switched on as its steep end
    segment crossed 72° (`MIN_DRAG_COS`) and threw it 0.21-0.30 cell in one step every 0.4-1 s (anchorSlide
    crept it back: a sawtooth). The drag now fades in from cos 0.3 to 0.5 (`FULL_DRAG_COS`) and never goes
    faster than walking on top of undoing the body's own move (a body let down onto the floor glides in).
    Largest anchor step over 15 s: 0.000-0.003 standing still (a7c458a 0.001-0.004), 0.056-0.072 after a haul
    (was 0.12-0.24).
  - A chain placed past the stop: no drag into a link past its stop, so nothing held the anchor, and the stop
    yanked it 0.3 cell a step off the edge; the chain fell. A standing anchor held the other way by another
    taut link now only gives back its own move of the step, plus `anchorGive` 2.5 cells/s (`anchorGiveBack`,
    `stepBeginX`): the friend is hauled back within the stop in 0.3-0.5 s, everyone stays put.
  - Ruben second in a chain, against the block's face just under its corner: 0.165 up and down for ever
    (2.4 Hz), 0.016 at 5 players. His hanging flag switched the air brake, which left him 1.3e-3 off the face
    or pressed on it, and the spring's wall rule switched with that contact (TOUCH 1e-3). The rule now fades
    out over 0.02 off the wall (`WALL_FADE`), and spring pulls into a wall are applied after the others (one
    link's pull into the wall left another's pull away from it unopposed: a kick off the wall at 5 players).
    All settle (0.000). A hysteresis on the hanging flag was tried and dropped: it started a 0.064 bob of
    its own (2 players, Ruben against the face).
  - Unchanged: drag 3.500, tug 0.000 / Ruben 2.333, drift 0.150 / 0.300, haul caps 2.5 / 1.2 (onto the
    ledge 1.49 s / 3.23 s). Random play coop01-05 (seeds 101-116, 3-5 players) stays at 5.499 or under; the
    wider coop02 sample (seeds 201-240) touches 5.500-5.509 for 1-2 steps in 4 of 120 runs (1afe822: 5.498):
    a walker hauling an all-air chain faster than its haul speed, where the stop's passes end either way.

Drawing (`render/ropeLayout.ts`, `ropeView.ts`): each link goes through its wrap points; the parts between
two corners are straight, the two end parts share the slack and sag. Near the rest length the orange cue fades
in as before; past it the ink thins (4 to 2.5 px) and the overlay goes from orange to red, all red at the stop.
The rope is stroked as an open path (closing it drew a chord under every slack rope).

Dev tool: `?coopLocal=2&level=sandbox` opens the sandbox (now 80 wide; the pulley at its far right: a 2-wide
pillar one cell above the floor between two 3-wide pits); `&spawn=61` starts the team right before the pulley
(any column with five cells of floor), `&noruben` makes both bodies friends (with Ruben the pulley is
lopsided: he sinks). With 2 players a 2-cell step stands against the sandbox's 4-cell wall.

Levels after rope v2 (repaired, "repair what breaks": only what failed or opened; all pass `check-coop-level
--all` at 2-5 players and every shortcut fails in its attempt; notes in `docs/coop-levels/coop0N.md`, "Rope v2"):

- (Superseded by "Rope wraps placed blocks" below.) Placed blocks `=` (the race's riveted white block, solid for bodies and crates) were not terrain, so the rope
  passes through them like through every thing. Three levels use them where their idea needs the rope through a
  floor or a block that bodies must not pass: Le Labo Réseau's raised floor at the lip (x 22-24: the one lowered
  is swung under the lip into the slot again; with a solid lip he hung straight below its corner and could only
  get in by a swing right within about 0.05 cell), L'Amphi's desk over Ruben's seat (the rope went over the
  block, 5.8 long) and the corridor floor over the basement (the free friend's rope stayed threaded through the
  trapdoor and could not reach plate f), La Salle de TP's duct floor (Ruben's rope stayed threaded through the
  hole he dropped in by, 4.6-5.3 where the chord was 3.1). If placed blocks should stop the rope too, those
  beats need redesigning (see the level notes for why each one does).
- La Rentrée: unchanged. La Salle: no map change (bots: the anchor and the ones behind close up sooner before
  the flyer drops onto the seesaw).
- Bot changes: Le Labo Réseau's anchors (beat 1 at 21.3 instead of 21.9; beat 2 at 3+ players stands at 8.0
  instead of 7.25 and lowers only once the pair has settled, as the elastic rope dips about a cell when the
  neighbour drops off the rim); setups of three shortcuts closing up behind (La Salle de TP "a human tower
  beside the exit shaft", La Salle "a tower on the spent barbell", with and without the shelf), because the
  rope now gives and pulled the back of the queue or a climber short.
- New route found by probing and accepted: in La Salle from 3 players, the flyer on the mezzanine can haul the
  others up the shaft over the mezzanine's lip (the rope wraps its corner and the wrapped mantle takes them
  over), Ruben included, without plate p and its step (probed with both removed). It still needs the shot,
  and it is the plan's literal « déclic ». At 2 players the flyer alone cannot haul Ruben there.
- Other probes, no new shortcut: Le Labo Réseau's slot (everyone dropping off the lip leaning in; Ruben
  dropped with his anchor 22.0-23.6 cells, leaning in), the 3+ key with one rope at the stop (feet about 15.3,
  the key from 16.23); La Salle de TP's key from the landing with the next one still on the lab floor
  (reached: the rope lifts him against the tower's side, nothing skipped); La Salle's flight (unchanged, apex
  8.74 straight up into the saw); La Rentrée's trench jump (the jumper's other neighbour may now stand 1.5
  behind Ruben, was 1.2).
- Browser (`?coopLocal=2&level=coop02`, Playwright, no console error): the `=` cells draw as white riveted
  blocks, and Ruben stepping off the lip with his neighbour about 3.5 back lands in the slot, the rope drawn
  from the neighbour over the floor's corner and through the blocks.

Rope wraps placed blocks (2026-11-27, owner's decision; supersedes the `=` passthrough above):

- The rope wraps every static solid cell: terrain plus the static solid race objects (`=` placed blocks,
  springs), i.e. `level.collision`, which holds nothing else (the co-op things are colliders). Gates, crates,
  A/B shelves, platforms and fragile floors still let it through. `CoopWorld.ropeSolid` reads that grid, and
  the drawing (`ropeSegments.ts`) and `placeWraps` go through it, so they stay consistent.
- The `=` cells of Le Labo Réseau, L'Amphi and La Salle de TP are back to plain `#` (as before rope v2's level
  repair). Their bots (and some shortcut tests) fail again: levels 2-4 are to be redesigned around the wraps.
  The bot tweaks of that repair (`coop02.solution.ts`, `coop04.solution.ts`) were left in place.
- Guard: `coopRopeWrap.test.ts` checks, for every co-op level and team size, that every cell that stops bodies
  also stops the rope, and that a `=` block is wrapped like terrain.

Levels 2-4 redesigned for the wrapped rope (2026-11-27; three level lanes, each through a critic round,
integrated on one branch; notes in `docs/coop-levels/coop02.md`, `coop03.md`, `coop04.md`, rope rules for
designers in `docs/coop-levels.md`, "Designing with the wrapped rope"). No engine change; no `=` in any of the
three. All five levels pass `check-coop-level --all` at 2-5 players, every shortcut fails in its attempt,
`npm test` passes in full (613), and `check-level --all` (race) prints the same as before but for timings.

- Le Labo Réseau (coop02): beat 1 now plays on the wrap. The lip's corner is the pivot: the anchor's
  distance to it sets the depth; the one lowered hangs in the slot's mouth, leans in under the lip (the rope
  wraps its lower corner) and is set down by his anchor walking to the edge, or waits against the floor's side
  until his anchor walks back. Then a train, the last one hauled up by the one in the slot. A low cable duct
  over the floor's end and the shaft closes a ride-on-Ruben's-head way in (77 of 780 probed runs without
  it). A fragile tile across shaft A, 4 below the slot's floor (the first fragile floor in the campaign),
  catches the last one if his catcher is slow (an idle anchor slides off a floor's end towards the friend
  below), and breaks under Ruben or two. `patience` variants and `coop02Patience.test.ts` prove the waits.
  Bot times 14.5 / 25.6 / 30.7 / 35.9 s.
- L'Amphi (coop03): redesigned around the wrap (the aisle's edge, the bench). New gate m at the bench's
  end, inverted on the bench's link: a step while the bench holds W-1, a 1-deep pit otherwise, so an idle
  sitter dragged to the trapdoor stands on m and weighs nothing on the bench, and w shuts before he can drop
  in (closed the critic's "dragged sitter" case: 37 of 576 before, 0 of 5292 after). The bench has 2 seats;
  the bots pass the key forward in arrival order. `takeKeyFrom` was added to `bots.ts` for this lane and is now
  unused by coop03 (kept as a shared helper; La Salle keeps its own copy). Bot times 16.6 / 17.9 / 19.5 /
  22.0 s.
- La Salle de TP (coop04): beat 1 redesigned for the wrap: the climber's rope is measured round the shaft's
  lip, so from 3 players its other neighbour must wait at the duct's mouth (the leg-up, « Corde courte ?
  Attends dans la gaine »). At 4-5 players J's floor is now a second "≥ 4" sensor at M's height (no rail,
  no pit, level 54 x 16): a tower pushed into J stops against a body instead of burying it. The PC tower
  weighs 0 on plates. New `recoveries` list in `solutions.ts` (a mistake and the way back, played to the end,
  checked by `coopLevels.test.ts`); its entry "into J before the tower, and back out" finishes at 2-5. The
  client predictor keeps a rider's carrier under a ceiling (a 0.74 cell lift seen in the bench on the new
  2-high corridor). Bot times 20.9 / 22.6 / 23.8 / 26.6 s.

Accepted shortcuts (details in the level notes): coop02, another order in beat 1, an idle anchor's slide as
the lowering (if the one below leans in), the last one dropped onto the tile on purpose, two stepping off
together; coop03, trains over plate a, door wedges, walking into the cellar from tier 1, the key from the
bench round the aisle; coop04, the PC tower's free corner and the bare tower with a buffered jump (a friend,
or Ruben himself: 60 of 288 tries at 3-5), the tower pushed one cell short (now open at every size), other
ways into the duct.

Open after the integration's skeptic round (not fixed; each is in the level's notes, marked "Open"):

- coop02, beat 1 can kill an idle team: Ruben steps off without leaning and his anchor stands still; the
  anchor slides to the lip's corner and then off it (8 of 156 probed runs at 2 players, 18-27 s after the
  step; 4 of 156 at 3; none at 4-5). This breaks "the first beats never kill" for a team that does nothing
  for 18 s. Fix idea: a raised end on the lip (moves the pivot and every depth of the beat).
- coop03, "Ruben hanging from the bench" is open at 4-5 players from further left on the aisle (x 30.0-30.4):
  the link gets taut (4.76), Ruben's 2 counts on the bench, w opens and he drops into the cellar (9 of 4800
  probed runs). No faster finish or soft-lock found (he cannot reach the key from there). Fix idea: a
  shorter tower (lower bench ceiling) or the tower further from the aisle, and the shortcut's attempt should
  sweep Ruben's start x.
- coop04, the duct can be skipped at 4-5 players: the climber's other neighbour rides a head at the corridor
  mouth instead of waiting in the duct, and they jump together (26 of 48 tries at 4, 78 of 144 at 5,
  re-measured on this branch; the level then finishes in 24.1 / 26.8 s). No shortcut covers it yet.
- coop04, the Ruben solo climb is accepted with the bare-tower family but is untested at 2 players.

Status at the end of M4 (2026-11-26):

- Done: step B is wired into the online screen (opt-in, `?predict=1`; step A stays the default because the
  bench misses its 0.1 cell threshold at 50 ms). Two adversarial reviews: the build's skeptics (netcode and
  browser) found 10 issues (8 fixed or mitigated, 2 left as designed), then the multi-axis M4 review
  (predictor, integration and protocol, tests and bench) confirmed 8 more, all fixed; a fix whose first
  version froze the screen on downlink stalls was refused by two skeptics and redone.
- Checked: 537 tests, typecheck, build, `check-coop-level --all`, and a 3-browser online run through levels
  1-5 both with step A and with `?predict=1` (identical server bodies on all screens, drawn equal to server
  once settled, no console error).
- Open: whether to turn prediction on by default, or to draw the other players on the server's timeline
  (see "Open questions for Dorian"). Since then: on by itself when the round trip is short, with the lobby
  setting (see "Réactivité setting" above).
- Next: M5 (levels 6 to 10c, polish, docs, final review), when Dorian asks.

## Open questions for Dorian

- Rope v2: try the pulley (`?coopLocal=2&level=sandbox&spawn=61&noruben`) and the give. Should a link
  stretched between two players standing still come back (see "Rope v2 review fixes": who gives)? Is 20 % the right amount,
  is the stretch cue (thinner, orange to red, all red at the stop) clear, does a hanging friend bounce too
  much or too little (`ropeDamping`)? Decided: the rope wraps placed blocks `=` too, and levels 2 to 4 get
  redesigned around the wraps (see "Rope wraps placed blocks"). La Salle can now be climbed by hauling from 3
  players (accepted). Done for levels 2-4 (see "Levels 2-4 redesigned for the wrapped rope"); three skeptic
  findings are left open there: decide whether Le Labo Réseau's idle-anchor death in beat 1 and La Salle de
  TP's duct skip at 4-5 players are worth a map change.

- Co-op "Réactivité": playtest the setting. Auto predicts under a 60 ms round trip and draws step A over
  80 ms (bench: the worst player's corrections start crossing 0.1 cell at about 78 ms, and always do by
  114 ms). Check that "Auto" picks
  what feels best on your connections (the lobby shows its decision and ping), that "Instantanée" is worth
  it for you (own body on the next frame, the others corrected when they change keys, up to 1-2 cells at
  50 ms one way), and whether the thresholds should move. Drawing the others on the server's timeline would
  still be a change to the plan.

- Maximum width of scrolling levels (proposed: about 2 screens, 64 cells).
- Whether a catch-up bonus is needed for the last-placed player (only if playtests show the leader running away).
- How rare the eraser should be (Default: 15% chance per hand, see Eraser rules; tune after playtests).
- Push credit window: 1.2 s today (`TIMING.pushCredit`). Worth checking in the playtest that pushes into traps feel credited and walk-ins do not.
- A bump is credited both ways: a victim who runs into a trap owner standing still, then dies in that owner's trap, gives the owner a push-kill (+2). Fixing it needs the other players' velocity, which the clients do not send today.
- Tutorial floor: a very fast player finishes in about 18.5 s, under the 20 s asked. Raising it means keeping the explanation lines on screen longer, and then the do-nothing run would go past 30 s unless the auto-help delays get shorter.

## Where to start

Set up the repo (client and server packages, shared types), then do step 1 only. Before writing code, tell Dorian in a few lines how you plan to structure the project and wait for his answer.
