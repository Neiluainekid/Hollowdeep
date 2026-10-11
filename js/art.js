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
  star(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + i * Math.PI / 5;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
    }
    ctx.closePath(); ctx.fill();
  },

  /* Update 4.0: one shambling body for the whole of Day-ZEE — hunched,
     arms reaching, a gait that drags — dressed differently per type. */
  zombie(ctx, e, s, o) {
    const r = s.r * (o.lanky ? 0.95 : 1);
    const drag = s.gait.cycle;
    const lean = o.lean || 0.18;
    // Legs: one stiff, one dragging.
    Art.limb(ctx, -r * 0.2, r * 0.45, -r * 0.35 + drag * r * 0.25, r * 1.15, r * 0.24, '#3a3a34');
    Art.limb(ctx, r * 0.2, r * 0.45, r * 0.3 - drag * r * 0.15, r * 1.1, r * 0.24, '#3a3a34');
    ctx.save();
    ctx.rotate(lean);
    const belly = o.belly || 1;
    // Torso.
    ctx.fillStyle = o.shirt;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.55 * belly, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    if (o.vest) { ctx.fillStyle = o.vest; ctx.fillRect(-r * 0.45 * belly, -r * 0.5, r * 0.9 * belly, r * 0.7); }
    if (o.ghillie) {
      ctx.fillStyle = '#4a5a32';
      for (let i = 0; i < 7; i++) Art.blob(ctx, -r * 0.5 + (i % 4) * r * 0.32, -r * 0.6 + Math.floor(i / 4) * r * 0.6, r * 0.2, r * 0.14, i % 2 ? '#4a5a32' : '#5e6b3a');
    }
    // Torn spots.
    ctx.fillStyle = 'rgba(120,20,20,.55)';
    ctx.fillRect(-r * 0.2, r * 0.1, r * 0.22, r * 0.14);
    // Arms reaching forward — further on the wind-up.
    const reach = r * (0.95 + s.pose.tell * 0.45);
    Art.limb(ctx, r * 0.1, -r * 0.35, reach, -r * 0.2 + drag * 2, r * 0.2, o.skin);
    Art.limb(ctx, -r * 0.1, -r * 0.1, reach * 0.9, r * 0.1 - drag * 2, r * 0.2, o.skin);
    // Head, lolling.
    const hx = r * 0.25, hy = -r * 0.95 + Math.sin(s.time * 2 + (e.bob || 0)) * 1.2;
    Art.blob(ctx, hx, hy, r * 0.38, r * 0.4, o.skin);
    if (o.hood) {
      ctx.fillStyle = o.hood;
      ctx.beginPath(); ctx.arc(hx, hy - r * 0.04, r * 0.44, Math.PI * 0.9, Math.PI * 2.1); ctx.fill();
    }
    if (o.helmet) {
      ctx.fillStyle = o.helmet;
      ctx.beginPath(); ctx.arc(hx, hy - r * 0.08, r * 0.44, Math.PI, 0); ctx.fill();
      ctx.fillRect(hx - r * 0.5, hy - r * 0.1, r * 1.0, r * 0.08);
    }
    if (o.visor) {
      ctx.fillStyle = 'rgba(160,200,230,.5)';
      ctx.fillRect(hx - r * 0.05, hy - r * 0.2, r * 0.42, r * 0.32);
    }
    // Glowing dead eyes.
    ctx.fillStyle = e.aggro ? '#e8ff8a' : '#6a7a4a';
    ctx.fillRect(hx + r * 0.06, hy - r * 0.08, 2.6, 2.4);
    ctx.fillRect(hx + r * 0.24, hy - r * 0.08, 2.6, 2.4);
    ctx.restore();
  },

  rifle(ctx, s, len) {
    const r = s.r;
    const lift = -s.pose.tell * r * 0.15;
    ctx.fillStyle = '#1e1e22';
    ctx.fillRect(-r * 0.1, -r * 0.35 + lift, r * (1.2 * len), r * 0.16);
    ctx.fillStyle = '#5a4a32';
    ctx.fillRect(-r * 0.3, -r * 0.3 + lift, r * 0.35, r * 0.2);
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

    /* ---------------- Update 4.0: Day-ZEE ---------------- */

    shambler(ctx, e, s) { Art.zombie(ctx, e, s, { shirt: '#4a5a6a', skin: s.body }); },
    sprinter(ctx, e, s) { Art.zombie(ctx, e, s, { shirt: '#6a3a2a', skin: s.body, lean: 0.35, lanky: true }); },
    spewer(ctx, e, s) {
      Art.zombie(ctx, e, s, { shirt: '#5a5a3a', skin: s.body, belly: 1.35 });
      // Bile at the mouth, worse as it loads.
      const k = s.pose.tell;
      if (k > 0) Art.blob(ctx, s.r * 0.85, -s.r * 0.75, s.r * (0.12 + k * 0.2), s.r * (0.1 + k * 0.14), '#c4e86b');
    },
    hazmat(ctx, e, s) {
      Art.zombie(ctx, e, s, { shirt: s.body, skin: '#d8c860', belly: 1.15, hood: '#e0c84a' });
      // Gas mask and a cracked visor that glows as it is about to rupture.
      ctx.fillStyle = '#2a2a24';
      ctx.fillRect(s.r * 0.2, -s.r * 1.0, s.r * 0.45, s.r * 0.35);
      ctx.fillStyle = s.pose.tell > 0 ? `rgba(196,232,107,${0.4 + s.pose.tell * 0.6})` : '#8a9a6a';
      ctx.fillRect(s.r * 0.05, -s.r * 1.28, s.r * 0.5, s.r * 0.22);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(-s.r * 0.15, -s.r * 0.95, s.r * 0.22, s.r * 0.22);   // filter canister
    },
    grunt(ctx, e, s) {
      Art.zombie(ctx, e, s, { shirt: s.body, skin: '#9aa87a', helmet: '#4a5a2a', vest: '#3a4426' });
      Art.rifle(ctx, s, 1.0);
    },
    gunner(ctx, e, s) {
      Art.zombie(ctx, e, s, { shirt: s.body, skin: '#8a9a6a', helmet: '#3a4426', vest: '#2a3018', belly: 1.25 });
      // A belt-fed gun, braced at the hip, barrel spinning while it fires.
      const firing = e.atk && e.atk.phase === 'active';
      ctx.fillStyle = '#1e1e22';
      ctx.fillRect(s.r * 0.1, -s.r * 0.15, s.r * 1.6, s.r * 0.42);
      ctx.fillStyle = '#3a3a40';
      for (let i = 0; i < 3; i++) ctx.fillRect(s.r * 1.6, -s.r * 0.12 + i * s.r * 0.13 + (firing ? Math.sin(s.time * 60 + i) * 1.2 : 0), s.r * 0.6, s.r * 0.08);
      ctx.fillStyle = '#c8a040';
      ctx.fillRect(-s.r * 0.2, s.r * 0.25, s.r * 0.5, s.r * 0.12);   // ammo belt
      if (firing && Math.sin(s.time * 50) > 0) Art.blob(ctx, s.r * 2.35, 0, s.r * 0.3, s.r * 0.22, '#ffd27a');
    },
    grenadier(ctx, e, s) {
      Art.zombie(ctx, e, s, { shirt: s.body, skin: '#9aa87a', helmet: '#5a4a2a', vest: '#4a3a1e' });
      // Grenades on the bandolier, one raised in hand on the wind-up.
      ctx.fillStyle = '#3f4a2c';
      for (let i = 0; i < 3; i++) Art.blob(ctx, -s.r * 0.35 + i * s.r * 0.28, -s.r * 0.15 + i * s.r * 0.15, s.r * 0.13, s.r * 0.13, '#3f4a2c');
      if (s.pose.tell > 0) Art.blob(ctx, -s.r * 0.2, -s.r * (1.2 + s.pose.tell * 0.4), s.r * 0.2, s.r * 0.2, '#3f4a2c');
    },
    riot(ctx, e, s) {
      Art.zombie(ctx, e, s, { shirt: s.body, skin: '#8a9a7a', helmet: '#1c222c', visor: true });
      // A riot shield on the facing side — the side that blocks.
      const guard = e.stagger > 0 ? s.r * 0.4 : s.r * 0.9;
      ctx.fillStyle = 'rgba(160,190,220,.55)';
      ctx.fillRect(guard, -s.r * 1.1, s.r * 0.32, s.r * 2.1);
      ctx.strokeStyle = '#2a3440'; ctx.lineWidth = 2;
      ctx.strokeRect(guard, -s.r * 1.1, s.r * 0.32, s.r * 2.1);
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${Math.round(s.r * 0.35)}px system-ui`;
      ctx.save(); ctx.translate(guard + s.r * 0.22, 0); ctx.rotate(Math.PI / 2); ctx.scale(s.flip, 1);
      ctx.textAlign = 'center'; ctx.fillText('POLICE', 0, 0); ctx.restore();
    },
    k9(ctx, e, s) {
      Art.enemy.hound(ctx, e, s);
      // A torn vest and the patch still hanging on.
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(-s.r * 0.6, -s.r * 0.5, s.r * 1.1, s.r * 0.5);
      ctx.fillStyle = '#c8b060';
      ctx.fillRect(-s.r * 0.25, -s.r * 0.42, s.r * 0.35, s.r * 0.2);
    },
    sniper(ctx, e, s) {
      Art.zombie(ctx, e, s, { shirt: '#4a5a3a', skin: '#8a9a7a', hood: '#3c4a2c', ghillie: true });
      Art.rifle(ctx, s, 1.6);
      // The scope glints.
      if (s.pose.tell > 0) {
        ctx.fillStyle = '#ff3b1f';
        ctx.shadowBlur = 10; ctx.shadowColor = '#ff3b1f';
        Art.blob(ctx, s.r * 1.05, -s.r * 0.35, 2.4, 2.4, '#ff3b1f');
        ctx.shadowBlur = 0;
      }
    },

    sunminion(ctx, e, s) {
      // A little sun: a spiked corona around a hot core with one eye.
      const r = s.r;
      ctx.fillStyle = '#ff9a2e';
      for (let i = 0; i < 8; i++) {
        const ang = s.time * 1.4 + (i / 8) * Math.PI * 2;
        const len = r * (1.45 + Math.sin(s.time * 5 + i) * 0.15);
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang - 0.25) * r * 0.8, Math.sin(ang - 0.25) * r * 0.8);
        ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
        ctx.lineTo(Math.cos(ang + 0.25) * r * 0.8, Math.sin(ang + 0.25) * r * 0.8);
        ctx.fill();
      }
      ctx.shadowBlur = 18; ctx.shadowColor = '#ffd27a';
      Art.blob(ctx, 0, 0, r * 0.85, r * 0.85, s.body);
      ctx.shadowBlur = 0;
      Art.blob(ctx, r * 0.15, 0, r * 0.35, r * 0.35, '#fff6d0');
      Art.blob(ctx, r * 0.22, 0, r * 0.14, r * 0.18, '#6b3a08');
    },

    // Colonel Zee: an officer still in uniform, still in command.
    colonel(ctx, e, s) {
      Art.zombie(ctx, e, s, { shirt: '#4a5a32', skin: '#9aa87a', vest: '#3a4426', belly: 1.1 });
      const r = s.r;
      // Officer's cap and a chest of medals.
      ctx.save();
      ctx.rotate(0.18);
      ctx.fillStyle = '#2a3218';
      ctx.fillRect(r * 0.0, -r * 1.42, r * 0.62, r * 0.16);
      ctx.fillRect(r * 0.05, -r * 1.56, r * 0.5, r * 0.16);
      ctx.fillStyle = '#ffd479';
      ctx.fillRect(r * 0.24, -r * 1.52, r * 0.1, r * 0.08);
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = ['#ffd479', '#c8452f', '#7ea8ff', '#ffd479'][i];
        ctx.fillRect(-r * 0.3 + i * r * 0.14, -r * 0.4, r * 0.1, r * 0.14);
      }
      ctx.restore();
      Art.rifle(ctx, s, 1.3);
      // The bayonet glints as he winds up.
      ctx.fillStyle = s.pose.tell > 0 ? '#ffffff' : '#c9ccd2';
      ctx.fillRect(r * 1.45, -r * 0.33 - s.pose.tell * r * 0.15, r * 0.5, r * 0.08);
    },

    /* ---------------- minibosses ---------------- */

    tank(ctx, e, s) {
      const r = s.r;
      const L = r * 2.3, W = r * 1.7;
      const heading = Math.hypot(e.vx, e.vy) > 6 ? Math.atan2(e.vy, e.vx) : (e._heading || e.face);
      e._heading = heading;
      ctx.rotate(s.flip > 0 ? heading : Math.PI - heading);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(-L / 2 + 4, -W / 2 + 6, L, W);
      // Treads, rolling.
      ctx.fillStyle = '#1e2214';
      ctx.fillRect(-L / 2, -W / 2, L, W * 0.26);
      ctx.fillRect(-L / 2, W / 2 - W * 0.26, L, W * 0.26);
      ctx.fillStyle = '#3a3e2a';
      const roll = (s.time * Math.hypot(e.vx, e.vy) * 0.3) % 10;
      for (let x = -L / 2 + roll; x < L / 2; x += 10) {
        ctx.fillRect(x, -W / 2, 3, W * 0.26);
        ctx.fillRect(x, W / 2 - W * 0.26, 3, W * 0.26);
      }
      // Hull.
      ctx.fillStyle = s.body;
      ctx.fillRect(-L * 0.45, -W * 0.3, L * 0.9, W * 0.6);
      ctx.fillStyle = s.dark;
      ctx.fillRect(-L * 0.45, -W * 0.3, L * 0.9, W * 0.08);
      ctx.restore(); ctx.save();
      // The turret tracks you separately from the hull.
      const aim = e.atk ? e.atk.angle : e.face;
      ctx.translate(e.x, e.y);
      ctx.rotate(aim);
      ctx.fillStyle = '#2a2f1a';
      ctx.fillRect(r * 0.3, -r * 0.13 + (e.atk && e.atk.phase === 'active' ? -2 : 0), r * 1.5, r * 0.26);
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#6b7a44';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a2f1a';
      ctx.fillRect(-r * 0.15, -r * 0.4, r * 0.3, r * 0.22);
      // A star, because it is still army property.
      ctx.fillStyle = '#e8e2d4';
      Art.star(ctx, -r * 0.1, r * 0.15, r * 0.16);
    },

    battleship(ctx, e, s) {
      const r = s.r;
      const L = r * 3.2, W = r * 1.15;
      // A ship does not turn to face you; its guns do.
      if (s.flip < 0) ctx.scale(-1, 1);
      const bob = Math.sin(s.time * 1.2) * 1.5;
      ctx.translate(0, bob);
      // Wake / water foam.
      ctx.globalAlpha = 0.3;
      Art.blob(ctx, 0, 0, L * 0.58, W * 0.75, '#bfe0ff');
      ctx.globalAlpha = 1;
      // Hull: pointed bow at +x.
      ctx.fillStyle = s.dark;
      ctx.beginPath();
      ctx.moveTo(L / 2, 0);
      ctx.lineTo(L * 0.3, -W / 2); ctx.lineTo(-L / 2, -W / 2);
      ctx.lineTo(-L / 2, W / 2); ctx.lineTo(L * 0.3, W / 2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#a8b0b8';
      ctx.beginPath();
      ctx.moveTo(L * 0.44, 0);
      ctx.lineTo(L * 0.27, -W * 0.38); ctx.lineTo(-L * 0.46, -W * 0.38);
      ctx.lineTo(-L * 0.46, W * 0.38); ctx.lineTo(L * 0.27, W * 0.38);
      ctx.closePath(); ctx.fill();
      // Deck planking.
      ctx.strokeStyle = 'rgba(60,66,74,.35)';
      ctx.lineWidth = 1;
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath(); ctx.moveTo(-L * 0.45, k * W * 0.14); ctx.lineTo(L * 0.3, k * W * 0.14); ctx.stroke();
      }
      // Bridge and funnel.
      ctx.fillStyle = '#4a525c';
      ctx.fillRect(-L * 0.08, -W * 0.24, L * 0.18, W * 0.48);
      ctx.fillStyle = '#2a2e34';
      ctx.fillRect(-L * 0.22, -W * 0.14, L * 0.09, W * 0.28);
      if (Math.random() < 0.3) Art.blob(ctx, -L * 0.18 - Math.random() * 8, -Math.random() * 6, 4, 4, 'rgba(60,60,60,.5)');
      // Turrets, every one swung toward you.
      const aim = (e.atk ? e.atk.angle : e.face);
      const local = s.flip < 0 ? Math.PI - aim : aim;
      for (const tx of [L * 0.28, L * 0.16, -L * 0.32]) {
        ctx.save();
        ctx.translate(tx, 0);
        ctx.rotate(local);
        ctx.fillStyle = '#20242a';
        ctx.fillRect(r * 0.1, -r * 0.1, r * 0.55, r * 0.07);
        ctx.fillRect(r * 0.1, r * 0.03, r * 0.55, r * 0.07);
        ctx.fillStyle = '#7a848f';
        ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    },

    colossus(ctx, e, s) {
      const r = s.r;
      const sw = s.gait.cycle * r * 0.2;
      Art.limb(ctx, -r * 0.4, r * 0.5, -r * 0.5, r * 1.15 + sw, r * 0.38, s.dark);
      Art.limb(ctx, r * 0.4, r * 0.5, r * 0.5, r * 1.15 - sw, r * 0.38, s.dark);
      // A stacked body of stone with violet cracks.
      ctx.fillStyle = s.body;
      ctx.beginPath();
      ctx.moveTo(-r * 1.0, r * 0.6); ctx.lineTo(-r * 0.85, -r * 0.8);
      ctx.lineTo(r * 0.85, -r * 0.8); ctx.lineTo(r * 1.0, r * 0.6);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#d0a6ff'; ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 + Math.sin(s.time * 4) * 0.3;
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, -r * 0.6); ctx.lineTo(-r * 0.1, -r * 0.1); ctx.lineTo(-r * 0.3, r * 0.4);
      ctx.moveTo(r * 0.3, -r * 0.7); ctx.lineTo(r * 0.5, -r * 0.2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      Art.blob(ctx, 0, -r * 1.05, r * 0.42, r * 0.36, s.body);
      Art.eyes(ctx, 0, -r * 1.12, 4, 3.5, '#d0a6ff');
      // Fists like boulders, thrown forward on the strike.
      const reach = r * (0.95 + s.pose.tell * 0.5);
      Art.blob(ctx, reach, r * 0.25, r * 0.42, r * 0.4, s.dark);
      Art.blob(ctx, -r * 0.9, r * 0.25, r * 0.36, r * 0.34, s.dark);
    },

    broodmother(ctx, e, s) {
      const r = s.r;
      // Eight legs, scuttling.
      ctx.strokeStyle = s.dark; ctx.lineWidth = r * 0.14; ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        for (const side of [-1, 1]) {
          const ph = Math.sin(s.time * 12 + i * 1.3 + (side > 0 ? 0 : 1.5)) * 0.25;
          const bx = r * (0.45 - i * 0.3);
          ctx.beginPath();
          ctx.moveTo(bx, side * r * 0.3);
          ctx.lineTo(bx + r * 0.3, side * r * (0.95 + ph));
          ctx.lineTo(bx + r * (0.1 + ph), side * r * 1.4);
          ctx.stroke();
        }
      }
      Art.blob(ctx, -r * 0.45, 0, r * 0.8, r * 0.65, s.body);          // abdomen
      ctx.fillStyle = '#c4e86b';
      ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.2); ctx.lineTo(-r * 0.3, 0); ctx.lineTo(-r * 0.6, r * 0.2); ctx.fill();
      Art.blob(ctx, r * 0.45, 0, r * 0.42, r * 0.38, s.dark);          // head
      ctx.fillStyle = '#ff6b52';
      for (let i = 0; i < 4; i++) ctx.fillRect(r * 0.55 + (i % 2) * r * 0.14, -r * 0.18 + Math.floor(i / 2) * r * 0.2, 2.6, 2.6);
      // Fangs, open on the wind-up.
      const open = 0.15 + s.pose.tell * 0.35;
      Art.limb(ctx, r * 0.8, -r * 0.08, r * 1.05, -r * (0.1 + open), 2.4, '#e8dcc4');
      Art.limb(ctx, r * 0.8, r * 0.08, r * 1.05, r * (0.1 + open), 2.4, '#e8dcc4');
    },

    hexknight(ctx, e, s) {
      const r = s.r;
      const sw = s.gait.cycle * r * 0.25;
      Art.limb(ctx, -r * 0.25, r * 0.5, -r * 0.3, r * 1.15 + sw, r * 0.28, s.dark);
      Art.limb(ctx, r * 0.25, r * 0.5, r * 0.3, r * 1.15 - sw, r * 0.28, s.dark);
      ctx.fillStyle = '#3a2a4c';
      ctx.fillRect(-r * 0.6, -r * 0.8, r * 1.2, r * 1.4);
      ctx.fillStyle = s.body;
      ctx.fillRect(-r * 0.6, -r * 0.8, r * 1.2, r * 0.3);
      // A ragged cloak behind.
      ctx.fillStyle = '#24183a';
      ctx.beginPath(); ctx.moveTo(-r * 0.55, -r * 0.7); ctx.lineTo(-r * 1.1, r * 1.1 + Math.sin(s.time * 4) * 3); ctx.lineTo(-r * 0.3, r * 0.6); ctx.fill();
      Art.blob(ctx, 0, -r * 1.1, r * 0.4, r * 0.42, '#3a2a4c');
      ctx.fillStyle = '#e0b3ff';
      ctx.shadowBlur = 10; ctx.shadowColor = '#c06aff';
      ctx.fillRect(-r * 0.25, -r * 1.15, r * 0.5, r * 0.1);
      ctx.shadowBlur = 0;
      // The blade, hexed: it trails violet.
      const swing = s.pose.tell;
      ctx.save();
      ctx.rotate(-0.9 + swing * 1.6);
      ctx.fillStyle = '#d9c8ff';
      ctx.shadowBlur = 16; ctx.shadowColor = '#c06aff';
      ctx.fillRect(r * 0.3, -2.5, r * 1.6, 5);
      ctx.restore();
    },

    abomination(ctx, e, s) {
      const r = s.r;
      const sw = s.gait.cycle * r * 0.2;
      Art.limb(ctx, -r * 0.4, r * 0.5, -r * 0.55, r * 1.15 + sw, r * 0.42, s.dark);
      Art.limb(ctx, r * 0.4, r * 0.5, r * 0.55, r * 1.15 - sw, r * 0.42, s.dark);
      // A swollen mass of stitched flesh, one arm far bigger than the other.
      Art.blob(ctx, 0, -r * 0.1, r * 1.05, r * 0.95, s.body);
      ctx.strokeStyle = '#3a2a2a'; ctx.lineWidth = 1.6;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.5 + i * r * 0.3, -r * 0.7);
        ctx.lineTo(-r * 0.4 + i * r * 0.3, r * 0.4);
        ctx.stroke();
      }
      ctx.fillStyle = '#c4e86b';
      for (const [px, py] of [[-0.4, 0.1], [0.3, -0.3], [0.1, 0.45]]) {
        ctx.globalAlpha = 0.6 + Math.sin(s.time * 3 + px * 9) * 0.3;
        Art.blob(ctx, px * r, py * r, r * 0.16, r * 0.14, '#c4e86b');
      }
      ctx.globalAlpha = 1;
      Art.blob(ctx, r * 0.25, -r * 1.05, r * 0.32, r * 0.3, '#9aa87a');
      Art.eyes(ctx, r * 0.3, -r * 1.12, 3.2, 3, '#ff3b1f');
      const reach = r * (1.0 + s.pose.tell * 0.5);
      Art.blob(ctx, reach, r * 0.2, r * 0.55, r * 0.5, s.dark);       // the huge arm
      Art.blob(ctx, -r * 0.95, r * 0.2, r * 0.26, r * 0.26, s.dark);
    },

    johnspace(ctx, e, s) {
      // Ordinary bloke, hands in pockets, right up until he isn't.
      const sw = s.gait.cycle * s.r * 0.22;
      Art.limb(ctx, -s.r * 0.28, s.r * 0.5, -s.r * 0.34, s.r * 1.15 + sw, s.r * 0.3, s.dark);
      Art.limb(ctx, s.r * 0.28, s.r * 0.5, s.r * 0.34, s.r * 1.15 - sw, s.r * 0.3, s.dark);
      ctx.fillStyle = e.enraged ? '#c8452f' : s.body;
      ctx.fillRect(-s.r * 0.55, -s.r * 0.75, s.r * 1.1, s.r * 1.4);
      Art.blob(ctx, 0, -s.r * 1.0, s.r * 0.42, s.r * 0.44, '#e8dcc4');
      Art.eyes(ctx, 0, -s.r * 1.08, 3.4, 3, e.enraged ? '#ff3b1f' : '#2b3c66');
      if (e.companion) {
        // On your side: hands out of the pockets only when there is a fight.
        if (e.fighting) {
          Art.blob(ctx, s.r * 1.1, s.r * 0.05, s.r * 0.3, s.r * 0.3, '#e8dcc4');
          Art.blob(ctx, s.r * 0.6, -s.r * 0.45, s.r * 0.28, s.r * 0.28, '#e8dcc4');
        }
      } else if (e.enraged) {
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
    ninja: { w: 13, h: 17, headR: 6.1, shoulders: 1.0, robe: false, helm: 'mask' },
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
    } else if (b.helm === 'mask') {
      // Wrapped head, a slit for the eyes, and the tails of the knot.
      ctx.fillStyle = p.cls.torso;
      ctx.beginPath(); ctx.arc(0, -b.h * 0.64, b.headR + 1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f0e6d2';
      ctx.fillRect(-b.headR * 0.2, -b.h * 0.7, b.headR * 1.1, 2.4);
      ctx.strokeStyle = p.cls.color;
      ctx.lineWidth = 1.6;
      const flow = Math.sin(time * 9) * 2;
      ctx.beginPath();
      ctx.moveTo(-b.headR, -b.h * 0.66);
      ctx.lineTo(-b.headR - 7, -b.h * 0.6 + flow);
      ctx.moveTo(-b.headR, -b.h * 0.62);
      ctx.lineTo(-b.headR - 6, -b.h * 0.5 - flow);
      ctx.stroke();
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
