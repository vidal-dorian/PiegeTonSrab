# coop01 · La Rentrée

> « C'est où la B12 ? »

Files: `packages/shared/src/coop/levels/coop01.ts` (the level),
`packages/shared/src/coop/levels/coop01.solution.ts` (bot solution and shortcuts).
Check: `npx tsx packages/shared/scripts/check-coop-level.ts coop01`.

## Idea

« Marcher, c'est tirer : celui d'en haut remonte les autres. » The first level teaches the rope,
and only the rope: no plates, no crates, nothing that kills.

- Beat 1 shows the rope without asking anything: a corridor where whoever rushes ahead is held
  back by the others. At its end, the key is right behind a window.
- Beat 2 asks for the rope's one trick: a 3-high wall nobody climbs alone and Ruben cannot be
  carried over. Ruben makes the base, a friend jumps up from his head and *walks on*: walking hauls
  Ruben up, slowly (1.2 cells/s, the gag).
- Beat 3 turns it around: the tower can no longer stand at the foot of the wall (a trench is in
  front of it), so the friend jumps *across* from a head, and the others let themselves fall into
  the trench and trust the rope to bring them up a 6-high face.
- Beat 4 is the payoff: down into the room seen through the window, a 2-tower next to the key's
  pillar ("courte échelle"), and the door of the B12, on the other side of the glass the team
  pressed its noses against at the start.

No death is possible anywhere: no spikes, saws or `~`, and every column has a floor (the trench
is 3 deep with a floor; the bottom row is solid all along). Random play (30 seeds x 2-5 players
x 60 s of random keys) never kills.

## Map

64 x 21. Corridor floor top 13, middle floor (top of the muret) 10, top floor 7, B12 floor 19.

```
          111111111122222222223333333333444444444455555555556666
0123456789012345678901234567890123456789012345678901234567890123
################################################################   0
####################...........................................#   1
####################...........................................#   2
####################...........................................#   3
####################...........................................#   4
####################...........................................#   5
####################...........................................#   6
####################...................############............#   7
####################...................############............#   8
#......................................############............#   9
#.........................###########..###############.........#  10
#.........................%.........#..############............#  11
#.S.......................%.........#..############............#  12
###########################.........###############...###......#  13
###########################....................................#  14
###########################....K...............................#  15
###########################....#.........................###...#  16
################################..........D....................#  17
################################..........D....................#  18
################################################################  19
################################################################  20
```

| Where | What |
|---|---|
| x 1-25, rows 9-12 (x 1-19 under a ceiling, x 20-25 open to the top) | Le couloir, floor top 13, spawn x 2-6 |
| x 26, rows 10-12 | Le muret de 3: its face is the window `%` (rows 11-12) |
| x 26-36, top 10 | middle floor, 11 flat cells (the roof of the B12) |
| x 37-38, rows 10-12 | La tranchée, 2 wide, 3 deep, floor at row 13 |
| x 39-50, top 7 | the 3-high wall and the top floor, 12 flat cells |
| x 51-59, slabs at rows 10, 13, 16 | stairs down: three 1-thick slabs, 3 cells apart (drops of 3) |
| x 27-62, B12 | the classroom: tall part x 27-35 (rows 11-18), low part x 36-62 (rows 14-18) |
| x 31, rows 16-18; `K` at (31, 15) | the key on a pillar 3 high, 1 wide; a shelf (top 17) behind it, x 27-30 |
| x 42, rows 17-18 | the door of the B12 |

Signs (French): « Personne ne lâche personne » (corridor), « Salle B12 → » (at the muret),
« Tire ! » (over the middle floor), « Saute, je te remonte ! » (over the top floor),
« En bas ! » (stairs), « Ruben, fais la base ! » (next to the pillar), « Salle B12 » (door).

The group camera (about 32 x 18 cells) shows the window and the key from the spawn.

## Beats and the exact solution (bots)

Roles: R is Ruben, F0..F3 the friends in seat order. Spawn order left to right is F0..F3, R, so
Ruben walks in front; his chain neighbour is the last friend F(n-2). Times are the bots' at 2 /
5 players.

### 1. Le couloir (3.1 / 2.7 s)

Everyone walks right. Whoever runs ahead is held by the rope at 4.5 cells from the next one
(« Personne ne lâche personne »); pulling each other is harmless. The team lines up against the
muret, Ruben's nose on the window (25.45), F(n-2) right behind him.

### 2. Le muret de 3 (4.4 / 7.4 s)

F(n-2) climbs on Ruben's head, jumps onto the middle floor (from a 2-tower: apex 0.9 above the
top) and walks on (« Tire ! »): Ruben comes up the window at 1.2 cells/s, and every friend still
below is hauled by a neighbour who is up and keeps walking. Everyone walks towards x 35.6 and
bunches up.

### 3. La tranchée (7.1 / 8.9 s)

The tower stands on the rim (Ruben at 36.45, the edge at 37), with Ruben at its base. Whoever
jumps across lands 3 cells higher and about 3.5 cells further: its rope neighbours have to come
along (see "The rope across the trench" below). The bots do it the robust way:

- After the muret the friends who came up first stand *in front of* Ruben. The one right in front
  of him climbs on his head from the front, the next one on that friend's head, and Ruben carries
  the pile to the rim (a rider moves with its base): Ruben's active moment.
  - 2 players: the pile is Ruben + F0.
  - 3+ players: a 3-tower, Ruben + the jumper's other neighbour + the jumper (3 players:
    R, F0, F1; 4: R, F1, F2; 5: R, F2, F3).
- The top jumps across onto the wall (from a 2-tower 0.9 above the top, from a 3-tower 1.8).
- It walks on along the top floor (« Saute, je te remonte ! »): Ruben and the middle of the pile
  fall into the trench and come up the 6-high face; the others walk off the rim one after another
  ("trust jumps") and are hauled up by whoever is already on top and walking. Everyone bunches
  up towards x 49.6.

### 4. La salle B12 (12.5 / 11.6 s)

Everyone walks off the top floor and down the three slabs (drops of 3: nobody hangs, the order of
the line is kept), then back left under the top floor to the pillar.

- The tower stands right of the pillar. If a friend reached the pillar first, it climbs on the
  body behind it (the base at 33.45) from the pillar side; if Ruben is first, the next friend
  climbs on Ruben from the right. (« Ruben, fais la base ! »)
- The climber jumps onto the pillar (apex 0.9 above its top) and takes the key on landing.
- The others walk past the door; the key carrier jumps down and touches the door (it opens), and
  everyone goes in.

### Times

| Players | 2 | 3 | 4 | 5 |
|---|---|---|---|---|
| Bots | 26.9 s | 27.7 s | 29.2 s | 30.5 s |

Humans who know the level should take 45 to 60 s (the bots never hesitate and pile up instantly).

## The rope across the trench, and at the pillar

A jumper cannot land further from its rope neighbours than 4.5 cells (centre to centre). Measured
on the rim with `placeBody` (scratch script, not committed), the top of a tower on the rim jumping
right:

| Tower on the rim | Result |
|---|---|
| 2-tower Ruben + his neighbour, the jumper's other neighbour 0.82 / 1.0 / 1.2 cells behind Ruben | across, landing at x 38.9 / 38.8 / 38.6 (on the lip) |
| same, 1.5 cells behind | yanked back into the trench (harmless) |
| 2-tower F1 + F0 (F0 is the end of the rope) | across, landing at 39.7 |
| 3-tower Ruben + the jumper's other neighbour + the jumper | across, landing at 39.1 |

So at 2 players the plain 2-tower always works, and at 3+ the team must huddle right behind Ruben
(« Collez-vous ! », the corridor's sign coming back), or let the end of the rope jump, or build a
3-tower. All three are fine; a failed jump just drops the jumper into the floored trench. The same
holds at the pillar: the climber's rope neighbours must stand within about 3.3 cells of it (the
base and the next body in line).

## Heights, widths and margins

| Target | Reach | Margin |
|---|---|---|
| Muret (3) alone | apex 3.0 | none: a step of 3 is never climbed alone (engine fact) |
| Muret (3) from Ruben's head | apex 3.9 | 0.9 |
| Wall beyond the trench (3 above the rim) alone | apex 3.0 | none (as above) |
| Wall from a 2-tower / 3-tower on the rim | 3.9 / 4.8 | 0.9 / 1.8 |
| Wall from inside the trench (6): 4-tower on the trench floor | 5.7 | 0.3 short |
| Pillar (3) alone, the key beside it | apex 3.0; the key's box can only be touched from above the pillar's top | none (as a 3-step) |
| Pillar from a 2-tower | 3.9 | 0.9 |
| Stairs slabs back up (3 each) | apex 3.0 | nobody needs to go back up |

Room to haul (5.5 + 0.8 x (players - 2): 5.5, 6.3, 7.1, 7.9 cells): the middle floor has 11 flat
cells behind the muret's lip, the top floor 12 behind the wall's lip, with no overhang. Hauling a
chain of 5 out of the trench needs the hauler of the last friend at about x 43.2 or more (estimated
from the rope length: feet within 0.6 of the lip); with the five bunched up, that hauler stands
near 46. The bots haul all five out in 5.8 s.

Widths: the rope is never asked to cover a width: the only crossing (the trench) is 2 cells and is
a height problem (3 up from a head).

Ceilings: none are needed. Every beat's real cost is hauling Ruben, which no tower avoids (he can
never stand on anyone). A taller tower can only replace a jump: a 3-tower at the muret lets two
friends up without being hauled (accepted, as the plan says), a 3-tower on the rim is one of the
three ways across (above), a 3-tower at the pillar also reaches the key. Nothing else is in reach
of a tall tower (the top floor is 14 cells from the muret).

## Variants by team size

No cells or things change with the team size. What changes is the solution:

| | 2 players | 3+ players |
|---|---|---|
| Muret | Ruben + F0 | Ruben + F(n-2); a 3-tower is accepted |
| Trench | Ruben carries F0 to the rim, F0 jumps | huddle behind Ruben, or the end of the rope jumps, or a 3-tower (bots: 3-tower carried by Ruben) |
| Haul out of the trench | Ruben alone, 6 cells at 1.2 cells/s | a line of trust jumps, hauled one by one through the chain |
| Pillar | Ruben + F0 | any 2-tower whose climber's neighbours stand right behind |

## Shortcuts

Closed (each is in `shortcuts` and fails at 2, 3, 4 and 5 players, in its `ATTEMPT` phase):

| Shortcut | What the bots try | Why it fails |
|---|---|---|
| Ruben climbs the muret on his own | the climber goes up as intended and stands still; Ruben and the others jump at the 3-high muret for 15 s | a lone jump peaks exactly at the top; only a walking hauler lifts Ruben |
| Ruben on a friend's head | Ruben tries to climb on F(n-2) at the muret and jump from there | Ruben lands on the friend, squashes him and slides off (6 squashes in 8 s at every size); he never stands higher than the floor |
| jump the trench alone | everyone gathers behind the rim (slack rope), then the front friend jumps at the wall alone, then hops against its face from inside the trench for 15 s | 3 up from the rim is a lone jump's apex; from inside the trench the face is 6 |
| grab the key alone | after the whole level, the friend nearest the pillar jumps at the key alone for 12 s (then everyone tries the door) | the key's box (x 31.15-31.85) is over the pillar: touching it needs the feet above the pillar's top (3 above the floor), out of a lone jump's reach |

Accepted:

- A 3-tower instead of a haul at the muret (two friends up without hauling; Ruben is still hauled).
- At 3+ players, a 3-tower on the rim, or the end of the rope jumping from its neighbour's head.
- At 5 players, a 4-tower inside the trench with the fifth friend stepping onto it from the rim
  should reach the top floor (by the numbers: its top stands at 9.4, apex 6.4; not played by the
  bots): harder than the intended tower on the rim, and Ruben is still hauled.

## Deadly moments

None. No death is possible at any team size (no hazards, every column floored, the trench has a
floor 3 below the rim, nobody can leave the level).

## Ruben's moment

Ruben is the base of every tower: at the muret (the only possible base at 2 players), on the rim,
where he also walks the pile to the edge with his friends on his head, and at the pillar
(« Ruben, fais la base ! »). Then he is the slow, heavy one hauled up the window and the trench
(the gag of the level: 1.2 cells/s).

## Communication moment

The trench: « Saute, je te remonte ! » The friend on top has to tell the others to let themselves
fall in, and at 3+ players to huddle up first (« Collez-vous derrière Ruben ! ») so that the jumper's
rope reaches across. Also « Bouge pas, je monte ! » to Ruben at every tower.

## Deviations from the plan

- **The trench has a floor** (3 below the rim) instead of being a bottomless catch pit. An anchor
  holding hanging friends slides towards the void at 0.15 cells/s per unit of hanging mass, so with
  everyone but the hauler hanging in a bottomless pit the hauler eventually slides in and the whole
  team falls: a death, which level 1 must not have. With the floor the trench still catches (a
  friend who falls in is hauled up the 6-high face) and anyone stuck in it climbs out with a
  2-tower or is hauled back by whoever stands on the rim, at every team size.
- **At 3+ players the trench needs the jumper's rope neighbours close** (huddle, end of the rope,
  or a 3-tower), measured above. A plain 2-tower with the rest of the team a couple of cells back
  fails (harmlessly). It follows from the rope (4.5) against a 2-wide trench and a 3-high wall;
  a 1-wide trench would relax it a little (4.1 with the neighbour touching Ruben) but the plan asks
  for 2 cells.
- **The route loops back**: the key is seen through the window at the end of the corridor, and
  reached at the end by coming down into that room from the other side (three slabs down, then
  back left under the top floor). A first version dropped 12 cells down a shaft: friends hung and
  swung in the rope and reached the pillar in an order where no climber had its rope neighbours
  near (5 players). Drops of 3 keep the line in order.
- **The pillar has a shelf behind it** (top 17, one below the pillar's top) instead of open floor:
  a friend who jumps off the pillar on the wrong side can step back on instead of being stuck behind
  a 3-high wall. The door is on the open side of the pillar, so Ruben never has to cross it.
- The bots' tower at the trench is Ruben carrying the pile to the rim, because after the muret the
  friends who came up first stand in front of him and nobody can walk through anybody.
