/* The single starting choice. The weapon *is* the class — every stat,
   ability, visual and perk pool below hangs off it.

   Each class owns its own behaviour through `onPrimary` / `onHeavy` /
   `drawWeapon`. Nothing outside this file branches on which class you are;
   adding Mage and Necromancer means adding entries here, not editing the
   player, the HUD or the renderer. */
'use strict';

const CLASSES = {
  melee: {
    id: 'melee',
    className: 'Melee',
    icon: '⚔',
    color: '#e2b34a',
    torso: '#7a5f3a',
    dashColors: ['#e2b34a', '#fff1c9'],
    energyName: 'Stamina',
    energyBar: 'linear-gradient(180deg,#4fd0a8,#1e7a63)',

    // Index 0 is the starter; entering a new map promotes you up the list.
    tiers: [
      { weapon: 'Wooden Sword', dmgMul: 1, cdMul: 1, blade: '#c9a86e' },
      { weapon: 'Silver Sword', dmgMul: 1.55, cdMul: 0.92, blade: '#dfe6f0' },
    ],

    maxHp: 140,
    speed: 168,
    maxEnergy: 100,
    energyRegen: 24,
    damageReduction: 0.15,

    primary: {
      name: 'Swing', cd: 0.34, cost: 0, damage: 17,
      range: 64, arc: 1.55, knock: 190,
      wind: 0.07,      // telegraph before the hitbox opens
    },
    heavy: {
      name: 'Cleave', cd: 0.55, cost: 38, chargeTime: 0.5, damage: 46,
      range: 88, arc: 2.5, knock: 620, stun: 0.9, wind: 0.12,
    },
    mobility: { name: 'Dash', cost: 26, cd: 0.45, speed: 760, time: 0.17, iframes: 0.26 },

    lifeOnKill: 3,   // pressing forward is how a melee build stays alive
    blurb: 'Every kill returns a sliver of health. Close the distance.',

    onPrimary(p, game) {
      const a = this.primary;
      p.startSwing(game, {
        damage: a.damage * p.power,
        range: a.range * p.rangeMul,
        arc: a.arc * p.arcMul,
        knock: a.knock * p.knockMul,
        dur: 0.26, wind: a.wind, heavy: false, stun: 0,
      });
      game.audio.swordSwing(false);
    },

    onHeavy(p, game, power) {
      const h = this.heavy;
      p.startSwing(game, {
        damage: h.damage * power * p.power * p.heavyMul,
        range: h.range * p.rangeMul,
        arc: (p.whirlwind ? Math.PI * 2 : h.arc) * (p.whirlwind ? 1 : p.arcMul),
        knock: h.knock * p.knockMul * power,
        dur: 0.42, wind: h.wind, heavy: true, stun: h.stun * power,
      });
      game.fx.addShake(5 + 6 * power);
      game.audio.swordSwing(true);
    },

    drawWeapon(ctx, p) {
      let tilt = -0.5;
      if (p.swing) {
        const prog = U.clamp(p.swing.t / p.swing.dur, 0, 1);
        tilt = U.lerp(-1.3 * p.swing.side, 1.3 * p.swing.side, prog);
      }
      ctx.rotate(tilt);
      ctx.fillStyle = '#5c4326';
      ctx.fillRect(-3, -2.2, 9, 4.4);              // grip
      ctx.fillStyle = '#8f7245';
      ctx.fillRect(5, -4.5, 4, 9);                 // crossguard
      ctx.fillStyle = p.swing && p.swing.heavy ? '#ffe6b0' : p.tier.blade;
      ctx.fillRect(8, -2.6, 26 * p.rangeMul, 5.2); // blade
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.fillRect(8, -2.6, 26 * p.rangeMul, 1.6);
    },
  },

  ranger: {
    id: 'ranger',
    className: 'Ranger',
    icon: '◎',
    color: '#7ea8ff',
    torso: '#3f5a7a',
    dashColors: ['#7ea8ff', '#d6e4ff'],
    energyName: 'Ammo',
    energyBar: 'linear-gradient(180deg,#7ea8ff,#31518f)',

    tiers: [
      { weapon: 'Slingshot', dmgMul: 1, cdMul: 1, tint: '#cbd8f0' },
      { weapon: 'Assault Rifle', dmgMul: 1.35, cdMul: 0.45, tint: '#ffd479' },
    ],

    maxHp: 85,
    speed: 192,
    maxEnergy: 100,
    energyRegen: 31,
    damageReduction: 0,

    // Deliberately feeble per-shot: the starter slingshot is a training
    // weapon. Ranger power comes from rate of fire, perks, weapon rank and
    // the Assault Rifle on the second map.
    primary: {
      name: 'Pebble', cd: 0.14, cost: 5, damage: 5,
      projSpeed: 700, projLife: 1.15, knock: 60,
    },
    heavy: {
      name: 'Piercing Shot', cd: 0.3, cost: 14, chargeTime: 0.28, damage: 10,
      projSpeed: 980, projLife: 1.4, pierce: true, knock: 220,
    },
    mobility: { name: 'Roll', cost: 26, cd: 0.5, speed: 700, time: 0.21, iframes: 0.3 },

    // Rewarded for keeping the gap: scales to +45% at 500px and beyond.
    falloffBonus: 0.45,
    falloffRange: 500,
    lifeOnKill: 0,
    blurb: 'Distant targets take more. Never let them close.',

    onPrimary(p, game) {
      const a = this.primary;
      const shots = 1 + p.multishot;
      const spread = shots > 1 ? 0.13 : 0;
      for (let i = 0; i < shots; i++) {
        const off = shots > 1 ? (i - (shots - 1) / 2) * spread : 0;
        p.fireProjectile(game, p.aim + off + U.rand(-0.03, 0.03), {
          damage: a.damage * p.power,
          speed: a.projSpeed, life: a.projLife, radius: 5,
          knock: a.knock * p.knockMul, pierce: false, color: p.tier.tint,
        });
      }
      game.fx.spark(p.x + Math.cos(p.aim) * 16, p.y + Math.sin(p.aim) * 16, {
        count: 4, color: ['#d6e4ff', '#7ea8ff'], dir: p.aim, spread: 0.5,
        speedMax: 130, lifeMax: 0.25, glow: false,
      });
      game.audio.slingShot(p.weaponTier);
    },

    onHeavy(p, game, power) {
      const h = this.heavy;
      p.fireProjectile(game, p.aim, {
        damage: h.damage * power * p.power * p.heavyMul,
        speed: h.projSpeed, life: h.projLife,
        radius: 6 + 6 * power, knock: h.knock * p.knockMul * power,
        pierce: true, heavy: true, color: '#ffffff',
      });
      game.fx.addShake(3 + 4 * power);
      game.fx.spark(p.x + Math.cos(p.aim) * 18, p.y + Math.sin(p.aim) * 18, {
        count: 14, color: ['#ffffff', '#7ea8ff'], dir: p.aim, spread: 0.35, speedMax: 300,
      });
      p.vx -= Math.cos(p.aim) * 150 * power;
      p.vy -= Math.sin(p.aim) * 150 * power;
      game.audio.slingShot(p.weaponTier, true);
    },

    drawWeapon(ctx, p) {
      if (p.weaponTier > 0) {
        // Assault rifle: a blunt scavenged silhouette, not a forked branch.
        ctx.fillStyle = '#4a4a52';
        ctx.fillRect(-2, -2, 24, 4);
        ctx.fillStyle = '#33333a';
        ctx.fillRect(2, 1, 7, 6);
        ctx.fillStyle = '#6b6b74';
        ctx.fillRect(19, -1.4, 7, 2.8);
        return;
      }
      ctx.strokeStyle = '#6b5334';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(-2, 0); ctx.lineTo(6, 0);
      ctx.moveTo(6, 0); ctx.lineTo(14, -7);
      ctx.moveTo(6, 0); ctx.lineTo(14, 7);
      ctx.stroke();
      const pull = p.charging ? U.clamp(p.chargeT / p.cls.heavy.chargeTime, 0, 1) * 9 : 0;
      ctx.strokeStyle = 'rgba(230,220,200,.85)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(14, -7); ctx.lineTo(6 - pull, 0); ctx.lineTo(14, 7);
      ctx.stroke();
      if (p.charging) {
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 14; ctx.shadowColor = '#7ea8ff';
        ctx.beginPath(); ctx.arc(6 - pull, 0, 2.5 + pull * 0.35, 0, Math.PI * 2); ctx.fill();
      }
    },
  },
};

/* ------------------------------------------------------------------ */
/* Casters. Both carry a staff and a four-slot loadout cycled with R.
   Mage slots are elements; Necromancer slots are minions. One roulette
   serves both because both are exactly four choices deep.               */
/* ------------------------------------------------------------------ */

const ELEMENTS = [
  {
    id: 'fire', name: 'Fire', icon: '🜂', color: '#ff8a3c',
    primaryName: 'Fireball', heavyName: 'Meteor',
    desc: 'Fireball; charge for a meteor — 50 on the target, 30 around it.',
    cost: 8, heavyCostFrac: 0.5,

    primary(p, game) {
      p.castProjectile(game, p.aim, {
        damage: 14 * p.power, speed: 560, life: 1.3, radius: 7,
        color: '#ff9a4c', knock: 120, trailColor: '#ff5a1c',
      });
      game.audio.cast('fire', false);
    },
    heavy(p, game) {
      // Falls where you pointed, after a beat you can see coming.
      const tx = game.mouseWorld.x, ty = game.mouseWorld.y;
      game.impacts.push({
        x: tx, y: ty, t: 0, delay: 0.75, radius: 130, color: '#ff8a3c',
        directRadius: 70, directDamage: 50 * p.power, aoeDamage: 30 * p.power,
        hostile: false,
      });
      game.fx.ring(tx, ty, 46, '#ff8a3c', 22);
      game.audio.cast('fire', true);
    },
  },
  {
    id: 'earth', name: 'Earth', icon: '🜃', color: '#8fd14a',
    primaryName: 'Vine Trap', heavyName: 'Bloom',
    desc: 'Vines root ordinary foes and bleed them; charge to grow a turret.',
    cost: 12, heavyCostFrac: 0.32,

    primary(p, game) {
      const tx = game.mouseWorld.x, ty = game.mouseWorld.y;
      game.zones.push(new Zone('vine', tx, ty, {
        radius: 62, life: 5, tickEvery: 2, damage: 5, power: p.power,
      }));
      game.fx.ring(tx, ty, 40, '#8fd14a', 20);
      game.audio.cast('earth', false);
    },
    heavy(p, game) {
      const tx = game.mouseWorld.x, ty = game.mouseWorld.y;
      game.zones.push(new Zone('plant', tx, ty, { radius: 30, life: 30, power: p.power }));
      game.fx.ring(tx, ty, 50, '#a8e063', 26);
      game.audio.cast('earth', true);
    },
  },
  {
    id: 'ice', name: 'Ice', icon: '🜄', color: '#7ec8ff',
    primaryName: 'Ice Shard', heavyName: 'Ice Wall',
    desc: 'Shards slow, and rarely freeze outright; charge to hurl a wall.',
    cost: 9, heavyCostFrac: 0.7,

    primary(p, game) {
      p.castProjectile(game, p.aim, {
        damage: 11 * p.power, speed: 620, life: 1.25, radius: 6,
        color: '#a9dcff', knock: 80, trailColor: '#4ea8e0', effect: 'chill',
      });
      game.audio.cast('ice', false);
    },
    heavy(p, game) {
      p.castProjectile(game, p.aim, {
        damage: 60 * p.power, speed: 380, life: 1.6, radius: 18,
        color: '#dff1ff', knock: 420, trailColor: '#7ec8ff',
        aoe: { radius: 110, damage: 20 * p.power },
      });
      game.fx.addShake(6);
      game.audio.cast('ice', true);
    },
  },
  {
    id: 'air', name: 'Air', icon: '🜁', color: '#cfe4ff',
    primaryName: 'Tornado', heavyName: 'Gale',
    desc: 'Tornadoes fling the weak and shove the rest; charge for a cone blast.',
    cost: 10, heavyCostFrac: 0.28,

    primary(p, game) {
      p.castProjectile(game, p.aim, {
        damage: 9 * p.power, speed: 500, life: 1.5, radius: 10,
        color: '#e6f0ff', knock: 60, trailColor: '#9fb8d8', effect: 'fling',
      });
      game.audio.cast('air', false);
    },
    heavy(p, game) {
      // A cone in front. Elites and bosses are simply too heavy to move.
      const hit = game.enemyHash.query(p.x, p.y, 300, []);
      let moved = 0;
      for (const e of hit) {
        const d = U.dist(p.x, p.y, e.x, e.y);
        if (d > 300) continue;
        if (Math.abs(U.angleDiff(p.aim, U.angle(p.x, p.y, e.x, e.y))) > 0.75) continue;
        e.takeDamage(12 * p.power, game, p.x, p.y, 0, false);
        if (!e.elite && !e.def.boss) {
          const a = U.angle(p.x, p.y, e.x, e.y);
          e.vx += Math.cos(a) * 900;
          e.vy += Math.sin(a) * 900;
          e.stun = Math.max(e.stun, 0.5);
          moved++;
        }
      }
      if (!moved) game.fx.text(p.x, p.y - 44, 'unmoved', '#8fa0b8', 12);
      game.fx.spark(p.x, p.y, {
        count: 30, color: ['#e6f0ff', '#9fb8d8'], dir: p.aim, spread: 0.75,
        speedMax: 420, lifeMax: 0.5, glow: false,
      });
      game.fx.addShake(5);
      game.audio.cast('air', true);
    },
  },
];

const MINION_SLOTS = ['thrall', 'bomber', 'brute', 'jarona'].map(id => {
  const t = MINION_TYPES[id];
  return {
    id, name: t.name, icon: t.icon, color: t.color, desc: t.desc,
    cost: t.cost, cooldown: t.cooldown,
  };
});

Object.assign(CLASSES, {
  necromancer: {
    id: 'necromancer',
    className: 'Necromancer',
    icon: '☠',
    color: '#7fd6a6',
    torso: '#33564a',
    dashColors: ['#7fd6a6', '#d8f5e6'],
    energyName: 'Stamina',
    energyBar: 'linear-gradient(180deg,#4fd0a8,#1e7a63)',

    tiers: [
      { weapon: 'Bone Staff', dmgMul: 1, cdMul: 1, wood: '#cfc7ad', gem: '#7fd6a6' },
      { weapon: 'Rot Staff', dmgMul: 1.5, cdMul: 0.9, wood: '#6b5a48', gem: '#b7f542' },
    ],

    maxHp: 100,
    speed: 174,
    maxEnergy: 100,
    energyRegen: 26,
    maxMana: 110,
    manaRegen: 8,
    damageReduction: 0.05,

    primary: { name: 'Bone Bolt', cd: 0.3, cost: 0, manaCost: 6, damage: 11, projSpeed: 600, projLife: 1.2, knock: 70 },
    heavy: { name: 'Summon', cd: 0.35, cost: 0, chargeTime: 0.14 },
    mobility: { name: 'Dash', cost: 26, cd: 0.5, speed: 720, time: 0.19, iframes: 0.28 },

    loadout: { kind: 'minion', label: 'Minion', options: MINION_SLOTS },
    maxMinions: 4,
    lifeOnKill: 0,
    blurb: 'Four servants at once, each with a catch. RMB raises the one you picked.',

    onPrimary(p, game) {
      if (!p.spendMana(this.primary.manaCost)) return;
      p.castProjectile(game, p.aim, {
        damage: this.primary.damage * p.power, speed: this.primary.projSpeed,
        life: this.primary.projLife, radius: 5, color: '#d8f5e6',
        knock: this.primary.knock * p.knockMul, trailColor: '#7fd6a6',
      });
      game.audio.cast('bone', false);
    },

    onHeavy(p, game) { p.summonMinion(game); },

    drawWeapon(ctx, p) {
      const t = p.tier;
      ctx.rotate(-0.35);
      ctx.strokeStyle = t.wood;
      ctx.lineWidth = 3.6;
      ctx.beginPath(); ctx.moveTo(-6, 4); ctx.lineTo(16, -14); ctx.stroke();
      ctx.fillStyle = t.gem;
      ctx.shadowBlur = 12; ctx.shadowColor = t.gem;
      ctx.beginPath(); ctx.arc(17, -15, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = t.wood;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(17, -15, 8, 0.6, 4.2); ctx.stroke();
    },
  },

  mage: {
    id: 'mage',
    className: 'Mage',
    icon: '✶',
    color: '#c07bff',
    torso: '#3d2a57',
    dashColors: ['#c07bff', '#eddcff'],
    energyName: 'Stamina',
    energyBar: 'linear-gradient(180deg,#4fd0a8,#1e7a63)',

    tiers: [
      { weapon: 'Wooden Staff', dmgMul: 1, cdMul: 1, wood: '#8a6a42', gem: '#c07bff' },
      { weapon: 'Iron Staff', dmgMul: 1.5, cdMul: 0.88, wood: '#6d737a', gem: '#e0b3ff' },
    ],

    maxHp: 82,
    speed: 180,
    maxEnergy: 100,
    energyRegen: 26,
    maxMana: 120,
    manaRegen: 9,
    damageReduction: 0,

    primary: { name: 'Cast', cd: 0.34, cost: 0 },
    heavy: { name: 'Channel', cd: 0.62, cost: 0, chargeTime: 0.45 },
    mobility: { name: 'Blink', cost: 26, cd: 0.5, speed: 740, time: 0.18, iframes: 0.3 },

    loadout: { kind: 'element', label: 'Element', options: ELEMENTS },
    lifeOnKill: 0,
    blurb: 'Four elements on the wheel. R switches; each has its own heavy.',

    onPrimary(p, game) {
      const el = ELEMENTS[p.slot];
      if (!p.spendMana(el.cost * p.costMul)) return;
      el.primary(p, game);
    },

    onHeavy(p, game, power) {
      const el = ELEMENTS[p.slot];
      const cost = p.maxMana * el.heavyCostFrac * p.costMul;
      if (!p.spendMana(cost)) return;
      el.heavy(p, game, power);
    },

    drawWeapon(ctx, p) {
      const t = p.tier;
      const el = ELEMENTS[p.slot];
      ctx.rotate(-0.3);
      ctx.strokeStyle = t.wood;
      ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.moveTo(-6, 4); ctx.lineTo(17, -13); ctx.stroke();
      const glow = el ? el.color : t.gem;
      ctx.fillStyle = glow;
      ctx.shadowBlur = 16; ctx.shadowColor = glow;
      const pulse = p.charging ? 5.5 + Math.sin(p.chargeT * 26) * 2 : 4.5;
      ctx.beginPath(); ctx.arc(18, -14, pulse, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    },
  },
});

const CLASS_IDS = Object.keys(CLASSES);

/* ------------------------------------------------------------------ */
/* Level-up boons. `only` restricts a perk to one class.               */
/* ------------------------------------------------------------------ */

const PERKS = [
  // --- shared ---
  {
    id: 'vitality', name: 'Vitality', icon: '❤',
    desc: '+28 maximum health, and heal that much now.',
    apply(p) { p.maxHp += 28; p.hp += 28; },
  },
  {
    id: 'keen', name: 'Keen Edge', icon: '✦',
    desc: '+15% damage with your weapon.',
    apply(p) { p.dmgMul += 0.15; },
  },
  {
    id: 'swift', name: 'Swiftness', icon: '≫',
    desc: '+10% movement speed.',
    apply(p) { p.moveMul += 0.10; },
  },
  {
    id: 'vigor', name: 'Vigor', icon: '◈',
    desc: '+30% energy regeneration and +15 maximum energy.',
    apply(p) { p.regenMul += 0.30; p.maxEnergy += 15; p.energy += 15; },
  },
  {
    id: 'fortitude', name: 'Fortitude', icon: '⛨',
    desc: 'Take 12% less damage from everything.',
    apply(p) { p.dr = 1 - (1 - p.dr) * 0.88; },
  },
  {
    id: 'greed', name: 'Coin-Sense', icon: '◆',
    desc: '+50% gold, and chests hold more.',
    apply(p) { p.goldMul += 0.5; },
  },
  {
    id: 'second', name: 'Second Wind', icon: '✚',
    desc: 'Heal 12 health each time you level up. Heal 30 now.',
    apply(p) { p.levelHeal += 12; p.heal(30); },
  },
  {
    id: 'reflex', name: 'Reflexes', icon: '↯',
    desc: 'Your dash or roll costs 40% less and recovers faster.',
    apply(p) { p.mobCostMul *= 0.6; p.mobCdMul *= 0.7; },
  },

  // --- wooden sword / melee ---
  {
    id: 'reach', name: 'Long Reach', icon: '⟺', only: 'melee',
    desc: '+22% swing reach and a wider arc.',
    apply(p) { p.rangeMul += 0.22; p.arcMul += 0.15; },
  },
  {
    id: 'bloodthirst', name: 'Bloodthirst', icon: '🩸', only: 'melee',
    desc: 'Restore 5 more health per kill.',
    apply(p) { p.lifeOnKill += 5; },
  },
  {
    id: 'whirlwind', name: 'Whirlwind', icon: '⟳', only: 'melee',
    desc: 'Cleave becomes a full 360° spin and hits harder.',
    apply(p) { p.whirlwind = true; p.heavyMul += 0.15; },
  },
  {
    id: 'momentum', name: 'Momentum', icon: '➤', only: 'melee',
    desc: 'Dashing through enemies damages and staggers them.',
    apply(p) { p.dashDamage += 22; },
  },
  {
    id: 'executioner', name: 'Executioner', icon: '☠', only: 'melee',
    desc: '+80% damage to enemies below a third health.',
    apply(p) { p.executioner += 0.8; },
  },
  {
    id: 'ironskin', name: 'Iron Skin', icon: '▣', only: 'melee',
    desc: 'Take 18% less damage and gain +15 health.',
    apply(p) { p.dr = 1 - (1 - p.dr) * 0.82; p.maxHp += 15; p.hp += 15; },
  },

  // --- slingshot / ranger ---
  {
    id: 'twinshot', name: 'Twin Shot', icon: '⁘', only: 'ranger',
    desc: 'Fire an extra pebble per shot, in a tight spread.',
    apply(p) { p.multishot += 1; },
  },
  {
    id: 'ricochet', name: 'Ricochet', icon: '↺', only: 'ranger',
    desc: 'Pebbles bounce once to a nearby enemy.',
    apply(p) { p.ricochet += 1; },
  },
  {
    id: 'quickhands', name: 'Quick Hands', icon: '⚡', only: 'ranger',
    desc: '28% faster shots.',
    apply(p) { p.cdMul *= 0.72; },
  },
  {
    id: 'heavystone', name: 'River Stones', icon: '●', only: 'ranger',
    desc: '+25% projectile damage and much heavier knockback.',
    apply(p) { p.dmgMul += 0.25; p.knockMul += 1.2; },
  },
  {
    id: 'sniper', name: "Hawk's Eye", icon: '◎', only: 'ranger',
    desc: 'Double the bonus damage you get for hitting from afar.',
    apply(p) { p.falloffMul += 1; },
  },
  {
    id: 'kite', name: 'Kiting', icon: '↝', only: 'ranger',
    desc: 'Move 8% faster and shots cost 30% less ammo.',
    apply(p) { p.moveMul += 0.08; p.costMul *= 0.7; },
  },

  // --- bone staff / necromancer ---
  {
    id: 'graveHunger', name: 'Grave Hunger', icon: '☠', only: 'necromancer',
    desc: 'Your minions hit 35% harder.',
    apply(p) { p.minionPower += 0.35; },
  },
  {
    id: 'quickRites', name: 'Quick Rites', icon: '⟳', only: 'necromancer',
    desc: 'Summoning cooldowns are 30% shorter.',
    apply(p) { p.summonCdMul *= 0.7; },
  },
  {
    id: 'deepWell', name: 'Deep Well', icon: '◈', only: 'necromancer',
    desc: '+35 maximum mana and faster regeneration.',
    apply(p) { p.maxMana += 35; p.mana += 35; p.regenMul += 0.2; },
  },
  {
    id: 'boneHarvest', name: 'Bone Harvest', icon: '✚', only: 'necromancer',
    desc: 'Every kill returns 4 health and 6 mana.',
    apply(p) { p.lifeOnKill += 4; p.manaOnKill = (p.manaOnKill || 0) + 6; },
  },
  {
    id: 'cheapRaising', name: 'Cheap Raising', icon: '↯', only: 'necromancer',
    desc: 'Everything you cast and raise costs 25% less mana.',
    apply(p) { p.costMul *= 0.75; },
  },
  {
    id: 'grimResolve', name: 'Grim Resolve', icon: '⛨', only: 'necromancer',
    desc: 'Take 14% less damage while any minion stands.',
    apply(p) { p.wardedByMinions = true; },
  },

  // --- wooden staff / mage ---
  {
    id: 'attunement', name: 'Attunement', icon: '✶', only: 'mage',
    desc: '+20% spell damage.',
    apply(p) { p.dmgMul += 0.20; },
  },
  {
    id: 'deepMana', name: 'Font of Power', icon: '◈', only: 'mage',
    desc: '+40 maximum mana and faster regeneration.',
    apply(p) { p.maxMana += 40; p.mana += 40; p.regenMul += 0.25; },
  },
  {
    id: 'efficient', name: 'Efficient Casting', icon: '↯', only: 'mage',
    desc: 'All spells cost 28% less mana.',
    apply(p) { p.costMul *= 0.72; },
  },
  {
    id: 'quickCast', name: 'Quickened', icon: '⚡', only: 'mage',
    desc: 'Cast 25% faster.',
    apply(p) { p.cdMul *= 0.75; },
  },
  {
    id: 'elementalist', name: 'Elementalist', icon: '⁘', only: 'mage',
    desc: 'Heavy spells hit 30% harder.',
    apply(p) { p.heavyMul += 0.30; },
  },
  {
    id: 'wardveil', name: 'Ward Veil', icon: '⛨', only: 'mage',
    desc: 'Take 15% less damage and gain +12 health.',
    apply(p) { p.dr = 1 - (1 - p.dr) * 0.85; p.maxHp += 12; p.hp += 12; },
  },
];

function rollPerks(classId, taken, count = 3) {
  const pool = PERKS.filter(p => (!p.only || p.only === classId));
  // Repeatable stat perks can show up again; unique mechanics cannot.
  const unique = new Set([
    'whirlwind', 'ricochet', 'sniper', 'twinshot', 'momentum',
    'grimResolve', 'boneHarvest', 'elementalist',
  ]);
  const avail = pool.filter(p => !(unique.has(p.id) && taken.includes(p.id)));
  return U.shuffle(avail).slice(0, count);
}
