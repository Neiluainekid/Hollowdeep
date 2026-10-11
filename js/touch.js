/* Touch controls — phones and tablets.

   This file never touches the player or combat code. It writes into the
   same `game.input` and `game.mouse` the keyboard and mouse already drive,
   so every class, menu and mechanic works unchanged.

   Layout (landscape):
     left half      a floating MOVE stick — put your thumb down anywhere
     right half     a floating AIM stick — push it and you attack that way
     right cluster  HEAVY (hold to charge, drag to aim) · DASH · PARRY ·
                    ABILITY (tap to cycle, hold and drag to pick) · USE
     top right      inventory · map · pause · fullscreen (Platform binds
                    that one on click: a touch press does not count as the
                    gesture the Fullscreen API demands, the release does)
     rhythm break   four arrow pads replace W A S D

   Touch mode turns itself on with the first touch and back off the moment a
   real mouse moves or a key is pressed, so a touchscreen laptop can use both
   in one session. When it is off, none of this is visible. */
'use strict';

class TouchControls {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.move = null;      // { id, ox, oy, dx, dy }
    this.aim = null;       // { id, ox, oy, dx, dy }
    this.heavy = null;     // { id, ox, oy, dx, dy }
    this.ability = null;   // { id, ox, oy, dx, dy, t }
    this.aimDir = 0;
    this.aimDist = 220;
    this.build();
    this.bindModeSwitch();
  }

  /* ---------------- DOM ---------------- */

  build() {
    const root = document.createElement('div');
    root.id = 'touch';
    root.className = 'hidden';
    root.innerHTML = `
      <div class="tz tz-move"></div>
      <div class="tz tz-aim"></div>
      <div class="stick" id="stickMove"><div class="knob"></div></div>
      <div class="stick" id="stickAim"><div class="knob"></div></div>
      <div class="tcluster">
        <button class="tb tb-heavy" data-act="heavy"><span>HEAVY</span></button>
        <button class="tb tb-dash" data-act="dash"><span>DASH</span></button>
        <button class="tb tb-parry" data-act="parry"><span>PARRY</span></button>
        <button class="tb tb-ability" data-act="ability"><span id="tbAbilityIcon">R</span></button>
        <button class="tb tb-use" data-act="use"><span>USE</span></button>
      </div>
      <div class="ttop">
        <button class="ts" data-act="inventory" title="Inventory">🎒</button>
        <button class="ts" data-act="map" title="Map">🗺</button>
        <button class="ts" data-act="pause" title="Pause">❚❚</button>
        <button class="ts" data-fullscreen title="Fullscreen (F)">⛶</button>
      </div>
      <div class="trhythm hidden" id="touchRhythm">
        <button class="tr" data-key="KeyW">▲<i>W</i></button>
        <button class="tr" data-key="KeyA">◀<i>A</i></button>
        <button class="tr" data-key="KeyS">▼<i>S</i></button>
        <button class="tr" data-key="KeyD">▶<i>D</i></button>
      </div>`;
    document.getElementById('stage').appendChild(root);

    const rotate = document.createElement('div');
    rotate.id = 'rotate';
    rotate.innerHTML = '<div><div class="rot-ic">⟳</div>Turn your phone sideways to play.</div>';
    document.getElementById('stage').appendChild(rotate);

    this.root = root;
    this.stickMove = root.querySelector('#stickMove');
    this.stickAim = root.querySelector('#stickAim');
    this.rhythmPad = root.querySelector('#touchRhythm');
    this.abilityIcon = root.querySelector('#tbAbilityIcon');

    root.querySelector('.tz-move').addEventListener('pointerdown', e => this.stickDown(e, 'move'));
    root.querySelector('.tz-aim').addEventListener('pointerdown', e => this.stickDown(e, 'aim'));
    for (const b of root.querySelectorAll('[data-act]')) {
      b.addEventListener('pointerdown', e => this.buttonDown(e, b.dataset.act, b));
    }
    for (const b of root.querySelectorAll('[data-key]')) {
      b.addEventListener('pointerdown', e => {
        e.preventDefault();
        this.game.rhythmKey(b.dataset.key);
      });
    }
    root.addEventListener('pointermove', e => this.pointerMove(e));
    root.addEventListener('pointerup', e => this.pointerUp(e));
    root.addEventListener('pointercancel', e => this.pointerUp(e));
    root.addEventListener('contextmenu', e => e.preventDefault());

    // On a touch screen the interaction prompt is itself a button.
    document.getElementById('prompt').addEventListener('pointerdown', e => {
      if (!this.active) return;
      e.preventDefault();
      this.game.interact();
    });
  }

  /* Touch turns the mode on; a real mouse or a key turns it off. Compat
     mouse events synthesised from taps do not fire `pointermove` with a
     mouse pointer type, so they cannot flip it back by accident. */
  bindModeSwitch() {
    addEventListener('pointerdown', e => { if (e.pointerType === 'touch') this.setActive(true); }, true);
    addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) this.setActive(false); });
    addEventListener('keydown', () => this.setActive(false));
  }

  setActive(on) {
    if (this.active === on) return;
    this.active = on;
    document.body.classList.toggle('touch-mode', on);
    if (!on) this.releaseAll();
    this.game.hudCache = {};
  }

  /* ---------------- input ---------------- */

  // Keep receiving this finger's moves even if it slides off the control.
  // Capture can be refused (the pointer already lifted); that is harmless.
  capture(e) {
    try { this.root.setPointerCapture(e.pointerId); } catch { /* fine */ }
  }

  stickDown(e, which) {
    e.preventDefault();
    const g = this.game;
    // A boss intro is skipped by a tap anywhere.
    if (g.cinematic) { g.skipCinematic(); return; }
    if (this[which]) return;
    this.capture(e);
    this[which] = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
    const el = which === 'move' ? this.stickMove : this.stickAim;
    el.style.left = `${e.clientX}px`;
    el.style.top = `${e.clientY}px`;
    el.classList.add('on');
    // A tap on the aim side is a press, even before the stick moves — that
    // is what the Tanker's ricochet timing listens for.
    if (which === 'aim') g.input.lPressed = true;
  }

  buttonDown(e, act, el) {
    e.preventDefault();
    e.stopPropagation();
    const g = this.game;
    if (g.cinematic) { g.skipCinematic(); return; }
    el.classList.add('down');
    setTimeout(() => el.classList.remove('down'), 140);
    switch (act) {
      case 'heavy':
        this.capture(e);
        this.heavy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0, el };
        el.classList.add('held');
        g.input.mouseR = true;
        g.input.rPressed = true;
        break;
      case 'dash': g.input.dash = true; break;
      case 'parry': g.input.parry = true; g.input.parryPressed = true; setTimeout(() => { g.input.parry = false; }, 90); break;
      case 'ability':
        this.capture(e);
        this.ability = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0, el };
        el.classList.add('held');
        g.openRoulette();
        break;
      case 'use': g.interact(); break;
      case 'inventory': g.openInventory(); break;
      case 'map': g.toggleMap(); break;
      case 'pause': g.togglePause(); break;
    }
  }

  pointerMove(e) {
    for (const k of ['move', 'aim', 'heavy', 'ability']) {
      const s = this[k];
      if (!s || s.id !== e.pointerId) continue;
      s.dx = e.clientX - s.ox;
      s.dy = e.clientY - s.oy;
      if (k === 'move' || k === 'aim') {
        const el = k === 'move' ? this.stickMove : this.stickAim;
        const len = Math.hypot(s.dx, s.dy), max = 46;
        const f = len > max ? max / len : 1;
        el.firstElementChild.style.transform = `translate(${s.dx * f}px, ${s.dy * f}px)`;
      }
    }
  }

  pointerUp(e) {
    const g = this.game;
    if (this.move && this.move.id === e.pointerId) {
      this.move = null;
      this.stickMove.classList.remove('on');
      this.stickMove.firstElementChild.style.transform = '';
      g.input.left = g.input.right = g.input.up = g.input.down = 0;
    }
    if (this.aim && this.aim.id === e.pointerId) {
      this.aim = null;
      this.stickAim.classList.remove('on');
      this.stickAim.firstElementChild.style.transform = '';
      g.input.mouseL = false;
    }
    if (this.heavy && this.heavy.id === e.pointerId) {
      this.heavy.el.classList.remove('held');
      this.heavy = null;
      g.input.mouseR = false;
    }
    if (this.ability && this.ability.id === e.pointerId) {
      this.ability.el.classList.remove('held');
      this.ability = null;
      g.closeRoulette();
    }
  }

  releaseAll() {
    const g = this.game;
    this.move = this.aim = this.heavy = this.ability = null;
    g.input.left = g.input.right = g.input.up = g.input.down = 0;
    g.input.mouseL = g.input.mouseR = false;
    this.stickMove.classList.remove('on');
    this.stickAim.classList.remove('on');
  }

  /* ---------------- per frame ---------------- */

  /* Called by Game.update before the mouse is turned into a world position.
     Translates the sticks into the same input the keyboard and mouse use. */
  update() {
    const g = this.game;
    if (!this.active || !g.player) return;
    const p = g.player;

    // Move: full speed past a small deadzone, in any direction.
    const m = this.move;
    if (m && Math.hypot(m.dx, m.dy) > 10) {
      const a = Math.atan2(m.dy, m.dx);
      const cx = Math.cos(a), cy = Math.sin(a);
      g.input.right = cx > 0.38 ? 1 : 0;
      g.input.left = cx < -0.38 ? 1 : 0;
      g.input.down = cy > 0.38 ? 1 : 0;
      g.input.up = cy < -0.38 ? 1 : 0;
    } else if (m) {
      g.input.left = g.input.right = g.input.up = g.input.down = 0;
    }

    // Holding the ability button: drag to point at a wedge on the wheel.
    if (this.ability && g.roulette.open) {
      g.mouse.x = g.vw / 2 + this.ability.dx * 3 / g.zoom;
      g.mouse.y = g.vh / 2 + this.ability.dy * 3 / g.zoom;
      return;
    }

    // Aim, in priority order: the aim stick, a drag on the heavy button,
    // the nearest enemy you can see, and finally wherever you last aimed.
    const a = this.aim, h = this.heavy;
    const stick = a && Math.hypot(a.dx, a.dy) > 12 ? a : h && Math.hypot(h.dx, h.dy) > 12 ? h : null;
    if (stick) {
      this.aimDir = Math.atan2(stick.dy, stick.dx);
      // Push further to throw further (meteors, grenades, vines).
      this.aimDist = 110 + U.clamp(Math.hypot(stick.dx, stick.dy) / 60, 0, 1) * 300;
    } else {
      const foe = g.enemyHash.nearest(p.x, p.y, 460,
        e => !e.dead && !e.neutral && !e.trial && g.dungeon.lineOfSight(p.x, p.y, e.x, e.y));
      if (foe) {
        this.aimDir = U.angle(p.x, p.y, foe.x, foe.y);
        this.aimDist = U.dist(p.x, p.y, foe.x, foe.y);
      }
    }
    g.input.mouseL = !!(a && Math.hypot(a.dx, a.dy) > 18);
    g.mouse.x = p.x - g.cam.x + Math.cos(this.aimDir) * this.aimDist;
    g.mouse.y = p.y - g.cam.y + Math.sin(this.aimDir) * this.aimDist;
  }

  /* Visibility and labels, once a frame from the main loop. */
  sync() {
    const g = this.game;
    const inRun = g.state !== 'title' && g.state !== 'end';
    document.body.classList.toggle('in-run', inRun);
    const show = this.active && g.state === 'playing';
    if (this._shown !== show) {
      this._shown = show;
      this.root.classList.toggle('hidden', !show);
      if (!show) this.releaseAll();
    }
    if (!show) return;
    const rhythm = !!(g.rhythm && !g.rhythm.done);
    if (this._rhythm !== rhythm) {
      this._rhythm = rhythm;
      this.rhythmPad.classList.toggle('hidden', !rhythm);
    }
    const slot = g.player && g.player.slotDef;
    const icon = slot ? slot.icon : 'R';
    if (this._icon !== icon) { this._icon = icon; this.abilityIcon.textContent = icon; }
  }
}
