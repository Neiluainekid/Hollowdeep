/* Persistence.

   Two separate stores with deliberately different lifetimes:

     RUN_KEY  — one in-progress run. Written every few seconds, deleted the
                moment it is loaded and the moment a run ends. That gives
                suspend/resume across a shutdown WITHOUT giving checkpoints:
                you can close the laptop and come back, but you cannot reload
                to undo a death.

     META_KEY — never deleted. Bosses first felled, best time, classes played.

   The save stores *inputs*, not derived state. Perks are stored as ids and
   replayed through perk.apply() on load, so retuning a perk later fixes old
   saves instead of leaving them holding stale numbers. The dungeon isn't
   stored at all — it is regenerated from its seed. */
'use strict';

const Save = {
  RUN_KEY: 'hollowdeep.run.v1',
  META_KEY: 'hollowdeep.meta.v1',

  available() {
    try {
      const k = '__hd_probe';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch { return false; }   // private mode, disabled storage, file:// opaque origin
  },

  /* ---------------- run save ---------------- */

  hasRun() {
    if (!this.available()) return false;
    try {
      const raw = localStorage.getItem(this.RUN_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      return data && data.v === 1 && !!data.player;
    } catch { return false; }
  },

  peek() {
    try { return JSON.parse(localStorage.getItem(this.RUN_KEY)); } catch { return null; }
  },

  writeRun(state) {
    if (!this.available()) return false;
    try {
      localStorage.setItem(this.RUN_KEY, JSON.stringify(state));
      return true;
    } catch { return false; }   // quota exceeded — a lost save beats a crash
  },

  readRun() {
    if (!this.available()) return null;
    try {
      const data = JSON.parse(localStorage.getItem(this.RUN_KEY));
      if (!data || data.v !== 1) return null;
      return data;
    } catch { return null; }
  },

  clearRun() {
    try { localStorage.removeItem(this.RUN_KEY); } catch { /* nothing to do */ }
  },

  /* ---------------- meta (survives death) ---------------- */

  readMeta() {
    try {
      return JSON.parse(localStorage.getItem(this.META_KEY)) || this.blankMeta();
    } catch { return this.blankMeta(); }
  },

  blankMeta() {
    return { runs: 0, wins: 0, deaths: 0, bestTime: null, classesPlayed: [], bossesFelled: [] };
  },

  writeMeta(meta) {
    try { localStorage.setItem(this.META_KEY, JSON.stringify(meta)); } catch { /* ignore */ }
  },

  updateMeta(fn) {
    const meta = this.readMeta();
    fn(meta);
    this.writeMeta(meta);
    return meta;
  },

  /* ---------------- explored bitmap packing ---------------- */

  // 152x152 = 23,104 bytes raw. Run-length encoded it is typically 1-3 KB,
  // because exploration is contiguous.
  encodeExplored(u8) {
    const runs = [];
    let cur = 0, run = 0;
    for (let i = 0; i < u8.length; i++) {
      const v = u8[i] ? 1 : 0;
      if (v === cur) run++;
      else { runs.push(run); cur = v; run = 1; }
    }
    runs.push(run);
    return runs.join('.');
  },

  decodeExplored(str, length) {
    const out = new Uint8Array(length);
    if (!str) return out;
    const runs = str.split('.');
    let i = 0, v = 0;
    for (const part of runs) {
      const n = +part;
      if (!Number.isFinite(n) || n < 0) break;
      if (v) out.fill(1, i, Math.min(length, i + n));
      i += n;
      v ^= 1;
      if (i >= length) break;
    }
    return out;
  },
};
