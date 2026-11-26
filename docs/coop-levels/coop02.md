# coop02 · Le Labo Réseau

> « Un câble RJ45, c'est une corde, non ? »

Files: `packages/shared/src/coop/levels/coop02.ts` (the level),
`packages/shared/src/coop/levels/coop02.solution.ts` (bot solution, shortcuts, and the bot goals
`lowerTo`, `swingTo` and `stepOff`, written on the exported bot API so other levels can reuse them).
Check: `npx tsx packages/shared/scripts/check-coop-level.ts coop02`.

## Idea

« On peut descendre un pote là où personne ne peut sauter. » The rope is 4.5 cells, centre to
centre, and a friend who hangs against a wall hangs on the circle around his anchor: the closer
the anchor stands to the edge, the deeper he hangs. Walking towards the edge lowers him, walking
back brings him up (sign « Avance : il descend. Recule : il remonte. »).

- Beat 1 (no danger) shows it: a slot under the lip of the raised floor can only be reached by a
  friend held at the right depth, and the rope swings him into it. Then the role turns around:
  the ones already in the slot catch the others, Ruben last.
- Beat 2 (deadly) asks for it precisely: the key hangs between stripped cables. Too deep is
  death, and the anchor slides towards the void if he stands still. With 3 players or more the
  key is deeper: two friends go down, one below the other, and the bottom one swings to it.

## Map

30 x 28. The raised floor of the lab (floor top 6), the low server room under it (floor top 10,
3 rows high), shaft A on the left (a bottomless catch pit), shaft B on the right (spikes at the
bottom). The group camera shows the whole width; it scrolls down when someone hangs deep.

```
          11111111112222222222
012345678901234567890123456789
##############################  0
##..............##############  1
##..............##############  2
##..............##############  3
##..............##############  4
##.......S......##############  5
##...#########################  6
##...........................#  7
##...............D...........#  8
##...............D...........#  9
##....####################..c# 10
##....####################..c# 11
##....####################..c# 12
##....####################k.c# 13
##....####################a.c# 14
##....####################a.c# 15
##....####################ajc# 16
##....####################..c# 17
##....####################b.c# 18
##....####################b.c# 19
##....####################b.c# 20
##....####################ddd# 21
##....######################## 22
...   (shaft A, x 2-5, open down to the bottom of the level, row 27)
```

| Char | What | Where |
|---|---|---|
| `S` | spawns | x 9-13 on the raised floor (F0 nearest shaft A, Ruben last) |
| shaft A | catch pit, bottomless | x 2-4 from the top, plus x 5 (the recess) under the lip |
| the lip | the raised floor's left end, 1 cell thick | x 5, row 6; its edge is x = 5 |
| the slot | the server room's mouth, 3 rows high | rows 7-9; its floor (row 10) starts at x = 6 |
| `D` | door | x 17, rows 8-9, in the server room |
| shaft B | 3 wide, near rim x = 26 | x 26-28, rows 7-20 |
| `k` | key, 2 players only | x 26 (against shaft B's near wall), row 13 |
| `j` | key, 3+ players | x 27 (one cell out from the wall), row 16 |
| `a` | stripped cables, pointing right, 2 players only | near wall, x 26, rows 14-16 |
| `b` | stripped cables, pointing right, 3+ players | near wall, x 26, rows 18-20 |
| `c` | stripped cables, pointing left | far wall, x 28, rows 10-20 |
| `d` | spikes, pointing up | bottom of shaft B, row 21 |

Signs: « Avance : il descend. Recule : il remonte. » (raised floor), « Ruben, t'es lourd ! » (the
slot, where Ruben is hauled in last), « Stop ! Remonte un peu ! » (above shaft B).

## Beats and the exact solution (bots)

Chain order F0, F1, ..., Ruben. The spawn puts F0 nearest shaft A, so beat 1 goes F0 first and
Ruben last, and the server room (where nobody can jump over anybody) keeps that order: F0 is the
one nearest shaft B in beat 2.

### 1. La baie de brassage (shaft A, the slot)

- F0 walks to the lip; his neighbour in the chain (Ruben with 2 players, F1 with more) stops at
  x = 8.1, about 3 cells back. F0 steps off (slowly over the last cell). The rope catches him
  beside the lip, then swings him under it towards his anchor, and he lands on the slot's floor.
- Then each next body does the same: the one behind it on the raised floor stops at x = 8.1, it
  steps off and is swung into the slot. Whoever is already in the room waits at x = 6.9 (as far
  in as the rope lets the next one still reach the lip) and walks on as soon as he steps off,
  hauling him in; the ones ahead make way.
- Ruben has nobody behind him: his neighbour waits at the mouth (x = 6.5), Ruben steps off, falls
  against the slot's wall below its floor, and is hauled up the wall and over the lip at 1.2
  cells/s (« Ruben, t'es lourd ! »).

### 2. Les câbles dénudés (shaft B)

- 2 players: F0 goes to the edge (x 25.4), Ruben stops at x = 23.9. F0 steps off: he hangs
  against the near wall with his feet at 13.75, touching the key (row 13), 0.35 above the cables.
  Ruben walks back and hauls him up.
- 3+ players: F0 at the edge, F1 at x 24.6, the third body of the chain (Ruben with 3, F2 with
  4-5) at x = 22.75, the others behind it. F0 steps off: F1 holds him a first rope length down.
  Then F1 steps off too: the anchor holds them both, F1 against the wall (feet about 12.65), F0
  one rope below him (feet 17.15-17.45). F0 pushes gently right (`swingTo`, at most 1.2 cells/s,
  never past x 27.2) until he touches the key one cell out from the wall, then damps his swing.
  The anchor walks back and hauls F1, then F0, over the rim.
- F0 carries the key: he opens the door (x 17) and everyone goes in.

The anchor goal (`lowerTo`) walks to its place, waits for the rope to hold the friend (and only
from him: everyone between them in the chain hangs too), then walks towards the edge when the
friend is too high and away when he is too deep.

### Bot times (checker)

| Players | Total | Beat 1 lowering | Beat 1 train | Beat 2 | Door |
|---|---|---|---|---|---|
| 2 | 12.0 s | 2.0 s | 3.8 s | 5.1 s (line up 2.5, lower 1.0, haul 1.6) | 1.1 s |
| 3 | 16.4 s | 2.0 s | 5.3 s | 8.0 s | 1.2 s |
| 4 | 17.3 s | 2.0 s | 6.8 s | 7.2 s | 1.1 s |
| 5 | 18.6 s | 2.0 s | 8.7 s | 6.8 s | 1.3 s |

The bots know the depths; players have to find them (and the anchor's slide), so a known replay
is longer than the bots' run, but the level is on the short side of the 45-60 s target.

## Depths, widths and margins

All measured on the real physics (anchor held in place, friend stepping off), not just computed.

- **Beat 1, the slot.** F0 lands in it for an anchor between x 7.7 and 8.7 (1.1 cells; the bots
  use 8.1). Closer to the edge he hangs below the slot's floor against its wall (anchor at 7.0:
  feet 10.27 against a floor at 10; at the very edge 10.50), and the anchor must walk back.
  Further back he hangs beside the lip, above the slot (anchor at 9.0: feet 6.93), and the anchor
  must come closer. Landing margin: hung straight below an anchor standing on the raised floor,
  feet reach 6 + 4.5 = 10.5, so the slot's floor (10) is reached with 0.5 to spare.
- **Why nobody can drop into the slot.** The wall under the lip is set back one cell (the recess
  at x 5): a falling body must drift a full cell sideways while its whole body is inside the
  3-row opening, which at the fall speed there (15-22 cells/s) takes longer than the opening
  lasts. Measured: 270 solo jumps and drops off the lip (start x 5.3-9, jump held 0-0.4 s, turning
  back at 0-0.4 s) never land in it.
- **Beat 2, 2 players.** Rest depth of the friend's feet against the near wall: anchor 23.3 →
  13.28 (touches the key: from 13.23), 23.9 → 13.75, 24.5 → 14.08; from 24.6 on, death on the
  cables (feet past 14.1). Key window: anchor 23.3-24.5 (1.2 cells; the bots use 23.9, 0.6 from
  both ends; feet margin 0.52 to the key, 0.35 to the cables). The same whether Ruben or F0 is
  the one lowered (the depth is geometry; only the slide speed changes).
- **Beat 2, 3+ players.** F0's feet = F1's + 4.5. The key (x 27, row 16) is touched by feet
  between 16.23 and 17.67 with a swing of 0.33 cells; the cables start at 18.1. That gives an
  anchor window of about x 22.1-23.2 (the bots use 22.75). Measured in the bot runs: F0 never
  deeper than 17.47 (0.63 above the cables) and never further right than x 26.77 (the far
  cables start at 28.25). One rope alone reaches feet 14.48 at most: the 3+ key (from 16.25) is
  1.8 out of reach of a single friend.
- **Shaft B's bottom.** The spikes (row 21, deadly from 21.55) are deeper than anyone hanging:
  one rope 14.48, two ropes about 19 at most, so even F0 and F1 stepping off together, anchored
  at the very edge, stay 2.5 above them. Three stepping off together reach the spikes.
- **Shaft A's depth.** Bottomless: the kill line is at y 29, 19 below the slot's floor and 23
  below the raised floor (checker: ≥ 6). The deepest body in the bot runs reached feet 12.2
  (Ruben below the slot); chains of 4 hanging (18 cells) still stay above it.
- **Room to haul.** Behind the slot's lip: the server room floor, x 6-25, 20 flat free cells.
  Behind shaft B's rim: the same 20 cells. Needed: 5.5 + 0.8 x 3 = 7.9 at 5 players.
- **Ceilings.** The raised floor is 5 rows high and the server room 3: no tower reaches anything
  (there is nothing to climb in this level), and in the room nobody can jump over a friend, which
  keeps the chain order from beat 1 to beat 2.
- **Widths.** Shaft B is 3 wide: a friend hanging against its near wall cannot reach the far
  cables, and nobody needs to jump across anything.

## Variants by team size

| | 2 players | 3+ players |
|---|---|---|
| Beat 1 | Ruben lowers F0, then steps off himself | F1 lowers F0, F2 lowers F1, ..., Ruben steps off last |
| Key | row 13 against the wall (`k`) | row 16, one cell out (`j`) |
| Cables on the near wall | rows 14-16 (`a`) | rows 18-20 (`b`) |
| Who goes down in beat 2 | F0, held by Ruben | F0 and F1, held by the third body (Ruben at 3, F2 at 4-5) |

## Deadly moments (beat 2 only)

1. The near-wall cables under the key: an anchor too close to the edge, or one who stands still
   (he slides towards the void at 0.15 cells/s per unit hanging: 0.3 with two friends or Ruben
   below), lowers his friend onto them.
2. The far-wall cables: jumping into shaft B instead of stepping off, or (3+) pumping the swing
   too hard.
3. The spikes at the bottom of shaft B: the whole team going in (or three stepping off together).

Beat 1 cannot kill a team where somebody stands on the raised floor: the only deaths there are the
whole team going into shaft A at once, and a catcher who stands still while a friend hangs without
landing. With Ruben hanging (the anchor slides 0.3 cells/s) the whole team falls out of shaft A
after about 5 s of standing still (measured by the level critic: catcher at x 6.5 safe up to 4 s,
dead from 5 s; at x 8.0 dead from 6 s); with a friend hanging it takes about 15 s. The sign
at the start ends with « Ruben saute ? On RECULE ! » to tell the team.

## Ruben's active moments

- Beat 1, at every size: he is the last one, he steps off into the void on trust and is hauled
  in slowly by the friend at the mouth (« Ruben, t'es lourd ! »).
- Beat 2 at 2 and 3 players: he is the anchor (the best one: with him holding, the friend below
  slides him at the friend's 0.15 cells/s, while a friend holding Ruben slides at 0.3). Players
  can also lower Ruben instead (accepted, see below).

## Communication moment

Beat 2: the friend hanging in shaft B sees the cables, the anchor up in the room does not see
how deep he is: « Encore… Stop ! Remonte un peu ! » (the sign). With 3+, the bottom friend also
asks for a gentle swing (« Doucement ! » — the far cables are in reach of a hard pump). Beat 1:
whoever waits at the mouth tells Ruben when to step off.

## Shortcuts

Each is a bot attempt in `shortcuts` whose phase named "ATTEMPT" must fail (if it ever
succeeded, the rest of the intended solution follows and would finish the level). Checked at
2, 3, 4 and 5 players: all fail in their attempt.

| Shortcut | How it fails |
|---|---|
| Everyone drops into shaft A at once (nobody holds), leaning into the slot | nobody can drift a cell sideways while falling past it: everyone falls out of the level |
| F0 drops into the slot with his neighbour right behind him at the lip | the rope catches him half a cell below the slot's floor (feet 10.45), against its wall: he never gets in (timeout) |
| F0 steps off at the key with his neighbour right behind him at the edge | 2 players: he takes the key and dies on the cables an instant later. 3+: one rope does not reach the deep key (feet 14.3, key from 16.25): timeout |
| Everyone drops into shaft B to grab the key from below | killed by the cables and the spikes at the bottom |

Not possible by construction: reaching a key from below (shaft B has no floor, shaft A no
bottom), a tower (nothing to climb, low ceilings), the far side of either shaft (level walls).

### Accepted

- Lowering Ruben instead of a friend, in either beat (the depths are the same; the anchor slides
  twice as fast, « Ruben, t'es lourd ! »). In beat 1 that puts Ruben first in the server room,
  so with 2 players Ruben is also the one lowered in beat 2.
- Stepping off while the anchor is already at the right place (a "drop" rather than a slow
  lowering): it is the same move, the anchor's position decides where the rope catches.
- At 3+, F0 and F1 stepping off together in beat 2 (it is the intended move), or in beat 1 (the
  pit is deep enough, and F1 then hauls F0 in).

## Deviations from the plan, and why

- **The key is in beat 2, not beat 1.** The plan puts the key in beat 1's niche and asks beat 2
  for a window between cables at the right depth. Lowering a friend into a pocket and hauling him
  back is fine, but there is only one key, so beat 2 would have had nothing to fetch; and making
  beat 2 a crossing (everyone through a window between cables) does not work on this rope: the
  last one has nobody above him, is caught from below and falls deeper than anyone lowered from
  the rim, onto the cables meant for the lowered friend. So beat 1 is the crossing, without
  danger (the slot under the lip, then everyone caught from below), and beat 2 is the precise
  fetch between the cables, exactly as the plan describes it.
- **No pumped swing into a far niche in beat 1.** A friend hanging against a wall cannot be
  swung far: the pump (14 cells/s²) is weaker than gravity's pull back (39 cells/s²), so a
  friend held from the rim, pressed against the near wall, only swings out to about 2 x 19.6°
  minus his resting angle (measured: 2.2 cells from his anchor, against a 3-wide shaft), and not
  at all once his anchor stands more than about 1.1 cells back (his resting angle passes 19.6°).
  A swing across a shaft therefore needs the anchor at the very edge, where the depth cannot be
  chosen any more. The swing is kept where it works: the rope itself swings the friend under the
  lip into the slot (beat 1), and at 3+ the bottom friend of a two-rope chain, who hangs freely
  below the middle one, pushes himself to the key one cell out from the wall (beat 2).
- **The "niche" of beat 1 is a slot one cell behind the lip.** A pocket in a straight wall can be
  entered by anyone falling past it (holding towards the wall for one step is enough), and a
  friend standing in a pocket under an overhang cannot be hauled back out (the rope pulls him up
  into its ceiling). Setting the wall under the lip back by one cell closes the free fall (see
  margins) and suits a crossing, which never needs hauling back out.

## Engine notes

- Nothing in the engine was changed. Everything the level needs works as documented; the
  findings above (pump strength, pockets under overhangs) are limits of the current tuning, not
  bugs.
- A friend lowered from an anchor who does not wait for the rope to hold him (the bot goal acted
  while he was still falling) walks to the edge and kills him: `lowerTo` reacts only to a body
  whose `hanging` flag is set and whose chain to the anchor hangs too.
- In the dev tool, one long single-line sign above shaft B was drawn with part of its text
  missing; the two-line version is drawn whole (not investigated further).
