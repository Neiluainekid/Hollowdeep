/* Uniform-grid spatial hash.

   Everything that used to ask "what is near me?" by scanning the whole array
   goes through this instead: enemy separation, projectile hits, sword arcs,
   dash strikes, prop prompts. Those were all O(n) or O(n*m) per frame, which
   was fine for 5 enemies and will not be fine for a Necromancer's minions plus
   a boss firing 40 projectiles into a room of 12. */
'use strict';

class SpatialHash {
  constructor(cell = 96) {
    this.cell = cell;
    this.buckets = new Map();
    this._seen = new Set();
  }

  // Cell coords are offset so negatives still produce unique integer keys.
  key(cx, cy) { return (cx + 8192) * 65536 + (cy + 8192); }

  clear() { this.buckets.clear(); }

  insert(obj, x, y) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell));
    const b = this.buckets.get(k);
    if (b) b.push(obj);
    else this.buckets.set(k, [obj]);
  }

  rebuild(items) {
    this.clear();
    for (const it of items) this.insert(it, it.x, it.y);
  }

  /* Objects in every cell overlapping the circle. This is a broad phase — it
     can return things just outside `radius`, so callers still distance-check
     (they all did already). */
  query(x, y, radius, out = []) {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - radius) / c), x1 = Math.floor((x + radius) / c);
    const y0 = Math.floor((y - radius) / c), y1 = Math.floor((y + radius) / c);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const b = this.buckets.get(this.key(cx, cy));
        if (b) for (let i = 0; i < b.length; i++) out.push(b[i]);
      }
    }
    return out;
  }

  /* Nearest object passing `filter`, or null. */
  nearest(x, y, radius, filter = null) {
    const found = this.query(x, y, radius, []);
    let best = null, bestD = radius * radius;
    for (const o of found) {
      if (filter && !filter(o)) continue;
      const d = U.dist2(x, y, o.x, o.y);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }
}
