# coop02 · Le Labo Réseau

> « Un câble RJ45, c'est une corde, non ? »

> **To be redesigned (2026-11-27).** The rope now wraps placed blocks `=` like terrain, so the `=`
> cells this level used to let the rope through are back to plain `#` and its bots fail. The notes
> below that mention `=` describe the previous version.

Files: `packages/shared/src/coop/levels/coop02.ts` (the level),
`packages/shared/src/coop/levels/coop02.solution.ts` (bot solution, shortcuts, and the bot goals
`lowerTo`, `swingTo` and `stepOff`, written on the exported bot API so other levels can reuse them).
Check: `npx tsx packages/shared/scripts/check-coop-level.ts coop02`.

## Idea

« On peut descendre un pote là où personne ne peut sauter. » The rope is 4.5 cells of rest
length (it gives up to 5.4 under load) and the closer the anchor stands to the edge, the deeper
his friend hangs. Walking towards the edge lowers him, walking back brings him up (sign « Avance :
il descend. Recule : il remonte. »). Since rope v2 the rope runs along the floor and over the
rim's corner (shaft B: the depth is the rope's length minus the anchor's distance to the corner),
except through the raised floor's last three tiles (`=`, placed blocks): the cable passes through
them, so in beat 1 the one lowered still hangs on the circle around his anchor and is swung
under the lip.

- Beat 1 (no danger) shows it: a slot under the lip of the raised floor can only be reached by
  someone held at the right depth, and the rope swings him into it. Then the role turns around:
  the ones already in the slot catch the others.
- Beat 2 (deadly) asks for it precisely: the key hangs one row above stripped cables, in a
  window 0.7 cell wide for the anchor. Too deep is death, and the anchor slides towards the void
  if he stands still. With 3 players or more the key is deeper: two go down, one below the
  other, and the bottom one swings to it.

The team stands in chain order with Ruben on the right, so the level puts shaft A on the right:
Ruben is the one nearest the lip, goes down first, and is the first in the server room, so he is
also the one nearest shaft B. At every team size Ruben is on the rope in both beats.

## Map

30 x 28. The raised floor of the lab (floor top 6), the low server room under it (floor top 10,
3 rows high), shaft A on the right (a bottomless catch pit), shaft B on the left (spikes at the
bottom). The group camera shows the whole width; it scrolls down when someone hangs deep.

```
          11111111112222222222
012345678901234567890123456789
##############################  0
##############..............##  1
##############..............##  2
##############..............##  3
##############..............##  4
##############..S...........##  5
######################===...##  6
#...........................##  7
#...........D...............##  8
#...........D...............##  9
#c..####################....## 10
#c..####################....## 11
#c.k####################....## 12
#c.a####################....## 13
#c.a####################....## 14
#c.a####################....## 15
#cja####################....## 16
#c..####################....## 17
#c.b####################....## 18
#c.b####################....## 19
#c.b####################....## 20
#ddd####################....## 21
########################....## 22
                         ...  (shaft A, x 24-27, open down to the bottom of the level, row 27)
```

| Char | What | Where |
|---|---|---|
| `S` | spawns | x 16-20 on the raised floor (F0 on the left, Ruben on the right, nearest shaft A) |
| shaft A | catch pit, bottomless | x 25-27 from the top, plus x 24 (the recess) under the lip |
| the lip | the raised floor's right end, 1 cell thick | x 24, row 6; its edge is x = 25 |
| `=` | the raised floor's last tiles (placed blocks): solid for bodies, the rope passes through them | x 22-24, row 6 (the lip included) |
| the slot | the server room's mouth, 3 rows high | rows 7-9; its floor (row 10) ends at x = 24 |
| `D` | door | x 12, rows 8-9, in the server room |
| shaft B | 3 wide, near rim x = 4 | x 1-3, rows 7-20 |
| `k` | key, 2 players only | x 3 (against shaft B's near wall), row 12 |
| `j` | key, 3+ players | x 2 (one cell out from the wall), row 16 |
| `a` | stripped cables, pointing left, 2 players only | near wall, x 3, rows 13-16 (right below the key) |
| `b` | stripped cables, pointing left, 3+ players | near wall, x 3, rows 18-20 |
| `c` | stripped cables, pointing right | far wall, x 1, rows 10-20 |
| `d` | spikes, pointing up | bottom of shaft B, row 21 |

Signs: « Avance : il descend. Recule : il remonte. » (raised floor), « Ruben, t'es lourd ! Stop !
Remonte un peu ! » (above shaft B, where Ruben goes down and his anchor slides fast).

## Beats and the exact solution (bots)

Order of descent: Ruben, then his neighbour F(n-2), ..., F0 last (the order the team stands in).

### 1. La baie de brassage (shaft A, the slot)

- Ruben walks to the lip; his neighbour stops at x = 21.3, about 3.5 cells back. Ruben steps off
  (slowly over the last cell). The rope catches him beside the lip, then swings him under it
  towards his anchor, and he lands on the slot's floor.
- Then each next body does the same: the one behind it on the raised floor stops at x = 21.3, it
  steps off and is swung into the slot. Whoever is already in the room waits at x = 23.1 (as far
  in as the rope lets the next one still reach the lip) and walks on as soon as he steps off,
  hauling him in; the ones ahead make way. Ruben is the first catcher.
- F0 has nobody behind him: his neighbour waits at the mouth (x = 23.5), F0 steps off, falls
  against the slot's wall below its floor, and is hauled up the wall and over the lip.

### 2. Les câbles dénudés (shaft B)

- 2 players: Ruben goes to the edge (x 4.6), F0 stops at x = 7.2. Ruben steps off: he hangs
  against the near wall with his feet at 12.65, touching his key (row 12), 0.45 above the cables.
  F0 walks back and hauls him up (at Ruben's 1.2 cells/s).
- 3+ players: Ruben at the edge, his neighbour F(n-2) at x 5.4, the next one F(n-3) (F0 with 3
  players, F1 with 4, F2 with 5) at x = 8.0, the others behind. Ruben steps off: his neighbour
  holds him a first rope length down. Then the neighbour steps off too: the anchor holds them
  both (three units of mass), the neighbour against the wall, Ruben one rope below him. The pair
  drops about 2 cells onto the anchor's link, which gives (the rope is elastic), so the anchor
  waits for them to settle, then walks towards the edge until Ruben's feet are at 17.15. Ruben pushes gently left (`swingTo`, at most 1.2 cells/s, never past x 2.8) until
  he touches his key one cell out from the wall, then damps his swing. The anchor walks back and
  hauls the pair over the rim.
- Ruben carries his key: he opens the door (x 12) and everyone goes in.

The anchor goal (`lowerTo`) walks to its place, waits for the rope to hold the friend (and only
from him: everyone between them in the chain hangs too), then walks towards the edge when the
friend is too high (only once he has settled: under 0.5 cells/s up or down) and away when he is
too deep.

### Bot times (checker)

| Players | Total | Beat 1 lowering | Beat 1 train | Beat 2 | Door |
|---|---|---|---|---|---|
| 2 | 12.5 s | 3.1 s | 2.9 s | 5.4 s (line up 2.3, lower 0.9, haul 2.2) | 1.1 s |
| 3 | 19.2 s | 2.9 s | 4.5 s | 10.7 s (line up 2.1, lower 0.7, swing 1.7, haul 6.2) | 1.1 s |
| 4 | 20.0 s | 2.8 s | 6.0 s | 10.1 s | 1.1 s |
| 5 | 21.1 s | 2.6 s | 7.8 s | 9.4 s | 1.3 s |

The bots know the depths; players have to find them (and fight the anchor's slide), so a known
replay is longer than the bots' run, but the level is on the short side of the 45-60 s target.

## Depths, widths and margins

All measured on the real physics (anchor held in place, the other body stepping off), not just
computed, unless marked.

- **Beat 1, the slot.** Ruben lowered lands in it for an anchor held between x 21.0 and 21.8
  (0.8 cell, leaning into the slot or not; 20.8-21.8 without leaning; the bots use 21.3 for
  everyone; rope v2, was 21.3-22.3 with the rigid 4.5). Closer to the edge he hangs below
  the slot's floor against its wall, and the anchor must walk back; further back he hangs beside
  the lip, above the slot, and the anchor must come closer. Landing margin: hung straight below
  an anchor standing on the raised floor, feet reach 6 + 4.5 = 10.5 (more under load), so the
  slot's floor (10) is reached with 0.5 to spare. Held closer (22.0 to 23.6) he hangs against the
  slot's wall, 0.07 to 0.75 under its floor, leaning in or not. An anchor who stands still there does not kill: too far, he slides
  until Ruben lands (2.1 s from x 21.0); too close, he slides until he stands right above Ruben and
  stops (nobody dead after 40 s from 22.5, 23 or 24).
- **Why nobody can drop into the slot.** The wall under the lip is set back one cell (the recess
  at x 24): a falling body must drift a full cell sideways while its whole body is inside the
  3-row opening, which at the fall speed there (15-22 cells/s) takes longer than the opening
  lasts. Measured before the mirror (same geometry): 270 solo jumps and drops off the lip never
  land in it; the shortcut below checks it at 2-5 players.
- **Beat 2, 2 players** (rope v2: the rope runs over the rim's corner, so the depth is linear in
  the anchor's distance; Ruben stepping off dips about 0.6 below his rest depth before the rope
  settles). By anchor x held still, deepest / rest feet: 6.6 → 13.13, death; 6.7 → 13.08 /
  12.51; 6.9 → 12.90 / 12.31; 7.2 → 12.61 / 12.00; 7.5 → 12.31 / 11.68 (the key, from 12.23, is
  touched in the dip up to 7.5); 7.6 → 12.17 / 11.58: no key. Window: anchor 6.7-7.5 (0.8 cell;
  the bots use 7.2), death at 6.6 and closer. An anchor walking slowly towards the edge (no dip)
  brings the rest depth to the key from about 6.95 and to the cables from about 6.15. Bots:
  deepest 12.50, 0.6 above the cables. The same
  whether Ruben or F0 is lowered (the depth is geometry); what changes is the slide: an anchor who
  stands still at 7.2 lowers Ruben onto the cables after 1.1 s (0.3 cells/s), a friend after 2.2 s.
  So the anchor must keep correcting while the one below calls the depth.
- **Beat 2, 3+ players, rope v2.** The neighbour's drop off the rim (about 2 cells) makes the
  pair dip about 1 cell below its rest. Anchor held still, deepest / rest feet of Ruben: 7.0 →
  18.11, death; 7.4 → 17.72 / 16.72; 7.8 → 17.17 / 16.29; 8.0 → 16.84 / 16.05 (above the key
  without a swing: the anchor then walks towards the edge); 8.6 → 14.87 / 14.82. So the anchor
  holds from about 7.3 to 7.85 (0.55 cell), or stands further back and lowers them once they have
  settled (the bots: 8.0, then down to 17.15; deepest 17.10-17.17, about 0.9 above the cables).
  The rest of this paragraph is the rigid rope's: Ruben's feet are about one rope (4.5) below his neighbour's. The key
  (x 2, row 16) is touched by feet between 16.23 and 17.67 with a swing of 0.33 cell; the cables
  start at 18.1. From the 2-player rest depths, that gives (computed) a key window of about x 6.9
  to 7.75 and death closer than about 6.5 (the bots use 7.25). Measured in the bot runs: Ruben
  never deeper than 17.44 (0.66 above the cables) and never further out than x 3.23 (the far
  cables start at 1.75). The anchor holds three units (0.45 cells/s of slide). One rope alone
  reaches feet 14.48 at most: the 3+ key (from 16.25) is 1.8 out of reach of a single body.
  (Rope v2: one rope at its hard stop, anchored at the rim, reaches feet about 15.3, still 0.9
  short; the shortcut "drop at the key" checks it. Bots: Ruben never further out than x 3.13.)
- **Shaft B's bottom.** The spikes (row 21, deadly from 21.55) are deeper than anyone hanging:
  one rope 14.48, two ropes about 19 at most, so even two stepping off together, anchored at the
  very edge, stay 2.5 above them. Three stepping off together reach the spikes. (Rope v2,
  computed: two links both at the hard stop over the rim reach feet about 20.7, 0.9 above them.)
- **Shaft A's depth.** Bottomless: the kill line is at y 29, 19 below the slot's floor and 23
  below the raised floor (checker: ≥ 6). The deepest body in the bot runs reached feet 12.2;
  chains of 4 hanging (18 cells) still stay above it.
- **Room to haul.** Behind the slot's lip: the server room floor, x 4-23, 20 flat free cells.
  Behind shaft B's rim: the same 20 cells. Needed: 5.5 + 0.8 x 3 = 7.9 at 5 players.
- **Ceilings.** The raised floor is 5 rows high and the server room 3: there is nothing to climb
  in this level, so no tower helps. Both are high enough to jump over somebody (measured, both
  ways, Ruben or a friend): the order is the natural one, not a forced one (see Ruben below).
- **Widths.** Shaft B is 3 wide: a body hanging against its near wall cannot reach the far
  cables, and nobody needs to jump across anything.

## Variants by team size

| | 2 players | 3+ players |
|---|---|---|
| Beat 1 | F0 lowers Ruben, then steps off and Ruben catches him | F(n-2) lowers Ruben, F(n-3) lowers F(n-2), ..., F0 steps off last |
| Key | row 12 against the wall (`k`), cables right below (`a`, rows 13-16) | row 16, one cell out (`j`), cables rows 18-20 (`b`) |
| Who goes down in beat 2 | Ruben, held by F0 | Ruben and his neighbour, held by the next one |

## Deadly moments (beat 2 only)

1. The near-wall cables under the key: an anchor too close to the edge, or one who stands still
   (he slides towards the void at 0.15 cells/s per unit hanging: 0.3 with Ruben, 0.45 with Ruben
   and a friend), lowers the one below onto them.
2. The far-wall cables: jumping into shaft B instead of stepping off, or (3+) pumping the swing
   too hard.
3. The spikes at the bottom of shaft B: the whole team going in (or three stepping off together).

Beat 1 cannot kill a team where somebody stands on the raised floor (see the slot's margins):
the only death there is the whole team going into shaft A at once. In the order the level
suggests, nobody ever catches Ruben from below in beat 1. A team that sends Ruben last instead
(a friend jumping over him) meets the case the level critic measured: a catcher who stands still
while Ruben hangs below the slot slides 0.3 cells/s and the whole team falls after about 5 s
(catcher at x 23.5 safe up to 4 s, dead from 5 s; at x 22.0 dead from 6 s; mirrored positions of
the critic's measures); with a friend hanging it takes about 15 s.

## Ruben's active moments

At every team size, in both beats:

- Beat 1: Ruben is the first one down. He trusts his neighbour to stop at the right place (his
  anchor slides twice as fast as for a friend), lands in the slot, and becomes the first catcher:
  he holds and hauls in the next one (the best anchor: a friend hanging from him slides him at
  only 0.15 cells/s).
- Beat 2: Ruben goes down for his own key. With 2 players he is lowered by F0, whose slide gives
  1.1 s before the cables if he stops correcting (« Ruben, t'es lourd ! Stop ! Remonte un peu ! »).
  With 3 or more he is the bottom of the two-rope chain and swings himself to the key. Then he
  opens the door.

Why not forced: the spawn order cannot keep a friend from jumping over Ruben (both rooms are high
enough, and the spawn needs two free rows; a one-row corridor near the lip would force the
order, but the five spawn cells shift with the team size). The level makes Ruben-first the
natural line: he stands nearest the lip and nobody has to pass anybody.

## Communication moment

Beat 2: the one hanging in shaft B sees the cables, the anchor up in the room does not see how
deep he is: « Encore… Stop ! Remonte un peu ! » (the sign). The window is 0.7 cell and the anchor
slides, so this call is needed, not optional. With 3+, Ruben also asks for a gentle swing
(« Doucement ! »: the far cables are in reach of a hard pump). Beat 1: whoever waits at the mouth
tells the last one when to step off.

## Shortcuts

Each is a bot attempt in `shortcuts` whose phase named "ATTEMPT" must fail (if it ever
succeeded, the rest of the intended solution follows and would finish the level). Checked at
2, 3, 4 and 5 players: all fail in their attempt.

| Shortcut | How it fails |
|---|---|
| Everyone drops into shaft A at once (nobody holds), leaning into the slot | nobody can drift a cell sideways while falling past it: everyone falls out of the level |
| Ruben drops into the slot with his neighbour right behind him at the lip | the rope catches him below the slot's floor (feet 10.45 with the rigid rope, 10.75 with rope v2), against its wall: he never gets in (timeout), leaning in or not |
| Ruben steps off at the key with his neighbour right behind him at the edge | 2 players: he takes the key and dies on the cables right below it. 3+: one rope does not reach the deep key: timeout |
| Everyone drops into shaft B to grab the key from below | killed by the cables and the spikes at the bottom |

Not possible by construction: reaching a key from below (shaft B has no floor, shaft A no
bottom), a tower (nothing to climb), the far side of either shaft (level walls).

### Accepted

- Another order (a friend jumps over Ruben and goes first): the depths are the same, only the
  slides change; Ruben then ends up an anchor or the last one down.
- Stepping off while the anchor is already at the right place (a "drop" rather than a slow
  lowering): it is the same move, the anchor's position decides where the rope catches.
- At 3+, two stepping off together in beat 2 (it is the intended move), or in beat 1 (the pit is
  deep enough, and the upper one then hauls the other in).

## Deviations from the plan, and why

- **The key is in beat 2, not beat 1.** The plan puts the key in beat 1's niche and asks beat 2
  for a window between cables at the right depth. There is only one key, so beat 2 would have had
  nothing to fetch; and making beat 2 a crossing (everyone through a window between cables) does
  not work on this rope: the last one has nobody above him, is caught from below and falls deeper
  than anyone lowered from the rim, onto the cables meant for the lowered one. So beat 1 is the
  crossing, without danger (the slot under the lip, then everyone caught from below), and beat 2
  is the precise fetch between the cables, as the plan describes it.
- **Ruben is lowered rather than the anchor.** The plan says Ruben is the best anchor, and that
  if Ruben is the one lowered his anchor slides faster (« Ruben, t'es lourd ! »). Here Ruben is
  the one lowered in both beats (that is what puts him on the rope at 4-5 players), and he is the
  best anchor as the first catcher of beat 1.
- **No pumped swing into a far niche in beat 1.** A body hanging against a wall cannot be swung
  far: the pump (14 cells/s²) is weaker than gravity's pull back (39 cells/s²), so a body held
  from the rim, pressed against the near wall, only swings out to about 2 x 19.6° minus its
  resting angle (measured: 2.2 cells from its anchor, against a 3-wide shaft), and not at all
  once its anchor stands more than about 1.1 cells back. A swing across a shaft therefore needs
  the anchor at the very edge, where the depth cannot be chosen any more. The swing is kept where
  it works: the rope itself swings the one lowered under the lip into the slot (beat 1), and at
  3+ the bottom of a two-rope chain, who hangs freely below the middle one, pushes himself to the
  key one cell out from the wall (beat 2).
- **The "niche" of beat 1 is a slot one cell behind the lip.** A pocket in a straight wall can be
  entered by anyone falling past it (holding towards the wall for one step is enough), and a body
  standing in a pocket under an overhang cannot be hauled back out (the rope pulls it up into its
  ceiling). Setting the wall under the lip back by one cell closes the free fall and suits a
  crossing, which never needs hauling back out.

## History

- First version: shaft A on the left, F0 first and Ruben last in beat 1; at 4-5 players F2 held
  the pair in beat 2 and Ruben did nothing there. The 2-player window was 1.2 cells (key row 13,
  cables from row 14), about 8 s of slide margin: the depth call rarely happened.
- After review: the level is mirrored (Ruben nearest shaft A, so he goes down first in both
  beats), the 2-player key moves up one row right above the cables (window 0.7 cell, 1.1 s of
  slide margin with Ruben below), and the signs move with it.
- Rope v2 (elastic, wraps the terrain): beat 1 failed at every size (the rope wrapped the lip, so
  Ruben hung straight below it). The raised floor's last three cells (x 22-24, row 6) became
  placed blocks `=` (solid for bodies, not for the rope); beat 1's anchor moved from 21.9 to
  21.3. Beat 2 at 3+ killed Ruben on the cables (the pair's drop dips about a cell on the elastic
  rope while the anchor bot walked on): the anchor now stands at 8.0 instead of 7.25 and lowers
  only once they have settled. The 2-player numbers stayed (7.2). All four shortcuts still fail,
  also with a real lean into the slot (probes: everyone dropping off the lip leaning in, Ruben
  dropping in with his anchor at 22.0-23.6).

## Engine notes

- Nothing in the engine was changed. The findings above (pump strength, pockets under overhangs)
  are limits of the current tuning, not bugs.
- Rope v2: with the lip solid for the rope, a friend lowered over it hangs straight down from its
  corner and can only reach the slot by a pumped swing whose radius must be right within about
  0.05 cell (the swing around the lip's lower corner rises as it goes in, so it either passes
  above the slot's floor or hits its side). The raised floor's last three tiles are placed blocks
  (`=`), which the rope passes through like any thing: the old geometry and the old window come
  back, and bodies still meet a solid lip, so nobody drops into the slot.
- An anchor bot that does not wait for the rope to hold its friend (it acted while he was still
  falling) walks to the edge and kills him: `lowerTo` reacts only to a body whose `hanging` flag
  is set and whose chain to the anchor hangs too.
- In the dev tool, one long single-line sign above shaft B was once drawn with part of its text
  missing; the two-line signs are drawn whole (not investigated further).
