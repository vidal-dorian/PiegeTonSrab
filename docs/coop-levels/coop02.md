# coop02 · Le Labo Réseau

> « Un câble RJ45, c'est une corde, non ? »

Files: `packages/shared/src/coop/levels/coop02.ts` (the level),
`packages/shared/src/coop/levels/coop02.solution.ts` (bot solution, shortcuts, and the bot goals
`lowerTo`, `lowerOnto`, `stepOff`, `stepOffAndLean` and `swingTo`, written on the exported bot API
so other levels can reuse them; `patience`, variants that must win too: the last one into the slot
leaves the lip and the ones in the slot stand still for 10 s), `packages/client/src/coop/coop02Patience.test.ts`
(runs them). Check: `npx tsx packages/shared/scripts/check-coop-level.ts coop02`.

## Idea

« On peut descendre un pote là où personne ne peut sauter. » The rope is 4.5 cells of rest length
(it gives up to 5.4 under load) and it wraps the scenery's corners. Over an edge it runs along the
floor and over the edge's corner, so the one who steps off hangs as deep below that corner as the
rope is long past it: walking towards the edge lowers him, walking back brings him up (sign
« Avance : il descend. Recule : il remonte. »). The corner is the pivot; the anchor's distance to
it sets the depth, cell for cell.

- Beat 1 (no danger) shows it: a slot under the lip of the raised floor can only be reached by
  someone held at the slot's height, who leans in under the lip (the rope then wraps the lip's
  lower corner as well) and is set down on the slot's floor by his anchor walking towards the
  edge. Then the role turns around: the ones already in make way for the next ones, and the last
  one, who has nobody behind him, is hauled up from below. A fragile tile across the shaft, 4 below
  the slot's floor, catches him while the one in the slot is slow to haul (it holds a friend, not
  Ruben or two).
- Beat 2 (deadly) asks for it precisely: the key hangs one row above stripped cables, in a window
  0.65 cell wide for the anchor. Too deep is death, and the anchor slides towards the void if he
  stands still. With 3 players or more the key is deeper: two go down, one below the other, and the
  bottom one swings to it.

The team stands in chain order with Ruben on the right, so the level puts shaft A on the right:
Ruben is the one nearest the lip, goes down first, and is the first in the server room, so he is
also the one nearest shaft B. At every team size Ruben is on the rope in both beats.

## Map

30 x 28. The raised floor of the lab (floor top 6), with a low cable duct over its last three
cells and over shaft A (one row of headroom: nobody can jump there); the low server room under it
(floor top 10, 3 rows high); shaft A on the right (a bottomless catch pit), shaft B on the left
(spikes at the bottom). The group camera shows the whole width; it scrolls down when someone
hangs deep.

```
          11111111112222222222
012345678901234567890123456789
##############################  0
##############........########  1
##############........########  2
##############........########  3
##############........########  4
##############..S...........##  5
########################g...##  6
#...........................##  7
#...........D...............##  8
#...........D...............##  9
#c..####################....## 10
#c..####################....## 11
#c.k####################....## 12
#c.a####################....## 13
#c.a####################ffff## 14
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
| the duct | the raised floor's ceiling drops to one row of headroom | x 22-27, rows 1-4 solid (over the last three cells of the raised floor and over shaft A) |
| shaft A | catch pit, bottomless (under the tile) | x 25-27 from the duct down, plus x 24 (the recess) under the lip |
| `f` | fragile tile (`fragile`): holds one friend, breaks under a weight of 2 (Ruben, or two), back at the restart | x 24-27, row 14: across shaft A, 4 below the slot's floor |
| the lip | the raised floor's right end, 1 cell thick | x 24, row 6; its corners (25, 6) and (25, 7) are the ones the rope wraps |
| `g` | the lip's cell is a non-slip floor's end (`grip`): solid terrain like `#` (the rope wraps it); an idle anchor's slide never takes him off it (it stops with 0.1 of his feet on it, centre 25.30); drawn as an orange striped band | x 24, row 6 |
| the slot | the server room's mouth, 3 rows high | rows 7-9; its floor (row 10) ends at x = 24, one cell short of the lip |
| `D` | door | x 12, rows 8-9, in the server room |
| shaft B | 3 wide, near rim x = 4 | x 1-3, rows 7-20 |
| `k` | key, 2 players only | x 3 (against shaft B's near wall), row 12 |
| `j` | key, 3+ players | x 2 (one cell out from the wall), row 16 |
| `a` | stripped cables, pointing left, 2 players only | near wall, x 3, rows 13-16 (right below the key) |
| `b` | stripped cables, pointing left, 3+ players | near wall, x 3, rows 18-20 |
| `c` | stripped cables, pointing right | far wall, x 1, rows 10-20 |
| `d` | spikes, pointing up | bottom of shaft B, row 21 |

Signs: « Avance : il descend. Recule : il remonte. En bas : penche-toi ! » (raised floor, before
the duct), « Ruben, t'es lourd ! Stop ! Remonte un peu ! » (above shaft B, where Ruben goes down
and his anchor slides fast).

## The wrapped rope's part

- **The lip's corner is the pivot (beat 1).** With the rope over (25, 6), Ruben's feet hang at
  about (anchor's x − 13.6), plus the dip when he drops. The anchor stopping about two cells back
  holds him in the slot's mouth; walking the last cell towards the edge sets him down.
- **Leaning in wraps the lip's lower corner (beat 1).** Hanging under (25, 6), Ruben is a cell
  too far out (the slot's floor ends at 24, the recess is under the lip). Pushing towards the slot
  (about 20° of lean: the pump against gravity) swings him under the lip; the rope wraps (25, 7)
  and the lean, about 0.9 cell at the slot's depth, takes his left side over the floor's end.
  Without the lean he never gets in.
- **The lip as a pulley (beat 1, the train).** Once Ruben is in, his link to the one above runs
  over both corners of the lip: the next one steps off between the one holding him on the raised
  floor and the one waiting in the slot, each link wrapped round the lip.
- **The idle catcher and the tile (beat 1).** The last one hangs from the one in the slot against
  the side of the slot's floor, his centre 0.4 past its end (x 24.40). An idle anchor slides
  towards the friend below him (towards the corner he hangs over while the rope wraps it, but the
  wrap is let go once the anchor's centre passes the corner, since the friend hangs past it), so
  the one in the slot slides to x 24.40, exactly where he loses the floor, and both fall. The tile
  4 below the floor is where the last one ends up: he stands on it, nobody hangs, nobody slides.
- **The idle anchor and the non-slip lip (beat 1).** The same slide on the raised floor: an anchor
  who stands still while the one he lowered hangs straight below the lip (not leaning in) slides
  towards the lip's corner, and the one below hangs right under it (x 25.0). Without a stop, once
  the anchor's centre passed the corner the wrap was let go, and when the one below hung a little
  past the corner both crept on over the void together and the anchor lost the floor at x 25.40.
  The lip's cell (x 24) is a non-slip floor's end (`grip`): the anchor slides on it as anywhere,
  past the corner too, but the slide stops with 0.1 of his feet still on the cell (centre 25.30),
  so he never loses the floor. Up to there nothing changes: a friend leaning in is still set down
  on the slot's floor by the slide (it needs the anchor at about 24.45-24.6 for a friend), and the
  slide past the corner and back still calms a friend left swinging in the slot's mouth. Mostly the
  anchor ends with his centre on the corner (25.00), the one below right under him at feet 10.82;
  now and then he creeps to 25.2-25.3 and holds there. « Recule ! » brings the one below up.
- **The rim's corner sets the depth (beat 2).** Same rule over shaft B's rim: depth is linear in
  the anchor's distance, hence the narrow, honest window.

## Beats and the exact solution (bots)

Order of descent: Ruben, then his neighbour F(n-2), ..., F0 last (the order the team stands in).

### 1. La baie de brassage (shaft A, the slot)

- Ruben walks to the lip; his neighbour stops at x = 22.7. Ruben steps off (slowly over the last
  cell) and leans left as soon as he is in the air. The rope catches him under the lip's corner,
  in the slot's mouth (feet about 8.7-9.3 after the dip), and the lean takes him over the floor's
  end. His neighbour then walks towards the edge at 1.5 cells/s (`lowerOnto`) until Ruben stands
  on the floor's end (about x 24.0), and stops.
- Each next one does the same (`trainStage`): the one already in waits at the floor's end
  (x = 23.75, where the link round the lip's two corners stays slack), the next one steps off
  leaning in while the one behind him on the raised floor stands at 22.7, the one waiting makes
  way (x 22.4) once he is in the air, the ones further in close up, and the one behind sets him
  down.
- F0 has nobody behind him: the one before him waits at the floor's end, F0 steps off, drops
  against the side of the slot's floor and touches the tile (feet 14.00) in the catch's dip, and is
  hauled up and over the floor's end as soon as he hangs or stands there; the others walk on with
  the hauler. If they stand still instead, F0 stands on the tile until they haul (`patience`).

The anchor goal (`lowerOnto`) waits for the rope to hold the friend, then lowers him only while he
hangs over the slot's floor and has settled (under 1 cell/s up or down), and walks back (« Recule
! ») while he hangs below the floor's top without being over it.

### 2. Les câbles dénudés (shaft B)

- 2 players: Ruben goes to the edge (x 4.6), F0 stops at x = 6.9. Ruben steps off: he hangs
  against the near wall with his feet at 12.65 (`lowerTo`), touching his key (row 12), 0.45 above
  the cables. F0 walks back and hauls him up (at Ruben's 1.2 cells/s).
- 3+ players: Ruben at the edge, his neighbour F(n-2) at x 5.4, the next one F(n-3) (F0 with 3
  players, F1 with 4, F2 with 5) at x = 8.0, the others behind. Ruben steps off: his neighbour
  holds him a first rope length down. Then the neighbour steps off too: the anchor holds them both
  (three units of mass), the neighbour against the wall, Ruben one rope below him. The pair drops
  about 2 cells onto the anchor's link, which gives, so the anchor waits for them to settle, then
  walks towards the edge until Ruben's feet are at 17.15. Ruben pushes gently left (`swingTo`, at
  most 1.2 cells/s, never past x 2.8) until he touches his key one cell out from the wall, then
  damps his swing. The anchor walks back and hauls the pair over the rim.
- Ruben carries his key: he opens the door (x 12) and everyone goes in.

### Bot times (checker)

| Players | Total | Beat 1: Ruben | Beat 1: the others | Beat 2 | Door |
|---|---|---|---|---|---|
| 2 | 14.5 s | 4.4 s | 3.4 s (F0 hauled in) | 5.6 s (line up 2.4, lower 0.9, haul 2.3) | 1.1 s |
| 3 | 25.5 s | 5.4 s | 7.6 s (4.5, 3.1) | 11.3 s (line up 2.2, lower 0.8, swing 1.7, haul 6.6) | 1.1 s |
| 4 | 30.7 s | 5.2 s | 13.6 s (5.9, 4.5, 3.2) | 10.9 s | 1.1 s |
| 5 | 35.9 s | 4.8 s | 19.3 s (5.8, 5.8, 4.5, 3.2) | 10.6 s | 1.3 s |

With the ones in the slot standing still 10 s once the last one has left the lip (`patience`:
leaning in, straight, at a run, or with the one waiting as far in as the rope lets him), every team
size wins: 23.3-24.0 s at 2 players, 34.4-35.0 at 3, 39.4-40.0 at 4, 44.8-45.4 at 5; the last one
stands on the tile 9.6-9.7 s, its load never above 1.

The bots know the depths; players have to find them (and fight the anchor's slide), so a known
replay is longer than the bots' run.

## Depths, widths and margins

All measured on the real physics (2 players, Ruben lowered by F0, the anchor's position as given),
not computed, unless marked.

- **Beat 1, held still.** Anchor held still at x (walking back whenever dragged), Ruben stepping
  off and leaning in; his feet deepest in the dip / at rest, and where he hangs:
  21.0 → 7.16 / 7.12 and 21.5 → 7.89 / 7.70, against the lip's face (not yet under it);
  22.0 → 8.86 / 8.21, in the mouth but not yet over the floor (x 24.64);
  22.5 → 9.32 / 8.66, at the floor's end (x 24.44); 23.0 → 9.84 / 9.14, 23.3 → 10.09 / 9.47,
  23.6 → 10.37 / 9.71, 23.8 → 10.53 / 9.84, over the floor (x 24.01-24.39).
  Held still, an anchor never sets him down: the rope keeps him above the floor until the anchor
  comes closer to the edge (Ruben lands with the anchor at about 23.9-24.3).
- **Beat 1, doing nothing.** An anchor who stands still slides towards the edge (0.3 cells/s with
  Ruben). Ruben leaning in lands by himself from an anchor at 21.75 to 23.5, within 2.6 to 8.7 s
  (3.9 to 10.1 s stepping off at 0.8 cells/s). From 21.5 or further back he slides down the lip's
  face and ends below the floor's top, against its side (feet 10.77, the anchor at 25.0). Ruben
  not leaning in ends hanging right under his anchor, feet 10.82: the anchor's centre at 25.00 (22
  of 26 runs from 20.0-23.8, both speeds) or at 25.21-25.29 (4), never further than 25.30, the
  lip's non-slip end (before it, 2 of 26 ended at 25.31-25.32 and the walked runs of "Deadly
  moments" went on to 25.40 and fell). A friend lowered by an idle Ruben, not leaning in: the same
  end, the anchor at 25.00 (26 of 26). These are standoffs that walking back undoes.
- **Beat 1, too deep.** An anchor who follows Ruben to the edge leaves him against the side of the
  slot's floor, feet 10.57 (deepest 11.1): that never resolves by itself (the slide only takes him
  deeper). Walking back brings him up, and he climbs onto the floor's end as soon as his feet clear
  its top (measured: in on the first try, 1.2 s after the anchor turns back). Not deadly: shaft A
  is a catch pit and Ruben is held.
- **Beat 1, the last one (2 players: one catcher alone in the slot).** Without the tile (the
  critic's probes, confirmed): with Ruben on the floor's end (x 24.33, as far in as F0 on the lip
  lets him) and F0 stepping off, an idle Ruben is pulled off the end about 1.1 s after the step and
  both fall: hauling within 1.0 s gets F0 in, 1.5 s or later is death, leaning in or not, stepping
  or running off. Further in (F0 first walks to the lip's end, Ruben at 23.2-23.6) he only gains
  time: dead 7.5-8.7 s after the step. At 3-5 the ones behind the catcher hold him: no death at any
  wait. With the tile (row 14): F0 hanging from Ruben rests at feet 14.50-14.65 (Ruben from 23.6 to
  the end) and dips below that when caught, so he stands on the tile (feet 14.00) within the first
  second, and nobody slides: Ruben idle up to 30 s (at the end or at 23.6, F0 leaning in or not),
  or 10 s with F0 first at the lip's end and Ruben at 23.2-23.9, then hauling: in every time.
  A tile one row lower (top 15) did not do it: from 23.6, F0 hung 0.35 above it until Ruben slid
  off (7.5 s). Hauled from the tile, he is in 2.0-3.0 s after the hauler sets off, as from the wall.
- **Beat 1, the other order.** A friend lowered by Ruben lands from every anchor place between
  22.0 and 23.8 (1.7-6.1 s with the bots' lowering); the depth is the same (geometry), the slide
  half as fast.
- **Why the slot is 3 rows deep.** The lean is about 20° from the vertical (the pump against
  gravity), round the lip's lower corner (25, 7): the deeper the body, the further it leans
  sideways. At the slot's depth it is about 0.9 cell, enough for the 0.6 the floor's end needs.
  Probed with a 2-row mouth (floor top 9): at most 0.55 cell, and nobody ever lands.
- **Why nobody can drop into the slot.** The wall under the lip is set back one cell (the recess at
  x 24): a falling body must drift a full cell sideways while its whole body is inside the 3-row
  opening, which at the fall speed there (12-18 cells/s) it cannot. Probed: 780 runs of the whole
  team leaving the lip together (2, 3 and 5 players; run-ups from 0.5 to 5 cells; no jump or jumps
  held 0.05-0.42 s at 0-0.8 from the edge; leaning in after 0-0.3 s): nobody reaches the slot. Of
  1080 more with staggered departures (0-0.8 s apart, 0.85-3 cells apart, walking or stepping off
  slowly, jumps), the 193 that got someone in all had a team-mate still standing on the raised
  floor when the first one dropped: a lowering, the intended move. **The duct is what closes the
  jumps**: without it, 77 of the 780 got a friend in, by jumping off right after Ruben, landing on
  his head (nobody stands on Ruben: the friend slides off him with no fall speed of his own) and
  drifting into the slot from there (the shortcut "everyone jumps off" checks it; without the duct
  its attempt passes at 3-5 players).
- **Beat 2, 2 players** (the rope runs over the rim's corner, so the depth is linear in the
  anchor's distance; Ruben stepping off dips about 0.3-0.5 below his rest depth). By anchor x held
  still, deepest / rest feet: 6.55 → 13.10, death; 6.6 → 13.08 / 12.62; 6.9 → 12.66 / 12.32;
  7.2 → 12.30 / 12.01 (the key, from 12.23, is touched in the dip up to 7.2); 7.3 → 12.20 / 11.91:
  no key. Window: anchor 6.6-7.25 (0.65 cell; the bots use 6.9), death at 6.55 and closer. Bots:
  deepest 12.54, 0.56 above the cables. The same whether Ruben or F0 is lowered (the depth is
  geometry); what changes is the slide: an anchor who stands still lowers Ruben onto the cables
  about 3 s after he steps off (0.3 cells/s: 3.7 s from 6.9 including the step, 4.7 s from 7.2), a
  friend about twice as slowly. So the anchor must keep correcting while
  the one below calls the depth.
- **Beat 2, 3+ players.** The neighbour's drop off the rim (about 2 cells) makes the pair dip
  about 1 cell below its rest. Anchor held still, deepest / rest feet of Ruben (rope v2, same
  geometry): 7.0 → 18.11, death; 7.4 → 17.72 / 16.72; 7.8 → 17.17 / 16.29; 8.0 → 16.84 / 16.05
  (above the key without a swing: the anchor then walks towards the edge); 8.6 → 14.87 / 14.82.
  So the anchor holds from about 7.3 to 7.85 (0.55 cell), or stands further back and lowers them
  once they have settled (the bots: 8.0, then down to 17.15). The key (x 2, row 16) is touched by
  feet between 16.23 and 17.67 with a swing of a third of a cell; the cables start at 18.1. Bots:
  Ruben's deepest feet 16.87-16.98 (1.1 above the cables), never further out than x 3.06 (the far
  cables start at 1.75). One link alone, held at the very edge and stretched to its stop, takes
  Ruben's feet to 14.66 at most, even swinging (smallest x 2.77): the 3+ key is 1.6 out of reach of
  a single body.
- **Shaft B's bottom.** The spikes (row 21, deadly from 21.55) are deeper than anyone hanging:
  one link at its stop 14.66, two ropes about 19 at most, so even two stepping off together,
  anchored at the very edge, stay above them. (Computed: two links both at the stop over the rim
  reach feet about 20.7, 0.9 above them.) Three stepping off together reach the spikes.
- **Shaft A's depth.** Bottomless under the tile: the kill line is at y 29, 19 below the slot's
  floor and 23 below the raised floor (checker: ≥ 6; the tile is a thing, not terrain). The deepest
  body in the bot runs reached feet 14.00 (the last one, on the tile); chains of 4 hanging
  (18 cells) still stay above the kill line once the tile has broken under them.
- **The tile's height.** 4 below the slot's floor top: a lone jump reaches 3, and a tower needs two
  bodies on it (weight 2: it breaks). Above it, F0's resting depth from the slot (14.50-14.65), so
  that he always lands on it.
- **Longest link** in the bot runs: 5.40 at 2 players, 5.42 at 3-5 (the last one's catch from the
  slot, at the stop); at most 2 wraps per link (the lip's two corners).
- **Room to haul.** Behind the slot's floor end: the server room floor, x 4-23, 20 flat free
  cells. Behind shaft B's rim: the same 20 cells. Needed: 5.5 + 0.8 x 3 = 7.9 at 5 players.
- **Ceilings.** The raised floor is 5 rows high up to x 21, then the duct leaves one row (no jump
  in its last three cells or over shaft A); the server room is 3 rows. There is nothing to climb in
  this level, so no tower helps. The raised floor's high part and the server room are high enough
  to jump over somebody (the order is the natural one, not a forced one: see Ruben below).
- **Widths.** Shaft B is 3 wide: a body hanging against its near wall cannot reach the far
  cables, and nobody needs to jump across anything.

## Variants by team size

| | 2 players | 3+ players |
|---|---|---|
| Beat 1 | F0 lowers Ruben into the slot, then steps off and Ruben hauls him in | F(n-2) lowers Ruben, F(n-3) lowers F(n-2), ..., F0 steps off last and is hauled in |
| Key | row 12 against the wall (`k`), cables right below (`a`, rows 13-16) | row 16, one cell out (`j`), cables rows 18-20 (`b`) |
| Who goes down in beat 2 | Ruben, held by F0 | Ruben and his neighbour, held by the next one |

## Deadly moments (beat 2)

1. The near-wall cables under the key: an anchor too close to the edge, or one who stands still
   (he slides towards the void at 0.15 cells/s per unit hanging: 0.3 with Ruben, 0.45 with Ruben
   and a friend), lowers the one below onto them.
2. The far-wall cables: jumping into shaft B instead of stepping off, or (3+) pumping the swing
   too hard.
3. The spikes at the bottom of shaft B: the whole team going in (or three stepping off together).

Beat 1 does not kill in the order the team stands in, even if the team does nothing. While
somebody stands on the raised floor, the one lowered hangs safely in the catch pit (too deep or too
high) and his anchor fixes it, or stands still for ever: an idle anchor's slide never takes him off
the lip's non-slip end. The last one, who steps off with nobody left up there, lands on the tile if the one
in the slot is slow to haul. What still kills in beat 1:

- the whole team going into shaft A at once (nobody holds; the tile breaks under two);
- a lone body in the slot standing still while a weight of 2 hangs below him, since that weight
  breaks the tile: Ruben as the last one at 2 players (the other order, a friend having jumped over
  him first), or the last two stepping off together at 3 players (or at 4, the catcher alone in
  the slot's front with the others too far in to hold him). Re-measured (2026-11-28, the hauler
  waiting w seconds after the step, then walking in): Ruben, stepping, running or leaning off,
  comes in if F0 hauls within 2.0 s (F0 waiting at 23.3 or 23.75; 1.5 s if he waits at the floor's
  very end, 24.0), and both fall at 2.5 s (2.0 s); the pair comes in if Ruben hauls within 2.5 s
  (3.0 s from 23.3), and falls at 3.0 s (3.5-4.0 s from 23.3). Without the tile that window was
  2.0 s for Ruben. In random play followed by 40 s of nobody pressing anything (400 runs per team
  size), these are the only deaths left 3 s or more into the wait: 1 / 3 / 3 / 0 at 2 / 3 / 4 / 5
  players (the 4-player ones 5.7, 28.9 and 36.0 s in, two of them the last two hanging together),
  every one a catcher sliding off the slot floor's end, and every one also dies without the grip.
  Not changed: the catcher slides off the slot floor's end towards the one below him, and a
  non-slip end there would make the tile pointless for the last one (it would also break
  `coop02Patience.test.ts`'s check that the tile is what saves him), so these stay the documented
  price of the other order and of two leaving together (both accepted moves).
- **Fixed (2026-11-28): an anchor who does nothing while the one lowered does not lean in.** Found
  by the integration skeptic: Ruben steps off shaft A without leaning (a newcomer) and F0 stands
  still anywhere on the raised floor. F0 slid at 0.3 cells/s to the lip's corner (25.00, about
  11 s); Ruben hangs right under it (x 25.0), so the wrap was let go and both crept on over the
  void until F0's centre reached 25.40 and he lost the floor; both fell, Ruben's 2 broke the tile.
  The lip's cell is now a non-slip floor's end (`g`, `grip`): an idle anchor's slide stops with 0.1
  of his feet on it (centre 25.30), so he never loses the floor. A first version (`73ac9d7`) held
  the anchor still as soon as his centre was over the cell (x 24.0); its skeptic found two things it
  broke: a friend leaning in, his anchor standing still, was no longer set down (he hung 0.11-0.13
  above the slot floor's end for 60 s and more: the train landed 114 / 120 at 3 players on
  `219ffed`, 0 / 120 with it), and a friend left swinging in the slot's mouth swung for 30-45 s
  (the anchor's slide past the corner and back is what calmed him). The slide now runs as before up
  to the lip's end, so both are back. Measured, before (`219ffed`) / first version / now:
  - the skeptic's probe (2 players, Ruben walked to 24.4, F0 to 20.0-23.8, 4 step-off speeds, 60 s):
    8 / 0 / 0 deaths of 156 (18-27 s after the step); 3 players (F0 behind F1): 4 / 0 / 0
    (31-34 s); 4-5 players: 0;
  - every chain seat stepping off, or two together, both line-up orders, anchors 14.5-23.8, 3
    speeds, leaning or not, everyone else idle 40 s (372 / 1632 / 2856 / 3180 runs at 2-5): deaths
    0 / 159 / 15 / 0 before, 0 after (both versions); the anchor's centre at most 25.40 before (where
    he falls), 24.004 with the first version, 25.300 now;
  - a friend leaning in, his anchor idle, the ones before already in the slot (the catcher at
    19.5-22.7; 120 / 240 / 360 runs at 3 / 4 / 5): lands 114 / 225 / 336 before, 0 with the first
    version, 114 / 225 / 336 now (the same runs); at 2 players a friend first, Ruben anchoring
    (stepping off with or without leaning, waiting 0-60 s, then leaning in or walking back): 72 of
    128 land before, 28 with the first version, 72 now;
  - random play, then 40 s of nobody pressing anything (400 runs per size): deaths 3 s or more into
    the wait 12 / 40 / 47 / 39 before at 2 / 3 / 4 / 5 players, 1 / 3 / 3 / 0 now (the catcher in the
    slot, above; none dies now that lived before);
  - poses of the bots' run (every 0.5 s, everyone letting go for 30 s, 209 poses at 2-5): 41 still
    moving back and forth at 28-30 s before, 64 with the first version, 41 now, none of them new.
    Random play then 20 s released (12 seeds per size, after 5 / 8 / 12 s of play): 1 / 3 / 3 still
    moving before, 1 / 4 / 3 now (the extra one, 2 players seed 9 after 8 s, moves 0.011 against
    0.009 at the same pose; at rest by 45 s on both).
  Bot times are those of `219ffed` (14.5 / 25.6 / 30.7 / 35.9 s; the bots' runs are the same step
  for step). `coop02IdleAnchor.test.ts` sweeps it (2-5 players, both orders, 3 places, 3 speeds),
  checks that without the non-slip end the skeptic's runs die, that a friend leaning in is set
  down by an idle anchor at 2 and 3 players, and that Ruben left swinging in the slot's mouth by
  the bots (2 players) is still within 30 s.

## Ruben's active moments

At every team size, in both beats:

- Beat 1: Ruben is the first one down, and the one who gets himself in: he leans in under the lip
  while his neighbour holds him at the right height (his anchor slides twice as fast as for a
  friend), then is set down, and becomes the first one in the slot, the one who makes way and, at
  2 players, the one who hauls F0 in (the best anchor: a friend hanging from him slides him at only
  0.15 cells/s).
- Beat 2: Ruben goes down for his own key. With 2 players he is lowered by F0, whose slide gives
  about 3 s before the cables once he stops correcting (« Ruben, t'es lourd ! Stop ! Remonte un
  peu ! »). With 3 or more he is the bottom of the two-rope chain and swings himself to the key.
  Then he opens the door.

Why not forced: the spawn order cannot keep a friend from jumping over Ruben in the raised floor's
high part. The level makes Ruben-first the natural line: he stands nearest the lip and nobody has
to pass anybody (the duct, one row high, leaves no room to pass there).

## Communication moment

Beat 2: the one hanging in shaft B sees the cables, the anchor up in the room does not see how
deep he is: « Encore… Stop ! Remonte un peu ! » (the sign). The window is 0.65 cell and the anchor
slides, so this call is needed, not optional. With 3+, Ruben also asks for a gentle swing
(« Doucement ! »: the far cables are in reach of a hard pump). Beat 1: the one hanging in the
slot's mouth tells his anchor when he is over the floor (« Je suis dedans, avance ! ») and when he
is too deep (« Recule ! »); whoever waits in the slot tells the next one when to step off.

## Shortcuts

Each is a bot attempt in `shortcuts` whose phase named "ATTEMPT" must fail (if it ever
succeeded, the rest of the intended solution follows and would finish the level). Checked at
2, 3, 4 and 5 players: all fail in their attempt.

| Shortcut | How it fails |
|---|---|
| Everyone runs off the lip at once (nobody holds), leaning into the slot | nobody can drift a cell sideways while falling past it: everyone falls out of the level |
| Everyone jumps off the lip at once, a friend landing on Ruben's head and sliding off it into the slot | the duct leaves no room to jump there: everyone falls out of the level (without the duct, a friend gets in at 3-5 players) |
| Ruben steps off leaning in, his neighbour right behind him follows him to the edge (no depth control) | Ruben drops below the slot floor's top against its side (feet 10.6) and stays there: timeout |
| Ruben steps off at the key with his neighbour right behind him at the edge | 2 players: he takes the key and dies on the cables right below it. 3+: Ruben's weight drags his neighbour in after him and Ruben hangs at the key's depth, but against the wall, a cell from the key: timeout (with a swing this is the intended two-rope chain, reached clumsily: accepted) |
| The deep key on one rope: the neighbour holds at the very edge, Ruben swings | 2 players: onto the cables. 3+: feet 14.66 at most, the key starts at 16.23: timeout |
| Everyone drops into shaft B to grab the key from below | killed by the cables and the spikes at the bottom |

Probed and not possible: getting anything from the tile. Nobody climbs from it into the slot (4
cells up, a lone jump reaches 3; a tower is two bodies on it, and it breaks), and it holds nobody
stuck: 192 runs of the whole team leaving the lip (2-5 players; together or 0.15-1.2 s apart in
chain order; stepping or running off; leaning in at once, after 0.1 or 0.25 s, or not at all) all
end in a death, but for one at 5 players (0.5 s apart: a lowering by accident, with the next one
still standing when Ruben dropped; the same run without the tile gets in too). None leaves the team
alive with nobody in the slot. Reaching the slot without a lowering (see "Why nobody can drop into
the slot"), hauling over a block or a pulley past a gate (this level has neither), the stretch
reaching a ledge (one link at its stop: 14.66 in shaft B; in shaft A the stretch only takes the one
lowered deeper, below the slot). Not possible by construction: reaching a key from below (shaft B
has no floor, shaft A no bottom), a tower (nothing to climb), the far side of either shaft (level
walls).

### Accepted

- Another order (a friend jumps over Ruben in the raised floor's high part and goes first): the
  depths are the same, only the slides change; Ruben then ends up an anchor or the last one down.
- An anchor who does nothing in beat 1 (from 21.75 to 23.5 his slide sets Ruben down within 2.6
  to 10.1 s, if Ruben leans in; it never takes him off the lip's non-slip end): the slide is the
  lowering, slowly.
- In the train, the one waiting in the slot hauling the next one in instead of his anchor setting
  him down: the same crossing, the role turned around.
- The last one dropping onto the tile on purpose (or a friend stepping off with somebody in the
  slot and nobody holding him): he is hauled up from it, as from the wall.
- At 3+, two stepping off together in beat 2 (it is the intended move), or in beat 1 (the pit is
  deep enough, and the ones in the slot then haul them in; with only one in the slot, at 3
  players, he must start within about 2.5 s: see "Deadly moments").

## Deviations from the plan, and why

- **The key is in beat 2, not beat 1.** The plan puts the key in beat 1's niche and asks beat 2
  for a window between cables at the right depth. There is only one key, so beat 2 would have had
  nothing to fetch; and making beat 2 a crossing (everyone through a window between cables) does
  not work on this rope: the last one has nobody above him, is caught from below and falls deeper
  than anyone lowered from the rim, onto the cables meant for the lowered one. So beat 1 is the
  crossing, without danger (the slot under the lip, then everyone else after him), and beat 2 is
  the precise fetch between the cables, as the plan describes it.
- **Ruben is lowered rather than the anchor.** The plan says Ruben is the best anchor, and that
  if Ruben is the one lowered his anchor slides faster (« Ruben, t'es lourd ! »). Here Ruben is
  the one lowered in both beats (that is what puts him on the rope at 4-5 players), and he is the
  best anchor when he hauls F0 in at 2 players.
- **No pumped swing into a far niche in beat 1.** A body hanging against a wall cannot be swung
  far: the pump (14 cells/s²) is weaker than gravity's pull back (39 cells/s²). The lean is used
  where it works: held, it takes the one lowered about 20° under the lip, enough for a slot one
  cell behind it. At 3+ the bottom of a two-rope chain, who hangs freely below the middle one,
  pushes himself to the key one cell out from the wall (beat 2).
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
  Ruben hung straight below it, a cell out from the slot). A first repair made the raised floor's
  last three cells placed blocks `=` that let the rope through (the old swing under the lip came
  back); the owner rejected rope-transparent scenery, and since the rope wraps `=` too, those
  cells went back to `#`.
- Redesign around the wrapped rope (2026-11-27): the map is the same but for the duct. Beat 1 now
  uses the wrap: the lip's corner is the pivot that sets the depth; the one lowered is held in the
  slot's mouth, leans in (the rope wraps the lip's lower corner) and is set down by his anchor
  walking to the edge; too deep, he waits against the floor's side until his anchor walks back.
  New bots for beat 1 (`lowerOnto`, `stepOffAndLean`, a train stage per body). Probing the free
  fall with jumps found a way in (a friend riding Ruben's head off the lip and sliding off it
  into the slot, 77 of 780 probed runs): the duct closes it. The old shortcut "everyone drops into
  shaft A" never leaned in (its goals never got past the walk); its replacement and the jump
  version lean in for real. Beat 2's 2-player window was measured again (6.6-7.25; the anchor now
  stands at 6.9 instead of 7.2). Two shortcuts added (the jump, one rope to the deep key).
  Browser (`?coopLocal=2&level=coop02`, Playwright, no console error): the duct and the
  three-line sign draw whole; played by keys, Ruben stepping off and leaning in hangs at the
  floor's end with the rope drawn over both corners of the lip, F0 stepping towards the edge sets
  him down, and Ruben walking on pulls F0 off the lip and hauls him in: beat 1 at 2 players in
  about 7 s.
- Fix after review (2026-11-27): the last one into the slot at 2 players died if the one in the
  slot did not haul within about 1.1 s (an idle anchor slides towards the friend below him, and
  that friend hangs past the floor's end). Probed and rejected: an undercut under the slot's floor
  (the wrap then holds the catcher at the corner, but the hauled friend is pulled into the
  overhang's underside and stays there), a plate on the floor's end closing a hatch in the shaft
  (the hatch holds him, but nobody climbs over a plate cell: the mantle reads terrain only), a
  solid floor in the shaft (by the tower table a 3-tower of friends climbs out of it at 4-5, and a
  team that falls in is stuck alive), and a crawl over the whole raised floor to force the order
  (spawns need two rows of headroom, and a friend still gets past Ruben there in 378 of 648
  probes). The fragile tile at row 14 holds the last friend and breaks under anything that could
  tower or stay stuck. The haul of the last one now starts once he hangs or stands below the
  floor; `patience` and its test prove the wait at 2-5 players, and that the same waits die at 2
  players without the tile.
- Fix round (2026-11-28): an idle anchor on the raised floor could slide off the lip when the one
  below did not lean in (8 of 156 skeptic runs at 2 players, 4 at 3). The lip's cell became a
  non-slip floor (`g`, a new terrain kind `grip`); no other cell, depth or bot moved. Considered and
  not done: a raised kerb on the lip (the duct leaves one row of headroom, so a kerb is a wall
  nobody can step over, and it would move the pivot and every depth), a gate in the duct closed
  by a plate behind the lip (the plate cannot be the lip itself, which must stay terrain for the
  wrap, so the gate opens again as the anchor slides off the plate, and it would block a slow last
  one), a catch under the lip (any ledge a hanging Ruben stands on also catches whoever drops off
  the lip and lets him hop into the slot), and the engine rule "an idle anchor never slides off its
  floor's edge" everywhere (it also holds the catcher in the slot, so the tile would no longer be
  what saves the last one, which `coop02Patience.test.ts` checks). Bot times 14.5 / 25.5 / 30.7 /
  35.9 s; every shortcut still fails in its attempt; `coop02IdleAnchor.test.ts` added. Browser
  (`?coopLocal=2&level=coop02`, Playwright, no console error): the band draws on the lip's top; F0
  idle while Ruben hangs without leaning stops on it.
- Second fix round (2026-11-28): that grip stopped the slide with the anchor's centre over the lip's
  cell (x 24.0), too early: a friend leaning in, his anchor standing still, hung 0.1 above the slot
  floor's end for good (0 of 120 trains landed at 3 players, 114 before), and a friend left
  swinging in the slot's mouth swung for 30-45 s (64 poses still moving at 28-30 s, 41 before).
  The grip now only keeps the slide from taking the anchor off the lip (it stops with 0.1 of his
  feet on the cell, centre 25.30); up to there the slide is the one of `219ffed`, so the bots'
  runs, the landings and the calmed swings are those of `219ffed` again, and the lip-slide deaths
  stay at 0 (numbers in "Deadly moments").

## Engine notes

- One engine addition (2026-11-28): a non-slip floor's end, legend kind `grip` (`levelFormat.ts`):
  solid terrain like `#` (bodies stand on it, the rope wraps it), listed in `CoopLevel.grip`. When
  the floor cell furthest towards an idle anchor's slide under his feet is a grip cell and the
  floor ends there, the slide is cut so that 0.1 of his feet stay on it (`CoopWorld.slideRoom`,
  called by the slide in `rope.ts`; `GRIP_FOOTING` in `world.ts`): his centre at most 0.3 past the
  corner, and up to there he slides exactly as on any floor. Walking, bracing, the
  hard stop and its `anchorGive`, the haul and everything else are unchanged on it, and no other
  level has a grip cell, so nothing else moves (pinned rope values, the other levels' bots and
  shortcuts, `check-level --all`: identical). Drawn as an orange striped band on the cell's top.
- An idle anchor standing at a floor's end, with its friend hanging against the wall below that
  end, always slides off it: the wrap round the corner is let go once its centre passes the
  corner, and then it aims at the friend, half a body past the edge, exactly where it loses its
  footing. A friend hanging right under the corner (x equal to the corner's, as under this level's
  lip when he does not lean in) does not stop it either: anchor and friend creep on together. Only
  a friend well under an overhang, something under the friend, or a non-slip floor's end stops it. Any
  level that hauls a last one up from below with a single catcher meets this.
- The fragile floor appears here first; by the plan's rule its family has to come back in another
  level.
- The findings above (pump strength, pockets under overhangs, sliding off Ruben's head with no
  fall speed) are limits or rules of the current tuning, not bugs.
- An anchor bot that does not wait for the rope to hold its friend (it acted while he was still
  falling) walks to the edge and kills him: `lowerTo` and `lowerOnto` react only to a body whose
  `hanging` flag is set (`lowerTo`: and whose chain to the anchor hangs too).
- A bot goal that never reports itself done (`stepOff`, `hold`) never hands over to the next goal
  of a `seq`: the old shortcuts' `seq(stepOff(...), hold(-1))` never leaned. The new goals lean
  inside one goal (`stepOffAndLean`).
- In the dev tool, one long single-line sign above shaft B was once drawn with part of its text
  missing; the two-line signs are drawn whole (not investigated further).
