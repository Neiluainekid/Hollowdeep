/* Procedural dungeon: rooms + caverns stitched into one continuous, loopy
   open world. No level transitions — the whole map exists at once and
   difficulty rises with graph distance from the entrance.

   Update 4.0: an `outdoor` map (Day-ZEE) is built by the same generator but
   reads as a base rather than a cave: square yards instead of caverns, wide
   roads, crates, and two war-machine yards — one of them a flooded dry dock
   with a battleship sitting in it. */
'use strict';

const TILE = 34;
const T = { WALL: 0, FLOOR: 1, WATER: 2, PILLAR: 3, RUBBLE: 4 };
const SOLID = [true, false, false, true, false];

/* Region palettes and enemy tables now live per-map in maps.js. */

class Room {
  constructor(x, y, w, h, shape) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.shape = shape;
    this.cx = x + (w >> 1);
    this.cy = y + (h >> 1);
    this.kind = 'combat';   // start | combat | treasure | shrine | boss
    this.tier = 0;          // 0..regions-1, picks the palette
    this.threat = 0;        // tier + the map's bias, drives enemy scaling
    this.depth = 0;         // graph distance from the start room
    this.spawned = false;
    this.cleared = false;
    this.alive = 0;
    this.spawns = [];
    this.neighbors = [];
    this.explored = false;
  }
  contains(px, py) {
    const tx = px / TILE, ty = py / TILE;
    return tx >= this.x - 1 && tx < this.x + this.w + 1 && ty >= this.y - 1 && ty < this.y + this.h + 1;
  }
  get wx() { return (this.x + this.w / 2) * TILE; }
  get wy() { return (this.y + this.h / 2) * TILE; }
}

class Dungeon {
  constructor(seed, map = MAPS[0]) {
    this.seed = seed;
    this.map = map;
    this.regions = map.regions;
    this.rng = U.rng(seed);
    this.w = map.w;
    this.h = map.h;
    // Tiles explored since the last time the renderer drained this list, so
    // the minimap can be cached instead of redrawn from scratch every frame.
    this.newlyExplored = [];
    this.grid = new Uint8Array(this.w * this.h);
    this.roomMap = new Int16Array(this.w * this.h).fill(-1);
    this.explored = new Uint8Array(this.w * this.h);
    this.rooms = [];
    this.torches = [];
    this.props = [];
    this.sealTiles = [];
    this.generate();
  }

  idx(tx, ty) { return ty * this.w + tx; }
  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }
  at(tx, ty) { return this.inBounds(tx, ty) ? this.grid[this.idx(tx, ty)] : T.WALL; }
  set(tx, ty, v) { if (this.inBounds(tx, ty)) this.grid[this.idx(tx, ty)] = v; }

  isSolidTile(tx, ty) {
    if (!this.inBounds(tx, ty)) return true;
    if (this.sealed && this.sealSet.has(this.idx(tx, ty))) return true;
    return SOLID[this.grid[this.idx(tx, ty)]];
  }
  isSolidAt(x, y) { return this.isSolidTile(Math.floor(x / TILE), Math.floor(y / TILE)); }
  isWaterAt(x, y) { return this.at(Math.floor(x / TILE), Math.floor(y / TILE)) === T.WATER; }

  /* ---------------------------------------------------------------- */

  generate() {
    const r = this.rng;
    this.grid.fill(T.WALL);

    // --- place non-overlapping rooms ---
    for (let attempt = 0; attempt < 480 && this.rooms.length < this.map.roomTarget; attempt++) {
      const shape = r.chance(this.map.outdoor ? 0.1 : 0.35) ? 'cave' : 'rect';
      const w = r.int(9, shape === 'cave' ? 24 : 19);
      const h = r.int(8, shape === 'cave' ? 22 : 17);
      const x = r.int(2, this.w - w - 2);
      const y = r.int(2, this.h - h - 2);
      const room = new Room(x, y, w, h, shape);
      let clash = false;
      for (const o of this.rooms) {
        if (x < o.x + o.w + 3 && x + w + 3 > o.x && y < o.y + o.h + 3 && y + h + 3 > o.y) { clash = true; break; }
      }
      if (!clash) this.rooms.push(room);
    }

    for (const room of this.rooms) this.carveRoom(room);

    // --- connect: minimum spanning tree, then extra edges so the map loops ---
    this.connectRooms();

    // --- roles, tiers, contents ---
    this.assignRoles();
    this.decorate();
    this.populate();
  }

  carveRoom(room) {
    const r = this.rng;
    if (room.shape === 'rect') {
      for (let ty = room.y; ty < room.y + room.h; ty++)
        for (let tx = room.x; tx < room.x + room.w; tx++)
          this.set(tx, ty, T.FLOOR);
    } else {
      // Noisy ellipse — organic cavern, but the centre is always solid ground
      // so corridors terminating at the centre are guaranteed to connect.
      const rx = room.w / 2, ry = room.h / 2;
      const ox = r() * 100, oy = r() * 100;
      for (let ty = room.y; ty < room.y + room.h; ty++) {
        for (let tx = room.x; tx < room.x + room.w; tx++) {
          const nx = (tx - room.cx) / rx, ny = (ty - room.cy) / ry;
          const d = Math.sqrt(nx * nx + ny * ny);
          const wobble = (U.tileNoise((tx + ox) | 0, (ty + oy) | 0) - 0.5) * 0.42;
          if (d + wobble < 0.94) this.set(tx, ty, T.FLOOR);
        }
      }
      for (let ty = room.cy - 2; ty <= room.cy + 2; ty++)
        for (let tx = room.cx - 2; tx <= room.cx + 2; tx++)
          this.set(tx, ty, T.FLOOR);
    }
  }

  connectRooms() {
    const r = this.rng;
    const n = this.rooms.length;
    const connected = [0];
    const remaining = new Set();
    for (let i = 1; i < n; i++) remaining.add(i);

    while (remaining.size) {
      let bestA = -1, bestB = -1, bestD = Infinity;
      for (const a of connected) {
        const ra = this.rooms[a];
        for (const b of remaining) {
          const rb = this.rooms[b];
          const d = U.dist2(ra.cx, ra.cy, rb.cx, rb.cy);
          if (d < bestD) { bestD = d; bestA = a; bestB = b; }
        }
      }
      this.carveCorridor(this.rooms[bestA], this.rooms[bestB]);
      this.rooms[bestA].neighbors.push(bestB);
      this.rooms[bestB].neighbors.push(bestA);
      connected.push(bestB);
      remaining.delete(bestB);
    }

    // Extra links turn the tree into a network you can circle back through.
    const extra = Math.round(n * 0.42);
    for (let i = 0; i < extra; i++) {
      const a = r.int(0, n), b = r.int(0, n);
      if (a === b || this.rooms[a].neighbors.includes(b)) continue;
      if (U.dist(this.rooms[a].cx, this.rooms[a].cy, this.rooms[b].cx, this.rooms[b].cy) > 46) continue;
      this.carveCorridor(this.rooms[a], this.rooms[b]);
      this.rooms[a].neighbors.push(b);
      this.rooms[b].neighbors.push(a);
    }
  }

  carveCorridor(a, b) {
    const r = this.rng;
    // half-width: 1 -> 3 tiles, 2 -> 5 tiles. A base has roads, not tunnels.
    const width = r.chance(this.map.outdoor ? 0.65 : 0.25) ? 2 : 1;
    const horizFirst = r.chance(0.5);
    const bend = horizFirst ? { x: b.cx, y: a.cy } : { x: a.cx, y: b.cy };
    this.carveLine(a.cx, a.cy, bend.x, bend.y, width);
    this.carveLine(bend.x, bend.y, b.cx, b.cy, width);
  }

  carveLine(x0, y0, x1, y1, hw) {
    const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
    let x = x0, y = y0;
    const step = () => {
      for (let oy = -hw; oy <= hw; oy++)
        for (let ox = -hw; ox <= hw; ox++)
          if (this.inBounds(x + ox, y + oy) && this.at(x + ox, y + oy) === T.WALL)
            this.set(x + ox, y + oy, T.FLOOR);
    };
    step();
    while (x !== x1) { x += dx; step(); }
    while (y !== y1) { y += dy; step(); }
  }

  assignRoles() {
    const r = this.rng;

    // Breadth-first from room 0 gives every room a hop-count "depth".
    const q = [0];
    this.rooms[0].depth = 0;
    const seen = new Set([0]);
    let maxDepth = 0;
    while (q.length) {
      const i = q.shift();
      for (const j of this.rooms[i].neighbors) {
        if (seen.has(j)) continue;
        seen.add(j);
        this.rooms[j].depth = this.rooms[i].depth + 1;
        maxDepth = Math.max(maxDepth, this.rooms[j].depth);
        q.push(j);
      }
    }
    this.maxDepth = Math.max(1, maxDepth);

    const last = this.regions.length - 1;
    for (const room of this.rooms) {
      room.tier = U.clamp(Math.floor((room.depth / this.maxDepth) * last + 0.001), 0, last);
      room.threat = room.tier + this.map.threatBias;
    }

    this.start = this.rooms[0];
    this.start.kind = 'start';
    this.start.tier = 0;
    this.start.threat = this.map.threatBias;
    this.startX = this.start.wx;
    this.startY = this.start.wy;

    // Boss lives as far from the entrance as the graph allows.
    let boss = this.rooms[0];
    for (const room of this.rooms) if (room.depth > boss.depth) boss = room;
    boss.kind = 'boss';
    boss.tier = last;
    boss.threat = last + this.map.threatBias;
    this.boss = boss;
    this.computeSeal(boss);

    /* Must use the seeded RNG, not U.shuffle. World generation has to be
       byte-identical for a given seed: the save file stores prop *indices*
       and regenerates the dungeon around them, so any unseeded randomness
       here silently reshuffles which chests are already open. */
    const rest = this.rooms.filter(x => x.kind === 'combat');
    for (let i = rest.length - 1; i > 0; i--) {
      const j = r.int(0, i + 1);
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    for (let i = 0; i < rest.length; i++) {
      if (i < 5) rest[i].kind = 'treasure';
      else if (i < 9) rest[i].kind = 'shrine';
    }
    this.assignWarMachines();
  }

  /* Day-ZEE's war machines each get a yard to themselves: a big room in the
     right band of the depth ladder. The dock is flooded in decorate(). */
  assignWarMachines() {
    if (!this.map.warMachines) return;
    const r = this.rng;
    for (const wm of this.map.warMachines) {
      let pool = this.rooms.filter(room => room.kind === 'combat' && !room.arena
        && room.tier >= wm.tiers[0] && room.tier <= wm.tiers[1] && room.w >= 12 && room.h >= 11);
      if (!pool.length) {
        // Nothing big enough in band: the roomiest yards nearest the band.
        const off = (room) => Math.max(0, wm.tiers[0] - room.tier, room.tier - wm.tiers[1]);
        pool = this.rooms.filter(room => room.kind === 'combat' && !room.arena && room.w >= 10 && room.h >= 9)
          .sort((a, b) => off(a) - off(b) || b.w * b.h - a.w * a.h).slice(0, 3);
      }
      if (!pool.length) continue;
      const room = pool[r.int(0, pool.length)];
      room.arena = wm.type;
      room.dock = !!wm.dock;
      room.hasCage = true;          // keep cages and stalls out of the yard
    }
  }

  // Walkable tiles on the ring just outside the boss room — barred during the fight.
  computeSeal(room) {
    this.sealSet = new Set();
    this.sealed = false;
    for (let ty = room.y - 2; ty <= room.y + room.h + 1; ty++) {
      for (let tx = room.x - 2; tx <= room.x + room.w + 1; tx++) {
        const inside = tx >= room.x - 1 && tx < room.x + room.w + 1 && ty >= room.y - 1 && ty < room.y + room.h + 1;
        if (inside) continue;
        if (!this.inBounds(tx, ty) || this.at(tx, ty) === T.WALL) continue;
        this.sealSet.add(this.idx(tx, ty));
        this.sealTiles.push({ tx, ty });
      }
    }
  }

  decorate() {
    const r = this.rng;
    for (let i = 0; i < this.rooms.length; i++) {
      const room = this.rooms[i];

      // Tag ownership so we can name the region the player is standing in.
      for (let ty = room.y - 1; ty < room.y + room.h + 1; ty++)
        for (let tx = room.x - 1; tx < room.x + room.w + 1; tx++)
          if (this.inBounds(tx, ty) && this.at(tx, ty) !== T.WALL && this.roomMap[this.idx(tx, ty)] < 0)
            this.roomMap[this.idx(tx, ty)] = i;

      // The dry dock: flooded wall to wall, a walkway left round the edge.
      if (room.dock) {
        for (let ty = room.y + 2; ty < room.y + room.h - 2; ty++)
          for (let tx = room.x + 2; tx < room.x + room.w - 2; tx++)
            if (this.at(tx, ty) === T.FLOOR) this.set(tx, ty, T.WATER);
      }
      // A base is cluttered: stacks of crates (pillar tiles) in the yards,
      // never in a war machine's yard, never near the middle.
      if (this.map.outdoor && !room.arena && room.shape === 'rect' && room.kind !== 'boss') {
        const crates = r.int(2, 7);
        for (let k = 0; k < crates; k++) {
          const tx = room.x + 1 + r.int(0, Math.max(1, room.w - 2));
          const ty = room.y + 1 + r.int(0, Math.max(1, room.h - 2));
          if (Math.abs(tx - room.cx) < 3 && Math.abs(ty - room.cy) < 3) continue;
          if (this.at(tx, ty) === T.FLOOR) this.set(tx, ty, T.PILLAR);
        }
      }

      // Pillars in the larger halls.
      if (!room.arena && room.shape === 'rect' && room.w >= 12 && room.h >= 10 && r.chance(0.55)) {
        const insetX = 2 + r.int(0, 2), insetY = 2 + r.int(0, 2);
        for (const px of [room.x + insetX, room.x + room.w - 1 - insetX]) {
          for (const py of [room.y + insetY, room.y + room.h - 1 - insetY]) {
            this.set(px, py, T.PILLAR);
          }
        }
      }

      // Standing water in caverns.
      if (!room.arena && room.shape === 'cave' && r.chance(0.5)) {
        const px = room.cx + r.int(-3, 4), py = room.cy + r.int(-3, 4);
        const rad = r.int(2, 5);
        for (let ty = py - rad; ty <= py + rad; ty++)
          for (let tx = px - rad; tx <= px + rad; tx++)
            if (this.at(tx, ty) === T.FLOOR && U.dist(tx, ty, px, py) < rad - U.tileNoise(tx, ty))
              this.set(tx, ty, T.WATER);
      }

      // Rubble scatter.
      const rubble = r.int(0, 9);
      for (let k = 0; k < rubble; k++) {
        const tx = room.x + r.int(0, room.w), ty = room.y + r.int(0, room.h);
        if (this.at(tx, ty) === T.FLOOR) this.set(tx, ty, T.RUBBLE);
      }

      // Wall torches around the room edge.
      for (let ty = room.y - 1; ty <= room.y + room.h; ty++) {
        for (let tx = room.x - 1; tx <= room.x + room.w; tx++) {
          if (this.at(tx, ty) !== T.WALL) continue;
          if (this.at(tx, ty + 1) === T.WALL || this.at(tx, ty + 1) === T.PILLAR) continue;
          if (!this.inBounds(tx, ty + 1) || SOLID[this.at(tx, ty + 1)]) continue;
          if (!r.chance(this.map.outdoor ? 0.1 : 0.17)) continue;   // floodlights are sparser
          this.torches.push({
            x: (tx + 0.5) * TILE, y: (ty + 0.95) * TILE,
            phase: r() * 10, tier: room.tier,
          });
        }
      }
    }
    this.tagCorridors();
  }

  // Multi-source BFS out of every tagged room tile, so corridors inherit the
  // region (and therefore the palette) of whichever room they came from.
  tagCorridors() {
    const q = [];
    for (let i = 0; i < this.grid.length; i++) if (this.roomMap[i] >= 0) q.push(i);
    let head = 0;
    while (head < q.length) {
      const i = q[head++];
      const tx = i % this.w, ty = (i / this.w) | 0;
      const room = this.roomMap[i];
      const nb = [[tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]];
      for (const [nx, ny] of nb) {
        if (!this.inBounds(nx, ny)) continue;
        const j = this.idx(nx, ny);
        if (this.grid[j] === T.WALL || this.roomMap[j] >= 0) continue;
        this.roomMap[j] = room;
        q.push(j);
      }
    }
  }

  tierAt(tx, ty) {
    if (!this.inBounds(tx, ty)) return 0;
    const i = this.roomMap[this.idx(tx, ty)];
    return i >= 0 ? this.rooms[i].tier : 0;
  }

  // A random walkable tile inside a room, kept clear of the exact centre.
  spotIn(room, minFromCenter = 0) {
    const r = this.rng;
    for (let i = 0; i < 80; i++) {
      const tx = room.x + r.int(1, Math.max(2, room.w - 1));
      const ty = room.y + r.int(1, Math.max(2, room.h - 1));
      const t = this.at(tx, ty);
      if (t !== T.FLOOR && t !== T.RUBBLE) continue;
      if (U.dist(tx, ty, room.cx, room.cy) < minFromCenter) continue;
      return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
    }
    return { x: room.wx, y: room.wy };
  }

  populate() {
    const r = this.rng;
    const tables = this.map.tables;

    for (const room of this.rooms) {
      if (room.kind === 'start') continue;

      if (room.kind === 'boss') {
        this.props.push({ type: 'gate', ...this.spotIn(room, 0), room, used: false });
        continue;
      }

      const table = tables[U.clamp(room.tier, 0, tables.length - 1)];
      const density = room.w * room.h / 150;
      let count = Math.round(density * (1.1 + room.tier * 0.32) * r() * 1.5 + 1 + room.tier * 0.5);
      count = U.clamp(count, 1, 11);
      // A war machine's yard: the machine, and only a few hangers-on.
      if (room.arena) {
        room.spawns.push({ type: room.arena, x: room.wx, y: room.wy, elite: false, threat: room.threat });
        count = Math.ceil(count / 3);
      }

      for (let i = 0; i < count; i++) {
        const type = r.pick(table);
        const spot = this.spotIn(room, 2);
        const elite = r.chance((0.05 + room.tier * 0.025) * (this.map.difficulty ? this.map.difficulty.elite : 1));
        room.spawns.push({ type, x: spot.x, y: spot.y, elite, threat: room.threat });
      }

      if (room.kind === 'treasure') {
        room.spawns.push({ type: 'brute', ...this.spotIn(room, 3), elite: true, threat: room.threat });
        this.props.push({ type: 'chest', ...this.spotIn(room, 1), room, used: false, rich: true });
      } else if (room.kind === 'shrine') {
        this.props.push({ type: 'shrine', ...this.spotIn(room, 1), room, used: false });
      }

      if (r.chance(0.3)) this.props.push({ type: 'chest', ...this.spotIn(room, 2), room, used: false });
      if (r.chance(0.22)) this.props.push({ type: 'fountain', ...this.spotIn(room, 2), room, used: false });
    }

    this.placeRedShrines();
    this.placeUpdate2Shrines();
    this.placeCages();
    this.placeMerchants();
    this.placeLateProps();
  }

  /* Update 4.0 props: the Ninja's class shrine and the new companions'
     cages. Placed after everything older on purpose — a save stores props by
     index, so appending keeps every existing save pointing at the same
     chests and shrines it always did. */
  placeLateProps() {
    const r = this.rng;
    const free = this.rooms.filter(room => room.kind !== 'start' && room.kind !== 'boss'
      && !room.hasRedShrine && !room.hasShrine2 && !room.hasCage && !room.hasMerchant && !room.arena);
    const takeRoom = () => free.length ? free.splice(r.int(0, free.length), 1)[0] : null;

    for (const shrine of CLASS_SHRINES.filter(s => s.late)) {
      const room = takeRoom();
      if (!room) break;
      room.hasShrine2 = true;
      this.props.push({ type: 'classshrine', ...this.spotIn(room, 1), room, used: false, shrine });
    }

    for (const kind of Object.keys(COMPANIONS)) {
      if (!(COMPANIONS[kind].maps || []).includes(this.map.number)) continue;
      // The deeper half, like John: you earn these.
      const deep = free.filter(room => room.tier >= 2);
      const pool = deep.length ? deep : free;
      if (!pool.length) break;
      const room = pool[r.int(0, pool.length)];
      free.splice(free.indexOf(room), 1);
      room.hasCage = true;
      this.props.push({ type: 'cage', ...this.spotIn(room, 1), room, used: false, npc: kind });
    }
  }

  /* Update 3.0: the Hollow Peddler. One waits in the entrance hall so the
     shop is never more than a walk back, and one or two more are tucked into
     the deeper regions. Placed last so it never shifts earlier generation. */
  placeMerchants() {
    const r = this.rng;
    const spots = [this.start];
    const mid = this.rooms.filter(room => room.kind === 'combat' && room.tier >= 2 && room.tier <= 3
      && !room.hasRedShrine && !room.hasShrine2 && !room.hasCage);
    if (mid.length) spots.push(mid[r.int(0, mid.length)]);
    const deep = this.rooms.filter(room => room.kind === 'combat' && room.tier >= 4
      && !room.hasRedShrine && !room.hasShrine2 && !room.hasCage);
    if (deep.length) spots.push(deep[r.int(0, deep.length)]);
    spots.forEach((room, i) => {
      room.hasMerchant = true;
      this.props.push({
        type: 'merchant', ...this.spotIn(room, room === this.start ? 3 : 1), room, used: false,
        stock: Shop.rollStock((this.seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0, this.map.number),
      });
    });
  }

  /* Two caged companions per map, and John Space out in the deep regions
     where you are least inclined to take chances. */
  placeCages() {
    const r = this.rng;
    const free = this.rooms.filter(room =>
      room.kind !== 'start' && room.kind !== 'boss' && !room.hasRedShrine && !room.hasShrine2 && !room.hasCage);

    for (const kind of ['disgraced', 'switcher']) {
      if (!free.length) break;
      const room = free.splice(r.int(0, free.length), 1)[0];
      room.hasCage = true;
      this.props.push({ type: 'cage', ...this.spotIn(room, 1), room, used: false, npc: kind });
    }

    // John Space only appears in the later half of the depth ladder.
    const deep = free.filter(room => room.tier >= 3);
    if (deep.length) {
      const room = deep[r.int(0, deep.length)];
      room.hasCage = true;
      const spot = this.spotIn(room, 2);
      this.johnSpot = { x: spot.x, y: spot.y, room };
    }
  }

  /* Class shrines, yellow shrines and corrupted shrines. All seeded, so the
     same world always offers the same choices in the same places. */
  placeUpdate2Shrines() {
    const r = this.rng;
    const free = this.rooms.filter(room =>
      room.kind !== 'start' && room.kind !== 'boss' && !room.hasRedShrine && !room.hasShrine2);

    const take = (n) => {
      const out = [];
      const pool = free.slice();
      for (let i = 0; i < n && pool.length; i++) {
        const idx = r.int(0, pool.length);
        const room = pool.splice(idx, 1)[0];
        room.hasShrine2 = true;
        out.push(room);
        const at = free.indexOf(room);
        if (at >= 0) free.splice(at, 1);
      }
      return out;
    };

    // One of each of the eight class shrines, scattered.
    for (const number of Shrines.legacyNumbers()) {
      const room = take(1)[0];
      if (!room) break;
      this.props.push({
        type: 'classshrine', ...this.spotIn(room, 1),
        room, used: false, shrine: Shrines.byNumber(number),
      });
    }

    // Yellow: the gamble. Rolled at generation so the seed decides, not the
    // moment you touch it — no save-scumming the outcome.
    for (const room of take(r.int(3, 6))) {
      this.props.push({
        type: 'yellowshrine', ...this.spotIn(room, 1),
        room, used: false, roll: Shrines.rollYellow(r),
      });
    }

    // Corrupted: wakes a miniboss, pays out when it dies.
    for (const room of take(r.int(2, 4))) {
      this.props.push({
        type: 'corruptshrine', ...this.spotIn(room, 1),
        room, used: false, active: false, guard: null,
        minibossType: Shrines.rollMiniboss(r, this.map.number),
      });
    }
  }

  /* Five red shrines bind the boss gate shut. They are spread evenly along
     the depth ladder rather than dropped at random, so finishing them means
     crossing the whole map instead of sweeping one corner. */
  placeRedShrines() {
    const eligible = this.rooms
      .filter(r => r.kind !== 'start' && r.kind !== 'boss')
      .sort((a, b) => a.depth - b.depth);
    if (!eligible.length) return;

    this.redShrineCount = Math.min(5, eligible.length);
    const picked = [];
    for (let i = 0; i < this.redShrineCount; i++) {
      // Sample across the depth range: shallow, then deeper, then deepest.
      const frac = (i + 0.5) / this.redShrineCount;
      let idx = Math.floor(frac * eligible.length);
      while (picked.includes(idx) && idx < eligible.length - 1) idx++;
      while (picked.includes(idx) && idx > 0) idx--;
      picked.push(idx);
      const room = eligible[idx];
      room.hasRedShrine = true;
      this.props.push({
        type: 'redshrine', ...this.spotIn(room, 1),
        room, used: false, active: false, wave: [], index: i,
      });
    }
  }

  /* ---------------------------------------------------------------- */

  regionAt(x, y) {
    const i = this.roomMap[this.idx(Math.floor(x / TILE), Math.floor(y / TILE))];
    if (i < 0) return null;
    return this.rooms[i];
  }

  roomOf(x, y) { return this.regionAt(x, y); }

  palette(tier) { return this.regions[U.clamp(tier, 0, this.regions.length - 1)]; }
  regionName(tier) { return this.regions[U.clamp(tier, 0, this.regions.length - 1)].name; }

  // Sample-based line of sight; good enough for AI and cheap enough to spam.
  lineOfSight(x0, y0, x1, y1) {
    const d = U.dist(x0, y0, x1, y1);
    const steps = Math.ceil(d / (TILE * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.isSolidAt(U.lerp(x0, x1, t), U.lerp(y0, y1, t))) return false;
    }
    return true;
  }

  markExplored(x, y, radiusTiles) {
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    const r = Math.ceil(radiusTiles);
    for (let ty = cy - r; ty <= cy + r; ty++) {
      for (let tx = cx - r; tx <= cx + r; tx++) {
        if (!this.inBounds(tx, ty)) continue;
        if (U.dist(tx, ty, cx, cy) > radiusTiles) continue;
        const i = this.idx(tx, ty);
        if (this.explored[i]) continue;
        this.explored[i] = 1;
        this.newlyExplored.push(tx, ty);
      }
    }
  }
  isExplored(tx, ty) { return this.inBounds(tx, ty) && this.explored[this.idx(tx, ty)] === 1; }
}
