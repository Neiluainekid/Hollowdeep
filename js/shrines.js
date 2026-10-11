/* Shrines — Update 2.0.

   Four families, all placed by the dungeon generator and all interacted with
   via `E`:

     red        the objective. Five per map bind the boss gate shut.
     class      eight of them, each keyed to a class. Touch one that matches
                your weapon for a strong boon; touch one that does not for a
                weaker, generic scrap.
     yellow     a coin flip. Half the time a blessing, half the time a curse,
                and you do not get to see which before you touch it.
     corrupted  wakes a miniboss. Kill it and the shrine pays out heavily.
                Update 4.0: a real one — 50,000 HP, not a swollen elite.

   Shrine ids are 1-based per the Update 2.0 convention: SHRINE_CATALOG is a
   dense array, but everything that refers to a shrine by number goes through
   `Shrines.byNumber()`. */
'use strict';

/* ---------------- class shrines (8) ---------------- */

const CLASS_SHRINES = [
  {
    number: 1, id: 'edge', classId: 'melee',
    name: 'Shrine of the Edge', icon: '⚔', color: '#e2b34a',
    boon: 'Your swings reach further and bite harder.',
    apply(p) { p.rangeMul += 0.2; p.dmgMul += 0.18; },
  },
  {
    number: 2, id: 'bulwark', classId: 'tanker',
    name: 'Shrine of the Bulwark', icon: '⛨', color: '#8fa8c8',
    boon: 'The shield holds longer and costs less to raise.',
    apply(p) { p.dr = 1 - (1 - p.dr) * 0.82; p.costMul *= 0.75; },
  },
  {
    number: 3, id: 'longsight', classId: 'ranger',
    name: 'Shrine of Long Sight', icon: '◎', color: '#7ea8ff',
    boon: 'Distance rewards you more, and shots come faster.',
    apply(p) { p.falloffMul += 0.8; p.cdMul *= 0.82; },
  },
  {
    number: 4, id: 'grave', classId: 'necromancer',
    name: 'Shrine of the Grave', icon: '☠', color: '#7fd6a6',
    boon: 'Your servants hit harder and rise sooner.',
    apply(p) { p.minionPower += 0.4; p.summonCdMul *= 0.7; },
  },
  {
    number: 5, id: 'ether', classId: 'mage',
    name: 'Shrine of Ether', icon: '✶', color: '#c07bff',
    boon: 'A deeper well, and spells that cost less to draw from it.',
    apply(p) { p.maxMana += 45; p.mana = p.maxMana; p.costMul *= 0.75; },
  },
  // Three shrines that any class can use, but which favour a playstyle.
  {
    number: 6, id: 'swiftfoot', classId: null,
    name: 'Shrine of Swift Feet', icon: '≫', color: '#9fe8d0',
    boon: 'Move faster and recover your footing sooner.',
    apply(p) { p.moveMul += 0.14; p.mobCdMul *= 0.7; p.mobCostMul *= 0.75; },
  },
  {
    number: 7, id: 'vigil', classId: null,
    name: 'Shrine of the Vigil', icon: '◈', color: '#4fd0a8',
    boon: 'Energy returns to you noticeably faster.',
    apply(p) { p.regenMul += 0.45; p.maxEnergy += 20; p.energy = p.maxEnergy; },
  },
  {
    number: 8, id: 'reckoning', classId: null,
    name: 'Shrine of Reckoning', icon: '✦', color: '#ffd479',
    boon: 'Heavy attacks land with considerably more force.',
    apply(p) { p.heavyMul += 0.35; p.knockMul += 0.5; },
  },
  // Update 4.0. `late` shrines are placed after everything older, so adding
  // them never moves a prop an existing save points at.
  {
    number: 9, id: 'shadows', classId: 'ninja', late: true,
    name: 'Shrine of Shadows', icon: '◐', color: '#9b8cff',
    boon: 'Your ambushes cut deeper and the smoke comes back sooner.',
    apply(p) { p.ambushMul += 0.35; p.smokeCdCut = (p.smokeCdCut || 0) + 2; p.rehideMul *= 0.8; },
  },
];

/* ---------------- yellow shrine outcomes ---------------- */

const BLESSINGS = [
  { id: 'b_vigour', name: 'Vigour', desc: '+30 maximum health, healed in full.',
    apply(p) { p.maxHp += 30; p.hp = p.maxHp; } },
  { id: 'b_fortune', name: 'Fortune', desc: '+60% gold from everything.',
    apply(p) { p.goldMul += 0.6; } },
  { id: 'b_edge', name: "Fortune's Edge", desc: '+20% damage.',
    apply(p) { p.dmgMul += 0.2; } },
  { id: 'b_ward', name: 'Ward', desc: 'Take 15% less damage.',
    apply(p) { p.dr = 1 - (1 - p.dr) * 0.85; } },
  { id: 'b_haste', name: 'Haste', desc: '+12% movement and 15% faster attacks.',
    apply(p) { p.moveMul += 0.12; p.cdMul *= 0.85; } },
  { id: 'b_rank', name: 'Temper', desc: 'Your weapon gains a rank.',
    apply(p) { p.weaponLevel += 1; } },
];

const CURSES = [
  { id: 'c_frailty', name: 'Frailty', desc: '-18 maximum health.',
    apply(p) { p.maxHp = Math.max(20, p.maxHp - 18); p.hp = Math.min(p.hp, p.maxHp); } },
  { id: 'c_dull', name: 'Dulled', desc: '-12% damage.',
    apply(p) { p.dmgMul = Math.max(0.35, p.dmgMul - 0.12); } },
  { id: 'c_leadfoot', name: 'Lead Feet', desc: '-10% movement speed.',
    apply(p) { p.moveMul = Math.max(0.5, p.moveMul - 0.10); } },
  { id: 'c_thirst', name: 'Thirst', desc: 'Energy returns 25% slower.',
    apply(p) { p.regenMul = Math.max(0.4, p.regenMul - 0.25); } },
  { id: 'c_costly', name: 'Costly', desc: 'Everything you spend costs 25% more.',
    apply(p) { p.costMul *= 1.25; } },
  { id: 'c_exposed', name: 'Exposed', desc: 'Take 12% more damage.',
    apply(p) { p.dr = Math.max(-0.5, 1 - (1 - p.dr) * 1.12); } },
];

/* ---------------- corrupted shrine minibosses ---------------- */

/* Update 4.0: corrupted shrines call genuine minibosses (js/bosses.js).
   The dungeons get stone, spider and knight; Day-ZEE gets its own horror. */
const MINIBOSSES = ['colossus', 'broodmother', 'hexknight'];
const MINIBOSSES_DAYZEE = ['abomination', 'abomination', 'colossus', 'hexknight'];

const Shrines = {
  CLASS_COUNT: CLASS_SHRINES.length,

  byNumber(n) { return Seq.get(CLASS_SHRINES, Seq.clampTo(CLASS_SHRINES, n)); },
  byId(id) { return CLASS_SHRINES.find(s => s.id === id) || null; },
  numbers() { return Seq.range(Seq.FIRST, CLASS_SHRINES.length); },
  // The original eight, placed where they always were.
  legacyNumbers() { return CLASS_SHRINES.filter(s => !s.late).map(s => s.number); },

  // A class shrine you match pays its listed boon; one you don't gives scraps.
  matches(shrine, player) {
    return shrine.classId === null || shrine.classId === player.classId;
  },

  rollYellow(rng) {
    const blessed = (rng ? rng() : Math.random()) < 0.5;
    const pool = blessed ? BLESSINGS : CURSES;
    const pick = pool[Math.floor((rng ? rng() : Math.random()) * pool.length)];
    return { blessed, effect: pick };
  },

  // One rng draw whatever the list, so the rest of generation is unchanged.
  rollMiniboss(rng, mapNumber = 1) {
    const list = mapNumber >= 3 ? MINIBOSSES_DAYZEE : MINIBOSSES;
    return list[Math.floor((rng ? rng() : Math.random()) * list.length)];
  },

  // Icon + colour for a prop type, shared by the world, HUD and both maps so
  // the legend can never drift out of sync with what is drawn.
  glyph(prop) {
    switch (prop.type) {
      case 'redshrine': return { icon: '▲', color: '#ff3b1f', label: 'red shrine', big: true };
      case 'classshrine': return { icon: prop.shrine.icon, color: prop.shrine.color, label: 'class shrine' };
      case 'yellowshrine': return { icon: '◆', color: '#ffd479', label: 'yellow shrine' };
      case 'corruptshrine': return { icon: '✖', color: '#b05cff', label: 'corrupted shrine' };
      case 'shrine': return { icon: '✧', color: '#7ea8ff', label: 'boon shrine' };
      case 'gate': return { icon: '★', color: '#ffffff', label: 'boss gate', big: true };
      case 'chest': return { icon: '▮', color: '#e2b34a', label: 'chest' };
      case 'fountain': return { icon: '≈', color: '#4fd0a8', label: 'fountain' };
      case 'cage': return { icon: '⌗', color: '#c8a86a', label: 'caged companion' };
      case 'merchant': return { icon: '$', color: '#ffd479', label: 'merchant' };
      default: return { icon: '•', color: '#9a9280', label: prop.type };
    }
  },
};
