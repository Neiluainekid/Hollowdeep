/* Map definitions. A run is a sequence of these: clear a map's boss, descend
   into the next, and the run ends when the last one falls.

   Everything that used to be hardcoded in the dungeon generator — size, region
   palettes, enemy spawn tables, boss — lives here now, so adding a map is a
   data change rather than a code change. */
'use strict';

// Region palettes double as the difficulty ladder inside a single map:
// index 0 is the entrance, the last index is the boss's doorstep.
const MAPS = [
  {
    number: 1,                 // 1-based: maps are "Map 1" and "Map 2"
    id: 'tripolisis',
    name: 'Tripolisis',
    subtitle: 'Dungeon of Chaos',
    seedSalt: 0,
    w: 152, h: 152,
    roomTarget: 46,
    threatBias: 0,
    bossType: 'warden',
    bossName: 'The Hollow Warden',
    bossHp: 1100,
    gateLine: "The Warden's Gate. Press E when you are ready.",
    intro: 'Tripolisis — Dungeon of Chaos',
    regions: [
      { name: 'Entry Halls', floor: '#4c4657', wall: '#15121b', accent: '#665c73' },
      { name: 'Weeping Cisterns', floor: '#3a525d', wall: '#0f181d', accent: '#4f6f7d' },
      { name: 'The Ossuary', floor: '#585044', wall: '#1a1712', accent: '#756a58' },
      { name: 'Fungal Deeps', floor: '#41553a', wall: '#12180f', accent: '#587042' },
      { name: 'The Emberworks', floor: '#5c4239', wall: '#1b110e', accent: '#7b503f' },
      { name: "Warden's Reach", floor: '#4b3854', wall: '#170e1b', accent: '#66486f' },
    ],
    tables: [
      ['slime', 'slime', 'bat'],
      ['slime', 'bat', 'bat', 'skeleton', 'spitter'],
      ['bat', 'skeleton', 'spitter', 'brute', 'revenant'],
      ['skeleton', 'crossbow', 'brute', 'revenant', 'wraith', 'spitter'],
      ['crossbow', 'brute', 'wraith', 'revenant', 'ironclad', 'mortar'],
      ['wraith', 'ironclad', 'mortar', 'revenant', 'crossbow', 'brute'],
    ],
  },
  {
    number: 2,
    id: 'sarapolis',
    name: 'Sarapolis',
    subtitle: 'Dungeon of Devastation',
    // Salting the seed keeps map 2 different from map 1 while a single
    // typed seed still reproduces the whole run.
    seedSalt: 0x9e3779b9,
    w: 168, h: 168,
    roomTarget: 52,
    threatBias: 2,          // picks up where Tripolisis left off
    bossType: 'warden',
    bossName: 'The Hollow Warden',
    bossHp: 2400,
    gateLine: 'The gate of the ruined city. Press E when you are ready.',
    intro: 'Sarapolis — Dungeon of Devastation',
    regions: [
      { name: 'The Cinder Gate', floor: '#584038', wall: '#1c1210', accent: '#78503f' },
      { name: 'Shattered Aqueducts', floor: '#4a4f52', wall: '#15181a', accent: '#697174' },
      { name: 'The Glass Waste', floor: '#4e4a5e', wall: '#171522', accent: '#6d6688' },
      { name: 'Rot Terraces', floor: '#4a5334', wall: '#161a0e', accent: '#66703f' },
      { name: 'The Slagworks', floor: '#66402c', wall: '#20110a', accent: '#8c5232' },
      { name: 'Devastation', floor: '#5a2f2f', wall: '#1e0d0d', accent: '#7d3a36' },
    ],
    tables: [
      ['skeleton', 'spitter', 'revenant', 'brute'],
      ['spitter', 'crossbow', 'revenant', 'wraith', 'brute'],
      ['crossbow', 'revenant', 'ironclad', 'wraith', 'mortar'],
      ['ironclad', 'mortar', 'revenant', 'wraith', 'crossbow'],
      ['ironclad', 'mortar', 'wraith', 'revenant', 'ironclad'],
      ['ironclad', 'wraith', 'mortar', 'revenant', 'ironclad'],
    ],
  },
];

/* Maps are addressed by 1-based number everywhere outside this file — the
   save format, the HUD and the run sequencer all say "map 1" / "map 2". */
const Maps = {
  FIRST: Seq.FIRST,
  get LAST() { return Seq.last(MAPS); },
  count() { return MAPS.length; },

  byNumber(n) { return Seq.get(MAPS, Seq.clampTo(MAPS, n)); },
  isLast(n) { return n >= this.LAST; },
  next(n) { return Math.min(this.LAST, n + 1); },
  numbers() { return Seq.range(Seq.FIRST, MAPS.length); },
};

