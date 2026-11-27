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
#######################.............#...............................#  6
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
| `p` | plate: the bench | x 34-36, row 9: one cell above the aisle, the cellar under it; two seats (x stands on the third cell) | W-1, `controle` |
| `m` | gate, **inverted**: the bench's end | x 33, row 9, at the bench's height, over w's right half | `controle` |
| `w` | trapdoor (horizontal gate) | aisle floor, x 32-33, right against the bench | `controle` |
| `e` | the cellar's door (vertical gate) | x 37, rows 10-11: the cellar's side wall, onto tier 1 | `sortie` |
| `r` | plate | tier 1, x 39-41, next to e | 1, `sortie` |
| `K`, `n` | the key and its locker's gate (inverted) | cellar, under the aisle, x 28 and 31 | `libre` |
| `s` | plate: the door's inside plate | cellar floor under w, x 32 | 1, `sortie` |
| `f` | plate | cellar floor under the bench, x 35 | **= 1**, `libre` |
| `D` | door | the stage (floor top 16), x 66 | |

The cellar is row 11 from x 28 to 36 (the locker x 28-30 behind n, under the aisle) and row 10 under
the bench (x 34-36); its floor is level with tier 1. It opens only through w (from the pen, the bench
holds it) and e (onto tier 1, r or s holds it). Its ceiling from w to e is w and the bench: things,
which the rope goes through.

While the bench is short of W-1, w is shut and m open: m's cell is a pit one cell deep over w's right
half, and the bench's side is a step of one, as it always was. Once the bench holds W-1, w opens and
m shuts: the bench's end becomes a step at its own height, over the open trapdoor.

Over the bench the ceiling is 3 cells above the bench's top (rows 6-8): two bodies can stand on a
friend sitting there, never three.

### Plate numbers by team size

W = players + 1 (friends 1, Ruben 2).

| Plate | 2 players | 3 | 4 | 5 |
|---|---|---|---|---|
| a, b, d, r, s | 1 | 1 | 1 | 1 |
| c (one body fits) | 2: Ruben only | Ruben only | Ruben only | Ruben only |
| p (W-1) | 2: Ruben alone | 3: Ruben + 1 friend | 4: Ruben + 2 friends (one on a friend's head) | 5: Ruben + 3 friends (one on Ruben's head, one on the friend's) |
| f (= 1, in the cellar) | one friend alone | same | same | same |

"W-1" always leaves exactly one player free, and that player is a friend: without Ruben the
friends weigh W-2 at most. (Open finding at 4-5 players: Ruben hanging taut from his neighbour on
the tower counts on the bench too; see "Ruben hanging from the bench" in the shortcuts.)

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
bench. It opens when the last of the others sits down (m shuts), and F0 drops into the cellar.

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
| 2 | 16.6 s |
| 3 | 17.9 s |
| 4 | 19.5 s |
| 5 | 22.0 s |

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

## Heights and margins

| Spot | Height | Who | Margin |
|---|---|---|---|
| Corridor to the upper floor, through h | 2 | a lone jump (apex 3.0) | 1.0; the lintel over h leaves 0.9 over the head |
| Hopping over the one holding d | his head is 0.9 above d | a lone jump from d | 2.1 |
| The aisle to the bench | 1 | a lone jump, under the bench's ceiling (head 6.1, ceiling 6) | 2.0 to spare in height |
| Off the bench towards w, w open | m is shut at the bench's height | the bench lets go once he stands on m (centre 34.4); he can drop only past m (centre 32.6), then falls 1 | 1.8 cells and a fall of 1 in 0.15 s: 12 cells/s, the run is 7 |
| The bench's ceiling | 3 cells over the bench's top | at most 2 bodies on a friend sitting there | a third would need 0.6 more |
| Out of the cellar | 0: its floor is level with tier 1 | walking through e | |
| The tiers and the stage | 2 | a lone jump | 1.0 |
| The tunnel and the seat | 1 high | one body (0.9) | nobody stands on anyone in them |
| Gates g and h; gate x | g reaches the ceiling, h the lintel; x reaches the bench's ceiling | | |

Rope reach, measured along the path (rest 4.5, hard stop 5.4):

| Moment | Length |
|---|---|
| Ruben in the seat to his neighbour on d (straight through d) | 2.0 |
| The one on d to the friend waiting below at 21.4 | 4.25 |
| F0 at the key to his neighbour on w (round the aisle's edge) | 4.30-4.34 (measured, every team size) |
| F0 walking for the key, Ruben holding his seat / F1 on a head (4, 5 players) | at the stop: F0 gets to 31.4 / 31.7, the key needs 29.25 |
| F0 on f to his neighbour on w / on r (through e) | 2.95-2.99 / 4.59-4.60 |
| Ruben on w to his neighbour against gate x, with 0 / 1 / 2 friends under him | 3.3 / 3.7 / 4.2 (measured in the shortcut, hopping from x 32.4: 3.81 / 3.66 / 4.22, slack; from further left on the aisle, x 30.0-30.4 at 4-5 players, up to 4.76: taut, see the shortcuts) |
| Longest link in the bots' runs | 4.97 (2 players) / 4.91 (3) / 4.93 (4) / 4.91 (5) |

## Variants by team size

No cell variants: the numbers scale through W-1. At 2 players Ruben is F0's neighbour, so he gives
F0 rope over w (from the trapdoor, not the bench) and holds r at the end. The bench has two seats:
from 4 players friends sit on heads (Ruben's included), under a ceiling that takes three bodies.

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
| Ruben hanging from his neighbour on the bench | the same, his neighbour on top of a tower against gate x (one under him at 3 players, two from 4), Ruben hops on w's far side | a body in the air under a taut rope weighs on its holder's support, so his 2 would count; from x 32.4 the link is never taut there (4.22 at most). Open at 4-5 from further left: see below |
| freeing the others before taking the key | F0 drops in and goes straight to f (n shuts), the team goes out onto tier 1 and keeps to its places, F0 goes back for the key | the rope holds F0 within a link of the team outside |
| the free friend lets himself out with s (new) | F0, key in hand, steps on s and runs for e | s is 3 cells from e: e has shut before he gets there |
| a tower over gate g | nobody on a; Ruben's neighbour climbs on Ruben at g and jumps | g reaches the ceiling |

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
- two cells cut off the top of g.

The walk and the jump off the bench are not in the list for m: with m removed they still fail, on
the fall of one cell to the trapdoor (0.184 s against the bench's 0.15 s hold). Only the rope's
yank beats that fall, which is what the critic found and m closes.

### New routes the wrap or the stretch could open, probed

- **The key from the bench**, the rope stretched round the aisle's edge: a neighbour who holds his
  seat (or sits on a head) keeps F0 short; an idle one on a seat is dragged onto m and drops onto
  the shut trapdoor, and F0 reaches the key. That is the intended order (key first) and the
  intended place (over w), only less comfortable. Accepted.
- **Ruben hanging from the bench** (the weight of a hanging body goes to its holder): closed from
  x 32.4 (the table), **open at 4-5 players from further left** (integration skeptic, 2026-11-27,
  re-measured on the integrated branch). Same setup, but Ruben stands at x 30.0 (4 players) or
  30.4 (5) on the aisle and hops once, holding right a little later: 9 of 4800 runs put him in the
  cellar (5 at 4 players, 4 at 5). In the air at 30.6 the link reaches 4.60-4.76, taut from 4.48:
  he counts as hanging from his neighbour, the bench load goes from 3 to 6 against a need of 5,
  w opens and m shuts; the link goes slack at 31.46 but the plate's 0.15 s hold keeps w open, he
  is in w's cell by then and a gate never closes on a body. Impact is limited: with the tower up,
  Ruben in the cellar stands at 33.7 and cannot reach the key (29.25), f still needs a lone
  friend, and no faster finish or soft-lock was found; the team needs another hang to get a friend
  down. The fix would make the tower shorter (a lower bench ceiling) or keep it further from the
  aisle; the shortcut's ATTEMPT should then sweep Ruben's start from 30 to 32.4. It is the reason the bench is short with a low ceiling: a seat further right, or a fourth
  body in the tower, would make the link taut (a seat further right with one under the holder: 4.6).
- **Hauls and pulleys past the gates**: h, g and x reach a ceiling or a lintel, and a closed gate
  stops bodies even though the rope goes through it, so nobody is hauled past one. Nothing to probe
  further.
- **Out of the cellar through w**: while the team queues on the bench (W-1) w is open, and the free
  friend can jump back up into the pen. Harmless.
- **An idle sitter dragged to the trapdoor** (critic, round 2; it got Ruben into the cellar at 2
  players and F1 at 3-4): closed by m. Probe script not committed (`sweep.ts` in the session
  scratchpad): at 2-5 players, F0 walks for the key with his neighbour idle for 0.3 to 2.5 s, then
  the neighbour plays one of 168 input patterns (jump held 0 to 50 steps, left held 0 to 60 steps
  from step 0 to 12, or a plain walk left). 5292 runs, none puts the neighbour in the cellar. The
  same sweep on the level before m (576 runs, fewer patterns): 37 do (8 at 2 players, 14 at 3, 15
  at 4; at 5 F1 rides on a head and is not dragged).
- **Two friends in the cellar**: with F0 hanging from someone on the bench (jumping under a taut
  rope), the bench reads W and a second friend can step into w. Not probed with bots; harmless (f
  still needs one friend alone, the key is still first).

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
  players, the tightest case (the rope is too short for one on s and the other on r).
- **A friend left below at the seat:** someone above stands on d. **Ruben left below:** he sits on
  c.
- **Ruben** never gets through the trapdoor w from the bench, walking, jumping or dragged by the
  rope (see the shortcuts; the one exception, at 4-5 players, is a taut hop from the aisle onto w
  while his neighbour tops a tower, still open, and it soft-locks nothing): leaving the bench towards w he stands on m, and lands on w once it has
  shut. He can get into the cellar only through e, from tier 1, and gets out the same way. The
  escape of two shut in the cellar was probed again with m (2 players, the tightest case): it works.

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
  neighbour stands on. The seat is at floor level, so nobody can hang below it. On the bench the
  links that could carry Ruben's weight stay slack (see the table).
- "A gate never closes on a body" makes every relay plate optional (the door wedge), and it is how
  two shut in the cellar let each other out.
- Friends can stand on Ruben; Ruben stands on nobody.
- In the client, link symbols follow the reading order of the first thing on each link: `relais`
  (gate g, row 7) still comes first, and `marche` (the still step) gets none
  (`thingLayout.test.ts`).
