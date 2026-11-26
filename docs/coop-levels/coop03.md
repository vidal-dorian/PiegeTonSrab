# coop03 · L'Amphi

> « Je me mets au fond, personne me verra. »

Files: `packages/shared/src/coop/levels/coop03.ts` (the level),
`packages/shared/src/coop/levels/coop03.solution.ts` (bot solution and shortcuts).
Check: `npx tsx packages/shared/scripts/check-coop-level.ts coop03`.

## Idea

« Ruben pèse deux… mais l'ordre compte. » Every gate of the level is a plate-and-gate pair, and
the whole level is about *who* stands on *which* plate, *when*:

- Beat 1 shows the relay with plates "1" (anyone can hold, either side).
- Beat 2 changes the number: the plate before the gate needs 2, which only Ruben weighs (at 2
  players), so Ruben must be the one left behind, and a friend must let him through.
- Beat 3 turns it around twice: a plate "W-1" needs *everyone but one friend*, and a plate "= 1"
  refuses Ruben because he weighs too much. And the plate that frees the team shuts the key's
  gate, so the key must be taken before anyone leaves the bench.
- Beat 4 is the outro: down the tiers of the lecture hall to the door on the stage.

No death is possible anywhere (no spikes, saws, pits or `~`). Gates lock people in, never kill.

## Map

82 x 19, the back corridor (floor top 9, ceiling 4, 5 rows high) then the lecture hall.

```
          111111111122222222223333333333444444444455555555556666666666777777777788
0123456789012345678901234567890123456789012345678901234567890123456789012345678901
##################################################################################  0
##################################################################################  1
##################################################################################  2
##################################################################################  3
#.............g............#..................#..................................#  4
#.............g............#..................#..................................#  5
#.............g............#..................#..................................#  6
#.............g.........cc.#.................f#..................................#  7
#.S...........g............h..................x..................................#  8
#########aa####bbb##########ddd####wwppppp#####rrr###............................#  9
###################################...n.K.###########............................# 10
#########################################################........................# 11
#########################################################........................# 12
#############################################################.................D..# 13
#############################################################.................D..# 14
#################################################################........######### 15
#################################################################........######### 16
##################################################################################  17
##################################################################################  18
```

| Char | Thing | Where | Need / link |
|---|---|---|---|
| `a` | plate | floor, x 9-10 | 1, `relais` |
| `g` | gate | x 14, floor to ceiling | `relais` |
| `b` | plate | floor, x 15-17 | 1, `relais` |
| `c` | plate (the "reserved seat") | a shelf 2 above the floor, x 24-25, over a 1-high passage | 2, `place` |
| `h` | gate | x 27, the 1-high opening under a wall that reaches the ceiling | `place` |
| `d` | plate | floor, x 28-30 | 1, `place` |
| `w` | gate, horizontal (trapdoor) | floor, x 35-36, over the basement | `controle` |
| `p` | plate (the bench) | floor, x 37-41 | W-1, `controle` |
| `n` | gate, inverted (the key's niche) | basement, x 38 | `libre` |
| `K` | key | basement, x 40, under the bench | |
| `f` | plate | a 1-wide shelf 2 above the floor, x 45, over the 1-high way to gate x | **= 1**, `libre` |
| `x` | gate | x 46, 1-high opening under a wall that reaches the ceiling | `libre` |
| `r` | plate | floor, x 47-49 | 2, `libre` |
| `D` | door | the stage (estrade, floor 15), x 78 | |

The basement (row 10, x 35-41, 1 high; 2 high under the trapdoor) is closed everywhere but
through the trapdoor.

### Plate numbers by team size

W = players + 1 (friends 1, Ruben 2).

| Plate | 2 players | 3 | 4 | 5 |
|---|---|---|---|---|
| a, b, d | 1 | 1 | 1 | 1 |
| c, r | 2 (Ruben only) | 2 (Ruben, or two friends) | 2 | 2 |
| p (W-1) | 2: Ruben alone | 3: Ruben + 1 friend | 4: Ruben + 2 friends | 5: Ruben + 3 friends |
| f (= 1) | exactly one friend | same | same | same |

"W-1" always leaves exactly one player free, and that player is a friend: without Ruben the
friends weigh W-2 at most; two players free leave W-2 at most.

## Beats and the exact solution (bots)

Roles: R is Ruben, F0..F3 the friends in seat order. Spawn order left to right is F0..F3, R, so
Ruben walks in front, and Ruben's chain neighbour is the last friend. F0 is the free end of the
chain: the bots make him the free one in beat 3.

### 1. Relais (x 9-17)

Ruben walks in front and stops against gate g (13.5). The friend behind him stands on plate a
(1/1): g opens. Ruben walks through onto b (17.4). Now b holds g, the friends come through and
everybody walks on. Plate a is 3 cells short of g: someone who steps off a has 0.15 s before g
shuts, 1.05 cells at full run, and needs 2.2 cells to reach it (margin 1.15 cells), so nobody
opens it and runs through alone.

### 2. La place de Ruben (x 23-30)

The seat (plate c, "2") is a shelf 2 cells above the floor, over a 1-high passage that leads to
gate h. A friend who jumps on it reads "1/2" and nothing happens. Ruben jumps on (2/2): h opens.
The friends walk under the seat, through h, onto d. Ruben drops off the seat into the open column
at x 26 and goes through h, held by d. Ruben is now behind the friends: "au fond".

- 3+ players (bots): only the friends but F0 go through before Ruben drops; F0 waits under the
  seat and follows Ruben, so F0 ends at the back of the line, behind Ruben.
- Ruben cannot open h and run: off the seat he falls 2 cells along the wall above h (about 0.25 s)
  before he can enter the 1-high opening.

### 3. Le contrôle surprise (x 34-49)

**The bench.** Everybody but one friend sits on the bench p (W-1): Ruben at its left end (37.6),
the other friends after him. The trapdoor w (just left of p) opens.

- 2 players: F0 is in front of Ruben (beat 2 left Ruben behind him), so he hops over Ruben into the
  open trapdoor (« Ruben, bouge pas, je te saute par-dessus ! »).
- 3+ players: F0 is behind Ruben and simply waits on the trapdoor; it opens under him when the
  last of the others sits down.

**The key.** In the basement F0 walks right under the bench, through the open gate n, and picks up
the key (x 40). He comes back under the trapdoor (36.4); the bench shifts one cell right (still
on p) and F0 jumps out onto the bench's left end (37.6). Anybody leaving the bench while F0 is
down shuts the trapdoor over him: he stays locked in until they sit again (« une grille enferme
sans tuer »).

**The way out.** Everybody leaves the bench (the trapdoor shuts behind them) and queues at gate x,
the front of the line in the 1-high cell under the shelf. F0, at the back, jumps onto the shelf
plate f (= 1): gate x opens and gate n shuts. Ruben cannot do this: his 2 is not "= 1", and two
friends together are not either. The team walks out onto r; r (2) is held by Ruben at 2 players,
by Ruben or two friends from 3. F0 drops off the shelf and walks out through x.

The order is forced: f shuts n, so the key cannot be taken while the team is being freed; and the
trapdoor only opens while the bench is full, so once the team has left the bench nobody reaches
the key (the rope, too, keeps the free friend within a link of the bench).

### 4. Les gradins (x 50-80)

Three tiers of 2 down to the front floor (17), then the stage (estrade, a step of 2 up) and the
door. The bots pass the key forward along the queue (↓ next to the carrier) so the front one
opens the door; players can also let the carrier through on the tiers.

### Bot times (checker)

| Players | Total | Notes |
|---|---|---|
| 2 | 17.0 s | F0 hops over Ruben into the trapdoor |
| 3 | 17.4 s | |
| 4 | 17.4 s | |
| 5 | 17.3 s | |

Players who know the level should take 45-60 s: most of it is talking (who sits, who goes down,
who takes the shelf).

## Heights and margins

| Spot | Height | Who | Margin |
|---|---|---|---|
| The seat c, the shelf f | 2 above the floor | a lone jump (apex 3.0) | 1.0 |
| Out of the basement | 2 | a lone jump | 1.0 |
| Over Ruben (2 players) | 0.9 | a lone jump | 2.1 |
| The stage | 2 | a lone jump | 1.0 |
| Passages under c and f, gates h and x | 1 high | walking only (0.1 above a body) | no tower, no jump |
| Corridor | 5 high | gates g, h, x and the walls above them reach the ceiling | a 2-tower jumping from Ruben's head peaks with its feet 1.1 below the ceiling: gate g would still hold with its top cell removed (the control run needed two cells cut) |

Rope reach (4.5): plate a to the far side of b: 4.2 to 5 (the rope may drag the holder off a at 2
players, but by then Ruben is in g's box or on b, so g stays open); Ruben on the seat to his
neighbour on d: 3.3 to 4.3; F0 in the basement to his neighbour on the bench: at most 3.6; F0 on
the shelf to the team on r: at most 3.9.

## Variants by team size

No cell variants are needed: the numbers scale through W-1.

- 2 players: Ruben is the only one who can open h (c) and hold r; F0 hops over him in beat 3.
- 3+ players: two friends can replace Ruben on c and on r (accepted, as in level 5: two friends
  weigh Ruben). Ruben is still needed on p at every team size (W-1 cannot be reached without him).

## Ruben's active moments

- His seat c: at 2 players he alone opens gate h; he stays there at most a few seconds.
- The bench p: W-1 cannot be reached without him, at any team size. He sits only while F0 drops
  in, takes the key and jumps out (about 3 s for the bots, well under 20 s for players).
- Plate r: he holds the door from outside for the friend on the shelf.

## Communication moment

The bench: « Tout le monde assis, sauf un ! », then « Personne ne bouge, je suis en dessous ! »
(leaving the bench locks the free friend in), then « Pas toi Ruben, c'est égal à un ! » at the
shelf.

## Shortcuts

Each shortcut in `coop03.solution.ts` plays the solution up to the beat it tries to skip, then an
`ATTEMPT` phase, then what would finish the level had the attempt worked. All of them fail at 2,
3, 4 and 5 players, in their attempt phase (checked with a script that runs every shortcut at
every team size and reads the failing phase):

| Shortcut | What the bots try | Why it fails |
|---|---|---|
| a friend alone on Ruben's seat | Ruben's neighbour sits on c (1/2), the others try gate h | c needs 2 |
| Ruben as the free one | all the friends sit on p, Ruben waits on the trapdoor | without Ruben p is short by 2 |
| freeing the others before taking the key | full bench, F0 jumps over the trapdoor straight onto f (n shuts), the team goes out onto r, F0 goes out, then goes back for the key | the bench is empty, so the trapdoor stays shut (and the rope keeps F0 near the team) |
| Ruben on the = 1 plate | after the key, Ruben jumps onto f, the friends try gate x | f needs exactly 1; Ruben weighs 2 |
| a tower over gate g | nobody on a; Ruben's neighbour climbs on Ruben at g and jumps for the far side | g reaches the ceiling |

Control experiment (not committed): with the level weakened (c needing 1, p needing W-2, f
needing at least 1, two cells cut off the top of g), the same bots get through their attempt
phase, so the attempts are real attempts and it is the level that stops them.

### Accepted

- **Trains**: from 3 players, a team walking in a tight line keeps plate a or gate g's box
  occupied all the way through, so beat 1 passes without a deliberate handover. It is still
  bodies holding the gate for each other.
- **Door wedge**: a gate never closes on a body, so a player standing in the doorway of g, h or x
  keeps it open for the one behind, which makes the relay plates b, d and r optional. The first
  opening still needs a (anyone), c (Ruben) and f (one friend, not Ruben), which is the puzzle.
- **Two friends for Ruben** on c and r from 3 players.
- **Doing beat 3 in the wrong order is recoverable**: after freeing the team first, they can all go
  back in (r from outside, f or a door wedge from inside) and redo the bench in the right order.
  Nothing has to be restarted, which suits a level with no death.

## Deviations from the plan, and why

- **The key's gate is not shut for good.** "La plaque qui libère les autres referme la niche":
  plate f (and r) shut gate n only while pressed. The engine has no latching plates, and an
  irreversible mistake would force a restart in a level meant to have no death. The order is still
  forced: n is shut whenever the team is being let out, and the trapdoor needs the full bench, so
  the key can only be taken with the team seated.
- **Plates on shelves.** The seat c and the "= 1" plate f are shelves above 1-high passages
  instead of floor plates, so the team can walk past the one holding them (bodies block each other
  sideways, and Ruben cannot be climbed over). It also stops the holder from opening the gate and
  running through.
- **f and r are more than one link from gate n.** n is the inverted gate of their link; nobody
  ever passes it while they are held, so the one-link rule (meant for gates passed while someone
  holds the plate) does not apply.
- **The tiers go down.** The plan's "les gradins jusqu'à la porte, sur l'estrade": the corridor is
  the back of the hall (« au fond »), the tiers go down to the stage, which is a step of 2 up. It
  is an outro, not a beat.
- **2 players vs 3+ in beat 3.** At 2 players beat 2 leaves Ruben behind the only friend, who hops
  over him into the trapdoor; from 3 players the friend at the back of the line is behind Ruben
  and just stands on the trapdoor.

## Engine notes

- A body that straddles two plates (or a plate and a trapdoor) is supported by only one of them,
  the one whose thing comes first in reading order. Ruben's spot on the bench is 37.6, fully off
  the trapdoor: at 37.4 he stood half on the trapdoor and did not count on p.
- "A gate never closes on a body" makes every relay plate optional (the door wedge above). Levels
  that want a real "the last one needs a plate" must put the gate where nobody can stand in it.
