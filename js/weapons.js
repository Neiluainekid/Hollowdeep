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

    // Two stances on the R wheel: reach and speed, or weight and armour.
    loadout: {
      kind: 'stance', label: 'Stance', options: [
        {
          id: 'swift', name: 'Swift Stance', icon: '≫', color: '#e2b34a',
          desc: 'Quick, wide swings. Standard reach and guard.',
          dmg: 1, cd: 1, knock: 1, dr: 0, arc: 1,
        },
        {
          id: 'heavyStance', name: 'Heavy Stance', icon: '▣', color: '#d78a4a',
          desc: '+45% damage and knockback, 30% slower, and 12% less damage taken.',
          dmg: 1.45, cd: 1.3, knock: 1.6, dr: 0.12, arc: 1.15,
        },
      ],
    },

    onPrimary(p, game) {
      const a = this.primary;
      const st = p.slotDef;
      p.startSwing(game, {
        damage: a.damage * p.power * st.dmg,
        range: a.range * p.rangeMul,
        arc: a.arc * p.arcMul * st.arc,
        knock: a.knock * p.knockMul * st.knock,
        dur: 0.26 * st.cd, wind: a.wind, heavy: false, stun: 0,
      });
      game.audio.swordSwing(false);
    },

    onHeavy(p, game, power) {
      const h = this.heavy;
      const st = p.slotDef;
      p.startSwing(game, {
        damage: h.damage * power * p.power * p.heavyMul * st.dmg,
        range: h.range * p.rangeMul,
        arc: (p.whirlwind ? Math.PI * 2 : h.arc) * (p.whirlwind ? 1 : p.arcMul),
        knock: h.knock * p.knockMul * power * st.knock,
        dur: 0.42 * st.cd, wind: h.wind, heavy: true, stun: h.stun * power,
        impact: true,          // heavy hits get an impact freeze-frame
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

    // Update 2.0 damage table: base 15, heavy 20, and each further target a
    // piercing shot passes through takes 15-16 rather than the full 20.
    primary: {
      name: 'Pebble', cd: 0.3, cost: 5, damage: 15,
      projSpeed: 700, projLife: 1.15, knock: 60,
    },
    heavy: {
      name: 'Piercing Shot', cd: 0.45, cost: 14, chargeTime: 0.34, damage: 20,
      projSpeed: 980, projLife: 1.4, pierce: true, knock: 220,
      pierceMin: 15, pierceMax: 16,
    },
    mobility: { name: 'Roll', cost: 26, cd: 0.5, speed: 700, time: 0.21, iframes: 0.3 },

    // Rewarded for keeping the gap: scales to +45% at 500px and beyond.
    falloffBonus: 0.45,
    falloffRange: 500,
    lifeOnKill: 0,
    blurb: 'Distant targets take more. Never let them close.',

    // R swaps the whole weapon: elastic and stones, or lobbed explosives.
    loadout: {
      kind: 'ordnance', label: 'Ordnance', options: [
        {
          id: 'stones', name: 'Stones', icon: '●', color: '#cbd8f0',
          desc: 'Slingshot. 15 damage a shot, 20 on a charged pierce.',
        },
        {
          id: 'grenades', name: 'Hand Grenades', icon: '✹', color: '#ffb347',
          desc: 'Lobbed explosives — 20 ammo apiece, big blast, no aiming finesse.',
          ammoCost: 20,
        },
      ],
    },

    onPrimary(p, game) {
      const a = this.primary;
      if (p.slotDef.id === 'grenades') return this.throwGrenade(p, game, false);

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
      if (p.slotDef.id === 'grenades') return this.throwGrenade(p, game, true);

      p.fireProjectile(game, p.aim, {
        damage: h.damage * power * p.power * p.heavyMul,
        speed: h.projSpeed, life: h.projLife,
        radius: 6 + 6 * power, knock: h.knock * p.knockMul * power,
        pierce: true, heavy: true, color: '#ffffff',
        // Targets after the first take a reduced 15-16 rather than the full 20.
        pierceFalloff: { min: h.pierceMin, max: h.pierceMax },
      });
      game.fx.addShake(3 + 4 * power);
      game.fx.spark(p.x + Math.cos(p.aim) * 18, p.y + Math.sin(p.aim) * 18, {
        count: 14, color: ['#ffffff', '#7ea8ff'], dir: p.aim, spread: 0.35, speedMax: 300,
      });
      p.vx -= Math.cos(p.aim) * 150 * power;
      p.vy -= Math.sin(p.aim) * 150 * power;
      game.audio.slingShot(p.weaponTier, true);
    },

    // Grenades bill 20 ammo on top of the normal shot cost, and land as a
    // delayed ground impact so the blast is something you can walk out of.
    throwGrenade(p, game, heavy) {
      const cost = 20 * p.costMul;
      if (!p.spendEnergy(cost)) {
        game.fx.text(p.x, p.y - 30, 'need 20 ammo', '#8fa0b8', 12);
        return;
      }
      const range = Math.min(U.dist(p.x, p.y, game.mouseWorld.x, game.mouseWorld.y), 420);
      const tx = p.x + Math.cos(p.aim) * range;
      const ty = p.y + Math.sin(p.aim) * range;
      game.impacts.push({
        x: tx, y: ty, t: 0, delay: heavy ? 0.9 : 0.7,
        radius: heavy ? 140 : 105, color: '#ffb347',
        directRadius: 46,
        directDamage: (heavy ? 62 : 44) * p.power * (heavy ? p.heavyMul : 1),
        aoeDamage: (heavy ? 34 : 24) * p.power,
        hostile: false,
      });
      game.fx.spark(p.x + Math.cos(p.aim) * 16, p.y + Math.sin(p.aim) * 16, {
        count: 6, color: ['#ffb347', '#fff1c9'], dir: p.aim, spread: 0.4, speedMax: 160,
      });
      game.audio.slingShot(p.weaponTier, heavy);
    },

    drawWeapon(ctx, p) {
      if (p.weaponTier > Seq.FIRST) {
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
/* Tanker — the riot shield. The only class that can answer a red        */
/* telegraph without dodging: raising the shield downgrades unblockable  */
/* attacks to parryable ones, so red indicators literally render blue.   */
/* ------------------------------------------------------------------ */

Object.assign(CLASSES, {
  tanker: {
    id: 'tanker',
    className: 'Tanker',
    icon: '⛨',
    color: '#8fa8c8',
    torso: '#39485c',
    dashColors: ['#8fa8c8', '#dfe9f5'],
    energyName: 'Stamina',
    energyBar: 'linear-gradient(180deg,#7f9fc4,#2f4a6b)',

    tiers: [
      { weapon: 'Riot Shield', dmgMul: 1, cdMul: 1, plate: '#9fb4cc', trim: '#5c7490' },
      { weapon: 'Spiky Shield', dmgMul: 1.5, cdMul: 0.9, plate: '#c2ccd8', trim: '#8a6a42', spikes: true },
    ],

    maxHp: 200,
    speed: 118,                 // heaviest, slowest thing in the deep
    maxEnergy: 120,
    energyRegen: 22,
    damageReduction: 0.25,

    primary: {
      name: 'Shield Bash', cd: 0.42, cost: 0, damage: 19,
      range: 58, arc: 1.35, knock: 320, wind: 0.09,
    },
    heavy: { name: 'Brace', cd: 0.6, cost: 34, chargeTime: 0.45 },
    mobility: { name: 'Dash', cost: 30, cd: 0.6, speed: 620, time: 0.2, iframes: 0.26 },

    // Charging the heavy raises the shield, so blocking and committing are
    // the same act — you brace, and while braced nothing is unblockable.
    blocksWhileCharging: true,
    blockDR: 0.6,

    loadout: {
      kind: 'brace', label: 'Brace Mode', options: [
        {
          id: 'heavyDash', name: 'Heavy Dash', icon: '➤', color: '#8fa8c8',
          desc: 'Charge forward behind the shield, trampling everything in the lane.',
        },
        {
          id: 'heavySlam', name: 'Heavy Slam', icon: '⊙', color: '#c8a86a',
          desc: 'Drive the shield down for a heavy radial shockwave.',
        },
      ],
    },

    lifeOnKill: 2,
    blurb: 'Raise the shield and red turns blue. Nothing is unblockable to you.',

    onPrimary(p, game) {
      const a = this.primary;
      p.startSwing(game, {
        damage: a.damage * p.power,
        range: a.range * p.rangeMul,
        arc: a.arc * p.arcMul,
        knock: a.knock * p.knockMul,
        dur: 0.28, wind: a.wind, heavy: false, stun: 0.25,
      });
      game.audio.impact(false);
    },

    onHeavy(p, game, power) {
      if (p.slotDef.id === 'heavyDash') {
        // A committed shoulder-charge: invulnerable, and it flattens a lane.
        p.dashT = 0.34;
        p.dashDir = p.aim;
        p.iframes = Math.max(p.iframes, 0.4);
        p.dashHit.clear();
        p.shieldChargeDmg = 40 * power * p.power * p.heavyMul;
        game.fx.ring(p.x, p.y, 26, '#8fa8c8', 20);
        game.fx.addShake(6);
        game.audio.swordSwing(true);
        return;
      }
      // Heavy Slam: radial shockwave centred on the player.
      const radius = 148 * p.rangeMul;
      const dmg = 54 * power * p.power * p.heavyMul;
      for (const e of game.enemyHash.query(p.x, p.y, radius, [])) {
        if (e.dead || U.dist(p.x, p.y, e.x, e.y) > radius) continue;
        e.takeDamage(dmg, game, p.x, p.y, 640 * p.knockMul, false);
        e.stun = Math.max(e.stun, 0.8);
      }
      game.impactFreeze(0.09);
      game.fx.ring(p.x, p.y, radius * 0.6, '#c8a86a', 44);
      game.fx.spark(p.x, p.y, {
        count: 34, color: ['#c8a86a', '#ffffff', '#8fa8c8'], speedMax: 380, lifeMax: 0.7, sizeMax: 5,
      });
      game.fx.addShake(14);
      game.audio.explode();
    },

    drawWeapon(ctx, p) {
      const t = p.tier;
      const braced = p.charging;
      ctx.rotate(braced ? 0 : -0.25);
      // Shield face, held out front and squared up when bracing.
      ctx.fillStyle = t.plate;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(6, -13, 11, 26, 3) : ctx.rect(6, -13, 11, 26);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.fillRect(6, -13, 11, 4);
      ctx.strokeStyle = t.trim;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(11.5, -11); ctx.lineTo(11.5, 11); ctx.stroke();
      if (t.spikes) {
        ctx.fillStyle = '#e8eef5';
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(17, i * 8 - 3); ctx.lineTo(25, i * 8); ctx.lineTo(17, i * 8 + 3);
          ctx.closePath(); ctx.fill();
        }
      }
      if (braced) {
        ctx.globalAlpha = 0.45 + Math.sin(p.chargeT * 18) * 0.2;
        ctx.strokeStyle = '#8fd4ff';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(12, 0, 20, -1.1, 1.1); ctx.stroke();
      }
    },
  },
});

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
    /* Update 2.0: the Air heavy is the Mage's panic button. A full-screen
       tornado that simply deletes anything ordinary caught in it — and
       leaves you at zero mana AND zero stamina, so it is a genuine
       all-or-nothing. Elites and bosses take heavy damage instead. */
    heavy(p, game) {
      const radius = 460 * p.rangeMul;
      let executed = 0, resisted = 0;
      for (const e of game.enemyHash.query(p.x, p.y, radius, [])) {
        if (e.dead || U.dist(p.x, p.y, e.x, e.y) > radius) continue;
        if (!e.elite && !e.def.boss) {
          e.takeDamage(e.hp + 9999, game, p.x, p.y, 0, false);
          executed++;
        } else {
          e.takeDamage(90 * p.power * p.heavyMul, game, p.x, p.y, 260, true);
          e.stun = Math.max(e.stun, 0.7);
          resisted++;
        }
      }
      // The whole cost, not a fraction of it.
      p.mana = 0;
      p.energy = 0;
      game.tempest(1.35);          // canvas blur/darken while the wind passes
      game.impactFreeze(0.12);
      game.fx.ring(p.x, p.y, radius * 0.42, '#e6f0ff', 60);
      game.fx.ring(p.x, p.y, radius * 0.7, '#9fb8d8', 46);
      game.fx.spark(p.x, p.y, {
        count: 90, color: ['#e6f0ff', '#9fb8d8', '#ffffff'],
        speedMax: 620, lifeMax: 1.1, sizeMax: 5, glow: false,
      });
      game.fx.addShake(22);
      game.fx.text(p.x, p.y - 56, executed ? `${executed} SWEPT AWAY` : 'THE WIND PASSES', '#e6f0ff', 20);
      if (resisted) game.fx.text(p.x, p.y - 32, `${resisted} held fast`, '#8fa0b8', 13);
      game.audio.cast('air', true);
      game.audio.explode();
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
      const el = Seq.get(ELEMENTS, p.slot);
      if (!p.spendMana(el.cost * p.costMul)) return;
      el.primary(p, game);
    },

    onHeavy(p, game, power) {
      const el = Seq.get(ELEMENTS, p.slot);
      const cost = p.maxMana * el.heavyCostFrac * p.costMul;
      if (!p.spendMana(cost)) return;
      el.heavy(p, game, power);
    },

    drawWeapon(ctx, p) {
      const t = p.tier;
      const el = Seq.get(ELEMENTS, p.slot);
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
