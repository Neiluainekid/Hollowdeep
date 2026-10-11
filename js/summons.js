/* Things the caster classes leave behind them: Necromancer minions and the
   Mage's persistent ground effects. Both are simple actors with their own
   update/draw, kept in their own arrays on the game. */
'use strict';

/* ================================================================= */
/* MINIONS — Necromancer                                             */
/* ================================================================= */

const MINION_TYPES = {
  thrall: {
    name: 'Thrall', icon: '☠', color: '#cfe3c0', dark: '#5c6b52',
    hp: 40, speed: 132, radius: 9, damage: 10, hitCd: 0.85,
    life: 15, cost: 14, cooldown: 2,
    desc: 'The reliable one. Fades after 15 seconds.',
  },
  bomber: {
    // Update 3.0: a 10x10-tile blast — paid for with all your mana for 5s
    // and your health held at 65% for 5s (see Player.summonMinion).
    name: 'Bloat', icon: '✹', color: '#c4e86b', dark: '#5c6b2a',
    hp: 26, speed: 160, radius: 11, damage: 40, radiusAoe: TILE * 5,
    life: 14, cost: 22, cooldown: 10,
    explodes: true,
    desc: 'Detonates for 40 across a 10×10 area. Costs all your mana and holds you at 65% health for 5s.',
  },
  brute: {
    name: 'Bone Brute', icon: '▣', color: '#ddd6c0', dark: '#6b6455',
    hp: 200, speed: 88, radius: 17, damage: 22, hitCd: 1.1,
    life: Infinity, cost: 40, cooldown: 30,
    taunt: true,
    // Update 3.0: a Stone Brute's bash — a wound-up ground strike for 100.
    bash: { damage: 100, radius: 84, wind: 0.55, cd: 6 },
    desc: 'A 200 HP wall that pulls attacks off you and bashes for 100. One at a time.',
  },
  jarona: {
    // Update 2.0: no longer a one-shot kamikaze. Jarona ricochets through up
    // to three targets shouting all the way, and is outlined in blue so the
    // combo reads at a glance.
    name: 'Jarona', icon: '➤', color: '#ff9a6a', dark: '#7a3a1f',
    hp: 18, speed: 300, radius: 9, damage: 20,
    life: 12, cost: 18, cooldown: 2,
    bounceCombo: 3,
    outline: '#8fd4ff',
    desc: 'Bounces through three enemies in one shouted combo. With the Jarona Necklace: super dashes for 100–200 each.',
  },
};

class Minion {
  constructor(kind, x, y, owner) {
    const t = MINION_TYPES[kind];
    this.kind = kind;
    this.def = t;
    this.owner = owner;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.radius = t.radius;
    this.maxHp = t.hp;
    this.hp = t.hp;
    this.life = t.life;
    this.hitCd = 0;
    this.flash = 0;
    this.bob = U.rand(0, 10);
    this.dead = false;
    this.taunt = !!t.taunt;
    this._q = [];
  }

  takeHit(amount, game) {
    this.hp -= amount;
    this.flash = 0.14;
    game.fx.spark(this.x, this.y, {
      count: 5, color: [this.def.color, '#ffffff'], speedMax: 140, lifeMax: 0.3, sizeMax: 3,
    });
    if (this.hp <= 0) this.expire(game, false);
    return 'hit';
  }

  /* Only fights near the player: anything further than the leash from them
     is ignored, so minions no longer chase a target off into the dark. */
  target(game) {
    const p = game.player;
    if (U.dist(this.x, this.y, p.x, p.y) > Follow.LEASH) return null;
    return game.enemyHash.nearest(this.x, this.y, 620,
      e => e.targetable && U.dist(e.x, e.y, p.x, p.y) < Follow.LEASH);
  }

  update(dt, game) {
    if (this.dead) return;
    this.life -= dt;
    this.hitCd = Math.max(0, this.hitCd - dt);
    this.comboCd = Math.max(0, (this.comboCd || 0) - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.bob += dt * 7;
    if (this.life <= 0) { this.expire(game, true); return; }

    if (this.bashing) { this.updateBash(dt, game); return; }

    const t = this.target(game);
    let ax = 0, ay = 0;

    // The Brute's bash: wind up when something is in reach, then slam.
    if (this.def.bash && t) {
      this.bashCd = Math.max(0, (this.bashCd ?? 2) - dt);
      if (this.bashCd <= 0 && U.dist(this.x, this.y, t.x, t.y) < this.def.bash.radius + t.radius) {
        this.bashing = { t: 0 };
        game.audio.telegraph('red');
        return;
      }
    }

    if (t) {
      const d = U.dist(this.x, this.y, t.x, t.y);
      const ang = U.angle(this.x, this.y, t.x, t.y);
      ax = Math.cos(ang) * this.def.speed;
      ay = Math.sin(ang) * this.def.speed;

      const touching = d < this.radius + t.radius + 3;
      if (touching) {
        if (this.def.explodes) { this.detonate(game); return; }
        else if (this.def.bounceCombo) {
          if (this.comboCd <= 0) this.bounce(game, t);
        } else if (this.hitCd <= 0) {
          this.hitCd = this.def.hitCd;
          t.takeDamage(this.def.damage * (this.owner ? this.owner.minionPower : 1), game, this.x, this.y, 90, false);
          game.audio.impact(false);
        }
      }
    } else {
      // Nothing to kill: follow the player's trail home.
      const v = Follow.step(this, game, Math.max(this.def.speed, 150), 80, dt);
      ax = v.x; ay = v.y;
    }

    // Jarona mid-ricochet keeps its launch velocity rather than steering.
    if (this.dashT > 0) {
      this.dashT -= dt;
      moveWithCollision(this, this.vx * dt, this.vy * dt, game.dungeon);
      if (Math.random() < dt * 60) {
        game.fx.particles.push({
          x: this.x, y: this.y, vx: 0, vy: 0, life: 0.25, maxLife: 0.25,
          size: 5, color: this.def.outline, drag: 0.9, gravity: 0, glow: true,
        });
      }
      return;
    }

    this.vx = U.damp(this.vx, ax, 0.24, dt);
    this.vy = U.damp(this.vy, ay, 0.24, dt);
    moveWithCollision(this, this.vx * dt, this.vy * dt, game.dungeon);
  }

  updateBash(dt, game) {
    const b = this.def.bash;
    this.bashing.t += dt;
    this.vx *= 0.8; this.vy *= 0.8;
    if (this.bashing.t < b.wind) return;
    this.bashing = null;
    this.bashCd = b.cd;
    const power = this.owner ? this.owner.minionPower : 1;
    for (const e of game.enemyHash.query(this.x, this.y, b.radius + 40, this._q)) {
      if (!e.targetable || U.dist(this.x, this.y, e.x, e.y) > b.radius + e.radius) continue;
      e.takeDamage(b.damage * power, game, this.x, this.y, 420, false);
      e.stun = Math.max(e.stun, 0.8);
    }
    game.fx.ring(this.x, this.y, b.radius * 0.6, '#ddd6c0', 34);
    game.fx.spark(this.x, this.y, { count: 26, color: ['#ddd6c0', '#ffffff', '#6b6455'], speedMax: 300, lifeMax: 0.6, sizeMax: 5 });
    game.fx.text(this.x, this.y - 30, 'BASH', '#ddd6c0', 16);
    game.fx.addShake(9);
    game.impactFreeze(0.05);
    game.audio.impact(true);
  }

  detonate(game) {
    this.dead = true;
    const r = this.def.radiusAoe;
    game.fx.ring(this.x, this.y, r * 0.55, '#c4e86b', 34);
    game.fx.spark(this.x, this.y, {
      count: 34, color: ['#c4e86b', '#ffffff', '#6b8a2a'], speedMax: 340, lifeMax: 0.7, sizeMax: 5,
    });
    game.fx.addShake(7);
    game.audio.explode();
    for (const e of game.enemyHash.query(this.x, this.y, r, this._q)) {
      if (!e.targetable || U.dist(this.x, this.y, e.x, e.y) > r) continue;
      e.takeDamage(this.def.damage * (this.owner ? this.owner.minionPower : 1), game, this.x, this.y, 300, false);
    }
  }

  /* Three-hit bounce combo: strike, ricochet off to the next target, and
     expire on the third. Each landing hits harder than the last. */
  bounce(game, t) {
    this.hits = (this.hits || 0) + 1;
    const power = this.owner ? this.owner.minionPower : 1;
    // The Jarona Necklace turns every bounce into a 100-200 super dash.
    const necklace = !!(this.owner && this.owner.jaronaNecklace);
    const dmg = necklace ? U.randi(100, 201) * power
      : this.def.damage * power * (1 + (this.hits - 1) * 0.25);

    t.takeDamage(dmg, game, this.x, this.y, 300, this.hits >= this.def.bounceCombo);
    game.fx.text(this.x, this.y - 22, this.hits >= this.def.bounceCombo ? 'JARONA!' : `JAR-${this.hits}`,
      this.hits >= this.def.bounceCombo ? '#ff9a6a' : '#8fd4ff', this.hits >= this.def.bounceCombo ? 19 : 14);
    game.fx.ring(this.x, this.y, 16, this.def.outline, 12);
    game.fx.spark(this.x, this.y, {
      count: 12, color: [this.def.outline, '#ffffff'], speedMax: 220, lifeMax: 0.4, sizeMax: 3.5,
    });
    game.audio.jaronaHit(this.hits, this.hits >= this.def.bounceCombo);

    if (this.hits >= this.def.bounceCombo) {
      game.fx.addShake(5);
      game.impactFreeze(0.05);
      this.dead = true;
      return;
    }
    // Kick off toward the next victim so the ricochet is visible.
    this.comboCd = 0.22;
    const next = game.enemyHash.nearest(this.x, this.y, necklace ? 520 : 380, o => o.targetable && o !== t);
    const a = next ? U.angle(this.x, this.y, next.x, next.y) : U.rand(0, Math.PI * 2);
    const sp = necklace ? 980 : 420;
    this.vx = Math.cos(a) * sp;
    this.vy = Math.sin(a) * sp;
    this.x += Math.cos(a) * 6;
    this.y += Math.sin(a) * 6;
    if (necklace) {
      this.dashT = 0.32;
      this.comboCd = 0.12;
      game.fx.text(this.x, this.y - 32, 'SUPER DASH', '#8fd4ff', 13);
    }
  }

  expire(game, natural) {
    this.dead = true;
    game.fx.spark(this.x, this.y, {
      count: natural ? 10 : 16, color: [this.def.color, this.def.dark],
      speedMax: natural ? 90 : 200, lifeMax: 0.5, sizeMax: 3,
    });
  }

  draw(ctx) {
    const y = this.y + Math.sin(this.bob) * 2;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.32)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + this.radius * 0.8, this.radius * 0.8, this.radius * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Fading minions thin out as their time runs down.
    const fading = this.def.life !== Infinity && this.life < 3;
    ctx.globalAlpha = fading ? 0.35 + Math.abs(Math.sin(this.life * 8)) * 0.5 : 1;
    ctx.fillStyle = this.flash > 0 ? '#ffffff' : this.def.color;
    ctx.shadowBlur = this.def.outline ? 16 : 10;
    ctx.shadowColor = this.def.outline || this.def.color;

    const w = this.radius * 1.4, h = this.radius * 1.8;
    ctx.fillRect(this.x - w / 2, y - h / 2, w, h);
    ctx.beginPath();
    ctx.arc(this.x, y - h / 2 - this.radius * 0.4, this.radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(20,16,24,.85)';
    ctx.fillRect(this.x - 3.5, y - h / 2 - this.radius * 0.55, 2.2, 2.2);
    ctx.fillRect(this.x + 1.3, y - h / 2 - this.radius * 0.55, 2.2, 2.2);

    // The Brute's bash wind-up: a closing ring, same language as enemies.
    if (this.bashing) {
      const k = U.clamp(this.bashing.t / this.def.bash.wind, 0, 1);
      ctx.globalAlpha = 0.4 + k * 0.5;
      ctx.strokeStyle = '#ddd6c0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, this.y, U.lerp(this.def.bash.radius, this.radius * 1.2, k), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Combo minions wear a hard blue outline so the bounce reads mid-fight.
    if (this.def.outline) {
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = this.def.outline;
      ctx.lineWidth = 2;
      ctx.strokeRect(this.x - w / 2 - 1.5, y - h / 2 - 1.5, w + 3, h + 3);
      ctx.fillStyle = this.def.outline;
      ctx.font = '700 9px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`${(this.hits || 0)}/${this.def.bounceCombo}`, this.x, y - h / 2 - 8);
    }

    if (this.maxHp > 60 && this.hp < this.maxHp) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(this.x - 14, y - h / 2 - 15, 28, 3.5);
      ctx.fillStyle = this.def.color;
      ctx.fillRect(this.x - 14, y - h / 2 - 15, 28 * (this.hp / this.maxHp), 3.5);
    }
    ctx.restore();
  }
}

/* ================================================================= */
/* ZONES — Mage ground effects                                       */
/* ================================================================= */

class Zone {
  constructor(kind, x, y, opts = {}) {
    Object.assign(this, {
      kind, x, y, radius: 60, life: 5, maxLife: 5,
      tick: 0, tickEvery: 2, damage: 5, power: 1, dead: false,
    }, opts);
    this.maxLife = this.life;
    this.age = 0;
    this._q = [];
    this.shotCd = 1;
  }

  update(dt, game) {
    this.life -= dt;
    this.age += dt;
    if (this.life <= 0) { this.onEnd(game); this.dead = true; return; }

    if (this.kind === 'plant') { this.updatePlant(dt, game); return; }

    if (this.kind === 'tornado') this.steerTornado(dt, game);

    this.tick -= dt;
    const doTick = this.tick <= 0;
    if (doTick) this.tick = this.tickEvery;
    if (doTick && this.kind === 'quake') {
      game.fx.addShake(10);
      game.fx.ring(this.x, this.y, this.radius * 0.5, '#c8a86a', 30);
      game.audio.explode();
    }

    // Enemy-made puddles burn the player instead. Standing in one is a choice,
    // so it does not go through parry — only leaving does.
    if (this.hostile) {
      const p = game.player;
      if (doTick && !p.dead && U.dist(this.x, this.y, p.x, p.y) < this.radius) {
        p.takeDamage(this.damage, game, this.x, this.y);
      }
      return;
    }

    for (const e of game.enemyHash.query(this.x, this.y, this.radius + 40, this._q)) {
      if (e.dead || U.dist(this.x, this.y, e.x, e.y) > this.radius + (this.kind === 'tornado' ? e.radius : 0)) continue;
      if (this.kind === 'tornado') {
        // Caught in the funnel: dragged round with it.
        const a = U.angle(e.x, e.y, this.x, this.y) + 1.2;
        if (!e.def.boss) { e.vx += Math.cos(a) * 260 * dt; e.vy += Math.sin(a) * 260 * dt; }
      }
      if (this.kind === 'vine') {
        // Rooting is for ordinary foes. Elites (your "giants") and bosses
        // shrug it off — they only take the damage.
        if (!e.elite && !e.def.boss) e.root = Math.max(e.root, 0.4);
      }
      if (doTick) e.takeDamage(this.damage * this.power, game, this.x, this.y, 0, false);
    }
  }

  // The tornado drifts toward the nearest enemy, wobbling as it spins.
  steerTornado(dt, game) {
    this.spin = (this.spin || 0) + dt * 9;
    // Roam: prefer whoever it has not swept through in the last moment, so
    // it spins from body to body instead of parking on one.
    const touched = this.touched || (this.touched = new Map());
    for (const e of game.enemyHash.query(this.x, this.y, this.radius + 30, [])) {
      if (!e.dead && U.dist(this.x, this.y, e.x, e.y) < this.radius + e.radius) touched.set(e, this.age);
    }
    const fresh = e => !e.dead && (!touched.has(e) || this.age - touched.get(e) > 1.4);
    const t = game.enemyHash.nearest(this.x, this.y, 420, fresh)
      || game.enemyHash.nearest(this.x, this.y, 420, e => !e.dead);
    const want = t ? U.angle(this.x, this.y, t.x, t.y) : this.spin * 0.3;
    const a = want + Math.sin(this.spin * 0.5) * 0.6;
    const sp = 150;
    this.vx = U.damp(this.vx || 0, Math.cos(a) * sp, 0.12, dt);
    this.vy = U.damp(this.vy || 0, Math.sin(a) * sp, 0.12, dt);
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    if (!game.dungeon.isSolidAt(nx, this.y)) this.x = nx; else this.vx = -this.vx;
    if (!game.dungeon.isSolidAt(this.x, ny)) this.y = ny; else this.vy = -this.vy;
  }

  updatePlant(dt, game) {
    this.shotCd -= dt;
    if (this.shotCd > 0) return;
    const t = game.enemyHash.nearest(this.x, this.y, 340, e => e.targetable);
    if (!t) return;
    this.shotCd = 0.85;
    const a = U.angle(this.x, this.y, t.x, t.y);
    game.projectiles.push(new Projectile({
      x: this.x, y: this.y,
      vx: Math.cos(a) * 420, vy: Math.sin(a) * 420,
      damage: 9 * this.power, life: 1.4, radius: 5,
      color: '#a8e063', owner: 'player', knock: 60,
    }));
  }

  onEnd(game) {
    if (this.kind !== 'plant') return;
    // The plant's whole point: it dies loudly and leaves the ground hostile.
    game.fx.ring(this.x, this.y, 60, '#a8e063', 30);
    game.fx.spark(this.x, this.y, {
      count: 30, color: ['#a8e063', '#5c8a2a', '#d6f5a0'], speedMax: 260, lifeMax: 0.8, sizeMax: 5,
    });
    game.audio.explode();
    game.zones.push(new Zone('goo', this.x, this.y, {
      radius: 96, life: 9, tickEvery: 0.6, damage: 6, power: this.power,
    }));
  }

  draw(ctx, time) {
    ctx.save();
    if (this.kind === 'vine') {
      const a = U.clamp(this.life / this.maxLife, 0, 1);
      ctx.globalAlpha = 0.35 + a * 0.25;
      ctx.strokeStyle = '#5f8f3a';
      ctx.lineWidth = 3;
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2 + Math.sin(time * 1.5 + i) * 0.2;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.quadraticCurveTo(
          this.x + Math.cos(ang) * this.radius * 0.6, this.y + Math.sin(ang) * this.radius * 0.35,
          this.x + Math.cos(ang) * this.radius, this.y + Math.sin(ang) * this.radius * 0.62);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.16 * a;
      ctx.fillStyle = '#4c7a2c';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.radius, this.radius * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();

    } else if (this.kind === 'quake') {
      const a = U.clamp(this.life / this.maxLife, 0, 1);
      const jolt = Math.sin(time * 40) * 2;
      ctx.globalAlpha = 0.12 + a * 0.12;
      ctx.fillStyle = '#8a6a42';
      ctx.beginPath();
      ctx.ellipse(this.x + jolt, this.y, this.radius, this.radius * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5 * a + 0.2;
      ctx.strokeStyle = '#3a2a18';
      ctx.lineWidth = 3;
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2 + i * 0.4;
        ctx.beginPath();
        ctx.moveTo(this.x + jolt, this.y);
        ctx.lineTo(this.x + Math.cos(ang) * this.radius * 0.5 + jolt, this.y + Math.sin(ang) * this.radius * 0.35);
        ctx.lineTo(this.x + Math.cos(ang + 0.2) * this.radius * 0.95 + jolt, this.y + Math.sin(ang + 0.2) * this.radius * 0.66);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#d8b878';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.radius, this.radius * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();

    } else if (this.kind === 'tornado') {
      const a = U.clamp(this.life / 0.6, 0, 1);
      const spin = this.spin || 0;
      ctx.globalAlpha = 0.18 * a;
      ctx.fillStyle = '#cfe4ff';
      ctx.beginPath(); ctx.ellipse(this.x, this.y + 8, this.radius, this.radius * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e6f0ff';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 6; i++) {
        const h = i * 11;
        const w = this.radius * (0.35 + i * 0.16);
        ctx.globalAlpha = (0.55 - i * 0.05) * a;
        ctx.beginPath();
        ctx.ellipse(this.x + Math.sin(spin + i) * 4, this.y - h, w, w * 0.32, 0, spin + i, spin + i + Math.PI * 1.4);
        ctx.stroke();
      }

    } else if (this.kind === 'goo') {
      const a = U.clamp(this.life / this.maxLife, 0, 1);
      const spore = this.tint === 'spore';
      ctx.globalAlpha = 0.28 + a * 0.3;
      ctx.fillStyle = spore ? '#a35a8f' : this.hostile ? '#9cb83a' : '#8fd14a';
      ctx.shadowBlur = 18; ctx.shadowColor = spore ? '#c86fae' : this.hostile ? '#c4e86b' : '#a8e063';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.radius, this.radius * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.2 * a;
      ctx.fillStyle = '#d6f5a0';
      for (let i = 0; i < 4; i++) {
        const ang = time * 0.6 + i * 1.7;
        ctx.beginPath();
        ctx.ellipse(this.x + Math.cos(ang) * this.radius * 0.4, this.y + Math.sin(ang) * this.radius * 0.24,
          this.radius * 0.22, this.radius * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
      }

    } else if (this.kind === 'plant') {
      const sway = Math.sin(time * 2.2) * 0.14;
      const nearEnd = this.life < 5;
      ctx.translate(this.x, this.y);
      ctx.fillStyle = 'rgba(0,0,0,.34)';
      ctx.beginPath(); ctx.ellipse(0, 12, 16, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(sway);
      ctx.strokeStyle = '#4c7a2c';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(0, -14); ctx.stroke();
      ctx.fillStyle = nearEnd && Math.floor(time * 8) % 2 ? '#ffffff' : '#8fd14a';
      ctx.shadowBlur = 14; ctx.shadowColor = '#a8e063';
      ctx.beginPath(); ctx.arc(0, -20, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2c4a18';
      ctx.beginPath(); ctx.arc(0, -20, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
