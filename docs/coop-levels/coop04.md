# coop04 · La Salle de TP

> « Il est où le bouton pour compiler ? »

Files: `packages/shared/src/coop/levels/coop04.ts` (the level),
`packages/shared/src/coop/levels/coop04.solution.ts` (bot solution and shortcuts).
Check: `npx tsx packages/shared/scripts/check-coop-level.ts coop04`.

Redesigned on 2026-11-27 for the wrapping rope (rope v2, placed blocks `=` wrapped like terrain):
beat 1 is new, beats 2 and 3 are unchanged. See "Why beat 1 changed" at the end.

## Idea

« On sacrifie une caisse pour en faire passer une autre. » Three crates, each left for good where
it is useful:

- Beat 1 shows the crate as a step (le marchepied): a PC tower "2" that Ruben pushes in front of
  the queue (« il pousse comme deux ») becomes the base of the tower that reaches the upper floor.
- Beat 2 sacrifices a crate: the whole team pushes the server rack "W" into a ditch of bare
  cables in a 1-high tunnel, and walks over it.
- Beat 3 gives one crate two uses at once: the second PC tower is pushed along plate w into the
  exit shaft, which is the plate's last cell. There it is the only step up to the landing, and its
  weight (2) stands in for whoever is up, so the plate still carries the whole class and the cage
  stays open on the key.

The rope plays its part where it fits: in beat 1 it is measured round the shaft's lip, so from 3
players the friend tied to the climber must wait up in the cable duct, not on the floor (the sign:
« Corde courte ? Attends dans la gaine »), and everyone else is hauled over that lip; in beat 3
the next one up waits on the tower, within reach of the one on the landing.

One deadly spot: the bare cables at the foot of the exit shaft (beat 3). The ditch of beat 2 is
not one (see Deadly moments).

## Map

54 x 18. Floor tops: the corridor and M of beat 1 at row 14 ("height 0" there), the cable duct
at row 11 (height 3), the upper floor of beats 1-2 and the lab of beat 3 at row 9 (height 5 above
the corridor; "height 0" in beat 3 below), the exit landing at row 5 (height 4 above the lab).
Cells `1`-`4` are team-size variants (see the table).

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
          #############..2################^^^########wwwwww#####  9
          #########.......######################################  10
          #############...######################################  11
          #.......a.......######################################  12
          #S......a.......######################################  13
          #############113######################################  14
          ###############4######################################  15
          ###############4######################################  16
          ######################################################  17
```

| Char | Thing | Where | Need / link | Team sizes |
|---|---|---|---|---|
| `a` | crate, PC tower 1x2 | corridor, x 8 | 2 | all |
| `1` → `p` | plate (floor sensor) | M's floor x 13-14 | ≥ 4, `plancher` | 4-5 (floor at 2-3) |
| `2` → `l` | gate, inverted (hatch) | top of the shaft J, x 15 row 9 | `plancher` | 4-5 (open at 2-3) |
| `3` → `\|` | crate stop = the tower's rail | J's floor, x 15 row 14 | | 4-5 (floor at 2-3) |
| `4` → `.` | the pit under the rail, 2 deep | x 15 rows 15-16 | | 4-5 (rock at 2-3) |
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

Places used below: the corridor = x 1-12 rows 12-13 (2 high); the duct = x 9-12 row 10 (1 high,
over the corridor's end, its mouth at x 13); M = x 13-14 rows 9-13 (5 high: ceiling at height 5);
J = x 15 (the shaft, open from the floor up to the upper floor's room); the upper floor from x 16
at height 5, its lip at (16, 9); the lab = x 40-47 rows 6-8 (3 high: ceiling row 5), T = x 48 (the
exit shaft, 1 wide, open from row 1 to row 8), the landing = x 49-52, rows 1-4.

## Beats and the exact solution (bots)

Roles: R is Ruben, F0..F3 the friends in seat order; the chain is F0 - F1 - ... - last friend -
R. Spawn: x 1 to 5 in the corridor, Ruben rightmost, so he leads the queue (nobody overtakes
anybody in a 2-high corridor).

### 1. Le marchepied (x 1-26)

1. Ruben pushes the PC tower along the corridor, through M, into J, where it stops against the
   upper floor's wall (3.5-3.9 s; the friends walk behind him). From 4 players it ends on its
   rail, over the pit, off the sensor.
2. Ruben, in M, jumps onto the tower and stands on it under the shaft (x 15.5), clear of M.
3. From 3 players: his neighbour gives the next friend a leg up in M (it climbs onto the
   neighbour's head, jumps and slides into the duct, 1.0 s); it waits at the duct's mouth. The
   other friends wait in the corridor.
4. His neighbour, in M, jumps onto Ruben's head (« Ruben, bouge pas ! »).
5. From Ruben's head (feet 2.9) it jumps up J onto the upper floor (apex 5.9).
6. The one up walks right and hauls the others over the lip (3.2 s at 2 players, 6.7 s at 5).

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

| Players | Total | Beat 1 | Beat 2 | Beat 3 | Longest link (beat 1 / 2 / 3) |
|---|---|---|---|---|---|
| 2 | 20.9 s | 8.9 s | 6.1 s | 6.1 s | 5.40 / 4.52 / 4.73 |
| 3 | 22.6 s | 9.8 s | 6.0 s | 6.9 s | 5.40 / 4.52 / 4.73 |
| 4 | 23.8 s | 10.9 s | 5.3 s | 7.7 s | 5.41 / 4.49 / 4.77 |
| 5 | 26.6 s | 12.9 s | 5.2 s | 8.5 s | 5.41 / 3.57 / 4.77 |

(Beat 2 includes the queue's reorder on the upper floor. The longest links of beat 1 are the
haul, at the hard stop. The previous beat 1 took 9.0-11.4 s.)

Players who know the level should take 40-55 s (the leg-up and the talking at the shaft, the
reorder before the rack, the talking at the plate).

## Heights, widths and margins

Jump apex is pinned at 3.0 cells. Margins under 0.3 are marked **pinned**: they hold only
because the apex is exactly 3.0, and a change of jump tuning would move them.

| Spot | Height | Who | Margin |
|---|---|---|---|
| Ruben onto the PC tower in J, from M | 2 | a lone jump (M is 5 high) | 1.0 |
| A friend onto Ruben's head, from M | 2.9 | apex 3.0 | **0.1, pinned**, but it does not depend on timing: the jumper rises along Ruben's side and lands on his head at its apex (105 of 105 tries land, from x 14.2 to 14.5, Ruben from 15.4 to 15.8, steering after 0 to 25 frames). Ruben must stand clear of M (x ≥ 15.4): leaning over it, he is bumped from below (33 misses of 70 at 15.2-15.3) |
| From Ruben's head to the upper floor | 5 | feet 2.9, apex 5.9 | 0.9 |
| A friend alone on the PC tower in J | 5 | apex 5.0 | **0.0, pinned**: it fails from a standing jump (0 of 462), but see "the tower's free corner" under Accepted |
| Ruben + a friend in M (2 players) | 5 | top feet 0.9, apex 3.9 | 1.1 short |
| 3-tower in M (3 players) | 5 | top feet 1.8 | cannot lean into J: the PC tower's top (2) is above its feet; it can only jump onto the PC tower (and from there, the line above) |
| 4-tower in M (4-5 players) | 5 | top feet 2.7, apex 5.7 | would reach: it stands on the sensor, the hatch is shut (its top bonks at 3.1) |
| Into the duct from M's floor, alone | 3 | apex 3.0 | **0.0, pinned**: it takes a leg-up. From a head (feet 0.9, apex 3.9) the jumper is held against the duct floor's side, slides in once its feet clear it, and the duct's ceiling (4) stops it: 119 of 126 tries (7 misses with a short jump steered late) |
| Corridor, 2 high | | no tower stands in it; a jump bonks at 1.1 | |
| Duct, 1 high | | no jump at all | |
| The duct's mouth to the upper floor (a friend walking off it and jumping in coyote time) | 5 | M's ceiling (5) caps the feet at 4.1 until it is in J, 1.75 cells away | 0 of 255 at 3-5 players (best feet 0.88 under the lip); at 2 players 3 of 255, all of them the "free corner" case below |
| Out of the pit under the rail (4-5) | 2 | a lone jump | 1.0 |
| Onto the PC tower in T from the lab floor (beat 3) | 2 | a jump capped at feet 2.1 by the lab's ceiling | **0.1, pinned**, but the climb does not depend on timing: the jumper rises against the tower's side and slides over as soon as its feet clear it (52 of 52 tries land, from x 46.0 to 47.2, four jump timings) |
| From the tower in T to the landing | 4 | apex 5 | 1.0 |
| A body in T below height 2 | | the cables (the hazard box is inset 0.1, and T is 1 wide: any body fully in T touches the strip) | death |
| The top of a 3-tower in column 47 stepping into T | feet 1.8 | its hazard box reaches 0.1 into the cables' rows | **0.1, exact geometry**: death |
| The same top jumping first | | it bonks on the lab's ceiling (0.3 of head room) before its left side can clear x 48 (0.7 to go), so it enters T with no speed left and falls into the cables | death |
| 2-tower standing in T, if there were no cables | 4 | top feet 0.9, apex 3.9 | 0.1 short (moot: the cables) |

Towers without the PC tower in beat 1 cannot happen: the tower fills the 2-high corridor in front
of the team, so it is pushed into M or J before anyone gets there; once in J it is in the way of
any human tower in M (see the table).

Beat 1's guard at 4-5 players: the floor of M is a sensor (plate "≥ 4") linked to an inverted
gate, a hatch, at the top of J: any 4-tower in M stands on it and shuts the hatch before its top
jumps. M is the only place a tower can stand (the corridor is 2 high), and the PC tower rests on
its rail in J, off the sensor. Whoever falls into J before the tower is there lands in the pit
under the rail and jumps out.

Beat 3's guard is geometry, not a rule: the only way up is from inside T, T is deadly below
height 2, and the lab, 3 high, holds no human tower whose top stands at 2 or more. Only the PC
tower stands in T (crates cover spikes).

### The rope in beat 1

The climber is Ruben's neighbour; its rope ties it to Ruben (on the tower, close) and, from 3
players, to the next friend. Measured along its path, round the shaft's lip:

- from the floor of M or the corridor the next friend is at least 5.2 from where the climber
  lands (4.8 from the lip's corner, plus the landing): the climber's jump is held at the hard
  stop, its feet 0.3 under the lip (0 of 20 tries, the friend from x 13.0 to 14.6);
- from the duct's mouth the path runs under M's ceiling and round the lip: 4.47 at rest, 4.66
  measured during the jump. Up from x 12.0 in the duct the climber gets up; from x 11.6 and deeper
  it does not.

So from 3 players someone must wait in the duct, at its mouth. That is the leg-up (a coop move on
its own: « Fais-moi la courte échelle ! »), and the sign at the duct says why. The others are then
hauled over the lip like everyone in beat 1 of La Rentrée; they come up through M and J, Ruben
first (M is 5 high, so whoever comes up M passes Ruben in J instead of getting stuck under M's
ceiling).

Why there is no room under the upper floor: a body hauled up J is pulled towards the lip's corner.
Any opening under the upper floor beside J (a room where Ruben could get behind the tower, for
instance) lets it swing in, and it sticks there, straddling the corner, its head against the
ceiling. J's right side is solid from the floor to the lip.

## Variants by team size

- 2 players: no sensor, hatch, rail or pit. Nobody needs the duct (the climber's only other
  neighbour is Ruben, on the tower).
- 3 players: same map as 2; the next friend waits in the duct.
- 4-5 players: beat 1's sensor ("≥ 4"), hatch, rail and pit exist. Nothing changes for the team
  when they go the right way: the climber leaves the sensor when it jumps onto Ruben, the one in
  the duct and the others in the corridor are off it.
- Beat 3 is the same at every size. The rack's need and plate w's need are W: the rack needs
  everyone; plate w needs the tower plus everyone but the one up (with a friend up, one other
  friend may step off).

## Ruben's active moments

- Beat 1: he leads the queue and pushes the PC tower (« il pousse comme deux »: at 2 players the
  friend alone could not), then is the base of the tower.
- Beat 2: he leads the queue; his 2 counts in the rack's W.
- Beat 3: he leads the queue into the lab, is first up, takes the key and opens the door. His
  weight is why the rule is "everyone else on the plate" while he is up.

He is never parked on a plate.

## Communication moments

- Beat 1: « Ruben, bouge pas, je te saute sur la tête ! » at the shaft; from 3 players, before
  that, « Toi, attends dans la gaine, sinon la corde me retient » and the leg-up.
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
  cables that matter later.

Beat 1 cannot kill: the pit under the rail (4-5) is 2 deep and a lone jump gets out of it.

## Shortcuts

Each shortcut in `coop04.solution.ts` plays the solution up to the beat it tries to skip, then a
phase whose name starts with `ATTEMPT`, then what would finish the level had the attempt worked.
All fail at 2, 3, 4 and 5 players, in their attempt phase (scratch script that runs every
shortcut at every team size on the committed level):

| Shortcut | What the bots try | Why it fails |
|---|---|---|
| a human tower under the upper floor | the PC tower pushed into J as in the solution; a human tower in M, Ruben at the base, up to 4 bodies (each one jumps on from M's other cell, just high enough); the top leans towards J and jumps for the upper floor | 2-3: the top's feet (0.9, 1.8) are under the PC tower's top, so it cannot lean into J; its jump lands on the PC tower. 4-5: the 4-tower stands on the sensor, the hatch is shut and the top bonks on it |
| pushing the rack with one player short | F0 stands back, the others push | W - 1 does not move a crate "W" |
| a human tower beside the exit shaft | the PC tower parked on plate w at x 44 (its weight counts); the front of the queue climbs over it and builds a tower in column 47, Ruben at the base (2 bodies at 2 players, 3 from 3), and straightens it up; the top jumps for the landing | the top dies in the cables. The cage is only reachable from the landing, and no 4-tower fits in the lab |
| a human tower in the exit shaft | the PC tower parked at x 46; Ruben climbs onto it and walks off into T to be the base of a tower there | Ruben dies in the cables |
| the key with a friend off the plate | Ruben up on the landing, his neighbour on the tower; F0 walks off plate w, then Ruben goes for the key | 4-5: the plate carries W - 1, the cage is shut. 2-3: the rope keeps F0 on the plate (at 2 players F0 is the one on the tower, at 3 its neighbour is), so the key is never taken with F0 off it |

Probes on the new beat 1 (scratch scripts, not committed; the numbers are in the tables above):
the jump onto Ruben's head, the leg-up into the duct, the climber held by a neighbour left on the
floor, every coyote frame off the duct's mouth, standing and buffered jumps from the PC tower, and
the pull of a haul into a room under the lip (the reason there is none).

### Accepted

- **The tower's free corner** (beat 1): Ruben is 0.8 wide on a 1-wide tower, so up to 0.2 of the
  tower's top is free beside him. A friend who lands there, its jump pressed just before landing,
  sometimes gets up onto the upper floor on its own: 70, 94 and 136 of 420 tries with Ruben at
  15.46, 15.5 and 15.6 (the jump pressed 1 to 11 frames before landing, 4 steering timings). The
  jump then takes off a hair above the tower's top (0.008 measured: a body counts as standing
  within 0.01 of a support) and its apex lands exactly on the lip. A standing jump from there never
  does (0 of 210), nor does any jump while Ruben is off the tower (0 of 600: his rope holds the
  jumper). It skips only the friend on Ruben's head: the tower is pushed and used, Ruben is on it.
  Capping M's right cell at 4 closes it (0 of 420) but makes the haul jam (a friend coming up M
  sticks under that ceiling while Ruben rises in J), so we kept M 5 high.
- The tower pushed one cell short, into M's right cell: Ruben on it and a friend on his head (or
  dropping from the duct's mouth onto it, the old « je te descends sur la tête ») lean into J and
  get up at 2-3 players. The tower is pushed and used. At 4-5 it stands on the sensor (tower,
  Ruben and the friend weigh 5) and shuts the hatch.
- Other ways into the duct: Ruben gives the leg-up, or one already in the duct hauls the next
  in over its mouth (the mantle over a wrapped lip). Any order works as long as the climber's
  other neighbour is at the mouth when the climber jumps.
- Any human tower standing on a PC tower: the tower is used.
- The friends pushing along behind Ruben (they add their strength): he is in front anyway.
- A friend first up at beat 3 (only possible if the queue was lined up that way): then one other
  friend may leave the plate. The rule on the sign, "everyone on the plate", always works.
- The door wedge on the cage gate (a body in the gateway keeps it open once open): only someone
  already on the landing, so only once the tower is in T.
- Walking into T before the tower: death, on purpose, visible.
- The pinned margins above.

## Deviations from the plan, and why

- **The friend jumps onto Ruben from M instead of dropping onto him from the duct.** The previous
  beat 1 had Ruben push the tower in a corridor under the duct while the friends waited in it.
  With a rope that wraps the scenery, Ruben's way (into the corridor, under the duct's floor) and
  his neighbour's (along the duct, over it) enclose that floor: their rope ran round it, 9 cells
  of rope for a 3-cell gap, and held Ruben back. Every layout that keeps the drop needs Ruben to
  get behind the tower from the shaft's side, in a room under the upper floor, and a hauled body
  sticks in any such room (see "The rope in beat 1"). Now the whole team walks the corridor
  together and the rope is never in the way; the friend's jump onto Ruben's head is a 0.1 margin
  that does not depend on timing.
- **The duct is where the climber's other neighbour waits** (3+), not the whole team: it is the
  one rope rule of the beat, and it brings a leg-up.
- **The guard against human towers at 4-5 players is a floor sensor, not overhangs.** From 4
  players a 4-tower reaches 5.7, close to the PC tower's stack (5.9), and towers lean: no ceiling
  tells them apart. Overhangs do their part (the 2-high corridor, M's 5-high ceiling, the PC tower
  in J) and the sensor + hatch close the rest.
- **Beat 3's two uses come at once, not in order.** The plan said "on the plate, then under the
  exit". In order, the natural mistake (pushing straight on) was unrecoverable, and every guard
  that kept the order honest needed another rule (a sensor, a hatch, "one at a time"). With the
  exit shaft as the plate's last cell, the tower's weight is still needed (without it the plate
  cannot carry W while anyone is up) and so is the step (nothing else stands in T).
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
- "A jump never climbs exactly 3" holds for standing jumps; a jump pressed just before landing can
  take off up to 0.01 above the support (the contact probe) and its apex then tops a ledge exactly
  3 higher (the tower's free corner above).
- A hauled body is pulled towards the corner its rope wraps: an opening under the lip on that side
  of a shaft lets it swing in, and it sticks straddling the corner, head against the ceiling.
- Weight-opened gates leak to jumpers (a plate holds 0.15 s, a gate never closes on a body).
  Beat 3's cage cannot be reached from the plate at all, so that leak does not matter there.
- The rope decides who can be where: at the exit the next one up waits on the tower or touching
  it; at the shaft of beat 1 the climber's other neighbour waits in the duct.
- Plate weight counts riders: whoever stands on the PC tower in T weighs on plate w.

## History

- First version: two crates per beat, the cage on the duct's roof, an exit sensor and hatch.
  The critic's second pass found a leaning wedge to the key at 4-5 players, an unrecoverable wrong
  order in beat 3 and pits that trapped for good; the redesign moved the cage onto the landing
  (only reachable from inside T), made the exit shaft the plate's last cell, replaced the pits
  and added the cables in T. Critic round 3: no new shortcut; the sign « Le suivant monte sur la
  tour » was added (Ruben's neighbour waiting on the lab floor holds him back from the key).
- Rope v2 (2026-11-27): the duct's floor was made of placed blocks `=` so that the rope passed
  through it. The owner rejected rope-transparent scenery (`=` now wraps like terrain), and beat 1
  was redesigned as above. The beat 3 bot tweak of that repair ("each climber walks to the foot
  of the parked tower before jumping onto it") is kept.
