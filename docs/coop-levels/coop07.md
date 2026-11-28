# coop07 · La BU

> « Y'a des livres sur la muscu ? »

Files: `packages/shared/src/coop/levels/coop07.ts` (the level),
`packages/shared/src/coop/levels/coop07.solution.ts` (bot solution, shortcuts, recoveries).
Check: `npx tsx packages/shared/scripts/check-coop-level.ts coop07`.

## Idea

« Frappe au bon moment : l'escalier apparaît sous leurs pieds. » The whole level has one switch
state: every hit of any switch block swaps the A and B shelves. A friend jumps from a shelf, a
friend in an alcove hits on the signal, and the next shelf appears under his feet while the one
he left vanishes. Then the roles swap: the ones up hit for the ones still in the alcove, Ruben
last. The key's shelf and the exit's footbridge belong to opposite groups, over a deadly pit.

## Map

32 x 13. Rows are y (top 0), x left to right; "top 8" means feet at y 8.

```
          1111111111222222222233
01234567890123456789012345678901
################################   0
################################   1
##.........uKv........o..###.###   2
##D.........w..r......o.h.##.###   3
##D........qqq........o...m..###   4
##eeeeeeeeeeee#########ttt#33..#   5
##............#########b.f.....#   6
##~~~~~~~~~~~~#########.....22.#   7
##########################g....#   8
#......z..s...a.............111#   9
#S.....z......a................#  10
############################...#  11
################################  12
```

| Char | Thing | Where | Settings |
|---|---|---|---|
| `s` | switch | x 10, row 9: the airlock's, 0.1 over a head (a jump hits at once) | |
| `a` / `z` | shelf A / B | x 14 / x 7, rows 9-10: the airlock's walls | group A / B |
| `f` | switch | x 25, row 6: the alcove's, at 2 players | players "2" |
| `b` | switch | x 23, row 6: the alcove's back, from 3 players | players "3+" |
| — | alcove | x 23-26, floor top 8, 2 high, under the reading room's floor | |
| `g` | grip | x 26, row 8: the alcove floor's end | |
| `1` | shelf B, L1 | x 28-30, top 9 (2 over the rim) | group B |
| `2` | shelf A, L2 | x 28-29, top 7 | group A, spareHeads |
| `3` | shelf B, L3 | x 27-28, top 5, level with the reading room | group B, spareHeads |
| — | cap | x 29-30, rows 1-4: a ceiling at y 5 over L1's right part | |
| — | dip | x 28-30, floor top 12 (1 under the rim), under the stack | |
| `m` | shelf A, the room's mouth | x 26, row 4 (the 1-high way in, under terrain) | group A |
| `h` | switch | x 24, row 3: the reading room's; whoever hits it (centre x 23.6-25.4) is clear of the mouth | |
| `o` | gate, the turnstile | x 22, rows 2-4: shut until the whole team stood on the mat, then open for good | link `portique` |
| `t` | plate, the mat | x 23-25, top 5: the room's floor in front of the turnstile | need W, standing, latch |
| — | reading room | x 14-26, floor top 5, 3 high (2 at x 25, 1 under h); x 23-26 until the turnstile opens | |
| `r` | switch | x 15, row 3: the réserve's | |
| `q` | shelf B, the key's shelf | x 11-13, top 4 | group B |
| `u` `v` `w` | shelves A, the cage's bars | (11, 2), (13, 2), (12, 3) around the key | group A |
| `K` | key | x 12, row 2 | |
| `e` | shelf A, the footbridge | x 2-13, top 5 | group A |
| `D` | door | x 2, rows 3-4, on the footbridge | |
| `~` | deadly pit | x 2-13, row 7 (2 under the footbridge) | |

## Beats and the exact solution (bots)

Roles: R is Ruben, F0..F3 the friends in seat order (the chain is F0-F1-...-R).

### 1. Le sas (x 1-14, no death)

The corridor is 2 high. The A wall blocks it; the switch hangs inside the airlock, 0.1 over a
head. Everyone walks in (« Tout le monde dans le sas ! »), the one under the switch jumps: the A
wall vanishes and the B wall shuts behind them (a cell only turns solid once nobody is in it: a
friend left in it keeps it open until he moves). The level then plays from B.

### 2. L'escalier (x 23-30, no death)

Ruben goes first: rim's end (x 27, the only cell of the corridor with open sky), onto L1, into the
alcove, under his switch (x 25 at 2 players; from 3 at the back, x 23, while F1 takes the front at
x 26.3: the only alcove spot that F0's rope reaches from the top of his climb). The alcove fills
from the front and moves back as each one comes in: the one already in that the newcomer is tied
to waits at x 25.4 while he is on his way (deeper, the rope round the alcove's floor is too short).
F0 jumps onto L1 (B) at x 29.4, under the cap. « 3, 2, 1, saute ! »: F0 jumps, Ruben jumps into
his switch right after (« puis frappe »), L1 goes and L2 (A) appears under F0. F0 steps to L2's
left end (x 28.4); « saute ! »: L3 (B) appears under him, level with the reading room, and its
mouth (A) opens. F0 walks in.

- L2 and L3 are `spareHeads`: they never appear on a head. A hit a moment before F0 leaves his
  shelf (within the coyote time, 0.1 s) leaves him his jump, and the next shelf waits until he has
  gone up through it.
- A hit well before F0 jumps from L1 drops him into the dip one under the rim: he hops back onto
  the rim's end, Ruben hits again (B) and he climbs again (recovery "the first hit too early"). A
  hit well before he jumps from L2 drops him back onto L1. No hit, or one too late: he lands where
  he jumped from.
- Ruben walking off the rim's end (or short-hopping L1) stands in the dip; an idle team waits
  there alive (30 s probed at 2-5 players), and he hops out (recovery "Ruben misses L1").
- At most one climbs at a time: the plan's « deux au plus en l'air » holds at every size.

### 3. L'inversion (x 23-29, no death)

The climb ends in B. The room's mouth `m` is A: whenever L2 is there the mouth is shut, so nobody
gets from L2 into the room. The one up stands under the room's switch (x 25.15 for the bots; any
centre from 23.6 to 25.4 reaches it, and all of those are clear of the mouth) and hits: A, L2 is
back and the mouth shuts behind the hit. The alcove's front one runs out of the alcove and jumps
onto L2 (the alcove is 2 high: a standing jump inside bonks; jump once out, from x 26.6 to 27.5 at
run speed), steps to x 28.4, and on « 3, 2, 1, saute ! » jumps while the room hits: L3 under him,
the mouth open. The hitter steps back, the newcomer comes in under the switch and hits for the
next one (his rope neighbour). Ruben comes last, hit for by his neighbour, and stops in the mouth
with a foot on the mat: the whole team has stood on it, the turnstile opens for good.

- The turnstile keeps the room 4 cells deep (x 23-26) until then: from there at most about 4 of
  rope reach out of the mouth, short of the 4.5 that holds a body up at the mouth's sill, so no
  haul brings a climber up to L3's level (shortcuts "a haul ..."). The waiting ones stand left of
  the hitter (x 24.25, under h: no jumping there, and x 23.4); at 5 players, in Ruben's round, the
  third one back jumps straight up at x 23.4 (the room is 3 high only there) and his neighbour
  steps under him.
- The next one in the alcove takes its front as soon as the climber is out: deeper, his rope holds
  the climber back.
- A hit before the climber jumps: L2 goes, he drops towards L1 (B, back under him). At 3+ players,
  held towards the alcove, he hangs just left of it: he swings right onto it, hops back into the
  alcove and the round starts again (recovery "the room's hit too early").
- The climber walks off the alcove's floor instead of jumping: he hangs beside the floor's end,
  still, his feet over L1's top, and the idle hitter stays in the room against the shut mouth
  (25 s probed from every hitting spot, 2-5 players). F0 hits (B), the climber steers right over
  L1, F0 steps into the mouth to let him down, and the round starts again (recovery "the alcove
  walks off its floor"). A haul instead jams him under the mouth's sill.
- Jumping too far (past L2) lands on L2's right part or hangs over the dip: no death.

### 4. La réserve (x 2-15, the deadly moments)

The room arrives in B: the footbridge is gone, the door floats over the deadly pit, the key's shelf
is there and its cage open. F0 (the deepest in the room) hops onto the key's shelf and jumps for
the key; the hitter (Ruben at 2 players, F1 from 3) hits `r` (A): the shelf goes and F0 drops onto
the footbridge right under it (« le porteur doit être sur A au dernier coup »); the cage shuts.
Everyone walks along the footbridge; F0 opens the door and all go in.

This beat is the calm pay-off, on purpose: the key's shelf stands right over the footbridge, so
the carrier is « sur A » the moment the last hit lands, and nothing in it is timed. Its one rule
is the deadly one: nobody hits again once someone is on the footbridge.

### Bot times (checker)

| Players | Total | Beat 1 | Beat 2 | Beat 3 | Beat 4 |
|---|---|---|---|---|---|
| 2 | 12.9 s | 1.5 s | 5.0 s | 2.2 s | 4.3 s |
| 3 | 16.2 s | 1.4 s | 6.5 s | 4.0 s | 4.2 s |
| 4 | 19.0 s | 1.3 s | 7.4 s | 5.9 s | 4.3 s |
| 5 | 22.2 s | 1.2 s | 8.4 s | 8.2 s | 4.3 s |

The bots know every countdown. Players who know the level should take 45-60 s: the airlock's
call, two countdowns for the climb, one per friend for the swap, and the last hit.

## Heights, windows and margins

| Spot | Height | Reached by | Margin / why not otherwise |
|---|---|---|---|
| L1 (B) | 2 over the rim | a jump from the rim's end (x 27) | — |
| L2 (A) | 2 over L1 | the timed hit, jumping from L1 at x 29.4 | under the cap the apex is feet 5.9, 1.1 over L2 |
| L3 (B) | 2 over L2 | the timed hit, jumping from L2 at x 28.4 | from x 29.4 the cap stops the head (feet 5.9, under L3's top 5) |
| Reading room | L3's level | walking off L3 through the mouth | the mouth is shut whenever L2 is there; L2's best jump reaches feet 4.98 in the mouth's column with nothing to stand on |
| A tower on L1 (B) | — | — | L3 and the cap cover all of L1: the top's feet stop at 5.9, 0.9 under L3 (shortcut, 2-3 high) |
| Alcove → room | 3 up | — | the alcove is 2 high (no tower, a standing jump bonks) |
| Rim's end, 2-tower (A) | top's apex 7.1 | — | L2's top is 7: 0.1 short (the corridor's 2-high ceiling allows no 3-tower there from the corridor; see accepted shortcuts) |
| Key | in its cage (A) | jumping from the key's shelf (B) | from the footbridge (A) the bars stop the head (shortcut) |
| Door from the key's shelf (B) | 8 cells of gap | — | out of a jump; the deadly pit is under it (shortcut) |

Hit windows (delay of the hitter's press after the climber's, swept step by step): L1 → L2
-0.108 to +0.558 s at every size; L2 → L3 -0.108 to +0.400 s at 2 players (the rope round the room's
floor pulls at the top of that jump), to +0.550 s from 3; the swap's first round -0.108 to +0.542-
0.558 s. The early end is the coyote time (the next shelf waits, `spareHeads`); before it the
climber's shelf is gone under him. The sign asks the climber to jump on « saute ! » and the hitter
to hit right after: a hitter who reacts to the jump (0.15-0.35 s) lands in the middle of every
window, and one who anticipates and presses with the climber still has 0.1 s. `coop07Bu.test.ts`
pins -0.1 to +0.375 s landing and -0.2 / +0.67 s failing, at 2-5 players, for all three hits.

Rope reach at 2 players (centre to centre, along the path): Ruben under his switch to F0 on L1
4.1, at the top of the L1 jump 4.5, on L2 3.2, at the top of the L2 jump 5.05 (round the room
floor's corner, stretched); F0 under the room's switch to Ruben on L2 3.4, at the top of his jump
2.8. From 3 players the alcove's front (x 26.3) gives the same or better. Longest link in the bot
runs: 4.996 (2 players, while Ruben jumps into the alcove), 4.599 / 4.608 / 4.608 (3 / 4 / 5, in
the swap).

## Variants by team size

- 2 players: switch `f` at x 25; Ruben alone in the alcove; Ruben hits for F0, F0 hits for Ruben,
  Ruben hits the last switch.
- 3+ players: switch `b` at the alcove's back (x 23): Ruben there, F1 at the front (F0's rope
  reaches only that spot from the top of his climb), F2 and F3 between them. F1 hits the last
  switch.
- One climber at a time at every size: at 5 the alcove holds four, front to back F1, F2, F3, Ruben,
  and they come out in that order.

## Shortcuts

Each shortcut in `coop07.solution.ts` plays the solution up to the beat it tries to skip, then an
`ATTEMPT` phase, then what would finish the level. All fail at 2, 3, 4 and 5 players in their
`ATTEMPT` phase (`coopLevels.test.ts`).

| Shortcut | What the bots try | Why it fails |
|---|---|---|
| a tower on L1 to the top shelf | Ruben the base on L1 (B), a 2-tower at 2 players, 3 high from 3, the top jumps for L3 (straight, then steering left) | L3 and the cap form one ceiling over all of L1: best feet 5.9, L3's top is 5 |
| a jump from L2 into the reading room | after the first hit (A), F0 jumps from L2 for the room's mouth: short hops, full jumps, from both ends | the mouth `m` is A, shut while L2 is there; nothing to stand on in its column (best feet 4.98) |
| a tower on L2 into the reading room | after the first hit the alcove's front one (Ruben at 2) runs out onto L2 as a base, F0 climbs on him and jumps for the mouth | the same: the mouth is shut in A |
| a haul from L2 into the reading room | beat 3 by hauling: the front one waits on L2 (A), F0 walks off | the mouth is shut in A: he jams under it |
| a haul straight out of the alcove | F0 walks off with the front one still in the alcove | he jams at the alcove's mouth, under the room's floor (and the mouth is shut) |
| a haul from L2, then a hit whenever | the front one waits on L2 (A), F0 walks off as far as he can and holds; then someone hits at leisure (Ruben from the alcove's back; F0 at 2 players) so that L3 would come under the climber by the mouth | the turnstile keeps the room 4 deep: the climber hangs at feet 6.38 (6.55 for Ruben), under the mouth's sill, and L3 (top 5) never comes under him. Without the turnstile this got in at 4-5 players (the critic's find; `coop07Bu.test.ts` keeps that control) |
| a haul from L1, then two hits whenever | the same from L1 (B): a hit (A) frees the climber from under L3, a second (B) would put L3 under him | the same: he hangs at feet 6.90 |
| the key through the bars | in A, F0 jumps for the key from the footbridge, under it and from both sides | the bars (A) stop the head |
| the door from the key's shelf in one leap | in B, F0 with the key leaps from the key's shelf for the door, pressing ↓ in the air | 8 cells: he falls into the deadly pit |

Closed during the design (kept as probes): the reading room's switch first hung right of where
it is now (x 25), where a hitter could stand half in the mouth: the mouth then stayed open behind
his hit, and a climber who missed L2 dragged the idle hitter out of the room onto the rim (at 2
players, before the dip, into a pit). It moved to x 24, and every body that reaches it is clear of
the mouth. Before that it hung next to the mouth, and a jump from L2 into the mouth's column bumped it with the head's corner (B: L3 and the
trapdoor of the first version appeared under the jumper, who walked in); it moved one cell left
with terrain over the mouth. The first version's 1-high slot did not stop a jump from L2 either
(the lintel held the jumper at exactly the slot's height), hence the mouth shelf `m`.

Not applicable here (the generic list of the campaign): trays, lamps and springs are not in this
level; nothing is reached by the rope's 20 % stretch (every place of the climb is within 5.05 of
the hitter along the rope, and the stretch only holds climbers back).

### Accepted

- **The first hit through the alcove.** From L1 (B) a climber can step up into the alcove, wait
  for a hit (A) and walk out onto L2: only the second hit is then timed. It costs time and the
  second hit stays.
- **A 3-tower at the rim's end onto L2 (A).** Built from L1 (B: friends jump onto heads from L1),
  its top would reach L2 after a hit (computed, not built by the bots: feet 9.2, apex 6.2, L2's top 7). It skips only the first hit, as above.
  From the corridor only a 2-tower can be built there (the 2-high ceiling), 0.1 short.
- **Ruben hits for everyone.** In beat 3 Ruben, still in the alcove, can time the hits for the
  friends instead of the room; only his own climb needs the room.
- **The climb with the roles reversed.** At 2 players F0 can be the hitter and Ruben the climber.

## Deadly moments

Two, both in beat 4 and both readable before they happen:

1. Standing on the footbridge (A) when somebody hits (B): it vanishes over the pit
   (« Pas sur la passerelle ! »). The natural order never puts anyone there before the key.
2. Falling off the key's shelf (B, 3 wide) into the pit, or leaping from it for the door.

Beats 1-3 cannot kill: the airlock is a corridor, and every fall in the climb or the swap lands on
a lower shelf, on the rim or in the dip one under it (the stack has no pit under it). The room's
hitter never leaves the room through its own hit: the mouth is shut behind every A hit. In B (the
mouth open) an idle room member can still slide out onto L3 when his neighbour hangs below the
alcove (wave B skeptic, random play at 4 players: x 24.49 to 27.40 over about 20 s); harmless, and
he walks back in.

## Ruben's active moment

He is the hitter of the climb at every size, the one who counts « 3, 2, 1, saute ! » or answers
it, and at 2 players the climber of the swap and the last hitter. He never waits on a plate.

## Communication moment

The countdowns: « 3, 2, 1, saute ! » for each timed hit (two in the climb, one per friend in the
swap; the hitter hits right after the jump), the airlock's « Tout le monde dans le sas ? », and the last hit's « Personne sur la
passerelle ? ».

## Deviations from the plan, and why

1. **The staircase is a stack, not a slope.** The rope (4.5 between neighbours) ties the climber to
   the hitter at 2 players: every place of the climb must be within about 4.5 of the alcove along
   the rope. Three shelves 2 apart, stacked over a 3-wide pit beside the alcove, are the most that
   fit; L1 and L3 (both B) must not overlap where the climber jumps (L3 over L1 leaves 0.1 of
   window), hence the offsets and the cap.
2. **One climber at a time, at every size.** « Deux au plus en l'air au moment du coup » holds
   trivially. Two at once do not fit: L2 → L3 has one jump column (the cap covers the other), and
   the alcove has one spot that the climber's rope reaches from the top.
3. **Beat 3 swaps the roles instead of hauling.** The plan's « porte B de l'alcôve, sinon on ne peut
   pas hisser le frappeur » was built first (a trapdoor over the alcove's mouth, opened by the
   room's switch, and a haul up the chimney): a body hauled out of the alcove always jams under
   the room's floor at its mouth (the pull's pivot is that corner, right over the mouth), and the
   1-high way into the room did not keep jumps from L2 out. The mouth shelf `m` (A) closes both:
   nobody gets in from L2, nobody is hauled in. What remains of the plan: the second switch at the
   top is what gets the hitter out, and the climbers become the hitters (« Inversion des rôles »).
4. **The key's shelf drops its carrier onto the footbridge.** « La cage de la clé est sur B, le sol
   de la sortie sur A » is literal (the cage opens on B, the footbridge is A); since the room
   arrives in B, the last hit needs only to wait for the key, and the carrier standing on the key's
   shelf is « sur A » the moment it lands. The danger moved to whoever stands on the footbridge at
   a B hit.
5. **A dip, not a pit, under the stack.** The first version had a catch pit with fragile planks
   one under the rim. Ruben missing L1 broke them and hung in the pit, and an idle team slid off
   the rim's end after him (17-24 s); once broken, a first hit too early left F0 hanging in the pit
   for good. The dip (one under the rim, floor top 12) catches every fall and anyone hops out.
6. **The countdown ends on the jump.** The plan's « 3, 2, 1, frappe ! » asks both to press
   together, but a press a step early used to shut the next shelf over the climber's head. The
   shelves now wait for him (`spareHeads`), and the sign says « 3, 2, 1, saute ! » puis frappe: the
   window is 0.1 s early to 0.4 s late, and the hitter reacts to the jump.
7. **A turnstile in the reading room.** The room in front of it is 4 deep until the whole team has
   stood on its mat (the last one up stops in the mouth with a foot on it): a deeper room let a
   haul from L2 and an untimed hit get the climber in at 4-5 players.

## Engine notes

Two additions in `props.ts`, used here first (`coopProps.test.ts`):

- `shelf` `spareHeads`: the cell also waits while a head is within `PROPS.shelfHeadroom` (0.5)
  under it, so it never appears on a head.
- `plate` `latch`: once active, it stays active until the restart (saved in snapshots as `active`).

Notes for designers of switch levels:

- A body pressed up into a switch block by the rope hits it again every 0.3 s (the cooldown), as
  long as it stays pressed: a hauled body pinned under a switch strobes the shelves. Keep switches
  out of every haul's path (here the alcove's switch hangs one cell in from its mouth).
- A body hauled out of a pocket under a floor jams under the floor's corner over the pocket's
  mouth (the pivot is that corner; nothing pulls it sideways): hauls start from open sky.
- A 1-high gap is not a filter when a ceiling over the jump caps the jumper at the gap's height:
  close a way in with a shelf (or a gate) instead.
- A switch beside a shaft can be hit by a jumper's head corner from the shaft.
- A shelf cell stays open while any body overlaps it: a switch reachable with a foot in a doorway
  shelf leaves the doorway open behind the hit.
- A switch hanging 0.9 over the heads (rather than 0.1) gives the rope time to pull a jumping
  hitter out from under it: tried here for the room's switch and dropped.

## Probes

- Idle sweep: the solution cut at every phase boundary and 0.3 s into every phase (294 poses over
  2-5 players), then everyone idle for 30 s: no death, no body moving more than 0.0001 in the last
  5 s, longest link 4.80. The same on the recoveries "the alcove walks off its floor" (364 poses,
  0.0025, 5.13) and "Ruben misses L1" (326 poses, 0.0001, 4.88).
- Hit windows, the hitter's press swept from -0.25 to +0.67 s against the climber's: see "Heights,
  windows and margins".
- The room's hitter at x 23.65, 24.4, 25.15 and 25.35 (all that reach h), the climber then walking
  off the alcove's floor or jumping past L2, then idle 25-40 s at 2-5 players: the mouth is shut,
  the hitter stays in the room (at most x 25.6), nobody dies. From x 25.5 or 26.1 h is out of reach.
- Mistakes, then idle for 30-40 s: a hit too early from L1 (F0 in the dip, standing), from L2 (on
  L1), none at all (back where he jumped from); Ruben walking off the rim's end (in the dip); the
  room's hit too early at 3-5 players: the climber hangs left of L1 with the room's hitter dragged
  onto L3's left cell (B, the mouth open); that hitter dithers by 0.0012 cell per step (sub-pixel)
  for as long as nobody moves. The recovery swings him onto L1.
- Recoveries finish at 2-5 players: "the first hit too early" 20.3 / 17.9 / 20.7 / 23.9 s, "the
  room's hit too early" 14.5 / 17.9 / 20.7 / 23.9 s, "the alcove walks off its floor" 21.5 / 24.6 /
  27.9 / 31.1 s, "Ruben misses L1" 18.8 / 22.0 / 24.9 / 28.1 s.
- Browser (`?coopLocal=2&level=coop07`, `?coopLocal=5&level=coop07`, and `&spawn=16` for the
  reading room), first version: the airlock's swap, the shelves in A and in B, the cage and the
  signs read; no console error. Not redone after the fix round (map changes: the dip, h one cell
  left, the turnstile and its mat, one sign).
