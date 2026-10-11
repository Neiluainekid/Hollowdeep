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

*Developed by Neil Uaine.*

## Update 3.0 at a glance

- **Inventory (`I`) and shop.** Four gear slots — Armor (defense), Boots
  (speed), Ring (one specific buff), Gauntlets (damage) — on you *and* on each
  companion; the arrow on the right of the inventory flips to their pages.
  100 accessories in all, sold by the Hollow Peddler (`$` on the map) and
  occasionally found in chests. One of them is the **Cursed Totem**.
- **Bosses** now have **100,000 HP** (Tripolisis) and **200,000 HP**
  (Sarapolis), fight in **combos**, and only their gold **HEAVY** attacks can
  be parried. Each gets an intro and lines. Judgement now actually appears
  after the Sun God.
- **John Space** can be provoked with `E` into a two-minute trial with a
  parry-chain mechanic.
- **Six new enemies**, including a cop car that tries to run you over.
- **Companions** level up, have unique skills, wear gear, follow you properly,
  and are limited to one of each kind per dungeon.
- Class reworks: Sword / Double Sword, the 85-second grenade, slingshot
  deflects, Bloat / Bone Brute / Jarona Necklace, Earthquake and Tornado, and
  the Tanker's Ricochet mode.
- Fixes: red-shrine guardians no longer clip through walls; companions and
  minions no longer get lost; killing a boss that levels you up no longer
  stalls the descent.

### The wheel — `R`

**Every** class now carries a loadout on `R`, not just the casters. **Tap** to cycle
to the next; **hold** to open the wheel, point, and release to pick. Holding
slows time to a quarter speed, so switching mid-fight is a decision rather than
a scramble.

**Necromancer minions** — cap of four at once, the Brute included:

| | Cost | Cooldown | |
|---|---|---|---|
| **Thrall** | 14 | 2s | 10 damage a swing, crumbles after 15 seconds |
| **Bloat** | 22 | 10s | Detonates for 40 across a **10×10-tile** area. Summoning it drains **all** your mana for 5s and holds your health at **65%** for 5s (the trimmed health comes back) |
| **Bone Brute** | 40 | 30s | 200 HP, one at a time, enemies attack *it* instead of you, and it **bashes** for 100 |
| **Jarona** | 18 | 2s | A shouted **3-hit bounce combo**. Wear the **Jarona Necklace** (a ring) and every bounce is a **super dash** for 100–200 |

**Melee blades** — `R` swaps between **Sword** (the usual) and **Double Sword**:
slower on your feet, +10 health, and a heavy that **slices straight through**
a line of enemies — after which your dash is locked for 3 seconds.

**Ranger ordnance** — `R` swaps the slingshot for a **Hand Grenade**: one
every **1:25**, a **3 second** visible fuse, and **100–500** damage rolled
separately for every enemy in a **5×5-tile** blast. Slingshot pebbles with the
Ricochet perk also kick off walls, and **dashing into one (or parrying next to
it) deflects it** back out along your aim at 1.9x speed and 1.6x damage.

**Tanker brace modes** — Heavy Dash, Heavy Slam and **Ricochet**: the heavy
rolls you forward, and the ring around you turns **green** as you are about to
meet an enemy or a wall. Click `LMB` then and the impact becomes a **blue
shockwave** that bounces you off to keep rolling, as long as you keep timing
it. Click when it is not green and it turns **yellow** and costs 50 stamina.
Click nothing and you just bump to a stop. Taking a hit ends the roll.

**Mage elements** — each has a light cast and a charged heavy:

| | Light | Heavy |
|---|---|---|
| **Fire** | Fireball, **30–40** | **Meteor** — 50 to the target, 30 around it. Half your mana. |
| **Earth** | Vine trap that roots and bleeds | **Earthquake** — 100 damage every 2s to everything in a **10×10-tile** area around you. Drains **all** your mana and holds it at zero for 3s |
| **Ice** | Shard, **30–40**, slows, 1-in-100 to freeze outright | **Ice Wall** — 60 to the target, 20 around it. 70% of your mana. |
| **Air** | Gust — flings the weak, shoves the rest | **Tornado** — sets down where you point and roams from enemy to enemy, **10 damage a second** to everything it touches |

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
| `E` | Interact with chests, fountains, shrines, merchants, the Warden's Gate — and John Space |
| `I` | Inventory: your gear, your coins, your companions' gear |
| `TAB` | World map |
| `ESC` | Pause |

### On a phone or tablet

The game plays in a mobile browser, in **landscape** (hold it upright and it
asks you to turn it). Touch controls appear the moment you touch the screen and
disappear again as soon as you use a mouse or keyboard, so a touchscreen laptop
can use either. On a desktop nothing changes.

| | |
|---|---|
| Left half of the screen | Move — put your thumb down anywhere for a floating stick |
| Right half of the screen | Aim stick — push it to attack that way. Without it, you auto-aim at the nearest enemy in sight |
| **HEAVY** | Hold to charge, release to fire; drag while holding to aim it |
| **DASH** · **PARRY** | As the keys. The parry window is 25% wider on touch |
| **Ability** (shows your loadout icon) | Tap to cycle, hold and drag to pick from the wheel |
| **USE** | Interact. The prompt at the bottom of the screen is tappable too |
| Top right | Inventory · map · pause · fullscreen |
| Rhythm break | Four arrow pads appear in place of W A S D |

Tap anywhere to skip a boss intro. Starting a run goes fullscreen and locks
landscape where the browser allows it (Android Chrome does; iPhone Safari has
no fullscreen for pages, so add it to the home screen for the best fit). Small
screens also render the world zoomed out a little, so you can still see
attacks coming.

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

Seventeen enemy types, each built around the parry/dodge read. Enemies in the
first dungeon, Tripolisis, have 20% less health and damage and turn up elite
less often than they used to.

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
| **Tridon's Curse** | no attacks at all — it runs at you and detonates. A kaboom icon overhead flashes faster as the fuse burns, and killing a lit one only sets it off early |
| **Cop Cruiser** | **run over** — revs with its whole lane painted on the floor, then floors it in a straight line it cannot steer. One sidestep beats it; if it hits a wall it crashes and sits there dazed |
| **Grave Hound** | bite · pounce. Fast, fragile, comes in numbers |
| **Ember Imp** | a fan of three embers — parry the middle one |
| **Spore Puffer** | **puff**, an unblockable ring of spores that leaves the floor poisoned |
| **Chest Mimic** | sits still looking like furniture until you are close. chomp · **gulp** |
| **Phantom Lancer** | blinks out beside you. jab · **thrust**, long and narrow — step sideways, not back |

## Bosses

Three, each with a named health bar, an intro, and things to say:

| | Map | HP | Character |
|---|---|---|---|
| **Flowery** — *The Bloom That Watches* | Tripolisis | 100,000 | Lashes and volleys; summons and area denial |
| **The Sun God** — *Predicament King* | Sarapolis | 200,000 | A corona of rays; relentless ranged pressure |
| **Judgement** — *Pure Devastation* | Sarapolis (final) | 200,000 | Steps out of the Sun God's wreckage. Fists, swipes and rushes |

All three carry a **1.5x damage multiplier** on top of region scaling and fight
in **combos**: strings of light attacks that end in a **HEAVY**, telegraphed in
gold with a `HEAVY — PARRY` badge and a gong. **Only heavies can be parried on a
boss** — a parry against a light attack simply does not catch it. Parrying a
heavy opens the rhythm break, which is where the real damage is: chip damage
barely marks a six-figure health bar.

When the gate opens the world stops for the boss's **intro**: the camera finds
it, the bars come down, it rises out of the floor and speaks (`E` skips). It
talks again on each phase change, sometimes as a heavy winds up, and as it
falls.

## Art

Every creature has its own silhouette and its own attack animation, all in
`js/art.js`. Two shared ideas do the work rather than per-enemy timelines:

- **`Art.pose`** turns attack state into a pose — the wind-up coils back and
  compresses, the active frame snaps forward and stretches, recovery settles.
  Every creature animates its attacks from this for free, and the pose is
  driven by the same timings the parry system reads, so what you see is
  exactly what you are timing against.
- **`Art.gait`** derives a walk cycle from actual velocity, so things stride
  faster when they move faster.

Creatures are flipped rather than rotated when facing left, because a full
rotation reads badly from overhead. The player has a per-class build — the
Tanker is broad and helmed, the casters are robed and hooded, the Ranger is
lean — with legs that stride and a torso that leans into a swing.

## Companions

Two are found locked in cages and freed with `E`; the third decides for himself.
They are persistent — no expiry timer — they pull attacks off you, and
**drinking from a fountain heals every companion with you**, which is the
reason to save a fountain rather than sip it the moment you find one.

| | HP | Skill |
|---|---|---|
| **The Disgraced One** | 200 | **Disgrace Flurry** — six barehanded blows in a blur |
| **Switcher** | 150 | Swaps places with enemies near you, and **Thunderclap** staggers everything around it |
| **John Space** | 500 | **Space Punch** — crosses the room in one step and hits like a comet |

Companions **level up** from kills (the full kill if they landed it, a share of
any kill nearby), gaining health and damage each level. They wear gear in the
same four slots you do. You get **one of each kind per dungeon**; going down to
the next dungeon sends them all home (their gear comes back to your bag) and
you have to find new ones there.

They follow properly now: you leave a breadcrumb trail, and a companion or
minion that loses sight of you walks the trail back through the same doors you
took. One that falls hopelessly behind or wedges itself is brought back to your
side. Off-screen companions and minions get **trackers** — an arrow at the
screen edge in their colour, with the distance — and show on the minimap.

**The Cursed Totem** is a ring. Wear it and your maximum HP, mana and stamina
are halved until **4 seconds after you take it off**. Put it on a companion and
they **turn on you**: they become a cursed enemy wearing their face, and the
totem drops back to you when they fall.

### John Space

He stands in the deeper regions doing nothing, neutral, carrying his own bar so
you know he is Someone. What he becomes is entirely your choice:

- **Attack him** and the arrangement ends: he becomes a **1000 HP** chaser
  dealing **double damage** that does not stop following you.
- **Leave him alone for two minutes** and he simply joins you as a **500 HP**
  companion.
- **Press `E` beside him** and he fights you — **the trial**. A clock counts
  down two minutes; survive it **without hitting him back** and he joins you,
  a couple of levels up for the trouble. Strike him (thorns included) and it
  is the 1000 HP version instead. His light attacks cannot be parried. His
  gold **HEAVY** can, and parrying it starts a **parry chain**: two to four
  follow-up heavies, each faster than the last, every one of which has to be
  parried. Break the chain and he reels, and 15 seconds come off the clock.

### The rhythm break

**Parrying a boss stops the world.** All spatial movement freezes and a WASD
prompt sequence opens — 4 beats, rising to 6 in later phases, each on a 0.75s
timer with a closing ring. Hit the beats and the boss eats 3% of its maximum
health per beat landed, 1.5x for a clean run, on top of the parry's stagger
multiplier — a perfect break removes about 29% of a boss. Miss them all and
you get nothing but the ordinary parry. Either way you leave with full energy.
Only a parried **HEAVY** opens it (see Bosses).

## Inventory and the shop

`I` opens the inventory: your coins, your four slots, and your bag. Click a bag
item to put it on whoever the page is showing; click a worn item to take it
off. With companions, the arrow on the right (or the arrow keys) flips to each
of their pages. Items that do nothing for a companion, and the totem, say so.

| Slot | Gives |
|---|---|
| **Armor** | Defense — a damage-reduction layer on top of class armour |
| **Boots** | Speed |
| **Ring** | One specific buff: health, regeneration, heal-on-kill, crit, coins, experience, faster attacks, a longer parry window, cheaper dashes, thorns, luck… plus the Jarona Necklace and the Cursed Totem |
| **Gauntlets** | Damage |

There are **100 accessories**: 25 per slot, the first 24 of each non-ring slot
climbing a material ladder from Rag to Starforged, plus one named legendary
each. The **Hollow Peddler** keeps a stall in the entrance hall of every map
and one or two more deeper in (`$` on the map); each stocks nine or so pieces,
and what you buy is gone from that stall for good. Chests sometimes hold an
accessory too.

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
js/items.js       the 100 accessories, gear slots, and shop stock
js/dungeon.js     procedural generation, regions, props, lighting anchors
js/art.js         every creature and player silhouette, plus attack poses
js/shrines.js     shrine families, outcomes and the shared icon table
js/npcs.js        companions (The Disgraced One, Switcher, John Space) and Follow
js/summons.js     Necromancer minions and Mage ground effects
js/weapons.js     the classes and the perk pools — the core design file
js/entities.js    player, enemies, projectiles, pickups
js/touch.js       touch controls for phones and tablets
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
