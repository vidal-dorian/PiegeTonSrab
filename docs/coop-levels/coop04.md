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
- Beat 3 gives one crate two uses, in order: a second PC tower first weighs on the plate that
  opens the key's cage (it frees one player, who fetches the key), then becomes the step under
  the exit.

One deadly moment: the ditch of beat 2. Beat 1 and beat 3 cannot kill.

## Map

63 x 18. Floor tops: the corridor of beat 1 at row 14 ("height 0" below), the duct and the spawn
walkway at row 11 (height 3), the upper floor of beats 1-2 and the lab room of beat 3 at row 9
(height 5 above the corridor), the exit landing at row 5.

```
                    11111111112222222222333333333344444444445555555555666
          012345678901234567890123456789012345678901234567890123456789012
          ###############################################################  0
          ####################################################..........#  1
          ####################################################..........#  2
          ####################################################........D.#  3
          ###############............#########################........D.#  4
          ###############............##########.c.............6##########  5
          ###############............##########Kc..............##########  6
          ###############............#############t............##########  7
          ###############............rrr.....|....t............##########  8
          #.........#####2################^^^######wwwww###5557##########  9
          #S..............####################################8########## 10
          #######.######..############################################### 11
          #######|a.......############################################### 12
          #######|a.......############################################### 13
          ##########111113############################################### 14
          ###############4############################################### 15
          ############################################################### 16
          ############################################################### 17
```

| Char | Thing | Where | Need / link | Team sizes |
|---|---|---|---|---|
| `a` | crate, PC tower 1x2 | corridor, x 8 | 2 | all |
| `1` → `p` | plate (floor sensor) | corridor floor x 10-14 (M included) | ≥ 4, `plancher1` | 4-5 (floor at 2-3) |
| `4` → `q` | plate (floor sensor) | bottom of the 1-deep pit under the rail, x 15 row 15 | ≥ 4, `plancher1` | 4-5 |
| `3` → `\|` | crate stop = the tower's rail | shaft J, x 15 row 14 | | 4-5 (floor at 2-3) |
| `2` → `l` | gate, inverted (hatch) | shaft J, x 15 row 9 | `plancher1` | 4-5 (open at 2-3) |
| `r` | crate, server rack 3x1 | tunnel, x 27-29 row 8 | W | all |
| `^` | bare cables (spikes) | ditch x 32-34, row 9 | kills | all |
| `\|` | crate stop | x 35 row 8 | holds the rack over the ditch | all |
| `t` | crate, PC tower 1x2 | lab room, x 40 (at the tunnel's mouth) | 2 | all |
| `w` | plate | lab floor x 41-45 | W, `cage` | all |
| `c` | gate (the cage) | duct roof, x 38 rows 5-6 | `cage` | all |
| `K` | key | duct roof, x 37 | | all |
| `5` → `d` | plate (floor sensor) | lab floor x 49-51 (M3 included) | ≥ 3, `plancher3` | 3+ (floor at 2) |
| `8` → `e` | plate (floor sensor) | pit under the rail, x 52 row 10 | ≥ 3, `plancher3` | 3+ |
| `7` → `\|` | the tower's rail | exit shaft J3, x 52 row 9 | | 3+ (floor at 2) |
| `6` → `m` | gate, inverted (hatch) | exit shaft J3, x 52 row 5 | `plancher3` | 3+ (open at 2) |
| `D` | door | landing, x 60 rows 3-4 | | all |

Places used below: M = x 14 (Ruben's jump spot, 4 high, ceiling row 9), J = x 15 (the shaft),
the duct = row 10 from x 10 to 13 (1 high, floor = the corridor's ceiling slab), M3 = x 51,
J3 = x 52.

## Beats and the exact solution (bots)

Roles: R is Ruben, F0..F3 the friends in seat order; the chain is F0 - F1 - ... - last friend -
R. Spawn: x 1 to 5 on the walkway, Ruben rightmost.

### 1. Le marchepied (x 1-26)

1. Ruben walks right and drops into the hole (x 7) down to the corridor, behind the PC tower.
   The friends hop the hole and walk into the duct above him (the rope: 3 cells up).
2. Ruben pushes the tower alone along the 2-high corridor, over M, into J against the wall of
   the upper floor (3.2 s). From 4 players it ends on its rail, over the pit.
3. Ruben, in M, jumps onto the tower (top at height 2).
4. His neighbour, first in the duct, walks off the duct's end and drops 0.1 onto his head
   (Ruben stands overhanging M by 0.4, so there is no gap to cross).
5. Ruben steps right under the open shaft; the friend on top jumps (feet 2.9, apex 5.9) and
   lands on the upper floor (height 5).
6. The one up walks right and hauls Ruben (from the tower) and the others (out of the duct,
   into the shaft, up) onto the upper floor (3.3 s at 2 players, about 6 s at 5).

### 2. Le fossé du tunnel (x 16-35)

1. The queue reorders on the upper floor: the friends ahead of Ruben hop back over him, then
   everyone lines up in chain order with Ruben in front, against the rack (Ruben at 26.55, the
   others every 0.86 cell behind; at 5 players the last one is at 23.1).
2. Everyone pushes together (« Poussez ensemble ! »): the rack (need W) slides 5 cells in the
   1-high tunnel, is stopped by the stop at x 35 exactly over the ditch, and falls into it,
   flush with the floor (2.5 s).
3. Everyone walks over the rack through the tunnel to the second PC tower, which stands at the
   tunnel's mouth; the queue keeps its order (Ruben in front, F0 at the back).

### 3. Une caisse, deux usages (x 36-61)

1. The queue pushes the tower onto plate w. With everyone but F0 on it, the plate (W) is
   active: the tower weighs 2 and replaces F0's weight with one to spare. The cage opens. F0,
   at the back, stops at x 40 (open above, off the plate).
2. F0 jumps onto the duct's roof (height 2), walks into the open cage gate and takes the key,
   then drops back to x 40.
3. The queue pushes on: the tower leaves the plate (the cage shuts) and goes onto its rail in
   J3 against the landing's wall (4.3-4.7 s).
4. One at a time (« Un à la fois ! »): Ruben, in M3, hops onto the tower and jumps up through
   the hatch to the landing (apex 5, landing at 4); his neighbour waits next to him on the
   floor sensor, the others off it. Each hopper's chain neighbour comes into M3 as the hopper
   stands on the tower, then the hopper jumps up and waits by the lip.
5. On the landing the key is passed forward (↓ next to its carrier) to Ruben, who opens the
   door; everyone enters.

### Bot times (checker)

| Players | Total | Beat 1 | Beat 2 | Beat 3 |
|---|---|---|---|---|
| 2 | 25.2 s | 9.1 s | 6.1 s | 10.2 s |
| 3 | 26.4 s | 8.9 s | 5.9 s | 11.8 s |
| 4 | 28.1 s | 10.1 s | 5.2 s | 13.1 s |
| 5 | 31.2 s | 11.7 s | 5.2 s | 14.3 s |

(Beat 2 counts the reorder of the queue on the upper floor.)

Players who know the level should take 45-60 s (the reorder before the rack, the talking at
the plate and at the exit).

## Heights, widths and margins

| Spot | Height | Who | Margin |
|---|---|---|---|
| Ruben onto the tower (beat 1) | 2 above M's floor | a lone jump, capped by M's ceiling (head 4, feet 3.1) | 1.1 |
| Friend onto Ruben on the tower | Ruben's head 2.9, the duct floor 3 | a drop of 0.1 | (a drop) |
| Friend from Ruben's head to the upper floor | 5 | feet 2.9, apex 5.9 | 0.9 |
| A friend alone on the tower | apex 5.0 vs 5 | | fails: a jump never climbs 3 |
| Duct, 1 high | | no jump at all | |
| Spawn walkway, 2 high | | a jump bonks at 1.1 | and it is 6+ cells from the shaft |
| F0 onto the duct's roof (beat 3) | 2 | a lone jump, capped by the room's ceiling (feet 3.1) | 1.0 |
| Onto the tower from M3 | 2 | capped feet 3.1 | 1.0 |
| From the tower to the landing | 4 | apex 5 | 1.0 |

Towers without a PC tower (the shortcut the level closes):

| Players | Tallest human tower | Apex | Upper floor 5 / landing 4 |
|---|---|---|---|
| 2 | Ruben + friend, top feet 0.9 | 3.9 | short (1.1 / 0.1: "a 2-tower climbs 3, not 4") |
| 3 | 3-tower, top feet 1.8 | 4.8 | short of 5 by 0.2 ("a 3-tower climbs 4, not 5"); would reach 4: the exit hatch |
| 4 | 4-tower, top feet 2.7 | 5.7 | would reach both: the hatches |
| 5 | 4-tower (a 5th cannot climb onto 3.6), or 5 bodies stacked from the pit (top 2.6) | 5.6-5.7 | would reach both: the hatches |

A PC tower is 2 high and two bodies are 1.8: a tower of 4 bodies reaches as high as the PC tower
with Ruben and a friend on it (5.7 against 5.9). And a body standing on a head can overlap it by
a hair, so a human tower leans up to 0.8 cell per body and reaches into a shaft from the floor
next to it. No ceiling or overhang can tell the two towers apart. So from the team size where a
human tower would reach (4 for the upper floor, 3 for the landing) the floor around the shaft is
a sensor (a plate "≥ 4" / "≥ 3", over 5 / 3 cells: as far as a leaning tower reaches) linked to
an inverted gate, a hatch, in the shaft: any human tower that could reach stands on the sensor
and shuts the hatch before its top jumps (4 friends weigh 4, Ruben and 3 friends 5; 3 friends 3,
Ruben and 2 friends 4). The PC tower rests on a crate stop (its rail): crates stand on "|",
players fall through it into a 1-deep pit whose bottom is the same sensor. So the PC tower and
everyone on it never weigh on the sensor.

Widths: the duct ends one cell (M) before the shaft J, under M's ceiling at height 4: someone
standing at the duct's edge and leaning out cannot carry anyone in the shaft (whoever stood on
his head would be in M's ceiling, or would need to be fully in J while his head reaches at most
0.8 into M). Without that cell, a friend on the head of someone leaning out of the duct would
jump from 3.9 and reach 6.9.

Room to haul (5.5 + 0.8 x (n - 2), 7.9 at 5 players): the upper floor is flat and open from the
lip (x 16) to the tunnel (x 26), 11 cells, 5 high. The landing of the exit is 9 cells (x 53-61);
nobody is hauled there (each one hops up the tower), but there is room.

Push corridors: the rack needs everyone in a row; 5 bodies take 4.3 cells behind the rack, the
upper floor gives 11. The PC towers need 2 (Ruben alone, or two friends in a row).

Rope: during beat 1's push Ruben is 3 cells below the friends in the duct. At the cage F0 is
3.8 cells from the friend in front of him on the plate. At the exit the next hopper waits in M3,
within 2 cells (horizontally) of the shaft: a hopper landing on the landing (4 up) is still
within 4.5 of him; the one after waits at x 48.4, just off the sensor, 3 cells from M3.

## Variants by team size

- 2 players: no sensor and no hatch at either shaft (the human towers are short by height);
  the PC towers stand on plain floor. Plate w: W = 3 = the tower (2) + Ruben or a friend.
- 3 players: the exit's sensor ("≥ 3"), hatch, rail and pit exist (a 3-tower would reach the
  landing); beat 1 still has none (a 3-tower is 0.2 short of the upper floor).
- 4-5 players: both shafts have their sensor, hatch, rail and pit. Beat 1's sensor is "≥ 4", so
  nothing changes for the team when they go the right way: the friends wait in the duct, off it,
  and during the haul at most 3 friends are dragged across it.
- The rack's need W and plate w's need W scale with the team: the rack always needs everyone;
  plate w always needs everyone, or the tower and everyone but one.

## Ruben's active moments

- Beat 1: he alone pushes the PC tower (« il pousse comme deux ») and is the base of the tower.
- Beats 2 and 3: he leads the queue, his 2 counts in the rack's W and in plate w's weight.
- The door: the key is passed forward to him and he opens it (bots; anyone can).

He is never parked on a plate (plate w is held for about 2 s while F0 fetches the key).

## Communication moments

- Beat 2: « Poussez ensemble ! 3, 2, 1 » (one player missing and the rack does not move).
- Beat 1: « Ruben, bouge pas, je te descends sur la tête ! » from the duct.
- Beat 3: « Restez sur la plaque, je vais chercher la clé ! », then at the exit « Un à la fois
  sur le plancher ! » (from 3 players the hatch shuts if three stand on the sensor).

## Deadly moments

One: the ditch of bare cables in beat 2 (1 deep, spikes at its bottom). Nothing else can kill:
no pit is bottomless, the pits under the rails are 1 deep.

## Shortcuts

Each shortcut in `coop04.solution.ts` plays the solution up to the beat it tries to skip, then a
phase whose name starts with `ATTEMPT`, then what would finish the level had the attempt worked.
All fail at 2, 3, 4 and 5 players, in their attempt phase (scratch script run on the committed
level, every shortcut at every team size):

| Shortcut | What the bots try | Why it fails |
|---|---|---|
| a human tower under the upper floor | the PC tower left where it is; everyone goes through the duct and drops into the shaft one after another onto the head below: a straight tower in J (2-3 players), leaning out of M into J (4), stacked from the pit (5); the top jumps for the upper floor | 2-3: too short (top feet 0.9 / 1.8). 4-5: the tower stands on the floor sensor (5 / 6 ≥ 4): the hatch is shut |
| pushing the rack with one player short | F0 stands back, the others push | W - 1 does not move a crate "W" |
| the tower under the exit first | after the tunnel the queue pushes the tower straight to the exit; then everyone but F0 stands on plate w and F0 goes for the key | without the tower, W - 1 is on the plate: the cage stays shut |
| the key without the tower | the tower pushed past plate w; everyone stands on it (W, the cage opens), F0 at its left end jumps onto the duct's roof and runs for the cage | F0 leaving the plate drops it below W; the gate shuts 0.15 s later, long before F0 reaches it (a climb of 2 and 2 cells) |
| a human tower to the exit | the tower left on plate w; everyone hops over it; Ruben stands at the edge of M3, the others climb onto each other, leaning into J3, F0 last; the highest jumps for the landing | 2: too short (0.9 + 3 = 3.9). 3+: the tower stands on the sensor (≥ 3): the hatch is shut; at 4-5 the 4th body even finds no room in the shaft (it would be in the shut hatch) |

Control experiment (scratch script, not committed): with the level weakened, the same bots get
through their attempt phase, so it is the level that stops them:

| Weakened level | Shortcut | Result |
|---|---|---|
| beat 1's hatch removed | a human tower under the upper floor, 4-5 | the top reaches the upper floor |
| the upper floor one cell lower (two at 2 players) | same, 2-3 | the top lands on the lowered floor |
| rack need W-1 | pushing the rack one short | the rack falls in; the level is won |
| plate w need W-1 | the tower under the exit first; the key without the tower | the key is taken; the level is won |
| the exit's hatch removed | a human tower to the exit, 3-5 | the top reaches the landing |

### Accepted

- Any human tower standing on a PC tower (two friends instead of Ruben and a friend, three
  friends at 4-5 players): the tower is used.
- Two friends pushing a PC tower instead of Ruben (need 2), from 3 players.
- Beat 3: Ruben, or two friends, as the free one(s) on plate w; more weight than needed.
- The door wedge on the cage gate (a body in the gateway keeps it open): only once the tower
  has opened it.
- Beat 3's wrong order cannot be undone: once the tower is under the exit it has a wall behind
  it and nobody can push it back; the cage then stays shut for good and the team must restart
  (hold R). It is the price of « l'ordre compte »; the cage opening as the queue walks over the
  plate and the sign « Clé confisquée » over it show what the plate is for.
- A player standing in the 1-deep pit under a rail when a PC tower is pushed over it is stuck
  under the tower (restart). Only someone who fell from the duct into J's pit (4-5 players), or
  walked into J3 before the tower, can be there.

## Deviations from the plan, and why

- **The guard against human towers is a floor sensor, not overhangs.** The plan's « Des
  surplombs empêchent le raccourci » cannot hold from 4 players: the PC tower (2) with Ruben and
  a friend on it reaches 5.9, a 4-tower 5.7, and towers lean, so a ceiling or an overhang that
  lets one through lets the other. Overhangs still do their part (the 1-high duct, M's ceiling,
  the 2-high walkway: nobody jumps for the upper floor from them), and the sensor + hatch (from
  4 players at beat 1, from 3 at the exit) close what overhangs cannot. The rails (crate stops
  under the PC towers) keep the intended tower off the sensor. Plates and inverted gates are
  level 3's things, coming back here.
- **The friend drops onto Ruben instead of climbing onto him.** Jumping from the floor onto a
  head 2.9 high has a margin of 0.1. The friends come from the duct, one cell above Ruben's head.
- **Ruben pushes through a corridor under the duct.** The friends wait in the duct (off the
  sensor), Ruben alone goes down; he never has to come back up (he jumps onto the tower from M).
- **The ditch kills.** The rack must fill it flush, so it is 1 deep; an empty 1-deep ditch under
  a 1-high tunnel could be crossed by climbing out with a margin of 0.1, a deep pit would swallow
  the rack, and "~" sends crates home. Bare cables (spikes) at its bottom make it the level's one
  deadly moment. The stop beyond the ditch is needed: a crate falls only when no column under it
  is solid, so the rack must stop exactly over the 3-wide ditch.
- **Plate w is "W" and the cage is on the duct's roof.** A plate bodies could hold would make
  the tower's first use optional; "W" (the whole class, « le poids de toute la classe ») can only
  free someone with the tower's weight on it. A gate never closes on a body and a plate holds
  0.15 s after its weight goes, so the cage gate is three cells and a climb of 2 from the plate:
  nobody can step off and slip in before it shuts.
- **The exit is "everyone hops up the tower", not a haul.** The tower (2) plus a jump (3)
  reaches the landing (4) alone, so each player climbs it; from 3 players the sensor makes it
  one at a time.
- **The quote's theme.** « On sacrifie une caisse pour en faire passer une autre »: the rack is
  sacrificed in the ditch and every PC tower stays for good where it is used (the first one
  under the upper floor, the second under the exit).

## Engine notes

- A crate is barely taller than two bodies (2 against 1.8), so "a crate as a step" cannot be
  enforced by heights from 4 players: the level has to use weight (sensors) or team size.
- A rider stands on a head with any overlap: human towers lean up to about 0.8 cell per body.
  Any spot where a crate can be pushed is within lean reach of the floor its pusher stands on
  (a crate goes at most 0.8 past the last floor under its pusher).
- Weight-opened gates leak to jumpers: a plate holds 0.15 s and a gate never closes on a body,
  so a jumper who reaches a gate within 0.15 s of leaving its plate keeps it open. The sensors
  here shut their hatch *before* the jump (while the tower stands on them), which does not leak.
- The rope (4.5) decides where the others can wait: at the exit the next hopper must stand
  within 2 cells (horizontally) of the shaft for the hopper to land 4 cells up.
- A 1-wide pit covered by a crate stop cannot be crossed by a pushed crate (its pusher cannot
  follow), so rails only work at the end of a crate's path.
