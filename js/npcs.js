/* NPC companions — Update 2.0.

   Two are found locked in cages and freed with `E`. The third, John Space,
   is not caged: he stands in the deep regions doing nothing at all, and what
   he becomes is entirely up to you.

   Companions are persistent — unlike Necromancer minions they have no expiry
   timer. They can be hurt, and drinking from a fountain heals every companion
   with you, so the fountains are worth saving rather than sipping on sight. */
'use strict';

const COMPANIONS = {
  disgraced: {
    id: 'disgraced',
    name: 'The Disgraced One',
    hp: 200, speed: 142, radius: 13,
    damage: 22, hitCd: 0.85, reach: 52, arc: 1.7,
    color: '#c8a86a', dark: '#5c4426',
    blurb: 'Barehanded, and no longer interested in explaining himself.',
  },
  switcher: {
    id: 'switcher',
    name: 'Switcher',
    hp: 150, speed: 152, radius: 12,
    damage: 9, hitCd: 1.1, reach: 44, arc: 1.6,
    color: '#b58ad6', dark: '#4a2f61',
    swap: { cd: 4.2, range: 320 },
    blurb: 'Claps once, and something ends up somewhere it did not expect.',
  },
  johnspace: {
    id: 'johnspace',
    name: 'John Space',
    hp: 500, speed: 158, radius: 14,
    damage: 26, hitCd: 0.8, reach: 56, arc: 1.8,
    color: '#8fd4ff', dark: '#2b3c66',
    blurb: 'You left him alone. He appreciated that.',
  },
};

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
    this.flash = 0;
    this.swing = 0;          // slash animation timer
    this.clap = 0;           // Switcher's clap animation
    this.bob = U.rand(0, 10);
    this.dead = false;
    this.taunt = true;       // companions pull attacks, that's the point
    this._q = [];
  }

  heal(n) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n);
    return this.hp - before;
  }

  // Same signature as Player/Minion so enemy attack code needs no branching.
  takeHit(amount, game) {
    if (this.dead) return 'none';
    this.hp -= amount;
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
  }

  update(dt, game) {
    if (this.dead) return;
    const p = game.player;
    this.hitCd = Math.max(0, this.hitCd - dt);
    this.swapCd = Math.max(0, this.swapCd - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.swing = Math.max(0, this.swing - dt);
    this.clap = Math.max(0, this.clap - dt);
    this.bob += dt * 6;

    const foe = game.enemyHash.nearest(this.x, this.y, 520, e => !e.dead);
    let ax = 0, ay = 0;

    // Switcher's party trick: yank a distant enemy into its place and take
    // that enemy's place in return. Pulls things off the player.
    if (this.def.swap && this.swapCd <= 0) {
      const far = game.enemyHash.nearest(this.x, this.y, this.def.swap.range,
        e => !e.dead && !e.def.boss && U.dist(e.x, e.y, p.x, p.y) < 260);
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

    if (foe) {
      const d = U.dist(this.x, this.y, foe.x, foe.y);
      const ang = U.angle(this.x, this.y, foe.x, foe.y);
      // Hang back a little if the player has wandered far off.
      const leash = U.dist(this.x, this.y, p.x, p.y) > 560;
      if (leash) {
        const pa = U.angle(this.x, this.y, p.x, p.y);
        ax = Math.cos(pa) * this.def.speed;
        ay = Math.sin(pa) * this.def.speed;
      } else {
        ax = Math.cos(ang) * this.def.speed;
        ay = Math.sin(ang) * this.def.speed;
        if (d < this.def.reach + foe.radius && this.hitCd <= 0) {
          this.hitCd = this.def.hitCd;
          this.swing = 0.22;
          this.swingAngle = ang;
          foe.takeDamage(this.def.damage, game, this.x, this.y, 220, false);
          game.audio.impact(false);
          game.fx.spark(this.x + Math.cos(ang) * this.radius, this.y + Math.sin(ang) * this.radius, {
            count: 7, color: [this.def.color, '#ffffff'], dir: ang, spread: 0.7,
            speedMax: 180, lifeMax: 0.3, sizeMax: 3,
          });
        }
      }
    } else {
      // Nothing to fight: heel.
      const d = U.dist(this.x, this.y, p.x, p.y);
      if (d > 90) {
        const pa = U.angle(this.x, this.y, p.x, p.y);
        ax = Math.cos(pa) * this.def.speed * 0.85;
        ay = Math.sin(pa) * this.def.speed * 0.85;
      }
    }

    this.vx = U.damp(this.vx, ax, 0.24, dt);
    this.vy = U.damp(this.vy, ay, 0.24, dt);
    moveWithCollision(this, this.vx * dt, this.vy * dt, game.dungeon);
  }

  draw(ctx, time) {
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
        ctx.globalAlpha = this.clap / 0.35;
        ctx.strokeStyle = '#d8b8f5';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(this.x, y, r * 2.2, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
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
    ctx.fillText(this.def.name, this.x, y + h / 2 + 13);
    ctx.restore();
    void time;
  }
}
