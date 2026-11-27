# coop05 · La Salle

> « Ça, je maîtrise. »

Files: `packages/shared/src/coop/levels/coop05.ts` (the level),
`packages/shared/src/coop/levels/coop05.solution.ts` (bot solution and shortcuts).
Check: `npx tsx packages/shared/scripts/check-coop-level.ts coop05`.

## Idea

« Le pote qui vole fait monter Ruben. » Ruben's weight is the gym's machine: it lifts a friend's
pan (la poulie), it anchors a friend thrown by a barbell (le développé-catapulte), and the friend
who flew up is the one who brings everybody, Ruben last, up to the door.

The plan's version of beats 2 and 3 cannot work on the real physics (see "Deviations"): the level
keeps the beats and the déclic, and changes who falls and what the flyer lands on.

## Map

33 x 24. Rows are y (top 0), x left to right.

```
          1111111111222222222233333
01234567890123456789012345678901234
#################################   0
#........###................#####   1
#........###................#####   2
#........###................#####   3
#........###................#####   4
#........###.............c..#####   5
#........###.............s..#####   6
#........###..D.............#####   7
#........###..D.......#.K..*#####   8
#........##############p#...#####   9
#........################...#####  10
#........###############k.g.#####  11
#.S.....l...................#####  12
########..###############...#####  13
########..###############...#####  14
########..###############WWW#####  15
########..#######################  16
#########r#######################  17
#########.#######################  18-21 (pan r's pit)
#################################  22-23
```

| Char | Thing | Where | Settings |
|---|---|---|---|
| `l` | pan (Ruben's) | x 8, row 12: one cell above the approach floor (top 13), shaft below to 16 | balance `poulie`, step 4, travel 4 |
| `r` | pan | x 9, row 17 (rest), rises to 13 (the tunnel floor), sinks to 21 | balance `poulie` |
| — | tunnel | row 12, x 9-24, 1 high (floor 13, solid above) | |
| `k` | switch block | x 24, row 11, right above the tunnel mouth (x 24) | |
| `s` | shelf, group A | x 25, row 6: holds the barbell, high above the climb and the mezzanine | |
| `c` | crate « 2 » (the barbell) | x 25, row 5 | need 2, weight 2 |
| `W` → `w` / `v` | seesaw (cells variant) | row 15: B x 25 (under the barbell), cap x 26, A x 27 | travel 0.4 at 2-3 players, 1.0 at 4-5 |
| — | block | x 22, row 8: keeps the plate holder on the plate's right half | |
| `*` | saw | x 27, row 8, above pad A | |
| — | mezzanine | floor top 9, x 12-24 | |
| `K` | key | x 24, row 8: on the mezzanine's lip | |
| `p` | plate | x 23, row 9 (mezzanine floor) | need 1, link `marche` |
| `g` | gate, inverted (the step) | x 26, row 11: solid while `p` is held | link `marche` |
| `D` | door | x 14, rows 7-8, on the mezzanine | |

Heights below are measured up from the seesaw's rest (row 15) in beat 2, from the floor in beat 1.

## Beats and the exact solution (bots)

Roles: R is Ruben, F0..F3 the friends in seat order; the chain is F0-F1-...-R, so F0 is the free
end of the chain and Ruben's only neighbour is the last friend. Spawn order puts Ruben in front.

### 1. La poulie (x 1-24, no death)

Ruben jumps onto pan l (one cell up). He outweighs the empty pan r by 2: l sinks 4 (to 16), r
rises 4 and stops flush with the tunnel floor (13). One by one, F0 first, the friends hop from the
pit's edge over l's shaft onto r (1 vs Ruben's 2: r stays up) and walk into the tunnel. Ruben's
neighbour goes last and walks on: the rope hauls Ruben out of the shaft, into r's pit (empty, r
drops back) and up its far wall into the tunnel (« Tire ! »).

- One at a time: two friends on r weigh as much as Ruben, the balance levels and r drops 4 into its
  pit (recoverable: those up haul them).
- From 3 players Ruben's neighbour waits one cell from the pit and the others jump over him: further
  away, his rope over the pit's corner lifts Ruben off pan l, which then rises and leaves Ruben at
  the bottom of the shaft (found by the bots; pan l one cell above the floor keeps that rope short).
- Room to haul behind the tunnel's lip: 14 flat cells.

### 2. Le développé-catapulte (x 24-27)

The tunnel's last cell is under the switch. F0 walks out of the mouth, drops onto the seesaw and
crosses to pad A (it sinks; pad B, under the barbell, rises). His neighbour (Ruben at 2 players, F1
from 3) takes the mouth: he is the anchor. When the flyer says « vas-y ! » the anchor jumps into the switch,
the shelf vanishes, the barbell falls 7.6 onto the raised pad and throws F0 (launch 8, the cap).
The rope to the anchor caps the flight; F0 steers left and lands on the mezzanine's lip (top 9, 6
above the seesaw), on the key. Straight up, he meets the saw (the bots die there at 2, 3, 4 and 5
players): « Tire à gauche ! ».

### 3. Le pote qui vole fait monter Ruben (x 12-26)

F0 stands on plate p: the step g (x 26, top 11) appears in the shaft. One by one, in chain order,
the others walk out of the mouth and jump at once (coyote jump) onto the step, then onto the
mezzanine (2 up). Each waits left of F0 until the next one stands on the step (only then can his
rope reach over F0), Ruben comes last. The key goes forward along the queue (↓ next to the carrier)
and everyone goes through the door.

### Bot times (checker)

| Players | Total | Beat 1 | Beat 2 | Beat 3 |
|---|---|---|---|---|
| 2 | 16.7 s | 7.3 s | 5.7 s | 3.9 s |
| 3 | 18.5 s | 9.1 s | 4.1 s | 5.3 s |
| 4 | 20.1 s | 10.5 s | 2.9 s | 6.9 s |
| 5 | 23.7 s | 12.4 s | 2.8 s | 8.7 s |

Players who know the level should take 45-60 s: the crossing order, the countdown and the climb
are all talk.

## Heights, launch and margins

| Spot | Height | Reached by | Margin / why not otherwise |
|---|---|---|---|
| Pan l | 1 above the floor | Ruben's jump | — |
| Tunnel floor over pan r | r raised 4 | walking from the edge (a hop over l) | from r at rest (4 below) a jump reaches 1 short (margin 1.0); from the approach, the 1-high tunnel only takes a body whose feet are within 0.1 of its floor, so nobody jumps in |
| Barbell drop | 8 above the seesaw, 7.6 onto the raised pad | the switch | launch capped at 8 |
| Shelf s after a second hit | top 6, 3 above the mezzanine, over pad B | — | useless: above the climb and the flight, out of a lone jump from the mezzanine (3.0) |
| Spent barbell as a step | top 14.4 (2-3 players), 15.0 (4-5, seesaw travel 1.0) | towers | 3-tower apex 9.6 (margin 0.6), 4-tower apex 9.3 (margin 0.3) against the mezzanine at 9 |
| F0's flight | rope-limited by the anchor at the mouth (centre 2.45 above the seesaw, 3 left of pad A) | | measured head apex: 8.75 (row) straight up, 7.3 above the seesaw steering left; free apex 7.6 |
| Mezzanine | 6 above the seesaw (4 above the tunnel) | the flight | 4-tower on the cap: feet apex 5.7 (margin 0.3); 2-tower on Ruben on the cap: 3.9 (shortcut bot fails); coyote jump from the mouth after the shot: 3 (margin 1.0) |
| Saw | circle at row 8.5 over pad A | straight-up flight | the bots die there at every size; the steering flight passes x ≤ 26.6 by then |
| Step g | 2 above the tunnel floor, 2 below the mezzanine | coyote jump out of the mouth, then a jump | only while p is held |

Rope reach (4.5): F0 on pad A to the anchor at the mouth 3.8; F0 on the mezzanine lip to the anchor
4.1; F0 on the plate to the next climber at the mouth 4.4; a climber waiting at x 22.6 to the next
one on the step 4.4 (to the mouth it would be 4.4-4.9, which is why the climbers wait for the step).

## Variants by team size

No cell variants. What changes is who does what:

- 2 players: Ruben is the counterweight, the anchor and the one who hits the switch.
- 3+ players: Ruben is the counterweight; F1 (F0's only neighbour) anchors and hits the switch;
  Ruben's neighbour crosses last and hauls him; the key is passed to the front of the queue.
- At 3+ two friends on pan l also lift r (two friends weigh Ruben): accepted, as in the plan.

## Shortcuts

Each shortcut in `coop05.solution.ts` plays the solution up to the beat it tries to skip, then an
`ATTEMPT` phase, then what would finish the level. All of them fail at 2, 3, 4 and 5 players in
their `ATTEMPT` phase (scratch script that runs each shortcut at each team size and checks the
failing phase's name):

| Shortcut | What the bots try | Why it fails |
|---|---|---|
| a friend crosses the pulley alone | nobody on pan l; F0 hops over l and walks for the tunnel | pan r is at rest, 4 below the tunnel: F0 drops into its pit |
| a tower from the seesaw to the mezzanine | F0's neighbour on the seesaw's cap, F0 on his head jumps for the lip | 3.9 is short of 6, and the barbell's column blocks the way |
| the anchor jumps onto the seesaw himself | the plan's beat 2: the anchor walks off the mouth onto the raised pad instead of hitting the switch | a fall of 1.6 throws F0 about 4, and the anchor, now on the seesaw, holds him down by the rope |
| a tower on the spent barbell | the switch hit with nobody on the seesaw, a 2-tower on the fallen barbell jumps for the mezzanine | too low (the critic's 4-tower at 5 players, `c5_barbell_tower`, now fails too: seesaw travel 1.0 from 4 players) |
| a tower on the spent barbell, shelf back | the same after a second hit, through the restored shelf | the shelf is now at top 6, out of reach and above the climb (the critic's 3-tower at 3 players, `c5_shelf_step`, now fails) |

### Accepted

- Two friends as the counterweight on pan l (3+).
- Climbing Ruben's head on pan l to reach the tunnel: it still needs Ruben on the pan.
- From 3 players, since rope v2: hauling the others up the shaft instead of using the step. The
  rope from the flyer on the mezzanine wraps its lip's corner (25, 9), so whoever walks out of the
  mouth is pulled up the shaft's wall and climbs over the lip (the mantle reaches 0.9 under a
  wrapped lip). Probed with the step and plate p removed: the flyer hauls his neighbour, and the
  two of them haul the next ones, Ruben included, at 3, 4 and 5 players. It still needs the shot
  (nobody is up before it), it is the plan's literal « déclic » (the flyer brings Ruben up, see
  "Review fixes" item 6), and the step stays the easy way. At 2 players the flyer alone cannot haul
  Ruben (the block at x 22 stands right behind the lip and he cannot hop it with Ruben hanging):
  plate p is needed there.
- A failed shot (the switch hit before the flyer is on pad A, the flyer jumping at the launch, F0
  missing the lip) wastes the barbell: hold R to restart. A sign over the shaft says « Une seule
  barre ! »; the one at the mouth says who jumps (« Au bout : saute dans le bloc »), the one by the
  seesaw says who does not (« Toi : pas de saut, tire à gauche »).

## Deadly moments

One: the saw over pad A, for a flyer who does not steer. Beat 1 and beat 3 cannot kill.

## Ruben's active moment

He is the pulley's counterweight (every size), and at 2 players the anchor who jumps into the switch
on « saute ! ». He sits on pan l only while the friends cross (under 10 s for the bots at 5 players).

## Communication moment

The shot: the flyer must be standing on pad A, still, when the anchor jumps, or the only barbell is
spent. He calls « vas-y ! » and must not jump himself (a jump pressed before the launch cancels
it, `c5_flight_inputs`), then « Tire à gauche ! ». In beat 1 « Un par un sur le plateau ! ».

## Deviations from the plan, and why

The physics make two of the plan's sentences impossible at 2 players; both come from one rule:
**a friend can never be more than 4.5 (centre to centre) from his rope neighbour**.

1. **Beat 2, « deux estrades pour la chute de Ruben »**: if Ruben falls onto the seesaw, he is the
   flying friend's only rope neighbour at 2 players and he ends on the seesaw. The friend then rises
   at most about 4.3 above the seesaw whatever the stand's height, the same as a plain jump from the
   raised pad with Ruben standing on the other one, and close to what a tower reaches. Measured
   (scratch experiments, 3-wide seesaw, Ruben walking off a stand 3 high): launch 6.65, the
   friend's feet peak at 4.27 above the seesaw, 0.33 s after the launch, with the link at 4.50;
   if Ruben jumps again right as he lands, the same throw peaks at 5.90. So the stand's height
   changes nothing and the saws could never be reached from the high stand. In the level the weight
   is a barbell (a crate « 2 ») released by the switch, and Ruben stays up as the anchor; the
   « choice » became steering (the saw is straight up). The plan's version is kept as a closed
   shortcut.
2. **Beat 3, the combo on a balance**: a balance reacts to weights only, and a friend (1) never
   outweighs Ruben (2). Worse, any static counterweight gives Ruben no height above the one he had
   when he stepped on his pan (the pan's offset after a friend joins the other pan is never above its
   offset before Ruben boarded). The combo would need weight to arrive on the far pan after Ruben is
   on his, and a flyer's landing within 4.5 of the anchor; the level keeps the idea with a plate
   instead: the flyer's landing holds the step that brings the team, Ruben last, up to him.
3. **Beat 1**: with pans in one row, a friend lifted by Ruben rises T while Ruben sinks T, so the
   rope caps the gain at about 4.4 - T above the pans' rest, never more than a jump from the rest
   level (3) plus 0.3. The pulley here lifts pan r into a bridge (flush with a 1-high tunnel) rather
   than a friend onto a shelf, and the friend then hauls Ruben out, as in the plan.
4. **Switch block** (the BU's family, level 7) is used once here, as the barbell's release.
5. **No balance in beat 3, a plate and an inverted gate instead** (see 2).

## Engine features the original version would need

- **Slack during a catapult flight**: the rope does not pull a body back while it rises from a
  catapult (or the faller is dragged up instead of standing as an anchor). Minimal reproduction:
  two players, a 3-wide seesaw, the friend on the left pad, Ruben walks off a block 3 high onto the
  right pad: the friend peaks at 4.27 (rope taut at 4.50) instead of about 6.3.
- **Impact on balances**: a body landing on a pan from a fall of h pushes it as if it weighed
  more for a moment (or a pan with a latch that keeps its lowest position). Minimal reproduction:
  Ruben on one pan, a friend dropped from 5 cells onto the other: the pans end at Ruben's side
  down by one step, exactly as if the friend had walked on.

## Engine notes

- A rope over a pit's corner counts its bent length: a friend standing 2 cells from a 4-deep shaft
  lifts Ruben off the pan at its bottom, and the pan rises without him.
- A hauled body that ends level with its hauler is never mantled (the pull is flat): the haul
  needs the hauler's floor to be the lip.
- A climber below the mezzanine is held by the rope to whoever is still in the tunnel: climbing
  order and waiting spots matter as much as heights.
- Rope v2 (elastic, wraps the terrain): no map change. The bots failed at 3 and 4 players in
  beat 2: F0 walked off the mouth while the anchor still stood 4 cells back, the stretched link
  swung him back onto pad B's side and he could not walk up onto the raised pad A. The anchor and
  the ones behind now close up when F0 passes x 23 (was 25.2). Two shortcut setups needed the same
  closing up ("a tower on the spent barbell", with or without the shelf back). F0's flight is
  unchanged: head apex 8.74 straight up (8.75 before; the saw kills), feet apex 8.33-8.42 steering
  left. The anchor waiting one cell from the pit in beat 1 is kept (the rope over the pit's corner
  is measured along its path now, as the bots measured it before).
- Rope v2 review fixes: no map change. In the shortcut "a tower from the seesaw to the mezzanine" the
  base lands on the cap within 0.1 (was 0.3): landing 0.3 to the right at 3 players it sat on the edge of
  F0's head and F0 could not jump. It still fails at its attempt at 2-5 players.

## Review fixes (critic round 1)

| Issue | Status |
|---|---|
| 1. Beat 2 skipped by a tower on the spent barbell, through the restored shelf (3 players) or directly (5 players) | Fixed: barbell and shelf moved up 4 rows (the restored shelf is useless), seesaw travel 1.0 from 4 players. Two new shortcuts; the critic's two scripts now fail. |
| 2. A jump at the mouth before the flyer is ready wastes the barbell | Kept, signed (« Une seule barre ! »): it is the level's timing moment. A recoverable barbell needs a way back to its shelf; a `~` or an exit near the seesaw would put a deadly pit or a crate chute in the shot's room. |
| 3. The flyer who jumps loses the shot | Kept, signed: « Au bout : saute dans le bloc » at the mouth, « Toi : pas de saut, tire à gauche » at the seesaw. |
| 4. One jump in beat 3 brings the shelf back and blocks the climb | Fixed by moving the shelf up: `c5_shelf_back` now wins at every size with one or two jumps. |
| 5. Rope margin at the plate | Fixed: a block at x 22, row 8, the holder stands at 23.55; `c5_rope_margins` wins at every size. |
| 6. The déclic is not literal (the flyer does not haul Ruben) | Not fixed. Hauling from the mezzanine drags the hauled one into the tunnel mouth (the pull is level with it), and every arrangement tried in this geometry either reopened the tower route or broke a rope distance at 4-5 players. What the level teaches: the friend Ruben anchors is the one who flies, and his landing (holding the plate) is what opens the way up for Ruben and the others. |
| 7. Ruben's role from 3 players | Not fixed: at 3+ the anchor must be F0's only neighbour (F1). Making Ruben the anchor at every size (Ruben's neighbour as the flyer, a weight-2 plate at the mouth instead of the switch) was built and tested: it needs the flyer's second neighbour within 4.5 of pad A, which fails as soon as the seesaw tilts 1.0 (the fix for issue 1 at 4-5 players). Ruben remains the counterweight at every size and the anchor at 2 players. |
| 8. A communication moment that matters | The shot's order now matters and is signed (see above): the barbell is single-use. |

## Critic round 2 (re-check of the fixes)

- Both round-1 shortcut scripts and all 5 committed shortcuts fail in their attempt phase at 2-5 players.
- The block at x 22 makes the waiting spot tight from 3 players: a climber who waits on the floor just left
  of it (x 20.8-21.9) stops the next one; on top of it (x 22.2-22.75) every size wins. Recoverable (move and
  retry); the sign « Attends sur le banc ↓ » says where to wait.
- Placed bodies only, not reached in play: at 5 players, with the spent barbell and Ruben on pad B (4) and a
  4-tower of friends on pad A (4), a tie keeps the seesaw's tilt and the top, leaning 0.5 per body, reaches
  the mezzanine. The bots could not build it from the tunnel (the exit order puts F0 out first). At 4 players
  the 3-tower is 0.2 short there, under the 0.3 rule. An engine rule "a tie levels the seesaw" would close it.
- Issues 2 and 3: the barbell lands 0.57 s after the hit; any flyer jump in that window loses the shot. No
  level-only fix found (pads are not plates and the switch only toggles shelves); the signs carry it.
