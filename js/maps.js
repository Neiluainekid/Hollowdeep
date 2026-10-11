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
    /* Update 3.0: the first dungeon is a little gentler — ordinary enemies
       here have less health, hit softer, and turn up elite less often. */
    difficulty: { hp: 0.8, dmg: 0.8, elite: 0.65 },
    // 1-based boss table. Entry 1 is the gate boss for this map.
    bosses: [
      { number: 1, type: 'flowery', name: 'Flowery', hp: 100000 },
    ],
    bossType: 'flowery',
    bossName: 'Flowery',
    bossHp: 100000,
    gateLine: 'The Bloom That Watches. Press E when you are ready.',
    intro: 'Tripolisis — Dungeon of Chaos',
    music: 'tripolisis',
    regions: [
      { name: 'Entry Halls', floor: '#4c4657', wall: '#15121b', accent: '#665c73' },
      { name: 'Weeping Cisterns', floor: '#3a525d', wall: '#0f181d', accent: '#4f6f7d' },
      { name: 'The Ossuary', floor: '#585044', wall: '#1a1712', accent: '#756a58' },
      { name: 'Fungal Deeps', floor: '#41553a', wall: '#12180f', accent: '#587042' },
      { name: 'The Emberworks', floor: '#5c4239', wall: '#1b110e', accent: '#7b503f' },
      { name: "Warden's Reach", floor: '#4b3854', wall: '#170e1b', accent: '#66486f' },
    ],
    tables: [
      ['slime', 'slime', 'bat', 'hound'],
      ['slime', 'bat', 'hound', 'skeleton', 'spitter', 'cop'],
      ['bat', 'skeleton', 'spitter', 'imp', 'shroom', 'brute', 'revenant', 'tridon', 'cop'],
      ['skeleton', 'crossbow', 'imp', 'mimic', 'brute', 'revenant', 'wraith', 'tridon', 'lancer'],
      ['crossbow', 'brute', 'wraith', 'revenant', 'ironclad', 'mortar', 'lancer', 'shroom', 'cop'],
      ['wraith', 'ironclad', 'mortar', 'revenant', 'crossbow', 'brute', 'mimic', 'lancer'],
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
    difficulty: { hp: 1, dmg: 1, elite: 1 },
    bosses: [
      { number: 1, type: 'sungod', name: 'The Sun God', hp: 200000 },
      { number: 2, type: 'judgement', name: 'Judgement', hp: 200000 },
    ],
    bossType: 'sungod',
    bossName: 'The Sun God',
    bossHp: 200000,
    // Sarapolis ends with a second fight: beat the Sun God and Judgement
    // steps out of the wreckage.
    finalBoss: { type: 'judgement', name: 'Judgement', hp: 200000 },
    gateLine: 'The Predicament King waits. Press E when you are ready.',
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
      ['skeleton', 'spitter', 'revenant', 'brute', 'hound', 'cop'],
      ['spitter', 'crossbow', 'revenant', 'wraith', 'tridon', 'imp', 'cop'],
      ['crossbow', 'revenant', 'ironclad', 'wraith', 'mortar', 'tridon', 'shroom', 'mimic'],
      ['ironclad', 'mortar', 'revenant', 'wraith', 'crossbow', 'lancer', 'imp'],
      ['ironclad', 'mortar', 'wraith', 'revenant', 'ironclad', 'lancer', 'cop'],
      ['ironclad', 'wraith', 'mortar', 'revenant', 'ironclad', 'mimic', 'lancer'],
    ],
    music: 'sarapolis',
  },

  /* Update 4.0: Day-ZEE. Not a dungeon — the first stage under open sky, a
     military base the dead overran. Its own bestiary (nothing from the deep
     follows you up here), two war machines guarding their yards, and two
     bosses at 500,000 HP each. */
  {
    number: 3,
    id: 'dayzee',
    name: 'Day-ZEE',
    subtitle: 'The Fallen Base',
    seedSalt: 0x85ebca6b,
    w: 176, h: 176,
    roomTarget: 54,
    threatBias: 4,
    outdoor: true,             // open sky: roads, yards, sandbags, floodlights
    difficulty: { hp: 1.15, dmg: 1.1, elite: 1.1 },
    bosses: [
      { number: 1, type: 'colonel', name: 'Colonel Zee', hp: 500000 },
      { number: 2, type: 'judgement2', name: 'Judgement 2.0', hp: 500000 },
    ],
    bossType: 'colonel',
    bossName: 'Colonel Zee',
    bossHp: 500000,
    finalBoss: { type: 'judgement2', name: 'Judgement 2.0', hp: 500000 },
    // The two war machines each hold a yard of their own.
    warMachines: [
      { type: 'tank', tiers: [2, 3] },
      { type: 'battleship', tiers: [4, 4], dock: true },
    ],
    gateLine: 'The command bunker. The Colonel is still giving orders. Press E when you are ready.',
    intro: 'Day-ZEE — The Fallen Base',
    music: 'dayzee',
    regions: [
      { name: 'Checkpoint Alpha', floor: '#55554d', wall: '#2b2a24', accent: '#7c786a' },
      { name: 'Motor Pool', floor: '#4d4c46', wall: '#26251f', accent: '#706b5c' },
      { name: 'The Barracks', floor: '#565042', wall: '#2c271d', accent: '#7f7458' },
      { name: 'Quarantine Zone', floor: '#4b5440', wall: '#22281b', accent: '#6b7a52' },
      { name: 'The Dry Dock', floor: '#46505a', wall: '#1f252b', accent: '#66737f' },
      { name: 'Command Bunker', floor: '#4f4444', wall: '#271f1f', accent: '#755e5a' },
    ],
    tables: [
      ['shambler', 'shambler', 'sprinter', 'k9'],
      ['shambler', 'sprinter', 'k9', 'grunt', 'spewer'],
      ['sprinter', 'grunt', 'spewer', 'hazmat', 'grenadier', 'riot', 'k9'],
      ['grunt', 'hazmat', 'gunner', 'riot', 'grenadier', 'sniper', 'spewer'],
      ['gunner', 'sniper', 'riot', 'grenadier', 'hazmat', 'grunt', 'sprinter'],
      ['gunner', 'sniper', 'riot', 'hazmat', 'grenadier', 'grunt', 'k9'],
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

  // Bosses are addressed 1-based within their map's table.
  boss(mapNumber, bossNumber = Seq.FIRST) {
    const m = this.byNumber(mapNumber);
    return m.bosses ? Seq.get(m.bosses, Seq.clampTo(m.bosses, bossNumber)) : null;
  },
  bossCount(mapNumber) {
    const m = this.byNumber(mapNumber);
    return m.bosses ? m.bosses.length : 0;
  },
};

