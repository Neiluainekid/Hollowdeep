/* Game shell: loop, camera, renderer, lighting, world interaction, UI. */
'use strict';

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.light = document.createElement('canvas');
    this.lctx = this.light.getContext('2d');
    this.minimap = document.getElementById('minimap');
    this.mmctx = this.minimap.getContext('2d');
    this.bigmap = document.getElementById('bigmap');
    this.bigctx = this.bigmap.getContext('2d');

    this.fx = new FX();
    this.audio = new Audio2();
    this.state = 'title';            // title | playing | levelup | paused | map | end
    // lPressed/rPressed latch a click that begins and ends inside one frame,
    // so a very fast tap still produces an attack.
    this.input = {
      left: 0, right: 0, up: 0, down: 0, dash: false,
      parry: false, parryPressed: false,
      mouseL: false, mouseR: false, lPressed: false, rPressed: false,
    };
    this.mouse = { x: 0, y: 0 };
    this.mouseWorld = { x: 0, y: 0 };
    this.cam = { x: 0, y: 0 };
    this.time = 0;
    this.pendingLevelUps = 0;
    this.perkSource = 'level';
    this.toastT = 0;

    // Broad-phase indices. Enemies move, so theirs is rebuilt each frame;
    // props never move, so theirs is built once per map.
    this.enemyHash = new SpatialHash(96);
    this.propHash = new SpatialHash(128);
    this._q = [];

    // Pre-rendered radial glow. The lighting pass used to allocate a fresh
    // gradient per torch per frame; now it blits this.
    this.glow = this.makeGlowSprite();

    this.hudCache = {};        // last written HUD values, to avoid DOM churn
    this.saveTimer = 0;
    this.freezeT = 0;
    this.tempestT = 0;
    this.rhythm = null;
    this.saveSlot = Save.SLOT_FIRST;   // 1..3, chosen on the title screen
    this.mapNumber = Maps.FIRST;   // 1-based
    this.mapSeeds = [];           // dense, addressed via Seq
    this.minions = [];
    this.zones = [];
    this.impacts = [];
    this.companions = [];
    this.johnSpace = null;
    this.roulette = { open: false, held: 0, slot: Seq.FIRST };
    this.trail = [];              // player breadcrumbs that followers track
    this.companionKinds = new Set();   // one of each kind per dungeon
    this.cinematic = null;        // boss intro
    this.speech = null;           // boss line over its head
    this.invView = 0;             // inventory: 0 = you, 1.. = companions
    this.shopProp = null;
    // Update 4.0
    this.beams = [];              // lines of light (Prejudice, laser sweeps)
    this.zaps = [];               // chain-lightning flashes (Storm modifiers)
    this.hard = false;            // hard mode: chosen on the title screen
    this.activeMiniboss = null;   // the nearest awake miniboss, for its bar
    this.heartT = 0;              // low-health heartbeat

    this.bindEvents();
    this.resize();
    this.touch = new TouchControls(this);
  }

  // One 128px radial falloff, drawn once and scaled at use time.
  makeGlowSprite() {
    const s = 128;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.72)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    return c;
  }

  /* ---------------- setup ---------------- */

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    /* Small screens render at a larger virtual resolution, scaled down, so a
       phone in landscape still sees enough of the room to read attacks
       coming. Everything below works in virtual units (vw/vh, mouse); only
       `px` — the device-pixel scale — knows the difference. Desktop: 1. */
    this.zoom = U.clamp(Math.min(h / 480, w / 900), 0.62, 1);
    this.vw = w / this.zoom;
    this.vh = h / this.zoom;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.dpr = dpr;
    this.px = dpr * this.zoom;
    this.light.width = Math.floor(this.vw / 2);
    this.light.height = Math.floor(this.vh / 2);
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());
    // Some phones report the pre-rotation size on the first resize event.
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));

    const keyMap = {
      KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
      KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    };

    window.addEventListener('keydown', (e) => {
      // F toggles fullscreen anywhere, menus included.
      if (e.code === 'KeyF' && !e.repeat && !(e.target instanceof HTMLInputElement)) {
        Platform.toggleFullscreen();
        e.preventDefault();
        return;
      }
      // Menus first: they own the keyboard while they are open.
      if (this.state === 'inventory' || this.state === 'shop') {
        if (e.code === 'Escape' || (e.code === 'KeyI' && this.state === 'inventory')
          || (e.code === 'KeyE' && this.state === 'shop')) this.closeMenus();
        else if (this.state === 'inventory' && (e.code === 'ArrowRight' || e.code === 'ArrowLeft')) {
          this.cycleInventory(e.code === 'ArrowRight' ? 1 : -1);
        }
        e.preventDefault();
        return;
      }
      // A boss intro can be skipped.
      if (this.cinematic && !e.repeat && ['KeyE', 'Space', 'Enter', 'Escape'].includes(e.code)) {
        this.skipCinematic();
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyI' && !e.repeat && this.state === 'playing') { this.openInventory(); e.preventDefault(); return; }
      // While the rhythm break is up, WASD is the minigame, not movement.
      if (this.rhythm && !this.rhythm.done && !e.repeat
          && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
        this.rhythmKey(e.code);
        e.preventDefault();
        return;
      }
      if (e.code in keyMap) { this.input[keyMap[e.code]] = 1; e.preventDefault(); }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { this.input.dash = true; e.preventDefault(); }
      if (e.code === 'Space' && !e.repeat) { this.input.parry = true; this.input.parryPressed = true; e.preventDefault(); }
      if (e.code === 'KeyE') this.interact();
      if (e.code === 'KeyM' && !e.repeat) this.toggleMusic();
      if (e.code === 'KeyR' && !e.repeat) this.openRoulette();
      if (e.code === 'Tab') { e.preventDefault(); this.toggleMap(); }
      if (e.code === 'Escape') this.togglePause();
    });

    window.addEventListener('keyup', (e) => {
      if (e.code in keyMap) this.input[keyMap[e.code]] = 0;
      if (e.code === 'Space') this.input.parry = false;
      if (e.code === 'KeyR') this.closeRoulette();
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) / this.zoom;
      this.mouse.y = (e.clientY - r.top) / this.zoom;
    });
    this.canvas.addEventListener('mousedown', (e) => {
      this.audio.resume();
      if (e.button === 0) { this.input.mouseL = true; this.input.lPressed = true; }
      if (e.button === 2) { this.input.mouseR = true; this.input.rPressed = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.input.mouseL = false;
      if (e.button === 2) this.input.mouseR = false;
    });
    window.addEventListener('blur', () => {
      this.input.mouseL = this.input.mouseR = false;
      this.input.parry = this.input.parryPressed = false;
      this.input.left = this.input.right = this.input.up = this.input.down = 0;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    document.getElementById('quitBtn').onclick = () => location.reload();
    // Close buttons, for screens that otherwise only answered to a key.
    document.getElementById('resumeBtn').onclick = () => this.togglePause();
    document.getElementById('mapClose').onclick = () => this.toggleMap();
    document.getElementById('invClose').onclick = () => this.closeMenus();
    document.getElementById('shopClose').onclick = () => this.closeMenus();
    document.getElementById('invPrev').onclick = () => this.cycleInventory(-1);
    document.getElementById('invNext').onclick = () => this.cycleInventory(1);
    document.getElementById('againBtn').onclick = () => location.reload();
    document.getElementById('musicBtn').onclick = () => this.toggleMusic();
  }

  // M, or the pause menu: music on and off (remembered between visits).
  toggleMusic() {
    this.audio.resume();
    const on = this.audio.music.toggle();
    document.getElementById('musicBtn').textContent = `Music: ${on ? 'On' : 'Off'}`;
    if (this.state === 'playing') this.toast(`Music ${on ? 'on' : 'off'} (M)`, 1.6);
  }

  /* Which track should be playing right now. The sequencer crossfades. */
  updateMusic() {
    let track = null;
    if (this.dungeon && this.state !== 'title' && this.state !== 'end') {
      const def = Maps.byNumber(this.mapNumber);
      track = def.music || 'tripolisis';
      const boss = this.boss && !this.boss.dead ? this.boss : null;
      if (boss || this.pendingFinal) {
        track = boss && (boss.type === 'judgement' || boss.type === 'judgement2') ? 'bossFinal' : 'boss';
      } else if (this.activeMiniboss || (this.johnSpace && (this.johnSpace.trial || this.johnSpace.enraged))) {
        track = 'miniboss';
      }
    }
    this.audio.music.play(track);
    this.audio.music.update();
  }

  /* ---------------- run lifecycle ---------------- */

  /* A run is: pick a class, then walk two maps. `start` begins a fresh run;
     `resume` rebuilds one from disk; `loadMap` swaps the world underneath a
     player who carries across. */

  start(classId, seedText, slot = Save.SLOT_FIRST, hard = false) {
    this.audio.resume();
    this.hard = !!hard;
    this.saveSlot = Save.validSlot(slot) ? slot : Save.SLOT_FIRST;
    const base = seedText && seedText.trim()
      ? U.hashSeed(seedText.trim())
      : (Math.random() * 0xffffffff) >>> 0;
    this.seedText = seedText && seedText.trim() ? seedText.trim() : String(base);
    this.baseSeed = base;
    this.mapSeeds = MAPS.map(m => (base ^ m.seedSalt) >>> 0);
    this.runStart = performance.now();
    this.time = 0;
    this.player = null;
    this.pendingClassId = classId;

    Save.clearRun(this.saveSlot);
    Save.updateMeta(m => {
      m.runs++;
      if (!m.classesPlayed.includes(classId)) m.classesPlayed.push(classId);
    });

    this.loadMap(Maps.FIRST, { fresh: true });
    this.toast(`${this.player.weaponName} — ${this.player.cls.className}. ${this.player.cls.blurb}`
      + (this.hard ? ' HARD MODE: good luck.' : ''), 4.5);
  }

  loadMap(number, opts = {}) {
    this.mapNumber = Seq.clampTo(MAPS, number);
    const def = Maps.byNumber(this.mapNumber);

    /* A new dungeon sends every companion home (Update 3.0) — they must be
       found again down here. Their gear comes back to your bag first. */
    if (this.player && this.companions.length && !opts.fresh) {
      let left = 0;
      for (const c of this.companions) { this.returnCompanionGear(c); if (!c.dead) left++; }
      if (left) setTimeout(() => this.toast('Your companions stay behind. Find new ones down here.', 4.5), 4800);
    }

    // Drop the previous world wholesale so two maps never sit in memory at once.
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.minions = [];
    this.zones = [];
    this.impacts = [];
    this.beams = [];
    this.zaps = [];
    this.activeMiniboss = null;
    this.companions = [];
    this.companionKinds = new Set();
    this.johnSpace = null;
    this.trail = [];
    this.cinematic = null;
    this.speech = null;
    this.fx.clear();
    this.dungeon = new Dungeon(Seq.get(this.mapSeeds, this.mapNumber), def);
    this.exploreCanvas = null;    // rebuilt lazily at the new map's size

    if (opts.fresh) {
      this.player = new Player(this.pendingClassId, this.dungeon.startX, this.dungeon.startY);
    } else if (opts.player) {
      this.player = opts.player;
    }
    if (!opts.keepPosition) {
      this.player.x = this.dungeon.startX;
      this.player.y = this.dungeon.startY;
    }
    this.player.vx = this.player.vy = 0;
    this.player.phoenixUsed = false;       // the Phoenix Feather: once per map

    // Each map hands out that map's weapon tier.
    const promoted = this.player.setWeaponTier(this.mapNumber, opts.fresh ? null : this);

    this.propHash.rebuild(this.dungeon.props);
    if (this.dungeon.johnSpot) {
      const j = this.dungeon.johnSpot;
      this.johnSpace = this.spawnEnemy('johnspace', j.x, j.y, j.room.threat, false);
    }
    this.cam.x = this.player.x - this.vw / 2;
    this.cam.y = this.player.y - this.vh / 2;
    this.bossActive = false;
    this.bossDefeated = false;
    this.boss = null;
    this.rhythm = null;
    this.pendingDescend = null;
    this.pendingFinal = null;
    this.gateFound = false;
    this.currentRoom = null;
    this.pendingLevelUps = 0;
    this.hudCache = {};
    this.state = 'playing';

    for (const id of ['title', 'levelup', 'pause', 'mapscreen', 'endscreen', 'inventory', 'shop']) {
      document.getElementById(id).classList.add('hidden');
    }
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('mapChip').classList.toggle('hard', this.hard);
    document.getElementById('stage').classList.toggle('outdoor', !!def.outdoor);
    this.refreshClassHud();

    if (!opts.silent) {
      this.toast(`${def.name} — ${def.subtitle}`, 4.5);
      if (promoted) setTimeout(() => this.toast(`You take up the ${promoted}.`, 4), 2000);
    }
    return def;
  }

  refreshClassHud() {
    const c = this.player.cls;
    document.getElementById('portraitIcon').textContent = c.icon;
    document.getElementById('portrait').style.borderColor = c.color;
    document.getElementById('ab1Name').textContent = c.primary.name;
    document.getElementById('ab2Name').textContent = c.heavy.name;
    document.getElementById('ab3Name').textContent = c.mobility.name;
    document.querySelector('.bar.en .fill').style.background = c.energyBar;
    document.getElementById('manaBar').classList.toggle('hidden', !this.player.usesMana);
  }

  /* ---------------- persistence ---------------- */

  captureSave() {
    const d = this.dungeon;
    const usedProps = [];
    d.props.forEach((p, i) => { if (p.used) usedProps.push(i); });
    const cleared = [];
    d.rooms.forEach((r, i) => { if (r.cleared) cleared.push(i); });
    // Merchants: what is still on the shelf, by prop index.
    const merchants = [];
    d.props.forEach((p, i) => { if (p.type === 'merchant') merchants.push([i, p.stock.slice()]); });

    return {
      v: Save.VERSION,
      savedAt: Date.now(),
      elapsed: this.time,
      seedText: this.seedText,
      baseSeed: this.baseSeed,
      slot: this.saveSlot,
      mapNumber: this.mapNumber,
      hard: this.hard,
      player: this.player.serialize(),
      world: {
        usedProps,
        cleared,
        bossDefeated: this.bossDefeated,
        explored: Save.encodeExplored(d.explored),
        merchants,
        companionKinds: [...this.companionKinds],
      },
      companions: this.companions.filter(c => !c.dead).map(c => c.serialize()),
    };
  }

  saveNow() {
    if (this.state === 'end' || !this.player || this.player.dead) return;
    Save.writeRun(this.saveSlot, this.captureSave());
  }

  resume(data, slot = Save.SLOT_FIRST) {
    this.audio.resume();
    this.saveSlot = Save.validSlot(slot) ? slot : Save.SLOT_FIRST;
    this.seedText = data.seedText;
    this.baseSeed = data.baseSeed >>> 0;
    this.mapSeeds = MAPS.map(m => (this.baseSeed ^ m.seedSalt) >>> 0);
    this.time = data.elapsed || 0;
    this.runStart = performance.now() - this.time * 1000;
    this.hard = !!data.hard;

    const player = Player.restore(data.player);
    this.loadMap(data.mapNumber || Maps.FIRST, { player, keepPosition: true, silent: true });

    // Re-apply the deltas on top of the regenerated world.
    const w = data.world || {};
    for (const i of w.usedProps || []) if (this.dungeon.props[i]) this.dungeon.props[i].used = true;
    for (const i of w.cleared || []) {
      const room = this.dungeon.rooms[i];
      if (room) { room.cleared = true; room.spawned = true; }   // stays empty
    }
    this.bossDefeated = !!w.bossDefeated;
    // Suspended mid boss fight: the fight did not survive the save, so let
    // the gate be opened again rather than leaving the map unfinishable.
    if (!this.bossDefeated) {
      for (const pr of this.dungeon.props) if (pr.type === 'gate') pr.used = false;
    }
    if (w.explored) {
      this.dungeon.explored = Save.decodeExplored(w.explored, this.dungeon.w * this.dungeon.h);
      this.exploreCanvas = null;   // force a full repaint of the cached minimap
    }
    for (const [i, stock] of w.merchants || []) {
      const m = this.dungeon.props[i];
      if (m && m.type === 'merchant') m.stock = stock.filter(id => Gear.get(id));
    }
    this.companionKinds = new Set(w.companionKinds || []);

    // Companions come back at your side, with their levels and gear.
    for (const cd of data.companions || []) {
      if (!COMPANIONS[cd.kind]) continue;
      const spot = this.safeSpawnNear(player.x, player.y, 40, U.rand(0, Math.PI * 2), 14);
      const c = new Companion(cd.kind, spot.x, spot.y);
      for (let lv = 1; lv < (cd.level || 1); lv++) {
        c.level++;
        c.maxHp += Math.round(c.def.hp * 0.12);
      }
      c.xpNext = companionXpNeeded(c.level);
      c.xp = cd.xp || 0;
      for (const [slot, id] of Object.entries(cd.equip || {})) {
        const item = Gear.get(id);
        if (!item || item.slot !== slot || item.cursed) continue;
        c.equip[slot] = id;
        Gear.applyToCompanion(c, item, +1);
      }
      c.hp = U.clamp(cd.hp ?? c.maxHp, 1, c.maxHp);
      this.companions.push(c);
      this.companionKinds.add(cd.kind);
      // John was already won over; do not leave a second one standing there.
      if (cd.kind === 'johnspace' && this.johnSpace) { this.johnSpace.dead = true; this.johnSpace = null; }
    }

    // Consumed on load: you may suspend a run, but you may not rewind a death.
    Save.clearRun(this.saveSlot);

    const def = Maps.byNumber(this.mapNumber);
    this.toast(`${def.name} — ${def.subtitle}. Your run continues.`, 4.5);
  }

  toast(msg, dur = 3) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    this.toastT = dur;
  }

  /* ---------------- Update 2.0 game-feel primitives ---------------- */

  /* Impact frames: a couple of frames of held time on a heavy connection.
     `update` scales dt to zero while this runs, so animation and physics
     both stop dead — that pause is what sells weight. */
  impactFreeze(seconds = 0.06) {
    this.freezeT = Math.max(this.freezeT || 0, seconds);
  }

  /* Screen-level weather for the Mage's Air heavy: a CSS blur/darken on the
     canvas wrapper rather than a canvas effect, so it costs nothing to draw. */
  tempest(seconds = 1.2) {
    this.tempestT = Math.max(this.tempestT || 0, seconds);
    document.getElementById('stage').classList.add('tempest');
  }

  updateTempest(dt) {
    if (!this.tempestT) return;
    this.tempestT = Math.max(0, this.tempestT - dt);
    if (this.tempestT <= 0) document.getElementById('stage').classList.remove('tempest');
  }

  /* ---------------- boss parry: the rhythm break ----------------
     Parrying a boss doesn't just stagger it — it stops the world. All spatial
     movement freezes and a WASD prompt sequence opens. Hit the beats and the
     boss eats a punish scaled to how many you landed; miss and you get
     nothing but the ordinary parry. */

  startRhythm(boss) {
    const beats = 4 + Math.min(2, boss.phase - 1);      // 4..6
    const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
    const glyph = { KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D' };
    this.rhythm = {
      boss,
      // 1-based beat numbering, like every other authored sequence here.
      beats: Seq.range(Seq.FIRST, beats).map(() => {
        const k = U.pick(keys);
        return { code: k, glyph: glyph[k], state: 'pending' };
      }),
      current: Seq.FIRST,
      t: 0,
      window: 0.75,        // seconds per beat
      hits: 0,
      done: false,
      outT: 0,
    };
    this.fx.addFlash('#ffffff', 0.4);
    this.fx.addShake(10);
    this.audio.parryHit();
    this.toast('The world holds. Break the rhythm.', 2);
  }

  rhythmKey(code) {
    const r = this.rhythm;
    if (!r || r.done) return;
    const beat = Seq.get(r.beats, r.current);
    if (!beat) return;
    if (code === beat.code) {
      beat.state = 'hit';
      r.hits++;
      this.audio.blip(880 + r.hits * 120, 0.09, 0.11, 'triangle');
      this.fx.addFlash('#8fd4ff', 0.12);
    } else {
      beat.state = 'miss';
      this.audio.blip(150, 0.14, 0.1, 'sawtooth');
    }
    this.advanceRhythm();
  }

  advanceRhythm() {
    const r = this.rhythm;
    r.t = 0;
    r.current++;
    if (r.current > Seq.last(r.beats)) this.finishRhythm();
  }

  finishRhythm() {
    const r = this.rhythm;
    r.done = true;
    r.outT = 1.1;
    const b = r.boss;
    const total = r.beats.length;
    const perfect = r.hits === total;

    if (b && !b.dead && r.hits > 0) {
      /* 3% of max health per beat, 1.5x on a clean run. Note the boss is
         already staggered from the parry that opened this, so PARRY.vuln
         multiplies whatever lands here — at 6% a perfect break was removing
         three quarters of a 3000 HP boss in one exchange. */
      const dmg = b.maxHp * 0.03 * r.hits * (perfect ? 1.5 : 1);
      b.takeDamage(dmg, this, this.player.x, this.player.y, 0, perfect);
      b.stun = Math.max(b.stun, perfect ? 2.4 : 1.4);
      b.stagger = Math.max(b.stagger, perfect ? 2.4 : 1.4);
      this.fx.addShake(perfect ? 22 : 12);
      this.fx.addFlash(perfect ? '#ffffff' : '#8fd4ff', perfect ? 0.5 : 0.25);
      this.audio.explode();
    }
    this.player.energy = this.player.maxEnergy;
    if (this.player.usesMana) this.player.mana = this.player.maxMana;
    this.toast(perfect ? 'PERFECT BREAK' : `${r.hits} of ${total} landed`, 2.5);
  }

  updateRhythm(dt) {
    const r = this.rhythm;
    if (!r) return true;                 // no minigame: world runs normally
    if (r.done) {
      r.outT -= dt;
      if (r.outT <= 0) this.rhythm = null;
      return false;
    }
    r.t += dt;
    if (r.t >= r.window) {
      Seq.get(r.beats, r.current).state = 'miss';
      this.audio.blip(150, 0.14, 0.08, 'sawtooth');
      this.advanceRhythm();
    }
    return false;                        // world stays frozen
  }

  drawRhythm(ctx) {
    const r = this.rhythm;
    if (!r) return;
    const cx = this.vw / 2, cy = this.vh / 2;
    const n = r.beats.length;
    const gap = 76;
    const x0 = cx - ((n - 1) * gap) / 2;

    ctx.save();
    ctx.globalAlpha = r.done ? U.clamp(r.outT, 0, 1) * 0.55 : 0.55;
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.globalAlpha = r.done ? U.clamp(r.outT, 0, 1) : 1;

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(240,230,210,.75)';
    ctx.font = '600 12px system-ui';
    ctx.fillText('BREAK THE RHYTHM', cx, cy - 74);

    Seq.each(r.beats, (beat, number) => {
      const x = x0 + (number - Seq.FIRST) * gap;
      const active = !r.done && number === r.current;
      const size = active ? 34 : 27;

      ctx.strokeStyle = beat.state === 'hit' ? '#8fd4ff'
        : beat.state === 'miss' ? '#c8452f'
        : active ? '#ffffff' : 'rgba(255,255,255,.22)';
      ctx.lineWidth = active ? 3 : 2;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x - size, cy - size, size * 2, size * 2, 8)
        : ctx.rect(x - size, cy - size, size * 2, size * 2);
      ctx.stroke();

      if (beat.state === 'hit') {
        ctx.fillStyle = 'rgba(143,212,255,.18)';
        ctx.fill();
      }

      // Timing ring on the live beat.
      if (active) {
        const left = 1 - U.clamp(r.t / r.window, 0, 1);
        ctx.strokeStyle = left > 0.35 ? '#8fd4ff' : '#ffb347';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, cy, size + 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
        ctx.stroke();
      }

      ctx.fillStyle = beat.state === 'hit' ? '#8fd4ff'
        : beat.state === 'miss' ? '#c8452f'
        : active ? '#ffffff' : 'rgba(255,255,255,.35)';
      ctx.font = `700 ${active ? 30 : 24}px system-ui`;
      ctx.fillText(beat.glyph, x, cy + (active ? 11 : 9));
    });

    ctx.fillStyle = 'rgba(240,230,210,.5)';
    ctx.font = '11px system-ui';
    ctx.fillText(r.done ? `${r.hits} / ${n}` : 'press the key shown', cx, cy + 78);
    ctx.restore();
  }

  /* Reading an attack correctly should feel loud. A parry refunds energy,
     opens the attacker, and stops the hit dead. */
  onParry(p, opts) {
    p.parryT = 0;
    p.parryCd = PARRY.cdSuccess;
    p.parryFlash = 0.4;
    p.parries++;
    p.energy = Math.min(p.maxEnergy, p.energy + PARRY.refund);
    p.iframes = Math.max(p.iframes, 0.16);   // brief grace so packs can't chain you

    const a = opts.x !== undefined ? U.angle(p.x, p.y, opts.x, opts.y) : p.aim;
    this.fx.ring(p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18, 26, '#8fd4ff', 26);
    this.fx.spark(p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22, {
      count: 20, color: ['#ffffff', '#8fd4ff', '#cfe4ff'], dir: a, spread: 1.2,
      speedMax: 320, lifeMax: 0.5, sizeMax: 4,
    });
    this.fx.addShake(6);
    this.fx.addFlash('#8fd4ff', 0.16);
    this.audio.parryHit();

    const src = opts.source;
    if (src && !src.dead && !opts.projectile) src.onParried(this);

    // Parrying a boss (or a miniboss) stops the world and opens the rhythm break.
    if (src && !src.dead && src.def && (src.def.boss || src.def.big)) {
      this.startRhythm(src);
      return;
    }

    /* Perfect Parry — a 1-in-20 execution. Bosses are never eligible: a
       lottery ending a set-piece fight would gut it. */
    // Nor is John Space mid-trial: the whole point is that you never hit him.
    const executable = src && !src.dead && src.takeDamage && !src.noExecute && !src.trial && !src.neutral;
    if (executable && U.randi(1, PARRY.perfectOdds + 1) === Seq.FIRST) {
      this.fx.text(p.x, p.y - 44, 'PERFECT PARRY', '#ffffff', 24);
      this.fx.text(src.x, src.y - 40, 'EXECUTED', '#8fd4ff', 18);
      this.fx.ring(src.x, src.y, src.radius * 1.6, '#ffffff', 40);
      this.fx.spark(src.x, src.y, {
        count: 40, color: ['#ffffff', '#8fd4ff'], speedMax: 420, lifeMax: 0.8, sizeMax: 5,
      });
      this.impactFreeze(0.11);
      this.fx.addShake(14);
      this.fx.addFlash('#ffffff', 0.35);
      this.audio.freeze();
      src.takeDamage(src.hp + 9999, this, p.x, p.y, 0, true);
      p.perfectParries = (p.perfectParries || 0) + 1;
    } else {
      this.fx.text(p.x, p.y - 44, 'PARRY', '#8fd4ff', 20);
    }
  }

  onDodge(p, opts) {
    this.fx.text(p.x, p.y - 40, 'DODGE', '#d8d2c4', 14);
    this.fx.spark(p.x, p.y, {
      count: 6, color: ['#d8d2c4'], speedMax: 130, lifeMax: 0.3, sizeMax: 2.5, glow: false,
    });
    this.audio.dodge();
    void opts;
  }

  onPlayerDeath() {
    this.fx.addShake(20);
    this.fx.addFlash('#c8452f', 0.9);
    setTimeout(() => this.endRun(false), 900);
  }

  onBossDefeated() {
    const def = Maps.byNumber(this.mapNumber);
    const fallen = this.boss;
    if (fallen) this.bossSay(fallen, 'death');
    Save.updateMeta(m => {
      const type = fallen ? fallen.type : def.bossType;
      if (!m.bossesFelled.includes(type)) m.bossesFelled.push(type);
    });

    /* Sarapolis has a second act: when the gate boss falls, the final boss
       steps out of the wreckage with its own intro. The room stays sealed. */
    if (def.finalBoss && fallen && fallen.type !== def.finalBoss.type) {
      // Counted in game time (see update), so a menu cannot swallow it.
      this.boss = null;
      this.pendingFinal = { t: 2.6, x: fallen.x, y: fallen.y, tier: fallen.tier };
      this.toast(`${def.bossName} falls... but the room stays sealed.`, 4);
      return;
    }

    this.bossActive = false;
    this.bossDefeated = true;
    this.dungeon.sealed = false;
    this.boss = null;

    const isLast = Maps.isLast(this.mapNumber);
    const name = fallen ? fallen.def.name : def.bossName;
    this.toast(isLast
      ? `${name} falls. The deep is yours.`
      : `${name} falls. A way down opens.`, 6);

    /* Counted in game time. This used to be a 2.8s setTimeout that bailed
       out if the game was not 'playing' when it fired — and a boss kill
       usually levels you up, so the perk screen was open at exactly that
       moment and the run never moved on. */
    this.pendingDescend = { t: 2.8, isLast };
  }

  descend() {
    const player = this.player;
    player.heal(Math.round(player.maxHp * 0.5));
    player.energy = player.maxEnergy;
    // Generate the next map while the boss death still fills the screen.
    this.loadMap(Maps.next(this.mapNumber), { player });
    this.fx.addFlash('#ffffff', 0.7);
    this.saveNow();
  }

  endRun(won) {
    this.state = 'end';
    const p = this.player;
    const mins = Math.floor(this.time / 60), secs = Math.floor(this.time % 60);

    // A run is over: the resume save dies with it, but the meta record keeps.
    Save.clearRun(this.saveSlot);
    Save.updateMeta(m => {
      if (won) {
        m.wins++;
        if (this.hard) m.hardWins = (m.hardWins || 0) + 1;
        if (m.bestTime === null || this.time < m.bestTime) m.bestTime = this.time;
      } else m.deaths++;
    });

    document.getElementById('endTitle').textContent = won ? 'The Deep Is Yours' : 'You Died';
    document.getElementById('endSub').textContent = won
      ? `You went down with ${Seq.get(p.cls.tiers, Seq.FIRST).weapon.toLowerCase()} and walked out of ${Maps.byNumber(Maps.LAST).name}${this.hard ? ' — on HARD' : ''}.`
      : `${Maps.byNumber(this.mapNumber).name} keeps you. The ${p.weaponName.toLowerCase()} was not enough.`;
    document.getElementById('endStats').innerHTML = [
      ['Class', `${p.cls.className} (${p.weaponName})`],
      ['Difficulty', this.hard ? 'HARD' : 'Normal'],
      ['Reached', Maps.byNumber(this.mapNumber).name],
      ['Level', `${p.level}`],
      ['Enemies slain', `${p.kills}`],
      ['Gold gathered', `${p.gold}`],
      ['Weapon rank', U.roman(p.weaponLevel)],
      ['Boons taken', `${p.perksTaken.length}`],
      ['Time', `${mins}m ${String(secs).padStart(2, '0')}s`],
      ['World seed', this.seedText],
    ].map(([k, v]) => `<div class="k">${k}</div><div class="v">${v}</div>`).join('');
    document.getElementById('endscreen').classList.remove('hidden');
  }

  /* ---------------- pause / map / level up ---------------- */

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      const p = this.player;
      document.getElementById('pauseStats').innerHTML = [
        ['Class', `${p.cls.className} — ${p.weaponName}`],
        ['Difficulty', this.hard ? 'HARD' : 'Normal'],
        ['Level', `${p.level}`],
        ['Health', `${Math.ceil(p.hp)} / ${p.maxHp}`],
        ['Damage', `${Math.round(p.power * 100)}%`],
        ['Weapon rank', U.roman(p.weaponLevel)],
        ['Kills', `${p.kills}`],
        ['Gold', `${p.gold}`],
        ['Boons', p.perksTaken.length ? p.perksTaken.map(id => PERKS.find(x => x.id === id).name).join(', ') : '—'],
        ['Seed', this.seedText],
      ].map(([k, v]) => `<div class="k">${k}</div><div class="v">${v}</div>`).join('');
      document.getElementById('musicBtn').textContent = `Music: ${this.audio.music.on ? 'On' : 'Off'}`;
      document.getElementById('pause').classList.remove('hidden');
    } else if (this.state === 'paused') {
      this.state = 'playing';
      document.getElementById('pause').classList.add('hidden');
    }
  }

  toggleMap() {
    if (this.state === 'playing') {
      this.state = 'map';
      this.drawBigMap();
      document.getElementById('mapscreen').classList.remove('hidden');
    } else if (this.state === 'map') {
      this.state = 'playing';
      document.getElementById('mapscreen').classList.add('hidden');
    }
  }

  queueLevelUp() {
    this.pendingLevelUps++;
    this.fx.ring(this.player.x, this.player.y, 30, '#ffd479', 26);
    this.fx.text(this.player.x, this.player.y - 40, 'LEVEL UP', '#ffd479', 20);
    this.audio.levelUp();
  }

  openPerkChoice(source = 'level') {
    this.perkSource = source;
    this.state = 'levelup';
    const p = this.player;
    document.getElementById('luTitle').textContent =
      source === 'shrine' ? 'Forgotten Shrine' : `Level ${p.level}`;
    document.querySelector('#levelup .sub').textContent =
      source === 'shrine' ? 'The stone offers a gift.' : 'Choose a boon.';

    const list = document.getElementById('perkList');
    list.innerHTML = '';
    for (const perk of rollPerks(p.classId, p.perksTaken, 3, source)) {
      const btn = document.createElement('button');
      btn.className = 'perk' + (perk.shrine ? ' shrine-perk' : '');
      btn.innerHTML = `<div class="icon">${perk.icon}</div><h3>${perk.name}</h3><p>${perk.desc}</p>`;
      btn.onclick = () => this.takePerk(perk);
      list.appendChild(btn);
    }
    document.getElementById('levelup').classList.remove('hidden');
  }

  takePerk(perk) {
    perk.apply(this.player);
    this.player.perksTaken.push(perk.id);
    document.getElementById('levelup').classList.add('hidden');
    this.state = 'playing';
    this.fx.ring(this.player.x, this.player.y, 34, this.player.cls.color, 22);
    this.audio.blip(1200, 0.18, 0.1, 'triangle');
    this.toast(`${perk.name} — ${perk.desc}`, 3.2);
  }

  /* ---------------- loadout roulette (R) ----------------
     Tap R to cycle to the next slot; hold it to open the wheel, point, and
     release to pick. Holding also slows time, so switching mid-fight is a
     decision rather than a scramble. */

  openRoulette() {
    if (this.state !== 'playing' || !this.player || !this.player.loadout) return;
    this.roulette.open = true;
    this.roulette.held = 0;
    this.roulette.index = this.player.slot;
  }

  closeRoulette() {
    const r = this.roulette;
    if (!r.open) return;
    r.open = false;
    const p = this.player;
    if (!p || !p.loadout) return;
    // A quick tap is a cycle; a deliberate hold commits to what you pointed at.
    const picked = r.held < 0.2 ? p.cycleSlot(1) : p.setSlot(r.slot);
    this.hudCache.slot = null;
    this.fx.text(p.x, p.y - 46, picked.name, picked.color, 17);
    this.fx.ring(p.x, p.y, 26, picked.color, 18);
    this.audio.blip(760, 0.09, 0.08, 'triangle');
  }

  updateRoulette(dt) {
    const r = this.roulette;
    if (!r.open) return;
    r.held += dt;
    const opts = this.player.loadout.options;
    // Point away from the centre to choose; stay near it to keep your pick.
    const dx = this.mouse.x - this.vw / 2, dy = this.mouse.y - this.vh / 2;
    if (Math.hypot(dx, dy) > 45) {
      const a = Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2;
      const wedge = Math.floor((a % (Math.PI * 2)) / (Math.PI * 2) * opts.length) % opts.length;
      r.slot = Seq.toNumber(wedge);
    }
  }

  drawRoulette(ctx) {
    const r = this.roulette;
    if (!r.open || !this.player.loadout) return;
    const opts = this.player.loadout.options;
    const cx = this.vw / 2, cy = this.vh / 2;
    const inner = 58, outer = 132;
    const seg = (Math.PI * 2) / opts.length;

    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.globalAlpha = 1;

    for (let i = 0; i < opts.length; i++) {
      const o = opts[i];
      const a0 = -Math.PI / 2 + i * seg, a1 = a0 + seg;
      const on = Seq.toNumber(i) === r.slot;
      ctx.beginPath();
      ctx.arc(cx, cy, on ? outer + 10 : outer, a0 + 0.03, a1 - 0.03);
      ctx.arc(cx, cy, inner, a1 - 0.03, a0 + 0.03, true);
      ctx.closePath();
      ctx.fillStyle = on ? o.color : 'rgba(22,20,28,.88)';
      ctx.globalAlpha = on ? 0.28 : 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = on ? o.color : 'rgba(255,255,255,.14)';
      ctx.lineWidth = on ? 2.5 : 1;
      ctx.stroke();

      const mid = a0 + seg / 2;
      const lx = cx + Math.cos(mid) * (inner + outer) / 2;
      const ly = cy + Math.sin(mid) * (inner + outer) / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = on ? '#fff' : 'rgba(232,226,212,.7)';
      ctx.font = '20px system-ui';
      ctx.fillText(o.icon, lx, ly - 4);
      ctx.font = `${on ? '700 ' : ''}11px system-ui`;
      ctx.fillText(o.name, lx, ly + 15);
    }

    const cur = Seq.get(opts, r.slot);
    ctx.textAlign = 'center';
    ctx.fillStyle = cur.color;
    ctx.font = '600 15px system-ui';
    ctx.fillText(cur.name, cx, cy - 4);
    ctx.fillStyle = 'rgba(232,226,212,.72)';
    ctx.font = '11px system-ui';
    ctx.fillText(this.player.loadout.label, cx, cy + 13);

    ctx.fillStyle = 'rgba(232,226,212,.5)';
    ctx.font = '11px system-ui';
    ctx.fillText(cur.desc, cx, cy + outer + 40);
    ctx.fillText('point and release  ·  tap R to cycle', cx, cy + outer + 58);
    ctx.restore();
  }

  /* ---------------- world interaction ---------------- */

  nearbyProp() {
    return this.propHash.nearest(this.player.x, this.player.y, 72, p => !p.used);
  }

  // John Space, still neutral and within reach: E is how you provoke him.
  nearbyJohn() {
    const j = this.johnSpace;
    if (!j || j.dead || !j.neutral || j.trial || j.enraged) return null;
    return U.dist(this.player.x, this.player.y, j.x, j.y) < 86 ? j : null;
  }

  interact() {
    if (this.state !== 'playing' || this.cinematic) return;
    const john = this.nearbyJohn();
    if (john) { john.startTrial(this); this.hudCache.prompt = null; return; }
    const prop = this.nearbyProp();
    if (!prop) return;
    const p = this.player;

    if (prop.type === 'merchant') { this.openShop(prop); return; }

    if (prop.type === 'chest') {
      prop.used = true;
      const base = prop.rich ? U.randi(60, 110) : U.randi(18, 46);
      const gold = Math.round(base * (1 + p.level * 0.08) * p.goldMul);
      p.gold += gold;
      this.fx.text(prop.x, prop.y - 24, `+${gold} gold`, '#e2b34a', 17);
      // Update 3.0: chests sometimes hold an accessory.
      if (U.chance(prop.rich ? 0.6 : 0.12)) {
        const pool = ACCESSORIES.filter(a => !a.cursed && !a.unique && a.price < (prop.rich ? 900 : 400) * this.mapNumber);
        const item = U.pick(pool);
        p.bag.push(item.id);
        this.fx.text(prop.x, prop.y - 44, item.name, Gear.rarity(item).color, 15);
        this.toast(`Found: ${item.name} — ${item.desc} (I to equip)`, 4);
      }
      this.fx.spark(prop.x, prop.y, { count: 26, color: ['#e2b34a', '#fff1c9'], speedMax: 220, gravity: 300, lifeMax: 0.9 });
      if (prop.rich || U.chance(0.4)) this.pickups.push(new Pickup('shard', prop.x, prop.y, 1));
      if (U.chance(0.5)) this.pickups.push(new Pickup('heart', prop.x, prop.y, 22));
      this.audio.blip(700, 0.2, 0.12, 'triangle');

    } else if (prop.type === 'fountain') {
      prop.used = true;
      // Hard mode: the water is thinner.
      const healed = p.heal(Math.round(p.maxHp * (this.hard ? 0.3 : 0.45)));
      p.energy = p.maxEnergy;
      // Companions drink too — the reason to save a fountain rather than
      // sip it the moment you find one.
      for (const c of this.companions) {
        if (c.dead) continue;
        const h = c.heal(c.maxHp);
        if (h > 0) {
          this.fx.text(c.x, c.y - 30, `+${h}`, c.def.color, 14);
          this.fx.ring(c.x, c.y, 22, c.def.color, 16);
        }
      }
      this.fx.text(prop.x, prop.y - 24, `+${healed}`, '#6fbf73', 18);
      this.fx.ring(prop.x, prop.y, 28, '#6fbf73', 22);
      this.audio.blip(520, 0.3, 0.1, 'sine');

    } else if (prop.type === 'shrine') {
      prop.used = true;
      this.audio.shrine();
      this.openPerkChoice('shrine');

    } else if (prop.type === 'cage') {
      // One of each kind per dungeon: until you go down a level, the one you
      // already have (or had) is the only one you get.
      if (this.companionKinds.has(prop.npc)) {
        this.toast(`You already found ${COMPANIONS[prop.npc].name} in this dungeon.`, 3.5);
        this.audio.blip(200, 0.15, 0.08, 'triangle');
        return;
      }
      prop.used = true;
      this.companionKinds.add(prop.npc);
      const c = new Companion(prop.npc, prop.x, prop.y);
      this.companions.push(c);
      this.fx.ring(prop.x, prop.y, 44, c.def.color, 30);
      this.fx.spark(prop.x, prop.y, {
        count: 26, color: [c.def.color, '#ffffff'], speedMax: 240, lifeMax: 0.7, sizeMax: 4,
      });
      this.fx.text(prop.x, prop.y - 30, c.def.name, c.def.color, 18);
      this.toast(`${c.def.name} is free. ${c.def.blurb}`, 5);
      this.audio.summon();

    } else if (prop.type === 'redshrine') {
      this.wakeRedShrine(prop);

    } else if (prop.type === 'classshrine') {
      prop.used = true;
      const s = prop.shrine;
      if (Shrines.matches(s, p)) {
        s.apply(p);
        this.fx.text(prop.x, prop.y - 30, s.name, s.color, 18);
        this.toast(`${s.name} — ${s.boon}`, 4.5);
        this.fx.ring(prop.x, prop.y, 40, s.color, 30);
        this.audio.freeze();
      } else {
        // Wrong altar: it still gives you something, just not its gift.
        const gold = Math.round(U.randi(20, 55) * p.goldMul);
        p.gold += gold;
        p.heal(12);
        this.fx.text(prop.x, prop.y - 30, `not your altar  +${gold}`, '#8fa0b8', 14);
        this.toast(`${s.name} does not answer to a ${p.cls.className.toLowerCase()}.`, 3.5);
        this.audio.blip(240, 0.2, 0.1, 'triangle');
      }

    } else if (prop.type === 'yellowshrine') {
      prop.used = true;
      const { blessed, effect } = prop.roll;
      effect.apply(p);
      this.fx.ring(prop.x, prop.y, 46, blessed ? '#ffd479' : '#b03a2f', 34);
      this.fx.spark(prop.x, prop.y, {
        count: 30, color: blessed ? ['#ffd479', '#fff1c9'] : ['#b03a2f', '#ff6b52'],
        speedMax: 260, lifeMax: 0.8, sizeMax: 4,
      });
      this.fx.text(prop.x, prop.y - 32, blessed ? 'BLESSED' : 'CURSED',
        blessed ? '#ffd479' : '#ff6b52', 20);
      this.toast(`${blessed ? 'Blessing' : 'Curse'} — ${effect.name}: ${effect.desc}`, 4.5);
      this.fx.addFlash(blessed ? '#ffd479' : '#c8452f', 0.28);
      this.audio[blessed ? 'freeze' : 'explode']();
      this.hudCache.prompt = null;

    } else if (prop.type === 'corruptshrine') {
      this.wakeCorruptShrine(prop);

    } else if (prop.type === 'gate') {
      if (this.bossDefeated) return;
      // The gate stays bound until every red shrine is out.
      const down = this.shrinesDown, total = this.dungeon.redShrineCount;
      if (down < total) {
        this.toast(`The gate is bound. ${total - down} red shrine${total - down === 1 ? '' : 's'} still burn.`, 3.5);
        this.fx.addShake(3);
        this.audio.blip(110, 0.25, 0.12, 'sawtooth');
        return;
      }
      prop.used = true;
      this.startBossFight(prop.room);
    }
  }

  get shrinesDown() {
    if (!this.dungeon) return 0;
    return this.dungeon.props.filter(p => p.type === 'redshrine' && p.used).length;
  }

  /* Deactivating a shrine is a fight, not a fetch: it calls guardians, and
     only goes dark when the last of them is down. */
  wakeRedShrine(prop) {
    if (prop.used || prop.active) return;
    prop.active = true;
    prop.wave = [];

    const threat = prop.room.threat;
    const table = Maps.byNumber(this.mapNumber).tables[U.clamp(prop.room.tier, 0, 5)];
    const count = 4 + Math.min(3, Math.floor(threat / 2));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + U.rand(-0.3, 0.3);
      const elite = i === count - 1;
      const type = U.pick(table);
      // Size the clearance to the actual body (elites are 25% bigger), so
      // nothing is placed overlapping rock or on the far side of a wall.
      const bodyR = ENEMY_TYPES[type].radius * (elite ? 1.25 : 1) + 2;
      const spot = this.safeSpawnNear(prop.x, prop.y, U.rand(90, 170), a, bodyR);
      const e = this.spawnEnemy(type, spot.x, spot.y, threat, elite);
      e.aggro = true;
      e.guardian = prop;   // marks it on screen and on the minimap
      prop.wave.push(e);
    }
    prop.waveTotal = prop.wave.length;

    this.fx.ring(prop.x, prop.y, 60, '#ff3b1f', 40);
    this.fx.addShake(9);
    this.fx.addFlash('#c8452f', 0.35);
    this.toast('The shrine calls its guardians. Put them down.', 4);
    this.audio.blip(90, 0.6, 0.18, 'sawtooth');
  }

  /* Corrupted shrine: wakes a single oversized elite. The shrine cannot be
     claimed until it is dead, and the payout is worth the fight. */
  wakeCorruptShrine(prop) {
    if (prop.used || prop.active) return;
    prop.active = true;

    const threat = prop.room.threat + 1;
    const a = U.rand(0, Math.PI * 2);
    const def = ENEMY_TYPES[prop.minibossType];
    // Update 4.0: a genuine 50,000 HP miniboss rather than a swollen elite.
    const big = !!def.big;
    const spot = this.safeSpawnNear(prop.x, prop.y, 130, a, def.radius * (big ? 1 : 1.25) + 2);
    const boss = this.spawnEnemy(prop.minibossType, spot.x, spot.y, threat, !big);
    boss.aggro = true;
    if (!big) {
      boss.maxHp = Math.round(boss.maxHp * 1.8);
      boss.hp = boss.maxHp;
    }
    boss.corruptGuard = prop;
    boss.titleName = def.name.startsWith('Corrupted') ? def.name : 'Corrupted ' + def.name;
    prop.guard = boss;

    this.fx.ring(prop.x, prop.y, 70, '#b05cff', 44);
    this.fx.addShake(11);
    this.fx.addFlash('#b05cff', 0.4);
    this.toast('The corruption answers. Something wakes.', 4);
    this.audio.blip(80, 0.7, 0.2, 'sawtooth');
  }

  updateCorruptShrines() {
    for (const prop of this.dungeon.props) {
      if (prop.type !== 'corruptshrine' || !prop.active || prop.used) continue;
      if (prop.guard && !prop.guard.dead) continue;

      prop.active = false;
      prop.used = true;
      const p = this.player;
      const gold = Math.round(U.randi(600, 1200) * p.goldMul);
      p.gold += gold;
      this.pickups.push(new Pickup('shard', prop.x, prop.y, 1));
      this.pickups.push(new Pickup('shard', prop.x, prop.y, 1));
      this.pickups.push(new Pickup('heart', prop.x, prop.y, 30));
      this.fx.ring(prop.x, prop.y, 60, '#b05cff', 40);
      this.fx.text(prop.x, prop.y - 30, `corruption cleansed  +${gold}`, '#d0a6ff', 17);
      this.toast('The corrupted shrine goes quiet. It pays what it owes.', 4);
      this.audio.freeze();
      this.hudCache.prompt = null;
    }
  }

  /* Two minutes of being left alone and John Space simply joins you. The
     Enemy is removed and a 500 HP Companion takes its place. */
  johnBefriended(enemy) {
    if (enemy.dead) return;
    const viaTrial = enemy.trial;
    enemy.dead = true;
    if (this.johnSpace === enemy) this.johnSpace = null;
    this.companionKinds.add('johnspace');
    const c = new Companion('johnspace', enemy.x, enemy.y);
    // Earning him the hard way is worth a couple of levels.
    if (viaTrial) c.gainXp(companionXpNeeded(1) + companionXpNeeded(2), this);
    this.companions.push(c);
    this.fx.ring(enemy.x, enemy.y, 60, '#8fd4ff', 40);
    this.fx.spark(enemy.x, enemy.y, {
      count: 40, color: ['#8fd4ff', '#ffffff'], speedMax: 300, lifeMax: 0.9, sizeMax: 5,
    });
    this.fx.text(enemy.x, enemy.y - 44, 'JOHN SPACE JOINS YOU', '#8fd4ff', 19);
    this.toast(viaTrial
      ? 'Two minutes, and you never hit back. "Alright. I\'m with you."'
      : 'You left him alone for two minutes. John Space appreciates that.', 6);
    this.audio.freeze();
  }

  /* Companions keep nothing when they go: their gear returns to your bag. */
  returnCompanionGear(c) {
    if (!this.player || !c.equip) return;
    for (const slot of Object.keys(c.equip)) {
      if (!c.equip[slot]) continue;
      Gear.unequip(this.player, c, slot);
    }
  }

  /* The Cursed Totem on a companion: they turn on you. The companion is gone,
     and in its place stands an enemy wearing its face — and the totem, which
     drops back to you when it falls. */
  companionTurns(c) {
    const others = { ...c.equip, ring: null };
    c.dead = true;
    for (const id of Object.values(others)) if (id) this.player.bag.push(id);
    c.equip = Gear.blankEquip();
    const e = this.spawnEnemy('turncoat', c.x, c.y, this.currentRoom ? this.currentRoom.threat + 1 : 2, true);
    e.def = { ...e.def, name: `${c.def.name} (Cursed)`, color: '#b03a2f', dark: c.def.dark };
    e.titleName = e.def.name;
    e.maxHp = Math.round(c.maxHp * 1.5);
    e.hp = e.maxHp;
    e.aggro = true;
    e.dropsTotem = true;
    this.fx.ring(c.x, c.y, 60, '#ff3b1f', 44);
    this.fx.addFlash('#c8452f', 0.5);
    this.fx.addShake(14);
    this.fx.text(c.x, c.y - 44, 'THE TOTEM TAKES THEM', '#ff6b52', 18);
    this.toast(`${c.def.name} put on the Cursed Totem — and turned on you.`, 5);
    this.audio.blip(70, 0.8, 0.22, 'sawtooth');
  }

  updateRedShrines() {
    this.activeShrine = null;
    for (const prop of this.dungeon.props) {
      if (prop.type !== 'redshrine' || !prop.active || prop.used) continue;

      prop.remaining = prop.wave.reduce((n, e) => n + (e.dead ? 0 : 1), 0);
      if (prop.remaining > 0) { this.activeShrine = prop; continue; }

      prop.active = false;
      prop.used = true;
      const down = this.shrinesDown, total = this.dungeon.redShrineCount;
      this.fx.ring(prop.x, prop.y, 70, '#ff3b1f', 46);
      this.fx.spark(prop.x, prop.y, {
        count: 40, color: ['#ff5a3c', '#ffd479', '#ffffff'], speedMax: 320, lifeMax: 0.9, sizeMax: 5,
      });
      this.fx.addShake(10);
      this.audio.freeze();
      this.hudCache.shrines = null;

      if (down >= total) {
        this.toast('The last shrine dies. The gate opens.', 6);
        this.fx.addFlash('#ffffff', 0.5);
      } else {
        this.toast(`Shrine extinguished — ${down} of ${total}.`, 3.5);
      }
      this.pickups.push(new Pickup('heart', prop.x, prop.y, 25));
      this.pickups.push(new Pickup('shard', prop.x, prop.y, 1));
    }
  }

  startBossFight(room) {
    const def = Maps.byNumber(this.mapNumber);
    this.bossActive = true;
    this.dungeon.sealed = true;
    this.boss = this.spawnEnemy(def.bossType, room.wx, room.wy - 40, room.threat, false);
    // Boss health is set per map rather than inherited from tier scaling, so
    // it stays tuned as maps are added or reordered.
    if (def.bossHp) {
      const hp = Math.round(def.bossHp * (this.hard ? 1.5 : 1));
      this.boss.maxHp = hp; this.boss.hp = hp;
    }
    this.boss.aggro = true;
    this.audio.blip(70, 0.7, 0.2, 'sawtooth');
    this.startCinematic(this.boss);
  }

  /* ---------------- Update 3.0: boss intros and lines ----------------
     Every boss gets an entrance: the world stops, the camera finds it, the
     bars come down, its name card rises, and it speaks. Any of E / Space /
     Enter / Esc skips. In the fight it talks on phase changes, sometimes
     before a heavy, and once more when it falls. */

  startCinematic(boss) {
    const lines = (BOSS_LINES[boss.type] || {}).intro || ['...'];
    this.cinematic = { boss, t: 0, dur: 2.2 + lines.length * 1.9, lines };
    this.speech = null;
    this.player.charging = false;
    for (const k of ['left', 'right', 'up', 'down']) this.input[k] = 0;
    this.fx.addShake(12);
    this.audio.blip(55, 1.2, 0.2, 'sawtooth');
    this.audio.roar();
  }

  skipCinematic() {
    if (this.cinematic) this.cinematic.t = Math.max(this.cinematic.t, this.cinematic.dur - 0.35);
  }

  updateCinematic(dt) {
    const c = this.cinematic;
    c.t += dt;
    // Ease the camera onto the boss, and back to the player at the end.
    const focus = c.t < c.dur - 0.6 ? c.boss : this.player;
    const tx = focus.x - this.vw / 2, ty = focus.y - this.vh / 2;
    this.cam.x = U.damp(this.cam.x, tx, 0.09, dt);
    this.cam.y = U.damp(this.cam.y, ty, 0.09, dt);
    // The boss rises into place over the first second.
    c.boss.introScale = U.clamp(c.t / 1.1, 0, 1);
    if (c.t >= c.dur) {
      c.boss.introScale = 1;
      this.cinematic = null;
      this.fx.addShake(18);
      this.fx.addFlash('#c8452f', 0.5);
      this.toast(`The gate seals. ${c.boss.def.name} wakes.`, 3.5);
    }
  }

  drawCinematic(ctx) {
    const c = this.cinematic;
    if (!c) return;
    const t = c.t, W = this.vw, H = this.vh;
    const bar = Math.min(1, t / 0.5, (c.dur - t) / 0.4) * H * 0.12;
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, bar);
    ctx.fillRect(0, H - bar, W, bar);

    // Name card.
    const card = U.clamp((t - 0.5) / 0.6, 0, 1) * U.clamp((c.dur - t) / 0.4, 0, 1);
    ctx.globalAlpha = card;
    ctx.textAlign = 'center';
    ctx.fillStyle = c.boss.def.color;
    ctx.shadowBlur = 24; ctx.shadowColor = c.boss.def.color;
    ctx.font = '400 46px "Iowan Old Style", Palatino, Georgia, serif';
    ctx.fillText(c.boss.def.name.toUpperCase(), W / 2, H * 0.24 + (1 - card) * 20);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(240,230,210,.8)';
    ctx.font = '600 13px system-ui';
    ctx.fillText((c.boss.def.title || '').toUpperCase(), W / 2, H * 0.24 + 28);

    // Dialogue, typed out a line at a time.
    const lt = t - 1.2;
    if (lt > 0) {
      const i = Math.min(c.lines.length - 1, Math.floor(lt / 1.9));
      const line = c.lines[i];
      const shown = line.slice(0, Math.floor((lt - i * 1.9) * 40));
      const bw = Math.min(640, W * 0.8), bh = 52;
      const bx = (W - bw) / 2, by = H - bar - bh - 18;
      ctx.globalAlpha = card * 0.85;
      ctx.fillStyle = 'rgba(10,8,14,.9)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = c.boss.def.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.globalAlpha = card;
      ctx.fillStyle = '#f0e6d2';
      ctx.font = 'italic 17px "Iowan Old Style", Palatino, Georgia, serif';
      ctx.fillText(`“${shown}”`, W / 2, by + 32);
    }
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#f0e6d2';
    ctx.font = '11px system-ui';
    ctx.fillText('E — skip', W - 50, H - 12);
    ctx.restore();
  }

  bossSay(boss, key) {
    const set = (BOSS_LINES[boss.type] || {})[key];
    if (!set || !set.length) return;
    this.speech = { boss, text: U.pick(set), t: key === 'death' ? 3.5 : 2.8, max: key === 'death' ? 3.5 : 2.8 };
  }

  drawSpeech(ctx) {
    const s = this.speech;
    if (!s) return;
    const a = U.clamp(Math.min(s.t, s.max - s.t) / 0.25, 0, 1);
    const x = s.boss.x, y = s.boss.y - s.boss.radius - 40;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = 'italic 14px "Iowan Old Style", Palatino, Georgia, serif';
    const w = ctx.measureText(s.text).width + 22;
    ctx.fillStyle = 'rgba(10,8,14,.88)';
    ctx.fillRect(x - w / 2, y - 22, w, 30);
    ctx.strokeStyle = s.boss.def.color;
    ctx.strokeRect(x - w / 2, y - 22, w, 30);
    ctx.beginPath(); ctx.moveTo(x - 6, y + 8); ctx.lineTo(x, y + 16); ctx.lineTo(x + 6, y + 8); ctx.fill();
    ctx.fillStyle = '#f0e6d2';
    ctx.textAlign = 'center';
    ctx.fillText(s.text, x, y - 2);
    ctx.restore();
  }

  /* Shrine summons used to drop guardians on a bare ring, which could put
     them inside a wall or outside the world — where the spatial hash indexes
     them into a cell nothing ever queries, so they hang unreachable. This
     walks inward and then spirals until it finds real, walkable floor.

     Update 3.0: "walkable" now means the whole body fits (not just its
     centre point), and the spot must be in sight of where it was asked for —
     otherwise a guardian could be placed in the next corridor over, on the
     far side of a wall, which read as it having walked through the wall. */
  safeSpawnNear(x, y, radius, angle, bodyR = 16) {
    const d = this.dungeon;
    const maxX = (d.w - 1) * TILE, maxY = (d.h - 1) * TILE;
    const ok = (px, py) =>
      px > TILE && py > TILE && px < maxX && py < maxY
      && bodyFits(d, px, py, bodyR) && d.lineOfSight(x, y, px, py);

    // Preferred: on the requested ring, sweeping angles then closing inward.
    for (let ring = 0; ring < 8; ring++) {
      const r = radius * (1 - ring * 0.11);
      for (let step = 0; step < 12; step++) {
        const a = angle + step * (Math.PI / 6);
        const px = U.clamp(x + Math.cos(a) * r, TILE, maxX);
        const py = U.clamp(y + Math.sin(a) * r, TILE, maxY);
        if (ok(px, py)) return { x: px, y: py };
      }
    }

    /* Fallback: an actual outward tile scan. The old version returned the
       requested point when the ring search failed, which handed back the very
       solid tile it was asked to avoid — so a guardian could still be walled
       in. Searching tile centres cannot fail on a connected map. */
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    // Two passes: a spot the whole body fits in sight of the origin, then
    // (only if that fails) any floor tile at all.
    for (const strict of [true, false]) {
      for (let rad = 1; rad <= 14; rad++) {
        for (let ty = cy - rad; ty <= cy + rad; ty++) {
          for (let tx = cx - rad; tx <= cx + rad; tx++) {
            // Perimeter of this square ring only.
            if (Math.abs(ty - cy) !== rad && Math.abs(tx - cx) !== rad) continue;
            if (!d.inBounds(tx, ty) || d.isSolidTile(tx, ty)) continue;
            const px = (tx + 0.5) * TILE, py = (ty + 0.5) * TILE;
            if (strict && !(bodyFits(d, px, py, Math.min(bodyR, TILE * 0.49)) && d.lineOfSight(x, y, px, py))) continue;
            return { x: px, y: py };
          }
        }
      }
    }
    // Nothing within 14 tiles: put it on the player, who is provably standing
    // on floor. Better a bad placement than an unreachable one.
    return { x: this.player.x, y: this.player.y };
  }

  spawnEnemy(type, x, y, threat, elite, room = null) {
    /* Last-line guard. An enemy whose centre starts inside rock never gets
       pushed out — resolveAxis is a no-op at zero velocity — so it would sit
       there permanently, indexed into a spatial cell you can never reach.
       Snap it onto real floor before it ever enters the world. */
    const bodyR = ENEMY_TYPES[type].radius * (elite ? 1.25 : 1);
    if (this.dungeon && !ENEMY_TYPES[type].boss && !bodyFits(this.dungeon, x, y, bodyR)) {
      const safe = this.safeSpawnNear(x, y, 34, U.rand(0, Math.PI * 2), bodyR + 1);
      x = safe.x; y = safe.y;
    }
    const e = new Enemy(type, x, y, threat, elite);
    e.room = room;
    // Update 3.0: per-map difficulty (Tripolisis is a little gentler).
    const diff = Maps.byNumber(this.mapNumber).difficulty;
    if (diff && !e.def.boss && !e.def.noScale) {
      e.maxHp = Math.max(1, Math.round(e.maxHp * diff.hp));
      e.hp = e.maxHp;
      e.dmgScale *= diff.dmg;
      e.shotMul = diff.dmg;
    }
    // Minibosses are fixed at 50,000 HP; how hard they hit grows by stage.
    if (e.def.big) e.dmgScale = [0.55, 0.8, 1.1][U.clamp(this.mapNumber - 1, 0, 2)];
    /* Hard mode: everything has more health, hits harder, attacks faster
       and moves a little quicker. (Boss health is raised where it is set.) */
    if (this.hard) {
      if (!e.def.boss) { e.maxHp = Math.round(e.maxHp * 1.6); e.hp = e.maxHp; }
      e.dmgScale *= 1.5;
      if (!e.def.noScale) e.shotMul = (e.shotMul || 1) * 1.5;
      e.tempo *= 1.15;
      e.speed *= 1.1;
    }
    if (room) room.alive = (room.alive || 0) + 1;
    this.enemies.push(e);
    return e;
  }

  /* A miniboss down: the toast, the record, and — for the war machines —
     the unique accessory nobody sells. */
  onMinibossDefeated(e) {
    const name = e.titleName || e.def.name;
    this.toast(`${name} is down.`, 4);
    this.fx.addFlash('#ffffff', 0.4);
    this.fx.text(e.x, e.y - e.radius - 40, `${name.toUpperCase()} DESTROYED`, '#ffd479', 20);
    Save.updateMeta(m => {
      m.minibossesFelled = m.minibossesFelled || [];
      if (!m.minibossesFelled.includes(e.type)) m.minibossesFelled.push(e.type);
    });
    if (e.def.drops) this.grantUnique(e.def.drops);
  }

  grantUnique(id) {
    const p = this.player;
    const item = Gear.get(id);
    if (!item) return;
    const owned = p.bag.includes(id) || Object.values(p.equip).includes(id)
      || this.companions.some(c => Object.values(c.equip).includes(id));
    if (owned) {
      p.gold += 1500;
      this.toast(`You already carry the ${item.name}. It pays out instead: +1500.`, 4.5);
      return;
    }
    p.bag.push(id);
    this.toast(`UNIQUE: ${item.name} — ${item.desc} (I to equip)`, 6);
    this.fx.text(p.x, p.y - 50, item.name, '#4fffd0', 18);
    this.audio.shrine();
  }

  // Things that stick to you: Flowery's vines and Judgement's Prejudice.
  hazardEffect(effect) {
    const p = this.player;
    if (p.dead) return;
    if (effect === 'root') {
      p.rootT = Math.max(p.rootT, 0.8);
      this.fx.text(p.x, p.y - 44, 'ROOTED', '#8fd14a', 14);
    } else if (effect === 'prejudice') {
      p.prejudgedT = 5;
      this.fx.text(p.x, p.y - 44, 'PREJUDGED', '#ff6b52', 16);
      this.fx.addFlash('#c8452f', 0.25);
    }
  }

  // A chain-lightning flash, drawn for a fraction of a second.
  zap(x1, y1, x2, y2, color = '#ffe066') {
    this.zaps.push({ x1, y1, x2, y2, color, t: 0.16 });
    if (this.zaps.length > 30) this.zaps.shift();
    this.audio.blip(1800, 0.05, 0.05, 'square');
  }

  collect(pk) {
    const p = this.player;
    if (pk.type === 'gold') {
      const g = Math.max(1, Math.round(pk.value * p.goldMul));
      p.gold += g;
      this.audio.coin();
    } else if (pk.type === 'heart') {
      const h = p.heal(pk.value);
      if (h > 0) this.fx.text(p.x, p.y - 30, `+${h}`, '#6fbf73', 15);
      this.audio.blip(660, 0.12, 0.09, 'sine');
    } else if (pk.type === 'energy') {
      p.energy = Math.min(p.maxEnergy, p.energy + pk.value);
    } else if (pk.type === 'shard') {
      p.weaponLevel++;
      this.fx.text(p.x, p.y - 34, `${p.weaponName} ${U.roman(p.weaponLevel)}`, '#b58ad6', 17);
      this.fx.ring(p.x, p.y, 26, '#b58ad6', 20);
      this.audio.blip(1320, 0.22, 0.1, 'triangle');
    }
  }

  /* The player's breadcrumb trail — what companions and minions track when
     they lose sight of you (see Follow in npcs.js). */
  updateTrail() {
    const p = this.player;
    const last = this.trail[this.trail.length - 1];
    if (!last || U.dist2(last.x, last.y, p.x, p.y) > 36 * 36) {
      this.trail.push({ x: p.x, y: p.y });
      if (this.trail.length > 80) this.trail.shift();
    }
  }

  /* ---------------- Update 3.0: inventory ----------------
     I opens it. The page shows one character at a time — you first, then
     each companion behind the arrow on the right. Click a bag item to put it
     on whoever is showing; click a filled slot to take it off. */

  menuCharacters() {
    return [this.player, ...this.companions.filter(c => !c.dead)];
  }

  openInventory() {
    if (this.state !== 'playing' || this.cinematic || this.rhythm) return;
    this.state = 'inventory';
    this.invView = 0;
    this.player.charging = false;
    for (const k of ['left', 'right', 'up', 'down']) this.input[k] = 0;
    this.input.mouseL = this.input.mouseR = false;
    document.getElementById('inventory').classList.remove('hidden');
    this.renderInventory();
  }

  closeMenus() {
    document.getElementById('inventory').classList.add('hidden');
    document.getElementById('shop').classList.add('hidden');
    this.shopProp = null;
    this.state = 'playing';
    this.hudCache = {};
  }

  cycleInventory(dir) {
    const chars = this.menuCharacters();
    this.invView = (this.invView + dir + chars.length) % chars.length;
    this.renderInventory();
  }

  itemCard(item, extra = '') {
    const r = Gear.rarity(item);
    const slot = ITEM_SLOTS.find(s => s.id === item.slot);
    return `<div class="item-ic" style="color:${r.color}">${slot.icon}</div>`
      + `<div class="item-tx"><b style="color:${r.color}">${item.name}</b>`
      + `<span>${item.desc}</span>${extra}</div>`;
  }

  renderInventory() {
    const p = this.player;
    const chars = this.menuCharacters();
    if (this.invView >= chars.length) this.invView = 0;
    const who = chars[this.invView];
    const isPlayer = who === p;

    document.getElementById('invName').textContent = isPlayer
      ? `You — ${p.cls.className}` : `${who.def.name} · Lv ${who.level}`;
    document.getElementById('invSub').textContent = isPlayer
      ? `Level ${p.level} · ${p.weaponName}`
      : `${Math.ceil(who.hp)} / ${who.maxHp} HP · ${who.def.skill ? who.def.skill.name + ' — ' + who.def.skill.desc : ''}`;
    document.getElementById('invCoins').textContent = String(p.gold);
    document.getElementById('invPage').textContent = chars.length > 1 ? `${this.invView + 1} / ${chars.length}` : '';
    document.getElementById('invPrev').classList.toggle('hidden', chars.length < 2);
    document.getElementById('invNext').classList.toggle('hidden', chars.length < 2);

    // The four slots.
    const slots = document.getElementById('invSlots');
    slots.replaceChildren();
    for (const s of ITEM_SLOTS) {
      const id = who.equip[s.id];
      const item = id ? Gear.get(id) : null;
      const el = document.createElement('button');
      el.className = 'inv-slot' + (item ? ' filled' : '');
      el.innerHTML = `<div class="slot-name">${s.name} <i>${s.stat}</i></div>`
        + (item ? this.itemCard(item) : `<div class="slot-empty">${s.icon} empty</div>`);
      if (item) el.onclick = () => { Gear.unequip(p, who, s.id); this.audio.blip(500, 0.06, 0.06, 'triangle'); this.renderInventory(); };
      slots.appendChild(el);
    }

    // Stat readout.
    const pct = (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
    const stats = isPlayer ? [
      ['Health', `${Math.ceil(p.hp)} / ${p.maxHp}`],
      ['Defense', pct(p.equipDef)],
      ['Speed', pct(p.equipSpeed)],
      ['Damage', pct(p.equipDmg)],
      ['Critical', `${Math.round((0.12 + p.critBonus) * 100)}%`],
      ...(p.curse ? [['Curse', p.curse.linger > 0 ? `lifts in ${p.curse.linger.toFixed(1)}s` : 'HALVED']] : []),
    ] : [
      ['Health', `${Math.ceil(who.hp)} / ${who.maxHp}`],
      ['Level', `${who.level}  (${Math.floor(who.xp)} / ${who.xpNext} xp)`],
      ['Defense', pct(who.gearDef)],
      ['Speed', pct(who.gearSpeed)],
      ['Damage', pct(who.dmgMul - 1)],
    ];
    document.getElementById('invStats').innerHTML =
      stats.map(([k, v]) => `<div class="k">${k}</div><div class="v">${v}</div>`).join('');

    // The bag.
    const bag = document.getElementById('invBag');
    bag.replaceChildren();
    if (!p.bag.length) {
      bag.innerHTML = '<div class="bag-empty">Your bag is empty. The Hollow Peddler ($ on the map) sells accessories.</div>';
    }
    const sorted = p.bag.slice().sort((a, b) => Gear.get(a).slot.localeCompare(Gear.get(b).slot) || Gear.get(a).price - Gear.get(b).price);
    for (const id of sorted) {
      const item = Gear.get(id);
      const el = document.createElement('button');
      el.className = 'bag-item' + (item.cursed ? ' cursed' : '');
      const warn = !isPlayer && item.playerOnly ? '<em>no effect on companions</em>'
        : !isPlayer && item.cursed ? '<em>they will turn on you</em>' : '';
      el.innerHTML = this.itemCard(item, warn);
      el.onclick = () => {
        if (!isPlayer && item.cursed
          && !confirm(`Put the Cursed Totem on ${who.def.name}? They will turn on you.`)) return;
        Gear.equip(p, who, id);
        this.audio.blip(820, 0.08, 0.07, 'triangle');
        if (isPlayer && item.cursed) this.toast('The totem bites. Half your strength is gone until you take it off.', 4);
        this.renderInventory();
      };
      bag.appendChild(el);
    }
  }

  /* ---------------- Update 3.0: the shop ---------------- */

  openShop(prop) {
    this.state = 'shop';
    this.shopProp = prop;
    this.player.charging = false;
    for (const k of ['left', 'right', 'up', 'down']) this.input[k] = 0;
    this.input.mouseL = this.input.mouseR = false;
    document.getElementById('shop').classList.remove('hidden');
    this.renderShop();
    this.audio.blip(660, 0.12, 0.08, 'triangle');
  }

  renderShop() {
    const p = this.player;
    const prop = this.shopProp;
    document.getElementById('shopCoins').textContent = String(p.gold);
    const list = document.getElementById('shopList');
    list.replaceChildren();
    if (!prop.stock.length) list.innerHTML = '<div class="bag-empty">Sold out. Try another peddler.</div>';
    for (const id of prop.stock) {
      const item = Gear.get(id);
      const afford = p.gold >= item.price;
      const el = document.createElement('button');
      el.className = 'bag-item shop-item' + (afford ? '' : ' poor') + (item.cursed ? ' cursed' : '');
      el.innerHTML = this.itemCard(item, `<em class="price">◈ ${item.price}</em>`);
      el.onclick = () => {
        if (p.gold < item.price) { this.audio.blip(160, 0.12, 0.08, 'sawtooth'); return; }
        p.gold -= item.price;
        p.bag.push(id);
        prop.stock.splice(prop.stock.indexOf(id), 1);
        this.audio.blip(940, 0.08, 0.08, 'triangle');
        this.audio.blip(1320, 0.12, 0.06, 'triangle');
        this.renderShop();
      };
      list.appendChild(el);
    }
  }

  /* ---------------- update ---------------- */

  update(dt) {
    this.updateMusic();
    if (this.state !== 'playing') { this.fx.update(dt); return; }
    this.updateRoulette(dt);
    this.updateTempest(dt);
    // A boss intro holds the world while the camera does its work.
    if (this.cinematic) {
      this.updateCinematic(dt);
      this.fx.update(dt);
      this.updateHud();
      return;
    }
    if (this.speech) { this.speech.t -= dt; if (this.speech.t <= 0) this.speech = null; }
    if (this.pendingDescend) {
      this.pendingDescend.t -= dt;
      if (this.pendingDescend.t <= 0) {
        const last = this.pendingDescend.isLast;
        this.pendingDescend = null;
        if (last) this.endRun(true); else this.descend();
        return;
      }
    }
    if (this.pendingFinal) {
      this.pendingFinal.t -= dt;
      if (this.pendingFinal.t <= 0) {
        const pf = this.pendingFinal;
        const fb = Maps.byNumber(this.mapNumber).finalBoss;
        this.pendingFinal = null;
        this.boss = this.spawnEnemy(fb.type, pf.x, pf.y, pf.tier, false);
        const hp = Math.round(fb.hp * (this.hard ? 1.5 : 1));
        this.boss.maxHp = hp; this.boss.hp = hp;
        this.boss.aggro = true;
        this.startCinematic(this.boss);
        return;
      }
    }
    // The rhythm break halts all spatial movement while it is up.
    if (this.rhythm) {
      this.updateRhythm(dt);
      this.fx.update(dt);
      this.updateHud();
      return;
    }
    // Impact frames: hold the whole simulation for a beat on a heavy hit.
    if (this.freezeT > 0) {
      this.freezeT = Math.max(0, this.freezeT - dt);
      this.fx.update(dt * 0.15);
      this.updateHud();
      return;
    }
    // Holding the wheel open slows the world rather than freezing it.
    if (this.roulette.open) dt *= 0.25;
    this.time += dt;

    // Touch sticks write the same input/mouse the keyboard and mouse do.
    if (this.touch) this.touch.update();

    // Screen -> world for aiming.
    this.mouseWorld.x = this.mouse.x + this.cam.x;
    this.mouseWorld.y = this.mouse.y + this.cam.y;

    this.player.update(dt, this);
    this.updateTrail();

    // Lazily wake rooms as the player approaches them. Cleared rooms stay
    // cleared, including across a save and resume.
    for (const room of this.dungeon.rooms) {
      if (room.spawned || room.cleared || room.kind === 'boss') continue;
      if (U.dist(this.player.x, this.player.y, room.wx, room.wy) < 820) {
        room.spawned = true;
        room.alive = 0;
        for (const s of room.spawns) {
          const t = ENEMY_TYPES[s.type];
          // Hard mode: more of them, and more of them elite.
          const elite = s.elite || (this.hard && !t.big && U.chance(0.12));
          this.spawnEnemy(s.type, s.x, s.y, s.threat, elite, room);
          if (this.hard && !t.big && U.chance(0.4)) {
            const spot = this.safeSpawnNear(s.x, s.y, 40, U.rand(0, Math.PI * 2), t.radius + 2);
            this.spawnEnemy(s.type, spot.x, spot.y, s.threat, false, room);
          }
        }
        if (room.alive === 0) room.cleared = true;
      }
    }

    // Broad phase for this frame: every "what is near me" query below reads it.
    this.enemyHash.rebuild(this.enemies);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) { this.enemies.splice(i, 1); continue; }
      // Far-away enemies idle to keep the frame budget for what's on screen.
      if (U.dist2(e.x, e.y, this.player.x, this.player.y) > 1500 * 1500) continue;
      e.update(dt, this);
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.update(dt, this);
      if (pr.dead) this.projectiles.splice(i, 1);
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.update(dt, this);
      if (pk.dead) this.pickups.splice(i, 1);
    }

    for (let i = this.companions.length - 1; i >= 0; i--) {
      const c = this.companions[i];
      // A companion wearing the Cursed Totem does not stay a companion.
      if (!c.dead && c.equip.ring === 'cursed-totem') this.companionTurns(c);
      c.update(dt, this);
      if (c.dead) this.companions.splice(i, 1);
    }

    for (let i = this.minions.length - 1; i >= 0; i--) {
      const m = this.minions[i];
      m.update(dt, this);
      if (m.dead) this.minions.splice(i, 1);
    }

    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.update(dt, this);
      if (z.dead) this.zones.splice(i, 1);
    }

    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.update(dt, this);
      if (b.dead) this.beams.splice(i, 1);
    }
    for (let i = this.zaps.length - 1; i >= 0; i--) {
      this.zaps[i].t -= dt;
      if (this.zaps[i].t <= 0) this.zaps.splice(i, 1);
    }

    // The nearest awake miniboss gets the big bar (and the music).
    this.activeMiniboss = null;
    let bestD = 950;
    for (const e of this.enemies) {
      if (e.dead || !e.def.big || !e.aggro) continue;
      const dd = U.dist(e.x, e.y, this.player.x, this.player.y);
      if (dd < bestD) { bestD = dd; this.activeMiniboss = e; }
    }

    // Low health: you can hear it.
    const frac = this.player.hp / this.player.maxHp;
    if (frac < 0.25 && !this.player.dead) {
      this.heartT -= dt;
      if (this.heartT <= 0) { this.heartT = 0.6 + frac * 2; this.audio.heartbeat(); }
    }

    /* Delayed ground impacts: a marked circle, a beat of warning, then the
       blast. Mage meteors and enemy mortar shells are the same object — the
       only difference is which side it hurts. Enemy impacts are always
       unblockable, so the marker is the whole counterplay. */
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const m = this.impacts[i];
      m.t += dt;
      if (m.t < m.delay) continue;
      this.impacts.splice(i, 1);

      this.fx.ring(m.x, m.y, m.radius * 0.7, m.color, 40);
      this.fx.spark(m.x, m.y, {
        count: m.style === 'vine' ? 18 : 34, color: [m.color, m.style === 'vine' ? '#2f5c1a' : '#ffd479', '#ffffff'],
        speedMax: m.style === 'pillar' ? 260 : 420, lifeMax: 0.8, sizeMax: 6,
        gravity: m.style === 'pillar' ? -500 : 0,
      });
      this.fx.addShake(m.style === 'vine' ? 5 : 11);
      if (m.style === 'vine') this.audio.vine();
      else if (m.style === 'pillar') this.audio.laser();
      else if (m.style === 'hammer') { this.audio.gavel(); this.audio.explode(); }
      else this.audio.explode();

      if (m.hostile) {
        if (U.dist(m.x, m.y, this.player.x, this.player.y) < m.radius) {
          const res = this.player.takeHit(m.aoeDamage, this, { x: m.x, y: m.y, kind: 'red', source: m.source });
          if (res === 'hit' && m.effect) this.hazardEffect(m.effect);
        }
        // Gas grenades and the like leave the ground poisoned.
        if (m.leaves) {
          this.zones.push(new Zone('goo', m.x, m.y, {
            radius: m.radius * 0.8, life: 5, tickEvery: 0.7, damage: 5 * (m.source ? m.source.dmgScale : 1),
            power: 1, hostile: true, tint: 'spore',
          }));
        }
        continue;
      }

      // The Ranger's grenade: every enemy in the blast rolls its own damage.
      if (m.perEnemy) {
        this.fx.addShake(16);
        this.impactFreeze(0.08);
        for (const e of this.enemyHash.query(m.x, m.y, m.radius + 30, this._q)) {
          if (e.dead || U.dist(m.x, m.y, e.x, e.y) > m.radius + e.radius) continue;
          e.takeDamage(U.randi(m.perEnemy[0], m.perEnemy[1] + 1) * m.powerMul, this, m.x, m.y, 420, false);
        }
        continue;
      }

      const direct = m.directRadius ? this.enemyHash.nearest(m.x, m.y, m.directRadius, e => !e.dead) : null;
      if (direct) direct.takeDamage(m.directDamage, this, m.x, m.y, 260, false);
      for (const e of this.enemyHash.query(m.x, m.y, m.radius, this._q)) {
        if (e.dead || e === direct || U.dist(m.x, m.y, e.x, e.y) > m.radius) continue;
        e.takeDamage(m.aoeDamage, this, m.x, m.y, 200, false);
      }
    }

    this.updateRedShrines();
    this.updateCorruptShrines();
    this.fx.update(dt);
    this.dungeon.markExplored(this.player.x, this.player.y, 9);

    const room = this.dungeon.roomOf(this.player.x, this.player.y);
    if (room) {
      room.explored = true;
      this.currentRoom = room;
      if (room.kind === 'boss' && !this.gateFound) {
        this.gateFound = true;
        if (!this.bossDefeated) this.toast(Maps.byNumber(this.mapNumber).gateLine, 5);
      }
    }

    // Autosave. The periodic write is the real safety net; a browser close or
    // a power cut never guarantees `beforeunload` fires.
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) { this.saveTimer = 5; this.saveNow(); }

    // Camera trails the player, biased slightly toward the cursor.
    const tx = this.player.x + (this.mouseWorld.x - this.player.x) * 0.12 - this.vw / 2;
    const ty = this.player.y + (this.mouseWorld.y - this.player.y) * 0.12 - this.vh / 2;
    this.cam.x = U.damp(this.cam.x, tx, 0.16, dt);
    this.cam.y = U.damp(this.cam.y, ty, 0.16, dt);
    const worldW = this.dungeon.w * TILE, worldH = this.dungeon.h * TILE;
    this.cam.x = U.clamp(this.cam.x, 0, Math.max(0, worldW - this.vw));
    this.cam.y = U.clamp(this.cam.y, 0, Math.max(0, worldH - this.vh));

    if (this.pendingLevelUps > 0 && this.state === 'playing') {
      this.pendingLevelUps--;
      this.openPerkChoice('level');
    }

    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) document.getElementById('toast').classList.add('hidden');
    }

    this.updateHud();
  }

  /* Every write here forces a style recalc, and this runs 60 times a second,
     so nothing is written unless it actually changed. */
  updateHud() {
    const p = this.player;
    const cache = this.hudCache;

    const bar = (id, frac) => {
      const v = Math.round(U.clamp(frac, 0, 1) * 200) / 200;   // 0.5% resolution
      if (cache[id] === v) return;
      cache[id] = v;
      document.getElementById(id).style.transform = `scaleX(${v})`;
    };
    const text = (id, value) => {
      if (cache[id] === value) return;
      cache[id] = value;
      document.getElementById(id).textContent = value;
    };
    const flag = (id, cls, on) => {
      const k = id + '.' + cls;
      if (cache[k] === on) return;
      cache[k] = on;
      document.getElementById(id).classList.toggle(cls, on);
    };

    bar('hpFill', p.hp / p.maxHp);
    bar('enFill', p.energy / p.maxEnergy);
    bar('xpFill', p.xp / p.xpNext);
    if (p.usesMana) bar('manaFill', p.mana / p.maxMana);

    text('hpText', `${Math.ceil(p.hp)} / ${p.maxHp}`);
    text('enText', `${p.cls.energyName}  ${Math.floor(p.energy)}`);
    if (p.usesMana) text('manaText', `Mana  ${Math.floor(p.mana)}`);
    text('xpText', `LV ${p.level} · ${p.weaponName.toUpperCase()} ${U.roman(p.weaponLevel)}`);
    text('goldText', String(p.gold));
    text('killText', String(p.kills));
    text('mapText', Maps.byNumber(this.mapNumber).name + (this.hard ? ' · HARD' : ''));
    text('shrineText', `${this.shrinesDown}/${this.dungeon.redShrineCount}`);
    flag('shrineChip', 'done', this.shrinesDown >= this.dungeon.redShrineCount);
    text('regionText', this.currentRoom
      ? (this.currentRoom.kind === 'boss' ? Maps.byNumber(this.mapNumber).bossName : this.dungeon.regionName(this.currentRoom.tier))
      : '…');

    const heavyCost = p.cls.heavy.cost * p.costMul * 0.35;
    const mobCost = p.cls.mobility.cost * p.mobCostMul;
    if (p.cls.heavyCdKey) {
      // A heavy on its own clock (the Ninja's smoke) shows the countdown.
      const hcd = p.minionCds[p.cls.heavyCdKey] || 0;
      text('ab2Name', hcd > 0 ? `${p.cls.heavy.name} ${Math.ceil(hcd)}s` : p.cls.heavy.name);
      flag('ab2', 'spent', hcd > 0);
    } else {
      flag('ab2', 'spent', p.energy < heavyCost);
    }
    flag('ab3', 'spent', p.energy < mobCost || p.mobCd > 0);
    flag('ab3', 'ready', p.energy >= mobCost && p.mobCd <= 0);
    flag('ab5', 'spent', p.parryCd > 0);
    flag('ab5', 'ready', p.parryCd <= 0);

    // Casters get the wheel readout; everyone else never sees it.
    const slotEl = document.getElementById('ab6');
    if (p.loadout) {
      const s = p.slotDef;
      const cd = p.minionCds[s.id] || 0;
      const key = s.id + (cd > 0 ? '|' + Math.ceil(cd) : '');
      if (cache.slot !== key) {
        cache.slot = key;
        slotEl.classList.remove('hidden');
        document.getElementById('slotName').textContent =
          cd > 0 ? `${s.name} ${cd >= 60 ? Math.floor(Math.ceil(cd) / 60) + ":" + String(Math.ceil(cd) % 60).padStart(2, "0") : Math.ceil(cd) + "s"}` : s.name;
        document.getElementById('slotIcon').textContent = s.icon;
        slotEl.style.borderColor = cd > 0 ? 'rgba(255,255,255,.1)' : s.color;
        slotEl.classList.toggle('spent', cd > 0);
      }
    } else if (cache.slot !== 'none') {
      cache.slot = 'none';
      slotEl.classList.add('hidden');
    }

    const john = this.state === 'playing' && !this.cinematic ? this.nearbyJohn() : null;
    const prop = this.state === 'playing' && !john && !this.cinematic ? this.nearbyProp() : null;
    const promptEl = document.getElementById('prompt');
    const key = john ? 'john' : prop ? prop.type + (prop.rich ? '+' : '') + this.shrinesDown : '';
    if (cache.prompt !== key) {
      cache.prompt = key;
      const btn = this.touch && this.touch.active ? 'TAP' : 'E';
      if (john) {
        promptEl.innerHTML = `<b>${btn}</b> — provoke <b>John Space</b> (survive 2:00 without hitting back)`;
        promptEl.classList.remove('hidden');
      } else if (prop) {
        // Built lazily: an eager object literal would evaluate every branch,
      // and prop.shrine only exists on class shrines.
      const label = (() => {
        switch (prop.type) {
          case 'chest': return prop.rich ? 'open the <b>warded chest</b>' : 'open the <b>chest</b>';
          case 'fountain': return 'drink from the <b>fountain</b>';
          case 'shrine': return 'touch the <b>shrine</b>';
          case 'cage': return `free <b>${COMPANIONS[prop.npc].name}</b>`;
          case 'redshrine': return 'break the <b>red shrine</b>';
          case 'classshrine': return Shrines.matches(prop.shrine, p)
            ? `claim the <b>${prop.shrine.name}</b>`
            : `touch the <b>${prop.shrine.name}</b> (not yours)`;
          case 'yellowshrine': return 'gamble at the <b>yellow shrine</b>';
          case 'corruptshrine': return 'disturb the <b>corrupted shrine</b>';
          case 'merchant': return 'trade with the <b>Hollow Peddler</b>';
          case 'gate': return this.shrinesDown >= this.dungeon.redShrineCount
            ? 'open the <b>gate</b>'
            : `the gate is <b>bound</b> — ${this.shrinesDown}/${this.dungeon.redShrineCount} shrines`;
          default: return `use the <b>${prop.type}</b>`;
        }
      })();
      promptEl.innerHTML = `<b>${btn}</b> — ${label}`;
        promptEl.classList.remove('hidden');
      } else {
        promptEl.classList.add('hidden');
      }
    }
  }

  /* ---------------- render ---------------- */

  render() {
    /* Rendering must never mutate the world. A copy of the cage-freeing code
       once ended up inside drawProps, which spawned a companion on every
       frame the cage was visible — invisible to any test that stepped update
       without also drawing. This invariant makes that class of bug announce
       itself the first time it happens instead of hiding until someone sees
       a screen full of duplicates. */
    const before = this._renderGuard || (this._renderGuard = {});
    before.enemies = this.enemies ? this.enemies.length : 0;
    before.companions = this.companions ? this.companions.length : 0;
    before.minions = this.minions ? this.minions.length : 0;

    this.renderFrame();

    if (this.enemies && (this.enemies.length !== before.enemies
      || this.companions.length !== before.companions
      || this.minions.length !== before.minions)) {
      console.error('render() mutated the world — a side effect leaked into a draw path:', {
        enemies: `${before.enemies} -> ${this.enemies.length}`,
        companions: `${before.companions} -> ${this.companions.length}`,
        minions: `${before.minions} -> ${this.minions.length}`,
      });
    }
  }

  renderFrame() {
    const ctx = this.ctx;
    ctx.setTransform(this.px, 0, 0, this.px, 0, 0);
    ctx.clearRect(0, 0, this.vw, this.vh);
    ctx.fillStyle = '#08080b';
    ctx.fillRect(0, 0, this.vw, this.vh);
    if (!this.dungeon) return;

    ctx.save();
    ctx.translate(-Math.round(this.cam.x) + this.fx.shakeX, -Math.round(this.cam.y) + this.fx.shakeY);

    this.drawTiles(ctx);
    for (const z of this.zones) z.draw(ctx, this.time);   // under everything
    this.drawProps(ctx);
    for (const pk of this.pickups) pk.draw(ctx);
    this.drawImpactMarkers(ctx);
    for (const b of this.beams) b.draw(ctx);
    this.drawZaps(ctx);
    this.drawEnemies(ctx);
    for (const m of this.minions) m.draw(ctx);
    for (const c of this.companions) c.draw(ctx, this.time);
    this.drawPlayer(ctx);
    for (const pr of this.projectiles) pr.draw(ctx);
    this.fx.drawParticles(ctx);
    if (!this.cinematic) this.drawReticle(ctx);
    this.fx.drawTexts(ctx);
    this.drawSpeech(ctx);

    ctx.restore();

    this.drawLighting();
    this.drawOverlays(ctx);
    this.drawMinimap();
  }

  drawZaps(ctx) {
    if (!this.zaps.length) return;
    ctx.save();
    ctx.lineWidth = 2.5;
    for (const z of this.zaps) {
      ctx.globalAlpha = U.clamp(z.t / 0.16, 0, 1);
      ctx.strokeStyle = z.color;
      ctx.shadowBlur = 12; ctx.shadowColor = z.color;
      ctx.beginPath();
      ctx.moveTo(z.x1, z.y1);
      for (let i = 1; i < 6; i++) {
        const k = i / 6;
        ctx.lineTo(U.lerp(z.x1, z.x2, k) + U.rand(-8, 8), U.lerp(z.y1, z.y2, k) + U.rand(-8, 8));
      }
      ctx.lineTo(z.x2, z.y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawTiles(ctx) {
    const d = this.dungeon;
    if (d.map.outdoor) { this.drawOutdoorTiles(ctx); return; }
    const x0 = Math.max(0, Math.floor(this.cam.x / TILE) - 1);
    const y0 = Math.max(0, Math.floor(this.cam.y / TILE) - 1);
    const x1 = Math.min(d.w - 1, Math.ceil((this.cam.x + this.vw) / TILE) + 1);
    const y1 = Math.min(d.h - 1, Math.ceil((this.cam.y + this.vh) / TILE) + 1);

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = d.at(tx, ty);
        const px = tx * TILE, py = ty * TILE;
        const pal = d.palette(d.tierAt(tx, ty));
        const n = U.tileNoise(tx, ty);

        if (t === T.WALL) {
          const belowOpen = !SOLID[d.at(tx, ty + 1)] && d.at(tx, ty + 1) !== undefined;
          ctx.fillStyle = pal.wall;
          ctx.fillRect(px, py, TILE, TILE);
          if (n > 0.82) {
            ctx.fillStyle = 'rgba(255,255,255,.03)';
            ctx.fillRect(px, py, TILE, TILE);
          }
          if (belowOpen) {
            // Lit face: reads as a wall you're looking at, not a hole.
            ctx.fillStyle = pal.accent;
            ctx.fillRect(px, py + TILE * 0.62, TILE, TILE * 0.38);
            ctx.fillStyle = 'rgba(255,255,255,.10)';
            ctx.fillRect(px, py + TILE * 0.62, TILE, 2);
            ctx.fillStyle = 'rgba(0,0,0,.30)';
            ctx.fillRect(px, py + TILE - 3, TILE, 3);
          }
          continue;
        }

        // Floor variants
        let base = pal.floor;
        if (t === T.WATER) base = '#1d3a4a';
        ctx.fillStyle = base;
        ctx.fillRect(px, py, TILE, TILE);

        if (t === T.WATER) {
          const shimmer = Math.sin(this.time * 1.6 + tx * 0.7 + ty * 0.5) * 0.5 + 0.5;
          ctx.fillStyle = `rgba(120,190,220,${0.05 + shimmer * 0.07})`;
          ctx.fillRect(px, py, TILE, TILE);
        } else {
          ctx.fillStyle = n > 0.5 ? 'rgba(255,255,255,.022)' : 'rgba(0,0,0,.09)';
          ctx.fillRect(px, py, TILE, TILE);
          if (n > 0.94) {
            ctx.fillStyle = 'rgba(0,0,0,.16)';
            ctx.fillRect(px + 6, py + 8, TILE - 14, 3);
          }
        }

        // Contact shadow cast by the wall above — the main depth cue.
        // Three flat bands instead of a gradient: this runs on ~1,800 tiles a
        // frame, and allocating a CanvasGradient per tile was the single
        // hottest line in the renderer.
        if (SOLID[d.at(tx, ty - 1)]) {
          ctx.fillStyle = 'rgba(0,0,0,.34)';
          ctx.fillRect(px, py, TILE, 3);
          ctx.fillStyle = 'rgba(0,0,0,.20)';
          ctx.fillRect(px, py + 3, TILE, 3);
          ctx.fillStyle = 'rgba(0,0,0,.09)';
          ctx.fillRect(px, py + 6, TILE, 3);
        }

        if (t === T.RUBBLE) {
          ctx.fillStyle = 'rgba(0,0,0,.28)';
          const s = 5 + n * 5;
          ctx.fillRect(px + 6, py + 9, s, s * 0.7);
          ctx.fillRect(px + TILE - 13, py + TILE - 15, s * 0.7, s * 0.6);
        }

        if (t === T.PILLAR) {
          ctx.fillStyle = pal.wall;
          ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
          ctx.fillStyle = pal.accent;
          ctx.fillRect(px + 2, py + TILE * 0.6, TILE - 4, TILE * 0.4 - 2);
          ctx.fillStyle = 'rgba(255,255,255,.09)';
          ctx.fillRect(px + 2, py + TILE * 0.6, TILE - 4, 2);
        }

        // Tile grid seam, very subtle
        ctx.fillStyle = 'rgba(0,0,0,.10)';
        ctx.fillRect(px, py, TILE, 1);
        ctx.fillRect(px, py, 1, TILE);
      }
    }

    // Boss barrier
    if (this.dungeon.sealed) {
      const pulse = 0.35 + Math.sin(this.time * 5) * 0.15;
      for (const s of this.dungeon.sealTiles) {
        const px = s.tx * TILE, py = s.ty * TILE;
        if (px < this.cam.x - TILE || px > this.cam.x + this.vw || py < this.cam.y - TILE || py > this.cam.y + this.vh) continue;
        ctx.fillStyle = `rgba(200,69,47,${pulse})`;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = `rgba(255,150,110,${pulse * 0.5})`;
        ctx.fillRect(px, py + ((this.time * 40) % TILE), TILE, 2);
      }
    }
  }

  /* Update 4.0: Day-ZEE is under open sky. Same grid, different reading:
     walls are sandbag-and-concrete lines with a lit face, floors are
     cracked asphalt and dirt, pillars are crates, and water is the oily
     flood of the dry dock. */
  drawOutdoorTiles(ctx) {
    const d = this.dungeon;
    const x0 = Math.max(0, Math.floor(this.cam.x / TILE) - 1);
    const y0 = Math.max(0, Math.floor(this.cam.y / TILE) - 1);
    const x1 = Math.min(d.w - 1, Math.ceil((this.cam.x + this.vw) / TILE) + 1);
    const y1 = Math.min(d.h - 1, Math.ceil((this.cam.y + this.vh) / TILE) + 1);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = d.at(tx, ty);
        const px = tx * TILE, py = ty * TILE;
        const pal = d.palette(d.tierAt(tx, ty));
        // tileNoise can come back negative; fold it into [0, 1) for the rarity checks.
        const n0 = U.tileNoise(tx, ty), n = n0 < 0 ? n0 + 1 : n0;

        if (t === T.WALL) {
          const belowOpen = !SOLID[d.at(tx, ty + 1)] && d.at(tx, ty + 1) !== undefined;
          ctx.fillStyle = pal.wall;
          ctx.fillRect(px, py, TILE, TILE);
          // Razor wire along the top of a perimeter wall, now and then.
          if (n > 0.8 && !SOLID[d.at(tx, ty - 1)]) {
            ctx.strokeStyle = 'rgba(200,200,190,.18)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let k = 0; k < 4; k++) ctx.arc(px + 5 + k * 8, py + 8, 4, 0, Math.PI * 2);
            ctx.stroke();
          }
          if (belowOpen) {
            // Sandbags stacked along the lit face.
            const fy = py + TILE * 0.5;
            ctx.fillStyle = pal.accent;
            ctx.fillRect(px, fy, TILE, TILE * 0.5);
            ctx.fillStyle = 'rgba(0,0,0,.28)';
            const off = (tx % 2) * 8;
            for (let row = 0; row < 2; row++) {
              const ry = fy + row * (TILE * 0.25);
              ctx.fillRect(px, ry + TILE * 0.25 - 2, TILE, 2);
              for (let bx = -off + (row ? 8 : 0); bx < TILE; bx += 16) ctx.fillRect(px + Math.max(0, bx), ry, 2, TILE * 0.25);
            }
            ctx.fillStyle = 'rgba(255,255,255,.08)';
            ctx.fillRect(px, fy, TILE, 2);
          }
          continue;
        }

        if (t === T.WATER) {
          ctx.fillStyle = '#1f2b33';
          ctx.fillRect(px, py, TILE, TILE);
          const shimmer = Math.sin(this.time * 1.4 + tx * 0.6 + ty * 0.45) * 0.5 + 0.5;
          ctx.fillStyle = `rgba(150,190,210,${0.04 + shimmer * 0.06})`;
          ctx.fillRect(px, py, TILE, TILE);
          if (n > 0.9) {
            ctx.fillStyle = 'rgba(120,90,160,.12)';   // oil sheen
            ctx.beginPath(); ctx.ellipse(px + TILE / 2, py + TILE / 2, 10, 4, n * 6, 0, Math.PI * 2); ctx.fill();
          }
          continue;
        }

        ctx.fillStyle = pal.floor;
        ctx.fillRect(px, py, TILE, TILE);
        // Asphalt grit.
        ctx.fillStyle = n > 0.5 ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.07)';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = 'rgba(0,0,0,.12)';
        ctx.fillRect(px + ((n * 97) % 30), py + ((n * 53) % 30), 2, 2);
        ctx.fillRect(px + ((n * 31) % 30), py + ((n * 71) % 30), 2, 2);
        if (n > 0.93) {
          // A crack.
          ctx.strokeStyle = 'rgba(0,0,0,.35)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(px + 4, py + 6 + n * 10);
          ctx.lineTo(px + 14, py + 14);
          ctx.lineTo(px + 22, py + 10 + n * 14);
          ctx.lineTo(px + 30, py + 20);
          ctx.stroke();
        } else if (n > 0.6 && n < 0.625) {
          ctx.fillStyle = 'rgba(10,10,12,.3)';       // oil stain
          ctx.beginPath(); ctx.ellipse(px + 17, py + 17, 11, 6, n * 9, 0, Math.PI * 2); ctx.fill();
        } else if (n < 0.03) {
          ctx.fillStyle = 'rgba(110,20,20,.28)';     // somebody's bad day
          ctx.beginPath(); ctx.ellipse(px + 15, py + 18, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
        }
        if (SOLID[d.at(tx, ty - 1)]) {
          ctx.fillStyle = 'rgba(0,0,0,.30)';
          ctx.fillRect(px, py, TILE, 4);
          ctx.fillStyle = 'rgba(0,0,0,.14)';
          ctx.fillRect(px, py + 4, TILE, 4);
        }
        if (t === T.RUBBLE) {
          ctx.fillStyle = 'rgba(40,36,30,.6)';
          ctx.fillRect(px + 6, py + 9, 7, 4);
          ctx.fillRect(px + 18, py + 20, 5, 6);
          ctx.fillStyle = 'rgba(160,150,130,.25)';
          ctx.fillRect(px + 22, py + 8, 6, 2);
        }
        if (t === T.PILLAR) {
          // A supply crate.
          ctx.fillStyle = 'rgba(0,0,0,.35)';
          ctx.fillRect(px + 4, py + 7, TILE - 6, TILE - 6);
          ctx.fillStyle = '#6b5434';
          ctx.fillRect(px + 2, py + 2, TILE - 6, TILE - 6);
          ctx.strokeStyle = '#45351f';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 3, py + 3, TILE - 8, TILE - 8);
          ctx.beginPath();
          ctx.moveTo(px + 3, py + 3); ctx.lineTo(px + TILE - 5, py + TILE - 5);
          ctx.moveTo(px + TILE - 5, py + 3); ctx.lineTo(px + 3, py + TILE - 5);
          ctx.stroke();
        }
      }
    }
    if (d.sealed) {
      const pulse = 0.35 + Math.sin(this.time * 5) * 0.15;
      for (const s of d.sealTiles) {
        const px = s.tx * TILE, py = s.ty * TILE;
        if (px < this.cam.x - TILE || px > this.cam.x + this.vw || py < this.cam.y - TILE || py > this.cam.y + this.vh) continue;
        ctx.fillStyle = `rgba(200,69,47,${pulse})`;
        ctx.fillRect(px, py, TILE, TILE);
      }
    }
  }

  drawProps(ctx) {
    const t = this.time;
    for (const prop of this.dungeon.props) {
      const { x, y } = prop;
      if (x < this.cam.x - 60 || x > this.cam.x + this.vw + 60 || y < this.cam.y - 60 || y > this.cam.y + this.vh + 60) continue;

      ctx.save();
      if (prop.type === 'chest') {
        const open = prop.used;
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        ctx.beginPath(); ctx.ellipse(x, y + 12, 16, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = open ? '#3c3128' : '#6b4a2c';
        ctx.fillRect(x - 15, y - 6, 30, 18);
        ctx.fillStyle = open ? '#2b241d' : '#8a6238';
        ctx.fillRect(x - 15, open ? y - 22 : y - 15, 30, 10);
        ctx.fillStyle = prop.rich ? '#e2b34a' : '#c0a070';
        ctx.fillRect(x - 15, y - 7, 30, 3);
        if (!open) {
          ctx.fillStyle = prop.rich ? '#e2b34a' : '#c0a070';
          ctx.fillRect(x - 3, y - 4, 6, 7);
          ctx.globalAlpha = 0.3 + Math.sin(t * 3) * 0.15;
          ctx.shadowBlur = 20; ctx.shadowColor = prop.rich ? '#e2b34a' : '#c0a070';
          ctx.fillRect(x - 15, y - 15, 30, 27);
        }
      } else if (prop.type === 'fountain') {
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        ctx.beginPath(); ctx.ellipse(x, y + 10, 20, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4a4a56';
        ctx.beginPath(); ctx.ellipse(x, y, 20, 11, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = prop.used ? '#26262e' : '#2f7f9e';
        ctx.beginPath(); ctx.ellipse(x, y, 15, 7.5, 0, 0, Math.PI * 2); ctx.fill();
        if (!prop.used) {
          ctx.globalAlpha = 0.5 + Math.sin(t * 2.4) * 0.2;
          ctx.shadowBlur = 22; ctx.shadowColor = '#4fd0a8';
          ctx.fillStyle = '#6fe0c0';
          ctx.beginPath(); ctx.ellipse(x, y - 2, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
        }
      } else if (prop.type === 'shrine') {
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        ctx.beginPath(); ctx.ellipse(x, y + 14, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3a3446';
        ctx.fillRect(x - 11, y - 10, 22, 24);
        ctx.fillStyle = '#4d4560';
        ctx.fillRect(x - 11, y - 10, 22, 4);
        if (!prop.used) {
          const fy = y - 26 + Math.sin(t * 1.8) * 4;
          ctx.shadowBlur = 26; ctx.shadowColor = '#7ea8ff';
          ctx.fillStyle = '#bcd2ff';
          ctx.beginPath(); ctx.arc(x, fy, 7, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 0.4;
          ctx.beginPath(); ctx.arc(x, fy, 13 + Math.sin(t * 3) * 2, 0, Math.PI * 2); ctx.fill();
        }
      } else if (prop.type === 'redshrine') {
        const dead = prop.used;
        ctx.fillStyle = 'rgba(0,0,0,.4)';
        ctx.beginPath(); ctx.ellipse(x, y + 16, 17, 7, 0, 0, Math.PI * 2); ctx.fill();
        // Obelisk
        ctx.fillStyle = dead ? '#2a2226' : '#43262a';
        ctx.beginPath();
        ctx.moveTo(x - 10, y + 14); ctx.lineTo(x - 7, y - 24);
        ctx.lineTo(x + 7, y - 24); ctx.lineTo(x + 10, y + 14);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = dead ? '#3a2f34' : '#5e3238';
        ctx.fillRect(x - 8, y - 24, 16, 4);
        if (!dead) {
          const pulse = prop.active ? 0.7 + Math.sin(t * 14) * 0.3 : 0.45 + Math.sin(t * 2.4) * 0.2;
          ctx.globalAlpha = pulse;
          ctx.shadowBlur = 26; ctx.shadowColor = '#ff3b1f';
          ctx.fillStyle = '#ff5a3c';
          ctx.beginPath(); ctx.arc(x, y - 6, 6.5, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = pulse * 0.4;
          ctx.beginPath(); ctx.arc(x, y - 6, 14 + Math.sin(t * 3) * 3, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          if (prop.active) {
            ctx.strokeStyle = '#ff5a3c';
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.5;
            ctx.beginPath(); ctx.arc(x, y, 40 + Math.sin(t * 6) * 5, 0, Math.PI * 2); ctx.stroke();

            // How many guardians are left, right on the shrine itself.
            const left = prop.remaining ?? prop.waveTotal;
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
            ctx.textAlign = 'center';
            ctx.font = '700 22px system-ui';
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'rgba(0,0,0,.9)';
            ctx.strokeText(String(left), x, y - 40);
            ctx.fillStyle = '#ff8a6a';
            ctx.fillText(String(left), x, y - 40);
            ctx.font = '600 10px system-ui';
            ctx.lineWidth = 3;
            ctx.strokeText('GUARDIANS', x, y - 27);
            ctx.fillStyle = 'rgba(255,180,160,.85)';
            ctx.fillText('GUARDIANS', x, y - 27);
          }
        }

      } else if (prop.type === 'cage') {
        const open = prop.used;
        const c = COMPANIONS[prop.npc];
        ctx.fillStyle = 'rgba(0,0,0,.36)';
        ctx.beginPath(); ctx.ellipse(x, y + 14, 18, 7, 0, 0, Math.PI * 2); ctx.fill();
        if (!open) {
          ctx.fillStyle = c.color;
          ctx.globalAlpha = 0.85;
          ctx.fillRect(x - 7, y - 12, 14, 22);      // the occupant
          ctx.beginPath(); ctx.arc(x, y - 16, 5, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = open ? '#4a4038' : '#8a7a5c';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x - 15, y - 26, 30, 40);
        if (!open) {
          for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(x + i * 6, y - 26); ctx.lineTo(x + i * 6, y + 14);
            ctx.stroke();
          }
          ctx.globalAlpha = 0.25 + Math.sin(t * 2.5) * 0.12;
          ctx.fillStyle = c.color;
          ctx.beginPath(); ctx.arc(x, y - 6, 26, 0, Math.PI * 2); ctx.fill();
        } else {
          // Door swung open.
          ctx.beginPath();
          ctx.moveTo(x + 15, y - 26); ctx.lineTo(x + 30, y - 16);
          ctx.lineTo(x + 30, y + 6); ctx.lineTo(x + 15, y + 14);
          ctx.stroke();
        }

      } else if (prop.type === 'classshrine' || prop.type === 'yellowshrine' || prop.type === 'corruptshrine') {
        const gl = Shrines.glyph(prop);
        const dead = prop.used;
        const corrupt = prop.type === 'corruptshrine';
        ctx.fillStyle = 'rgba(0,0,0,.36)';
        ctx.beginPath(); ctx.ellipse(x, y + 14, 15, 6, 0, 0, Math.PI * 2); ctx.fill();

        // Plinth
        ctx.fillStyle = dead ? '#2a2730' : '#3a3446';
        ctx.beginPath();
        ctx.moveTo(x - 11, y + 13); ctx.lineTo(x - 8, y - 12);
        ctx.lineTo(x + 8, y - 12); ctx.lineTo(x + 11, y + 13);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = dead ? '#3a3540' : '#4d4560';
        ctx.fillRect(x - 9, y - 12, 18, 3.5);

        if (!dead) {
          const t2 = corrupt && prop.active ? this.time * 9 : this.time * 2;
          const fy = y - 26 + Math.sin(t2) * 3.5;
          ctx.shadowBlur = 24; ctx.shadowColor = gl.color;
          ctx.fillStyle = gl.color;
          ctx.globalAlpha = 0.9;
          ctx.font = '700 17px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(gl.icon, x, fy + 6);
          ctx.globalAlpha = 0.28 + Math.sin(t2 * 1.4) * 0.1;
          ctx.beginPath(); ctx.arc(x, fy, 15, 0, Math.PI * 2); ctx.fill();
          if (corrupt && prop.active) {
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = gl.color; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(x, y, 42 + Math.sin(this.time * 6) * 5, 0, Math.PI * 2); ctx.stroke();
          }
        }

      } else if (prop.type === 'merchant') {
        // The Hollow Peddler: a hooded figure behind a little stall, lantern lit.
        ctx.fillStyle = 'rgba(0,0,0,.38)';
        ctx.beginPath(); ctx.ellipse(x, y + 14, 26, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4a3a5c';
        ctx.beginPath();
        ctx.moveTo(x - 10, y + 6); ctx.lineTo(x - 7, y - 20); ctx.lineTo(x + 7, y - 20); ctx.lineTo(x + 10, y + 6);
        ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y - 22, 7.5, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#ffd479';
        ctx.fillRect(x - 3.5, y - 24, 2, 2); ctx.fillRect(x + 1.5, y - 24, 2, 2);
        // Stall.
        ctx.fillStyle = '#6b4a2c';
        ctx.fillRect(x - 22, y + 2, 44, 12);
        ctx.fillStyle = '#8a6238';
        ctx.fillRect(x - 24, y, 48, 4);
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = ['#7ea8ff', '#ffd479', '#c07bff', '#ff8a6a'][i];
          ctx.beginPath(); ctx.arc(x - 15 + i * 10, y - 2, 3, 0, Math.PI * 2); ctx.fill();
        }
        // Lantern.
        const fl = 0.75 + Math.sin(t * 7) * 0.12;
        ctx.globalAlpha = fl;
        ctx.shadowBlur = 20; ctx.shadowColor = '#ffd479';
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath(); ctx.arc(x + 18, y - 14, 4, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#ffd479';
        ctx.font = '700 12px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('$', x, y - 36 + Math.sin(t * 2) * 2);

      } else if (prop.type === 'gate') {
        const done = this.bossDefeated;
        ctx.strokeStyle = done ? '#4a4a56' : '#c8452f';
        ctx.lineWidth = 3;
        ctx.shadowBlur = done ? 0 : 26;
        ctx.shadowColor = '#c8452f';
        for (let i = 0; i < 3; i++) {
          const r = 26 + i * 13;
          ctx.globalAlpha = done ? 0.3 : 0.55 - i * 0.12;
          ctx.beginPath();
          ctx.arc(x, y, r, t * (i % 2 ? -0.6 : 0.6) + i, t * (i % 2 ? -0.6 : 0.6) + i + Math.PI * 1.35);
          ctx.stroke();
        }
        ctx.globalAlpha = done ? 0.4 : 0.85;
        ctx.fillStyle = done ? '#5a5a66' : '#ff9a6a';
        ctx.font = '700 22px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('☠', x, y + 8);
      }
      ctx.restore();
    }

    // Torch flicker
    for (const tor of this.dungeon.torches) {
      if (tor.x < this.cam.x - 40 || tor.x > this.cam.x + this.vw + 40 ||
          tor.y < this.cam.y - 40 || tor.y > this.cam.y + this.vh + 40) continue;
      const f = 0.7 + Math.sin(t * 8 + tor.phase) * 0.15 + Math.sin(t * 17.3 + tor.phase * 2) * 0.1;
      if (this.dungeon.map.outdoor) {
        // A floodlight on a pole. Some of them still work properly.
        const flick = Math.sin(t * 23 + tor.phase * 7) > -0.92 ? 1 : 0.2;
        ctx.save();
        ctx.fillStyle = '#3a3a3e';
        ctx.fillRect(tor.x - 1.5, tor.y - 10, 3, 14);
        ctx.fillStyle = '#5a5a60';
        ctx.fillRect(tor.x - 6, tor.y - 15, 12, 6);
        ctx.shadowBlur = 24 * flick; ctx.shadowColor = '#e8f4ff';
        ctx.fillStyle = `rgba(232,244,255,${0.9 * flick})`;
        ctx.fillRect(tor.x - 5, tor.y - 10, 10, 2);
        ctx.restore();
        continue;
      }
      ctx.save();
      ctx.shadowBlur = 22 * f;
      ctx.shadowColor = '#ffa94d';
      ctx.fillStyle = `rgba(255,190,110,${0.85 * f})`;
      ctx.beginPath();
      ctx.ellipse(tor.x, tor.y - 6, 3.5 * f, 6 * f, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4b3a2a';
      ctx.fillRect(tor.x - 2, tor.y - 2, 4, 8);
      ctx.restore();
    }
  }

  /* Objective compass. Red shrines are the run's spine, so they get a large
     arrow at any distance; every other unclaimed shrine gets a small one, and
     only when you are close enough for it to be a real choice. */
  drawObjectiveArrows(ctx) {
    if (!this.dungeon || this.state !== 'playing') return;
    const px = this.player.x, py = this.player.y;
    const cx = this.vw / 2, cy = this.vh / 2;
    const ringBig = Math.min(this.vw, this.vh) * 0.40;
    const ringSmall = Math.min(this.vw, this.vh) * 0.31;

    for (const prop of this.dungeon.props) {
      if (prop.used) continue;
      const isRed = prop.type === 'redshrine';
      const isOther = prop.type === 'classshrine' || prop.type === 'yellowshrine'
        || prop.type === 'corruptshrine';
      if (!isRed && !isOther) continue;

      const dist = U.dist(px, py, prop.x, prop.y);
      if (!isRed && dist > 900) continue;           // small arrows are local only
      if (isRed && !this.dungeon.isExplored(Math.floor(prop.x / TILE), Math.floor(prop.y / TILE))
          && dist > 1400) continue;

      // Already on screen? Then the shrine speaks for itself.
      const sx = prop.x - this.cam.x, sy = prop.y - this.cam.y;
      if (sx > 40 && sx < this.vw - 40 && sy > 40 && sy < this.vh - 40) continue;

      const gl = Shrines.glyph(prop);
      const a = U.angle(px, py, prop.x, prop.y);
      const ring = isRed ? ringBig : ringSmall;
      const ax = cx + Math.cos(a) * ring, ay = cy + Math.sin(a) * ring;
      const size = isRed ? 15 : 7;

      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(a);
      ctx.globalAlpha = isRed ? 0.65 + Math.sin(this.time * 3) * 0.2 : 0.42;
      ctx.fillStyle = gl.color;
      if (isRed) { ctx.shadowBlur = 12; ctx.shadowColor = gl.color; }
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.lineTo(-size * 0.62, -size * 0.62);
      ctx.lineTo(-size * 0.62, size * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      if (isRed) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = gl.color;
        ctx.font = '600 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(dist / TILE)}m`,
          cx + Math.cos(a) * (ring + 20), cy + Math.sin(a) * (ring + 20));
        ctx.restore();
      }
    }
  }

  drawImpactMarkers(ctx) {
    for (const m of this.impacts) {
      const t = U.clamp(m.t / m.delay, 0, 1);
      if (m.grenade) {
        // Lobbed in an arc over the first 0.45s, then it sits and ticks.
        const fly = U.clamp(m.t / 0.45, 0, 1);
        const gx = U.lerp(m.fromX, m.x, fly), gy = U.lerp(m.fromY, m.y, fly) - Math.sin(fly * Math.PI) * 60;
        const left = Math.max(0, m.delay - m.t);
        const blink = left < 1 ? Math.sin(this.time * 40) > 0 : Math.sin(this.time * 10) > 0;
        ctx.save();
        if (fly >= 1) {
          ctx.globalAlpha = 0.25 + t * 0.35;
          ctx.strokeStyle = '#ffb347';
          ctx.setLineDash([8, 6]);
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#3f4a2c';
        ctx.beginPath(); ctx.arc(gx, gy, 6.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#8a8f7a';
        ctx.fillRect(gx - 2, gy - 9, 4, 4);
        ctx.fillStyle = blink ? '#ff3b1f' : '#5a1a10';
        ctx.beginPath(); ctx.arc(gx + 2, gy - 2, 1.8, 0, Math.PI * 2); ctx.fill();
        if (fly >= 1) {
          ctx.font = '700 15px system-ui';
          ctx.textAlign = 'center';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,.85)';
          ctx.strokeText(left.toFixed(1), gx, gy - 16);
          ctx.fillStyle = left < 1 ? '#ff6b52' : '#ffd479';
          ctx.fillText(left.toFixed(1), gx, gy - 16);
        }
        ctx.restore();
        continue;
      }
      ctx.save();
      ctx.globalAlpha = 0.35 + t * 0.45;
      ctx.strokeStyle = m.color;
      ctx.lineWidth = m.hostile ? 3 : 2.5;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.14 + t * 0.3;
      ctx.fillStyle = m.color;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.radius * t, 0, Math.PI * 2); ctx.fill();
      if (m.style === 'pillar') {
        // The column of light gathers above the spot before it falls.
        ctx.globalAlpha = 0.1 + t * 0.5;
        ctx.fillStyle = '#fff6d0';
        ctx.shadowBlur = 20; ctx.shadowColor = m.color;
        const w = m.radius * (0.2 + t * 0.6);
        ctx.fillRect(m.x - w / 2, m.y - 420, w, 420);
      } else if (m.style === 'vine') {
        // Cracks opening in the floor.
        ctx.globalAlpha = 0.4 + t * 0.5;
        ctx.strokeStyle = '#2f5c1a';
        ctx.lineWidth = 2.5;
        for (let k = 0; k < 5; k++) {
          const a = k * 1.256 + m.x * 0.01;
          ctx.beginPath();
          ctx.moveTo(m.x, m.y);
          ctx.lineTo(m.x + Math.cos(a) * m.radius * t, m.y + Math.sin(a) * m.radius * t * 0.7);
          ctx.stroke();
        }
      } else if ((m.style === 'shell' || m.style === 'hammer') && m.hostile) {
        // Something is coming down on this spot: watch its shadow grow.
        const fall = (1 - t) * 260;
        ctx.globalAlpha = 0.25 + t * 0.4;
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.beginPath(); ctx.ellipse(m.x, m.y, 4 + t * 12, 2 + t * 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.9;
        if (m.style === 'hammer') {
          ctx.fillStyle = '#6b5a48';
          ctx.fillRect(m.x - 2, m.y - fall - 22, 4, 22);
          ctx.fillStyle = m.color;
          ctx.fillRect(m.x - 10, m.y - fall - 30, 20, 11);
        } else {
          ctx.fillStyle = '#2a2a2e';
          ctx.beginPath(); ctx.ellipse(m.x, m.y - fall, 5, 8, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  drawEnemies(ctx) {
    for (const e of this.enemies) {
      if (e.x < this.cam.x - 80 || e.x > this.cam.x + this.vw + 80 ||
          e.y < this.cam.y - 80 || e.y > this.cam.y + this.vh + 80) continue;

      const bobY = e.def.flying ? Math.sin(e.bob) * 5 : 0;
      const x = e.x, y = e.y + bobY;

      ctx.save();
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,.34)';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + e.radius * 0.75, e.radius * 0.85, e.radius * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();

      // Boss moves still use their own state names; both funnel into the same
      // blue-means-parry / red-means-dodge language.
      const bossTell = e.state === 'slamWind' ? 'red' : e.state === 'chargeWind' ? 'red' : null;
      if (bossTell) this.drawTelegraph(ctx, e, x, y, bossTell, U.clamp(e.stateT / 0.7, 0, 1), null);
      if (e.atk && e.atk.phase === 'wind') {
        this.drawTelegraph(ctx, e, x, y, e.atk.def.kind,
          U.clamp(e.atk.t / e.atk.def.wind, 0, 1), e.atk);
      }
      if (e.stagger > 0) {
        ctx.globalAlpha = 0.3 + Math.sin(this.time * 12) * 0.12;
        ctx.strokeStyle = '#8fd4ff';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, e.radius * 1.5, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (e.root > 0) {
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#5f8f3a';
        ctx.lineWidth = 2.5;
        for (let k = 0; k < 4; k++) {
          const ra = (k / 4) * Math.PI * 2 + this.time;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(ra) * e.radius * 1.4, y + Math.sin(ra) * e.radius * 0.8);
          ctx.lineTo(x, y + e.radius * 0.5);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      if (e.chill > 0) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#a9dcff';
        ctx.beginPath(); ctx.arc(x, y, e.radius * 1.25, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // Update 4.0 statuses wear their colour.
      const tint = e.burnT > 0 ? '#ff8a3c' : e.poisonT > 0 ? '#8fd14a' : e.bleedT > 0 ? '#ff5a5a' : null;
      if (tint) {
        ctx.globalAlpha = 0.18 + Math.sin(this.time * 9) * 0.06;
        ctx.fillStyle = tint;
        ctx.beginPath(); ctx.arc(x, y, e.radius * 1.15, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (e.hexT > 0) {
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = '#c07bff';
        ctx.setLineDash([4, 5]);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, e.radius * 1.4, this.time, this.time + Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }

      const body = e.flash > 0 ? '#ffffff' : e.def.color;
      ctx.fillStyle = body;
      if (e.def.ghost) ctx.globalAlpha = 0.72;
      ctx.shadowBlur = e.elite || e.def.boss ? 20 : 0;
      ctx.shadowColor = e.def.color;

      if (e.def.palette) {
        // During the intro the boss rises out of the floor.
        const s = e.introScale === undefined ? 1 : e.introScale;
        if (s < 1) {
          ctx.translate(x, y + e.radius);
          ctx.scale(0.4 + s * 0.6, s);
          ctx.translate(-x, -(y + e.radius));
          ctx.globalAlpha = 0.3 + s * 0.7;
        }
        this.drawBossForm(ctx, e, x, y, body);
      } else {
        // Every ordinary creature now has its own silhouette and its own
        // attack animation, both driven from js/art.js.
        Art.drawEnemy(ctx, e, x, y, this.time, body);
      }

      ctx.restore();

      // Dizzy: little stars round the head.
      if (e.dizzy > 0) {
        ctx.save();
        ctx.fillStyle = '#ffe066';
        for (let k = 0; k < 3; k++) {
          const a = this.time * 6 + k * 2.09;
          ctx.globalAlpha = 0.9;
          ctx.fillRect(x + Math.cos(a) * e.radius * 0.8 - 2, y - e.radius - 8 + Math.sin(a) * 4 - 2, 4, 4);
        }
        ctx.restore();
      }

      // health bar for elites & wounded enemies (minibosses get the big bar)
      if ((e.elite || e.hp < e.maxHp) && !e.isHeavyweight) {
        const w = e.radius * 2.2;
        ctx.fillStyle = 'rgba(0,0,0,.65)';
        ctx.fillRect(x - w / 2, y - e.radius - 13, w, 4);
        ctx.fillStyle = e.elite ? '#e2b34a' : '#e1553c';
        ctx.fillRect(x - w / 2, y - e.radius - 13, w * (e.hp / e.maxHp), 4);
      }
      if (e.elite) {
        ctx.fillStyle = '#e2b34a';
        ctx.font = '9px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('ELITE', x, y - e.radius - 18);
      }
      // Tridon's Curse advertises itself: a kaboom icon that flashes faster
      // as the fuse burns down.
      if (e.def.kaboom && !e.dead) {
        const lit = e.lit;
        const blink = lit ? Math.sin(this.time * 34) > -0.2 : true;
        if (blink) {
          ctx.save();
          ctx.globalAlpha = lit ? 1 : 0.8;
          ctx.font = `700 ${lit ? 20 : 15}px system-ui`;
          ctx.textAlign = 'center';
          ctx.fillStyle = lit ? '#ffd479' : '#ff8a3c';
          ctx.shadowBlur = lit ? 14 : 6;
          ctx.shadowColor = '#ff8a3c';
          ctx.fillText('💥', x, y - e.radius - 16);
          ctx.restore();
        }
        if (lit) {
          ctx.save();
          ctx.globalAlpha = 0.35 + Math.sin(this.time * 26) * 0.2;
          ctx.strokeStyle = '#ff8a3c';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(x, y, e.def.suicide.radius * 0.55, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Shrine guardians wear a mark, so you can tell which of the enemies in
      // the room are the ones actually holding the shrine open.
      if (e.guardian && !e.guardian.used) {
        ctx.save();
        ctx.translate(x, y - e.radius - (e.elite ? 28 : 20));
        ctx.globalAlpha = 0.85 + Math.sin(this.time * 5) * 0.15;
        ctx.fillStyle = '#ff3b1f';
        ctx.shadowBlur = 8; ctx.shadowColor = '#ff3b1f';
        ctx.beginPath();
        ctx.moveTo(0, -5); ctx.lineTo(5, 0); ctx.lineTo(0, 5); ctx.lineTo(-5, 0);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
  }

  /* The read. A ring closes toward the enemy as the wind-up completes — it
     touches the body exactly when the hit lands, so timing is judged by
     distance rather than by counting frames. Blue can be parried, red cannot. */
  /* The three Update 2.0 bosses get real silhouettes rather than the shared
     blocky one — a corona, a bloom, and a pair of fists. */
  drawBossForm(ctx, e, x, y, body) {
    // Bosses drawn by art.js (Colonel Zee) go through the shared dispatcher.
    if (Art.enemy[e.type]) { Art.drawEnemy(ctx, e, x, y, this.time, body); return; }
    const r = e.radius;
    const t = this.time;
    ctx.save();
    if (e.def.palette === 'sun') {
      // Corona of rays around a burning core.
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#ff9a2e';
      for (let i = 0; i < 12; i++) {
        const a = t * 0.6 + (i / 12) * Math.PI * 2;
        const len = r * (1.5 + Math.sin(t * 3 + i) * 0.22);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85);
        ctx.lineTo(x + Math.cos(a + 0.13) * len, y + Math.sin(a + 0.13) * len);
        ctx.lineTo(x + Math.cos(a - 0.13) * len, y + Math.sin(a - 0.13) * len);
        ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(x, y, r * 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, Math.PI * 2); ctx.fill();

    } else if (e.def.palette === 'flora') {
      // Petals around a dark eye, swaying.
      const sway = Math.sin(t * 1.6) * 0.12;
      ctx.fillStyle = '#4e8f3c';
      for (let i = 0; i < 8; i++) {
        const a = sway + (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95,
          r * 0.55, r * 0.3, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1d2f16';
      ctx.beginPath(); ctx.arc(x, y, r * 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c8f0a0';
      ctx.beginPath(); ctx.arc(x - r * 0.1, y - r * 0.1, r * 0.13, 0, Math.PI * 2); ctx.fill();

    } else {
      // Judgement: a torso and two oversized fists that wind with the attack —
      // and since Update 4.0, a gavel-hammer in the right one. Judgement 2.0
      // wears a burning halo and gold.
      const v2 = e.def.palette === 'verdict';
      const swing = e.atk || e.state === 'chargeWind' || e.state === 'charging' ? 1 : 0;
      const reach = r * (0.95 + swing * 0.5);
      if (v2) {
        ctx.globalAlpha = 0.6 + Math.sin(t * 5) * 0.2;
        ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 3;
        ctx.shadowBlur = 18; ctx.shadowColor = '#ffb347';
        ctx.beginPath(); ctx.ellipse(x, y - r * 1.62, r * 0.55, r * 0.16, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
      ctx.fillStyle = body;
      ctx.fillRect(x - r * 0.5, y - r * 0.95, r, r * 1.9);
      ctx.beginPath(); ctx.arc(x, y - r * 1.1, r * 0.42, 0, Math.PI * 2); ctx.fill();
      if (v2) {
        ctx.fillStyle = '#c8452f';
        ctx.fillRect(x - r * 0.3, y - r * 1.16, r * 0.6, r * 0.1);   // a red blindfold
      }
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : v2 ? '#ffe6a8' : '#cfc7b8';
      for (const side of [-1, 1]) {
        const fx2 = x + side * reach, fy2 = y + Math.sin(t * 4 + side) * 3;
        ctx.beginPath(); ctx.arc(fx2, fy2, r * 0.52, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + side * r * 0.45, y - r * 0.2);
        ctx.lineTo(fx2, fy2); ctx.stroke();
      }
      // The hammer, raised high on the wind-up and brought down on the blow.
      const lift = e.atk ? (e.atk.phase === 'wind' ? -1.2 : 0.6) : -0.4;
      ctx.save();
      ctx.translate(x + reach, y);
      ctx.rotate(lift);
      ctx.fillStyle = '#6b5a48';
      ctx.fillRect(-3, -r * 1.3, 6, r * 1.3);
      ctx.fillStyle = v2 ? '#ffd479' : '#e8e2d4';
      ctx.fillRect(-r * 0.42, -r * 1.55, r * 0.84, r * 0.42);
      ctx.restore();
    }
    ctx.restore();
  }

  drawTelegraph(ctx, e, x, y, kind, progress, atk) {
    // A braced Tanker sees no red: the shield makes everything parryable,
    // so the indicator has to say so before the blow lands, not after.
    const red = kind === 'red' && !this.player.isBlocking();
    const heavy = kind === 'heavy';
    // Against a boss (or John's trial) a blue cannot be parried, so it is
    // drawn pale rather than in the parry blue.
    const lightOnly = kind === 'blue' && (e.def.boss || e.def.big || e.trial);
    const col = heavy ? '#ffd479' : red ? '#ff5a3c' : lightOnly ? '#b9c3d6' : '#8fd4ff';
    const r = e.radius;

    ctx.save();
    // The cop car paints its whole lane: that is the entire dodge.
    if (atk && atk.def.lane) {
      const len = atk.def.chargeSpeed * atk.def.active;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(atk.angle);
      ctx.globalAlpha = 0.12 + progress * 0.22;
      ctx.fillStyle = '#ff5a3c';
      ctx.fillRect(0, -r * 1.1, len, r * 2.2);
      ctx.globalAlpha = 0.5 + progress * 0.4;
      ctx.strokeStyle = '#ffd479';
      ctx.setLineDash([12, 10]);
      ctx.lineWidth = 2;
      ctx.strokeRect(0, -r * 1.1, len, r * 2.2);
      ctx.setLineDash([]);
      ctx.restore();
    }
    // A sniper's laser sight: the line it is going to fire down.
    if (atk && atk.def.laser) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(atk.angle);
      ctx.globalAlpha = 0.25 + progress * 0.65;
      ctx.strokeStyle = '#ff3b1f';
      ctx.lineWidth = 1 + progress * 1.6;
      ctx.shadowBlur = 8; ctx.shadowColor = '#ff3b1f';
      ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(atk.def.range, 0); ctx.stroke();
      ctx.restore();
    }
    // Closing ring
    const ringR = U.lerp(r * 3.4, r * 1.05, progress);
    ctx.globalAlpha = 0.35 + progress * 0.5;
    ctx.strokeStyle = col;
    ctx.lineWidth = red ? 3.5 : 2.2;
    if (red) { ctx.shadowBlur = 16; ctx.shadowColor = col; }
    ctx.beginPath();
    ctx.arc(x, y, ringR, 0, Math.PI * 2);
    ctx.stroke();

    // Direction of the blow, so you know where to stand
    if (atk) {
      const def = atk.def;
      const reach = def.reach || (def.shape === 'charge' ? 150 : 90);
      const arc = def.arc || 0.6;
      ctx.globalAlpha = 0.10 + progress * 0.22;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, reach + r, atk.angle - arc / 2, atk.angle + arc / 2);
      ctx.closePath();
      ctx.fill();
    }

    // Body glow ramps with the wind-up
    ctx.globalAlpha = (0.16 + progress * 0.3) * (red ? 1 : 0.75);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.35, 0, Math.PI * 2);
    ctx.fill();

    // Unblockable badge: never ambiguous at a glance
    if (red) {
      ctx.globalAlpha = 0.5 + Math.sin(this.time * 22) * 0.3;
      ctx.fillStyle = '#ffd0c4';
      ctx.font = '700 13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('!', x, y - r - 16);
    }
    // HEAVY: the one a boss lets you parry. Make it impossible to miss.
    if (heavy) {
      ctx.globalAlpha = 0.75 + Math.sin(this.time * 18) * 0.25;
      ctx.fillStyle = '#ffd479';
      ctx.shadowBlur = 12; ctx.shadowColor = '#ffb347';
      ctx.font = '800 13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('HEAVY — PARRY', x, y - r - 18);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff1c9';
      ctx.beginPath(); ctx.arc(x, y, r * 1.05 + 4, 0, Math.PI * 2 * progress); ctx.stroke();
    }
    ctx.restore();
  }

  drawPlayer(ctx) {
    const p = this.player;
    if (p.dead) return;
    const x = p.x, y = p.y + Math.sin(p.bob) * 1.6;
    const c = p.cls.color;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.38)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 11, 11, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sword arc
    if (p.swing) {
      const s = p.swing;
      const prog = U.clamp((s.t - s.wind) / (s.dur - s.wind), 0, 1);
      if (s.t >= s.wind * 0.5) {
        const half = s.arc / 2;
        const sweep = s.arc >= Math.PI * 2 ? Math.PI * 2 * prog : U.lerp(-half, half, prog) ;
        const a0 = s.arc >= Math.PI * 2 ? s.angle : s.angle - half;
        const a1 = s.arc >= Math.PI * 2 ? s.angle + sweep : s.angle + sweep * s.side;
        ctx.globalAlpha = (1 - prog) * (s.heavy ? 0.8 : 0.55);
        const grad = ctx.createRadialGradient(x, y, s.range * 0.3, x, y, s.range);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, s.heavy ? 'rgba(255,220,150,.95)' : 'rgba(255,255,255,.8)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, s.range, Math.min(a0, a1), Math.max(a0, a1));
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Body — per-class silhouette with a walk cycle, from js/art.js.
    if (p.iframes > 0 && Math.floor(this.time * 24) % 2 === 0) ctx.globalAlpha = 0.45;
    // Unseen: a faint shimmer in the air where the Ninja is.
    if (p.hidden) ctx.globalAlpha = 0.28 + Math.sin(this.time * 5) * 0.06;
    Art.player.draw(ctx, p, x, y, this.time);

    // Weapon in hand
    const hx = x + Math.cos(p.aim) * 12, hy = y + Math.sin(p.aim) * 12;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(p.aim);
    p.cls.drawWeapon(ctx, p, this);
    ctx.restore();

    // Parry guard: a bright arc facing the aim, and an afterglow on success.
    if (p.parryT > 0 || p.parryFlash > 0) {
      const open = p.parryT > 0;
      const a = open ? p.parryT / PARRY.window : p.parryFlash / 0.4;
      ctx.save();
      ctx.globalAlpha = open ? 0.45 + a * 0.5 : a * 0.85;
      ctx.strokeStyle = open ? '#8fd4ff' : '#ffffff';
      ctx.lineWidth = open ? 3 : 4.5;
      ctx.shadowBlur = 14; ctx.shadowColor = '#8fd4ff';
      ctx.beginPath();
      ctx.arc(x, y, 21, p.aim - 1.05, p.aim + 1.05);
      ctx.stroke();
      ctx.restore();
    }

    // Ricochet roll (Update 4.0): the bounce bar under you. Mash M1 to fill
    // it; full is green and means the next wall or enemy bounces you.
    if (p.roll) {
      const r = p.roll;
      const col = r.flash > 0 ? '#4fa8ff' : r.charged ? '#3dff7a' : 'rgba(143,168,200,.55)';
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = r.charged || r.flash > 0 ? 4 : 2;
      ctx.shadowBlur = r.charged || r.flash > 0 ? 16 : 0;
      ctx.shadowColor = col;
      ctx.beginPath(); ctx.arc(x, y, 24 + (r.flash > 0 ? (0.3 - r.flash) * 60 : 0), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = col;
      ctx.translate(x + Math.cos(r.dir) * 34, y + Math.sin(r.dir) * 34);
      ctx.rotate(r.dir);
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
      ctx.restore();

      const bw = 52, bh = 7, bx = x - bw / 2, by = y + 26;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.7)';
      ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = r.charged ? '#3dff7a' : r.meter > 0.66 ? '#c8f06a' : '#ffd479';
      if (r.charged) { ctx.shadowBlur = 12; ctx.shadowColor = '#3dff7a'; }
      ctx.fillRect(bx, by, bw * r.meter, bh);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.font = '800 10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = r.charged ? '#3dff7a' : '#ffffff';
      const tap = this.touch && this.touch.active ? 'TAP' : 'MASH M1';
      ctx.fillText(r.charged ? 'BOUNCE READY' : tap, x, by + bh + 12);
      ctx.restore();
    }

    // Double Sword slice: a bright streak along the cut.
    if (p.dashT > 0 && p.dashStrikeDmg > 0 && p.cls.id === 'melee') {
      ctx.save();
      ctx.strokeStyle = '#fff1c9';
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 5;
      ctx.shadowBlur = 16; ctx.shadowColor = '#ffe6b0';
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(p.dashDir) * 60, y - Math.sin(p.dashDir) * 60);
      ctx.lineTo(x + Math.cos(p.dashDir) * 14, y + Math.sin(p.dashDir) * 14);
      ctx.stroke();
      ctx.restore();
    }

    // The Cursed Totem shows on you: a slow red pulse.
    if (p.curse) {
      ctx.save();
      ctx.globalAlpha = 0.25 + Math.sin(this.time * 3) * 0.12;
      ctx.strokeStyle = '#ff3b1f';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 19, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // Charge ring
    if (p.charging) {
      const t = U.clamp(p.chargeT / p.cls.heavy.chargeTime, 0, 1);
      ctx.strokeStyle = t >= 1 ? '#fff1c9' : c;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(x, y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t);
      ctx.stroke();
      if (t >= 1) {
        ctx.globalAlpha = 0.35 + Math.sin(this.time * 14) * 0.2;
        ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawReticle(ctx) {
    if (this.state !== 'playing') return;
    const { x, y } = this.mouseWorld;
    ctx.save();
    ctx.strokeStyle = this.player.cls.color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 13, y); ctx.lineTo(x - 4, y);
    ctx.moveTo(x + 4, y); ctx.lineTo(x + 13, y);
    ctx.moveTo(x, y - 13); ctx.lineTo(x, y - 4);
    ctx.moveTo(x, y + 4); ctx.lineTo(x, y + 13);
    ctx.stroke();
    ctx.restore();
  }

  drawLighting() {
    const l = this.lctx;
    const W = this.light.width, H = this.light.height;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-over';
    // Day-ZEE is under the sky: a grey dusk instead of the dark of the deep.
    const outdoor = !!this.dungeon.map.outdoor;
    l.fillStyle = outdoor ? 'rgba(12,14,20,0.52)' : 'rgba(4,4,8,0.90)';
    l.clearRect(0, 0, W, H);
    l.fillRect(0, 0, W, H);

    l.globalCompositeOperation = 'destination-out';
    // Blit the pre-rendered falloff instead of building a gradient per light
    // per frame — same look, a fraction of the cost, and it scales with the
    // torch count rather than fighting it.
    const cut = (wx, wy, radius, strength = 1) => {
      const sx = (wx - this.cam.x + this.fx.shakeX) / 2;
      const sy = (wy - this.cam.y + this.fx.shakeY) / 2;
      const r = radius / 2;
      if (sx < -r || sx > W + r || sy < -r || sy > H + r) return;
      l.globalAlpha = strength;
      l.drawImage(this.glow, sx - r, sy - r, r * 2, r * 2);
      l.globalAlpha = 1;
    };

    const flick = 1 + Math.sin(this.time * 9) * 0.015;
    cut(this.player.x, this.player.y, 470 * flick, 1);
    for (const tor of this.dungeon.torches) {
      const f = 0.85 + Math.sin(this.time * 7 + tor.phase) * 0.1;
      cut(tor.x, tor.y, (outdoor ? 330 : 230) * f, 0.92);
    }
    for (const b of this.beams) cut(b.x + Math.cos(b.angle) * b.len / 2, b.y + Math.sin(b.angle) * b.len / 2, b.len * 0.8, 0.35);
    for (const prop of this.dungeon.props) {
      if (prop.used && prop.type !== 'gate') continue;
      cut(prop.x, prop.y, prop.type === 'gate' ? 300 : 150, 0.8);
    }
    for (const pr of this.projectiles) cut(pr.x, pr.y, 90, 0.55);
    for (const m of this.minions) cut(m.x, m.y, 130, 0.5);
    for (const c of this.companions) cut(c.x, c.y, 150, 0.5);
    for (const z of this.zones) cut(z.x, z.y, z.radius * 2.2, 0.45);
    for (const m of this.impacts) cut(m.x, m.y, m.radius * 2.2, 0.5);
    if (this.boss) cut(this.boss.x, this.boss.y, 320, 0.7);

    l.globalCompositeOperation = 'source-over';

    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.px, 0, 0, this.px, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.light, 0, 0, this.vw, this.vh);

    // Warm ambient tint over everything
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = outdoor ? 0.12 : 0.08;
    ctx.fillStyle = outdoor ? '#8fa6c0' : '#ffb27a';
    ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // Vignette
    const vg = ctx.createRadialGradient(this.vw / 2, this.vh / 2, Math.min(this.vw, this.vh) * 0.32,
      this.vw / 2, this.vh / 2, Math.max(this.vw, this.vh) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.72)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.restore();
  }

  drawOverlays(ctx) {
    ctx.save();
    ctx.setTransform(this.px, 0, 0, this.px, 0, 0);

    if (this.fx.flash > 0) {
      ctx.globalAlpha = Math.min(0.6, this.fx.flash);
      ctx.fillStyle = this.fx.flashColor;
      ctx.fillRect(0, 0, this.vw, this.vh);
      ctx.globalAlpha = 1;
    }

    // Low-health pulse
    const hpFrac = this.player.hp / this.player.maxHp;
    if (hpFrac < 0.3 && !this.player.dead) {
      ctx.globalAlpha = (0.3 - hpFrac) * (0.9 + Math.sin(this.time * 6) * 0.5);
      const g = ctx.createRadialGradient(this.vw / 2, this.vh / 2, this.vh * 0.28, this.vw / 2, this.vh / 2, this.vh * 0.72);
      g.addColorStop(0, 'rgba(200,40,20,0)');
      g.addColorStop(1, 'rgba(200,40,20,.95)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.vw, this.vh);
      ctx.globalAlpha = 1;
    }

    // Ash drifting across the sky over Day-ZEE.
    if (this.dungeon.map.outdoor) {
      ctx.save();
      ctx.fillStyle = '#c8c8c8';
      for (let i = 0; i < 40; i++) {
        const sp = 18 + (i % 5) * 9;
        const ax = (i * 173.3 + this.time * sp * 0.6 - this.cam.x * 0.15) % this.vw;
        const ay = (i * 97.7 + this.time * sp - this.cam.y * 0.15) % this.vh;
        ctx.globalAlpha = 0.12 + (i % 4) * 0.05;
        ctx.fillRect((ax + this.vw) % this.vw, (ay + this.vh) % this.vh, 2, 2);
      }
      ctx.restore();
    }

    /* Dedicated boss bar. Every boss gets one, named and titled, with a
       lagging "damage taken" ghost behind the fill so big hits read.
       Update 4.0: an awake miniboss gets the same bar when no boss is up. */
    const barTarget = this.boss && !this.boss.dead ? this.boss : this.activeMiniboss;
    if (barTarget && !this.cinematic) {
      const b = barTarget;
      const w = Math.min(620, this.vw * 0.58), h = 17;
      const x = (this.vw - w) / 2, y = this.vh - 78;
      const frac = U.clamp(b.hp / b.maxHp, 0, 1);
      b.barGhost = b.barGhost === undefined ? frac : U.damp(b.barGhost, frac, 0.06, 1 / 60);

      ctx.fillStyle = 'rgba(0,0,0,.78)';
      ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
      ctx.fillStyle = 'rgba(255,220,180,.35)';
      ctx.fillRect(x, y, w * b.barGhost, h);
      const col = b.def.palette === 'sun' ? '#ffc24d'
        : b.def.palette === 'flora' ? '#7fd66a'
        : b.def.palette === 'fist' ? '#e8e2d4'
        : b.def.palette === 'verdict' ? '#ffd479'
        : b.def.palette === 'colonel' ? '#a8b86a'
        : b.def.big ? '#ff8a5c' : '#c8452f';
      ctx.fillStyle = col;
      ctx.fillRect(x, y, w * frac, h);
      ctx.strokeStyle = 'rgba(226,179,74,.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);

      // Phase ticks
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      for (const t of [0.3, 0.62]) ctx.fillRect(x + w * t, y, 2, h);

      ctx.fillStyle = '#f0e6d2';
      ctx.font = '600 13px system-ui';
      ctx.textAlign = 'center';
      const title = b.def.title ? ` — ${b.def.title.toUpperCase()}` : '';
      ctx.fillText(`${(b.titleName || b.def.name).toUpperCase()}${title}`, this.vw / 2, y - 16);
      ctx.font = '600 10px system-ui';
      ctx.fillStyle = 'rgba(240,230,210,.6)';
      ctx.fillText(`${b.def.big ? 'MINIBOSS  ·  ' : ''}PHASE ${b.phase}  ·  ${Math.ceil(b.hp).toLocaleString()} / ${b.maxHp.toLocaleString()}`, this.vw / 2, y - 4);
    }

    /* John Space carries a bar whether he is neutral or hostile — it is how
       you know he is not just another wanderer. */
    // Update 4.0: his bar only shows when you are near him (or fighting him).
    const j = this.johnSpace;
    if (j && !j.dead && (j.trial || U.dist(j.x, j.y, this.player.x, this.player.y) < 560)) {
      const w = Math.min(420, this.vw * 0.4), h = 12;
      const x = (this.vw - w) / 2, y = 132;   // clear of the HUD chips and the toast
      const frac = U.clamp(j.hp / j.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,.75)';
      ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      ctx.fillStyle = j.enraged ? '#c8452f' : '#8fd4ff';
      ctx.fillRect(x, y, w * frac, h);
      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
      ctx.fillStyle = '#f0e6d2';
      ctx.font = '600 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(j.enraged ? 'JOHN SPACE — PROVOKED' : j.trial ? 'JOHN SPACE — THE TRIAL' : 'JOHN SPACE — NEUTRAL',
        this.vw / 2, y - 6);
      if (j.trial) {
        // The trial clock: big, because it is the whole fight.
        const left = Math.max(0, j.def.trialRequired - j.trialT);
        const m = Math.floor(left / 60), s = Math.floor(left % 60);
        ctx.fillStyle = '#ffd479';
        ctx.font = '700 22px system-ui';
        ctx.fillText(`${m}:${String(s).padStart(2, '0')}`, this.vw / 2, y + h + 26);
        ctx.fillStyle = 'rgba(240,230,210,.6)';
        ctx.font = '10px system-ui';
        ctx.fillText('survive — do NOT hit him back · parry only his gold HEAVIES', this.vw / 2, y + h + 42);
        if (j.chain) {
          ctx.fillStyle = '#ffd479';
          ctx.font = '700 13px system-ui';
          ctx.fillText(`PARRY CHAIN ${j.chain.count} — ${j.chain.left} MORE`, this.vw / 2, y + h + 60);
        }
      } else if (!j.enraged) {
        const left = Math.max(0, j.def.peaceRequired - j.peaceT);
        ctx.fillStyle = 'rgba(240,230,210,.55)';
        ctx.font = '10px system-ui';
        ctx.fillText(`leave him alone: ${Math.ceil(left)}s  ·  or press E beside him to fight for it`, this.vw / 2, y + h + 13);
      }
    }

    this.drawStatusEffects(ctx);
    this.drawCompanionTrackers(ctx);

    this.drawRhythm(ctx);

    /* Shrine fight banner. It sits above the boss bar's slot and mirrors it,
       because it is the same kind of commitment: a fight you have started and
       have to finish. */
    if (this.activeShrine) {
      const s = this.activeShrine;
      const total = s.waveTotal || 1;
      const left = s.remaining ?? total;
      const w = Math.min(420, this.vw * 0.4), h = 11;
      const x = (this.vw - w) / 2, y = this.vh - 112;
      ctx.fillStyle = 'rgba(0,0,0,.72)';
      ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      ctx.fillStyle = '#ff3b1f';
      ctx.fillRect(x, y, w * ((total - left) / total), h);
      ctx.strokeStyle = 'rgba(255,90,60,.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
      ctx.fillStyle = '#ffb9a8';
      ctx.font = '600 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`RED SHRINE — ${left} GUARDIAN${left === 1 ? '' : 'S'} REMAIN${left === 1 ? 'S' : ''}`,
        this.vw / 2, y - 6);

      // Point at any guardian that has wandered off screen, and at the shrine.
      const mark = (wx, wy, col, size) => {
        const sx = wx - this.cam.x, sy = wy - this.cam.y;
        if (sx >= 0 && sx <= this.vw && sy >= 0 && sy <= this.vh) return;
        const a = Math.atan2(sy - this.vh / 2, sx - this.vw / 2);
        const px = this.vw / 2 + Math.cos(a) * (Math.min(this.vw, this.vh) * 0.36);
        const py = this.vh / 2 + Math.sin(a) * (Math.min(this.vw, this.vh) * 0.36);
        ctx.save();
        ctx.translate(px, py); ctx.rotate(a);
        ctx.globalAlpha = 0.6 + Math.sin(this.time * 4) * 0.2;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(size, 0); ctx.lineTo(-size * 0.6, -size * 0.6); ctx.lineTo(-size * 0.6, size * 0.6);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      };
      for (const e of s.wave) if (!e.dead) mark(e.x, e.y, '#ff3b1f', 8);
      mark(s.x, s.y, '#ff8a6a', 11);
    }

    this.drawObjectiveArrows(ctx);

    // Off-screen pointer to the Warden's Gate once you've found it
    if (this.gateFound && !this.bossDefeated && this.dungeon.boss) {
      const gx = this.dungeon.boss.wx, gy = this.dungeon.boss.wy;
      const sx = gx - this.cam.x, sy = gy - this.cam.y;
      if (sx < 0 || sx > this.vw || sy < 0 || sy > this.vh) {
        const a = Math.atan2(sy - this.vh / 2, sx - this.vw / 2);
        const px = this.vw / 2 + Math.cos(a) * (Math.min(this.vw, this.vh) * 0.4);
        const py = this.vh / 2 + Math.sin(a) * (Math.min(this.vw, this.vh) * 0.4);
        ctx.save();
        ctx.translate(px, py); ctx.rotate(a);
        ctx.globalAlpha = 0.55 + Math.sin(this.time * 3) * 0.2;
        ctx.fillStyle = '#c8452f';
        ctx.beginPath();
        ctx.moveTo(11, 0); ctx.lineTo(-7, -7); ctx.lineTo(-7, 7);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }

    this.drawRoulette(ctx);
    this.drawCinematic(ctx);
    ctx.restore();
  }

  /* Timed debuffs under the bars, so a drained mana pool never looks like
     a bug. */
  drawStatusEffects(ctx) {
    const p = this.player;
    const tags = [];
    if (p.curse) tags.push([p.curse.linger > 0 ? `CURSE lifts ${p.curse.linger.toFixed(1)}s` : 'CURSED TOTEM — HALVED', '#ff6b52']);
    if (p.hpCap) tags.push([`HEALTH HELD 65% · ${p.hpCap.t.toFixed(1)}s`, '#c4e86b']);
    if (p.manaLockT > 0) tags.push([`MANA DRAINED · ${p.manaLockT.toFixed(1)}s`, '#7b8cff']);
    if (p.dashLockT > 0) tags.push([`DASH LOCKED · ${p.dashLockT.toFixed(1)}s`, '#ffe6b0']);
    if (p.rootT > 0) tags.push([`ROOTED · ${p.rootT.toFixed(1)}s`, '#8fd14a']);
    if (p.prejudgedT > 0) tags.push([`PREJUDGED — +30% DAMAGE · ${p.prejudgedT.toFixed(1)}s`, '#ff6b52']);
    if (p.energyDebt) tags.push([`STAMINA -${Math.round(p.energyDebt.amount)} · ${p.energyDebt.t.toFixed(1)}s`, '#ffd479']);
    if (p.ward > 0) tags.push(['MIRROR WARD', '#cfe8ff']);
    if (p.cls.ambush && p.slotDef && p.slotDef.id === 'ambush') {
      tags.push(p.hidden ? ['UNSEEN — NEXT HIT IS AN AMBUSH', '#b8a8ff']
        : [`SEEN · HIDING IN ${Math.max(0, p.cls.ambush.rehide * p.rehideMul - p.hideT).toFixed(1)}s`, '#8f86b0']);
    }
    if (!tags.length) return;
    ctx.save();
    ctx.font = '700 10px system-ui';
    ctx.textAlign = 'left';
    tags.forEach(([txt, col], i) => {
      const y = 112 + i * 17;
      const w = ctx.measureText(txt).width + 14;
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(88, y - 11, w, 15);
      ctx.fillStyle = col;
      ctx.fillText(txt, 95, y);
    });
    ctx.restore();
  }

  /* Trackers: an arrow at the screen edge for every companion and minion
     that has fallen out of view, in its own colour, so you always know where
     your people are. */
  drawCompanionTrackers(ctx) {
    if (this.state !== 'playing') return;
    const followers = [...this.companions, ...this.minions].filter(f => !f.dead);
    for (const f of followers) {
      const sx = f.x - this.cam.x, sy = f.y - this.cam.y;
      if (sx > 20 && sx < this.vw - 20 && sy > 20 && sy < this.vh - 20) continue;
      const a = Math.atan2(sy - this.vh / 2, sx - this.vw / 2);
      const ring = Math.min(this.vw, this.vh) * 0.44;
      const px = this.vw / 2 + Math.cos(a) * ring, py = this.vh / 2 + Math.sin(a) * ring;
      const comp = f instanceof Companion;
      const size = comp ? 9 : 6;
      ctx.save();
      ctx.translate(px, py);
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = f.def.color;
      ctx.beginPath(); ctx.arc(0, 0, size * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(size + 6, 0); ctx.lineTo(size - 2, -size * 0.6); ctx.lineTo(size - 2, size * 0.6);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      if (comp) {
        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = f.def.color;
        ctx.font = '600 9px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(`${f.def.name.replace('The ', '')} ${Math.round(U.dist(f.x, f.y, this.player.x, this.player.y) / TILE)}m`,
          px, py + 18);
        ctx.restore();
      }
    }
  }

  /* ---------------- maps ---------------- */

  /* The explored terrain only changes when you explore, so it is painted once
     into an offscreen canvas and blitted. Both maps read from this cache;
     only the moving markers are drawn per frame. */
  syncExploreCanvas() {
    const d = this.dungeon;
    const px = 4;   // cache resolution, pixels per tile
    if (!this.exploreCanvas || this.exploreCanvas.width !== d.w * px) {
      this.exploreCanvas = document.createElement('canvas');
      this.exploreCanvas.width = d.w * px;
      this.exploreCanvas.height = d.h * px;
      this.exploreCtx = this.exploreCanvas.getContext('2d');
      this.explorePx = px;
      // Repaint everything already known (fresh map, or a resumed save).
      d.newlyExplored.length = 0;
      for (let ty = 0; ty < d.h; ty++) {
        for (let tx = 0; tx < d.w; tx++) if (d.isExplored(tx, ty)) this.paintExplored(tx, ty);
      }
      return;
    }
    const list = d.newlyExplored;
    for (let i = 0; i < list.length; i += 2) this.paintExplored(list[i], list[i + 1]);
    list.length = 0;
  }

  paintExplored(tx, ty) {
    const d = this.dungeon, px = this.explorePx;
    const t = d.at(tx, ty);
    if (t === T.WALL) return;
    this.exploreCtx.fillStyle = t === T.WATER ? (d.map.outdoor ? '#2e4250' : '#26505f') : d.palette(d.tierAt(tx, ty)).accent;
    this.exploreCtx.fillRect(tx * px, ty * px, px, px);
  }

  drawMinimap() {
    const c = this.mmctx, d = this.dungeon;
    const size = this.minimap.width;
    const span = 46;               // tiles across
    const scale = size / span;
    const pcx = this.player.x / TILE, pcy = this.player.y / TILE;

    this.syncExploreCanvas();

    c.clearRect(0, 0, size, size);
    c.fillStyle = 'rgba(6,6,10,.85)';
    c.fillRect(0, 0, size, size);

    // One blit replaces the ~2,100 fillRects this used to issue per frame.
    const px = this.explorePx;
    c.imageSmoothingEnabled = false;
    c.drawImage(
      this.exploreCanvas,
      (pcx - span / 2) * px, (pcy - span / 2) * px, span * px, span * px,
      0, 0, size, size,
    );

    for (const prop of d.props) {
      const tx = prop.x / TILE, ty = prop.y / TILE;
      if (!d.isExplored(Math.floor(tx), Math.floor(ty))) continue;
      if (prop.used && prop.type !== 'gate') continue;
      const gl = Shrines.glyph(prop);
      c.fillStyle = gl.color;
      c.font = `${gl.big ? 13 : 10}px system-ui`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(gl.icon, (tx - pcx + span / 2) * scale, (ty - pcy + span / 2) * scale);
    }

    for (const e of this.enemies) {
      if (U.dist(e.x, e.y, this.player.x, this.player.y) > span / 2 * TILE) continue;
      c.fillStyle = e.def.boss ? '#ff3b1f'
        : e.def.big ? '#ff8a5c'
        : (e.guardian && !e.guardian.used) ? '#ff3b1f'
        : e.elite ? '#ffb347' : 'rgba(225,85,60,.9)';
      const s = e.def.boss || e.def.big ? 6 : (e.guardian && !e.guardian.used) ? 5 : 3;
      c.fillRect((e.x / TILE - pcx + span / 2) * scale - s / 2, (e.y / TILE - pcy + span / 2) * scale - s / 2, s, s);
    }

    // Your people, in their own colours — clamped to the edge if off the map.
    for (const f of [...this.companions, ...this.minions]) {
      if (f.dead) continue;
      const comp = f instanceof Companion;
      const fx2 = U.clamp((f.x / TILE - pcx + span / 2) * scale, 4, size - 4);
      const fy2 = U.clamp((f.y / TILE - pcy + span / 2) * scale, 4, size - 4);
      c.fillStyle = f.def.color;
      c.beginPath(); c.arc(fx2, fy2, comp ? 3.4 : 2.2, 0, Math.PI * 2); c.fill();
      if (comp) { c.strokeStyle = '#ffffff'; c.lineWidth = 1; c.stroke(); }
    }

    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(size / 2, size / 2, 3.4, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,.55)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(size / 2, size / 2);
    c.lineTo(size / 2 + Math.cos(this.player.aim) * 11, size / 2 + Math.sin(this.player.aim) * 11);
    c.stroke();
  }

  drawBigMap() {
    const c = this.bigctx, d = this.dungeon;
    const W = this.bigmap.width, H = this.bigmap.height;
    c.clearRect(0, 0, W, H);
    const scale = Math.min(W / d.w, H / d.h);
    const ox = (W - d.w * scale) / 2, oy = (H - d.h * scale) / 2;

    this.syncExploreCanvas();
    c.imageSmoothingEnabled = false;
    c.drawImage(this.exploreCanvas, ox, oy, d.w * scale, d.h * scale);

    for (const prop of d.props) {
      const tx = Math.floor(prop.x / TILE), ty = Math.floor(prop.y / TILE);
      if (!d.isExplored(tx, ty)) continue;
      if (prop.used && prop.type !== 'gate') continue;
      const gl = Shrines.glyph(prop);
      c.fillStyle = gl.color;
      c.font = `${gl.big ? 15 : 12}px system-ui`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(gl.icon, ox + tx * scale, oy + ty * scale);
    }

    c.fillStyle = '#fff';
    c.shadowBlur = 10; c.shadowColor = '#fff';
    c.beginPath();
    c.arc(ox + (this.player.x / TILE) * scale, oy + (this.player.y / TILE) * scale, 4, 0, Math.PI * 2);
    c.fill();
    c.shadowBlur = 0;

    c.fillStyle = 'rgba(232,226,212,.6)';
    c.font = '11px system-ui';
    c.textAlign = 'left';
    c.fillText(`seed ${this.seedText}`, 10, H - 10);
  }
}
