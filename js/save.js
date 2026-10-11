/* Persistence — Update 2.0: three independent save slots.

     SLOT KEYS — three in-progress runs, numbered 1..3. Each is written every
                 few seconds while you play. A slot is cleared the moment its
                 run ends, so you get suspend/resume across a shutdown without
                 getting checkpoints: you can close the laptop and come back,
                 but you cannot reload to undo a death.

     META_KEY  — never deleted. Bosses first felled, best time, classes played.

   The save stores *inputs*, not derived state. Perks are stored as ids and
   replayed through perk.apply() on load, so retuning a perk later fixes old
   saves instead of leaving them holding stale numbers. The dungeon isn't
   stored at all — it is regenerated from its seed.

   ── 1-BASED INDEXING ──────────────────────────────────────────────────────
   Per the Update 2.0 architectural rule, every authored/domain sequence in
   this codebase counts from 1: save slots, UI slots, loadout slots, map
   numbers, shrine ids, boss table entries. `ONE_BASED` below is the single
   source of truth for the offset so the intent is greppable rather than
   hidden behind stray +1s.

   Engine-internal buffers are the deliberate exception and stay 0-based:
   the Uint8Array tile grid (`ty * w + tx`), spatial-hash buckets, typed
   arrays and canvas pixel data. Those are addressed by hardware/DOM APIs
   that define index 0 as the first element; renumbering them would not be a
   convention change, it would be an off-by-one in the renderer and the
   collision system. See `Seq` in util.js for the helpers.
   ────────────────────────────────────────────────────────────────────────── */
'use strict';

const Save = {
  VERSION: 2,
  SLOT_FIRST: 1,
  SLOT_COUNT: 3,
  META_KEY: 'hollowdeep.meta.v2',

  get SLOT_LAST() { return this.SLOT_FIRST + this.SLOT_COUNT - 1; },

  // Slots are 1..3 in the key itself, so the storage is self-documenting.
  slotKey(slot) { return `hollowdeep.run.v2.slot${slot}`; },

  validSlot(slot) {
    return Number.isInteger(slot) && slot >= this.SLOT_FIRST && slot <= this.SLOT_LAST;
  },

  // 1-based list of every slot number, for UI iteration.
  slotNumbers() {
    return Seq.range(this.SLOT_FIRST, this.SLOT_COUNT);
  },

  available() {
    try {
      const k = '__hd_probe';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch { return false; }   // private mode, disabled storage, file:// opaque origin
  },

  /* ---------------- per-slot run save ---------------- */

  hasRun(slot) {
    return !!this.readRun(slot);
  },

  readRun(slot) {
    if (!this.available() || !this.validSlot(slot)) return null;
    try {
      const data = JSON.parse(localStorage.getItem(this.slotKey(slot)));
      if (!data || data.v !== this.VERSION || !data.player) return null;
      return data;
    } catch { return null; }
  },

  writeRun(slot, state) {
    if (!this.available() || !this.validSlot(slot)) return false;
    try {
      localStorage.setItem(this.slotKey(slot), JSON.stringify(state));
      return true;
    } catch { return false; }   // quota exceeded — a lost save beats a crash
  },

  clearRun(slot) {
    if (!this.validSlot(slot)) return;
    try { localStorage.removeItem(this.slotKey(slot)); } catch { /* nothing to do */ }
  },

  /* Summary of all three slots for the title screen, in slot order.
     Always returns SLOT_COUNT entries; `data` is null for an empty slot. */
  surveySlots() {
    return this.slotNumbers().map(slot => {
      const data = this.readRun(slot);
      return {
        slot,
        empty: !data,
        data,
        label: data ? this.describe(data) : 'Empty',
      };
    });
  },

  describe(data) {
    const cls = (typeof CLASSES !== 'undefined' && CLASSES[data.player.classId]) || null;
    const mapNo = data.mapNumber || Save.SLOT_FIRST;
    const mapName = (typeof MAPS !== 'undefined' && Maps.byNumber(mapNo))
      ? Maps.byNumber(mapNo).name : `Map ${mapNo}`;
    const mins = Math.floor((data.elapsed || 0) / 60);
    return `${cls ? cls.className : '?'} · Lv ${data.player.level} · ${mapName} · ${mins}m`;
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

  /* ---------------- explored bitmap packing ----------------
     The bitmap itself is an engine buffer and stays 0-based; only the run
     length list is transported. RLE keeps a 152x152 map at 1-3 KB. */

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
