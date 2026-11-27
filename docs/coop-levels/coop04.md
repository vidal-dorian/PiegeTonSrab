# coop04 · La Salle de TP

> « Il est où le bouton pour compiler ? »

Files: `packages/shared/src/coop/levels/coop04.ts` (the level),
`packages/shared/src/coop/levels/coop04.solution.ts` (bot solution and shortcuts).
Check: `npx tsx packages/shared/scripts/check-coop-level.ts coop04`.

Redesigned on 2026-11-27 for the wrapping rope (rope v2, placed blocks `=` wrapped like terrain):
beat 1 is new, beats 2 and 3 are unchanged. See "Why beat 1 changed" at the end. Fix round
(2026-11-27): from 3 players a trap over the shaft opens at a terminal in the duct, because the
rope alone did not make the duct needed (see "The rope in beat 1" and the History).

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

From 3 players the way up the shaft is shut by a trap that opens at a Claude terminal in the cable
duct (« Ouvre la trappe »; it stays open): someone needs a leg-up into the duct first. The rope
plays its part where it fits: in beat 1 it is measured round the shaft's lip, so the friend tied
to the climber waits up at the duct's mouth, not standing on the floor (the sign: « Corde courte ?
Attends dans la gaine »), and everyone else is hauled over that lip; in beat 3 the next one up
waits on the tower, within reach of the one on the landing.

One deadly spot: the bare cables at the foot of the exit shaft (beat 3). The ditch of beat 2 is
not one (see Deadly moments).

## Map

54 x 16. Floor tops: the corridor and M of beat 1 at row 14 ("height 0" there), the cable duct
at row 11 (height 3), the upper floor of beats 1-2 and the lab of beat 3 at row 9 (height 5 above
the corridor; "height 0" in beat 3 below), the exit landing at row 5 (height 4 above the lab).
Cells `1`-`3` are team-size variants (see the table).

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
          ###############6...........rrr.....|....t.......s#####  8
          ##########444..2################^^^########wwwwww#####  9
          #########..5....######################################  10
          #############...######################################  11
          #.......a.......######################################  12
          #S......a.......######################################  13
          #############113######################################  14
          ######################################################  15
```

| Char | Thing | Where | Need / link | Team sizes |
|---|---|---|---|---|
| `a` | crate, PC tower 1x2 | corridor, x 8 | 2; weighs 0 on plates | all |
| `1` → `p` | plate (floor sensor) | M's floor x 13-14 | ≥ 4, `plancher` | 4-5 (floor at 2-3) |
| `2` → `l` | gate, inverted (hatch) | top of the shaft J, x 15 row 9 | `plancher` | 4-5 (open at 2-3) |
| `3` → `q` | plate (floor sensor) | J's floor, x 15 row 14 | ≥ 4, `plancher` | 4-5 (floor at 2-3) |
| `4` | recess over the duct's mouth | x 10-12 row 9 (the duct is 2 high there) | room for the terminal | 3-5 (wall at 2) |
| `5` → `y` | Claude terminal « Ouvre la trappe » | in the recess, x 11 row 10 | ↓ sets `trappe` on for good (Ruben's ↓ sets it off) | 3-5 (empty at 2) |
| `6` → `h` | gate (the trap) | over J, x 15 row 8 | `trappe` | 3-5 (open at 2) |
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
over the corridor's end, its mouth at x 13; from 3 players 2 high at x 10-12, the recess with the
terminal); M = x 13-14 rows 9-13 (5 high: ceiling at height 5);
J = x 15 (the shaft, open from the floor up to the upper floor's room); the upper floor from x 16
at height 5, its lip at (16, 9); the lab = x 40-47 rows 6-8 (3 high: ceiling row 5), T = x 48 (the
exit shaft, 1 wide, open from row 1 to row 8), the landing = x 49-52, rows 1-4.

## Beats and the exact solution (bots)

Roles: R is Ruben, F0..F3 the friends in seat order; the chain is F0 - F1 - ... - last friend -
R. Spawn: x 1 to 5 in the corridor, Ruben rightmost, so he leads the queue (nobody overtakes
anybody in a 2-high corridor).

### 1. Le marchepied (x 1-26)

1. Ruben pushes the PC tower along the corridor, through M, into J, where it stops against the
   upper floor's wall (3.5-3.9 s; the friends walk behind him). From 4 players it stands on J's
   floor sensor, where it weighs nothing.
2. Ruben, in M, jumps onto the tower and stands on it under the shaft (x 15.5), clear of M.
3. From 3 players: his neighbour gives the next friend a leg up in M (it climbs onto the
   neighbour's head, jumps and slides into the duct, 1.0 s); it steps back to the terminal, opens
   the trap over J (0.3 s) and waits at the duct's mouth. The other friends wait in the corridor.
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
| 3 | 22.8 s | 10.1 s | 6.0 s | 6.9 s | 5.40 / 4.52 / 4.73 |
| 4 | 24.1 s | 11.1 s | 5.3 s | 7.7 s | 5.41 / 4.49 / 4.77 |
| 5 | 26.8 s | 13.1 s | 5.2 s | 8.5 s | 5.41 / 3.57 / 4.77 |

(Beat 2 includes the queue's reorder on the upper floor. The longest links of beat 1 are the
haul, at the hard stop. The previous beat 1 took 9.0-11.4 s; the terminal adds 0.2 s.)

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
| A friend alone on the PC tower in J (beside Ruben, or on the bare tower) | 5 | apex 5.0 | **0.0, pinned**: it fails from a standing jump (0 of 462 beside Ruben; the shortcut "a friend alone on the bare PC tower" at 3-5, best feet exactly at the lip), but see "the tower's free corner" under Accepted |
| Ruben + a friend in M (2 players) | 5 | top feet 0.9, apex 3.9 | 1.1 short |
| 3-tower in M (3 players) | 5 | top feet 1.8 | cannot lean into J: the PC tower's top (2) is above its feet; it can only jump onto the PC tower (and from there, the line above) |
| 4-tower in M (4-5 players) | 5 | top feet 2.7, apex 5.7 | would reach: it stands on the sensor, the hatch is shut (its top bonks at 3.1) |
| Human tower in J, the PC tower left one cell short (in M's right cell) | 5 | 2-3 players: top feet 0.9 / 1.8, apex 3.9 / 4.8; 4-5: 4 bodies, top feet 2.7 | 2-3: 1.1 / 0.2 short (the shortcut's best feet at 3 players: 0.2 under the lip). 4-5: they stand on J's sensor (weight 4 or more), the hatch is shut; with the sensor ignored the top gets up at 4 and 5. Three friends in J at 4-5 weigh 3 (hatch open) and are 0.2 short like at 3 |
| Ruben + 2 friends stacked on the PC tower in J (4-5) | 5 | top feet 3.8 | would reach, but they weigh 4 on J's sensor: the hatch is shut. Ruben and one friend (the solution) weigh 3 |
| Into the duct from M's floor, alone | 3 | apex 3.0 | **0.0, pinned**: it takes a leg-up (0 of 480 with a buffered jump, the recess included). From a head (feet 0.9, apex 3.9) the jumper is held against the duct floor's side and slides in once its feet clear it: 144 of 144 from the solution's pose at 3-5, re-measured with the recess (the same without it) |
| Into the duct from the bare PC tower in J | 1 | a jump from the tower's top (2) to the left | the tower is the leg-up: 11 of 72 tries at 3 players, with or without the recess (accepted: the duct is still used) |
| Corridor, 2 high | | no tower stands in it; a jump bonks at 1.1 | |
| Duct, 1 high | | no jump at all | |
| The duct's mouth to the upper floor (a friend walking off it and jumping in coyote time) | 5 | M's ceiling (5) caps the feet at 4.1 until it is in J, 1.75 cells away | 0 of 255 at 3-5 players (best feet 0.88 under the lip); at 2 players 3 of 255, all of them the "free corner" case below |
| Out of J onto the PC tower left one cell short (all sizes) | 2 | a lone jump from J's floor | 1.0 (the recovery "into J before the tower, and back out": 1.0 s at every size) |
| Onto the PC tower in T from the lab floor (beat 3) | 2 | a jump capped at feet 2.1 by the lab's ceiling | **0.1, pinned**, but the climb does not depend on timing: the jumper rises against the tower's side and slides over as soon as its feet clear it (52 of 52 tries land, from x 46.0 to 47.2, four jump timings) |
| From the tower in T to the landing | 4 | apex 5 | 1.0 |
| A body in T below height 2 | | the cables (the hazard box is inset 0.1, and T is 1 wide: any body fully in T touches the strip) | death |
| The top of a 3-tower in column 47 stepping into T | feet 1.8 | its hazard box reaches 0.1 into the cables' rows | **0.1, exact geometry**: death |
| The same top jumping first | | it bonks on the lab's ceiling (0.3 of head room) before its left side can clear x 48 (0.7 to go), so it enters T with no speed left and falls into the cables | death |
| 2-tower standing in T, if there were no cables | 4 | top feet 0.9, apex 3.9 | 0.1 short (moot: the cables) |

Towers without the PC tower in beat 1 cannot happen: the tower fills the 2-high corridor in front
of the team, so it is pushed into M or J before anyone gets there; once in J it is in the way of
any human tower in M (see the table).

Beat 1's guard at 4-5 players: the floors of M and of J are sensors (plates "≥ 4", one each)
linked to an inverted gate, a hatch, at the top of J: any 4-tower in M or in J stands on one and
shuts the hatch before its top jumps. M and J are the only places a tower can stand (the corridor
is 2 high), and J can only be reached before the PC tower when it is left one cell short. The PC
tower weighs nothing on the sensors, so Ruben on it and a friend on his head weigh 3: the hatch
stays open for the solution. J has no hole: whoever gets into J before the tower stands on its
floor, M's height, and jumps back out onto the tower (2 up), and a tower pushed on into J stops
against a body standing there instead of covering it.

Beat 1's guard from 3 players is the trap h: shut until someone in the duct uses the terminal,
and the duct takes a leg-up (a friend's head, or the PC tower). The rope's own rule (the
climber's other neighbour within reach) does not make the duct needed on its own: see below.

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

That holds for a neighbour standing still. A neighbour in the air is a weak anchor (the hard stop
splits the excess between two bodies in the air instead of holding the climber), so a neighbour
that jumps with the climber, from M's floor or from a friend's head at the corridor's mouth (4-5),
gives it the rope it needs: before the fix round 31 of 70 tries at 3 players (on the floor, x 12
to 14.45, the neighbour jumping 10 steps before to 20 after the climber), and at 4 and 5 players
31 of 70 plus 56 and 59 of 105 on a head (the base at x 11.95-13.45, the rider leaning 0-0.7);
every one of them then finished the level. The rope cannot be made to tell these apart: the
climber jumps onto Ruben's head from M's floor, at most about 3 below and 1 beside his head, and
from his head up to a lip at most 3 higher, so M's floor is always within about 0.3 of the hard
stop from the landing. So the trap: from 3 players nobody gets up the shaft before someone has
been into the duct (that is the leg-up, a coop move on its own: « Fais-moi la courte échelle ! »)
and used the terminal there. The same sweep now gets nobody up (0 of 70 at 3, 0 of 175 at 4 and
at 5, `coop04Duct.test.ts`); with the trap forced open it does again. The sign at the duct still
tells the standing rule.

The others are then hauled over the lip like everyone in beat 1 of La Rentrée; they come up
through M and J, Ruben first (M is 5 high, so whoever comes up M passes Ruben in J instead of
getting stuck under M's ceiling). The trap latches open, so it never shuts on the haul.

Why there is no room under the upper floor: a body hauled up J is pulled towards the lip's corner.
Any opening under the upper floor beside J (a room where Ruben could get behind the tower, for
instance) lets it swing in, and it sticks there, straddling the corner, its head against the
ceiling. J's right side is solid from the floor to the lip.

## Variants by team size

- 2 players: no sensors, hatch, trap or terminal (the duct is 1 high all along). Nobody needs the
  duct (the climber's only other neighbour is Ruben, on the tower).
- 3 players: the trap over J, the terminal and its recess exist; the next friend opens the trap
  and waits in the duct.
- 4-5 players: as at 3, and beat 1's sensors ("≥ 4", M's floor and J's floor) and hatch exist.
  Nothing changes for the team when they go the right way: on J's sensor Ruben and the climber on
  his head weigh 3 (the PC tower weighs nothing on it), the climber leaves M's sensor when it jumps
  onto Ruben, the one in the duct and the others in the corridor are off both. (While Ruben pushes the tower
  through M with friends behind him, M's sensor may carry 4 for a moment and shut the hatch: it
  reopens 0.15 s after, long before anyone climbs.)
- Beat 3 is the same at every size. The rack's need and plate w's need are W: the rack needs
  everyone; plate w needs the tower plus everyone but the one up (with a friend up, one other
  friend may step off).

## Ruben's active moments

- Beat 1: he leads the queue and pushes the PC tower (« il pousse comme deux »: at 2 players the
  friend alone could not), then is the base of the tower (in the intended route; the accepted
  bare-tower cases skip that).
- Beat 2: he leads the queue; his 2 counts in the rack's W.
- Beat 3: he leads the queue into the lab, is first up, takes the key and opens the door. His
  weight is why the rule is "everyone else on the plate" while he is up.

He is never parked on a plate.

## Communication moments

- Beat 1: « Ruben, bouge pas, je te saute sur la tête ! » at the shaft; from 3 players, before
  that, the leg-up, « Ouvre la trappe sur la console ! » and « Reste dans la gaine, sinon la corde
  me retient ».
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

Beat 1 cannot kill and has no hole: J's floor is M's floor at every size, and whoever gets into it
before the tower jumps back out onto the tower (see the recovery below).

## Shortcuts

Each shortcut in `coop04.solution.ts` plays the solution up to the beat it tries to skip, then a
phase whose name starts with `ATTEMPT`, then what would finish the level had the attempt worked.
All fail at 2, 3, 4 and 5 players, in their attempt phase (scratch script that runs every
shortcut at every team size on the committed level). The shortcuts of beat 1 that test another
guard than the trap ("a human tower under the upper floor", "a human tower in J beside the tower
left one cell short") open the trap first, as if a friend had used the terminal and come back
down, which only makes them easier; "a friend alone on the bare PC tower" opens it for real.
`coop04Duct.test.ts` plays the two "duct skipped" attempts over a sweep (2 players: 9 tries;
3: 70; 4 and 5: 175 each, the neighbour on the floor at x 12-14.45 or on a head with the base at
x 11.95-13.45, leaning 0-0.7, jumping from 10 steps before to 20 after the climber or not at all):
every one fails in its attempt.

| Shortcut | What the bots try | Why it fails |
|---|---|---|
| a human tower under the upper floor | the PC tower pushed into J as in the solution; a human tower in M, Ruben at the base, up to 4 bodies (each one jumps on from M's other cell, just high enough); the top leans towards J and jumps for the upper floor | 2-3: the top's feet (0.9, 1.8) are under the PC tower's top, so it cannot lean into J; its jump lands on the PC tower. 4-5: the 4-tower stands on the sensor, the hatch is shut and the top bonks on it |
| pushing the rack with one player short | F0 stands back, the others push | W - 1 does not move a crate "W" |
| a human tower beside the exit shaft | the PC tower parked on plate w at x 44 (its weight counts); the front of the queue climbs over it and builds a tower in column 47, Ruben at the base (2 bodies at 2 players, 3 from 3), and straightens it up; the top jumps for the landing | the top dies in the cables. The cage is only reachable from the landing, and no 4-tower fits in the lab |
| a human tower in the exit shaft | the PC tower parked at x 46; Ruben climbs onto it and walks off into T to be the base of a tower there | Ruben dies in the cables |
| the key with a friend off the plate | Ruben up on the landing, his neighbour on the tower; F0 walks off plate w, then Ruben goes for the key | 4-5: the plate carries W - 1, the cage is shut. 2-3: the rope keeps F0 on the plate (at 2 players F0 is the one on the tower, at 3 its neighbour is), so the key is never taken with F0 off it |
| a human tower in J beside the tower left one cell short | the PC tower stopped in M's right cell; Ruben hops over it into J, then up to 3 friends, each from the PC tower onto the head below (at 5 players F0 waits on the PC tower, close to the top); the top jumps for the upper floor | 2-3: too short (top feet 0.9 / 1.8). 4-5: the 4 bodies weigh 4 or more on J's sensor, the hatch is shut (with the sensor ignored, the top gets up at 4 and 5) |
| a friend alone on the bare PC tower | Ruben pushes the tower into J and gets back off it; F0 jumps onto the bare tower, its other neighbour F1 waiting at the duct's mouth from 3 players (at 4, F2 deeper in the duct; at 5, F3 gives the leg-ups and stands on Ruben's head in M's right cell); the one in the duct nearest the terminal opens the trap; standing still, F0 jumps for the upper floor | 3-5: the apex is exactly the lip's height (best feet 9.000, the lip at 9). 2: Ruben, on the floor, holds F0 by the rope (best feet 10.26) |
| the duct skipped: its rope neighbour jumps with the climber from M's floor | the solution without the leg-up: the climber's other neighbour stands in M's left cell and jumps with the climber (the same step); nobody uses the terminal. At 2 players (no such neighbour, no trap): Ruben, off the PC tower, is the base in M and F0 on his head jumps for the upper floor | 3-5: the trap is shut. 2: too short (feet 0.9, apex 3.9). With the trap forced open it wins at 3-5 (21.5 / 22.5 / 25.3 s) |
| the duct skipped: its rope neighbour on a friend's head at the corridor's mouth | as above, but from 4 players the neighbour rides the next friend's head (the base at x 12.75, the rider leaning to 13.45) and they jump together; at 3, on the floor at x 12.75 | 3-5: the trap is shut. 2: as above. With the trap forced open it wins at 4-5 (23.7 / 26.5 s) |

Recoveries (`recoveries` in `coop04.solution.ts`, played to the end at 2-5 players by the tests):

| Recovery | The mistake and the way back | Result |
|---|---|---|
| into J before the tower, and back out | Ruben stops the PC tower one cell short (in M's right cell) and hops over it into J; he jumps back onto the tower (2 up from J's floor) and down into M, pushes the tower on into J, and the solution goes on | finishes at 2, 3, 4 and 5 players (22.7, 24.6, 25.8, 28.6 s); getting out takes 1.0 s |

Probes on the new beat 1 (scratch scripts, not committed; the numbers are in the tables above):
the jump onto Ruben's head, the leg-up into the duct, the climber held by a neighbour left on the
floor, every coyote frame off the duct's mouth, standing and buffered jumps from the PC tower, and
the pull of a haul into a room under the lip (the reason there is none).

### Accepted

- **The tower's free corner, and the bare tower** (beat 1): a friend who lands on the PC tower in
  J, its jump pressed again just before landing (inside the 0.1 s jump buffer), sometimes gets up
  onto the upper floor on its own. The jump then takes off a hair above the tower's top (0.008
  measured: a body counts as standing within 0.01 of a support) and its apex lands exactly on the
  lip. A standing jump from the tower never does (0 of 210 beside Ruben; the shortcut "a friend
  alone on the bare PC tower" at 3-5). Two cases:
  - beside Ruben (Ruben is 0.8 wide on a 1-wide tower, up to 0.2 of its top is free): 70, 94 and
    136 of 420 tries with Ruben at 15.46, 15.5 and 15.6 (re-pressed 1 to 11 frames before landing,
    4 steering timings). Ruben is still the one on the tower.
  - on the bare tower, Ruben off it (critic round 4): a friend whose rope neighbours are not Ruben
    can do it, as long as its other neighbour waits at the duct's mouth: F0 at 3 and 4 players (52
    and 48 of 288 tries), and at 5 (56 of 288, F3 and Ruben out of the way in M's right cell). It
    depends on the first jump's length (it sets the landing's phase: 3 of 12 hold times win, then
    re-pressing 1 to 7 frames before landing wins, 9-11 rarely). Ruben's neighbour cannot do it while Ruben
    is off the tower (0 of 600: his rope holds the jumper); at 2 players F0's only neighbour is
    Ruben, so only with Ruben in the duct (untested: Ruben cannot ride a friend's head, so only
    a haul or the bare PC tower gets him in).
    Then Ruben is not the base: he pushes the tower (still « il pousse comme deux ») and is hauled
    up like the others; the duct and its leg-up are still needed from 3 players.
  Both skip the jump onto Ruben's head; the tower is pushed and used. We keep them: the only fix is
  a lip more than 3.3 above the tower's top and less than 2.6 above Ruben's head (5.3-5.6 above M),
  which the cell grid cannot make; a gate opened by Ruben's weight on the tower would shut on the
  haul once Ruben is hauled up first. Capping M's right cell at 4 closes the case beside Ruben (0
  of 420) but not the bare tower, and makes the haul jam (a friend coming up M sticks under that
  ceiling while Ruben rises in J), so M stays 5 high.
  - Ruben himself on the bare tower (integration skeptic, 2026-11-27): with his neighbour waiting
    at the duct's mouth after a leg-up (from 3 players, after opening the trap), Ruben jumps from
    M onto the bare tower and re-presses jump just before landing: he gets up in 60 of 288 tries
    at 2, 3, 4 and 5 players alike (best feet 9.013), then hauls everyone: the level finishes in
    18.8 / 23.0 / 25.7 / 28.3 s. At 2 players F0 gets into the duct from Ruben's head (Ruben in
    M's left cell, F0 climbing on from the corridor's end; fix round). With his neighbour on M's
    floor or in the corridor: 0 of 288. Same cause and same reason to keep it as the bare-tower
    case; the jump onto Ruben's head is then skipped by Ruben, and he is not the base. The duct
    and its leg-up are used all the same.
- **Closed in the fix round: the duct skipped.** Reported at 4-5 players (the climber's other
  neighbour on a friend's head at the corridor's mouth, jumping with the climber: 26 of 48 tries
  at 4, 78 of 144 at 5); the "0 of 81" from M's floor was a probe counting every run as a miss
  (its runs end after the attempt, and it took that ending for a failure). Re-measured, a
  neighbour jumping with the climber from M's floor works at 3, 4 and 5 players too. Closed by the
  trap (numbers in "The rope in beat 1"; shortcuts "the duct skipped: ..." and the sweep in
  `coop04Duct.test.ts`).
- Once the trap is open, the climber's other neighbour may still give it the rope from outside
  the duct by jumping with it (from M's floor, or a friend's head from 4 players): the duct and its
  leg-up have been used, and « 3, 2, 1, saute ! » is a coop move too.
- Ruben at the terminal: his ↓ sets the trap's link off (Ruben's prompts do the opposite). He
  cannot ride a friend's head into the duct (only the PC tower or a haul could get him there, not
  probed); a friend at the terminal reopens it.
- The tower pushed one cell short, into M's right cell: Ruben on it and a friend on his head (or
  dropping from the duct's mouth onto it, the old « je te descends sur la tête ») lean into J and
  get up at 2-3 players (from 3 players once the trap is open). The tower is pushed and used. At 4-5 it stands on M's sensor, where it
  weighs nothing: Ruben and the friend weigh 3, the hatch stays open (a fourth body in M shuts it),
  so this is now open at every size (before critic round 4 the tower weighed 2 and shut the hatch
  at 4-5).
- Other ways into the duct: Ruben gives the leg-up, the bare PC tower in J (11 of 72 tries), or
  one already in the duct hauls the next in over its mouth (the mantle over a wrapped lip). Any
  order works as long as someone has used the terminal and the climber's other neighbour is at
  the mouth (or jumps with it) when the climber jumps.
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
- **The duct is enforced by a terminal and a trap, not by the rope alone** (fix round). The rope
  rule holds only for a neighbour standing still (see "The rope in beat 1"). Tried first: plates
  in the duct opening a trap over J (with a plate on the upper floor to keep it open for the
  haul) closed everything (0 of 252 floor jumps, 0 of 546 head riders), but a plate is a collider
  and the rope goes through it: at the duct's mouth it cut the rope's corner and changed the
  jump past that corner; a plate kept off the mouth cell leaves a window of 0.4 cell where the
  one waiting is both on it and within reach. A terminal is not solid and latches, so neither
  the rope nor the haul sees it. It had to sit within rope reach of the duct's mouth (a room at
  the duct's far end is 6 cells of rope away from the one giving the leg-up), hence the recess
  over the mouth, where its screen fits.
- **Signs moved for the name labels** (fix round): « Ruben pousse comme deux » sat in the
  corridor's top row, on the players' name labels at the spawn; it is now under the corridor's
  floor. « Gaine technique » moved over the recess (the terminal's screen fills it) and « Corde
  courte ? » left, clear of the terminal's link badge.
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
  it; at the shaft of beat 1 the climber's other neighbour waits in the duct. But a body in the
  air is a weak anchor: a neighbour jumping with the climber gives it slack, so a rope rule
  never holds against a jump from a place with headroom.
- The rope goes through every co-op thing, plates included: a plate at a corner the rope wraps
  cuts that corner. A terminal is not solid and its ↓ latches its link.
- Plate weight counts riders: whoever stands on the PC tower in T weighs on plate w.
- A crate's weight on plates is its own setting (`weight`, default its need): beat 1's PC tower
  weighs 0, so a sensor under it counts only who stands on it. That is how one floor sensor tells
  Ruben on the tower (2, plus 1 on his head) from a human tower of 4.
- A body standing in a crate's way stops it: a crate is never pushed over someone standing in the
  cell it is pushed into.

## History

- First version: two crates per beat, the cage on the duct's roof, an exit sensor and hatch.
  The critic's second pass found a leaning wedge to the key at 4-5 players, an unrecoverable wrong
  order in beat 3 and pits that trapped for good; the redesign moved the cage onto the landing
  (only reachable from inside T), made the exit shaft the plate's last cell, replaced the pits
  and added the cables in T. Critic round 3: no new shortcut; the sign « Le suivant monte sur la
  tour » was added (Ruben's neighbour waiting on the lab floor holds him back from the key).
- Critic round 4 (2026-11-27): at 4-5 players J's floor was a crate stop (a rail) over a pit,
  3 deep for bodies (not 2 as written), so whoever got into J before the tower (the tower left one
  cell short) could not get out, and pushing the tower on into J sealed them under it. J's floor
  is now a second floor sensor (`q`, "≥ 4") with M's height, the PC tower weighs nothing on the
  sensors, and the recovery is a test. The same critic found the buffered landing jump on the
  bare tower (a friend not tied to Ruben): accepted, the Accepted entry now says so with its
  numbers. New shortcuts: "a human tower in J beside the tower left one cell short", "a friend
  alone on the bare PC tower".
- Rope v2 (2026-11-27): the duct's floor was made of placed blocks `=` so that the rope passed
  through it. The owner rejected rope-transparent scenery (`=` now wraps like terrain), and beat 1
  was redesigned as above. The beat 3 bot tweak of that repair ("each climber walks to the foot
  of the parked tower before jumping onto it") is kept.
- Fix round (2026-11-27): the skeptic's "duct skipped at 4-5 players" was real and wider (a
  synced jump from M's floor at 3-5 too). Added the trap over J and the terminal in a recess over
  the duct's mouth (3-5 players), two "duct skipped" shortcuts and `coop04Duct.test.ts`; Ruben's
  solo climb measured at 2 players (60 of 288); signs moved off the name labels.
