# coop04 · La Salle de TP

> « Il est où le bouton pour compiler ? »

Files: `packages/shared/src/coop/levels/coop04.ts` (the level),
`packages/shared/src/coop/levels/coop04.solution.ts` (bot solution and shortcuts).
Check: `npx tsx packages/shared/scripts/check-coop-level.ts coop04`.

## Idea

« On sacrifie une caisse pour en faire passer une autre. » Three crates, each left for good where
it is useful:

- Beat 1 shows the crate as a step (le marchepied): a PC tower "2" that Ruben pushes alone
  (« il pousse comme deux ») becomes the base of the tower that reaches the upper floor.
- Beat 2 sacrifices a crate: the whole team pushes the server rack "W" into a ditch of bare
  cables in a 1-high tunnel, and walks over it.
- Beat 3 gives one crate two uses at once: the second PC tower is pushed along plate w into the
  exit shaft, which is the plate's last cell. There it is the only step up to the landing, and its
  weight (2) stands in for whoever is up, so the plate still carries the whole class and the cage
  stays open on the key.

One deadly spot: the bare cables at the foot of the exit shaft (beat 3). The ditch of beat 2 is
not one (see Deadly moments).

## Map

54 x 18. Floor tops: the corridor of beat 1 at row 14 ("height 0" there), the duct and the spawn
walkway at row 11 (height 3), the upper floor of beats 1-2 and the lab of beat 3 at row 9 (height
5 above the corridor; "height 0" in beat 3 below), the exit landing at row 5 (height 4 above the
lab). Cells `1`-`4` are team-size variants (see the table).

```
                    11111111112222222222333333333344444444445555
          012345678901234567890123456789012345678901234567890123
          ######################################################  0
          ################################################...###  1
          ################################################...###  2
          ################################################..Dc##  3
          ###############............#####################..DcK#  4
          ###############............#####################.#####  5
          ###############............#############.........#####  6
          ###############............#############t.......s#####  7
          ###############............rrr.....|....t.......s#####  8
          #.........#####2################^^^########wwwwww#####  9
          #S..............###################################### 10
          #######.######..###################################### 11
          ######4|a.......###################################### 12
          ######4|a.......###################################### 13
          ######4###111113###################################### 14
          ######4444444444###################################### 15
          ###################################################### 16
          ###################################################### 17
```

| Char | Thing | Where | Need / link | Team sizes |
|---|---|---|---|---|
| `a` | crate, PC tower 1x2 | corridor, x 8 | 2 | all |
| `1` → `p` | plate (floor sensor) | corridor floor x 10-14 (M included) | ≥ 4, `plancher` | 4-5 (floor at 2-3) |
| `3` → `\|` | crate stop = the tower's rail | shaft J, x 15 row 14 | | 4-5 (floor at 2-3) |
| `2` → `l` | gate, inverted (hatch) | shaft J, x 15 row 9 | `plancher` | 4-5 (open at 2-3) |
| `4` → `.` | the crawl under the corridor (row 15) and its shaft at x 6 | x 6-15 | | 4-5 (rock at 2-3) |
| `r` | crate, server rack 3x1 | tunnel, x 27-29 row 8 | W | all |
| `^` | bare cables (spikes) | ditch x 32-34, row 9 | kills | all |
| `\|` | crate stop | x 35 row 8 | holds the rack over the ditch | all |
| `t` | crate, PC tower 1x2 | lab, x 40 (at the tunnel's mouth) | 2 | all |
| `w` | plate | lab floor x 43-47 and the exit shaft's floor x 48 | W, `cage` | all |
| `s` | bare cables (spikes, pointing right) | exit shaft T, x 48 rows 7-8 | kills | all |
| `D` | door | landing, x 50 rows 3-4 | | all |
| `c` | gate (the cage) | landing, x 51 rows 3-4 | `cage` | all |
| `K` | key | x 52 row 4, behind the cage gate | | all |

W is the team's weight, friends 1 and Ruben 2: 3, 4, 5, 6 at 2, 3, 4, 5 players.

Places used below: M = x 14 (Ruben's jump spot, 4 high), J = x 15 (beat 1's shaft), the duct =
row 10 from x 10 to 13 (1 high), the lab = x 40-47 rows 6-8 (3 high: ceiling row 5), T = x 48
(the exit shaft, 1 wide, open from row 1 to row 8), the landing = x 49-52, rows 1-4.

## Beats and the exact solution (bots)

Roles: R is Ruben, F0..F3 the friends in seat order; the chain is F0 - F1 - ... - last friend -
R. Spawn: x 1 to 5 on the walkway, Ruben rightmost.

### 1. Le marchepied (x 1-26)

1. Ruben walks right and drops into the hole (x 7) down to the corridor, behind the PC tower.
   The friends hop the hole and walk into the duct above him (the rope: 3 cells up).
2. Ruben pushes the tower alone along the 2-high corridor, over M, into J against the wall of
   the upper floor (3.2 s). From 4 players it ends on its rail.
3. Ruben, in M, jumps onto the tower (top at height 2).
4. His neighbour, first in the duct, walks off the duct's end and drops 0.1 onto his head.
5. Ruben steps right under the open shaft; the friend on top jumps (feet 2.9, apex 5.9) and
   lands on the upper floor (height 5).
6. The one up walks right and hauls the others onto the upper floor (3 to 7 s).

### 2. Le fossé du tunnel (x 16-39)

1. The queue reorders on the upper floor: the friends ahead of Ruben hop back over him, then
   everyone lines up in chain order with Ruben in front, against the rack.
2. Everyone pushes together (« Poussez ensemble ! »): the rack (need W) slides 5 cells in the
   1-high tunnel, is stopped by the stop at x 35 exactly over the ditch, and falls into it,
   flush with the floor (2.5 s).
3. Everyone walks over the rack through the tunnel to the second PC tower at the tunnel's mouth;
   the queue keeps its order (Ruben in front, F0 at the back).

### 3. Une caisse, deux usages (x 40-52)

1. The queue pushes the tower along plate w until it drops into place in T, against the far wall
   (3.7 s). It cannot go further, and nobody can get behind it to pull it back out. The whole
   queue now stands on plate w: everyone's weight plus the tower's 2, more than W.
2. Ruben jumps onto the tower from x 47 (the lab is 3 high, so the jump is capped at 2.1; he
   rises along the tower's side and slides over its corner as his feet clear it). His neighbour
   steps up against the tower.
3. Ruben jumps up to the landing (apex 5, landing at 4); his neighbour climbs onto the tower
   (the rope: the next one up always waits on the tower or right under it).
4. Ruben walks through the open cage gate and takes the key. The plate carries W - 2 (everyone
   else) + 2 (the tower) = W, so the cage is open exactly while everyone else stays on it.
5. Ruben opens the door and goes in. Then, one at a time, each one on the tower jumps to the
   landing, the next one climbs onto the tower, and the one up goes in.

### Bot times (checker)

| Players | Total | Beat 1 | Beat 2 | Beat 3 |
|---|---|---|---|---|
| 2 | 21.0 s | 9.1 s | 6.1 s | 6.1 s |
| 3 | 21.6 s | 8.9 s | 5.9 s | 6.9 s |
| 4 | 22.8 s | 10.1 s | 5.2 s | 7.7 s |
| 5 | 25.4 s | 11.7 s | 5.2 s | 8.5 s |

(Beat 2 includes the queue's reorder on the upper floor. The previous version took 25.2 s at 2
players and 31.2 s at 5.)

Players who know the level should take 40-55 s (the reorder before the rack, the talking at the
plate).

## Heights, widths and margins

Jump apex is pinned at 3.0 cells. Margins under 0.3 are marked **pinned**: they hold only
because the apex is exactly 3.0, and a change of jump tuning would move them.

| Spot | Height | Who | Margin |
|---|---|---|---|
| Ruben onto the tower (beat 1) | 2 above M's floor | a lone jump, capped by M's ceiling (feet 3.1) | 1.1 |
| Friend onto Ruben on the tower | Ruben's head 2.9, the duct floor 3 | a drop of 0.1 | (a drop) |
| Friend from Ruben's head to the upper floor | 5 | feet 2.9, apex 5.9 | 0.9 |
| A friend alone on the PC tower (beat 1) | 5 | apex 5.0 | **0.0 short, pinned**: a jump never climbs exactly 3 |
| 3-tower under the upper floor (3 players) | 5 | top feet 1.8, apex 4.8 | **0.2 short, pinned** |
| 5-tower in J from the crawl (5 players) | 5 above the corridor = 7 above the crawl | top feet 3.6 above the crawl, apex 6.6 | 0.4 short |
| Duct, 1 high | | no jump at all | |
| Spawn walkway, 2 high | | a jump bonks at 1.1 | and it is 6+ cells from the shaft |
| Out of the crawl (4-5 players): from its floor at x 6 onto the corridor floor at x 7 | 2 | a jump | 1.0 |
| Onto the PC tower in T from the lab floor | 2 | a jump capped at feet 2.1 by the lab's ceiling | **0.1, pinned**, but the climb does not depend on timing: the jumper rises against the tower's side and slides over as soon as its feet clear it (52 of 52 tries land, from x 46.0 to 47.2, four jump timings) |
| From the tower in T to the landing | 4 | apex 5 | 1.0 |
| A body in T below height 2 | | the cables (the hazard box is inset 0.1, and T is 1 wide: any body fully in T touches the strip) | death |
| The top of a 3-tower in column 47 stepping into T | feet 1.8 | its hazard box reaches 0.1 into the cables' rows | **0.1, exact geometry**: death |
| The same top jumping first | | it bonks on the lab's ceiling (0.3 of head room) before its left side can clear x 48 (0.7 to go), so it enters T with no speed left and falls into the cables | death |
| 2-tower standing in T, if there were no cables | 4 | top feet 0.9, apex 3.9 | 0.1 short (moot: the cables) |

The previous version's "Ruben + a friend at 2 players, 0.1 short of the exit" no longer exists:
the exit can only be climbed from inside T.

Towers without a PC tower:

| Players | Tallest human tower | Upper floor (beat 1) | Landing (beat 3) |
|---|---|---|---|
| 2 | Ruben + friend, top feet 0.9 | short (apex 3.9 vs 5) | nobody stands in T; from column 47 the top dies in the cables |
| 3 | 3-tower, top feet 1.8 | **0.2 short, pinned** | same |
| 4 | 4-tower, top feet 2.7 | would reach: the hatch | a 4-tower does not fit in the 3-high lab |
| 5 | 4-tower, or 5 stacked from the crawl | would reach (4-tower): the hatch; the crawl tower is 0.4 short | same |

Beat 1's guard, unchanged: from 4 players the floor around the shaft is a sensor (plate "≥ 4"
over the corridor floor and M, as far as a leaning tower reaches) linked to an inverted gate, a
hatch, in the shaft: any 4-tower that could reach stands on the sensor and shuts the hatch before
its top jumps. The PC tower rests on a crate stop (its rail): crates stand on "|", players fall
through it, now into the crawl, which leads left under the corridor to x 6 and back up.

Beat 3's guard is geometry, not a rule: the only way up is from inside T, T is deadly below
height 2, and the lab, 3 high, holds no human tower whose top stands at 2 or more. Only the PC
tower stands in T (crates cover spikes).

Rope: during beat 1's push Ruben is 3 cells below the friends in the duct. At the exit the one on
the landing (x 49.45, 4 up) and the next one, on the tower (x 48.5) or touching it (x 47.55), are
within 4.5; the key (x 52.2) is within 4.5 of the tower, not of the lab floor, so the next one
climbs onto the tower before the first goes for the key.

Push corridors: the rack needs everyone in a row; 5 bodies take 4.3 cells behind the rack, the
upper floor gives 11. The PC towers need 2 (Ruben alone, or two friends in a row).

## Variants by team size

- 2-3 players: no sensor, hatch, rail or crawl at beat 1 (a human tower is short by height);
  the PC tower stands on plain floor.
- 4-5 players: beat 1's sensor ("≥ 4"), hatch, rail and the crawl exist. Nothing changes for
  the team when they go the right way: the friends wait in the duct, off the sensor.
- Beat 3 is the same at every size. The rack's need and plate w's need are W: the rack needs
  everyone; plate w needs the tower plus everyone but the one up (with a friend up, one other
  friend may step off).

## Ruben's active moments

- Beat 1: he alone pushes the PC tower (« il pousse comme deux ») and is the base of the tower.
- Beat 2: he leads the queue; his 2 counts in the rack's W.
- Beat 3: he leads the queue into the lab, is first up, takes the key and opens the door. His
  weight is why the rule is "everyone else on the plate" while he is up.

He is never parked on a plate.

## Communication moments

- Beat 1: « Ruben, bouge pas, je te descends sur la tête ! » from the duct.
- Beat 2: « Poussez ensemble ! 3, 2, 1 » (one player missing and the rack does not move).
- Beat 3: « Toute la classe sur la plaque ! » (the sign says it too) while Ruben gets the key,
  then « Un par un sur la tour ».

## Deadly moments

- **The bare cables at the foot of the exit shaft T** (beat 3), up to height 2: whoever walks
  into T before the PC tower is there dies, and so does any human tower that tries to reach the
  landing without it. They are drawn as red spikes, in the shaft the queue is walking towards.
  Once the tower is in T it covers them.
- **The ditch of beat 2 is a breather, not a danger.** Nobody can reach it before the rack falls
  into it (the rack fills the 1-high tunnel in front of the team), and the rack then covers it
  flush. It is there for the theme (the rack is sacrificed into the cables) and to show the
  cables that matter later. We kept it that way rather than add a risk that would need another
  rule.

No pit traps anyone: the pit under beat 1's rail opens into the crawl, and there is no pit at
the exit any more.

## Shortcuts

Each shortcut in `coop04.solution.ts` plays the solution up to the beat it tries to skip, then a
phase whose name starts with `ATTEMPT`, then what would finish the level had the attempt worked.
All fail at 2, 3, 4 and 5 players, in their attempt phase (scratch script that runs every
shortcut at every team size on the committed level):

| Shortcut | What the bots try | Why it fails |
|---|---|---|
| a human tower under the upper floor | the PC tower left where it is; everyone goes through the duct and drops into J one after another onto the head below: straight in J (2-3), leaning out of M (4), stacked from the crawl (5); the top jumps for the upper floor | 2-3: too short (top feet 0.9 / 1.8). 4: the tower stands on the floor sensor: the hatch is shut. 5: from the crawl it is 0.4 short |
| pushing the rack with one player short | F0 stands back, the others push | W - 1 does not move a crate "W" |
| a human tower beside the exit shaft | the PC tower parked on plate w at x 44 (its weight counts); the front of the queue climbs over it and builds a tower in column 47, Ruben at the base (2 bodies at 2 players, 3 from 3), and straightens it up; the top jumps for the landing | the top dies in the cables. This is the old 4-5 player "leaning wedge" on the new map: the cage is only reachable from the landing, and no 4-tower fits in the lab |
| a human tower in the exit shaft | the PC tower parked at x 46; Ruben climbs onto it and walks off into T to be the base of a tower there | Ruben dies in the cables |
| the key with a friend off the plate | Ruben up on the landing, his neighbour on the tower; F0 walks off plate w, then Ruben goes for the key | 4-5: the plate carries W - 1, the cage is shut. 2-3: the rope keeps F0 on the plate (at 2 players F0 is the one on the tower, at 3 its neighbour is), so the key is never taken with F0 off it |

Control experiment (scratch script, not committed): with the level weakened, the same bots get
through their attempt phase, so it is the level that stops them:

| Weakened level | Shortcut | Result |
|---|---|---|
| beat 1's hatch removed | a human tower under the upper floor, 4 | the top reaches the upper floor (at 5 the crawl tower is still 0.4 short: there the hatch guards against 4-towers leaning from M, as at 4) |
| the upper floor one cell lower (two at 2 players) | same, 2-3 | the top lands on the lowered floor |
| rack need W-1 | pushing the rack one short | the rack falls in; the level is won |
| plate w need W-1 | the key with a friend off the plate, 4-5 | the key is taken with F0 off; the level is won |
| no cables in T | a human tower in the exit shaft, 3-5 | the 3-tower stands in T, its top reaches the landing, takes the key and goes in |

A placed-body probe also tried 1600 ways for the top of a human tower to reach the landing
without the tower in T, at 5 players: 2- and 3-towers in column 47 leaning 0 to 0.3, and 1 or 2
bodies on the PC tower parked at x 46 or 47, with every timing of run, jump and hold. None
reached it.

### Accepted

- Any human tower standing on a PC tower (two friends instead of Ruben and a friend at beat 1):
  the tower is used.
- Two friends pushing a PC tower instead of Ruben (need 2), from 3 players.
- A friend first up at beat 3 (only possible if the queue was lined up that way): then one other
  friend may leave the plate. The rule on the sign, "everyone on the plate", always works.
- The door wedge on the cage gate (a body in the gateway keeps it open once open): only someone
  already on the landing, so only once the tower is in T.
- Walking into T before the tower: death, on purpose, visible.
- Beat 1's pinned margins (above).

## The critic's issues (second version), and what changed

1. **The lean wedge at 4-5 players (c4_key_wedge.ts).** Closed by moving the cage. It is on the
   landing now, reachable only from inside T, and the lab is 3 high, so no 4-tower stands in it.
   New ATTEMPTs "a human tower beside the exit shaft" and "a human tower in the exit shaft" fail
   at every size, and the 1600-try probe finds no way up.
2. **The wrong order in beat 3 was the default (c4_push_through.ts).** There is no order any
   more: the exit shaft is the plate's last cell, and the tower stops there against the wall.
   Pushing straight on, as the critic's bots do, is the solution. With 8 s of continuous push the
   tower ends at x 48 at every size, nobody dies, and the solution finishes (25.3 / 25.9 / 27.1 /
   29.7 s).
3. **The J3 pit trapped for good (c4_pit_j3.ts), and beat 1's pit is the same trap.** The exit
   pit is gone. Beat 1's pit under the rail (4-5 players) now opens into a crawl under the
   corridor that leads to x 6, from where a 2-high jump gets you back onto the corridor floor.
   Probe: a friend standing under the PC tower on its rail gets out in 2.1 s at 4 players and
   2.3 s at 5. The crawl exists only at 4-5, so at 2-3 the map is as before.
4. **The exit hatch rules were invisible (c4_exit_ruben_waits.ts, c4_exit_crowd.ts).** The exit
   sensor and hatch are gone. Anyone can go up in any order, and the only rule left is plate w,
   whose counter (load / need) and link line to the cage gate are on screen. Screenshot at 5
   players: the counter reads 4/6 with two players still off the plate, and the link goes to
   the cage. Beat 1's hatch (4-5) shows its sensor's counter (0/4) and its link line.
5. **The ditch could never kill.** It is now described honestly as a breather (Deadly
   moments). The level's real danger is the cables at the foot of T, which are on the way and
   do kill.
6. **Height margins below 0.3.** The 3-tower at 3 players (0.2) and the friend alone on the PC
   tower (0.0) are listed above as pinned. The 2-player exit case (0.1) is gone. The new 0.1
   margins in beat 3 are listed with why they do not depend on timing (climbing onto the tower)
   or are exact geometry ending in a death (the cables).
7. **Simplify.** Removed: the exit sensor, its pit, its rail and its hatch, the "un à la fois"
   rule, the cage on the duct's roof, the plate under beat 1's pit. Added: the cables in T
   (visible, no rule) and the crawl (4-5). Beat 3 now has a single rule (plate w), and the
   three beats are kept. 2-player bots take 21.0 s (was 25.2).

Re-runs of the critic's scripts on the new level (copies with their imports pointed at this
worktree): `c4_key_wedge`, `c4_key_wedge3`, `c4_exit_ruben_waits`, `c4_exit_crowd`, `c4_pit_j3`
and `c4_push_through` look for phases of the old solution ("the queue pushes the tower onto plate
w", "everyone but Ruben steps back", ...) that no longer exist, so they replay the whole new
solution first and then time out in their own phase, with the team already through the door.
They no longer apply. `c4_key_wedge3b` (placed 2- and 3-towers jumping for the old cage) runs:
the cage is never open and the key is never taken. `c4_fix_cage`, `c4_key_wedge_on_fix` and
`c4_alcove` patched cells of the old map and were not re-run. The adapted checks are described
in 1-3 above.

## Deviations from the plan, and why

- **The guard against human towers at beat 1 is a floor sensor, not overhangs.** From 4 players
  the PC tower (2) with Ruben and a friend reaches 5.9 and a 4-tower 5.7, and towers lean: no
  ceiling tells them apart. Overhangs do their part (the 1-high duct, M's ceiling, the 2-high
  walkway) and the sensor + hatch close the rest.
- **Beat 3's two uses come at once, not in order.** The plan said "on the plate, then under the
  exit". In order, the natural mistake (pushing straight on) was unrecoverable, and every guard
  that kept the order honest needed another rule (a sensor, a hatch, "one at a time"). With the
  exit shaft as the plate's last cell, the tower's weight is still needed (without it the plate
  cannot carry W while anyone is up) and so is the step (nothing else stands in T).
- **The friend drops onto Ruben instead of climbing onto him** (beat 1): jumping from the floor
  onto a head 2.9 high has a margin of 0.1.
- **The exit is "everyone hops up the tower", not a haul.** The tower (2) plus a jump (3)
  reaches the landing (4) alone.
- **The quote's theme.** The rack is sacrificed in the ditch and every PC tower stays for good
  where it is used.

## Engine notes

- A crate is barely taller than two bodies (2 against 1.8), so "a crate as a step" cannot be
  enforced by heights from 4 players: the level uses weight (beat 1's sensor) or a spot where
  only a crate can stand (beat 3's cables: spikes are not colliders, crates cover them).
- A rider stands on a head with any overlap: human towers lean up to about 0.8 cell per body.
  A ceiling caps a jump for as long as the body overlaps that column: the lab's ceiling is what
  stops a tower top from jumping sideways into T.
- Weight-opened gates leak to jumpers (a plate holds 0.15 s, a gate never closes on a body).
  Beat 3's cage cannot be reached from the plate at all, so that leak does not matter there.
- The rope (4.5) decides who can be where: at the exit the next one up waits on the tower or
  touching it. In a crawl the rope bends over the terrain's corners and can hold a friend back:
  the others have to walk along with him.
- Plate weight counts riders: whoever stands on the PC tower in T weighs on plate w.

## Critic round 3 (re-check of the redesign)

No new shortcut, soft-lock or forced restart. One readability point: if Ruben's chain neighbour waits on
the lab floor in front of T instead of on the tower, the rope holds Ruben at the door cell and lifts the
neighbour off plate w, so the cage cannot open (recoverable: the neighbour climbs onto the tower). The sign
« Le suivant monte sur la tour » now says it.
