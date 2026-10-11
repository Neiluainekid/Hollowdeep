/* Character art — Update 2.0 visual revamp.

   Everything that draws a body lives here, one function per creature, so the
   renderer no longer falls back to "a rectangle with a circle on top" for
   most of the cast.

   Two shared ideas do the heavy lifting:

     Art.pose(e)   turns an enemy's attack state into a pose — wind-up pulls
                   back and compresses, the active frame snaps forward and
                   stretches, recovery slumps. Every creature gets animated
                   attacks from this without writing per-enemy timelines.

     Art.gait(e)   a walk cycle derived from actual velocity, so things lean
                   into their movement and bob at a speed that matches it.

   Each draw function receives the pose already applied to the transform: it
   draws a creature standing at the origin facing +x, and the dispatcher
   handles position, facing, squash and flash. */
'use strict';

const Art = {
  /* ---------------- shared motion ---------------- */

  pose(e) {
    const p = { push: 0, squash: 1, stretch: 1, tell: 0 };
    if (!e.atk) return p;
    const a = e.atk, d = a.def;
    if (a.t < d.wind) {
      // Coil: drift backwards and compress as the blow is loaded.
      const k = a.t / d.wind;
      p.push = -5 * k;
      p.squash = 1 + 0.16 * k;
      p.stretch = 1 - 0.12 * k;
      p.tell = k;
    } else if (a.t < d.wind + d.active) {
      // Release: snap through, stretched along the swing.
      const k = (a.t - d.wind) / d.active;
      p.push = 13 * (1 - k * 0.35);
      p.squash = 1 - 0.14;
      p.stretch = 1 + 0.24 * (1 - k);
      p.tell = 1;
    } else {
      // Recover: settle back to neutral.
      const k = (a.t - d.wind - d.active) / d.recover;
      p.push = 6 * (1 - k);
      p.squash = 1 - 0.06 * (1 - k);
      p.stretch = 1;
    }
    return p;
  },

  gait(e, time) {
    const sp = Math.hypot(e.vx || 0, e.vy || 0);
    const moving = sp > 12;
    return {
      moving,
      // Faster movement, faster stride — and a slight forward lean into it.
      cycle: moving ? Math.sin(time * (4 + sp * 0.035) + (e.bob || 0)) : Math.sin(time * 1.6 + (e.bob || 0)) * 0.3,
      lean: moving ? U.clamp(sp / 260, 0, 1) * 0.16 : 0,
    };
  },

  /* ---------------- dispatcher ---------------- */

  drawEnemy(ctx, e, x, y, time, bodyColor) {
    const fn = Art.enemy[e.type] || Art.enemy._default;
    const pose = Art.pose(e);
    const gait = Art.gait(e, time);
    const face = e.face !== undefined ? e.face : 0;
    // Flip vertically rather than rotating, so creatures never appear upside
    // down when facing left — a full rotate reads badly in a top-down view.
    const flip = Math.cos(face) < 0 ? -1 : 1;

    ctx.save();
    ctx.translate(x + Math.cos(face) * pose.push, y + Math.sin(face) * pose.push);
    ctx.scale(flip * pose.stretch, pose.squash);
    fn(ctx, e, {
      r: e.radius, time, gait, pose, flip,
      body: bodyColor, dark: e.def.dark, accent: e.def.color,
    });
    ctx.restore();
  },

  // Small helpers so the creature code stays readable.
  limb(ctx, x1, y1, x2, y2, w, col) {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  },
  blob(ctx, x, y, rx, ry, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  },
  eyes(ctx, x, y, gap, size, col) {
    ctx.fillStyle = col;
    ctx.fillRect(x - gap - size / 2, y, size, size);
    ctx.fillRect(x + gap - size / 2, y, size, size);
  },

  /* ---------------- the cast ---------------- */

  enemy: {
    _default(ctx, e, s) {
      const w = s.r * 1.5, h = s.r * 1.9;
      ctx.fillStyle = s.body;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = s.dark;
      ctx.fillRect(-w / 2, -h / 2, w, h * 0.28);
      ctx.fillStyle = s.body;
      ctx.beginPath(); ctx.arc(0, -h / 2 - s.r * 0.35, s.r * 0.55, 0, Math.PI * 2); ctx.fill();
      Art.eyes(ctx, 0, -s.r * 0.35, 4, 3.2, e.aggro ? '#ff6b52' : '#1a1a20');
    },

    slime(ctx, e, s) {
      // Wobbling drop that squashes as it lunges.
      const wob = Math.sin(s.time * 3 + e.bob) * 0.1;
      Art.blob(ctx, 0, s.r * 0.1, s.r * (1 + wob), s.r * (1 - wob * 0.7), s.body);
      ctx.globalAlpha = 0.35;
      Art.blob(ctx, -s.r * 0.3, -s.r * 0.25, s.r * 0.34, s.r * 0.26, '#ffffff');
      ctx.globalAlpha = 1;
      // A couple of drips clinging to the underside.
      Art.blob(ctx, s.r * 0.45, s.r * 0.55, s.r * 0.16, s.r * 0.22, s.body);
      Art.eyes(ctx, 0, -s.r * 0.15, 4.5, 3.4, e.aggro ? '#1c3a1c' : '#20301f');
    },

    bat(ctx, e, s) {
      const flap = Math.sin(s.time * 15 + e.bob) * s.r * 0.85;
      ctx.fillStyle = s.body;
      ctx.beginPath();
      ctx.moveTo(-s.r * 1.75, flap);
      ctx.quadraticCurveTo(0, -s.r * 1.1, s.r * 1.75, flap);
      ctx.quadraticCurveTo(0, s.r * 0.85, -s.r * 1.75, flap);
      ctx.fill();
      Art.blob(ctx, 0, 0, s.r * 0.62, s.r * 0.62, s.body);
      // Ears.
      ctx.fillStyle = s.dark;
      ctx.beginPath();
      ctx.moveTo(-s.r * 0.4, -s.r * 0.5); ctx.lineTo(-s.r * 0.15, -s.r * 1.1);
      ctx.lineTo(0, -s.r * 0.45); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s.r * 0.4, -s.r * 0.5); ctx.lineTo(s.r * 0.15, -s.r * 1.1);
      ctx.lineTo(0, -s.r * 0.45); ctx.closePath(); ctx.fill();
      Art.eyes(ctx, 0, -s.r * 0.1, 3.4, 2.8, '#ff6b52');
    },

    skeleton(ctx, e, s) {
      // Skull, ribs, and a bow drawn back with the wind-up.
      const draw = s.pose.tell;
      Art.limb(ctx, -s.r * 0.2, s.r * 0.9, -s.r * 0.2, -s.r * 0.2, s.r * 0.42, s.body);
      ctx.strokeStyle = s.dark;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-s.r * 0.6, -s.r * 0.1 + i * s.r * 0.3);
        ctx.lineTo(s.r * 0.25, -s.r * 0.1 + i * s.r * 0.3);
        ctx.stroke();
      }
      Art.blob(ctx, 0, -s.r * 0.85, s.r * 0.52, s.r * 0.5, s.body);
      Art.eyes(ctx, 0, -s.r * 0.95, 3.6, 3, '#2a2418');
      // Bow: string pulls back as the shot is loaded.
      ctx.strokeStyle = '#6b5334';
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(s.r * 0.7, 0, s.r * 0.85, -1.15, 1.15); ctx.stroke();
      ctx.strokeStyle = 'rgba(230,220,200,.8)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(s.r * 0.7 + Math.cos(-1.15) * s.r * 0.85, Math.sin(-1.15) * s.r * 0.85);
      ctx.lineTo(s.r * (0.7 - draw * 0.5), 0);
      ctx.lineTo(s.r * 0.7 + Math.cos(1.15) * s.r * 0.85, Math.sin(1.15) * s.r * 0.85);
      ctx.stroke();
    },

    spitter(ctx, e, s) {
      // Bloated sac that swells before it spits.
      const swell = 1 + s.pose.tell * 0.2;
      Art.blob(ctx, 0, s.r * 0.15, s.r * swell, s.r * 0.9 * swell, s.body);
      ctx.globalAlpha = 0.4;
      Art.blob(ctx, -s.r * 0.25, -s.r * 0.2, s.r * 0.3, s.r * 0.22, '#e4f2a0');
      ctx.globalAlpha = 1;
      // Mouth, open when loaded.
      ctx.fillStyle = '#2c3a12';
      const mouth = 2 + s.pose.tell * 5;
      ctx.beginPath();
      ctx.ellipse(s.r * 0.75, 0, mouth * 0.7, mouth, 0, 0, Math.PI * 2);
      ctx.fill();
      Art.eyes(ctx, -s.r * 0.1, -s.r * 0.5, 4, 3, '#1f2a0c');
    },

    crossbow(ctx, e, s) {
      // Hooded sentinel with the weapon braced across the body.
      ctx.fillStyle = s.dark;
      ctx.beginPath();
      ctx.moveTo(-s.r * 0.75, s.r * 0.95);
      ctx.lineTo(-s.r * 0.5, -s.r * 0.7);
      ctx.lineTo(s.r * 0.5, -s.r * 0.7);
      ctx.lineTo(s.r * 0.75, s.r * 0.95);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = s.body;
      ctx.beginPath();
      ctx.moveTo(-s.r * 0.55, -s.r * 0.55);
      ctx.quadraticCurveTo(0, -s.r * 1.5, s.r * 0.55, -s.r * 0.55);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1a1a20';
      ctx.fillRect(-s.r * 0.28, -s.r * 0.85, s.r * 0.56, s.r * 0.22);
      ctx.fillStyle = e.aggro ? '#ff6b52' : '#5e5238';
      ctx.fillRect(-s.r * 0.2, -s.r * 0.8, s.r * 0.14, s.r * 0.12);
      ctx.fillRect(s.r * 0.06, -s.r * 0.8, s.r * 0.14, s.r * 0.12);
      // The crossbow itself, levelled during the wind-up.
      const lift = -s.pose.tell * s.r * 0.25;
      ctx.strokeStyle = '#6b5b42';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-s.r * 0.1, s.r * 0.1 + lift); ctx.lineTo(s.r * 1.15, s.r * 0.1 + lift); ctx.stroke();
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(s.r * 0.8, s.r * 0.1 + lift - s.r * 0.5);
      ctx.lineTo(s.r * 0.8, s.r * 0.1 + lift + s.r * 0.5); ctx.stroke();
    },

    mortar(ctx, e, s) {
      // Squat pot with a tube angled up over its shoulder.
      Art.blob(ctx, 0, s.r * 0.25, s.r * 0.95, s.r * 0.78, s.body);
      ctx.fillStyle = s.dark;
      ctx.beginPath(); ctx.ellipse(0, s.r * 0.25, s.r * 0.62, s.r * 0.48, 0, 0, Math.PI); ctx.fill();
      // Tube, rising as it loads.
      const ang = -0.9 - s.pose.tell * 0.35;
      ctx.save();
      ctx.translate(-s.r * 0.15, -s.r * 0.35);
      ctx.rotate(ang);
      ctx.fillStyle = '#4a3a52';
      ctx.fillRect(0, -s.r * 0.24, s.r * 1.35, s.r * 0.48);
      ctx.fillStyle = '#2a2030';
      ctx.fillRect(s.r * 1.1, -s.r * 0.24, s.r * 0.25, s.r * 0.48);
      ctx.restore();
      Art.eyes(ctx, s.r * 0.15, -s.r * 0.05, 4, 3.2, e.aggro ? '#ff6b52' : '#241a2c');
    },

    brute(ctx, e, s) {
      // Boulder shoulders, tiny head, arms that swing with the gait.
      const sw = s.gait.cycle * s.r * 0.3;
      Art.limb(ctx, -s.r * 0.45, s.r * 0.2, -s.r * 0.75, s.r * 1.0 + sw, s.r * 0.4, s.dark);
      Art.limb(ctx, s.r * 0.45, s.r * 0.2, s.r * 0.75, s.r * 1.0 - sw, s.r * 0.4, s.dark);
      ctx.fillStyle = s.body;
      ctx.beginPath();
      ctx.moveTo(-s.r * 0.95, s.r * 0.5);
      ctx.lineTo(-s.r * 0.8, -s.r * 0.75);
      ctx.lineTo(s.r * 0.8, -s.r * 0.75);
      ctx.lineTo(s.r * 0.95, s.r * 0.5);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = s.dark;
      ctx.fillRect(-s.r * 0.85, -s.r * 0.75, s.r * 1.7, s.r * 0.3);
      Art.blob(ctx, 0, -s.r * 1.0, s.r * 0.4, s.r * 0.36, s.body);
      Art.eyes(ctx, 0, -s.r * 1.08, 3.4, 3, e.aggro ? '#ff6b52' : '#2a1d13');
      // Fists, thrown forward on the active frame.
      const reach = s.r * (0.9 + s.pose.tell * 0.55);
      Art.blob(ctx, reach, s.r * 0.35, s.r * 0.34, s.r * 0.34, s.body);
    },

    revenant(ctx, e, s) {
      // Gaunt, tall, two curved blades that scissor open on the wind-up.
      const spread = 0.5 + s.pose.tell * 0.9;
      ctx.fillStyle = s.body;
      ctx.beginPath();
      ctx.moveTo(-s.r * 0.5, s.r * 1.1);
      ctx.lineTo(-s.r * 0.42, -s.r * 0.9);
      ctx.lineTo(s.r * 0.42, -s.r * 0.9);
      ctx.lineTo(s.r * 0.5, s.r * 1.1);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = s.dark;
      ctx.beginPath();
      ctx.moveTo(-s.r * 0.42, -s.r * 0.9); ctx.lineTo(0, -s.r * 0.2);
      ctx.lineTo(s.r * 0.42, -s.r * 0.9); ctx.closePath(); ctx.fill();
      Art.blob(ctx, 0, -s.r * 1.15, s.r * 0.38, s.r * 0.44, s.body);
      Art.eyes(ctx, 0, -s.r * 1.25, 3.2, 3, '#ff3b1f');
      ctx.strokeStyle = '#d8d2c4';
      ctx.lineWidth = 2.6;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(s.r * 0.3, side * s.r * 0.3, s.r * 1.05, side * spread - 0.5, side * spread + 0.5);
        ctx.stroke();
      }
    },

    ironclad(ctx, e, s) {
      // A wall of plate. The shield sits on the facing side, which is exactly
      // the side that takes 70% less damage — the art states the rule.
      const sw = s.gait.cycle * s.r * 0.18;
      Art.limb(ctx, -s.r * 0.3, s.r * 0.4, -s.r * 0.45, s.r * 1.05 + sw, s.r * 0.36, s.dark);
      Art.limb(ctx, s.r * 0.3, s.r * 0.4, s.r * 0.45, s.r * 1.05 - sw, s.r * 0.36, s.dark);
      ctx.fillStyle = s.body;
      ctx.fillRect(-s.r * 0.72, -s.r * 0.85, s.r * 1.44, s.r * 1.6);
      ctx.fillStyle = s.dark;
      ctx.fillRect(-s.r * 0.72, -s.r * 0.85, s.r * 1.44, s.r * 0.34);
      // Helm with a visor slit.
      Art.blob(ctx, 0, -s.r * 1.08, s.r * 0.44, s.r * 0.42, s.body);
      ctx.fillStyle = '#14171c';
      ctx.fillRect(-s.r * 0.34, -s.r * 1.14, s.r * 0.68, s.r * 0.16);
      if (e.aggro) {
        ctx.fillStyle = '#ff6b52';
        ctx.fillRect(-s.r * 0.22, -s.r * 1.12, s.r * 0.14, s.r * 0.1);
        ctx.fillRect(s.r * 0.08, -s.r * 1.12, s.r * 0.14, s.r * 0.1);
      }
      // The shield.
      const guard = e.stagger > 0 ? s.r * 0.45 : s.r * 0.95;
      ctx.fillStyle = '#b9c4d2';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(guard, -s.r * 0.95, s.r * 0.36, s.r * 1.9, 4)
        : ctx.rect(guard, -s.r * 0.95, s.r * 0.36, s.r * 1.9);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.fillRect(guard, -s.r * 0.95, s.r * 0.36, s.r * 0.3);
      if (e.stagger > 0) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#8fd4ff';
        ctx.fillRect(guard, -s.r * 0.95, s.r * 0.36, s.r * 1.9);
        ctx.globalAlpha = 1;
      }
    },

    wraith(ctx, e, s) {
      // Tattered hem that ripples; no legs, it does not walk.
      ctx.globalAlpha = 0.78;
      ctx.fillStyle = s.body;
      ctx.beginPath();
      ctx.moveTo(0, -s.r * 1.1);
      ctx.quadraticCurveTo(s.r, -s.r * 0.2, s.r * 0.7, s.r);
      for (let i = 0; i < 5; i++) {
        const t2 = i / 4;
        ctx.quadraticCurveTo(
          s.r * 0.7 - s.r * 1.4 * (t2 + 0.1),
          s.r + Math.sin(s.time * 5 + i * 1.7) * 5,
          s.r * 0.7 - s.r * 1.4 * (t2 + 0.22), s.r);
      }
      ctx.quadraticCurveTo(-s.r, -s.r * 0.2, 0, -s.r * 1.1);
      ctx.fill();
      ctx.globalAlpha = 1;
      // Hollow face.
      ctx.fillStyle = '#101828';
      Art.blob(ctx, 0, -s.r * 0.5, s.r * 0.42, s.r * 0.5, '#101828');
      Art.eyes(ctx, 0, -s.r * 0.62, 3.6, 3.4, '#bcd8ff');
    },

    tridon(ctx, e, s) {
      // A walking bomb. The fuse is the whole read.
      const swell = e.lit ? 1 + Math.sin(s.time * 26) * 0.14 : 1;
      Art.blob(ctx, 0, s.r * 0.1, s.r * swell, s.r * 0.95 * swell, e.lit ? '#ff6b3c' : s.body);
      ctx.globalAlpha = 0.3;
      Art.blob(ctx, -s.r * 0.3, -s.r * 0.25, s.r * 0.28, s.r * 0.2, '#ffe0b0');
      ctx.globalAlpha = 1;
      // Stubby legs.
      Art.limb(ctx, -s.r * 0.35, s.r * 0.85, -s.r * 0.45, s.r * 1.25, s.r * 0.22, s.dark);
      Art.limb(ctx, s.r * 0.35, s.r * 0.85, s.r * 0.45, s.r * 1.25, s.r * 0.22, s.dark);
      // Fuse, burning down when lit.
      ctx.strokeStyle = '#4a3a2a';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(0, -s.r * 0.9);
      ctx.quadraticCurveTo(s.r * 0.35, -s.r * 1.4, s.r * 0.1, -s.r * 1.7);
      ctx.stroke();
      if (e.lit) {
        ctx.fillStyle = '#ffe08a';
        ctx.shadowBlur = 12; ctx.shadowColor = '#ff8a3c';
        Art.blob(ctx, s.r * 0.1, -s.r * 1.7, 3.5 + Math.sin(s.time * 30) * 1.5, 4.5, '#ffe08a');
        ctx.shadowBlur = 0;
      }
      Art.eyes(ctx, 0, -s.r * 0.2, 4.2, 3.4, e.lit ? '#ffffff' : '#3a1d0c');
    },

    /* ---------------- Update 3.0 ---------------- */

    cop(ctx, e, s) {
      // A squad car seen from above, with a light bar that never stops.
      const r = s.r;
      const L = r * 2.3, W = r * 1.35;
      // A car is the one thing that should turn to face where it drives:
      // undo the dispatcher's mirror and rotate to the real heading.
      const face = e.atk ? e.atk.angle : e.face;
      ctx.rotate(s.flip > 0 ? face : Math.PI - face);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(-L / 2 + 3, -W / 2 + 4, L, W);
      ctx.fillStyle = s.body;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-L / 2, -W / 2, L, W, 6) : ctx.rect(-L / 2, -W / 2, L, W);
      ctx.fill();
      // White doors.
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#e8ecf2';
      ctx.fillRect(-L * 0.18, -W / 2, L * 0.34, W);
      // Windscreen and rear window.
      ctx.fillStyle = '#1a2233';
      ctx.fillRect(L * 0.12, -W * 0.38, L * 0.14, W * 0.76);
      ctx.fillRect(-L * 0.34, -W * 0.34, L * 0.1, W * 0.68);
      // Light bar.
      const on = Math.floor(s.time * 8) % 2 === 0;
      ctx.fillStyle = on ? '#ff2b2b' : '#5a1010';
      ctx.fillRect(-L * 0.04, -W * 0.42, L * 0.08, W * 0.4);
      ctx.fillStyle = on ? '#1a2a5a' : '#2b6bff';
      ctx.fillRect(-L * 0.04, W * 0.02, L * 0.08, W * 0.4);
      ctx.globalAlpha = 0.5;
      ctx.shadowBlur = 18; ctx.shadowColor = on ? '#ff2b2b' : '#2b6bff';
      ctx.fillRect(-L * 0.04, -W * 0.42, L * 0.08, W * 0.84);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      // Headlights, blazing while it revs.
      ctx.fillStyle = s.pose.tell > 0 ? '#fff6c8' : '#c8c09a';
      if (s.pose.tell > 0) { ctx.shadowBlur = 16; ctx.shadowColor = '#fff6c8'; }
      ctx.fillRect(L / 2 - 3, -W * 0.42, 3, W * 0.22);
      ctx.fillRect(L / 2 - 3, W * 0.2, 3, W * 0.22);
      ctx.shadowBlur = 0;
      // Wheels.
      ctx.fillStyle = '#111';
      for (const wx of [-L * 0.3, L * 0.28]) for (const wy of [-W / 2 - 2, W / 2 - 2]) ctx.fillRect(wx - 4, wy, 8, 4);
    },

    hound(ctx, e, s) {
      const r = s.r;
      const st = s.gait.cycle * r * 0.4;
      for (const [lx, ph] of [[-r * 0.6, 1], [-r * 0.2, -1], [r * 0.3, 1], [r * 0.7, -1]]) {
        Art.limb(ctx, lx, r * 0.2, lx + st * ph, r * 0.95, r * 0.22, s.dark);
      }
      Art.blob(ctx, 0, 0, r * 1.05, r * 0.55, s.body);
      // Ribs showing.
      ctx.strokeStyle = 'rgba(0,0,0,.3)';
      ctx.lineWidth = 1.3;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.25, -r * 0.4); ctx.lineTo(i * r * 0.25, r * 0.3); ctx.stroke(); }
      Art.blob(ctx, r * 0.95, -r * 0.3, r * 0.48, r * 0.38, s.body);
      Art.blob(ctx, r * 1.3, -r * 0.2, r * 0.26, r * 0.18, s.dark);   // snout
      ctx.fillStyle = s.dark;
      ctx.beginPath(); ctx.moveTo(r * 0.75, -r * 0.6); ctx.lineTo(r * 0.85, -r * 1.05); ctx.lineTo(r * 1.0, -r * 0.62); ctx.fill();
      Art.limb(ctx, -r * 1.0, -r * 0.1, -r * 1.5, -r * 0.5 + st * 0.3, r * 0.16, s.dark);   // tail
      ctx.fillStyle = e.aggro ? '#ff6b52' : '#d8d2c4';
      ctx.fillRect(r * 1.05, -r * 0.45, 2.6, 2.6);
    },

    imp(ctx, e, s) {
      const r = s.r;
      const flap = Math.sin(s.time * 18) * 0.5;
      ctx.fillStyle = s.dark;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.2, -r * 0.2);
        ctx.lineTo(-r * 1.3, side * r * (0.9 + flap));
        ctx.lineTo(-r * 0.5, side * r * 0.35);
        ctx.closePath(); ctx.fill();
      }
      ctx.shadowBlur = 14; ctx.shadowColor = '#ff7a3c';
      Art.blob(ctx, 0, 0, r * 0.75, r * 0.85, s.body);
      ctx.shadowBlur = 0;
      // Horns and a little flame on top.
      ctx.fillStyle = s.dark;
      ctx.beginPath(); ctx.moveTo(-r * 0.4, -r * 0.6); ctx.lineTo(-r * 0.55, -r * 1.15); ctx.lineTo(-r * 0.15, -r * 0.75); ctx.fill();
      ctx.beginPath(); ctx.moveTo(r * 0.4, -r * 0.6); ctx.lineTo(r * 0.55, -r * 1.15); ctx.lineTo(r * 0.15, -r * 0.75); ctx.fill();
      Art.blob(ctx, 0, -r * 1.05, r * 0.2, r * 0.3 + Math.sin(s.time * 20) * 1.5, '#ffd479');
      Art.eyes(ctx, r * 0.15, -r * 0.2, 3.2, 3, '#fff1c9');
    },

    shroom(ctx, e, s) {
      const r = s.r;
      // Swells as the puff winds up.
      const puff = 1 + s.pose.tell * 0.25;
      Art.blob(ctx, 0, r * 0.45, r * 0.42, r * 0.6, '#e8dcc4');                  // stalk
      Art.blob(ctx, 0, -r * 0.2, r * 1.1 * puff, r * 0.75 * puff, s.body);       // cap
      ctx.fillStyle = '#f5d0ea';
      for (const [dx, dy, rr] of [[-0.5, -0.4, 0.2], [0.3, -0.55, 0.16], [0.55, -0.1, 0.14], [-0.15, -0.05, 0.12]]) {
        ctx.beginPath(); ctx.arc(dx * r * puff, dy * r * puff, rr * r, 0, Math.PI * 2); ctx.fill();
      }
      Art.eyes(ctx, 0, r * 0.3, 3.4, 3, '#3a1030');
      if (s.pose.tell > 0) {
        ctx.globalAlpha = s.pose.tell * 0.5;
        Art.blob(ctx, 0, 0, r * 1.6 * puff, r * 1.2 * puff, 'rgba(200,111,174,.35)');
        ctx.globalAlpha = 1;
      }
    },

    mimic(ctx, e, s) {
      // A chest — until it opens, and it is all teeth.
      const r = s.r;
      const open = e.awake ? 0.35 + s.pose.tell * 0.5 + Math.abs(s.gait.cycle) * 0.15 : 0;
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#6b4a2c';
      ctx.fillRect(-r, -r * 0.2, r * 2, r * 1.0);                                 // base
      ctx.fillStyle = '#c0a070';
      ctx.fillRect(-r, -r * 0.25, r * 2, r * 0.16);
      ctx.save();
      ctx.translate(0, -r * 0.2);
      ctx.rotate(-open);
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#8a6238';
      ctx.fillRect(-r, -r * 0.6, r * 2, r * 0.6);                                 // lid
      ctx.fillStyle = '#c0a070';
      ctx.fillRect(-r * 0.15, -r * 0.3, r * 0.3, r * 0.34);
      ctx.restore();
      if (open > 0) {
        ctx.fillStyle = '#2a0c0c';
        ctx.fillRect(-r * 0.85, -r * 0.2 - open * r * 0.7, r * 1.7, open * r * 0.7);
        ctx.fillStyle = '#f0e6d2';
        for (let i = 0; i < 6; i++) {
          const tx = -r * 0.8 + i * r * 0.32;
          ctx.beginPath(); ctx.moveTo(tx, -r * 0.2); ctx.lineTo(tx + r * 0.14, -r * 0.2 - r * 0.28 * open); ctx.lineTo(tx + r * 0.28, -r * 0.2); ctx.fill();
        }
        Art.blob(ctx, r * 0.3, -r * 0.2, r * 0.35, r * 0.12, '#c8452f');          // tongue
        Art.eyes(ctx, 0, -r * 0.2 - open * r * 0.6, 4, 3, '#ffd479');
      }
    },

    lancer(ctx, e, s) {
      const r = s.r;
      ctx.globalAlpha = 0.85;
      // Long lance held out front, drawn back on the wind-up.
      const back = s.pose.tell * r * 0.8;
      Art.limb(ctx, -r * 0.8 - back, r * 0.1, r * 2.4 - back, r * 0.1, 3, '#cfe0d8');
      ctx.fillStyle = '#e8fff8';
      ctx.beginPath();
      ctx.moveTo(r * 2.4 - back, r * 0.1 - 4); ctx.lineTo(r * 3.0 - back, r * 0.1); ctx.lineTo(r * 2.4 - back, r * 0.1 + 4);
      ctx.fill();
      // Ghostly robe with a ragged hem.
      ctx.fillStyle = s.body;
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -r * 0.7);
      ctx.lineTo(r * 0.6, -r * 0.7);
      for (let i = 0; i <= 4; i++) {
        const hx = r * 0.7 - i * r * 0.35;
        ctx.lineTo(hx, r * (1.0 + ((i % 2) ? 0.25 : 0) + Math.sin(s.time * 6 + i) * 0.08));
      }
      ctx.closePath(); ctx.fill();
      Art.blob(ctx, 0, -r * 0.95, r * 0.45, r * 0.45, s.dark);
      ctx.fillStyle = '#e8fff8';
      ctx.fillRect(-r * 0.3, -r * 1.0, r * 0.6, 2.4);                             // visor slit
      ctx.globalAlpha = 1;
    },

    companion(ctx, e, s) { Art.enemy._default(ctx, e, s); },

    johnspace(ctx, e, s) {
      // Ordinary bloke, hands in pockets, right up until he isn't.
      const sw = s.gait.cycle * s.r * 0.22;
      Art.limb(ctx, -s.r * 0.28, s.r * 0.5, -s.r * 0.34, s.r * 1.15 + sw, s.r * 0.3, s.dark);
      Art.limb(ctx, s.r * 0.28, s.r * 0.5, s.r * 0.34, s.r * 1.15 - sw, s.r * 0.3, s.dark);
      ctx.fillStyle = e.enraged ? '#c8452f' : s.body;
      ctx.fillRect(-s.r * 0.55, -s.r * 0.75, s.r * 1.1, s.r * 1.4);
      Art.blob(ctx, 0, -s.r * 1.0, s.r * 0.42, s.r * 0.44, '#e8dcc4');
      Art.eyes(ctx, 0, -s.r * 1.08, 3.4, 3, e.enraged ? '#ff3b1f' : '#2b3c66');
      if (e.enraged) {
        // Fists up.
        const reach = s.r * (0.85 + s.pose.tell * 0.5);
        Art.blob(ctx, reach, s.r * 0.1, s.r * 0.3, s.r * 0.3, '#e8dcc4');
        Art.blob(ctx, reach * 0.7, -s.r * 0.45, s.r * 0.28, s.r * 0.28, '#e8dcc4');
      } else {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#cfe0f5';
        ctx.font = '9px system-ui';
        ctx.textAlign = 'center';
        ctx.scale(s.flip, 1);   // keep the text readable when facing left
        ctx.fillText('...', 0, -s.r * 1.5);
        ctx.globalAlpha = 1;
      }
    },
  },
};

/* ------------------------------------------------------------------ */
/* The player. One body, but each class silhouettes differently: the    */
/* Tanker is broad and armoured, the Mage is robed, the Ranger is lean. */
/* ------------------------------------------------------------------ */

Art.player = {
  build: {
    melee: { w: 15, h: 18, headR: 6.6, shoulders: 1.15, robe: false, helm: 'band' },
    tanker: { w: 19, h: 19, headR: 6.8, shoulders: 1.35, robe: false, helm: 'full' },
    ranger: { w: 13, h: 17, headR: 6.2, shoulders: 0.95, robe: false, helm: 'hood' },
    necromancer: { w: 14, h: 18, headR: 6.3, shoulders: 1.0, robe: true, helm: 'hood' },
    mage: { w: 13, h: 18, headR: 6.2, shoulders: 0.95, robe: true, helm: 'hood' },
  },

  draw(ctx, p, x, y, time) {
    const b = Art.player.build[p.classId] || Art.player.build.melee;
    const sp = Math.hypot(p.vx, p.vy);
    const moving = sp > 20;
    const stride = moving ? Math.sin(p.bob * 1.6) : 0;
    // Lean into a swing, and into a sprint.
    const swingLean = p.swing ? (1 - U.clamp(p.swing.t / p.swing.dur, 0, 1)) * 0.22 : 0;
    const braceLean = p.charging ? 0.16 : 0;
    const flip = Math.cos(p.aim) < 0 ? -1 : 1;

    ctx.save();
    ctx.translate(x, y);

    // Legs first, behind the torso.
    const legCol = '#4a4038';
    Art.limb(ctx, -b.w * 0.22, b.h * 0.42, -b.w * 0.28 + stride * 4, b.h * 0.72 + Math.abs(stride) * 2, 4.4, legCol);
    Art.limb(ctx, b.w * 0.22, b.h * 0.42, b.w * 0.28 - stride * 4, b.h * 0.72 - Math.abs(stride) * 2, 4.4, legCol);

    ctx.scale(flip, 1);
    ctx.rotate(-(swingLean + braceLean) * 0.6);

    // Robe flares for casters; plate squares off for the Tanker.
    ctx.fillStyle = p.hurtFlash > 0 ? '#ffffff' : '#d8d2c4';
    if (b.robe) {
      ctx.beginPath();
      ctx.moveTo(-b.w * 0.4, -b.h * 0.34);
      ctx.lineTo(b.w * 0.4, -b.h * 0.34);
      ctx.lineTo(b.w * 0.62, b.h * 0.5);
      ctx.lineTo(-b.w * 0.62, b.h * 0.5);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.fillRect(-b.w / 2, -b.h * 0.34, b.w, b.h * 0.84);
    }

    // Class-coloured mantle across the shoulders.
    ctx.fillStyle = p.cls.torso;
    ctx.fillRect(-b.w / 2 * b.shoulders, -b.h * 0.34, b.w * b.shoulders, b.h * 0.3);
    if (p.cls.id === 'tanker') {
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      ctx.fillRect(-b.w / 2 * b.shoulders, -b.h * 0.34, b.w * b.shoulders, 3);
    }

    // Head, then the helm or hood over it.
    ctx.fillStyle = p.hurtFlash > 0 ? '#ffffff' : '#f0e6d2';
    ctx.beginPath(); ctx.arc(0, -b.h * 0.62, b.headR, 0, Math.PI * 2); ctx.fill();
    if (b.helm === 'hood') {
      ctx.fillStyle = p.cls.torso;
      ctx.beginPath();
      ctx.arc(0, -b.h * 0.64, b.headR + 1.4, Math.PI * 0.92, Math.PI * 2.08);
      ctx.closePath(); ctx.fill();
    } else if (b.helm === 'full') {
      ctx.fillStyle = p.cls.torso;
      ctx.beginPath(); ctx.arc(0, -b.h * 0.64, b.headR + 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#14171c';
      ctx.fillRect(-b.headR * 0.75, -b.h * 0.68, b.headR * 1.5, 2.6);
    } else {
      ctx.fillStyle = p.cls.color;
      ctx.fillRect(-b.headR, -b.h * 0.72, b.headR * 2, 2.4);
    }

    ctx.restore();
    void time;
  },
};
