/* Update 4.0 — the Day-ZEE bestiary, the minibosses, and the boss kits.

   Everything here is data the Enemy class in entities.js already knows how
   to run. Attacks are the same wind-up / active / recover objects every
   enemy uses, so they get the same rings, poses and parry rules; a few new
   shapes were added for the bigger set pieces:

     spray     a stream of shots across the active window (machine guns)
     barrage   several ground impacts at once — laser pillars, vine
               eruptions, artillery, falling hammers
     beams     straight lines of light that sweep or cross (Prejudice)
     summon    calls help (Sun Minions, reinforcements, spiderlings)

   Bosses no longer share one brain. Each named boss carries a KIT: its own
   moves, the combos it strings them into, and the specials it reaches for
   once it is hurt. Minibosses use the same machinery. */
'use strict';

/* ================================================================= */
/* DAY-ZEE — ten new enemies, zombie and military                     */
/* ================================================================= */

Object.assign(ENEMY_TYPES, {
  shambler: {
    name: 'Shambler', hp: 78, speed: 50, radius: 13, xp: 18, gold: 9,
    ai: 'chase', color: '#7f9a6a', dark: '#2f3a26', zombie: true,
    attacks: [
      { id: 'bite', kind: 'blue', shape: 'melee', range: 72, reach: 50, arc: 1.7,
        wind: 0.5, active: 0.14, recover: 0.5, damage: 16, cd: 1.4, lunge: 220 },
      { id: 'grab', kind: 'red', shape: 'melee', range: 78, reach: 54, arc: 1.4,
        wind: 0.75, active: 0.2, recover: 0.8, damage: 26, cd: 5, lunge: 170 },
    ],
  },
  sprinter: {
    name: 'Sprinter', hp: 50, speed: 176, radius: 11, xp: 16, gold: 8,
    ai: 'chase', color: '#a8b86a', dark: '#44502a', zombie: true,
    attacks: [
      { id: 'claw', kind: 'blue', shape: 'melee', range: 70, reach: 46, arc: 1.6,
        wind: 0.3, active: 0.1, recover: 0.3, damage: 11, cd: 0.9, lunge: 380 },
      { id: 'leap', kind: 'blue', shape: 'melee', range: 170, minRange: 80, reach: 48, arc: 1.3,
        wind: 0.45, active: 0.24, recover: 0.5, damage: 15, cd: 3.2, lunge: 620 },
    ],
  },
  spewer: {
    name: 'Spewer', hp: 70, speed: 58, radius: 13, xp: 18, gold: 9,
    ai: 'ranged', color: '#9cae4a', dark: '#3c4a18', zombie: true,
    attacks: [
      // Three gouts of bile, each leaving a burning puddle.
      { id: 'vomit', kind: 'blue', shape: 'shot', range: 420,
        wind: 0.55, active: 0.06, recover: 0.5, damage: 11, cd: 2.4, count: 3, spread: 0.22,
        shot: { speed: 290, radius: 7, color: '#c4e86b', leaves: 'bile' } },
    ],
  },
  hazmat: {
    name: 'Hazmat Husk', hp: 120, speed: 52, radius: 15, xp: 26, gold: 14,
    ai: 'chase', color: '#e0c84a', dark: '#5a4a10', zombie: true,
    attacks: [
      { id: 'slam', kind: 'blue', shape: 'melee', range: 78, reach: 58, arc: 1.8,
        wind: 0.5, active: 0.15, recover: 0.5, damage: 18, cd: 1.8, lunge: 160 },
      // The suit ruptures: a ring of gas, and the ground stays poisoned.
      { id: 'rupture', kind: 'red', shape: 'nova', range: 120, reach: 112, arc: Math.PI * 2,
        wind: 0.9, active: 0.1, recover: 0.8, damage: 20, cd: 4.6, leaves: 'spores' },
    ],
  },
  grunt: {
    name: 'Infected Grunt', hp: 96, speed: 72, radius: 13, xp: 22, gold: 12,
    ai: 'ranged', color: '#6b7a4a', dark: '#2a3018', zombie: true, military: true,
    attacks: [
      // Three-round burst: parry the middle bullet and send it home.
      { id: 'burst', kind: 'blue', shape: 'shot', range: 500,
        wind: 0.5, active: 0.06, recover: 0.5, damage: 10, cd: 2.0, count: 3, spread: 0.07,
        shot: { speed: 560, radius: 4, color: '#ffe08a' }, sfx: 'gunshot' },
      { id: 'bayonet', kind: 'blue', shape: 'melee', range: 82, reach: 62, arc: 1.0,
        wind: 0.4, active: 0.12, recover: 0.4, damage: 16, cd: 2.2, lunge: 380 },
    ],
  },
  gunner: {
    name: 'Machine Gunner', hp: 170, speed: 40, radius: 16, xp: 34, gold: 20,
    ai: 'ranged', color: '#5a6640', dark: '#22281a', zombie: true, military: true, keepAt: 320,
    attacks: [
      // A long, steady stream that tracks you. Break line of sight.
      { id: 'spray', kind: 'blue', shape: 'spray', range: 540,
        wind: 0.85, active: 1.7, recover: 0.9, damage: 7, cd: 4.6,
        spray: { every: 0.085, jitter: 0.09, track: 1.1 },
        shot: { speed: 580, radius: 4, color: '#ffd27a' }, sfx: 'gunshot' },
    ],
  },
  grenadier: {
    name: 'Grenadier', hp: 104, speed: 52, radius: 14, xp: 26, gold: 15,
    ai: 'ranged', color: '#7a6a4a', dark: '#30281a', zombie: true, military: true,
    attacks: [
      { id: 'nade', kind: 'red', shape: 'impact', range: 560, minRange: 140,
        wind: 0.7, active: 0.1, recover: 0.8, damage: 28, cd: 3.8,
        impactRadius: 96, impactDelay: 1.2, impactColor: '#ffb347', impactStyle: 'shell' },
    ],
  },
  riot: {
    name: 'Riot Zombie', hp: 220, speed: 54, radius: 18, xp: 36, gold: 20,
    ai: 'charger', color: '#4a5566', dark: '#1c222c', shielded: true, zombie: true,
    attacks: [
      { id: 'bash', kind: 'blue', shape: 'melee', range: 80, reach: 58, arc: 1.6,
        wind: 0.5, active: 0.15, recover: 0.5, damage: 20, cd: 1.9, lunge: 160 },
      { id: 'shove', kind: 'red', shape: 'charge', range: 340, minRange: 110,
        wind: 0.8, active: 0.45, recover: 0.8, damage: 30, cd: 5.5, chargeSpeed: 600 },
    ],
  },
  k9: {
    name: 'Zombie K9', hp: 46, speed: 190, radius: 11, xp: 12, gold: 6,
    ai: 'chase', color: '#6a5a4a', dark: '#2a221a', zombie: true,
    attacks: [
      { id: 'bite', kind: 'blue', shape: 'melee', range: 70, reach: 44, arc: 1.6,
        wind: 0.28, active: 0.1, recover: 0.3, damage: 10, cd: 0.9, lunge: 400 },
      { id: 'maul', kind: 'blue', shape: 'melee', range: 160, minRange: 70, reach: 46, arc: 1.4,
        wind: 0.45, active: 0.22, recover: 0.5, damage: 14, cd: 3, lunge: 620 },
    ],
  },
  sniper: {
    name: 'Sniper', hp: 74, speed: 46, radius: 12, xp: 26, gold: 16,
    ai: 'ranged', color: '#5e6b52', dark: '#20261a', zombie: true, military: true, keepAt: 460,
    attacks: [
      // The red laser is the whole tell: get off the line before it fires.
      { id: 'snipe', kind: 'red', shape: 'shot', range: 780, minRange: 200,
        wind: 1.35, active: 0.06, recover: 1.0, damage: 44, cd: 5, laser: true,
        shot: { speed: 1350, radius: 5, color: '#ff3b1f', pierce: true, style: 'beam' }, sfx: 'rifle' },
    ],
  },

  /* The Sun God's helpers. 10,000 HP each, and never more than two. */
  sunminion: {
    name: 'Sun Minion', hp: 10000, speed: 74, radius: 17, xp: 220, gold: 140,
    ai: 'ranged', keepAt: 260, color: '#ffd27a', dark: '#8a4a08', flying: true,
    noScale: true, noExecute: true,
    attacks: [
      { id: 'sunbolt', kind: 'blue', shape: 'shot', range: 560,
        wind: 0.5, active: 0.06, recover: 0.5, damage: 16, cd: 1.6, count: 2, spread: 0.2,
        shot: { speed: 520, radius: 5, color: '#ffe08a', style: 'beam' }, sfx: 'laser' },
      { id: 'flare', kind: 'red', shape: 'impact', range: 560, minRange: 100,
        wind: 0.7, active: 0.1, recover: 0.7, damage: 26, cd: 5,
        impactRadius: 70, impactDelay: 1.0, impactColor: '#ffb347', impactStyle: 'pillar' },
    ],
  },
});

/* ================================================================= */
/* MINIBOSSES — 50,000 HP, hard hitters                               */
/* ================================================================= */

/* A miniboss is `big`: too heavy to knock back, root, fling, freeze or
   execute, and — like a boss — only its gold HEAVY attacks can be parried,
   which opens the rhythm break. The war machines of Day-ZEE each drop a
   unique accessory that no peddler sells. The other four answer corrupted
   shrines. */

const MB = { big: true, miniboss: true, noScale: true, ai: 'miniboss', hp: 50000, xp: 1400, gold: 1200 };

Object.assign(ENEMY_TYPES, {
  tank: {
    ...MB, name: 'Battle Tank', title: 'Iron Siege', speed: 44, radius: 40,
    color: '#5d6b3a', dark: '#262c16', vehicle: true, moveStyle: 'slow', art: 'tank',
    drops: 'tank-treads', gap: [1.9, 1.5, 1.1],
    moves: {
      mg: { id: 'tk_mg', kind: 'blue', shape: 'spray', range: 560, wind: 0.6, active: 1.4, recover: 0.5,
        damage: 14, cd: 0, spray: { every: 0.08, jitter: 0.12, track: 1.6 },
        shot: { speed: 600, radius: 4, color: '#ffd27a' }, sfx: 'gunshot' },
      cannon: { id: 'tk_cannon', kind: 'red', shape: 'impact', range: 720, wind: 0.9, active: 0.1, recover: 0.6,
        damage: 70, cd: 0, impactRadius: 118, impactDelay: 0.8, impactColor: '#ff8a3c', impactStyle: 'shell', sfx: 'cannon' },
      barrage: { id: 'tk_barrage', kind: 'red', shape: 'barrage', range: 800, wind: 1.0, active: 0.1, recover: 0.8,
        damage: 50, cd: 0, barrage: { pattern: 'scatter', count: 6, spread: 210, radius: 82, delay: [1.0, 0.14], style: 'shell', color: '#ffb347' },
        sfx: 'cannon' },
      crush: { id: 'tk_crush', kind: 'heavy', shape: 'charge', range: 560, reach: 170, wind: 1.05, active: 0.75, recover: 0.9,
        damage: 80, cd: 0, chargeSpeed: 520 },
    },
    combos: [['mg', 'cannon', 'crush'], ['barrage', 'mg', 'crush'], ['cannon', 'cannon', 'mg', 'crush']],
  },

  battleship: {
    ...MB, name: 'Battleship', title: 'Dreadnought of the Dry Dock', speed: 0, radius: 58,
    color: '#6a7480', dark: '#262b31', moveStyle: 'anchored', art: 'battleship',
    drops: 'broadside-gauntlets', gap: [1.8, 1.4, 1.0], aggroRange: 640,
    moves: {
      flak: { id: 'bs_flak', kind: 'blue', shape: 'shot', range: 700, wind: 0.55, active: 0.06, recover: 0.4,
        damage: 16, cd: 0, count: 9, spread: 0.16, shot: { speed: 430, radius: 6, color: '#ffd27a' }, sfx: 'gunshot' },
      broadside: { id: 'bs_broadside', kind: 'red', shape: 'barrage', range: 900, wind: 1.0, active: 0.1, recover: 0.7,
        damage: 55, cd: 0, barrage: { pattern: 'scatter', count: 8, spread: 260, radius: 90, delay: [0.95, 0.12], style: 'shell', color: '#ff8a3c' },
        sfx: 'cannon' },
      missiles: { id: 'bs_missiles', kind: 'blue', shape: 'shot', range: 900, wind: 0.6, active: 0.06, recover: 0.5,
        damage: 22, cd: 0, count: 4, spread: 0.7, shot: { speed: 260, radius: 7, color: '#ff6b52', homing: 2.0, style: 'missile' },
        sfx: 'missile' },
      mainGun: { id: 'bs_main', kind: 'heavy', shape: 'shot', range: 900, wind: 1.1, active: 0.06, recover: 0.8,
        damage: 90, cd: 0, shot: { speed: 520, radius: 15, color: '#ffd479', style: 'shell' }, sfx: 'cannon' },
      depthCharge: { id: 'bs_depth', kind: 'red', shape: 'nova', range: 190, reach: 175, arc: Math.PI * 2,
        wind: 0.85, active: 0.1, recover: 0.6, damage: 60, cd: 0, color: '#8fd4ff' },
    },
    combos: [['flak', 'missiles', 'mainGun'], ['broadside', 'flak', 'mainGun'], ['missiles', 'broadside', 'flak', 'mainGun']],
    closeMove: 'depthCharge',
  },

  colossus: {
    ...MB, name: 'Corrupted Colossus', title: 'Stone That Remembers', speed: 50, radius: 34,
    color: '#8a7a9c', dark: '#2e2638', moveStyle: 'slow', art: 'colossus',
    moves: {
      pound: { id: 'co_pound', kind: 'blue', shape: 'melee', range: 120, reach: 95, arc: 2.0, wind: 0.5, active: 0.15, recover: 0.4,
        damage: 30, cd: 0, lunge: 200 },
      boulder: { id: 'co_boulder', kind: 'red', shape: 'impact', range: 650, wind: 0.8, active: 0.1, recover: 0.5,
        damage: 45, cd: 0, impactRadius: 100, impactDelay: 1.0, impactColor: '#b9a8cc', impactStyle: 'shell' },
      quake: { id: 'co_quake', kind: 'red', shape: 'nova', range: 180, reach: 165, arc: Math.PI * 2, wind: 0.9, active: 0.1,
        recover: 0.6, damage: 40, cd: 0, color: '#b9a8cc' },
      crush: { id: 'co_crush', kind: 'heavy', shape: 'melee', range: 140, reach: 125, arc: Math.PI * 2, wind: 1.0, active: 0.18,
        recover: 0.8, damage: 60, cd: 0, lunge: 0 },
    },
    combos: [['pound', 'pound', 'crush'], ['boulder', 'quake', 'crush'], ['pound', 'boulder', 'pound', 'crush']],
  },

  broodmother: {
    ...MB, name: 'The Brood Mother', title: 'Many-Legged Corruption', speed: 96, radius: 30,
    color: '#6a4a7a', dark: '#24182c', moveStyle: 'chase', art: 'broodmother',
    moves: {
      bite: { id: 'br_bite', kind: 'blue', shape: 'melee', range: 100, reach: 78, arc: 1.6, wind: 0.4, active: 0.12, recover: 0.35,
        damage: 26, cd: 0, lunge: 420 },
      venom: { id: 'br_venom', kind: 'blue', shape: 'shot', range: 520, wind: 0.5, active: 0.06, recover: 0.4,
        damage: 18, cd: 0, count: 5, spread: 0.2, shot: { speed: 340, radius: 7, color: '#c4e86b', leaves: 'bile' } },
      brood: { id: 'br_brood', kind: 'blue', shape: 'summon', range: 900, wind: 0.8, active: 0.1, recover: 0.5,
        damage: 0, cd: 0, summon: { types: ['hound', 'bat'], count: 3, max: 6 } },
      pounce: { id: 'br_pounce', kind: 'heavy', shape: 'charge', range: 520, reach: 150, wind: 0.95, active: 0.5, recover: 0.8,
        damage: 55, cd: 0, chargeSpeed: 760 },
    },
    combos: [['bite', 'venom', 'pounce'], ['brood', 'bite', 'pounce'], ['venom', 'bite', 'bite', 'pounce']],
  },

  hexknight: {
    ...MB, name: 'Hex Knight', title: 'Oathbroken', speed: 112, radius: 22,
    color: '#c06aff', dark: '#2c1840', moveStyle: 'blink', art: 'hexknight',
    moves: {
      slash: { id: 'hk_slash', kind: 'blue', shape: 'melee', range: 100, reach: 80, arc: 1.8, wind: 0.32, active: 0.12, recover: 0.25,
        damage: 24, cd: 0, lunge: 380 },
      orbs: { id: 'hk_orbs', kind: 'blue', shape: 'shot', range: 600, wind: 0.5, active: 0.06, recover: 0.4,
        damage: 18, cd: 0, count: 5, spread: 0.32, shot: { speed: 260, radius: 7, color: '#d9a6ff', homing: 1.1 } },
      hexBeam: { id: 'hk_beam', kind: 'red', shape: 'beams', range: 700, wind: 0.1, active: 0.1, recover: 0.6,
        damage: 40, cd: 0, beams: { pattern: 'fan', count: 3, gap: 0.45, len: 620, width: 22, wind: 0.85, active: 0.3, color: '#c06aff' } },
      cleave: { id: 'hk_cleave', kind: 'heavy', shape: 'melee', range: 120, reach: 104, arc: 2.6, wind: 0.95, active: 0.16,
        recover: 0.7, damage: 55, cd: 0, lunge: 300 },
    },
    combos: [['slash', 'slash', 'cleave'], ['orbs', 'hexBeam', 'cleave'], ['slash', 'orbs', 'slash', 'cleave']],
  },

  abomination: {
    ...MB, name: 'The Abomination', title: 'Patient Zero', speed: 72, radius: 34,
    color: '#8fa05a', dark: '#2e3818', moveStyle: 'chase', art: 'abomination', zombie: true,
    moves: {
      swipe: { id: 'ab_swipe', kind: 'blue', shape: 'melee', range: 120, reach: 98, arc: 2.2, wind: 0.45, active: 0.15, recover: 0.4,
        damage: 30, cd: 0, lunge: 260 },
      bile: { id: 'ab_bile', kind: 'blue', shape: 'shot', range: 520, wind: 0.55, active: 0.06, recover: 0.4,
        damage: 18, cd: 0, count: 6, spread: 0.24, shot: { speed: 300, radius: 8, color: '#c4e86b', leaves: 'bile' } },
      gas: { id: 'ab_gas', kind: 'red', shape: 'nova', range: 190, reach: 170, arc: Math.PI * 2, wind: 0.9, active: 0.1,
        recover: 0.6, damage: 36, cd: 0, leaves: 'spores', color: '#c4e86b' },
      slam: { id: 'ab_slam', kind: 'heavy', shape: 'melee', range: 140, reach: 125, arc: Math.PI * 2, wind: 1.0, active: 0.18,
        recover: 0.8, damage: 60, cd: 0, lunge: 0 },
    },
    combos: [['swipe', 'bile', 'slam'], ['gas', 'swipe', 'slam'], ['bile', 'swipe', 'swipe', 'slam']],
  },

  /* ---------------- Day-ZEE bosses ---------------- */
  colonel: {
    name: 'Colonel Zee', hp: 500000, speed: 70, radius: 30, xp: 900, gold: 800,
    ai: 'boss', color: '#8a9a5a', dark: '#2a3218', boss: true,
    bossDmgMul: 1.5, palette: 'colonel', title: 'Commander of the Dead',
  },
  judgement2: {
    name: 'Judgement 2.0', hp: 500000, speed: 84, radius: 36, xp: 1200, gold: 1000,
    ai: 'boss', color: '#ffe6a8', dark: '#3a3020', boss: true,
    bossDmgMul: 1.8, palette: 'verdict', title: 'The Final Verdict',
  },
});

/* ================================================================= */
/* BOSS KITS                                                          */
/* ================================================================= */

const SLAM = (id, damage, extra = {}) => ({
  id, kind: 'heavy', shape: 'melee', range: 150, reach: 138, arc: Math.PI * 2,
  wind: 1.0, active: 0.18, recover: 0.75, damage, cd: 0, lunge: 0, slam: true, ...extra,
});
const RUSH = (id, damage, extra = {}) => ({
  id, kind: 'heavy', shape: 'charge', range: 650, reach: 150,
  wind: 0.95, active: 0.5, recover: 0.8, damage, cd: 0, chargeSpeed: 700, ...extra,
});

const JUDGEMENT_MOVES = {
  // Hammers.
  hammerSwing: { id: 'ju_hammer', kind: 'blue', shape: 'melee', range: 135, reach: 112, arc: 2.2,
    wind: 0.42, active: 0.14, recover: 0.26, damage: 12, cd: 0, lunge: 280, sfx: 'gavel' },
  hammerThrow: { id: 'ju_throw', kind: 'blue', shape: 'shot', range: 650, wind: 0.5, active: 0.06, recover: 0.32,
    damage: 12, cd: 0, count: 3, spread: 0.32, shot: { speed: 400, radius: 10, color: '#e8e2d4', style: 'hammer' } },
  // Prejudice: the verdict is decided before you move. Crossing beams of
  // judgement land where you stand — and if they catch you, you are marked
  // and take 30% more damage for five seconds.
  prejudice: { id: 'ju_prejudice', kind: 'red', shape: 'beams', range: 900, wind: 0.1, active: 0.1, recover: 0.5,
    damage: 16, cd: 0, beams: { pattern: 'cross', len: 760, width: 26, wind: 0.9, active: 0.25, color: '#c8452f', effect: 'prejudice' } },
  prejudiceX: { id: 'ju_prejudiceX', kind: 'red', shape: 'beams', range: 900, wind: 0.1, active: 0.1, recover: 0.5,
    damage: 16, cd: 0, beams: { pattern: 'x', len: 760, width: 26, wind: 0.85, active: 0.25, color: '#c8452f', effect: 'prejudice' } },
  // The slams — every one a gold HEAVY, every one parryable.
  judgementSlam: SLAM('ju_slam', 26, { sfx: 'gavel' }),
  gavelDrop: { id: 'ju_gavel', kind: 'heavy', shape: 'melee', range: 130, reach: 120, arc: 1.3,
    wind: 0.9, active: 0.16, recover: 0.7, damage: 28, cd: 0, lunge: 260, sfx: 'gavel' },
  verdictRush: RUSH('ju_rush', 24),
};

const BOSS_KITS = {
  /* Flowery — vines, flowers, and the slam. */
  flora: {
    gap: [2.0, 1.6, 1.25],
    moves: {
      vineLash: { id: 'fl_lash', kind: 'blue', shape: 'melee', range: 190, reach: 168, arc: 0.8,
        wind: 0.5, active: 0.14, recover: 0.3, damage: 12, cd: 0, lunge: 120, sfx: 'vine' },
      // Vines burst up out of the floor in a line toward you, and root you.
      vineSnare: { id: 'fl_snare', kind: 'red', shape: 'barrage', range: 640, wind: 0.6, active: 0.1, recover: 0.4,
        damage: 14, cd: 0, barrage: { pattern: 'line', count: 8, step: 62, start: 60, radius: 44, delay: [0.3, 0.08], style: 'vine', color: '#5fbf3a', effect: 'root' },
        sfx: 'vine' },
      // A ring of vines around you: stand still in the middle, or dash out.
      vineCage: { id: 'fl_cage', kind: 'red', shape: 'barrage', range: 640, wind: 0.7, active: 0.1, recover: 0.4,
        damage: 16, cd: 0, barrage: { pattern: 'circle', count: 9, spread: 115, radius: 46, delay: [0.95, 0], style: 'vine', color: '#5fbf3a', effect: 'root' },
        sfx: 'vine' },
      // Floral: petals in every direction, or a tight fan at you.
      petalBurst: { id: 'fl_petals', kind: 'blue', shape: 'shot', range: 700, wind: 0.5, active: 0.06, recover: 0.3,
        damage: 9, cd: 0, count: 14, spread: Math.PI * 2 / 14, shot: { speed: 260, radius: 7, color: '#ff9ad6', style: 'petal' } },
      petalFan: { id: 'fl_fan', kind: 'blue', shape: 'shot', range: 650, wind: 0.45, active: 0.06, recover: 0.28,
        damage: 10, cd: 0, count: 7, spread: 0.16, shot: { speed: 380, radius: 6, color: '#ffc4e6', style: 'petal' } },
      pollen: { id: 'fl_pollen', kind: 'red', shape: 'nova', range: 200, reach: 155, arc: Math.PI * 2,
        wind: 0.8, active: 0.1, recover: 0.6, damage: 14, cd: 0, leaves: 'spores', color: '#ff9ad6' },
      bloomSlam: SLAM('fl_slam', 26),
      thornCrash: RUSH('fl_crash', 24, { chargeSpeed: 600 }),
    },
    combos: [
      ['vineLash', 'vineSnare', 'bloomSlam'],
      ['petalBurst', 'vineLash', 'bloomSlam'],
      ['vineSnare', 'petalFan', 'petalFan', 'bloomSlam'],
      ['petalBurst', 'vineSnare', 'thornCrash'],
    ],
    phase2: [['vineCage', 'petalFan', 'bloomSlam']],
    phase3: [['vineCage', 'petalBurst', 'pollen', 'bloomSlam'], ['vineSnare', 'vineSnare', 'petalBurst', 'thornCrash']],
    opener: ['vineLash', 'petalFan'],
  },

  /* The Sun God — lasers, pillars of light, and his minions. */
  sun: {
    gap: [2.0, 1.6, 1.2],
    moves: {
      laserVolley: { id: 'su_volley', kind: 'blue', shape: 'shot', range: 700, wind: 0.5, active: 0.06, recover: 0.32,
        damage: 10, cd: 0, count: 5, spread: 0.28, shot: { speed: 640, radius: 5, color: '#fff1a8', style: 'beam' }, sfx: 'laser' },
      laserLance: { id: 'su_lance', kind: 'blue', shape: 'shot', range: 800, wind: 0.42, active: 0.06, recover: 0.3,
        damage: 16, cd: 0, count: 3, spread: 0.05, shot: { speed: 920, radius: 7, color: '#ffffff', style: 'beam' }, sfx: 'laser' },
      laserSweep: { id: 'su_sweep', kind: 'red', shape: 'beams', range: 700, wind: 0.1, active: 0.1, recover: 0.6,
        damage: 18, cd: 0, beams: { pattern: 'sweep', len: 640, width: 20, wind: 0.8, active: 1.4, arc: 2.2, color: '#ffb347' } },
      // Columns of light come down where you are standing. Keep moving.
      laserPillars: { id: 'su_pillars', kind: 'red', shape: 'barrage', range: 900, wind: 0.6, active: 0.1, recover: 0.4,
        damage: 16, cd: 0, barrage: { pattern: 'scatter', count: 6, spread: 170, radius: 58, delay: [1.0, 0.12], style: 'pillar', color: '#ffd27a' },
        sfx: 'laserCharge' },
      pillarRing: { id: 'su_ring', kind: 'red', shape: 'barrage', range: 900, wind: 0.7, active: 0.1, recover: 0.4,
        damage: 18, cd: 0, barrage: { pattern: 'ringSelf', count: 10, spread: 190, radius: 52, delay: [1.1, 0], style: 'pillar', color: '#ffd27a' },
        sfx: 'laserCharge' },
      solarFlare: SLAM('su_flare', 26),
      sunRush: RUSH('su_rush', 24),
    },
    combos: [
      ['laserVolley', 'laserVolley', 'solarFlare'],
      ['laserPillars', 'laserLance', 'sunRush'],
      ['laserLance', 'laserPillars', 'laserVolley', 'solarFlare'],
    ],
    phase2: [['laserSweep', 'laserVolley', 'solarFlare'], ['laserPillars', 'laserSweep', 'sunRush']],
    phase3: [['pillarRing', 'laserSweep', 'solarFlare'], ['laserPillars', 'pillarRing', 'laserLance', 'sunRush']],
    opener: ['laserVolley', 'laserLance'],
    // Sun Minions: 10,000 HP each, only in phases 2 and 3, never more than two.
    specials: [{ id: 'sunMinions', minPhase: 2, chance: 0.4 }],
  },

  /* Judgement — hammers, prejudice, and slams you can parry. */
  fist: {
    gap: [2.0, 1.6, 1.2],
    moves: JUDGEMENT_MOVES,
    combos: [
      ['hammerSwing', 'hammerSwing', 'judgementSlam'],
      ['hammerThrow', 'prejudice', 'gavelDrop'],
      ['prejudice', 'hammerSwing', 'hammerThrow', 'judgementSlam'],
      ['hammerSwing', 'verdictRush'],
    ],
    phase3: [['prejudiceX', 'prejudice', 'judgementSlam'], ['hammerThrow', 'prejudiceX', 'gavelDrop']],
    opener: ['hammerSwing', 'hammerThrow'],
  },

  /* Judgement 2.0 — everything above, faster, plus a storm of gavels, a
     sweeping verdict, and a fan of prejudice. */
  verdict: {
    gap: [1.7, 1.35, 1.0],
    tempo: 1.15,
    moves: {
      ...JUDGEMENT_MOVES,
      gavelStorm: { id: 'j2_storm', kind: 'red', shape: 'barrage', range: 900, wind: 0.6, active: 0.1, recover: 0.4,
        damage: 18, cd: 0, barrage: { pattern: 'scatter', count: 9, spread: 220, radius: 56, delay: [0.9, 0.08], style: 'hammer', color: '#ffe6a8' },
        sfx: 'gavel' },
      verdictSweep: { id: 'j2_sweep', kind: 'red', shape: 'beams', range: 760, wind: 0.1, active: 0.1, recover: 0.6,
        damage: 20, cd: 0, beams: { pattern: 'sweep', len: 720, width: 24, wind: 0.75, active: 1.3, arc: 2.6, color: '#ffd479' } },
      prejudiceFan: { id: 'j2_fan', kind: 'red', shape: 'beams', range: 900, wind: 0.1, active: 0.1, recover: 0.5,
        damage: 18, cd: 0, beams: { pattern: 'fan', count: 5, gap: 0.32, len: 760, width: 22, wind: 0.8, active: 0.25, color: '#c8452f', effect: 'prejudice' } },
    },
    combos: [
      ['hammerSwing', 'hammerSwing', 'judgementSlam'],
      ['gavelStorm', 'hammerThrow', 'judgementSlam'],
      ['prejudiceFan', 'verdictSweep', 'gavelDrop'],
      ['prejudiceX', 'gavelStorm', 'hammerSwing', 'judgementSlam'],
      ['hammerThrow', 'prejudice', 'verdictRush'],
    ],
    phase3: [['gavelStorm', 'prejudiceX', 'verdictSweep', 'judgementSlam'], ['prejudiceFan', 'gavelStorm', 'verdictRush']],
    opener: ['hammerSwing', 'hammerThrow', 'prejudice'],
  },

  /* Colonel Zee — a rifle, a bayonet, artillery on call, and the dead
     answering when he shouts. */
  colonel: {
    gap: [1.9, 1.5, 1.15],
    moves: {
      rifleBurst: { id: 'cz_rifle', kind: 'blue', shape: 'spray', range: 620, wind: 0.6, active: 1.0, recover: 0.4,
        damage: 7, cd: 0, spray: { every: 0.09, jitter: 0.08, track: 1.4 }, shot: { speed: 620, radius: 4, color: '#ffd27a' }, sfx: 'gunshot' },
      bayonet: { id: 'cz_bayonet', kind: 'blue', shape: 'melee', range: 115, reach: 92, arc: 1.0,
        wind: 0.4, active: 0.13, recover: 0.3, damage: 13, cd: 0, lunge: 420 },
      airstrike: { id: 'cz_air', kind: 'red', shape: 'barrage', range: 900, wind: 0.7, active: 0.1, recover: 0.5,
        damage: 18, cd: 0, barrage: { pattern: 'carpet', count: 8, step: 72, radius: 70, delay: [1.2, 0.1], style: 'shell', color: '#ffb347' },
        sfx: 'missile' },
      gasGrenade: { id: 'cz_gas', kind: 'red', shape: 'impact', range: 650, wind: 0.6, active: 0.1, recover: 0.4,
        damage: 12, cd: 0, impactRadius: 110, impactDelay: 1.0, impactColor: '#c4e86b', impactStyle: 'gas', leaves: 'spores' },
      bayonetCharge: RUSH('cz_charge', 26, { chargeSpeed: 740 }),
      stomp: SLAM('cz_stomp', 26),
    },
    combos: [
      ['rifleBurst', 'bayonet', 'bayonetCharge'],
      ['airstrike', 'rifleBurst', 'stomp'],
      ['gasGrenade', 'bayonet', 'rifleBurst', 'bayonetCharge'],
    ],
    phase3: [['airstrike', 'gasGrenade', 'rifleBurst', 'stomp']],
    opener: ['bayonet', 'rifleBurst'],
    specials: [{ id: 'reinforce', minPhase: 1, chance: 0.3 }],
  },
};

/* What the new bosses say. */
Object.assign(BOSS_LINES, {
  colonel: {
    intro: [
      'Base is under quarantine, civilian. Nobody leaves.',
      'My men died at their posts. They are STILL at their posts.',
    ],
    phase2: ['Fall in! FALL IN!', 'Call it in. Danger close.'],
    phase3: ['I do not get to die. I have ORDERS.', 'All units, converge on my position!'],
    heavy: ['Fix bayonets!', 'At ease — permanently!', 'Dismissed!'],
    death: ['...mission... failed...', 'Tell them... I held the line.'],
  },
  judgement2: {
    intro: [
      'You appealed. The appeal is denied.',
      'Judgement was a sentence. I am the EXECUTION.',
    ],
    phase2: ['Retrial. Same verdict.', 'Objection overruled.'],
    phase3: ['FINAL. VERDICT.', 'The gavel falls on everything.'],
    heavy: ['GUILTY!', 'Sentence carried out!', 'Order in my court!'],
    death: ['...this court... is adjourned... forever.'],
  },
});

/* ================================================================= */
/* BEAMS — straight lines of light                                    */
/* ================================================================= */

/* A thin dashed line while it winds up, then a blazing bar for its active
   window. Always unblockable (red): the line is the whole warning, and the
   answer is to not be on it. Sweeping beams rotate while they are live. */
class Beam {
  constructor(o) {
    Object.assign(this, {
      t: 0, wind: 0.8, active: 0.3, width: 22, len: 700, angVel: 0,
      color: '#ff5a3c', kind: 'red', damage: 10, effect: null,
      hit: false, dead: false, fired: false, follow: null, source: null,
    }, o);
  }

  update(dt, game) {
    this.t += dt;
    if (this.follow && !this.follow.dead) { this.x = this.follow.x; this.y = this.follow.y; }
    const live = this.t >= this.wind;
    if (live) this.angle += this.angVel * dt;
    if (this.t >= this.wind + this.active) { this.dead = true; return; }
    if (!live) return;
    if (!this.fired) { this.fired = true; game.audio.beam(); game.fx.addShake(4); }
    if (this.hit) return;
    const p = game.player;
    if (p.dead) return;
    const cx = Math.cos(this.angle), cy = Math.sin(this.angle);
    const dx = p.x - this.x, dy = p.y - this.y;
    const along = dx * cx + dy * cy;
    if (along < -p.radius || along > this.len + p.radius) return;
    if (Math.abs(dx * cy - dy * cx) > this.width / 2 + p.radius) return;
    this.hit = true;
    const res = p.takeHit(this.damage, game, { x: p.x - cx * 20, y: p.y - cy * 20, kind: this.kind, source: this.source });
    if (res === 'hit' && this.effect) game.hazardEffect(this.effect);
  }

  draw(ctx) {
    const w = this.width;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    if (this.t < this.wind) {
      const k = U.clamp(this.t / this.wind, 0, 1);
      ctx.globalAlpha = 0.07 + k * 0.16;
      ctx.fillStyle = this.color;
      ctx.fillRect(0, -w / 2, this.len, w);
      ctx.globalAlpha = 0.3 + k * 0.6;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 1 + k * 2;
      ctx.setLineDash([14, 10]);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(this.len, 0); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      const k = 1 - U.clamp((this.t - this.wind) / this.active, 0, 1) * 0.45;
      ctx.shadowBlur = 26; ctx.shadowColor = this.color;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = this.color;
      ctx.fillRect(0, -w / 2 * k, this.len, w * k);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.9;
      ctx.fillRect(0, -w / 6 * k, this.len, w / 3 * k);
    }
    ctx.restore();
  }
}
