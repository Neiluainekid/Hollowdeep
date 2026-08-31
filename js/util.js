/* Small math / rng / effect helpers shared by every other module. */
'use strict';

const U = {
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  // Frame-rate independent exponential approach. `rate` = fraction closed per second.
  damp(a, b, rate, dt) { return U.lerp(a, b, 1 - Math.pow(1 - rate, dt * 60)); },
  dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); },
  dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; },
  angle(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); },

  // Shortest signed difference between two angles, in (-PI, PI].
  angleDiff(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  },

  rand(a = 1, b) { return b === undefined ? Math.random() * a : a + Math.random() * (b - a); },
  randi(a, b) { return Math.floor(U.rand(a, b)); },
  pick(arr) { return arr[(Math.random() * arr.length) | 0]; },
  chance(p) { return Math.random() < p; },

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  // Deterministic PRNG so a seed always rebuilds the same dungeon.
  rng(seed) {
    let s = seed >>> 0;
    const f = () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = (a, b) => Math.floor(a + f() * (b - a));
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.chance = (p) => f() < p;
    return f;
  },

  hashSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  },

  // Stable per-tile noise, used to dapple floors without storing anything.
  tileNoise(x, y) {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return (h ^ (h >>> 16)) / 4294967296;
  },

  roman(n) {
    const map = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let out = '';
    for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
    return out || 'I';
  },
};

/* ------------------------------------------------------------------ */
/* 1-based sequence helpers (Update 2.0 architectural rule).           */
/*                                                                     */
/* Every authored sequence — save slots, UI slots, loadout slots, map  */
/* numbers, shrine ids, boss table entries — counts from 1. These are  */
/* the only places the +1/-1 lives, so the convention is greppable     */
/* instead of smeared through the codebase as bare arithmetic.         */
/*                                                                     */
/* Raw storage arrays stay dense and 0-based underneath; `Seq` is the  */
/* adapter between the two. Engine buffers addressed by hardware/DOM   */
/* contracts (tile grid, spatial buckets, typed arrays, pixel data)    */
/* are exempt — renumbering those is an off-by-one, not a convention.  */
/* ------------------------------------------------------------------ */

const ONE_BASED = 1;

const Seq = {
  FIRST: ONE_BASED,

  // [1, 2, ... count]
  range(first, count) {
    const out = [];
    for (let n = first; n < first + count; n++) out.push(n);
    return out;
  },

  // 1-based number -> dense array index
  toIndex(n) { return n - ONE_BASED; },
  // dense array index -> 1-based number
  toNumber(i) { return i + ONE_BASED; },

  // Read/write a dense array with a 1-based number.
  get(arr, n) { return arr[n - ONE_BASED]; },
  set(arr, n, v) { arr[n - ONE_BASED] = v; return v; },

  // Iterate a dense array yielding (value, 1-basedNumber).
  each(arr, fn) { arr.forEach((v, i) => fn(v, i + ONE_BASED)); },
  map(arr, fn) { return arr.map((v, i) => fn(v, i + ONE_BASED)); },

  // Clamp a 1-based number to a dense array's valid range.
  clampTo(arr, n) { return U.clamp(n, ONE_BASED, arr.length - 1 + ONE_BASED); },

  // Wrap a 1-based number around a dense array (for cycling loadout slots).
  wrapTo(arr, n) {
    const len = arr.length;
    return ((n - ONE_BASED) % len + len) % len + ONE_BASED;
  },

  count(arr) { return arr.length; },
  last(arr) { return arr.length - 1 + ONE_BASED; },
};

/* ------------------------------------------------------------------ */
/* Visual effects: particles, floating combat text, screen shake.      */
/* ------------------------------------------------------------------ */

// Hard ceiling on live particles. A boss death alone emits 90, and shadowBlur
// is the most expensive thing the renderer does, so an unbounded array is a
// frame-rate cliff waiting to happen.
const MAX_PARTICLES = 600;

class FX {
  constructor() {
    this.particles = [];
    this.texts = [];
    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.flash = 0;
    this.flashColor = '#fff';
  }

  clear() { this.particles.length = 0; this.texts.length = 0; this.shake = 0; this.flash = 0; }

  spark(x, y, opts = {}) {
    const n = opts.count ?? 8;
    for (let i = 0; i < n; i++) {
      const a = opts.dir !== undefined
        ? opts.dir + U.rand(-(opts.spread ?? 0.7), opts.spread ?? 0.7)
        : U.rand(0, Math.PI * 2);
      const sp = U.rand(opts.speedMin ?? 40, opts.speedMax ?? 190);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: U.rand(opts.lifeMin ?? 0.22, opts.lifeMax ?? 0.6), maxLife: 1,
        size: U.rand(opts.sizeMin ?? 1.5, opts.sizeMax ?? 4),
        color: Array.isArray(opts.color) ? U.pick(opts.color) : (opts.color ?? '#ffd479'),
        drag: opts.drag ?? 0.9,
        gravity: opts.gravity ?? 0,
        glow: opts.glow ?? true,
      });
      const p = this.particles[this.particles.length - 1];
      p.maxLife = p.life;
    }
  }

  ring(x, y, radius, color, count = 18) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this.particles.push({
        x: x + Math.cos(a) * radius * 0.35, y: y + Math.sin(a) * radius * 0.35,
        vx: Math.cos(a) * radius * 2.6, vy: Math.sin(a) * radius * 2.6,
        life: 0.34, maxLife: 0.34, size: 3, color, drag: 0.82, gravity: 0, glow: true,
      });
    }
  }

  text(x, y, str, color = '#fff', size = 15) {
    this.texts.push({ x: x + U.rand(-6, 6), y, str, color, size, life: 0.85, maxLife: 0.85, vy: -46 });
  }

  addShake(amount) { this.shake = Math.min(26, this.shake + amount); }
  addFlash(color, amount) { this.flashColor = color; this.flash = Math.max(this.flash, amount); }

  // Oldest-first drop, so the newest (most relevant) effect always survives.
  trim() {
    const over = this.particles.length - MAX_PARTICLES;
    if (over > 0) this.particles.splice(0, over);
  }

  update(dt) {
    this.trim();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vy *= d;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) { this.texts.splice(i, 1); continue; }
      t.y += t.vy * dt;
      t.vy *= Math.pow(0.9, dt * 60);
    }
    this.shake = Math.max(0, this.shake - dt * 46);
    this.shakeX = U.rand(-this.shake, this.shake);
    this.shakeY = U.rand(-this.shake, this.shake);
    this.flash = Math.max(0, this.flash - dt * 3.4);
  }

  drawParticles(ctx) {
    ctx.save();
    for (const p of this.particles) {
      const a = U.clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.glow) { ctx.shadowBlur = 10; ctx.shadowColor = p.color; }
      const s = p.size * (0.4 + a * 0.6);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  drawTexts(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      const a = U.clamp(t.life / t.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `700 ${t.size}px "Segoe UI", system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,.85)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.restore();
  }
}
