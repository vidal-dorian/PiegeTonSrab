# coop03 · L'Amphi

> « Je me mets au fond, personne me verra. »

Files: `packages/shared/src/coop/levels/coop03.ts` (the level),
`packages/shared/src/coop/levels/coop03.solution.ts` (bot solution and shortcuts).
Check: `npx tsx packages/shared/scripts/check-coop-level.ts coop03`.

Redesigned on 2026-11-27 for rope v2, now that the rope wraps every static solid cell (`=` blocks
included). The previous version relied on a rope that went through the scenery: over the block on
Ruben's seat, and through the corridor floor over the basement. Making those cells rope-transparent
was rejected. This version keeps the idea, the beats and the moments, and builds them so that
wherever the rope must go between two players, it either goes through the beat's own things or
wraps the scenery on purpose (see "The rope in this level").

Fixed the same day after a critic's report: an idle friend on the bench could be dragged to its
end by the free friend walking for the key, then drop into the trapdoor with one jump press before
it shut (at 2 players Ruben got into the cellar and skipped « Approchez », gate x and plate r). The
bench now has a gate of its own, m, at its end over the trapdoor's right half (see "The bench's end
m").

Fixed again after the integration's skeptic: at 4-5 players Ruben, hopping from far enough left on
the aisle, hung from his neighbour on top of a 3-high tower against gate x, his 2 opened the
trapdoor and he dropped through it. The bench's ceiling is now one cell lower, 2 cells over the
bench (level with gate x's top), so the tallest tower on the bench is a friend on a friend's head at
every team size, as it was at 3 players (see "Ruben hanging from the bench" in the shortcuts).

Fixed a third time after that fix's skeptic: the trapdoor was a gate, and a gate never shuts on a
body. Once in the cellar (one row high), the free friend could hop up into the trapdoor's opening
and hold it open while the one leaving the bench (Ruben at 2 players, a friend from 3) fell in
after him through the bench's end, which opens the moment the bench lets go. Two in the cellar then
let each other out with s and e, which skips f and gate x at 2 players (won in 15.4 s, against the
bots' 16.2). The route existed on the first version too (359 of 86400 probed runs) and the lower
ceiling had widened it (698). The trapdoor w is now a platform on the bench's link that slides
under the bench, in one step, while the bench holds W-1, and back in one step the moment it lets
go: a platform passes through a body from below, so nobody can hold it open (0 of 86400; see "The
free friend holds the trapdoor open from below" in the shortcuts).

## Idea

« Ruben pèse deux… mais l'ordre compte. » Every gate is a plate-and-gate pair, and the level is
about *who* stands on *which* plate, and *when*:

- Beat 1 shows the relay with plates "1": anyone holds, on either side.
- Beat 2 changes the number: the seat needs 2 and fits one body, so only Ruben opens it, at every
  team size. He is left behind, and a friend has to let him through.
- Beat 3 turns it around twice. The bench "W-1" needs *everyone but one friend*, so exactly one
  friend goes down for the key. Then the plate that frees the team, "= 1", is down in the cellar
  with him: only a lone friend can hold it, never Ruben. And it shuts the key's locker: if he frees
  the team before taking the key, the team walks out and the rope holds him far from the key.
- Beat 4 is the outro: down the tiers of the lecture hall to the door on the stage.

No death is possible (no spikes, saws, pits or `~`). Gates lock people in, never kill, and every
lock can be undone (see "No soft-lock").

## Map

69 x 21. The back corridor (floor top 12) leads to Ruben's seat, under the first cells of the upper
floor. Through gate h is the back row of benches (aisle floor top 10), then the hall's tiers go
down to the stage.

```
          11111111112222222222333333333344444444445555555555666666666
012345678901234567890123456789012345678901234567890123456789012345678
#####################################################################  0
#####################################################################  1
#####################################################################  2
#####################################################################  3
#####################################################################  4
#######################..........####...............................#  5
#######################..........####...............................#  6
#.............g.......h.............x...............................#  7
#.............g.......h.............x...............................#  8
#.............g.......h..........mppp...............................#  9
#.............g.......hddd######ww...e..............................# 10
#.S...........g...........##K..n.....e..............................# 11
#########aa####bbb######kc######s##f###rrr##........................# 12
############################################........................# 13
################################################..................D.# 14
################################################..................D.# 15
####################################################........######### 16
####################################################........######### 17
##################################################################### 18
##################################################################### 19
##################################################################### 20
```

| Char | Thing | Where | Need / link |
|---|---|---|---|
| `a` | plate | corridor floor, x 9-10 | 1, `relais` |
| `g` | gate | x 14, floor to ceiling | `relais` |
| `b` | plate | corridor floor, x 15-17 | 1, `relais` |
| `h` | gate | x 22, rows 7-10: from the lintel down to one cell above the floor, over the tunnel's mouth | `place` |
| `d` | plate | x 23-25, row 10: the first cells of the upper floor, the tunnel's ceiling, right over the seat | 1, `place` |
| `k` | still platform (a mover on link `marche`, which nothing drives) | tunnel floor, x 24: the seat's step | |
| `c` | plate: the seat | floor of the 1 x 1 pocket at x 25, the tunnel's end | 2, `place` |
| `x` | gate | x 36, rows 7-8, standing on the bench's last cell, up to the bench's low ceiling | `libre` |
| `p` | plate: the bench | x 34-36, row 9: one cell above the aisle, the cellar under it; two seats (x stands on the third cell); counts only what stands on it (`standing`: nobody hanging from a sitter weighs on it) | W-1, `controle` |
| `m` | gate, **inverted**: the bench's end | x 33, row 9, at the bench's height, over w's right half | `controle` |
| `w` | trapdoor: a platform (one-way, 0.4 thick) that slides 2 cells right, under the bench, at 240 cells/s (one step) while its link is on | aisle floor, x 32-33, right against the bench | `controle` |
| `e` | the cellar's door (vertical gate) | x 37, rows 10-11: the cellar's side wall, onto tier 1 | `sortie` |
| `r` | plate | tier 1, x 39-41, next to e | 1, `sortie` |
| `K`, `n` | the key and its locker's gate (inverted) | cellar, under the aisle, x 28 and 31 | `libre` |
| `s` | plate: the door's inside plate | cellar floor under w, x 32 | 1, `sortie` |
| `f` | plate | cellar floor under the bench, x 35 | **= 1**, `libre` |
| `D` | door | the stage (floor top 16), x 66 | |

The cellar is row 11 from x 28 to 36 (the locker x 28-30 behind n, under the aisle) and row 10 under
the bench (x 34-36); its floor is level with tier 1. It opens only through w (from the pen, the bench
holds it) and e (onto tier 1, r or s holds it). Its ceiling from w to e is w and the bench: things,
which the rope goes through. Like every platform, w is one-way: someone in the cellar can jump up
through it into the pen (back towards the start), never fall through it.

While the bench is short of W-1, w is shut and m open: m's cell is a pit one cell deep over w's right
half, and the bench's side is a step of one, as it always was. Once the bench holds W-1, w slides
away under the bench and m shuts: the bench's end becomes a step at its own height, over the open
trapdoor. The step the bench lets go (its plate's 0.15 s hold over), w is back, whoever is under it:
it is solid from above in the very next step, as a gate was when nobody stood in its way.

Over the bench the ceiling is 2 cells above the bench's top (rows 7-8, level with gate x's top):
one body can stand on a friend sitting there, never two.

### Plate numbers by team size

W = players + 1 (friends 1, Ruben 2).

| Plate | 2 players | 3 | 4 | 5 |
|---|---|---|---|---|
| a, b, d, r, s | 1 | 1 | 1 | 1 |
| c (one body fits) | 2: Ruben only | Ruben only | Ruben only | Ruben only |
| p (W-1) | 2: Ruben alone | 3: Ruben + 1 friend | 4: Ruben + 2 friends (one on a friend's head) | 5: Ruben + 3 friends (one on Ruben's head, one on the friend's) |
| f (= 1, in the cellar) | one friend alone | same | same | same |

"W-1" always leaves exactly one player free, and that player is a friend: without Ruben the
friends weigh W-2 at most. (Ruben, or a friend, in the air under a taut rope from someone on the
bench counts on it too, but only far out on the aisle, never over the trapdoor in time; see "Ruben
hanging from the bench" in the shortcuts.)

## Beats and the exact solution (bots)

Roles: R is Ruben, F0..F3 the friends in seat order. The spawn order, left to right, is F0..F3
then R, so Ruben walks in front, and his chain neighbour is the last friend. F0 is the free end of
the chain: the bots make him the one who goes down.

### 1. Relais (x 9-17)

Unchanged. Ruben stops against gate g (13.5). The friend behind him stands on plate a, so g opens.
Ruben goes through onto b (17.4), b holds g, and the friends come through. Plate a is 3 cells short of
g: someone stepping off it has 0.15 s, which is 1.05 cells at full run, and needs 2.2. So nobody opens
it and runs through alone.

### 2. La place de Ruben (x 21-28)

The seat is a 1 x 1 pocket at the end of a 1-high tunnel that runs under gate h and plate d. One body
fits, nobody can stand on it, and there is no lower ground within a rope's length that a friend could
hang from. A friend who walks in reads "1/2". A second friend can only lean in from the step k, and
the step holds him: a body that stands across two colliders counts on the one created first, and k
comes before c in reading order. Ruben walks in (2/2): h opens.

1. Ruben's neighbour jumps from the corridor (21.4) up through h onto d, to its right end (25.15),
   right over Ruben. The rope goes straight through d: 2.0.
2. Ruben walks back down the tunnel to 22.4 and goes up through h onto d (23.6), then hops over his
   neighbour onto the aisle (28.6).
3. The friends below go up one at a time, nearest first. Each one who still has a neighbour below
   lands on d left of the one holding it (23.95, then 23.0), so the rope to the one below stays short.
   From 5 players the middle friend hops over the holder once the next one is up, and that one moves
   right on d. F0 comes up last, at the left.
4. The holder lets go and the line walks to the bench, F0 at the back: F0, F1, the holder, the middle
   friend, Ruben.

Ruben cannot open h and run: out of the seat, his head stays under d for 2 more cells, and the plate
lets go 0.15 s after he leaves it.

### 3. Le contrôle surprise (x 26-41)

**The bench.** Everybody but F0 sits on the bench p: Ruben on the right seat, the next one on the
left seat; at 4 players F1 sits on that one's head; at 5 players the middle friend sits on Ruben's
head, Ruben's neighbour takes the left seat and F1 sits on his head. The others queue on w and the
aisle meanwhile, so the rope stays short. F0 stands on the trapdoor w, one cell lower than the
bench. It slides away under the bench when the last of the others sits down (m shuts), and F0 drops
into the cellar (standing far right on it, he is carried against m or the bench's side first, and
drops from there).

**The key.** The key's locker is under the aisle, so the rope goes down through w and round the
aisle's edge. From the bench it is too short: Ruben holding his seat keeps F0 2.1 short of the key
(F0 gets to 31.4, the key is picked up at 29.25), and from 4 players F1, on a head, keeps him 2.4
short. A friend who sits idle on the left seat (3 players), or an idle Ruben (2), is dragged along
the bench by F0 walking for the key: onto m, which the bench does not count, so the bench lets go,
w shuts, m opens and he drops into the pit onto the shut trapdoor. From there F0 has rope enough:
the neighbour came over w, dragged instead of walking. The bots do it on purpose: F0's neighbour
jumps off the bench onto the aisle (w shuts as he leaves the bench) and stands on w. F0 walks left
through the open gate n and takes the key.

**The way out.**

1. F0 walks right under the bench onto plate f (= 1): gate x opens, and n shuts behind him.
2. The team goes out through x onto tier 1. F0's neighbour climbs back onto the bench from w (m is
   a pit again: the same step of one as the bench's side), goes last and stands on r, so the
   cellar's door e opens.
3. F0 walks out through e (38.4). The bots then pass the key forward along the line, in the order
   they come down the tiers.

**Why the order bites.** Plate f is on F0's way under the bench, and it frees the team. If F0 stands
on it before he has the key:

- n shuts in front of the key.
- The team sees x open and goes out onto tier 1.
- From then on the rope (through e and x) holds F0 within a link of his neighbour outside. The key,
  far back under the aisle, is out of reach: from r, F0 gets no further than 33.8, and the key needs
  29.25.

To recover, F0 stands on f again, someone comes back into the pen through x, and the team must follow
F0 back towards the key and out again. At 2 players that is a full extra trip. From 3 players the team
can instead follow him into the cellar through e (someone on r), which is still a detour. Taking the
key first costs nothing. Ruben cannot help with f: he can get into the cellar only through e, from
tier 1, and his 2 is not "= 1" (nor are two friends).

### 4. Les gradins (x 38-67)

From tier 1 (top 12) two tiers of 2 go down to the front floor (top 18), then the stage is a step of
2 up, and the door is on it.

### Bot times (checker)

| Players | Total |
|---|---|
| 2 | 16.2 s |
| 3 | 17.9 s |
| 4 | 19.2 s |
| 5 | 21.9 s |

## The rope in this level

The rope wraps the scenery, so the level puts the things of each beat where the rope needs to go,
and lets the wrap do the work elsewhere:

- **The seat.** Ruben in the pocket and his friend above are separated only by things: the plate d,
  which is the tunnel's ceiling, and the gate h. The rope from the seat to the one holding d goes
  straight up through d (2.0). The previous seat sat under a solid desk, and the rope went round it
  (5.8, past the hard stop).
- **The locker (the wrap is the puzzle).** The free friend's rope runs down through w and round the
  aisle's edge to the key. Its reach sets the "come closer" moment: from the bench the rope round the
  edge is at its hard stop, and from the trapdoor or the aisle it has room to spare (4.3 when he takes
  the key).
- **The leash.** Once the team is out on tier 1, the rope through e and x keeps the free friend at
  most a link from them. The key is two links back.
- **The cellar's ceiling** from w to e is the trapdoor and the bench, so wherever the free friend
  walks under the bench, his rope goes straight up to the team. The previous basement wrapped the
  corridor floor around him and could not reach its plate.
- **The bench's end m.** Nothing solid sits between w and the bench. A solid step there was tried:
  the rope from the free friend under the bench to his neighbour on w then wraps the step's left
  face as the neighbour climbs back onto the bench, and drags the free friend off f (the team
  could not leave). A one-way platform (a still mover) leaves a 0.6-high pocket under it that bodies
  walk into from the aisle. m is a gate on the bench's own link, inverted: a full step while the
  trapdoor is open, a pit otherwise, and the rope goes through it either way.
- **The trapdoor w** is a platform, a thing like the gate it replaced: the rope goes through it,
  open or shut, wherever it is on its slide.

## Heights and margins

| Spot | Height | Who | Margin |
|---|---|---|---|
| Corridor to the upper floor, through h | 2 | a lone jump (apex 3.0) | 1.0; the lintel over h leaves 0.9 over the head |
| Hopping over the one holding d | his head is 0.9 above d | a lone jump from d | 2.1 |
| The aisle to the bench | 1 | a lone jump; under the bench the ceiling stops it at a rise of 2.1 (head 7) | 1.1 to spare in height |
| Off the bench towards w, w open | m is shut at the bench's height | the bench lets go once he stands on m (centre 34.4); he can drop only past m (centre 32.6), then falls 1 | 1.8 cells and a fall of 1 in 0.15 s: 12 cells/s, the run is 7 |
| The bench's ceiling | 2 cells over the bench's top | at most 1 body on a friend sitting there | a second would need 0.7 more |
| Under the trapdoor | 1.6 (the cellar's row and the 0.6 under w's 0.4 board) | one body; nobody on a head | a body under w hopping into it does not hold it: it slides back through him |
| Out of the cellar | 0: its floor is level with tier 1 | walking through e | |
| The tiers and the stage | 2 | a lone jump | 1.0 |
| The tunnel and the seat | 1 high | one body (0.9) | nobody stands on anyone in them |
| Gates g and h; gate x | g reaches the ceiling, h the lintel; x reaches the bench's ceiling | | |

Rope reach, measured along the path (rest 4.5, hard stop 5.4):

| Moment | Length |
|---|---|
| Ruben in the seat to his neighbour on d (straight through d) | 2.0 |
| The one on d to the friend waiting below at 21.4 | 4.25 |
| F0 at the key to his neighbour on w (round the aisle's edge) | 4.32-4.35 (measured, every team size) |
| F0 walking for the key, Ruben holding his seat / F1 on a head (4, 5 players) | at the stop: F0 gets to 31.4 / 31.7, the key needs 29.25 |
| F0 on f to his neighbour on w / on r (through e) | at most 2.99-3.04 / 4.61-4.64 |
| Ruben hopping from x 32.4 to his neighbour against gate x, with 0 / 1 friend under him | 3.58 / 3.64-3.67 (slack) |
| The same from further left on the aisle (x 29-31): Ruben hangs (taut from 4.48) | up to 5.03-5.40; the hang ends with his body's right edge at 31.34-31.67, and it gets no further than 32.53 while w is open: dropping in needs 32.8 (2-5 players, the shortcut's sweep, re-measured with w a platform; 32.47 with the gate) |
| Longest link in the bots' runs | 4.94 (2 players) / 4.91 (3) / 4.91 (4) / 4.91 (5) |

## Variants by team size

No cell variants: the numbers scale through W-1. At 2 players Ruben is F0's neighbour, so he gives
F0 rope over w (from the trapdoor, not the bench) and holds r at the end. The bench has two seats:
from 4 players friends sit on heads (Ruben's included), under a ceiling that takes two bodies.

## Ruben's active moments

- **The seat c:** only he opens h, at every team size. He sits for about a second while his neighbour
  goes up.
- **The bench p:** W-1 cannot be reached without him. He sits only until the free friend has dropped
  in (about 1 s for the bots).

## Communication moments

- **The bench:** « Tout le monde assis, sauf un ! »
- **In the cellar:** « Approchez, j'ai pas assez de corde ! », then « Attendez, j'ai pas la clé ! »
  (the plate that opens the exit is on the way).
- **At the end:** « Quelqu'un sur la plaque, que je sorte ! »

## Shortcuts

Each shortcut in `coop03.solution.ts` plays the solution up to the beat it tries to skip, then a
phase named `ATTEMPT` that must time out. The campaign test (`coopLevels.test.ts`) checks that
every shortcut fails in that phase at 2, 3, 4 and 5 players.

| Shortcut | What the bots try | Why it fails |
|---|---|---|
| a friend alone on Ruben's seat | Ruben steps back behind his neighbour, who sits in the seat (1/2); Ruben, in the tunnel behind him, jumps again and again for d | c needs 2 |
| two friends on Ruben's seat | one friend in the seat, the next one leaning in from the step (3+); Ruben jumps for d | the step k holds the second one: he weighs nothing on c |
| a friend hanging from the one in the seat | a friend in the seat, another body hops at the end of the rope | the seat is at floor level: nobody can be lower than it, so nobody hangs from it |
| Ruben opens h and runs (new) | Ruben in the seat runs out and jumps for d the moment his head is clear of d | 2 cells of tunnel under d: h has shut |
| Ruben walks off the bench into the trapdoor | the friends hop over Ruben onto the bench (W-1 with him on its left seat, w open, m shut); Ruben walks left | he walks onto m, the bench lets go, w shuts and m opens: he drops into the pit onto w |
| Ruben jumps off the bench into the trapdoor | the same, Ruben jumping | the same: m is shut at the bench's height while w is open |
| the free friend drags his neighbour off the bench into the trapdoor (new, critic) | F0 drops in and walks for the key while his neighbour sits idle (dragged to the bench's end), then the neighbour hops on the spot again and again | dragged onto m, he is off the bench; w shuts long before he is past m |
| Ruben as the free one | all the friends on the bench, Ruben on the trapdoor | without Ruben the bench is short |
| Ruben hanging from his neighbour on the bench (sweep, new) | the same, his neighbour on top of a tower against gate x (on a friend's head from 3 players: the bench's ceiling takes two bodies); Ruben hops from 9 starts along the aisle (x 32.4 down to 29.2), 3 ways each (a full jump, right held from the take-off or from 0.21 s to the landing, or for 0.1 s from 0.25 s) | a body in the air under a taut rope weighs on its holder's support, so far out his 2 counts and w opens; but the link goes slack too far from w: he is never over it before it shuts (see "Ruben hanging from the bench" below) |
| two friends into the cellar, one hanging (new) | Ruben on the right seat against gate x (F2 on his head from 4 players), the others on the left seat, F0 on w; F1 hops from 4 starts along the aisle, 3 ways each, to hang from his neighbour on the bench | his 1 makes W-1 and F0 drops in, but F1 is never over w before it shuts, F0's rope pulling him or not. At 2 players there is no second friend |
| the free friend holds the trapdoor open from below (new, skeptic of the ceiling fix) | F0 drops in and waits under the trapdoor (32.5); his neighbour on the bench (Ruben at 2 players, F1 from 3, on a head from 4) leaves it towards the trapdoor, walking, or jumping at once or 8 steps later, while F0 hops under it 12 to 28 steps after he sets off (jump held 10 or 20, still or moving right): 30 tries, the leaver climbing back to his place between them | the trapdoor is a platform: it slides back the step the bench lets go, through F0's head, and the leaver lands on it (his feet never get below 10) |
| freeing the others before taking the key | F0 drops in and goes straight to f (n shuts), the team goes out onto tier 1 and keeps to its places, F0 goes back for the key | the rope holds F0 within a link of the team outside |
| the free friend lets himself out with s (new) | F0, key in hand, steps on s and runs for e | s is 3 cells from e: e has shut before he gets there |
| a tower over gate g | nobody on a; Ruben's neighbour climbs on Ruben at g and jumps | g reaches the ceiling |
| Ruben hangs over the trapdoor from the bench's far end (new, whole-tree skeptic) | Ruben on the left seat, F0 dropped in; Ruben jumps left off the bench twice while the others walk to its far end and F0 walks right under it | the bench counts only what stands on it: Ruben's hang does not re-arm it, w stays shut and he lands on it (before `standing`: in the cellar at 3 players) |

**Control experiment.** Scripts not committed: `.scratch-coop03-control.ts` and, for m,
`c03fix/control.ts` in the session scratchpad. With the level weakened, the same bots get through their attempt phase at 2-5 players,
so it is the level that stops them, not the bots. The weakened levels:

- the seat needing 1;
- the step k turned into plain floor (3-5 players; at 2 players there is no second friend);
- d over the seat only and h right next to it (Ruben's head clear of d as he steps out);
- the bench level with the trapdoor (the walk; before m existed);
- m removed (open air over w's right half): the free friend drags his idle neighbour in at 2, 3 and
  5 players (at 4 his neighbour is on a head and is not dragged);
- the bench needing W-2;
- the key's locker moved under the bench, next to f;
- s next to the door;
- two cells cut off the top of g;
- the bench's ceiling one cell higher (3 cells over the bench, as before the fix) and the shortcut's
  set-up from then (two under the neighbour from 4 players): the hop sweep of "Ruben hanging" puts
  Ruben in the cellar at 4 and 5 players (70.9 s and 60.4 s into the sweep; it fails at 2 and 3,
  where the tower was already one friend high). Script `control2.ts` in the session scratchpad
  (`fixround/coop03/probes`);
- the bench needing W-2 for "two friends into the cellar": F1 follows F0 in at 3, 4 and 5 players;
- the trapdoor a gate again, for "the free friend holds the trapdoor open from below" (script
  `sctime.ts` in the session scratchpad, `fixround/coop03r/probes`, run on the level of the ceiling
  fix and on the one before it, with this solution file): the leaver gets into the cellar at 2, 3,
  4 and 5 players with the lower ceiling (26.3, 5.2, 4.3 and 4.4 s into the sweep), and at 3, 4 and
  5 with the higher one (4.7, 21.4 and 17.6 s; at 2 players its 30 tries miss there, the exhaustive
  probe below finds 91).

Re-run with the trapdoor a platform (`ctl.ts`, same scratchpad), the weakened levels that involve
it still let the bots through: m removed, the dragged neighbour gets in at 2 and 3 players (at 4
and 5 F1 rides on a head and is not dragged); the bench needing W-2, "Ruben as the free one" gets
through at 2-5 and "two friends into the cellar" at 3-5; the ceiling one cell higher with the old
set-up, "Ruben hanging" gets Ruben in at 4 and 5 (70.9 s and 60.4 s into the sweep, as with the
gate). The other weakened levels do not involve the trapdoor and were not re-run.

The walk and the jump off the bench are not in the list for m: with m removed they still fail, on
the fall of one cell to the trapdoor (0.184 s against the bench's 0.15 s hold). Only the rope's
yank beats that fall, which is what the critic found and m closes.

### New routes the wrap or the stretch could open, probed

- **The key from the bench**, the rope stretched round the aisle's edge: a neighbour who holds his
  seat (or sits on a head) keeps F0 short; an idle one on a seat is dragged onto m and drops onto
  the shut trapdoor, and F0 reaches the key. That is the intended order (key first) and the
  intended place (over w), only less comfortable. Accepted.
- **Ruben hanging from the bench** (the weight of a hanging body goes to its holder). From x 32.4
  (the old shortcut) the link stays slack. From further left it gets taut and his 2 counts: found
  by the integration's skeptic at 4-5 players (9 of 4800 runs), where his neighbour stood on a
  3-high tower against gate x; the link went slack at 31.46, and the plate's 0.15 s hold kept w
  open long enough for him to be over it. **Fixed** by lowering the bench's ceiling one cell: the
  tower is now at most two high (a friend on a friend's head), as it was at 3 players. Probe
  scripts not committed (`fast.ts`, `float.ts` in the session scratchpad, `fixround/coop03/probes`):
  the team set up as in the shortcut, Ruben walks to a start x (28.0 to 32.6, every 0.1) and stands
  still, then plays one of 185 patterns (jump held 1 to 50 steps, right or left held from step 0 to
  40, for 0.1 s or to the landing, or no direction; again every 0.5 s). Before the fix: 129 of
  21830 runs put him in the cellar (0 at 2 and 3 players, 94 at 4, 35 at 5; starts 29.2-30.4,
  right held from the apex or later). After: 0 of 20720. A second sweep starts the patterns from
  wherever 1.5 s of walking left leaves him (standing, or floating at the end of the stretched
  rope, which also counts as hanging), with a plain run right added: 77 of 4662 at 4 players before
  the fix (the 5-player set-up was not rebuilt for it), 0 of 18648 after (2-5). Both re-run with w a
  platform: 0 of 20720, and 0 of 41736 for the second (its later version, 10434 per team size). In
  the committed sweep, the hang ends with his body's right edge at 31.34-31.67 and gets no further
  than 32.53 (32.47 with the gate) while w is open; dropping through needs 32.8 (m holds the
  trapdoor's right half). Ruben in the cellar would not have reached the key anyway (the
  rope held him at 33.7, the key is at 29.25).
- **Hauls and pulleys past the gates**: h, g and x reach a ceiling or a lintel, and a closed gate
  stops bodies even though the rope goes through it, so nobody is hauled past one. Nothing to probe
  further.
- **Out of the cellar through w**: while the team queues on the bench (W-1) w is open, and the free
  friend can jump back up into the pen. Shut, w is a one-way platform, and he can jump up through
  it too: probed (`upthrough.ts`) with F0 holding the key and his neighbour standing on w, he gets
  up from right under the bench's end (x 33, jumping right into m's pit: 2 of 27 tries at each of 2, 3
  and 5 players), never straight up (his neighbour's body is in the way). Harmless: he is back in
  the pen, the key with him, and the team still needs a friend alone on f, who can only get there
  through w opened by the bench, to leave through x. Nobody gets down through a shut w.
- **The free friend holds the trapdoor open from below** (the skeptic of the ceiling fix). With
  the trapdoor a gate (it never shut on a body), F0, once dropped in, hopped up into its opening as
  the one leaving the bench came over it; the bench's end m opened the moment the bench let go (a
  pit is what it is while the bench is short), and he fell in after F0 through m's cell. Two in the
  cellar then let each other out with s and e (see "No soft-lock"), which at 2 players skips f and
  gate x: the skeptic won with it in 15.4 s (the bots take 16.2), and with Ruben or a second friend
  in the cellar in 19.0 s at 3 players, 20.7 s at 4 and 22.9 s at 5 (22.7 s on the first version).
  Probe (`block2.ts`, session scratchpad `fixround/coop03r/probes`): the solution up to F0's drop
  (Ruben on the right seat), or the set-up of "Ruben walks off the bench" with F0 then walking onto
  w (Ruben on the left seat), 0.25 s still; then F0 jumps at step 0 to 40 (held 3 to 50 steps,
  still, right or left) while one body that can leave the bench walks left from step 0 to 50
  (jumping at once, 8 or 16 steps later, or not): 4320 runs per leaver, 86400 in all. With the
  trapdoor a gate, 359 put the leaver in the cellar on the first version (91 / 43 / 71 / 154 at
  2 / 3 / 4 / 5 players) and 698 with the lower ceiling (252 / 89 / 149 / 208), which let a friend
  in at 3 and 4 players where the first version did not. **Fixed** by making w a platform: 0 of
  86400, and the skeptic's winning runs all stop at the hop (the leaver lands on w). The hop and a
  hang together (W-1 reached by a hanging body, then F0 hopping) need nothing more: whatever opens
  w, nobody under it holds it.
- **An idle sitter dragged to the trapdoor** (critic, round 2; it got Ruben into the cellar at 2
  players and F1 at 3-4): closed by m. Probe script not committed (`sweep.ts` in the session
  scratchpad): at 2-5 players, F0 walks for the key with his neighbour idle for 0.3 to 2.5 s, then
  the neighbour plays one of 168 input patterns (jump held 0 to 50 steps, left held 0 to 60 steps
  from step 0 to 12, or a plain walk left). 5292 runs, none puts the neighbour in the cellar. The
  same sweep on the level before m (576 runs, fewer patterns): 37 do (8 at 2 players, 14 at 3, 15
  at 4; at 5 F1 rides on a head and is not dragged).
- **Two friends in the cellar** (a friend's 1 hanging from the bench makes W-1 with one friend
  short): probed (`two.ts`, same scratchpad) at 3-5 players with Ruben on the right seat against
  gate x and, from 4 players, F2 on his head (the highest place F1's bench neighbour can have),
  the others on the left seat, F0 standing on w, F1 sweeping the starts on the aisle where he can
  stand still (8-9 of x 28.0-31.6; the rope to F0 and to the bench holds him between) with the 185
  patterns. F1's hang opens w in 1190 / 1196 / 1381 runs (of 1665 / 1480 / 1665) and F0 drops in;
  F1 never follows him (0), with F0's rope through w pulling him or not (the same numbers with w a
  platform). On the level before the fix,
  with F2 on top of a 3-high tower at 5 players, F1 floats at the end of the rope at most starts and
  none of 185 runs gets him in either. Closed, and kept as the shortcut "two friends into the
  cellar, one hanging". Two friends can still get into the cellar from tier 1 through e (accepted,
  below): that is past x and skips nothing.

### Accepted

- **Trains:** from 3 players, a tight line walking over plate a keeps plate a or gate g's box
  occupied all the way through, so beat 1 passes without a deliberate handover.
- **Door wedge:** a gate never closes on a body. A player standing in the doorway of g, x or e keeps
  it open for the one behind, which makes the relay plates b, r optional. h has no doorway to stand
  in: its box ends one cell above the tunnel's floor. The first openings still need a (anyone), c
  (Ruben alone) and f (one friend, in the cellar).
- **Walking into the cellar from tier 1:** r is right next to e, so someone stepping off r reaches
  the doorway before e shuts. The cellar is past x, so this skips nothing.

## No soft-lock

Every way to be locked in has a way out:

- **The free friend below with the bench empty:** he stands on f, which opens x. Someone goes out
  onto r, and he walks out through e.
- **Everyone outside, the key still in the cellar:** F0 goes back onto f, someone comes back into the
  pen through x and gives him rope over w, as in the solution.
- **Everyone shut in the cellar** (the one on r dragged in through e by a friend walking back, which
  happened to the bots when they stood idle): one stands on the inside plate s, the other walks into
  e's doorway (e never shuts on him), the first joins him, and they walk out. Checked by a probe at 2
  players, the tightest case (the rope is too short for one on s and the other on r); checked again
  with the trapdoor a platform (`escape.ts`, session scratchpad `fixround/coop03r/probes`: won in
  17.7 s). Since w is a platform, one-way, they can also jump up through it into the pen, from right
  under the bench's end.
- **A friend left below at the seat:** someone above stands on d. **Ruben left below:** he sits on
  c.
- **Ruben** never gets through the trapdoor w walking, jumping or dragged off the bench by the
  rope, hanging from his neighbour on the bench from the aisle, or with the free friend hopping
  under it (see the shortcuts): leaving the bench towards w he stands on m, and lands on w once it
  is back. He can, though, by jumping left off the bench while the others walk to its far end (see
  **Open** below: 3 and 5 players). He can get into the cellar only through e, from
  tier 1, and gets out the same way. The escape of two shut in the cellar was probed again with m
  (2 players, the tightest case): it works.

## Open

Found by the skeptic of the fix round (probes in the session scratchpad,
`fixround/recheck-coop03/probes`, run with `./run.sh new|base|old FILE args`); the first was fixed
in the final repair round (probes in `fixround/repair-all/probes/c03`, `./run.sh wt|new|base`):

- **Fixed (2026-11-28): the leaver hangs over w from the bench's far end (3-5 players).** The leaver (Ruben, or
  a second friend) jumps left off the bench, plate p lets go and the trapdoor comes back; meanwhile
  the others walk to the bench's right end, F0 on f opens gate x and frees the last cell. The rope
  goes taut and the leaver hangs from them over w's left half (x 32.0-32.8, clear of m); a hanging
  body weighs on its holder (`computeLoads`, hangHeight 0.5), so p reads W-1 again, w slides away in
  one step and he falls in. It is the plate re-arming, so the platform's speed does not help. The
  m-pit variant: a friend hanging inside m's box (x 33) keeps m from shutting when p re-arms.
  - Scripted (`rjump.ts`, 2100 runs per row; this level / 0fa5e90 / the ceiling fix alone):
    Ruben at 3 players 66 / 42 / 66, at 4 players 0 / 18 / 0, at 5 players 47 / 29 / 57; F1 at 3
    players 63 / 70; F2 at 4 players 92 / 65; F3 at 5 players 28 / 46. Example: `rjump.ts 3 left`,
    run `f0 1 oth 1 tw 0 jh 3 ll 60 rj 1`. 56 runs at 3 players and 33 at 5 get Ruben in here and
    stay out on 0fa5e90.
  - Random play near the bench (`rand.ts`, 2000-run sweep, stopped part-way; this level / 0fa5e90 /
    the ceiling fix alone): 3 players, a friend 4 / 25 / 52; Ruben 2 / 36 / 74; pre-set 0 / 2 / 2.
    At 2 players: 0 of 8000 (0fa5e90: 42).
  - The level is then won (`win3.ts` replays the recorded inputs): Ruben in the cellar, won in
    20.9 s (3 players, seed 1612); two friends in the cellar, won in 20.1 s (3 players, seed 274)
    and 23.7 s (4 players, seed 108, F2 hanging in m's pit). None is faster than the bots (17.9 /
    19.2 s), but each breaks "one friend alone in the cellar". No committed shortcut covers it (the
    two hanging shortcuts only hop from the aisle).
  - **Fix**: the bench counts only what stands on it (plate option `standing`, `levelFormat.ts`;
    `CoopWorld.standingLoadOn`): a friend hanging from someone on the bench no longer weighs on it,
    so a leaver's hang never re-arms it and he lands on the shut trapdoor. No intended move needs a
    hanging weight on the bench (bot times unchanged: 16.2 / 17.9 / 19.2 / 21.9 s, the runs step
    for step the same). Re-run (2100 runs per row, this tree / the integrated `73ac9d7` /
    `0fa5e90`): Ruben at 3 players 0 / 66 / 42, at 4 players 0 / 0 / 18, at 5 players 0 / 47 / 29;
    F1 at 3 players 0 / 63 / 70; F2 at 4 players 0 / 92 / 65; F3 at 5 players 0 / 28 / 46. Random
    play near the bench (`rand.ts`, 1000 runs of 3 s each, seed 1; this tree / `73ac9d7` /
    `0fa5e90`): 2 players 3 / 3 / 10, 3 players 3 / 6 / 22 (Ruben seated as in the solution) and
    1 / 2 / 21 (on the left seat), 4 players 2 / 8 / 40; every hit left is one `73ac9d7` also has
    (Ruben reaching the cellar through e once x is open, past the beat). The three recorded wins
    (`win3.ts`) now stop with the leaver standing on the trapdoor. Kept as the shortcut "Ruben
    hangs over the trapdoor from the bench's far end" (its attempt reaches the cellar at 3 players
    without `standing`).
  - What else it changes: the shortcuts "Ruben hanging from his neighbour on the bench" and "two
    friends into the cellar, one hanging" relied on a hanging body opening w; it no longer does,
    so both fail earlier (w stays shut). The notes below that count a hanging weight on the bench
    describe the level before this fix. Nothing else in any level uses `standing`.
- **Open: soft-locks with the platform** were probed only by random play (no stuck state found).

## Deviations from the plan, and why

- **The key's gate shuts only while f is pressed.** The engine has no latching plates, and a level
  with no death should not need a restart. The order still bites, through the rope (see "Why the
  order bites").
- **The "= 1" plate is in the cellar**, on the free friend's way. It is the plate that frees the
  team, so freeing and taking the key compete for the only free player. Ruben, too heavy for it,
  cannot take over.
- **The cellar has a second way out, e (opened from tier 1 by r).** Otherwise the one holding f could
  never leave once the team was out. Getting onto tier 1 needs f, which is only reachable through the
  bench, so e skips nothing. Its inside plate s exists only so that two shut in never stay there.
- **The bench's end m is a gate on the bench's own link, inverted** (over the trapdoor's right half,
  which is why w is two cells wide). A solid step and a still platform were tried first (see "The
  rope in this level"). m shows the bench's link symbol and moves with the trapdoor, which reads as
  part of the same contraption. Its cost is a seat: the bench has two, and from 4 players friends
  sit on heads.
- **The trapdoor is a platform, not a gate.** A gate never shuts on a body, and the free friend,
  right under the trapdoor once he has dropped in, could always hop up into its opening and hold it
  for the next one (see "The free friend holds the trapdoor open from below"); no timing or shape of
  the bench's end beats that, since he can hold it for most of a jump. A platform's slide waits for
  nobody: it passes through a body from below, and carries one standing on it until something
  stops him (F0, far right on it, against m or the bench's side; he then drops). It moves in one
  step (240 cells/s), so it is solid again in the very step after the bench lets go, as the gate
  was when nothing stood in its way. Its costs: it is one-way (anyone in the cellar can jump up
  into the pen, harmless), and it reads as a board sliding under the bench rather than a gate's
  bars, still wired to the bench and to m.
- **The bench's ceiling is 2 cells over it**, level with gate x's top. With 3 cells (the first
  version), a 3-high tower against gate x let Ruben hang from its top far out on the aisle and be
  over the trapdoor before it shut (4-5 players). Two cells still take the 5-player bench (two
  seats, each a friend on a head), and friends reach a head from close by (from the pit, or from
  the seat next to it).
- **The seat's step is a still platform** (a mover on a link that nothing drives). This is the only
  way found to stop a second friend leaning into a 1-cell plate from counting on it: two 0.8-wide
  bodies always both overlap a 1-cell plate, and a body counts on any plate it overlaps. The step is
  read before the seat, so the leaning friend stands on the step. It is in the tunnel's floor: the
  rope never goes near it.
- **The level climbs, then goes down.** The corridor is the back of the hall (« au fond »), the
  benches are its back row, a step higher, and the tiers go down to the stage. The tiers are an
  outro, not a beat.
- **f, s and r are more than one link from some of their gates.** n is the inverted gate of f's link,
  and nobody passes it while f is held. s and r open e for whoever is next to it.

## Engine notes

- A body standing across two colliders is supported by the one created first (things are created
  in reading order), and an open gate has no collider. The seat's step relies on this rule, and so
  does m (read before the bench, on the same row): someone straddling them stands on m and weighs
  nothing on the bench. Body
  colliders come before things: a friend standing across a friend's head and a plate stands on the
  friend.
- A body in the air under a taut rope "hangs" from a higher neighbour and weighs on whatever that
  neighbour stands on, except on a plate with `standing` (the bench, since 2026-11-28: only what
  stands on it counts). The seat is at floor level, so nobody can hang below it. Before the bench
  had `standing`, a link that carried a hanging body's weight was taut only far out on the aisle,
  and it went slack again too far from the trapdoor (see the shortcuts); a body floating at the
  end of a stretched rope hangs too.
- "A gate never closes on a body" makes every relay plate optional (the door wedge), and it is how
  two shut in the cellar let each other out. It is also why the trapdoor is a platform: a gate
  there was held open by the free friend hopping under it.
- A platform on a link moves `speed` cells/s along (dx, dy) while its link is on and back while it
  is off, and nothing stops it. Whoever stands on it rides it (and keeps its horizontal speed, up
  to a run, when it slides out from under him); from below it is not there.
- Friends can stand on Ruben; Ruben stands on nobody.
- In the client, link symbols follow the reading order of the first thing on each link: `relais`
  (gate g, row 7) still comes first, and `marche` (the still step) gets none
  (`thingLayout.test.ts`).
