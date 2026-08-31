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
    name: 'Bloat', icon: '✹', color: '#c4e86b', dark: '#5c6b2a',
    hp: 26, speed: 160, radius: 11, damage: 30, radiusAoe: 92,
    life: 14, cost: 22, cooldown: 10,
    explodes: true,
    desc: 'Runs in and detonates for 30 damage in a wide circle.',
  },
  brute: {
    name: 'Bone Brute', icon: '▣', color: '#ddd6c0', dark: '#6b6455',
    hp: 200, speed: 88, radius: 17, damage: 22, hitCd: 1.1,
    life: Infinity, cost: 40, cooldown: 30,
    taunt: true,
    desc: 'A 200 HP wall that pulls attacks off you. One at a time.',
  },
  jarona: {
    name: 'Jarona', icon: '➤', color: '#ff9a6a', dark: '#7a3a1f',
    hp: 18, speed: 250, radius: 9, damage: 20,
    life: 9, cost: 18, cooldown: 5,
    kamikaze: true,
    desc: 'Hurls itself at the nearest enemy and is not seen again.',
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

  target(game) {
    return game.enemyHash.nearest(this.x, this.y, 620, e => !e.dead);
  }

  update(dt, game) {
    if (this.dead) return;
    this.life -= dt;
    this.hitCd = Math.max(0, this.hitCd - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.bob += dt * 7;
    if (this.life <= 0) { this.expire(game, true); return; }

    const t = this.target(game);
    let ax = 0, ay = 0;

    if (t) {
      const d = U.dist(this.x, this.y, t.x, t.y);
      const ang = U.angle(this.x, this.y, t.x, t.y);
      ax = Math.cos(ang) * this.def.speed;
      ay = Math.sin(ang) * this.def.speed;

      const touching = d < this.radius + t.radius + 3;
      if (touching) {
        if (this.def.explodes) { this.detonate(game); return; }
        if (this.def.kamikaze) { this.jarona(game, t); return; }
        if (this.hitCd <= 0) {
          this.hitCd = this.def.hitCd;
          t.takeDamage(this.def.damage * (this.owner ? this.owner.minionPower : 1), game, this.x, this.y, 90, false);
          game.audio.impact(false);
        }
      }
    } else {
      // Nothing to kill: heel, and stay out from underfoot.
      const p = game.player;
      const d = U.dist(this.x, this.y, p.x, p.y);
      if (d > 80) {
        const ang = U.angle(this.x, this.y, p.x, p.y);
        ax = Math.cos(ang) * this.def.speed * 0.8;
        ay = Math.sin(ang) * this.def.speed * 0.8;
      }
    }

    this.vx = U.damp(this.vx, ax, 0.24, dt);
    this.vy = U.damp(this.vy, ay, 0.24, dt);
    moveWithCollision(this, this.vx * dt, this.vy * dt, game.dungeon);
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
      if (e.dead || U.dist(this.x, this.y, e.x, e.y) > r) continue;
      e.takeDamage(this.def.damage * (this.owner ? this.owner.minionPower : 1), game, this.x, this.y, 300, false);
    }
  }

  jarona(game, t) {
    this.dead = true;
    game.fx.text(this.x, this.y - 22, 'JARONA!', '#ff9a6a', 19);
    game.fx.spark(this.x, this.y, {
      count: 20, color: ['#ff9a6a', '#ffffff'], speedMax: 260, lifeMax: 0.55, sizeMax: 4,
    });
    game.fx.addShake(4);
    game.audio.jarona();
    t.takeDamage(this.def.damage * (this.owner ? this.owner.minionPower : 1), game, this.x, this.y, 380, false);
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
    ctx.shadowBlur = 10;
    ctx.shadowColor = this.def.color;

    const w = this.radius * 1.4, h = this.radius * 1.8;
    ctx.fillRect(this.x - w / 2, y - h / 2, w, h);
    ctx.beginPath();
    ctx.arc(this.x, y - h / 2 - this.radius * 0.4, this.radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(20,16,24,.85)';
    ctx.fillRect(this.x - 3.5, y - h / 2 - this.radius * 0.55, 2.2, 2.2);
    ctx.fillRect(this.x + 1.3, y - h / 2 - this.radius * 0.55, 2.2, 2.2);

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

    this.tick -= dt;
    const doTick = this.tick <= 0;
    if (doTick) this.tick = this.tickEvery;

    // Enemy-made puddles burn the player instead. Standing in one is a choice,
    // so it does not go through parry — only leaving does.
    if (this.hostile) {
      const p = game.player;
      if (doTick && !p.dead && U.dist(this.x, this.y, p.x, p.y) < this.radius) {
        p.takeDamage(this.damage, game, this.x, this.y);
      }
      return;
    }

    for (const e of game.enemyHash.query(this.x, this.y, this.radius, this._q)) {
      if (e.dead || U.dist(this.x, this.y, e.x, e.y) > this.radius) continue;
      if (this.kind === 'vine') {
        // Rooting is for ordinary foes. Elites (your "giants") and bosses
        // shrug it off — they only take the damage.
        if (!e.elite && !e.def.boss) e.root = Math.max(e.root, 0.4);
      }
      if (doTick) e.takeDamage(this.damage * this.power, game, this.x, this.y, 0, false);
    }
  }

  updatePlant(dt, game) {
    this.shotCd -= dt;
    if (this.shotCd > 0) return;
    const t = game.enemyHash.nearest(this.x, this.y, 340, e => !e.dead);
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

    } else if (this.kind === 'goo') {
      const a = U.clamp(this.life / this.maxLife, 0, 1);
      ctx.globalAlpha = 0.28 + a * 0.3;
      ctx.fillStyle = this.hostile ? '#9cb83a' : '#8fd14a';
      ctx.shadowBlur = 18; ctx.shadowColor = this.hostile ? '#c4e86b' : '#a8e063';
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
