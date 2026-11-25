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

## Open questions for Dorian

- Maximum width of scrolling levels (proposed: about 2 screens, 64 cells).
- Whether a catch-up bonus is needed for the last-placed player (only if playtests show the leader running away).
- How rare the eraser should be.
- Push credit window: 1.2 s today (`TIMING.pushCredit`). Worth checking in the playtest that pushes into traps feel credited and walk-ins do not.
- A bump is credited both ways: a victim who runs into a trap owner standing still, then dies in that owner's trap, gives the owner a push-kill (+2). Fixing it needs the other players' velocity, which the clients do not send today.
- Tutorial floor: a very fast player finishes in about 18.5 s, under the 20 s asked. Raising it means keeping the explanation lines on screen longer, and then the do-nothing run would go past 30 s unless the auto-help delays get shorter.

## Where to start

Set up the repo (client and server packages, shared types), then do step 1 only. Before writing code, tell Dorian in a few lines how you plan to structure the project and wait for his answer.
