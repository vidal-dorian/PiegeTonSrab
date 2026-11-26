# coop03 · L'Amphi

> « Je me mets au fond, personne me verra. »

Files: `packages/shared/src/coop/levels/coop03.ts` (the level),
`packages/shared/src/coop/levels/coop03.solution.ts` (bot solution and shortcuts).
Check: `npx tsx packages/shared/scripts/check-coop-level.ts coop03`.

## Idea

« Ruben pèse deux… mais l'ordre compte. » Every gate is a plate-and-gate pair, and the level is
about *who* stands on *which* plate, and *when*:

- Beat 1 shows the relay with plates "1": anyone holds, on either side.
- Beat 2 changes the number: the seat needs 2 and fits one body, so only Ruben opens it, at every
  team size. He is left behind, and a friend has to let him through.
- Beat 3 turns it around twice. The bench "W-1" needs *everyone but one friend*, so exactly one
  friend goes down for the key. Then the plate that frees the team, "= 1", is down in the basement
  with him: only a lone friend can hold it, never Ruben. And it shuts the key's gate: if he frees
  the team before taking the key, the team walks out and the rope pulls him away from the key.
- Beat 4 is the outro: down the tiers of the lecture hall to the door on the stage.

No death is possible (no spikes, saws, pits or `~`). Gates lock people in, never kill, and every
lock can be undone (see "No soft-lock").

## Map

84 x 19: the back corridor (floor top 9, ceiling 4, 5 rows high), then the lecture hall.

```
          11111111112222222222333333333344444444445555555555666666666677777777778888
012345678901234567890123456789012345678901234567890123456789012345678901234567890123
####################################################################################  0
####################################################################################  1
####################################################################################  2
####################################################################################  3
#.............g............h..................x....................................#  4
#.............g............h..................x....................................#  5
#.............g............h..................x....................................#  6
#.............g..........##h..................x....................................#  7
#.S...........g...........#h..................x....................................#  8
#########aa####bbb######kc##ddd####ww##ppppp#####e###rrr#..........................#  9
#################################Kn...............#######..........................# 10
#############################################f###############......................# 11
#############################################################......................# 12
#################################################################................D.# 13
#################################################################................D.# 14
#####################################################################........####### 15
#####################################################################........####### 16
#################################################################################### 17
#################################################################################### 18
```

| Char | Thing | Where | Need / link |
|---|---|---|---|
| `a` | plate | floor, x 9-10 | 1, `relais` |
| `g` | gate | x 14, floor to ceiling | `relais` |
| `b` | plate | floor, x 15-17 | 1, `relais` |
| `k` | still platform (a mover on link `marche`, which nothing drives) | floor, x 24: the seat's step | |
| `c` | plate: the seat | floor of a 1 x 1 pocket at x 25, under a 2-high block (x 25-26) | 2, `place` |
| `h` | gate | x 27, floor to ceiling, against the block | `place` |
| `d` | plate | floor, x 28-30 | 1, `place` |
| `w` | trapdoor (horizontal gate) | floor, x 35-36 | `controle` |
| `p` | plate: the bench | floor, x 39-43, two solid cells right of the trapdoor | W-1, `controle` |
| `K`, `n` | the key and its gate (inverted) | basement, x 33 and 34 | `libre` |
| `f` | plate | basement floor, x 45, just inside gate x | **= 1**, `libre` |
| `x` | gate | x 46, floor to ceiling | `libre` |
| `e` | trapdoor: the basement's way out | landing floor, x 49 | `sortie` |
| `r` | plate | landing, x 53-55 | 1, `sortie` |
| `D` | door | the stage (floor 15), x 81 | |

The basement (row 10, x 33-49, one cell high; two under each trapdoor) opens only through w and e.

### Plate numbers by team size

W = players + 1 (friends 1, Ruben 2).

| Plate | 2 players | 3 | 4 | 5 |
|---|---|---|---|---|
| a, b, d, r | 1 | 1 | 1 | 1 |
| c (one body fits) | 2: Ruben only | Ruben only | Ruben only | Ruben only |
| p (W-1) | 2: Ruben alone | 3: Ruben + 1 friend | 4: Ruben + 2 friends | 5: Ruben + 3 friends |
| f (= 1, in the basement) | one friend alone | same | same | same |

"W-1" always leaves exactly one player free, and that player is a friend: without Ruben the
friends weigh W-2 at most.

## Beats and the exact solution (bots)

Roles: R is Ruben, F0..F3 the friends in seat order. The spawn order, left to right, is F0..F3
then R, so Ruben walks in front, and his chain neighbour is the last friend. F0 is the free end of
the chain: the bots make him the one who goes down.

### 1. Relais (x 9-17)

Ruben stops against gate g (13.5). The friend behind him stands on plate a, so g opens. Ruben goes
through onto b (17.4), b holds g, and the friends come through. Plate a is 3 cells short of g:
someone stepping off it has 0.15 s, which is 1.05 cells at full run, and needs 2.2. So nobody opens
it and runs through alone.

### 2. La place de Ruben (x 23-30)

The seat is a 1 x 1 pocket at floor level whose floor is plate c, under a 2-high block. One body
fits, nobody can stand on it, and there is no lower ground within a rope's length that a friend
could hang from. A friend who walks in reads "1/2". A second friend can only lean in from the step
k, and the step holds him: a body that stands across two colliders counts on the one created first,
and k comes before c in reading order. Ruben walks in (2/2): h opens.

1. Ruben's neighbour jumps over the block, drops through h and stands on d (28.4).
2. From 3 players, the next friend waits on the block's right end (26.45); the others wait before
   the step.
3. Ruben comes out onto the step (24.4) and jumps onto the block (25.4). At 2 players he drops
   into h. From 3 players he hops over the friend on the block into h.
4. The others cross the block one after the other. The one on the block waits for the next one to
   jump on before dropping into h; otherwise the rope would drag the next one into the seat. The
   line keeps d pressed until the last one is through.

Ruben cannot open h and run: out of the seat he must go back over the block.

### 3. Le contrôle surprise (x 33-56)

**The bench.** Everybody but F0 sits on the bench p. The trapdoor w, two cells left of it, opens
under F0.

- 2 players: F0 is in front of Ruben (beat 2 left Ruben behind him). Ruben waits on the gap, F0
  hops back over him onto the trapdoor, then Ruben sits.
- 3+ players: F0 is at the back of the line and waits on the trapdoor. It opens when the last of
  the others sits down.

**The key.** Once F0 is down the bench is free. The others come left over the closed trapdoor
(the rope keeps F0's neighbour within reach), and F0 walks left through the open gate n and takes
the key (33.5).

**The way out.**

1. The team queues at gate x. F0 walks right under the benches onto plate f (= 1): x opens, and n
   shuts behind him.
2. The team goes out onto the landing. F0 walks on under the landing's trapdoor e (49.5).
3. The front one stands on r: e opens and F0 jumps out. At 5 players he lands left of e, next to
   his neighbour; otherwise right of it.

The bots then pass the key forward along the line.

**Why the order bites.** Plate f is on F0's way through the basement, and it frees the team. If
F0 stands on it before he has the key:

- n shuts in front of the key.
- The team sees x open and walks out.
- From then on the rope (4.5) holds F0 within a link of his neighbour outside: the key, 12 cells
  back at the far end of the basement, is out of reach.

To recover, someone outside must come back in, which needs F0 on f again, and then the team must
follow F0 back towards the key and out again. At 2 players that is a full extra trip. Taking the
key first costs nothing. Ruben cannot help with f: he can only reach the basement by falling
through e, and his 2 is not "= 1" (nor are two friends).

### 4. Les gradins (x 50-82)

Three tiers of 2 down to the front floor (17), then the stage, a step of 2 up, and the door.

### Bot times (checker)

| Players | Total |
|---|---|
| 2 | 17.6 s |
| 3 | 18.6 s |
| 4 | 20.2 s |
| 5 | 22.8 s |

## Heights and margins

| Spot | Height | Who | Margin |
|---|---|---|---|
| The block over the seat | 2 | a lone jump (apex 3.0) | 1.0 |
| Ruben hopping over the friend on the block | the friend's head is 2.9 above the floor | Ruben jumps from the block top (feet 7), apex at feet 4.9 under the ceiling | 1.2 over the friend's head |
| Out of the basement (both trapdoors) | 2 | a lone jump | 1.0 |
| Over Ruben (2 players, beat 3) | 0.9 | a lone jump | 2.1 |
| The stage | 2 | a lone jump | 1.0 |
| The seat | 1 high above c | one body (0.9) | nobody on its head |
| Corridor, gates g, h, x | 5 high, gates and the walls above them reach the ceiling | | the control run needed two cells cut off g before a 2-tower got over |

Rope reach (4.5), checked by the bots at every team size:

| Moment | Distance |
|---|---|
| Ruben in the seat to his neighbour on d | 2.8 |
| Ruben on the step / on the block to that neighbour | 4.0 / 4.3 |
| F0 under the trapdoor to his neighbour at the bench's left end | 3.6 to 4.3 |
| F0 at the key to his neighbour on the closed trapdoor | at most 3.9 |
| F0 on f to the back of the queue at x | at most 3.1 |
| F0 under e to his neighbour outside | at most 4.4 |

## Variants by team size

No cell variants: the numbers scale through W-1. At 2 players beat 3 starts with the free friend
hopping back over Ruben, and Ruben does every job outside the basement alone (bench, then r). From
3 players the free friend is already at the back of the line, and the rest of the team is free to
send someone onto r.

## Ruben's active moments

- **The seat c:** only he opens h, at every team size. He sits for a few seconds while his
  neighbour goes through.
- **The bench p:** W-1 cannot be reached without him. He sits only until the free friend has
  dropped in (about 2 s for the bots).

## Communication moments

- **The bench:** « Tout le monde assis, sauf un ! », then at 2 players « Ruben, bouge pas, je te
  saute par-dessus ! ».
- **In the basement:** « Attendez, j'ai pas la clé ! » (the plate that opens the exit is on the
  way).
- **At the end:** « Quelqu'un sur la plaque, que je sorte ! ».

## Shortcuts

Each shortcut in `coop03.solution.ts` plays the solution up to the beat it tries to skip, then a
phase named `ATTEMPT` that must time out. The campaign test (`coopLevels.test.ts`) checks that
every shortcut fails in that phase at 2, 3, 4 and 5 players.

| Shortcut | What the bots try | Why it fails |
|---|---|---|
| a friend alone on Ruben's seat | Ruben waits on the block, his neighbour sits in the seat (1/2), Ruben pushes into h | c needs 2 |
| two friends on Ruben's seat | one friend in the seat, the next one leaning in from the step (3+) | the step k holds the second one: he weighs nothing on c |
| a friend hanging from the one in the seat | a friend in the seat, another body hops at the end of the rope; Ruben pushes into h | the seat is at floor level: nobody can be lower than it, so nobody hangs from it |
| Ruben walks off the bench into the trapdoor | the whole team on the bench with Ruben at its left end (the friends behind him hop over him first); Ruben walks left | two solid cells: the trapdoor shuts 0.15 s after he leaves the bench, long before he reaches it |
| Ruben jumps off the bench into the trapdoor | the same, Ruben jumping | same |
| Ruben as the free one | all the friends on the bench, Ruben on the trapdoor | without Ruben the bench is short |
| freeing the others before taking the key | F0 drops in and goes straight to f (n shuts), the team goes out, F0 goes back for the key | the rope holds F0 within a link of the team outside |
| a tower over gate g | nobody on a; Ruben's neighbour climbs on Ruben at g and jumps | g reaches the ceiling |

**Control experiment.** Script not committed: `coop03-control.ts` in the session scratchpad. With
the level weakened, the same bots get through their attempt phase at 2-5 players, so it is the
level that stops them, not the bots. The weakened levels:

- the seat needing 1;
- the step k turned into plain floor (3-5 players; at 2 players there is no second friend);
- the trapdoor moved next to the bench;
- the bench needing W-2;
- two cells cut off the top of g.

### Accepted

- **Trains:** from 3 players, a tight line walking over plate a keeps plate a or gate g's box
  occupied all the way through, so beat 1 passes without a deliberate handover.
- **Door wedge:** a gate never closes on a body. A player standing in the doorway of g, h or x keeps
  it open for the one behind, which makes the relay plates b and d optional. The first openings
  still need a (anyone), c (Ruben alone) and f (one friend, in the basement).
- **Someone walking over e while r is pressed** falls into the basement. He jumps back out while r
  is held (2 cells).

## No soft-lock

Every way to be locked in has a way out:

- **The free friend below with the bench empty:** he stands on f, which opens x. Someone goes out
  onto r, and he leaves by e.
- **Ruben** can never reach the trapdoor w: two solid cells, see the shortcuts. He can fall through
  e only while someone else holds r, and then he jumps back out.
- **Ruben and a friend on opposite sides of x:** x opens from inside the basement only (f), and r
  lets the one in the basement out through e. Getting one person outside and the other inside the
  pen, with nobody below, needs x to be open with nobody on f: that only happens with a door wedge,
  and it can be undone by the same wedge.

## Deviations from the plan, and why

- **The key's gate shuts only while f is pressed.** The engine has no latching plates, and a level
  with no death should not need a restart. The order still bites, through the rope (see "Why the
  order bites").
- **The "= 1" plate is in the basement**, on the free friend's way. It is the plate that frees the
  team, so freeing and taking the key compete for the only free player. Ruben, too heavy for it,
  cannot take over.
- **The basement has a second exit, e (opened from outside by r).** Otherwise the one holding f
  could never leave the basement once the team was out. Getting outside needs f, which is only
  reachable through the bench, so e skips nothing.
- **The seat's step is a still platform** (a mover on a link that nothing drives). This is the only
  way I found to stop a second friend leaning into a 1-cell plate from counting on it: two
  0.8-wide bodies always both overlap a 1-cell plate, and a body counts on any plate it overlaps.
  The step is read before the seat, so the leaning friend stands on the step.
- **The tiers go down to the stage** (the corridor is the back of the hall, « au fond »). It is an
  outro, not a beat.
- **f and r are more than one link from gates n and e.** n is the inverted gate of f's link, and
  nobody passes it while f is held. r opens e for the one below, who is within a link of r when he
  uses it.

## Engine notes

- A body standing across two colliders is supported by the one created first (things are created
  in reading order), and an open gate has no collider. Ruben standing across the bench and the
  *open* trapdoor counts on the bench. An earlier version of these notes said the opposite, and it
  was wrong. The seat's step relies on this rule.
- A body in the air under a taut rope "hangs" from a higher neighbour and weighs on whatever that
  neighbour stands on. The seat is at floor level, so nobody can hang below it, and Ruben can no
  longer get under the bench's trapdoor at all.
- "A gate never closes on a body" makes every relay plate optional (the door wedge).
