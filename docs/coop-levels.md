# Co-op levels ("Sauve Ton Srab"): design guide and level notes

This file is for whoever designs co-op levels. Part 1 is the toolbox: the format, the physics,
the things, the rules every level follows, the test bots and the checker. Part 2 holds the notes
of each level: its idea, its beats, its solution, its variants by team size, the shortcuts it
closes and the ones it accepts.

The design intent (in French) is in the plan, section "Les niveaux : le semestre de Ruben".

## Part 1. The toolbox

### Files

- A level: `packages/shared/src/coop/levels/<id>.ts`, exporting a `CoopLevelDef` (`levelFormat.ts`).
- Its bot solution: `packages/shared/src/coop/levels/<id>.solution.ts`, exporting `solution`
  (a `CoopSolution`, `bots.ts`), `shortcuts` (attempts that must fail) and, where a level has
  one, `recoveries` (a mistake and the way back, which must finish).
- The game's campaign order: `COOP_LEVELS` in `levelList.ts`. The test registry of solutions:
  `levels/solutions.ts`.
- Reference example: `levels/_course.ts` and `levels/_course.solution.ts` (a wall climbed with a
  tower and a haul, solved at 2 to 5 players). Files starting with `_` are not campaign levels.

### Checker

```
npx tsx packages/shared/scripts/check-coop-level.ts coop03 [--players 2,3] [--map] [--trace]
npx tsx packages/shared/scripts/check-coop-level.ts --all
```

For each team size it lists format problems, plays the bot solution on the real physics and
prints the time of each phase, or the failing phase with the world drawn at that moment
(friends `0`-`3`, Ruben `R`, crates `C`, open gates `:`). `--trace` draws the world every second.
`packages/client/src/coop/coopLevels.test.ts` runs the same checks in `npm test`.

### Format (levelFormat.ts)

- Rows of characters, same terrain as the race maps: `#` solid, `.` empty; race objects `^` floor
  spikes, `*` saw, `T` spring, `=` placed block.
- `=`, a placed block (drawn as a white riveted tile, never taken for terrain): solid for bodies
  and crates, and the rope wraps it like terrain (springs `T` too). The rope wraps all the fixed
  scenery; only the co-op things (gates, crates, A/B shelves, platforms, fragile floors) let it
  through. There is no static cell that stops bodies but not the rope: a puzzle that needs the
  rope to pass must use a thing (a test in coopRopeWrap.test.ts holds every level to it).
- `S`: leftmost spawn cell; players spawn on S..S+4 (rope order: friends in seat order, Ruben on
  the right). Floor under those five cells, two free rows above.
- `K` Ruben's USB key (at most one; none means the door is open from the start).
- `D` the door (its cells are its box, usually 1 x 2).
- `|` a crate stop (empty for players, a wall for crates). `%` glass (solid, drawn as a window).
- `~` the bottom of a deadly pit (touching it kills).
- Any other character is looked up in `legend`: the cells of one character form one thing.
- `cells` gives characters that depend on the team size: `{ "1": { "2": "#", "3+": "." } }`.
  A legend thing can carry `players: "3+"` (also `"2"`, `"4-5"`, `"2-3"`).
- `signs`: handwritten French signs drawn in the level (`{ x, y, text }`, centre in cells).
- The top row is solid. At most 100 cells wide; any height (the camera scrolls vertically).

### Physics (all pinned by `coopPhysics.test.ts`)

Units are cells and seconds. A body is 0.8 wide and 0.9 high.

| Fact | Value |
|---|---|
| Run speed | 7 cells/s |
| Jump | apex exactly 3.0 above the feet; a lone player climbs a step of 2, not 3 |
| Towers | a 2-tower climbs a step of 3, a 3-tower 4, a 4-tower 5 (hard); 5 is never climbed without a step |
| Jump across | about 5 cells centre to centre at run speed (a gap of about 5.8 at most, edge to edge) |
| Rope | 4.5 cells of rest length between chain neighbours, measured along its path: it wraps around the corners of all the fixed scenery (solid tiles, glass, team-size walls, placed blocks `=` and springs `T`; the things, i.e. platforms, gates, crates, shelves, seesaws, balances, fragile floors, and bodies never stop it) and keeps those wraps until it comes round them. Elastic past 4.5: a friend hanging still stretches it by about 0.15 (Ruben 0.3, a chain by the weight below each link), a runner dragging a friend by about 0.4, up to a hard stop at 5.4 (20 %). Over a lip the path is longer than the straight line: measure rope puzzles along the path (see "Rope v2" in HANDOFF.md) |
| Ruben | weighs 2 (plates, seesaws, balances), pushes like 2, has a rope mass of 2; nobody can stand on him (he slides off and squashes the friend), he can carry friends |
| Carrying | whoever carries someone (or a crate) cannot jump; nobody jumps off a base that is in the air |
| Walls | no wall jump, no wall slide |
| Hauling | walking away from a friend who hangs below hauls them up at most 2.5 cells/s (Ruben 1.2): about 2 to 3 s for a 3-cell wall; a hauled body climbs over a lip once its feet are within 0.6 of the top (0.9 when the rope wraps that lip), unless the rope pulls it down more steeply than about 27°. A pull passes through friends standing still in the middle of the chain; a friend who has Ruben hanging below rises at Ruben's speed. A walker held by the rope never outruns it, not even with a friend right behind it or on its head |
| Anchoring | an idle anchor slides towards the corner its friend hangs over (or towards him) at 0.15 cells/s per hanging mass (a friend 1, Ruben 2); walking away holds (and hauls). An idle anchor at a floor's end whose friend hangs against the wall below it slides off that end (past the corner it aims at the friend, half a body beyond the edge, where it loses its footing): only an overhang (the friend under the corner) or something under the friend stops it, so a lone catcher hauling a last one up from below must haul at once (Le Labo Réseau puts a fragile tile under him). Over a block (a pulley: the rope over its two top corners) two friends on either side hold each other and settle (a little friction round the corners); a body the rope presses against a wall is braked along it |
| Swinging | left/right pumps a hanging swing, at most 70° from vertical; an idle swing dies down |
| Riders | whoever stands on a body moves with it: nobody walks out from under a friend |

### Things (props.ts, constants in `PROPS`)

| Thing | Behaviour |
|---|---|
| `plate` | In the floor (its cells replace floor cells). Active while it carries `need` (`exact`: exactly). Weight = everything standing on it, with what stands on them and the friends hanging from them on the rope. `need` can be `"W"`, `"W-1"`, `"W-2"`: the team's weight (friends 1, Ruben 2) minus some. Stays active 0.15 s after its weight goes. |
| `gate` | Solid unless its `link` is on (`inverted`: the other way round). A link is on when any plate of that link is active, or a terminal set it. Never closes on a body or a crate. |
| `crate` | Its cells give its size (1x1 box, 1x2 PC tower, 3x1 server rack...). Moves only when a row of grounded players pressing towards it has a total strength of at least `need` (friend 1, Ruben 2), at 2.2 cells/s; never pushes anyone. Weighs `weight` (default: its need). Falls; can be stood on; stays on a head it falls on. Back home when it leaves the level or touches `~`. Stopped by `|`. |
| `seesaw` | One row, odd width ≥ 3: two pads around a fixed middle cap. The heavier side goes down (0.75 below level, the other side 0.75 above); equal weights bring it back level. A fall of 1.5 or more onto the raised side snaps it and throws whoever stands on the other side up by 1.4 x fall x falling weight / launched weight, at most 8. The rope still holds the thrown friend (plan the targets within rope reach). |
| `pan` | Two pans with the same `balance` id: the heavier drops `step` (1) cell per unit of weight difference, at most `travel` (2), at 2.5 cells/s. Weight counters are drawn on them. The rising pad or pan of a seesaw or balance never goes through anyone: it stops (and the other side with it) where what stands on it meets a ceiling, or under a body or crate landing on it. |
| `mover` | A one-way platform (jump through from below) moving between its cells and +(dx, dy): on the clock (`period` s for a return trip, `phase`), or while `link` is on, or while it carries `need` (at `speed`, 2.5 cells/s). `arc: { px, py, degrees, period }` swings it like a lamp from a pivot cell. |
| `switch` + `shelf` | Hitting the switch from below swaps the active shelf group (A at the start). A shelf cell turns solid only once nobody is in it. |
| `terminal` | ↓ in front of it sets `link` on (or off). When Ruben uses it, it does the opposite and Claude answers something absurd. Terminals with the same `together` act only if all are used within 1 s. |
| `fragile` | Breaks under a weight of 2 or more (Ruben, or two friends), back at the restart. |
| `spikes` | `dir` up/down/left/right: a deadly strip 0.45 deep at the base of their cell. |
| `wall` | Terrain present only for some team sizes (with `players`). |
| key / door | The key is picked up on contact; ↓ next to its carrier takes it. The carrier opens the door by touching it. ↓ in the open door enters (a fixed point of the rope), ↓ again comes out. Everybody inside: the level is won. |

A death restarts the whole level for everyone, things included.

### Rules every level follows (from the plan)

- One idea per level, in 2 or 3 beats: shown without danger, then turned around. Once known, a
  level is replayed in 45 to 60 s; the bots at 2 players finish in 90 s at most.
- The first beats never kill; deadly moments come late, 3 at most per level.
- Heights keep a margin of at least 0.3 cell on every target; ceilings stop taller towers from
  skipping a beat. Height rules hold from 2 to 5 players.
- Widths: a lone player jumps about 5 cells; the rope (4.5, at most 5.4 under load) is not longer,
  so rope puzzles play on height, ceilings and overhangs, never on width.
- Rope puzzles are measured along the rope's path (it wraps the scenery's corners) and allow for
  the give: a body dropped onto the rope dips below its resting depth (about 0.6 for one body,
  about 1 for two dropping together), so a deadly depth keeps 0.3 below the dip, not below the
  rest. A walker can drag a friend standing still with the link stretched to about 4.9.
- Behind every lip the whole team must get over: at least 5.5 + 0.8 x (players - 2) flat free
  cells with no overhang (room to haul).
- Each plate is at most one chain link from its gate, and the last one holding a plate always has
  a way through. Pits are either catch pits (the kill line at least 6 cells below the rim; deeper
  where several friends can hang) or deadly (`~` within 3 cells), never in between.
- Variants by team size where needed ("2", "3+", "4-5"), like Pico Park.
- Each thing family comes back in at least 2 levels. Ruben has an active moment in every level
  and is never parked on a plate for more than 20 s. Every level has an explicit moment where
  players must talk ("3, 2, 1, saute !").
- No thing exists only to sabotage: the betrayals are the natural ones (walking away with a friend
  on your head, leaving a plate).

### Designing with the wrapped rope

What the redesign of levels 2-4 taught (2026-11-27). The physics is in the table above; these are
the consequences for a map.

- **There is no rope-transparent scenery.** The rope wraps every static solid cell (terrain, glass,
  team-size walls, `=`, springs). A puzzle that needs the rope through something bodies cannot pass
  uses a thing (a gate, a fragile floor, a still mover); `coopRopeWrap.test.ts` enforces it. Do not
  bring `=` back as a rope hole.
- **A corner is a pivot.** Over a lip the hanging depth is set by the anchor's distance to the
  corner, measured along the path (Le Labo Réseau: feet about anchor x - 13.6). Design depths from
  that corner, not from the anchor, and give the window at least 0.3 on each side of the dip.
- **The wrap holds the hanging body against the wall below the corner.** A slot or a ledge under a
  lip is reached by leaning in under it (the rope then wraps the lower corner too), not by swinging:
  allow for the body pressing on the wall below, and give it a floor to be set down on.
- **Idle anchors slide, and slide off ends.** An anchor who does nothing slides towards his friend
  at 0.15 cells/s per hanging mass, and at a floor's end the wrap is let go once his centre passes
  the corner: he goes over. Any beat where an idle team could stand with somebody hanging needs a
  stop (an overhang over the hanging one, something under him, a fragile tile like Le Labo
  Réseau's), or it kills a team that waits about 20 s. Probe idle teams, with and without the
  hanging one leaning.
- **A taut link carries weight.** A body in the air under a taut rope weighs on its holder's
  support (plates, benches). A plate that counts a team needs the longest possible link measured
  from every place a hanging body can start, not just one (L'Amphi's 4-5 finding, since closed by
  a lower bench ceiling, came from a shortcut that hopped from a single x). A body floating at the
  end of a stretched rope hangs too.
- **Wraps can drag.** A body climbing back over a solid step drags its neighbour by the wrap round
  that step; a still mover leaves a pocket under it that bodies walk into. L'Amphi used a gate
  inverted on the bench's own link (m) as a step that exists only while it is needed.
- **Links climb as well as hold.** A friend standing on a head near a corridor mouth shortens the
  path round a lip by as much as a duct does, and a body in the air is a weak anchor: a neighbour
  jumping with the climber gives it the slack a duct would (La Salle de TP, closed with a plate in
  the duct that holds a trap open). When a beat forces someone to a place because of rope length,
  probe every place of the same height, towers included, and jumps timed with the climber's.
- **A latch makes a visit, a plate makes a wait.** To make someone stay somewhere, use a plate,
  not a terminal: the climber of La Salle de TP ran to the first fix's terminal and back on its
  own. A gate on a plate shuts behind the last body to leave its way, so a haul through it needs a
  lock (a terminal on the same link, used by the first one through) first.
- **Plates read what stands on them, and the rope through things.** A crate weighs on plates (set
  `weight: 0` when it is a step, not a weight); a closed gate stops bodies but not the rope, so no
  haul passes one.
- **Prove the mistakes too.** `recoveries` in a solution file are played to the end at every size: a
  mistake players will make and the way back. A trap that can bury a body (a crate pushed onto
  someone in a pit) needs one.

### Test bots (bots.ts)

A solution is a function of the team size returning phases. In each phase every bot has a goal,
by role: `R` (Ruben, always last in the chain), `F0`..`F3` (friends in seat order), `*` (every
other bot). A phase ends when `until` holds (or when every goal is done) and fails after
`timeout` seconds (20 by default). A death fails the run.

Goals: `walk(x, { tol, jump: "auto" | "never", drop })`, `jumpTo(x, { rise, holdFor })`,
`mount(role)` (climb onto a friend's head), `hold(dir)` (push, brace, walk away),
`use()` (↓ once), `enter()` (through the door), `takeKeyFrom(role)` (↓ whenever that role carries
the key within reach), `wait(s)`, `idle()`, `seq(...)`,
`when(condition, goal)`. Conditions: `cond.near`, `cond.on`, `cond.standsAbove`,
`cond.allBetween`, `cond.allAbove`, `cond.inside`, `cond.won`, `cond.keyTaken`, `cond.doorOpen`,
`cond.gateOpen(char)`, `cond.plateActive(char)`, `cond.all`, `cond.any`. Helpers: `friends(n)`,
`roleIndex`, `standsOn`, `drawWorld`.

Shortcuts: `shortcuts` in the solution file are bot attempts that must fail (for example, the
towers-and-hauling route that would skip the level's thing). They are the proof that the level
closes them. `recoveries` are the other way round: a mistake players will make (a crate left one
cell short, someone in a hole) and the way back, played to the end; they must finish, the proof
that the mistake does not soft-lock the level.

## Part 2. Level notes

One file per level in `docs/coop-levels/`: idea, beats, solution, variants by team size, shortcuts
closed and accepted, deadly moments, Ruben's moment, communication moment.

| # | Level | Notes |
|---|---|---|
| 1 | La Rentrée | [coop01.md](coop-levels/coop01.md) |
| 2 | Le Labo Réseau | [coop02.md](coop-levels/coop02.md) |
| 3 | L'Amphi | [coop03.md](coop-levels/coop03.md) |
| 4 | La Salle de TP | [coop04.md](coop-levels/coop04.md) |
| 5 | La Salle | [coop05.md](coop-levels/coop05.md) |

### What the designers of levels 2-4 returned (redesign for the wrapped rope, 2026-11-27)

- **Le Labo Réseau.** The critic's "beat 1 kills at 2 players when Ruben, in the slot, hesitates"
  was real: F0 hanging below the slot floor's end (centre 24.40) made Ruben's idle slide stop at
  exactly the point where he loses the floor (haul within 1.0 s: fine; 1.5 s or later: both die).
  Fixed by the fragile tile `f` across shaft A at row 14 (x 24-27, 4 below the slot's floor): the
  hanging friend rests on it (feet 14.00) so nobody slides, and it breaks under 2, so nobody towers
  from it and a team that falls in still dies. Row 15 was too low. Rejected: an undercut (the
  hauled friend jams under it), a plate-and-hatch on the floor's end (the mantle reads terrain
  only), a solid pit floor (a 3-tower climbs out at 4-5, and a fallen team is stuck), a crawl over
  the raised floor (spawns need two rows; F0 still got past Ruben in 378 of 648). The last stage's
  hauler starts once the last one hangs or stands below the floor; `patience` (four variants) and
  `coop02Patience.test.ts` win at 2-5 with 0 deaths, and die at 2 without the tile. Left open by
  the integration's skeptic: an idle anchor whose friend does not lean in slides off the lip itself
  (see coop02.md, "Deadly moments").
- **L'Amphi.** The critic's "an idle bench sitter is dragged to the lip and one jump drops him
  through the trapdoor" was real (won in 15.4 s at 2 players). Fixed by gate m at the bench's end
  (x 33, row 9), inverted on the bench's link: shut (a step) while the bench holds W-1, open (a
  1-deep pit) otherwise; w is now 2 wide. Leaving the bench towards w, one stands on m and weighs
  nothing on the bench, and dropping in before w shuts would take about 12 c/s (run speed 7).
  Rejected: a solid step (the wrap round its face drags F0 off f), a still mover (a 0.6-high pocket
  under it). The bench has 2 seats; the bot solution seats with a queue, orders its exit line as it
  goes and passes the key forward in arrival order. New shortcut "the free friend drags his
  neighbour off the bench into the trapdoor"; with m removed it gets through at 2, 3 and 5. All 12
  shortcuts fail at every size. The integration's skeptic then found "Ruben hanging" from further
  left on the aisle at 4-5 players; closed by lowering the bench's ceiling to 2 cells (see
  coop03.md, shortcuts). Its own skeptic found the free friend holding the trapdoor (a gate)
  open from below; w is now a platform that slides under the bench and back, in one step. Open
  after the fix round: the leaver jumping off the bench while the others walk to its far end hangs
  from them over w's left half, and his weight re-arms the bench (3-5 players; up to 92 of 2100
  scripted runs, and the level is then won; see coop03.md, "Open").
- **La Salle de TP.** Finding 1 (a pit under the rail at 4-5 players buried Ruben under the
  tower): real, fixed. A 2-deep pit would still trap (the tower's top is 4 above it), so J's floor
  is a second "≥ 4" sensor `q` at M's height, the rail and the pit are gone (54 x 16), and the PC
  tower weighs 0 on plates; a tower pushed on into J stops against a body (at 14.19). New shortcut
  "a human tower in J beside the tower left one cell short" (fails at every size; with the J
  sensor off the top gets up at 4-5) and the first `recoveries` entry ("into J before the tower,
  and back out": 22.7 / 24.3 / 25.6 / 28.3 s). Side effect: the "tower one cell short" route now
  works at 4-5 too (accepted). Finding 2 (a friend alone on the bare PC tower with a buffered
  jump): real, accepted, because the tower's top and Ruben's head both give exactly 3.0 of rise and
  the grid cannot put the lip between them with 0.3 to spare. New shortcut "a friend alone on the
  bare PC tower" with a standing jump (best feet exactly at the lip, 9.000). Left open by the
  integration's skeptic: the duct skipped at 4-5 players by a rider at the corridor mouth, and
  Ruben's own buffered climb (accepted, numbers in coop04.md). Fix round: the duct skip (also a
  jump timed with the climber's from M's floor, at 3-5) is closed by a trap over the shaft, from 3
  players; second fix round: the trap is held open by a plate in the duct (someone waits there),
  not a terminal (the climber opened it and came back), and locked by the first one up.
