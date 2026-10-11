/* Audio — every sound in the game is synthesised. Update 4.0 moved this out of
   game.js, put effects and music on separate buses, added a few dozen new
   effects, and added the music sequencer below. */
'use strict';

class Audio2 {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.music = new Music(this);
    this._last = {};          // per-sound timestamps, for rate limiting
  }

  /* Update 4.0: everything routes through two buses — effects and music —
     so the music can be faded and muted without touching a single effect. */
  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        this.ctx = new AC();
        this.sfxBus = this.ctx.createGain();
        this.sfxBus.connect(this.bus());
        this.music.attach(this.ctx);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  bus() { return this.sfxBus || this.ctx.destination; }

  // A sound that fires on every bullet of a spray must not stack into noise.
  limit(key, gap) {
    if (!this.ctx) return false;
    const t = this.ctx.currentTime;
    if (this._last[key] !== undefined && t - this._last[key] < gap) return false;
    this._last[key] = t;
    return true;
  }
  blip(freq, dur = 0.08, gain = 0.12, type = 'square') {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.55), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.bus());
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /* One second of white noise, generated once. Everything percussive below is
     this buffer through a moving filter — a swing is a noise sweep, not a
     square wave, which is why the old sword sounded like a menu beep. */
  noiseBuffer() {
    if (this._noise) return this._noise;
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noise = buf;
    return buf;
  }

  noise({ dur = 0.18, gain = 0.2, from = 900, to = 200, q = 1.2, type = 'bandpass', delay = 0 }) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.playbackRate.value = 1;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, to), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.bus());
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // Air moving past a blade: a bright band sweeping down, plus low body on
  // the heavy version so a Cleave lands with weight instead of pitch.
  swordSwing(heavy) {
    if (heavy) {
      this.noise({ dur: 0.34, gain: 0.26, from: 2600, to: 160, q: 0.9 });
      this.blip(78, 0.26, 0.16, 'sine');
      this.noise({ dur: 0.12, gain: 0.14, from: 320, to: 90, q: 2.2, delay: 0.05 });
    } else {
      this.noise({ dur: 0.16, gain: 0.17, from: 3200, to: 520, q: 1.6 });
    }
  }

  // A hit landing — short, dry, and pitched by how hard it was.
  impact(heavy) {
    this.noise({ dur: heavy ? 0.2 : 0.1, gain: heavy ? 0.3 : 0.18, from: heavy ? 700 : 1400, to: 70, q: 0.8, type: 'lowpass' });
    this.blip(heavy ? 90 : 170, heavy ? 0.1 : 0.05, heavy ? 0.16 : 0.1, 'triangle');
  }

  // Telegraphs are audio cues too — you should be able to hear a red coming
  // from off-screen and start moving before you see it.
  telegraph(kind) {
    if (kind === 'heavy') {
      // A deep gong: the one attack a boss lets you parry.
      this.blip(110, 0.5, 0.15, 'triangle');
      this.blip(220, 0.4, 0.08, 'sine');
      return;
    }
    if (kind === 'red') {
      this.blip(150, 0.3, 0.13, 'sawtooth');
      this.noise({ dur: 0.3, gain: 0.1, from: 260, to: 90, q: 3 });
    } else {
      this.blip(520, 0.14, 0.07, 'triangle');
    }
  }

  parryOpen() { this.noise({ dur: 0.07, gain: 0.07, from: 2200, to: 1100, q: 3 }); }

  parryHit() {
    // Bright metallic ring: two detuned partials plus a short noise chink.
    this.blip(1180, 0.26, 0.14, 'triangle');
    this.blip(1760, 0.22, 0.09, 'sine');
    this.noise({ dur: 0.14, gain: 0.16, from: 6000, to: 1800, q: 1.2, type: 'highpass' });
  }

  dodge() { this.noise({ dur: 0.16, gain: 0.09, from: 1200, to: 300, q: 1 }); }

  // Each element gets its own voice so you can cast without looking down.
  cast(element, heavy) {
    const g = heavy ? 0.2 : 0.11;
    switch (element) {
      case 'fire':
        this.noise({ dur: heavy ? 0.4 : 0.2, gain: g, from: 1400, to: 180, q: 0.8 });
        this.blip(heavy ? 90 : 300, heavy ? 0.3 : 0.12, g, 'sawtooth');
        break;
      case 'earth':
        this.noise({ dur: heavy ? 0.34 : 0.2, gain: g, from: 500, to: 90, q: 1.6, type: 'lowpass' });
        this.blip(heavy ? 120 : 210, 0.16, g * 0.8, 'square');
        break;
      case 'ice':
        this.blip(heavy ? 420 : 1500, heavy ? 0.26 : 0.1, g, 'sine');
        this.noise({ dur: heavy ? 0.3 : 0.12, gain: g * 0.9, from: 7000, to: 2000, q: 2, type: 'highpass' });
        break;
      case 'air':
        this.noise({ dur: heavy ? 0.5 : 0.26, gain: g, from: 900, to: 2600, q: 0.6 });
        break;
      default:  // bone
        this.blip(heavy ? 180 : 520, 0.12, g, 'triangle');
        this.noise({ dur: 0.14, gain: 0.08, from: 1800, to: 500, q: 2 });
    }
  }

  summon() {
    this.blip(180, 0.3, 0.13, 'sawtooth');
    this.blip(270, 0.26, 0.08, 'triangle');
    this.noise({ dur: 0.3, gain: 0.09, from: 380, to: 120, q: 2.4 });
  }

  explode() {
    this.noise({ dur: 0.42, gain: 0.3, from: 900, to: 60, q: 0.6, type: 'lowpass' });
    this.blip(70, 0.32, 0.2, 'sine');
  }

  freeze() {
    this.blip(1900, 0.4, 0.14, 'sine');
    this.blip(2600, 0.3, 0.08, 'triangle');
    this.noise({ dur: 0.35, gain: 0.14, from: 9000, to: 2400, q: 1.4, type: 'highpass' });
  }

  jarona() {
    // A little rising yelp before the impact.
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.18);
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    osc.connect(g).connect(this.bus());
    osc.start(t); osc.stop(t + 0.26);
    this.explode();
  }

  // Rising yelp per bounce, with the shout on the finisher.
  jaronaHit(n, final) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    const base = 260 + n * 110;
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * (final ? 3 : 1.7), t + (final ? 0.2 : 0.1));
    g.gain.setValueAtTime(final ? 0.15 : 0.09, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (final ? 0.26 : 0.13));
    osc.connect(g).connect(this.bus());
    osc.start(t); osc.stop(t + 0.28);
    this.impact(final);
  }

  slingShot(tier, heavy = false) {
    if (tier > Seq.FIRST) {
      // Assault rifle: a crack with a tail, not an elastic snap.
      this.noise({ dur: 0.09, gain: 0.24, from: 5200, to: 700, q: 0.7, type: 'highpass' });
      this.blip(210, 0.05, 0.12, 'sawtooth');
      return;
    }
    this.noise({ dur: heavy ? 0.16 : 0.07, gain: heavy ? 0.2 : 0.12, from: heavy ? 1800 : 2400, to: 400, q: 2.4 });
    this.blip(heavy ? 300 : 620, heavy ? 0.1 : 0.04, 0.08, 'triangle');
  }

  /* ---------------- Update 4.0 sound effects ---------------- */

  // A pitched tone that glides from one frequency to another — the building
  // block for lasers, whistles and roars.
  sweep(from, to, dur, gain = 0.1, type = 'sawtooth', delay = 0) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.bus());
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  gunshot() {
    if (!this.limit('gun', 0.045)) return;
    this.noise({ dur: 0.08, gain: 0.16, from: 4200, to: 600, q: 0.8, type: 'highpass' });
    this.blip(160, 0.05, 0.08, 'sawtooth');
  }

  rifle() {
    this.noise({ dur: 0.22, gain: 0.26, from: 6000, to: 500, q: 0.7, type: 'highpass' });
    this.blip(120, 0.12, 0.14, 'sawtooth');
    this.noise({ dur: 0.5, gain: 0.06, from: 900, to: 200, q: 0.6, delay: 0.06 });
  }

  cannon() {
    if (!this.limit('cannon', 0.08)) return;
    this.noise({ dur: 0.7, gain: 0.34, from: 700, to: 50, q: 0.5, type: 'lowpass' });
    this.blip(52, 0.55, 0.26, 'sine');
    this.noise({ dur: 0.18, gain: 0.18, from: 3000, to: 800, q: 0.8, type: 'highpass' });
  }

  laser() {
    if (!this.limit('laser', 0.05)) return;
    this.sweep(2200, 380, 0.2, 0.07, 'sawtooth');
    this.sweep(1400, 900, 0.14, 0.04, 'square');
  }

  laserCharge() {
    this.sweep(180, 1600, 0.6, 0.06, 'sine');
    this.sweep(240, 2000, 0.6, 0.03, 'triangle');
  }

  beam() {
    if (!this.limit('beam', 0.1)) return;
    this.noise({ dur: 0.5, gain: 0.16, from: 5000, to: 1200, q: 1.5, type: 'bandpass' });
    this.sweep(900, 600, 0.5, 0.08, 'sawtooth');
  }

  groan() {
    if (!this.limit('groan', 0.7)) return;
    const f = U.rand(70, 110);
    this.sweep(f, f * 0.7, 0.7, 0.07, 'sawtooth');
    this.noise({ dur: 0.6, gain: 0.05, from: 500, to: 180, q: 3, type: 'bandpass' });
  }

  punch(strong) {
    this.noise({ dur: strong ? 0.16 : 0.07, gain: strong ? 0.24 : 0.14, from: strong ? 900 : 1500, to: 120, q: 0.9, type: 'lowpass' });
    this.blip(strong ? 110 : 190, 0.05, 0.1, 'triangle');
  }

  smokeBomb() {
    this.blip(260, 0.06, 0.12, 'square');
    this.noise({ dur: 0.9, gain: 0.18, from: 3200, to: 500, q: 0.7 });
  }

  vanish() { this.noise({ dur: 0.4, gain: 0.08, from: 400, to: 3800, q: 1.2, type: 'bandpass' }); }

  ambush() {
    this.blip(1600, 0.18, 0.1, 'triangle');
    this.noise({ dur: 0.12, gain: 0.2, from: 7000, to: 2000, q: 1.2, type: 'highpass' });
    this.impact(true);
  }

  blizzard() {
    this.noise({ dur: 2.1, gain: 0.16, from: 500, to: 1600, q: 0.7 });
    this.noise({ dur: 1.8, gain: 0.08, from: 6000, to: 3000, q: 1.5, type: 'highpass', delay: 0.15 });
    this.freeze();
  }

  coin() {
    if (!this.limit('coin', 0.03)) return;
    this.blip(1320, 0.05, 0.05, 'triangle');
    this.blip(1760, 0.07, 0.04, 'triangle');
  }

  levelUp() {
    [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 0.09, 'triangle'), i * 70));
  }

  shrine() {
    this.sweep(880, 870, 1.2, 0.08, 'sine');
    this.sweep(1320, 1310, 1.0, 0.05, 'sine');
    this.sweep(1760, 1750, 0.8, 0.03, 'triangle');
  }

  uiClick() { this.blip(900, 0.04, 0.05, 'triangle'); }

  roar() {
    this.sweep(110, 55, 1.3, 0.16, 'sawtooth');
    this.noise({ dur: 1.2, gain: 0.2, from: 700, to: 90, q: 0.8, type: 'lowpass' });
  }

  heartbeat() {
    this.blip(62, 0.12, 0.18, 'sine');
    setTimeout(() => this.blip(55, 0.14, 0.14, 'sine'), 170);
  }

  missile() { if (this.limit('missile', 0.1)) this.sweep(1400, 500, 0.5, 0.05, 'triangle'); }

  vine() {
    if (!this.limit('vine', 0.06)) return;
    this.noise({ dur: 0.3, gain: 0.18, from: 600, to: 120, q: 2.2, type: 'lowpass' });
    this.blip(95, 0.18, 0.1, 'square');
  }

  gavel() {
    this.blip(320, 0.07, 0.16, 'triangle');
    this.noise({ dur: 0.1, gain: 0.2, from: 2400, to: 500, q: 2 });
  }

  engine() {
    if (!this.limit('engine', 1.4)) return;
    this.sweep(48, 62, 1.2, 0.06, 'sawtooth');
  }

  mash(level) { this.blip(420 + level * 700, 0.04, 0.06, 'square'); }

  bounceFail() {
    this.blip(140, 0.3, 0.14, 'sawtooth');
    this.blip(98, 0.4, 0.1, 'square');
  }

  ward() { this.sweep(600, 1800, 0.3, 0.07, 'sine'); }
}

/* ================================================================= */
/* MUSIC — Update 4.0                                                 */
/* ================================================================= */

/* A tiny step sequencer. Every track is a few bars of chords, a bass line,
   a lead and drums, all synthesised — no audio files, so the game stays a
   folder you can open from disk. Notes are scheduled a little ahead of the
   audio clock, so a slow frame never makes the beat stumble. */

const midiHz = (n) => 440 * Math.pow(2, (n - 69) / 12);

const MUSIC_TRACKS = {
  tripolisis: {
    bpm: 76, root: 45, gain: 0.8,
    chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]],
    bass: [0, null, null, null, null, null, null, 7, 0, null, null, null, null, null, -5, null],
    arp: [0, null, null, 1, null, null, 2, null, null, 1, null, null, 2, null, 1, null],
    arpOct: 24, leadWave: 'triangle',
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
  },
  sarapolis: {
    bpm: 86, root: 50, gain: 0.8,
    chords: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-2, 1, 5]],
    bass: [0, null, 0, null, null, null, 1, null, 0, null, null, null, -2, null, null, null],
    arp: [2, null, 1, null, 0, null, 1, null, 2, null, null, 1, null, 0, null, null],
    arpOct: 12, leadWave: 'sawtooth',
    kick: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
  },
  dayzee: {
    // A drum line for a base that fell: march snare, a stubborn bass.
    bpm: 104, root: 40, gain: 0.85,
    chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]],
    bass: [0, null, 0, null, 0, null, 0, 3, 0, null, 0, null, 0, null, -2, null],
    arp: [null, null, null, null, 2, null, null, null, null, null, null, null, 1, null, 0, null],
    arpOct: 24, leadWave: 'square',
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1],
    hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  },
  miniboss: {
    bpm: 134, root: 47, gain: 0.9,
    chords: [[0, 3, 7], [0, 3, 7], [-4, 0, 3], [-2, 2, 5]],
    bass: [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 3, 3, 5, 7],
    riff: [12, null, 15, null, 12, null, 10, null, 12, null, 15, 17, null, 15, null, null],
    leadWave: 'square',
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  },
  boss: {
    bpm: 150, root: 45, gain: 1,
    chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [0, 3, 7]],
    bass: [0, 0, 12, 0, 0, 12, 0, 0, -2, -2, 10, -2, 3, 3, 15, 3],
    riff: [12, null, 15, null, 19, null, 15, 17, null, 15, null, 12, null, 10, 12, null],
    leadWave: 'sawtooth',
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1],
  },
  bossFinal: {
    // Judgement: faster, harsher, and it never resolves.
    bpm: 168, root: 44, gain: 1,
    chords: [[0, 3, 6], [1, 4, 8], [0, 3, 6], [-1, 3, 6]],
    bass: [0, 0, 0, 12, 0, 0, 1, 13, 0, 0, 0, 12, -1, -1, 11, -1],
    riff: [12, 13, 12, null, 18, null, 15, null, 12, 13, 15, null, 18, 19, 18, null],
    leadWave: 'sawtooth',
    kick: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
    snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  },
};

class Music {
  constructor(audio) {
    this.audio = audio;
    this.ctx = null;
    this.track = null;      // what is playing
    this.want = null;       // what should be playing
    this.step = 0;
    this.nextTime = 0;
    this._fading = 0;
    this.on = true;
    try { this.on = localStorage.getItem('hollowdeep.music') !== '0'; } catch { /* storage off */ }
  }

  attach(ctx) {
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(ctx.destination);
  }

  toggle() {
    this.on = !this.on;
    try { localStorage.setItem('hollowdeep.music', this.on ? '1' : '0'); } catch { /* fine */ }
    return this.on;
  }

  play(name) { this.want = name || null; }

  /* Once a frame. Crossfades between tracks and keeps the scheduler fed. */
  update() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const target = this.on ? this.want : null;

    if (target !== this.track) {
      // Fade the old track out, then start the new one from its first bar.
      const g = this.bus.gain;
      if (!this._fading) {
        this._fading = now + (this.track ? 0.6 : 0.01);
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(0, this._fading - 0.01);
      } else if (now >= this._fading) {
        this._fading = 0;
        this.track = target;
        this.step = 0;
        this.nextTime = now + 0.05;
        if (target) {
          const level = 0.16 * (MUSIC_TRACKS[target].gain || 1);
          g.cancelScheduledValues(now);
          g.setValueAtTime(0, now);
          g.linearRampToValueAtTime(level, now + 1.2);
        }
      }
    } else if (this._fading) {
      // Changed our mind mid-fade: bring the current track back up.
      this._fading = 0;
      const g = this.bus.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      if (this.track) g.linearRampToValueAtTime(0.16 * (MUSIC_TRACKS[this.track].gain || 1), now + 0.4);
    }

    const tr = this.track && MUSIC_TRACKS[this.track];
    if (!tr) return;
    const stepDur = 60 / tr.bpm / 4;
    // Never schedule a backlog after the tab was hidden.
    if (this.nextTime < now - 0.2) this.nextTime = now + 0.05;
    while (this.nextTime < now + 0.25) {
      this.schedule(tr, this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  schedule(tr, step, t, stepDur) {
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const chord = tr.chords[bar % tr.chords.length];
    const root = tr.root;

    if (s === 0) for (const n of chord) this.pad(midiHz(root + 12 + n), t, stepDur * 16);
    const b = tr.bass[s];
    if (b !== null && b !== undefined) this.bass(midiHz(root - 12 + chord[0] + b), t, stepDur * 1.7);
    if (tr.riff) {
      const r = tr.riff[s];
      if (r !== null && r !== undefined) this.lead(midiHz(root + chord[0] + r), t, stepDur * 1.6, tr.leadWave);
    } else if (tr.arp) {
      const i = tr.arp[s];
      if (i !== null && i !== undefined) this.lead(midiHz(root + tr.arpOct + chord[i % chord.length]), t, stepDur * 3, tr.leadWave);
    }
    if (tr.kick[s]) this.kick(t);
    if (tr.snare[s]) this.snare(t);
    if (tr.hat[s]) this.hat(t);
  }

  voice(type, freq, t, dur, gain, attack = 0.01, filter = 0) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      g.connect(f);
      f.connect(this.bus);
    } else {
      g.connect(this.bus);
    }
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  pad(freq, t, dur) {
    this.voice('sine', freq, t, dur, 0.06, dur * 0.25);
    this.voice('triangle', freq * 1.004, t, dur, 0.03, dur * 0.3);
  }
  bass(freq, t, dur) { this.voice('sawtooth', freq, t, dur, 0.22, 0.01, 520); }
  lead(freq, t, dur, wave = 'square') { this.voice(wave, freq, t, dur, 0.07, 0.01, 2400); }

  kick(t) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(g).connect(this.bus);
    osc.start(t); osc.stop(t + 0.22);
  }

  noiseHit(t, dur, gain, type, freq) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.audio.noiseBuffer();
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t); src.stop(t + dur + 0.02);
  }

  snare(t) {
    this.noiseHit(t, 0.14, 0.3, 'bandpass', 1800);
    this.voice('triangle', 190, t, 0.08, 0.12);
  }

  hat(t) { this.noiseHit(t, 0.035, 0.09, 'highpass', 7500); }
}
