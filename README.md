# Hollowdeep

An open-world action game set in a single continuous dungeon. You start by picking
**one** weapon, and that choice *is* your class — there is no separate class menu, and
you cannot carry both.

| Weapon | Class | Identity |
|---|---|---|
| **Wooden Sword** | **Melee** | 140 HP, 15% damage reduction, wide arcing swings that hit everything in reach, a charged **Cleave** that stuns and throws, an i-frame **Dash**, and health restored on every kill. |
| **Slingshot** | **Ranger** | 85 HP, fastest movement, rapid self-refilling pebbles, a charged **Piercing Shot** that skewers a whole line, an i-frame **Roll**, and up to +45% bonus damage the further away the target is. |
| **Riot Shield** | **Tanker** | 200 HP and the slowest legs in the deep. Bracing raises the shield, which turns **red attacks blue** — nothing is unblockable to you. Upgrades to the **Spiky Shield** in Sarapolis. |
| **Bone Staff** | **Necromancer** | 100 HP and a mana pool. RMB raises whichever servant is on your wheel, four standing at once. |
| **Wooden Staff** | **Mage** | 82 HP, the thinnest skin in the deep, and four elements on a wheel — eight spells in total. |

The five share almost nothing: separate stat lines, separate resources, separate
level-up perk pools (8 shared boons + 6 exclusive to each class).

### The wheel — `R`

**Every** class now carries a loadout on `R`, not just the casters. **Tap** to cycle
to the next; **hold** to open the wheel, point, and release to pick. Holding
slows time to a quarter speed, so switching mid-fight is a decision rather than
a scramble.

**Necromancer minions** — cap of four at once, the Brute included:

| | Cost | Cooldown | |
|---|---|---|---|
| **Thrall** | 14 | 2s | 10 damage a swing, crumbles after 15 seconds |
| **Bloat** | 22 | 10s | Runs in and detonates for 30 in a wide circle |
| **Bone Brute** | 40 | 30s | 200 HP, one at a time, and enemies attack *it* instead of you |
| **Jarona** | 18 | 2s | A shouted **3-hit bounce combo**, ricocheting between targets, outlined in blue |

**Mage elements** — each has a light cast and a charged heavy:

| | Light | Heavy |
|---|---|---|
| **Fire** | Fireball | **Meteor** — 50 to the target, 30 around it. Half your mana. |
| **Earth** | Vine trap that roots and bleeds | **Bloom** — a turret that fights for 30s, then bursts into damaging goo |
| **Ice** | Shard that slows, 1-in-100 to freeze outright | **Ice Wall** — 60 to the target, 20 around it. 70% of your mana. |
| **Air** | Tornado — flings the weak, shoves the rest | **Tempest** — a screen-wide storm that *deletes* every non-elite caught in it, at the cost of **all** your mana and stamina |

Elites and bosses are too heavy to root, fling or blow back, and can never be
frozen by a lucky shard — against them those spells are damage only.

## Running it

No build step, no dependencies. Either open `index.html` directly in a browser, or:

```bash
python3 -m http.server 8123
```

then visit `http://localhost:8123`.

## Controls

| | |
|---|---|
| `W A S D` / arrows | Move |
| Mouse | Aim |
| `LMB` (hold to repeat) | Primary attack — Swing / Pebble |
| `RMB` (hold to charge, release) | Heavy attack — Cleave / Piercing Shot |
| `SHIFT` | Dash / Roll — costs energy, grants brief invulnerability |
| `SPACE` | Parry — a short window that negates blue attacks |
| `R` | Tap to cycle your loadout, hold to pick from the wheel |
| `E` | Interact with chests, fountains, shrines, the Warden's Gate |
| `TAB` | World map |
| `ESC` | Pause |

## The red shrines

Five red shrines burn in every map, and the boss gate stays bound until all
five are out. They are placed evenly along the depth ladder rather than at
random, so finishing them means crossing the map instead of sweeping one corner.

Breaking one is a fight, not a fetch. Pressing `E` calls its guardians — four to
seven of them, scaled to the region, with an elite in the mix — and the shrine
only goes dark when the last of them is down. Walk away and it stays lit; the
guardians will still be there when you come back. Each shrine you extinguish
drops a heart and a weapon shard.

**While a shrine fight is live you always know what's left:**

- a **number floating over the shrine** — how many guardians still stand
- a **red diamond above each guardian**, so you can tell them apart from the
  ordinary enemies already in the room
- a **banner at the bottom of the screen** with a progress bar
- **arrows at the screen edge** pointing at any guardian that has wandered out
  of view, plus one back to the shrine itself
- guardians show **larger and in red on the minimap**

The HUD also tracks your overall count (`Shrines: 2/5`), and red shrines show on
both maps in red.

## The bestiary

Ten enemy types, each built around the parry/dodge read:

| | Attacks |
|---|---|
| **Cave Slime** | lunge |
| **Dusk Bat** | dart — the tightest parry in the game at 0.3s |
| **Bone Archer** | arrow (parry it back at them) |
| **Bile Spitter** | spit that leaves a burning puddle where it lands |
| **Crossbow Sentinel** | quick bolt · **skewer**, a long-tell piercing shot |
| **Rot Mortar** | lobs shells at where you're standing — the marker is the only warning |
| **Stone Brute** | swipe · **charge** |
| **Revenant** | fast slash on a 1s rhythm · **overhead** |
| **Ironclad** | bash · **crush**. Takes 70% less damage from the front — parry it or get behind it |
| **Hollow Wraith** | homing orb · **rend**, and it walks through walls |

## Combat: read the colour

Nothing damages you by touching you. Every enemy attack is a wind-up you can
see coming, and the colour tells you what to do about it:

- **Blue ring — parry it.** `SPACE` opens a 0.24s window. Land it and the hit
  is negated, the attacker is staggered for 1.3s and takes **60% extra damage**
  while it reels, and you get 25 energy back. Mistime it and you eat the hit
  plus a half-second lockout.
- **Red ring with a `!` — you cannot parry this.** Dash through it, or leave.
  Trying to parry a red costs you a 0.9s lockout on top of the damage.

A closing ring marks the timing: it touches the enemy at the exact moment the
blow lands. A shaded wedge shows where the blow will reach. Both have audio
tells, so you can hear a red wind up off-screen.

Parried projectiles are **reflected back at whoever fired them**, at boosted
damage — and the shooter is staggered, so the return shot lands on a target
taking 60% extra. Archers can be killed with their own arrows.

Dashing is the universal answer: invulnerability frames beat blue and red
alike. Parrying is the greedy one — it costs no energy, gives energy back, and
opens a damage window, but only works on blue.

## Saving

**Three independent save slots**, numbered 1 to 3 on the title screen. Each
autosaves every 5 seconds to `localStorage`, so you can close the tab or shut
the laptop down and pick any of the three runs up later. Clicking an occupied
slot resumes it; clicking an empty one selects it for a new run.

It is a *suspend/resume* save, not a checkpoint. The save is deleted the moment
it is loaded and the moment a run ends, so you can put a run down — but you
cannot reload to undo a death. A separate record (runs, wins, bosses felled,
best time) survives everything.

The save is ~1 KB because it stores inputs rather than results: map seeds, perk
ids, and which props you used. The dungeon itself is regenerated from its seed,
and perks are replayed through `perk.apply()` on load.

Note that `localStorage` is keyed to the origin, so serving the game on a
different port gives you a different set of save files.

### Indexing convention

Every authored sequence in this codebase counts **from 1**: save slots, UI
slots, loadout slots, map numbers, weapon tiers, shrine ids. `Seq` in
`js/util.js` is the only place the offset lives, so the convention is
greppable rather than smeared through the code as bare `+1`s.

Engine-internal buffers are the deliberate exception and remain 0-based — the
`Uint8Array` tile grid (`ty * w + tx`), spatial-hash buckets, typed arrays and
canvas pixel data. Those are addressed by hardware and DOM contracts that
define index 0 as the first element; renumbering them would not be a
convention change, it would be an off-by-one in the renderer and the collision
system.

## The world

One 152×152-tile dungeon generated at startup and fully connected — no level
transitions, no loading between areas. Rooms are joined by a minimum spanning tree
plus ~40% extra edges, so the map loops back on itself and can be roamed in any order.

Difficulty is driven by *graph distance from the entrance* rather than a floor counter.
As you push outward the region changes (Entry Halls → Weeping Cisterns → The Ossuary →
Fungal Deeps → The Emberworks → Warden's Reach), enemy tables get nastier, and health,
damage and rewards all scale with the tier. The **Hollow Warden** always sits in the
room furthest from where you started; opening its gate seals the room until one of you
is dead.

Five enemy archetypes with distinct AI (chaser, erratic flier, kiting archer,
telegraphed charger, wall-phasing wraith), plus elites, plus a three-phase boss that
slams, charges, summons and fires spirals.

Enter a world seed on the title screen to replay the same dungeon; the seed is shown on
the map and on the results screen.

## Layout

```
index.html        markup, HUD, title/level-up/pause/map/end screens
css/style.css     all styling
js/util.js        math, seeded RNG, particles, floating text, screen shake
js/spatial.js     uniform-grid spatial hash for all proximity queries
js/save.js        localStorage persistence and explored-map packing
js/maps.js        map definitions: size, palettes, spawn tables, boss
js/dungeon.js     procedural generation, regions, props, lighting anchors
js/summons.js     Necromancer minions and Mage ground effects
js/weapons.js     the classes and the perk pools — the core design file
js/entities.js    player, enemies, projectiles, pickups
js/game.js        loop, camera, renderer, lighting, interaction, UI
js/main.js        bootstrap
```

### Adding a class

Everything a class needs lives in one entry of `CLASSES` in `js/weapons.js`:
stats, weapon tiers, `onPrimary` / `onHeavy` behaviour, and `drawWeapon`.
Nothing outside that file branches on which class you are, so a new class is a
data change. Class-exclusive perks are tagged with `only: '<classId>'` in the
same file. Casters set `maxMana` and the mana bar appears on its own.

### Adding a map

Append an entry to `MAPS` in `js/maps.js` — size, room count, six region
palettes, six spawn tables, threat bias, boss and boss health. The run walks
the list in order and ends after the last one.
