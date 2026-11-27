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
  (a `CoopSolution`, `bots.ts`) and `shortcuts` (attempts that must fail).
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
| Anchoring | an idle anchor slides towards the corner its friend hangs over (or towards him) at 0.15 cells/s per hanging mass (a friend 1, Ruben 2); walking away holds (and hauls). Over a block (a pulley: the rope over its two top corners) two friends on either side hold each other and settle (a little friction round the corners); a body the rope presses against a wall is braked along it |
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

### Test bots (bots.ts)

A solution is a function of the team size returning phases. In each phase every bot has a goal,
by role: `R` (Ruben, always last in the chain), `F0`..`F3` (friends in seat order), `*` (every
other bot). A phase ends when `until` holds (or when every goal is done) and fails after
`timeout` seconds (20 by default). A death fails the run.

Goals: `walk(x, { tol, jump: "auto" | "never", drop })`, `jumpTo(x, { rise, holdFor })`,
`mount(role)` (climb onto a friend's head), `hold(dir)` (push, brace, walk away),
`use()` (↓ once), `enter()` (through the door), `wait(s)`, `idle()`, `seq(...)`,
`when(condition, goal)`. Conditions: `cond.near`, `cond.on`, `cond.standsAbove`,
`cond.allBetween`, `cond.allAbove`, `cond.inside`, `cond.won`, `cond.keyTaken`, `cond.doorOpen`,
`cond.gateOpen(char)`, `cond.plateActive(char)`, `cond.all`, `cond.any`. Helpers: `friends(n)`,
`roleIndex`, `standsOn`, `drawWorld`.

Shortcuts: `shortcuts` in the solution file are bot attempts that must fail (for example, the
towers-and-hauling route that would skip the level's thing). They are the proof that the level
closes them.

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
