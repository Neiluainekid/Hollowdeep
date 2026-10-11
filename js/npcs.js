/* NPC companions — Update 2.0, reworked in 3.0.

   Two are found locked in cages and freed with `E`. The third, John Space,
   is not caged: he stands in the deep regions doing nothing at all, and what
   he becomes is entirely up to you.

   Companions are persistent — unlike Necromancer minions they have no expiry
   timer. They can be hurt, and drinking from a fountain heals every companion
   with you, so the fountains are worth saving rather than sipping on sight.

   Update 3.0:
     - they level up from kills, like the player, and get stronger each level
     - each has a unique skill on its own cooldown
     - they wear gear: the same four slots as you, set from your inventory
     - only one of each kind per dungeon; a new dungeon sends them all home
     - they follow you properly (see Follow below)

   Update 4.0: four more, and they only live in the two later stages — two
   caged in Sarapolis, two in Day-ZEE. Two of them fight from range, and two
   look after you rather than the enemy. John Space also keeps his own look
   once he joins you. */
'use strict';

/* ------------------------------------------------------------------ */
/* Follow — the "tracker" every follower uses.                          */
/*                                                                      */
/* The player drops breadcrumbs as they move (Game.updateTrail). A       */
/* follower that can see the player walks straight at them; one that     */
/* cannot walks to the newest breadcrumb it CAN see, which threads it    */
/* back through the same doors and corridors the player took. If it is  */
/* hopelessly far, or wedged against a wall for too long, it is simply  */
/* brought back to the player's side.                                    */
/* ------------------------------------------------------------------ */

const Follow = {
  LEASH: 560,        // fight only within this of the player
  TELEPORT: 1150,    // beyond this, catch up instantly
  STUCK_AFTER: 1.6,  // seconds of not getting closer before a rescue

  /* Desired velocity toward the player, keeping `heel` distance. */
  step(actor, game, speed, heel, dt) {
    const p = game.player;
    const dun = game.dungeon;
    const d = U.dist(actor.x, actor.y, p.x, p.y);

    if (d > this.TELEPORT) { this.rescue(actor, game); return { x: 0, y: 0 }; }
    if (d <= heel) { actor._anchor = null; return { x: 0, y: 0 }; }

    // Stuck detection: judged by the follower's own movement, not by the gap
    // to the player — keeping pace with a running player is not being stuck.
    const an = actor._anchor || (actor._anchor = { x: actor.x, y: actor.y, t: 0 });
    if (U.dist2(an.x, an.y, actor.x, actor.y) > 22 * 22) { an.x = actor.x; an.y = actor.y; an.t = 0; }
    else an.t += dt;
    if (an.t > this.STUCK_AFTER && d > 200) { this.rescue(actor, game); return { x: 0, y: 0 }; }

    // Re-pick the waypoint a few times a second, not every frame: the trail
    // scan is the expensive part of following.
    actor._goalT = (actor._goalT || 0) - dt;
    if (actor._goal && actor._goalT > 0) {
      const g2 = actor._goal;
      const a2 = U.angle(actor.x, actor.y, g2.x, g2.y);
      const urg = U.clamp(d / 300, 0.75, 1.6);
      return { x: Math.cos(a2) * speed * urg, y: Math.sin(a2) * speed * urg };
    }
    actor._goalT = 0.15;

    let tx = p.x, ty = p.y;
    if (!this.clear(dun, actor.x, actor.y, p.x, p.y, actor.radius)) {
      // Newest crumb the whole body can reach in a straight line; failing
      // that, the newest one we can at least see.
      const trail = game.trail || [];
      let found = null, seen = null;
      for (let i = trail.length - 1; i >= 0; i--) {
        const c = trail[i];
        if (this.clear(dun, actor.x, actor.y, c.x, c.y, actor.radius)) { found = c; break; }
        if (!seen && dun.lineOfSight(actor.x, actor.y, c.x, c.y)) seen = c;
      }
      const to = found || seen;
      if (to) { tx = to.x; ty = to.y; }
    }
    actor._goal = (tx === p.x && ty === p.y) ? null : { x: tx, y: ty };
    // Run to catch up when far behind, stroll when close.
    const urgency = U.clamp(d / 300, 0.75, 1.6);
    const a = U.angle(actor.x, actor.y, tx, ty);
    return { x: Math.cos(a) * speed * urgency, y: Math.sin(a) * speed * urgency };
  },

  // A straight run wide enough for a body: the centre line plus both edges.
  clear(dun, x0, y0, x1, y1, r) {
    if (!dun.lineOfSight(x0, y0, x1, y1)) return false;
    const a = U.angle(x0, y0, x1, y1) + Math.PI / 2;
    const ox = Math.cos(a) * r * 0.9, oy = Math.sin(a) * r * 0.9;
    return dun.lineOfSight(x0 + ox, y0 + oy, x1 + ox, y1 + oy)
      && dun.lineOfSight(x0 - ox, y0 - oy, x1 - ox, y1 - oy);
  },

  // Put the follower back at the player's side, on real floor.
  rescue(actor, game) {
    const p = game.player;
    const spot = game.safeSpawnNear(p.x, p.y, 46, U.rand(0, Math.PI * 2), actor.radius);
    game.fx.spark(actor.x, actor.y, { count: 8, color: ['#ffffff'], speedMax: 90, lifeMax: 0.3 });
    actor.x = spot.x; actor.y = spot.y;
    actor.vx = actor.vy = 0;
    actor._anchor = null;
    game.fx.ring(actor.x, actor.y, 18, '#ffffff', 12);
  },
};

const COMPANIONS = {
  disgraced: {
    id: 'disgraced',
    name: 'The Disgraced One',
    hp: 200, speed: 142, radius: 13,
    damage: 22, hitCd: 0.85, reach: 52, arc: 1.7,
    color: '#c8a86a', dark: '#5c4426',
    skill: { id: 'flurry', name: 'Disgrace Flurry', cd: 8, desc: 'Six barehanded blows in a blur.' },
    blurb: 'Barehanded, and no longer interested in explaining himself.',
  },
  switcher: {
    id: 'switcher',
    name: 'Switcher',
    hp: 150, speed: 152, radius: 12,
    damage: 9, hitCd: 1.1, reach: 44, arc: 1.6,
    color: '#b58ad6', dark: '#4a2f61',
    swap: { cd: 4.2, range: 320 },
    skill: { id: 'thunderclap', name: 'Thunderclap', cd: 10, desc: 'A clap so loud it staggers everything nearby.' },
    blurb: 'Claps once, and something ends up somewhere it did not expect.',
  },
  johnspace: {
    id: 'johnspace',
    name: 'John Space',
    hp: 500, speed: 158, radius: 14,
    damage: 26, hitCd: 0.8, reach: 56, arc: 1.8,
    color: '#8fd4ff', dark: '#2b3c66',
    skill: { id: 'spacePunch', name: 'Space Punch', cd: 7, desc: 'Crosses the room in one step and hits like a comet.' },
    blurb: 'You left him alone. He appreciated that.',
  },

  /* ---------------- Update 4.0: Sarapolis ---------------- */
  emberknight: {
    id: 'emberknight',
    name: 'The Ember Knight',
    hp: 260, speed: 136, radius: 14,
    damage: 24, hitCd: 0.9, reach: 58, arc: 1.9,
    color: '#ff8a3c', dark: '#5c200c',
    maps: [2],
    burns: { dps: 8, time: 3 },
    skill: { id: 'flameWheel', name: 'Flame Wheel', cd: 9, desc: 'Spins a burning blade through everything around him.' },
    blurb: 'Swore an oath to the Slagworks. The Slagworks is gone; the oath is not.',
  },
  glasssaint: {
    id: 'glasssaint',
    name: 'The Glass Saint',
    hp: 170, speed: 146, radius: 12,
    damage: 14, hitCd: 1.0, reach: 50, arc: 1.7,
    color: '#cfe8ff', dark: '#3a4a66',
    maps: [2],
    skill: { id: 'mirrorWard', name: 'Mirror Ward', cd: 14, support: true, desc: 'Wards you: the next hit is swallowed whole, and some of it goes back.' },
    blurb: 'Made of the Glass Waste. Shines on your behalf.',
  },

  /* ---------------- Update 4.0: Day-ZEE ---------------- */
  medic: {
    id: 'medic',
    name: 'Field Medic Ross',
    hp: 190, speed: 150, radius: 12,
    damage: 12, hitCd: 0.6, reach: 44, arc: 1.6,
    color: '#f0f0f0', dark: '#8a1c1c',
    maps: [3],
    ranged: { range: 340, cd: 0.6, speed: 640, damage: 12, color: '#ffe08a' },
    skill: { id: 'patchUp', name: 'Patch Up', cd: 11, support: true, desc: 'Patches you (and the others) up mid-fight.' },
    blurb: 'Still has a full kit. Still has a pistol. Has stopped asking questions.',
  },
  sergeant: {
    id: 'sergeant',
    name: 'Sgt. Holloway',
    hp: 300, speed: 138, radius: 13,
    damage: 18, hitCd: 0.7, reach: 50, arc: 1.6,
    color: '#8a9a5a', dark: '#2a3218',
    maps: [3],
    ranged: { range: 420, cd: 0.32, speed: 700, damage: 9, color: '#ffd27a', burst: 3 },
    skill: { id: 'airstrike', name: 'Airstrike', cd: 13, desc: 'Calls the last working radio on the base: artillery on the enemy.' },
    blurb: 'Last man standing in his unit. Intends to stay that way.',
  },
};

function companionXpNeeded(level) { return Math.round(40 + Math.pow(level, 1.5) * 30); }

class Companion {
  constructor(kind, x, y) {
    const t = COMPANIONS[kind];
    this.kind = kind;
    this.def = t;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.radius = t.radius;
    this.maxHp = t.hp;
    this.hp = t.hp;
    this.hitCd = 0;
    this.swapCd = t.swap ? t.swap.cd : 0;
    this.skillCd = t.skill ? t.skill.cd * 0.5 : 0;
    this.flash = 0;
    this.swing = 0;          // slash animation timer
    this.clap = 0;           // Switcher's clap animation
    this.bob = U.rand(0, 10);
    this.dead = false;
    this.taunt = true;       // companions pull attacks, that's the point
    this.level = 1;
    this.xp = 0;
    this.xpNext = companionXpNeeded(1);
    this.equip = Gear.blankEquip();
    this.gearDef = 0;
    this.gearSpeed = 0;
    this.gearDmg = 0;
    this.gearCrit = 0;
    this.gearRegen = 0;
    this.flurry = null;      // Disgraced One's skill in progress
    this.punch = null;       // John's skill in progress
    this._q = [];
  }

  get name() { return this.def.name; }
  get dmgMul() { return (1 + (this.level - 1) * 0.12) * (1 + this.gearDmg); }
  get speed() { return this.def.speed * (1 + this.gearSpeed); }

  heal(n) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n);
    return this.hp - before;
  }

  gainXp(n, game) {
    if (this.dead || this.level >= 20) return;
    this.xp += n;
    while (this.xp >= this.xpNext && this.level < 20) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = companionXpNeeded(this.level);
      const gain = Math.round(this.def.hp * 0.12);
      this.maxHp += gain;
      this.hp = this.maxHp;
      game.fx.ring(this.x, this.y, 30, this.def.color, 24);
      game.fx.text(this.x, this.y - 40, `${this.def.name} LV ${this.level}`, this.def.color, 15);
      game.audio.blip(990, 0.16, 0.08, 'triangle');
    }
  }

  // Same signature as Player/Minion so enemy attack code needs no branching.
  takeHit(amount, game) {
    if (this.dead) return 'none';
    this.hp -= amount * (1 - U.clamp(this.gearDef, 0, 0.6));
    this.flash = 0.15;
    game.fx.spark(this.x, this.y, {
      count: 6, color: [this.def.color, '#ffffff'], speedMax: 150, lifeMax: 0.35, sizeMax: 3,
    });
    if (this.hp <= 0) this.fall(game);
    return 'hit';
  }

  fall(game) {
    this.dead = true;
    game.fx.spark(this.x, this.y, {
      count: 22, color: [this.def.color, this.def.dark], speedMax: 240, lifeMax: 0.8, sizeMax: 4,
    });
    game.fx.text(this.x, this.y - 28, `${this.def.name} falls`, '#8fa0b8', 15);
    game.toast(`${this.def.name} has fallen. A fountain would have helped.`, 4);
    game.returnCompanionGear(this);
  }

  // One hit from this companion, crediting it for the kill.
  strike(game, foe, dmg, knock = 220) {
    const crit = U.chance(0.06 + this.gearCrit);
    foe.lastHitBy = this;
    foe.takeDamage(dmg * (crit ? 1.7 : 1), game, this.x, this.y, knock, crit);
  }

  serialize() {
    return {
      kind: this.kind, hp: this.hp, level: this.level, xp: this.xp,
      equip: { ...this.equip },
    };
  }

  update(dt, game) {
    if (this.dead) return;
    const p = game.player;
    this.hitCd = Math.max(0, this.hitCd - dt);
    this.swapCd = Math.max(0, this.swapCd - dt);
    this.skillCd = Math.max(0, this.skillCd - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.swing = Math.max(0, this.swing - dt);
    this.clap = Math.max(0, this.clap - dt);
    this.bob += dt * 6;
    if (this.gearRegen > 0) this.heal(this.gearRegen * dt);

    if (this.flurry) { this.updateFlurry(dt, game); return; }
    if (this.punch) { this.updatePunch(dt, game); return; }

    // Only fight things near the player: a companion should never wander
    // off chasing something across the map.
    const nearP = U.dist(this.x, this.y, p.x, p.y) < Follow.LEASH;
    const foe = nearP ? game.enemyHash.nearest(this.x, this.y, 460,
      e => e.targetable && U.dist(e.x, e.y, p.x, p.y) < Follow.LEASH) : null;
    let ax = 0, ay = 0;

    // Switcher's party trick: yank a distant enemy into its place and take
    // that enemy's place in return. Pulls things off the player.
    if (this.def.swap && this.swapCd <= 0) {
      const far = game.enemyHash.nearest(this.x, this.y, this.def.swap.range,
        e => e.targetable && !e.isHeavyweight && U.dist(e.x, e.y, p.x, p.y) < 260);
      if (far) {
        this.swapCd = this.def.swap.cd;
        this.clap = 0.35;
        const sx = this.x, sy = this.y;
        game.fx.ring(sx, sy, 26, '#b58ad6', 22);
        game.fx.ring(far.x, far.y, 26, '#b58ad6', 22);
        this.x = far.x; this.y = far.y;
        far.x = sx; far.y = sy;
        far.vx = 0; far.vy = 0;
        far.stun = Math.max(far.stun, 0.5);
        game.fx.text(sx, sy - 26, 'CLAP', '#d8b8f5', 16);
        game.audio.blip(880, 0.12, 0.1, 'triangle');
        game.audio.blip(440, 0.14, 0.08, 'square');
      }
    }

    const support = this.def.skill && this.def.skill.support;
    if (support && this.skillCd <= 0) this.useSupport(game);
    else if (foe && this.skillCd <= 0) this.useSkill(game, foe);

    if (foe && this.def.ranged) {
      /* Shooters hold a distance and fire when they have a clear line. */
      const rg = this.def.ranged;
      const d = U.dist(this.x, this.y, foe.x, foe.y);
      const ang = U.angle(this.x, this.y, foe.x, foe.y);
      const want = rg.range * 0.6;
      const drift = d > rg.range * 0.85 ? 1 : d < want * 0.6 ? -1 : 0;
      ax = Math.cos(ang) * this.speed * drift;
      ay = Math.sin(ang) * this.speed * drift;
      if (d < rg.range && this.hitCd <= 0 && game.dungeon.lineOfSight(this.x, this.y, foe.x, foe.y)) {
        this.hitCd = rg.cd;
        this.shoot(game, ang, rg);
      }
    } else if (foe) {
      const d = U.dist(this.x, this.y, foe.x, foe.y);
      const ang = U.angle(this.x, this.y, foe.x, foe.y);
      ax = Math.cos(ang) * this.speed;
      ay = Math.sin(ang) * this.speed;
      if (d < this.def.reach + foe.radius && this.hitCd <= 0) {
        this.hitCd = this.def.hitCd;
        this.swing = 0.22;
        this.swingAngle = ang;
        this.strike(game, foe, this.def.damage * this.dmgMul);
        // The Ember Knight's blade sets things alight.
        if (this.def.burns && !foe.dead) {
          foe.burnT = this.def.burns.time;
          foe.burnDps = Math.max(foe.burnDps || 0, this.def.burns.dps + this.level);
        }
        game.audio.impact(false);
        game.fx.spark(this.x + Math.cos(ang) * this.radius, this.y + Math.sin(ang) * this.radius, {
          count: 7, color: [this.def.color, '#ffffff'], dir: ang, spread: 0.7,
          speedMax: 180, lifeMax: 0.3, sizeMax: 3,
        });
      }
    } else {
      // Nothing to fight: follow the trail back to the player.
      const v = Follow.step(this, game, this.speed, 90, dt);
      ax = v.x; ay = v.y;
    }

    this.vx = U.damp(this.vx, ax, 0.24, dt);
    this.vy = U.damp(this.vy, ay, 0.24, dt);
    moveWithCollision(this, this.vx * dt, this.vy * dt, game.dungeon);
  }

  // A companion's shot: credited to them, so the kill levels them up.
  shoot(game, ang, rg) {
    const burst = rg.burst || 1;
    for (let i = 0; i < burst; i++) {
      const a = ang + (i - (burst - 1) / 2) * 0.06;
      game.projectiles.push(new Projectile({
        x: this.x + Math.cos(a) * 14, y: this.y + Math.sin(a) * 14,
        vx: Math.cos(a) * rg.speed, vy: Math.sin(a) * rg.speed,
        damage: rg.damage * this.dmgMul, life: 1.1, radius: 4,
        color: rg.color, owner: 'player', knock: 60, creditTo: this,
      }));
    }
    this.swing = 0.12;
    this.swingAngle = ang;
    game.audio.gunshot();
  }

  /* Skills that look after you rather than hit anything. */
  useSupport(game) {
    const s = this.def.skill;
    const p = game.player;
    if (s.id === 'patchUp') {
      // Only worth it when someone is actually hurt.
      const hurt = p.hp < p.maxHp * 0.8 || game.companions.some(c => !c.dead && c.hp < c.maxHp * 0.7);
      if (!hurt || U.dist(this.x, this.y, p.x, p.y) > 420) return;
      const amt = 25 + this.level * 4;
      const h = p.heal(amt);
      if (h > 0) game.fx.text(p.x, p.y - 34, `+${Math.round(h)}`, '#6fbf73', 16);
      for (const c of game.companions) if (!c.dead) c.heal(amt);
      game.fx.ring(p.x, p.y, 28, '#ff6b6b', 22);
      game.fx.text(this.x, this.y - 34, 'PATCH UP', '#ffffff', 14);
      game.audio.blip(880, 0.12, 0.08, 'sine');
    } else if (s.id === 'mirrorWard') {
      if (p.ward > 0 || U.dist(this.x, this.y, p.x, p.y) > 460) return;
      p.ward = 1;
      game.fx.ring(p.x, p.y, 30, '#cfe8ff', 26);
      game.fx.text(this.x, this.y - 34, 'MIRROR WARD', '#cfe8ff', 14);
      game.audio.ward();
    }
    this.skillCd = s.cd;
  }

  /* ---------------- unique skills ---------------- */

  useSkill(game, foe) {
    const s = this.def.skill;
    if (!s) return;
    const lv = this.level;
    if (s.id === 'flurry') {
      if (U.dist(this.x, this.y, foe.x, foe.y) > this.def.reach + foe.radius + 30) return;
      this.flurry = { foe, hits: 0, t: 0 };
      game.fx.text(this.x, this.y - 34, s.name.toUpperCase(), this.def.color, 14);
    } else if (s.id === 'thunderclap') {
      if (U.dist(this.x, this.y, foe.x, foe.y) > 130) return;
      const r = 120;
      for (const e of game.enemyHash.query(this.x, this.y, r + 30, this._q)) {
        if (!e.targetable || U.dist(this.x, this.y, e.x, e.y) > r + e.radius) continue;
        this.strike(game, e, (25 + lv * 4) * (1 + this.gearDmg), 380);
        e.stun = Math.max(e.stun, 0.9);
      }
      this.clap = 0.5;
      game.fx.ring(this.x, this.y, r * 0.55, '#d8b8f5', 36);
      game.fx.text(this.x, this.y - 34, 'THUNDERCLAP', '#d8b8f5', 15);
      game.fx.addShake(6);
      game.audio.blip(660, 0.2, 0.14, 'square');
      game.audio.explode();
    } else if (s.id === 'flameWheel') {
      if (U.dist(this.x, this.y, foe.x, foe.y) > 140) return;
      const r = 115;
      for (const e of game.enemyHash.query(this.x, this.y, r + 30, this._q)) {
        if (!e.targetable || U.dist(this.x, this.y, e.x, e.y) > r + e.radius) continue;
        this.strike(game, e, (40 + lv * 5) * (1 + this.gearDmg), 300);
        e.burnT = 4; e.burnDps = Math.max(e.burnDps || 0, 12 + lv * 2);
      }
      this.clap = 0.5;
      game.fx.ring(this.x, this.y, r * 0.55, '#ff8a3c', 40);
      game.fx.spark(this.x, this.y, { count: 30, color: ['#ff8a3c', '#ffd479'], speedMax: 300, lifeMax: 0.6 });
      game.fx.text(this.x, this.y - 34, 'FLAME WHEEL', '#ffb347', 15);
      game.fx.addShake(6);
      game.audio.cast('fire', true);
    } else if (s.id === 'airstrike') {
      // Four shells around the target, a second and a half out.
      for (let i = 0; i < 4; i++) {
        const a = U.rand(0, Math.PI * 2), r = i === 0 ? 0 : U.rand(40, 120);
        game.impacts.push({
          x: foe.x + Math.cos(a) * r, y: foe.y + Math.sin(a) * r, t: 0, delay: 1.1 + i * 0.18,
          radius: 80, color: '#ffb347', style: 'shell', hostile: false,
          aoeDamage: (60 + lv * 8) * (1 + this.gearDmg),
        });
      }
      game.fx.text(this.x, this.y - 34, 'AIRSTRIKE INBOUND', '#ffd27a', 15);
      game.audio.missile();
    } else if (s.id === 'spacePunch') {
      const d = U.dist(this.x, this.y, foe.x, foe.y);
      if (d < 90 || d > 300 || !game.dungeon.lineOfSight(this.x, this.y, foe.x, foe.y)) return;
      this.punch = { foe, t: 0, angle: U.angle(this.x, this.y, foe.x, foe.y) };
      game.fx.text(this.x, this.y - 34, 'SPACE PUNCH', this.def.color, 15);
      game.audio.telegraph('blue');
    }
    this.skillCd = s.cd;
  }

  updateFlurry(dt, game) {
    const f = this.flurry;
    f.t += dt;
    this.vx *= 0.7; this.vy *= 0.7;
    if (f.foe.dead || f.hits >= 6) { this.flurry = null; return; }
    if (f.t < 0.08) return;
    f.t = 0;
    f.hits++;
    const ang = U.angle(this.x, this.y, f.foe.x, f.foe.y);
    this.swing = 0.12;
    this.swingAngle = ang + U.rand(-0.6, 0.6);
    this.strike(game, f.foe, this.def.damage * this.dmgMul * 0.55, 40);
    game.audio.impact(f.hits === 6);
    if (f.hits === 6) { game.fx.addShake(5); game.impactFreeze(0.04); }
  }

  updatePunch(dt, game) {
    const k = this.punch;
    k.t += dt;
    const sp = 900;
    this.vx = Math.cos(k.angle) * sp;
    this.vy = Math.sin(k.angle) * sp;
    moveWithCollision(this, this.vx * dt, this.vy * dt, game.dungeon);
    game.fx.spark(this.x, this.y, { count: 2, color: [this.def.color, '#ffffff'], speedMax: 40, lifeMax: 0.25 });
    const foe = k.foe;
    if (!foe.dead && U.dist(this.x, this.y, foe.x, foe.y) < this.radius + foe.radius + 6) {
      this.strike(game, foe, (70 + this.level * 8) * (1 + this.gearDmg), 900);
      foe.stun = Math.max(foe.stun, 1.0);
      game.fx.ring(this.x, this.y, 40, this.def.color, 28);
      game.fx.addShake(10);
      game.impactFreeze(0.06);
      game.audio.impact(true);
      this.punch = null;
      this.vx *= 0.1; this.vy *= 0.1;
      return;
    }
    if (k.t > 0.4) { this.punch = null; this.vx *= 0.2; this.vy *= 0.2; }
  }

  draw(ctx, time) {
    if (this.kind === 'johnspace') { this.drawJohn(ctx, time); return; }
    const y = this.y + Math.sin(this.bob) * 1.8;
    const r = this.radius;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.34)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + r * 0.85, r * 0.85, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    // Slash arc while striking.
    if (this.swing > 0 && this.swingAngle !== undefined) {
      const prog = 1 - this.swing / 0.22;
      ctx.globalAlpha = (1 - prog) * 0.6;
      ctx.strokeStyle = this.def.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(this.x, y, this.def.reach * 0.8,
        this.swingAngle - 0.7 + prog * 1.4, this.swingAngle - 0.3 + prog * 1.4);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const body = this.flash > 0 ? '#ffffff' : this.def.color;
    ctx.fillStyle = body;
    ctx.shadowBlur = 9;
    ctx.shadowColor = this.def.color;
    const w = r * 1.35, h = r * 1.85;
    ctx.fillRect(this.x - w / 2, y - h / 2, w, h);
    ctx.beginPath();
    ctx.arc(this.x, y - h / 2 - r * 0.42, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Bare hands, held out — the Disgraced One's whole gimmick.
    if (this.kind === 'disgraced') {
      ctx.fillStyle = '#e8dcc4';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(this.x + side * (w * 0.7), y - 1, r * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Switcher claps: the hands meet.
    if (this.kind === 'switcher') {
      const spread = this.clap > 0 ? 0.15 : 0.7;
      ctx.fillStyle = '#e8dcf5';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(this.x + side * (w * spread), y - 2, r * 0.26, 0, Math.PI * 2);
        ctx.fill();
      }
      if (this.clap > 0) {
        ctx.globalAlpha = Math.min(1, this.clap / 0.35);
        ctx.strokeStyle = '#d8b8f5';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(this.x, y, r * 2.2, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Update 4.0 companions wear what they are.
    const hx = this.x, top = y - h / 2;
    if (this.kind === 'medic') {
      ctx.fillStyle = '#d42a2a';
      ctx.fillRect(hx - 2, y - 7, 4, 12); ctx.fillRect(hx - 6, y - 3, 12, 4);   // red cross
      ctx.fillStyle = '#d42a2a';
      ctx.fillRect(hx - r * 0.55, top - r * 0.62, r * 1.1, r * 0.2);              // headband
    } else if (this.kind === 'sergeant') {
      ctx.fillStyle = '#4a5a2a';
      ctx.beginPath(); ctx.arc(hx, top - r * 0.5, r * 0.68, Math.PI, 0); ctx.fill();   // helmet
      const a = this.swingAngle || 0;
      ctx.save(); ctx.translate(hx, y); ctx.rotate(a);
      ctx.fillStyle = '#2a2a2e'; ctx.fillRect(4, -2, 20, 4); ctx.restore();       // rifle
    } else if (this.kind === 'emberknight') {
      ctx.fillStyle = '#3a2418';
      ctx.fillRect(hx - w / 2, y - h / 2, w, h * 0.32);                          // pauldrons
      const a = this.swingAngle || 0;
      ctx.save(); ctx.translate(hx, y); ctx.rotate(a);
      ctx.shadowBlur = 14; ctx.shadowColor = '#ff8a3c';
      ctx.fillStyle = '#ffb347'; ctx.fillRect(6, -2, 26, 4);                     // burning blade
      ctx.restore();
    } else if (this.kind === 'glasssaint') {
      ctx.globalAlpha = 0.5 + Math.sin(time * 3) * 0.2;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(hx, top - r * 0.42, r * 0.95, 0, Math.PI * 2); ctx.stroke();   // halo
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = 'rgba(20,16,24,.85)';
    ctx.fillRect(this.x - 3.6, y - h / 2 - r * 0.55, 2.3, 2.3);
    ctx.fillRect(this.x + 1.3, y - h / 2 - r * 0.55, 2.3, 2.3);

    // Health pip so you know when to find a fountain.
    if (this.hp < this.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(this.x - 15, y - h / 2 - 15, 30, 4);
      ctx.fillStyle = this.hp / this.maxHp < 0.35 ? '#e1553c' : this.def.color;
      ctx.fillRect(this.x - 15, y - h / 2 - 15, 30 * (this.hp / this.maxHp), 4);
    }
    ctx.fillStyle = 'rgba(232,226,212,.55)';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.def.name} · Lv ${this.level}`, this.x, y + h / 2 + 13);
    ctx.restore();
    void time;
  }

  /* Update 4.0: John Space looks like John Space on your side too — the same
     body he wears standing neutral in the deep, not a generic blue figure.
     His fists come up when he is fighting. */
  drawJohn(ctx, time) {
    const r = this.radius;
    const fighting = this.swing > 0 || !!this.punch;
    const face = this.punch ? this.punch.angle
      : this.swingAngle !== undefined && this.swing > 0 ? this.swingAngle
      : Math.hypot(this.vx, this.vy) > 12 ? Math.atan2(this.vy, this.vx) : (this._face || 0);
    this._face = face;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.34)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + r * 0.85, r * 0.85, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    const proxy = {
      type: 'johnspace', radius: r, def: { dark: this.def.dark, color: this.def.color },
      face, vx: this.vx, vy: this.vy, bob: this.bob, flash: this.flash,
      enraged: false, companion: true, fighting, atk: null, aggro: true,
    };
    Art.drawEnemy(ctx, proxy, this.x, this.y, time, this.flash > 0 ? '#ffffff' : this.def.color);
    if (this.hp < this.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(this.x - 15, this.y - r * 2.2, 30, 4);
      ctx.fillStyle = this.hp / this.maxHp < 0.35 ? '#e1553c' : this.def.color;
      ctx.fillRect(this.x - 15, this.y - r * 2.2, 30 * (this.hp / this.maxHp), 4);
    }
    ctx.fillStyle = 'rgba(232,226,212,.55)';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.def.name} · Lv ${this.level}`, this.x, this.y + r * 1.9);
    ctx.restore();
  }
}
