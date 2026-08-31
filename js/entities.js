/* Player, enemies, projectiles, pickups. */
'use strict';

/* ---------------- shared tile collision ---------------- */

function resolveAxis(e, dun, axis, delta) {
  if (delta === 0) return;
  const r = e.radius;
  const minTx = Math.floor((e.x - r) / TILE), maxTx = Math.floor((e.x + r) / TILE);
  const minTy = Math.floor((e.y - r) / TILE), maxTy = Math.floor((e.y + r) / TILE);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!dun.isSolidTile(tx, ty)) continue;
      if (axis === 'x') e.x = delta > 0 ? tx * TILE - r - 0.01 : (tx + 1) * TILE + r + 0.01;
      else e.y = delta > 0 ? ty * TILE - r - 0.01 : (ty + 1) * TILE + r + 0.01;
    }
  }
}

function moveWithCollision(e, dx, dy, dun) {
  e.x += dx; resolveAxis(e, dun, 'x', dx);
  e.y += dy; resolveAxis(e, dun, 'y', dy);
}

function xpNeeded(level) { return Math.round(26 + Math.pow(level, 1.55) * 23); }

/* ================================================================= */
/* PLAYER                                                            */
/* ================================================================= */

class Player {
  constructor(classId, x, y) {
    const c = CLASSES[classId];
    this.cls = c;
    this.classId = classId;

    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.radius = 12;
    this.facing = 0;
    this.aim = 0;

    this.maxHp = c.maxHp;
    this.hp = c.maxHp;
    this.maxEnergy = c.maxEnergy;
    this.energy = c.maxEnergy;

    // Casters declare these; melee and ranger leave the bar hidden.
    this.usesMana = !!c.maxMana;
    this.maxMana = c.maxMana || 0;
    this.mana = this.maxMana;

    this.level = 1;
    this.xp = 0;
    this.xpNext = xpNeeded(1);
    this.gold = 0;
    this.kills = 0;
    this.weaponLevel = 1;   // shard rank within a tier
    this.weaponTier = Seq.FIRST;   // 1-based index into cls.tiers
    this.perksTaken = [];

    // Modifier block — every perk writes into exactly one of these.
    this.dmgMul = 1;
    this.heavyMul = 1;
    this.moveMul = 1;
    this.regenMul = 1;
    this.dr = c.damageReduction;
    this.goldMul = 1;
    this.lifeOnKill = c.lifeOnKill || 0;
    this.rangeMul = 1;
    this.arcMul = 1;
    this.cdMul = 1;
    this.costMul = 1;
    this.knockMul = 1;
    this.multishot = 0;
    this.ricochet = 0;
    this.whirlwind = false;
    this.dashDamage = 0;
    this.executioner = 0;
    this.falloffMul = 1;
    this.mobCostMul = 1;
    this.mobCdMul = 1;
    this.levelHeal = 0;

    this.attackCd = 0;
    this.mobCd = 0;
    this.iframes = 0;
    this.hurtFlash = 0;
    this.charging = false;
    this.chargeT = 0;
    this.dashT = 0;
    this.dashDir = 0;
    this.dashHit = new Set();
    this.shieldChargeDmg = 0;
    this.swing = null;
    this.bob = 0;
    this.dead = false;

    this.parryT = 0;        // remaining open window
    this.parryCd = 0;
    this.parryFlash = 0;    // purely visual afterglow on a success
    this.parries = 0;

    this.slot = Seq.FIRST;  // 1-based slot in cls.loadout.options
    this.minionCds = {};
    this.minionPower = 1;
    this.summonCdMul = 1;
    this.manaOnKill = 0;
    this.wardedByMinions = false;
    this._noMana = 0;

    this._q = [];   // reusable scratch buffer for spatial queries
  }

  isParrying() { return this.parryT > 0; }

  // Bracing (charging the heavy) is what raises the Tanker's shield.
  isBlocking() { return !!this.cls.blocksWhileCharging && this.charging; }

  /* ---------------- caster support ---------------- */

  spendMana(n) {
    if (this.mana < n) {
      this._noMana = 0.5;
      return false;
    }
    this.mana -= n;
    return true;
  }

  get loadout() { return this.cls.loadout || null; }
  get slotDef() { return this.loadout ? Seq.get(this.loadout.options, this.slot) : null; }

  cycleSlot(dir = 1) {
    if (!this.loadout) return null;
    this.slot = Seq.wrapTo(this.loadout.options, this.slot + dir);
    return this.slotDef;
  }

  setSlot(n) {
    if (!this.loadout) return null;
    this.slot = Seq.clampTo(this.loadout.options, n);
    return this.slotDef;
  }

  // Shared by every caster projectile so status effects live in one place.
  castProjectile(game, angle, cfg) {
    game.projectiles.push(new Projectile({
      x: this.x + Math.cos(angle) * 18,
      y: this.y + Math.sin(angle) * 18,
      vx: Math.cos(angle) * cfg.speed,
      vy: Math.sin(angle) * cfg.speed,
      damage: cfg.damage,
      life: cfg.life,
      radius: cfg.radius,
      knock: cfg.knock || 0,
      pierce: !!cfg.pierce,
      color: cfg.color,
      trailColor: cfg.trailColor,
      effect: cfg.effect || null,
      aoe: cfg.aoe || null,
      owner: 'player',
      origin: { x: this.x, y: this.y },
      falloff: 0,
      falloffRange: 1,
    }));
  }

  summonMinion(game) {
    const def = this.slotDef;
    if (!def) return;
    if ((this.minionCds[def.id] || 0) > 0) {
      game.fx.text(this.x, this.y - 30, `${def.name} not ready`, '#8fa0b8', 12);
      return;
    }
    const live = game.minions.filter(m => !m.dead);
    if (live.length >= this.cls.maxMinions) {
      game.fx.text(this.x, this.y - 30, 'four is the limit', '#8fa0b8', 12);
      return;
    }
    // The brute is a wall, not a swarm: only one may stand at a time.
    if (def.id === 'brute' && live.some(m => m.kind === 'brute')) {
      game.fx.text(this.x, this.y - 30, 'one brute at a time', '#8fa0b8', 12);
      return;
    }
    if (!this.spendMana(def.cost * this.costMul)) return;

    this.minionCds[def.id] = def.cooldown * this.summonCdMul;
    const a = this.aim + U.rand(-0.5, 0.5);
    const m = new Minion(def.id, this.x + Math.cos(a) * 34, this.y + Math.sin(a) * 34, this);
    game.minions.push(m);
    game.fx.ring(m.x, m.y, 24, def.color, 18);
    game.fx.spark(m.x, m.y, {
      count: 14, color: [def.color, '#ffffff'], speedMax: 170, lifeMax: 0.5,
    });
    game.audio.summon();
  }

  tryParry(game) {
    if (this.parryCd > 0 || this.parryT > 0 || this.dashT > 0) return;
    this.parryT = PARRY.window;
    this.parryCd = PARRY.cdWhiff + PARRY.window;
    this.facing = this.aim;
    game.audio.parryOpen();
    game.fx.spark(this.x + Math.cos(this.aim) * 20, this.y + Math.sin(this.aim) * 20, {
      count: 5, color: ['#8fd4ff', '#ffffff'], dir: this.aim, spread: 1.1,
      speedMax: 90, lifeMax: 0.22, sizeMax: 2.5,
    });
  }

  /* The single funnel for everything that wants to hurt the player.
     Order matters: dodging beats everything, then parry, then damage. */
  takeHit(amount, game, opts = {}) {
    if (this.dead) return 'none';
    let kind = opts.kind || 'blue';

    if (this.iframes > 0) {
      game.onDodge(this, opts);
      return 'dodge';
    }

    /* Tanker: a raised shield downgrades unblockable to parryable. This is
       the single rule that defines the class — with the shield up there is
       no such thing as a red attack, only a heavier blue one. */
    if (this.isBlocking() && kind === 'red') {
      kind = 'blue';
      amount *= (1 - (this.cls.blockDR || 0));
      game.fx.text(this.x, this.y - 52, 'BLOCKED', '#8fd4ff', 13);
    }

    if (this.isParrying()) {
      if (kind === 'blue') {
        game.onParry(this, opts);
        return 'parry';
      }
      // Red is unblockable. Reading it wrong costs you the window and the hit.
      this.parryT = 0;
      this.parryCd = PARRY.cdRedFail;
      game.fx.text(this.x, this.y - 46, 'UNBLOCKABLE', '#ff6b52', 15);
    }

    this.takeDamage(amount, game, opts.x, opts.y);
    return 'hit';
  }

  /* ---------------- persistence ----------------
     Inputs only. Everything derived (maxHp, dmgMul, dr, ...) is rebuilt by
     replaying level-ups and perks in `restore`. */

  serialize() {
    return {
      classId: this.classId,
      level: this.level, xp: this.xp,
      gold: this.gold, kills: this.kills,
      weaponLevel: this.weaponLevel, weaponTier: this.weaponTier,   // both 1-based
      perks: this.perksTaken.slice(),
      hp: this.hp, energy: this.energy, mana: this.mana,
      slot: this.slot,
      x: this.x, y: this.y,
    };
  }

  static restore(data) {
    const p = new Player(CLASSES[data.classId] ? data.classId : CLASS_IDS[0], data.x || 0, data.y || 0);
    p.weaponLevel = data.weaponLevel || 1;
    p.weaponTier = data.weaponTier || Seq.FIRST;
    p.gold = data.gold || 0;
    p.kills = data.kills || 0;

    // Replay the passive per-level gains, then the perks, in the order taken.
    p.level = Math.max(1, data.level || 1);
    p.maxHp += (p.level - 1) * 6;
    for (const id of data.perks || []) {
      const perk = PERKS.find(k => k.id === id);
      if (!perk) continue;            // perk removed since the save was written
      perk.apply(p);
      p.perksTaken.push(id);
    }

    p.xp = data.xp || 0;
    p.xpNext = xpNeeded(p.level);
    p.hp = U.clamp(data.hp ?? p.maxHp, 1, p.maxHp);
    p.energy = U.clamp(data.energy ?? p.maxEnergy, 0, p.maxEnergy);
    p.mana = U.clamp(data.mana ?? p.maxMana, 0, p.maxMana);
    if (p.loadout) p.slot = Seq.clampTo(p.loadout.options, data.slot || Seq.FIRST);
    return p;
  }

  get tier() { return Seq.get(this.cls.tiers, Seq.clampTo(this.cls.tiers, this.weaponTier)); }
  get weaponName() { return this.tier.weapon; }
  get power() { return this.dmgMul * (1 + (this.weaponLevel - 1) * 0.16) * this.tier.dmgMul; }
  get cooldownScale() { return this.cdMul * this.tier.cdMul; }

  // Promote to the weapon tier a given map hands out (never demote).
  setWeaponTier(number, game) {
    const next = Seq.clampTo(this.cls.tiers, number);
    if (next <= this.weaponTier) return null;
    this.weaponTier = next;
    if (game) {
      game.fx.ring(this.x, this.y, 40, this.cls.color, 30);
      game.fx.text(this.x, this.y - 40, this.weaponName, this.cls.color, 20);
    }
    return this.weaponName;
  }

  heal(n) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n);
    return this.hp - before;
  }

  spendEnergy(n) {
    if (this.energy < n) return false;
    this.energy -= n;
    return true;
  }

  addXp(n, game) {
    this.xp += n;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpNeeded(this.level);
      this.maxHp += 6;
      this.hp = Math.min(this.maxHp, this.hp + 6 + this.levelHeal);
      game.queueLevelUp();
    }
  }

  takeDamage(n, game, srcX, srcY) {
    if (this.iframes > 0 || this.dead) return;
    let dr = this.dr;
    if (this.wardedByMinions && game.minions.some(m => !m.dead)) dr = 1 - (1 - dr) * 0.86;
    const stanceDr = this.slotDef && this.slotDef.dr ? this.slotDef.dr : 0;
    if (stanceDr) dr = 1 - (1 - dr) * (1 - stanceDr);
    const dmg = Math.max(1, Math.round(n * (1 - dr)));
    this.hp -= dmg;
    this.iframes = 0.45;
    this.hurtFlash = 0.35;
    game.fx.addShake(4 + dmg * 0.24);
    game.fx.addFlash('#c8452f', Math.min(0.5, 0.12 + dmg / 90));
    game.fx.text(this.x, this.y - 22, `-${dmg}`, '#ff6b52', 17);
    if (srcX !== undefined) {
      const a = U.angle(srcX, srcY, this.x, this.y);
      this.vx += Math.cos(a) * 170;
      this.vy += Math.sin(a) * 170;
      game.fx.spark(this.x, this.y, { count: 10, color: ['#ff6b52', '#c8452f'], dir: a, spread: 1.0 });
    }
    if (this.hp <= 0) { this.hp = 0; this.dead = true; game.onPlayerDeath(); }
  }

  /* ---------------- input-driven update ---------------- */

  update(dt, game) {
    const input = game.input;
    if (this.dead) return;

    this.attackCd = Math.max(0, this.attackCd - dt);
    this.mobCd = Math.max(0, this.mobCd - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.parryT = Math.max(0, this.parryT - dt);
    this.parryCd = Math.max(0, this.parryCd - dt);
    this.parryFlash = Math.max(0, this.parryFlash - dt);
    this._noMana = Math.max(0, this._noMana - dt);
    if (this.usesMana) this.mana = Math.min(this.maxMana, this.mana + this.cls.manaRegen * this.regenMul * dt);
    for (const k in this.minionCds) this.minionCds[k] = Math.max(0, this.minionCds[k] - dt);
    this.energy = Math.min(this.maxEnergy, this.energy + this.cls.energyRegen * this.regenMul * dt);

    this.aim = U.angle(this.x, this.y, game.mouseWorld.x, game.mouseWorld.y);

    // --- movement ---
    let ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let iy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const len = Math.hypot(ix, iy);
    if (len > 0) { ix /= len; iy /= len; this.facing = Math.atan2(iy, ix); }

    if (this.dashT > 0) {
      this.dashT = Math.max(0, this.dashT - dt);
      // Guard the fractional power: a negative base here yields NaN and would
      // poison the player's position for the rest of the run.
      const k = U.clamp(this.dashT / this.cls.mobility.time, 0, 1);
      const sp = this.cls.mobility.speed * Math.pow(k, 0.35);
      this.vx = Math.cos(this.dashDir) * sp;
      this.vy = Math.sin(this.dashDir) * sp;
      game.fx.spark(this.x, this.y, {
        count: 2, color: this.cls.dashColors,
        speedMin: 5, speedMax: 40, lifeMin: 0.15, lifeMax: 0.32, sizeMax: 3,
      });
      if (this.dashDamage > 0 || this.shieldChargeDmg > 0) this.dashStrike(game);
    } else {
      let speed = this.cls.speed * this.moveMul;
      if (game.dungeon.isWaterAt(this.x, this.y)) speed *= 0.62;
      if (this.charging) speed *= 0.5;
      if (this.swing && this.swing.t < this.swing.wind + 0.06) speed *= 0.45;
      const target = { x: ix * speed, y: iy * speed };
      this.vx = U.damp(this.vx, target.x, 0.35, dt);
      this.vy = U.damp(this.vy, target.y, 0.35, dt);
    }

    moveWithCollision(this, this.vx * dt, this.vy * dt, game.dungeon);
    if (len > 0 || this.dashT > 0) this.bob += dt * (this.dashT > 0 ? 22 : 11);

    // --- parry ---
    if (input.parry || input.parryPressed) {
      input.parryPressed = false;
      this.tryParry(game);
    }
    input.parryPressed = false;

    // --- dash / roll ---
    const mob = this.cls.mobility;
    if (input.dash) {
      input.dash = false;   // consume the press even if it can't fire yet
      const cost = mob.cost * this.mobCostMul;
      if (this.mobCd <= 0 && this.dashT <= 0 && this.energy >= cost) {
        this.energy -= cost;
        this.dashT = mob.time;
        this.dashDir = len > 0 ? Math.atan2(iy, ix) : this.aim;
        this.iframes = Math.max(this.iframes, mob.iframes);
        this.mobCd = mob.cd * this.mobCdMul;
        this.dashHit.clear();
        game.fx.ring(this.x, this.y, 14, this.cls.color, 12);
      }
    }

    // --- attacks ---
    if ((input.mouseR || input.rPressed) && !this.charging && this.attackCd <= 0 && this.dashT <= 0) {
      this.charging = true;
      this.chargeT = 0;
    }
    input.rPressed = false;
    if (this.charging) {
      this.chargeT += dt;
      if (this.chargeT > 0.12 && Math.random() < dt * 34) {
        const a = U.rand(0, Math.PI * 2);
        const d = 34 * (1 - Math.min(1, this.chargeT / this.cls.heavy.chargeTime));
        game.fx.particles.push({
          x: this.x + Math.cos(a) * d + 18, y: this.y + Math.sin(a) * d,
          vx: -Math.cos(a) * 70, vy: -Math.sin(a) * 70,
          life: 0.28, maxLife: 0.28, size: 3, color: this.cls.color, drag: 0.9, gravity: 0, glow: true,
        });
      }
      if (!input.mouseR) {
        this.releaseHeavy(game);
        this.charging = false;
      }
    } else if ((input.mouseL || input.lPressed) && this.attackCd <= 0 && this.dashT <= 0) {
      this.primaryAttack(game);
    }
    input.lPressed = false;

    if (this.swing) {
      this.swing.t += dt;
      if (this.swing.t >= this.swing.wind) this.applySwing(game);
      if (this.swing.t >= this.swing.dur) this.swing = null;
    }
  }

  primaryAttack(game) {
    const a = this.cls.primary;
    const cost = a.cost * this.costMul;
    if (cost > 0 && !this.spendEnergy(cost)) return;
    this.attackCd = a.cd * this.cooldownScale;
    this.facing = this.aim;
    this.cls.onPrimary(this, game);
  }

  releaseHeavy(game) {
    const h = this.cls.heavy;
    const power = U.clamp(this.chargeT / h.chargeTime, 0.35, 1);
    const cost = h.cost * power * this.costMul;
    if (this.energy < cost) {
      game.fx.text(this.x, this.y - 26, 'no ' + this.cls.energyName.toLowerCase(), '#8fa0b8', 12);
      return;
    }
    this.energy -= cost;
    this.attackCd = h.cd * this.cooldownScale;
    this.facing = this.aim;
    this.cls.onHeavy(this, game, power);
  }

  startSwing(game, cfg) {
    this.swing = {
      angle: this.aim, t: 0, hit: new Set(),
      dir: this.swing && this.swing.side === 1 ? -1 : 1,
      side: this.swing && this.swing.side === 1 ? -1 : 1,
      ...cfg,
    };
    game.fx.addShake(cfg.heavy ? 0 : 1.4);
  }

  applySwing(game) {
    const s = this.swing;
    for (const e of game.enemyHash.query(this.x, this.y, s.range + 48, this._q)) {
      if (e.dead || s.hit.has(e)) continue;
      const d = U.dist(this.x, this.y, e.x, e.y);
      if (d > s.range + e.radius) continue;
      if (s.arc < Math.PI * 2) {
        const da = Math.abs(U.angleDiff(s.angle, U.angle(this.x, this.y, e.x, e.y)));
        if (da > s.arc / 2) continue;
      }
      s.hit.add(e);
      let dmg = s.damage;
      if (this.executioner > 0 && e.hp / e.maxHp < 0.33) dmg *= 1 + this.executioner;
      const crit = U.chance(0.12);
      if (crit) dmg *= 1.7;
      e.takeDamage(dmg, game, this.x, this.y, s.knock, crit);
      if (s.stun > 0) e.stun = Math.max(e.stun, s.stun);
      game.fx.addShake(s.heavy ? 5 : 2);
      game.audio.impact(s.heavy);
      if (s.impact) game.impactFreeze(0.05);   // heavy hits hold for a beat
    }
  }

  dashStrike(game) {
    // A Tanker's Heavy Dash trades on the shield, not on a perk.
    const shield = this.shieldChargeDmg || 0;
    const dmg = shield > 0 ? shield : this.dashDamage * this.power;
    for (const e of game.enemyHash.query(this.x, this.y, this.radius + 48, this._q)) {
      if (e.dead || this.dashHit.has(e)) continue;
      if (U.dist(this.x, this.y, e.x, e.y) > this.radius + e.radius + 6) continue;
      this.dashHit.add(e);
      e.takeDamage(dmg, game, this.x, this.y, shield > 0 ? 720 : 420, false);
      e.stun = Math.max(e.stun, shield > 0 ? 0.7 : 0.4);
      if (shield > 0) { game.impactFreeze(0.05); game.fx.addShake(8); }
      else game.fx.addShake(4);
    }
    if (shield > 0 && this.dashT <= 0) this.shieldChargeDmg = 0;
  }

  fireProjectile(game, angle, cfg) {
    game.projectiles.push(new Projectile({
      x: this.x + Math.cos(angle) * 16,
      y: this.y + Math.sin(angle) * 16,
      vx: Math.cos(angle) * cfg.speed,
      vy: Math.sin(angle) * cfg.speed,
      damage: cfg.damage,
      life: cfg.life,
      radius: cfg.radius,
      knock: cfg.knock,
      pierce: cfg.pierce,
      heavy: cfg.heavy,
      pierceFalloff: cfg.pierceFalloff || null,
      ricochet: cfg.pierce ? 0 : this.ricochet,
      owner: 'player',
      color: cfg.color || (cfg.heavy ? '#ffffff' : '#cbd8f0'),
      origin: { x: this.x, y: this.y },
      falloff: this.cls.falloffBonus ? this.cls.falloffBonus * this.falloffMul : 0,
      falloffRange: this.cls.falloffRange || 1,
    }));
  }

  onKill(game, enemy) {
    this.kills++;
    if (this.lifeOnKill > 0) {
      const healed = this.heal(this.lifeOnKill);
      if (healed > 0) game.fx.text(this.x, this.y - 32, `+${healed}`, '#6fbf73', 13);
    }
    if (this.manaOnKill > 0 && this.usesMana) {
      this.mana = Math.min(this.maxMana, this.mana + this.manaOnKill);
    }
    void enemy;
  }
}

/* ================================================================= */
/* PROJECTILES                                                       */
/* ================================================================= */

class Projectile {
  constructor(o) {
    Object.assign(this, {
      radius: 5, life: 1.2, pierce: false, heavy: false, ricochet: 0,
      knock: 100, color: '#fff', homing: 0, dead: false,
    }, o);
    this.hits = new Set();
    this.trail = [];
    this._q = [];
  }

  update(dt, game) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }

    if (this.homing > 0 && this.owner === 'enemy' && !game.player.dead) {
      const want = U.angle(this.x, this.y, game.player.x, game.player.y);
      const cur = Math.atan2(this.vy, this.vx);
      const na = cur + U.clamp(U.angleDiff(cur, want), -this.homing * dt, this.homing * dt);
      const sp = Math.hypot(this.vx, this.vy);
      this.vx = Math.cos(na) * sp; this.vy = Math.sin(na) * sp;
    }

    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 7) this.trail.shift();

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (game.dungeon.isSolidAt(this.x, this.y)) {
      game.fx.spark(this.x, this.y, {
        count: this.heavy ? 12 : 5, color: [this.color, '#8a8fa0'],
        speedMax: 130, lifeMax: 0.3, sizeMax: 3,
      });
      this.splat(game);
      this.dead = true;
      return;
    }

    if (this.owner === 'player') {
      for (const e of game.enemyHash.query(this.x, this.y, this.radius + 48, this._q)) {
        if (e.dead || this.hits.has(e)) continue;
        if (U.dist(this.x, this.y, e.x, e.y) > e.radius + this.radius) continue;
        this.hits.add(e);
        let dmg = this.damage;
        if (this.falloff) {
          const d = U.dist(this.origin.x, this.origin.y, this.x, this.y);
          dmg *= 1 + this.falloff * U.clamp(d / this.falloffRange, 0, 1);
        }
        const crit = U.chance(0.1);
        if (crit) dmg *= 1.7;
        e.takeDamage(dmg, game, this.x, this.y, this.knock, crit);
        game.audio.impact(!!this.heavy);
        if (this.effect) this.applyEffect(e, game);
        if (this.aoe) { this.burst(game, e); return; }

        if (this.pierce) {
          // Everything past the first body takes the reduced pierce band.
          if (this.pierceFalloff) {
            this.damage = U.rand(this.pierceFalloff.min, this.pierceFalloff.max);
          }
          continue;
        }
        if (this.ricochet > 0) {
          const next = game.enemyHash.nearest(this.x, this.y, 280, o => !o.dead && !this.hits.has(o));
          if (next) {
            this.ricochet--;
            const a = U.angle(this.x, this.y, next.x, next.y);
            const sp = Math.hypot(this.vx, this.vy);
            this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
            this.life = Math.max(this.life, 0.5);
            game.fx.spark(this.x, this.y, { count: 6, color: '#a9c6ff', speedMax: 120, lifeMax: 0.25 });
            continue;
          }
        }
        this.dead = true;
        return;
      }
    } else {
      const p = game.player;
      if (!p.dead && U.dist(this.x, this.y, p.x, p.y) < p.radius + this.radius) {
        const result = p.takeHit(this.damage, game, {
          x: this.x, y: this.y, kind: this.kind || 'blue', source: this.shooter, projectile: this,
        });
        if (result === 'parry') {
          // Send it back. Turning an archer's own arrow around is the most
          // legible possible reward for a good read.
          this.owner = 'player';
          this.hits.clear();
          this.damage = Math.max(this.damage, 14) * p.power * 1.5;
          this.color = '#cfe4ff';
          this.life = 2;
          const back = this.shooter && !this.shooter.dead
            ? U.angle(this.x, this.y, this.shooter.x, this.shooter.y)
            : p.aim;
          const sp = Math.hypot(this.vx, this.vy) * 1.5;
          this.vx = Math.cos(back) * sp;
          this.vy = Math.sin(back) * sp;
          this.homing = 0;
          if (this.shooter) this.shooter.onParried(game);
          return;
        }
        if (!this.pierce || result === 'dodge') { this.splat(game); this.dead = true; }
      }
    }
  }

  // Some shots leave the floor hostile where they land.
  splat(game) {
    if (this.leaves !== 'bile') return;
    game.zones.push(new Zone('goo', this.x, this.y, {
      radius: 62, life: 6, tickEvery: 0.7, damage: 5 * (this.splatScale || 1),
      power: 1, hostile: true,
    }));
    game.fx.spark(this.x, this.y, {
      count: 12, color: ['#c4e86b', '#8fd14a'], speedMax: 150, lifeMax: 0.5, sizeMax: 4,
    });
  }

  applyEffect(e, game) {
    if (this.effect === 'chill') {
      e.chill = Math.max(e.chill, 3);
      game.fx.spark(e.x, e.y, {
        count: 6, color: ['#a9dcff', '#ffffff'], speedMax: 90, lifeMax: 0.4, sizeMax: 3,
      });
      // Brain-freeze: a 1-in-100 outright finisher. Never on a boss.
      if (!e.def.boss && U.chance(0.01)) {
        game.fx.text(e.x, e.y - 40, 'BRAIN-FREEZE', '#a9dcff', 20);
        game.fx.ring(e.x, e.y, 40, '#a9dcff', 30);
        game.fx.addShake(8);
        game.audio.freeze();
        e.takeDamage(e.hp + 9999, game, this.x, this.y, 0, false);
      }
    } else if (this.effect === 'fling') {
      const weak = e.hp / e.maxHp < 0.35;
      const liftable = weak && !e.elite && !e.def.boss;
      const a = U.angle(this.x, this.y, e.x, e.y);
      if (liftable) {
        // Light and hurt: picked up and thrown.
        e.vx += Math.cos(a) * 1150;
        e.vy += Math.sin(a) * 1150;
        e.stun = Math.max(e.stun, 0.8);
        e.takeDamage(10, game, this.x, this.y, 0, false);
        game.fx.text(e.x, e.y - 34, 'FLUNG', '#e6f0ff', 15);
      } else {
        // Healthy, elite or a boss: it only shoves.
        e.vx += Math.cos(a) * 320;
        e.vy += Math.sin(a) * 320;
      }
    }
  }

  burst(game, hitEnemy) {
    const { radius, damage } = this.aoe;
    game.fx.ring(this.x, this.y, radius * 0.5, this.color, 30);
    game.fx.spark(this.x, this.y, {
      count: 26, color: [this.color, '#ffffff'], speedMax: 300, lifeMax: 0.6, sizeMax: 5,
    });
    game.fx.addShake(6);
    game.audio.explode();
    for (const o of game.enemyHash.query(this.x, this.y, radius, [])) {
      if (o.dead || o === hitEnemy) continue;
      if (U.dist(this.x, this.y, o.x, o.y) > radius) continue;
      o.takeDamage(damage, game, this.x, this.y, 220, false);
      if (this.effect) this.applyEffect(o, game);
    }
    this.dead = true;
  }

  draw(ctx) {
    ctx.save();
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i], a = (i / this.trail.length) * 0.5;
      ctx.globalAlpha = a;
      ctx.fillStyle = this.trailColor || this.color;
      const s = this.radius * (i / this.trail.length) * 1.4;
      ctx.fillRect(t.x - s / 2, t.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 14;
    ctx.shadowColor = this.color;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/* ================================================================= */
/* ENEMIES                                                           */
/* ================================================================= */

/* Parry / dodge tuning. One place, because the whole combat model is timing
   now and these numbers are the game's feel. */
const PARRY = {
  window: 0.24,      // how long a press stays "open"
  cdWhiff: 0.5,      // punish for mistiming
  cdSuccess: 0.22,   // land one and you are ready again quickly
  cdRedFail: 0.9,    // punish for trying to parry an unblockable
  stagger: 1.3,      // how long a parried enemy is open
  refund: 25,        // energy back on success
  vuln: 1.6,         // damage multiplier against a staggered enemy
  perfectOdds: 20,   // 1-in-20 parries execute a non-boss outright
};

/* Enemies no longer damage you by touching you. Every attack is a wind-up you
   can read: `blue` can be parried, `red` must be dodged. That distinction is
   the whole combat model, so it lives in the data rather than the code. */
const ENEMY_TYPES = {
  slime: {
    name: 'Cave Slime', hp: 34, speed: 46, radius: 13, xp: 7, gold: 3,
    ai: 'chase', color: '#6fbf73', dark: '#2f5c34',
    attacks: [
      { id: 'lunge', kind: 'blue', shape: 'melee', range: 74, reach: 48, arc: 1.7,
        wind: 0.45, active: 0.14, recover: 0.45, damage: 10, cd: 1.3, lunge: 340 },
    ],
  },
  bat: {
    name: 'Dusk Bat', hp: 20, speed: 118, radius: 10, xp: 6, gold: 2,
    ai: 'erratic', color: '#b58ad6', dark: '#4a2f61', flying: true,
    attacks: [
      // Short wind-up: the tightest parry in the basic roster.
      { id: 'dart', kind: 'blue', shape: 'melee', range: 78, reach: 42, arc: 1.9,
        wind: 0.3, active: 0.1, recover: 0.34, damage: 8, cd: 1.1, lunge: 430 },
    ],
  },
  skeleton: {
    name: 'Bone Archer', hp: 46, speed: 62, radius: 12, xp: 13, gold: 6,
    ai: 'ranged', color: '#ddd6c0', dark: '#6b6455',
    attacks: [
      { id: 'arrow', kind: 'blue', shape: 'shot', range: 470,
        wind: 0.5, active: 0.06, recover: 0.5, damage: 11, cd: 1.8,
        shot: { speed: 340, radius: 5, color: '#e8dcae' } },
    ],
  },
  brute: {
    name: 'Stone Brute', hp: 135, speed: 40, radius: 20, xp: 30, gold: 14,
    ai: 'charger', color: '#a07a5c', dark: '#4a3527',
    attacks: [
      { id: 'swipe', kind: 'blue', shape: 'melee', range: 82, reach: 64, arc: 1.9,
        wind: 0.55, active: 0.16, recover: 0.6, damage: 18, cd: 2.1, lunge: 130 },
      { id: 'charge', kind: 'red', shape: 'charge', range: 380, minRange: 110,
        wind: 0.7, active: 0.5, recover: 0.8, damage: 26, cd: 5.2, chargeSpeed: 640 },
    ],
  },
  wraith: {
    name: 'Hollow Wraith', hp: 70, speed: 78, radius: 14, xp: 22, gold: 10,
    ai: 'phase', color: '#7ea8ff', dark: '#2b3c66', flying: true, ghost: true,
    attacks: [
      { id: 'orb', kind: 'blue', shape: 'shot', range: 520, minRange: 150,
        wind: 0.55, active: 0.06, recover: 0.5, damage: 12, cd: 2.2,
        shot: { speed: 210, radius: 6, color: '#9fc0ff', homing: 1.6 } },
      { id: 'rend', kind: 'red', shape: 'melee', range: 76, reach: 58, arc: 2.2,
        wind: 0.6, active: 0.18, recover: 0.7, damage: 20, cd: 4.4, lunge: 260 },
    ],
  },
  /* --- ranged pressure --- */
  spitter: {
    name: 'Bile Spitter', hp: 38, speed: 58, radius: 12, xp: 14, gold: 6,
    ai: 'ranged', color: '#a8c452', dark: '#4a5a1e',
    attacks: [
      // Denies ground rather than killing you: the puddle is the threat.
      { id: 'spit', kind: 'blue', shape: 'shot', range: 420,
        wind: 0.45, active: 0.06, recover: 0.45, damage: 9, cd: 1.7,
        shot: { speed: 300, radius: 7, color: '#c4e86b', leaves: 'bile' } },
    ],
  },
  crossbow: {
    name: 'Crossbow Sentinel', hp: 60, speed: 44, radius: 13, xp: 20, gold: 10,
    ai: 'ranged', color: '#c9b48a', dark: '#5e5238',
    attacks: [
      { id: 'bolt', kind: 'blue', shape: 'shot', range: 520,
        wind: 0.55, active: 0.06, recover: 0.5, damage: 14, cd: 2.2,
        shot: { speed: 460, radius: 5, color: '#ffe6b0' } },
      // Long tell, punches through: step out of the line.
      { id: 'skewer', kind: 'red', shape: 'shot', range: 580, minRange: 170,
        wind: 0.9, active: 0.06, recover: 0.8, damage: 26, cd: 6,
        shot: { speed: 780, radius: 7, color: '#ff6b52', pierce: true } },
    ],
  },
  mortar: {
    name: 'Rot Mortar', hp: 72, speed: 32, radius: 16, xp: 24, gold: 12,
    ai: 'ranged', color: '#8a6a9c', dark: '#3a2a44',
    attacks: [
      { id: 'shell', kind: 'red', shape: 'impact', range: 620, minRange: 170,
        wind: 0.8, active: 0.1, recover: 0.9, damage: 24, cd: 4.5,
        impactRadius: 110, impactDelay: 1.1 },
    ],
  },

  /* --- harder melee --- */
  revenant: {
    name: 'Revenant', hp: 95, speed: 134, radius: 13, xp: 28, gold: 13,
    ai: 'chase', color: '#d67a7a', dark: '#5c2a2a',
    attacks: [
      // Fast and frequent: the class you learn to parry on rhythm.
      { id: 'slash', kind: 'blue', shape: 'melee', range: 80, reach: 56, arc: 1.7,
        wind: 0.32, active: 0.12, recover: 0.28, damage: 13, cd: 1.0, lunge: 380 },
      { id: 'overhead', kind: 'red', shape: 'melee', range: 88, reach: 64, arc: 1.5,
        wind: 0.65, active: 0.16, recover: 0.75, damage: 28, cd: 5, lunge: 300 },
    ],
  },
  ironclad: {
    name: 'Ironclad', hp: 180, speed: 46, radius: 19, xp: 36, gold: 18,
    ai: 'charger', color: '#8f9aa8', dark: '#3a4048', shielded: true,
    attacks: [
      { id: 'bash', kind: 'blue', shape: 'melee', range: 78, reach: 58, arc: 1.6,
        wind: 0.5, active: 0.15, recover: 0.55, damage: 20, cd: 2.0, lunge: 150 },
      { id: 'crush', kind: 'red', shape: 'melee', range: 86, reach: 66, arc: 2.0,
        wind: 0.85, active: 0.18, recover: 0.9, damage: 32, cd: 6, lunge: 120 },
    ],
  },

  /* Tridon's Curse — no attacks at all. It simply runs at you and detonates,
     so the counterplay is spacing and killing it at range, not reading a
     telegraph. The kaboom icon overhead is the warning. */
  tridon: {
    name: "Tridon's Curse", hp: 44, speed: 122, radius: 13, xp: 18, gold: 8,
    ai: 'chase', color: '#ff8a3c', dark: '#5c2a10',
    suicide: { damage: 34, radius: 116, fuse: 0.45 },
    kaboom: true,
    attacks: [],
  },

  /* John Space stands in the deep regions and does nothing. He is neutral,
     carries a bar so you know he is Someone, and what he becomes is decided
     entirely by whether you leave him alone. */
  johnspace: {
    name: 'John Space', hp: 500, speed: 96, radius: 16, xp: 260, gold: 200,
    ai: 'neutral', color: '#8fd4ff', dark: '#2b3c66',
    // Fixed numbers, not region-scaled: the spec's 1000 HP / 2x on provoking
    // has to be an escalation, and tier scaling was pushing his neutral form
    // above his hostile one.
    neutral: true, showBar: true, noScale: true,
    peaceRequired: 120,        // seconds of being left alone
    enragedHp: 1000, enragedDmgMul: 2,
    attacks: [
      { id: 'jab', kind: 'blue', shape: 'melee', range: 84, reach: 60, arc: 1.8,
        wind: 0.34, active: 0.13, recover: 0.3, damage: 20, cd: 1.1, lunge: 400 },
      { id: 'haymaker', kind: 'red', shape: 'melee', range: 92, reach: 70, arc: 1.7,
        wind: 0.6, active: 0.17, recover: 0.7, damage: 34, cd: 4.5, lunge: 340 },
    ],
  },

  warden: {
    name: 'The Hollow Warden', hp: 900, speed: 58, radius: 34, xp: 400, gold: 300,
    ai: 'boss', color: '#c8452f', dark: '#3d1712', boss: true,
  },

  /* ---------------- Update 2.0 bosses ----------------
     All three share the headline numbers: 3000 HP and a 1.5x damage
     multiplier. Their movesets are what separate them. */
  sungod: {
    name: 'The Sun God', hp: 3000, speed: 52, radius: 36, xp: 700, gold: 500,
    ai: 'boss', color: '#ffc24d', dark: '#6b3a08', boss: true,
    bossDmgMul: 1.5, palette: 'sun',
    title: 'Predicament King',
  },
  flowery: {
    name: 'Flowery', hp: 3000, speed: 40, radius: 40, xp: 700, gold: 500,
    ai: 'boss', color: '#7fd66a', dark: '#264a1c', boss: true,
    bossDmgMul: 1.5, palette: 'flora',
    title: 'The Bloom That Watches',
  },
  judgement: {
    name: 'Judgement', hp: 3000, speed: 74, radius: 34, xp: 700, gold: 500,
    ai: 'boss', color: '#e8e2d4', dark: '#3a3630', boss: true,
    bossDmgMul: 1.5, palette: 'fist',
    title: 'Pure Devastation',
  },
};

class Enemy {
  constructor(type, x, y, tier = 0, elite = false) {
    const t = ENEMY_TYPES[type];
    this.type = type;
    this.def = t;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.radius = t.radius * (elite ? 1.25 : 1);
    this.elite = elite;
    this.tier = tier;

    const scale = t.noScale ? 1 : 1 + tier * 0.34;
    this.maxHp = Math.round(t.hp * scale * (elite ? 2.1 : 1));
    this.hp = this.maxHp;
    this.dmgScale = (t.noScale ? 1 : 1 + tier * 0.26) * (elite ? 1.35 : 1) * (t.bossDmgMul || 1);
    this.speed = t.speed * (elite ? 0.92 : 1);
    this.xpValue = Math.round(t.xp * (1 + tier * 0.3) * (elite ? 2.4 : 1));
    this.goldValue = Math.round(t.gold * (1 + tier * 0.4) * (elite ? 3 : 1));

    this.dead = false;
    this.flash = 0;
    this.stun = 0;
    this.stagger = 0;       // parried: open, and taking extra damage
    this.root = 0;          // held in place (vines) — elites and bosses immune
    this.chill = 0;         // slowed (ice)
    this.atk = null;        // the wind-up/active/recover attack in progress
    this.atkCds = {};       // per-attack cooldowns, keyed by attack id
    this.hitCd = 0;
    this.shotCd = U.rand(0.4, 1.6);
    this.wobble = U.rand(0, Math.PI * 2);
    this.state = 'idle';
    this.stateT = 0;
    this.aggro = false;
    this.lastSeen = null;
    this.bob = U.rand(0, 10);
    this.phase = 1;
    this.moveAngle = U.rand(0, Math.PI * 2);
    this.neutral = !!t.neutral;
    this.enraged = false;
    this.peaceT = 0;       // John Space: seconds left alone
    this.fuse = 0;         // Tridon's Curse: lit, and counting down
    this.lit = false;
    this.face = 0;         // which way it is turned — matters for shields
    this.room = null;      // set by the spawner, so a cleared room stays cleared
    this._q = [];
  }

  canAct() { return this.stun <= 0 && this.stagger <= 0; }

  /* You attacked him. He is now a 1000 HP problem that does double damage
     and does not stop following you. */
  enrage(game) {
    this.enraged = true;
    this.neutral = false;
    this.aggro = true;
    this.maxHp = this.def.enragedHp;
    this.hp = this.def.enragedHp;
    this.dmgScale *= this.def.enragedDmgMul;
    this.speed *= 1.35;
    this.def_ai_override = 'chase';
    game.fx.ring(this.x, this.y, 60, '#ff3b1f', 44);
    game.fx.addShake(16);
    game.fx.addFlash('#c8452f', 0.5);
    game.fx.text(this.x, this.y - 46, 'YOU SHOULD NOT HAVE', '#ff6b52', 19);
    game.toast('John Space stops being neutral.', 5);
    game.audio.blip(70, 0.8, 0.22, 'sawtooth');
  }

  // Parried enemies are open: they stop acting and take extra damage.
  onParried(game) {
    this.stagger = PARRY.stagger;
    this.stun = Math.max(this.stun, PARRY.stagger);
    this.atk = null;
    this.vx *= 0.2; this.vy *= 0.2;
    game.fx.text(this.x, this.y - this.radius - 20, 'STAGGERED', '#8fd4ff', 13);
  }

  /* Goes off in a circle. Unblockable by nature — there is no wind-up to
     read, only distance to keep. Split from `detonate` so that dying with a
     lit fuse produces the same blast without recursing back into die(). */
  blast(game) {
    const s = this.def.suicide;
    const p = game.player;
    game.fx.ring(this.x, this.y, s.radius * 0.6, '#ff8a3c', 44);
    game.fx.spark(this.x, this.y, {
      count: 46, color: ['#ff8a3c', '#ffd479', '#ffffff'],
      speedMax: 460, lifeMax: 0.9, sizeMax: 6,
    });
    game.fx.addShake(14);
    game.impactFreeze(0.06);
    game.audio.explode();
    if (p && !p.dead && U.dist(this.x, this.y, p.x, p.y) < s.radius) {
      p.takeHit(s.damage * this.dmgScale, game, {
        x: this.x, y: this.y, kind: 'red', source: this,
      });
    }
    for (const o of game.enemyHash.query(this.x, this.y, s.radius, this._q)) {
      if (o === this || o.dead || U.dist(this.x, this.y, o.x, o.y) > s.radius) continue;
      o.takeDamage(s.damage * 0.5, game, this.x, this.y, 220, false);
    }
  }

  detonate(game) {
    if (this.dead) return;
    this.fuse = 0;
    this.lit = false;      // so die() does not fire a second blast
    this.hp = 0;
    this.blast(game);
    this.die(game);
  }

  takeDamage(n, game, srcX, srcY, knock = 0, crit = false) {
    if (this.dead) return;
    // Hit John Space once and the arrangement is over.
    if (this.neutral && !this.enraged) this.enrage(game);
    if (this.stagger > 0) n *= PARRY.vuln;

    /* Ironclads eat frontal damage until you open them. Parrying strips the
       shield (they stagger), and so does getting behind them — which is what
       makes them a puzzle rather than a health sponge. */
    let blocked = false;
    if (this.def.shielded && this.stagger <= 0 && srcX !== undefined) {
      const from = U.angle(this.x, this.y, srcX, srcY);
      if (Math.abs(U.angleDiff(this.face, from)) < 1.15) { n *= 0.3; blocked = true; }
    }

    const dmg = Math.max(1, Math.round(n));
    if (blocked) {
      game.fx.text(this.x, this.y - this.radius - 18, 'BLOCKED', '#c9d4e0', 12);
      game.fx.spark(this.x, this.y, {
        count: 6, color: ['#c9d4e0', '#ffffff'], dir: U.angle(this.x, this.y, srcX, srcY),
        spread: 0.8, speedMax: 150, lifeMax: 0.3, sizeMax: 2.5,
      });
    }
    this.hp -= dmg;
    this.flash = 0.13;
    this.aggro = true;
    game.fx.text(this.x, this.y - this.radius - 6, crit ? `${dmg}!` : `${dmg}`,
      crit ? '#ffd479' : '#ffffff', crit ? 19 : 14);
    const a = U.angle(srcX, srcY, this.x, this.y);
    game.fx.spark(this.x, this.y, {
      count: crit ? 12 : 7, color: [this.def.color, '#ffffff'],
      dir: a, spread: 0.9, speedMax: 210, lifeMax: 0.4, sizeMax: 3.5,
    });
    if (knock > 0 && !this.def.boss) {
      const k = knock / (this.elite ? 2.2 : 1);
      this.vx += Math.cos(a) * k;
      this.vy += Math.sin(a) * k;
    }
    if (this.hp <= 0) this.die(game);
  }

  die(game) {
    if (this.dead) return;
    this.dead = true;
    // Killing a lit Curse does not defuse it — it just sets it off early.
    if (this.def.suicide && this.lit) {
      this.lit = false;
      this.blast(game);
    }
    // A room the player emptied stays empty across a save/resume.
    if (this.room) {
      this.room.alive = Math.max(0, (this.room.alive || 0) - 1);
      if (this.room.alive === 0) this.room.cleared = true;
    }
    game.fx.spark(this.x, this.y, {
      count: this.def.boss ? 90 : 20, color: [this.def.color, this.def.dark, '#ffffff'],
      speedMax: this.def.boss ? 420 : 240, lifeMax: 0.85, sizeMax: this.def.boss ? 7 : 4.5,
    });
    game.fx.ring(this.x, this.y, this.radius, this.def.color, this.def.boss ? 40 : 14);
    game.fx.addShake(this.def.boss ? 22 : 3 + this.radius * 0.12);
    game.audio.blip(this.def.boss ? 60 : 140, 0.22, 0.16);

    game.player.addXp(this.xpValue, game);
    game.player.onKill(game, this);

    const coins = U.clamp(Math.round(this.goldValue / 4), 1, 9);
    for (let i = 0; i < coins; i++) game.pickups.push(new Pickup('gold', this.x, this.y, Math.ceil(this.goldValue / coins)));
    if (U.chance(this.def.boss ? 1 : 0.11)) {
      const n = this.def.boss ? 5 : 1;
      for (let i = 0; i < n; i++) game.pickups.push(new Pickup('heart', this.x, this.y, 20));
    }
    if (this.elite || this.def.boss) game.pickups.push(new Pickup('shard', this.x, this.y, 1));

    if (this.def.boss) game.onBossDefeated();
  }

  /* -------------------------- AI -------------------------- */

  update(dt, game) {
    const p = game.player;
    const dun = game.dungeon;
    this.flash = Math.max(0, this.flash - dt);
    this.stun = Math.max(0, this.stun - dt);
    this.stagger = Math.max(0, this.stagger - dt);
    this.root = Math.max(0, this.root - dt);
    this.chill = Math.max(0, this.chill - dt);
    this.hitCd = Math.max(0, this.hitCd - dt);
    this.shotCd = Math.max(0, this.shotCd - dt);
    for (const k in this.atkCds) this.atkCds[k] = Math.max(0, this.atkCds[k] - dt);
    this.stateT += dt;
    this.bob += dt * 6;

    const seeP = U.dist(this.x, this.y, p.x, p.y);
    const canSee = seeP < 620 && (this.def.ghost || dun.lineOfSight(this.x, this.y, p.x, p.y));
    if (canSee && seeP < 480) { this.aggro = true; this.lastSeen = { x: p.x, y: p.y }; }

    // A taunting minion standing closer pulls this enemy off the player —
    // that redirection is the whole reason to pay 40 mana for a Bone Brute.
    const focus = this.pickFocus(game, p, seeP);
    const d = focus === p ? seeP : U.dist(this.x, this.y, focus.x, focus.y);
    // Turn toward what we're fighting; a committed attack locks the facing.
    const wantFace = this.atk ? this.atk.angle : U.angle(this.x, this.y, focus.x, focus.y);
    this.face += U.clamp(U.angleDiff(this.face, wantFace), -5 * dt, 5 * dt);

    let ax = 0, ay = 0;   // desired velocity for this frame

    // A committed attack owns the enemy: it steers itself and ignores the AI
    // below until it finishes. That commitment is what makes it readable.
    if (this.atk) {
      const r = this.updateAttack(dt, game, this.atk.target || p);
      ax = r.ax; ay = r.ay;
      this.applySeparation(game, (v) => { ax += v.x; ay += v.y; });
      this.integrate(dt, game, ax, ay);
      return;
    }

    /* John Space, unprovoked: he wanders, he does not close, and he does not
       attack. Leave him be long enough and he throws in with you instead. */
    if (this.neutral && !this.enraged) {
      this.peaceT += dt;
      if (this.peaceT >= this.def.peaceRequired) { game.johnBefriended(this); return; }
      if (this.stateT > 2.4) { this.moveAngle = U.rand(0, Math.PI * 2); this.stateT = 0; }
      const wander = 0.28;
      this.applySeparation(game, (v) => {
        this.integrate(dt, game,
          Math.cos(this.moveAngle) * this.speed * wander + v.x,
          Math.sin(this.moveAngle) * this.speed * wander + v.y);
      });
      return;
    }

    /* Tridon's Curse: contact lights the fuse, and once lit nothing stops it.
       Killing it early is the counterplay, so the fuse keeps burning even
       through a stagger. */
    if (this.def.suicide) {
      if (this.lit) {
        this.fuse -= dt;
        if (this.fuse <= 0) { this.detonate(game); return; }
      } else if (d < this.radius + p.radius + 6) {
        this.lit = true;
        this.fuse = this.def.suicide.fuse;
        game.audio.telegraph('red');
      }
    }

    if (this.stun > 0 || this.stagger > 0) {
      // staggered: no steering, just slide
    } else if (!this.aggro) {
      // Idle drift keeps rooms feeling alive before you're noticed.
      if (this.stateT > 1.6) { this.moveAngle = U.rand(0, Math.PI * 2); this.stateT = 0; }
      ax = Math.cos(this.moveAngle) * this.speed * 0.22;
      ay = Math.sin(this.moveAngle) * this.speed * 0.22;
    } else {
      const target = (focus !== p) ? focus : (canSee ? p : (this.lastSeen || p));
      const ang = U.angle(this.x, this.y, target.x, target.y);

      switch (this.def_ai_override || this.def.ai) {
        case 'chase': {
          ax = Math.cos(ang) * this.speed;
          ay = Math.sin(ang) * this.speed;
          break;
        }
        case 'erratic': {
          this.wobble += dt * 7;
          const w = ang + Math.sin(this.wobble) * 0.85;
          ax = Math.cos(w) * this.speed;
          ay = Math.sin(w) * this.speed;
          break;
        }
        case 'ranged': {
          // Archers hold a lane and strafe; they want you at arm's length.
          const want = 250;
          const drift = d < want - 60 ? -1 : d > want + 60 ? 1 : 0;
          const strafe = ang + Math.PI / 2 * (Math.sin(this.wobble += dt * 1.4) > 0 ? 1 : -1);
          ax = Math.cos(ang) * this.speed * drift + Math.cos(strafe) * this.speed * 0.55;
          ay = Math.sin(ang) * this.speed * drift + Math.sin(strafe) * this.speed * 0.55;
          break;
        }
        case 'charger':
        case 'phase': {
          ax = Math.cos(ang) * this.speed;
          ay = Math.sin(ang) * this.speed;
          break;
        }
        case 'boss': {
          const r = this.bossUpdate(dt, game, ang, d);
          ax = r.ax; ay = r.ay;
          break;
        }
      }

      if (canSee || focus !== p) this.tryAttack(game, ang, d, focus);
    }

    this.applySeparation(game, (v) => { ax += v.x; ay += v.y; });
    this.integrate(dt, game, ax, ay);
  }

  // Keeps packs from stacking into one blob. Neighbours only — this was the
  // worst O(n^2) loop in the game before the spatial hash.
  applySeparation(game, add) {
    const v = this._sep || (this._sep = { x: 0, y: 0 });
    v.x = 0; v.y = 0;
    for (const o of game.enemyHash.query(this.x, this.y, this.radius + 48, this._q)) {
      if (o === this || o.dead) continue;
      const dd = U.dist2(this.x, this.y, o.x, o.y);
      const min = this.radius + o.radius;
      if (dd < min * min && dd > 0.01) {
        const dl = Math.sqrt(dd);
        const push = (min - dl) / min;
        v.x -= ((o.x - this.x) / dl) * push * this.speed * 1.6;
        v.y -= ((o.y - this.y) / dl) * push * this.speed * 1.6;
      }
    }
    add(v);
  }

  integrate(dt, game, ax, ay) {
    // Rooted enemies keep swinging but cannot close; chilled ones crawl.
    if (this.root > 0) { ax = 0; ay = 0; }
    else if (this.chill > 0) { ax *= 0.45; ay *= 0.45; }
    this.vx = U.damp(this.vx, ax, this.def.boss ? 0.18 : 0.24, dt);
    this.vy = U.damp(this.vy, ay, this.def.boss ? 0.18 : 0.24, dt);
    if (this.def.ghost) {
      // Wraiths drift through stone but are shoved back inside the map bounds.
      this.x = U.clamp(this.x + this.vx * dt, TILE, (game.dungeon.w - 1) * TILE);
      this.y = U.clamp(this.y + this.vy * dt, TILE, (game.dungeon.h - 1) * TILE);
    } else {
      moveWithCollision(this, this.vx * dt, this.vy * dt, game.dungeon);
    }
  }

  /* ---------------- telegraphed attacks ---------------- */

  // Prefer a taunting minion, but only if it is meaningfully nearer, so the
  // player can still be reached when they walk past the wall.
  pickFocus(game, p, distToPlayer) {
    if (!game.minions || !game.minions.length) return p;
    let best = p, bestD = distToPlayer * 0.85;
    for (const m of game.minions) {
      if (m.dead || !m.taunt) continue;
      const d = U.dist(this.x, this.y, m.x, m.y);
      if (d < bestD && d < 260) { bestD = d; best = m; }
    }
    return best;
  }

  tryAttack(game, ang, d, focus) {
    if (this.atk || !this.canAct() || !this.def.attacks) return;
    const ready = this.def.attacks.filter(a =>
      (this.atkCds[a.id] || 0) <= 0 &&
      d <= a.range + this.radius &&
      d >= (a.minRange || 0));
    if (!ready.length) return;
    // Prefer the unblockable when it is available: it should feel like a
    // punish for standing still, not a coin flip.
    const red = ready.filter(a => a.kind === 'red');
    const def = red.length && U.chance(0.55) ? U.pick(red) : U.pick(ready);
    this.atk = { def, t: 0, phase: 'wind', angle: ang, fired: false, hit: false, target: focus || game.player };
    game.audio.telegraph(def.kind);
  }

  updateAttack(dt, game, p) {
    const a = this.atk;
    const def = a.def;
    a.t += dt;
    let ax = 0, ay = 0;

    if (a.t < def.wind) {
      a.phase = 'wind';
      // Track the player during the wind-up, but sluggishly, so committing
      // to a direction is still a mistake the player can exploit.
      const want = U.angle(this.x, this.y, p.x, p.y);
      a.angle += U.clamp(U.angleDiff(a.angle, want), -2.2 * dt, 2.2 * dt);
      ax = Math.cos(a.angle) * this.speed * 0.15;
      ay = Math.sin(a.angle) * this.speed * 0.15;
    } else if (a.t < def.wind + def.active) {
      a.phase = 'active';
      if (!a.fired) { a.fired = true; this.fireAttack(game, a, p); }
      if (def.shape === 'charge') {
        ax = Math.cos(a.angle) * def.chargeSpeed;
        ay = Math.sin(a.angle) * def.chargeSpeed;
        // A charge connects on contact rather than at a fixed instant.
        if (!a.hit && U.dist(this.x, this.y, p.x, p.y) < this.radius + p.radius + 4) {
          a.hit = true;
          this.landHit(game, p, def);
        }
      } else if (def.lunge) {
        ax = Math.cos(a.angle) * def.lunge;
        ay = Math.sin(a.angle) * def.lunge;
      }
    } else if (a.t < def.wind + def.active + def.recover) {
      a.phase = 'recover';
    } else {
      this.atkCds[def.id] = def.cd * U.rand(0.85, 1.2);
      this.atk = null;
    }
    return { ax, ay };
  }

  fireAttack(game, a, p) {
    const def = a.def;
    if (def.shape === 'shot') {
      this.shoot(game, a.angle, {
        damage: def.damage, ...def.shot,
      }, 1, def.kind);
      return;
    }
    if (def.shape === 'impact') {
      // Lobbed where the target stands now — walking is the answer.
      game.impacts.push({
        x: p.x, y: p.y, t: 0, delay: def.impactDelay,
        radius: def.impactRadius, color: '#c48ade',
        aoeDamage: def.damage * this.dmgScale, hostile: true, source: this,
      });
      game.audio.cast('earth', false);
      return;
    }
    if (def.shape === 'melee') {
      const d = U.dist(this.x, this.y, p.x, p.y);
      if (d > def.reach + p.radius) return;
      const da = Math.abs(U.angleDiff(a.angle, U.angle(this.x, this.y, p.x, p.y)));
      if (da > def.arc / 2) return;
      this.landHit(game, p, def);
    }
    // 'charge' resolves on contact inside updateAttack instead.
  }

  landHit(game, p, def) {
    // Read the angle first: a successful parry staggers us inside takeHit,
    // which clears `this.atk` before we get back here.
    const angle = this.atk ? this.atk.angle : U.angle(this.x, this.y, p.x, p.y);
    const result = p.takeHit(def.damage * this.dmgScale, game, {
      x: this.x, y: this.y, kind: def.kind, source: this,
    });
    game.fx.spark(this.x + Math.cos(angle) * this.radius,
      this.y + Math.sin(angle) * this.radius, {
      count: 8, color: def.kind === 'red' ? ['#ff6b52', '#ffb27a'] : ['#cfe4ff', '#ffffff'],
      dir: angle, spread: 0.8, speedMax: 190, lifeMax: 0.35,
    });
    return result;   // game.onParry already staggered us; don't do it twice
  }

  shoot(game, angle, shot, speedMul = 1, kind = 'blue') {
    game.projectiles.push(new Projectile({
      x: this.x + Math.cos(angle) * (this.radius + 4),
      y: this.y + Math.sin(angle) * (this.radius + 4),
      vx: Math.cos(angle) * shot.speed * speedMul,
      vy: Math.sin(angle) * shot.speed * speedMul,
      damage: shot.damage * (1 + this.tier * 0.22),
      life: 3, radius: shot.radius, color: shot.color,
      homing: shot.homing || 0, owner: 'enemy',
      pierce: !!shot.pierce, leaves: shot.leaves || null,
      kind, shooter: this,
    }));
    game.fx.spark(this.x, this.y, { count: 4, color: shot.color, dir: angle, spread: 0.4, speedMax: 110, lifeMax: 0.2 });
  }

  bossUpdate(dt, game, ang, d) {
    const frac = this.hp / this.maxHp;
    const newPhase = frac > 0.62 ? 1 : frac > 0.3 ? 2 : 3;
    if (newPhase !== this.phase) {
      this.phase = newPhase;
      this.state = 'idle'; this.stateT = 0; this.shotCd = 1.2;
      game.fx.ring(this.x, this.y, this.radius * 1.4, '#ff8a5c', 46);
      game.fx.addShake(16);
      game.toast(`The Warden ${newPhase === 2 ? 'roars and calls its dead' : 'burns with hollow fire'}`);
    }

    let ax = 0, ay = 0;

    if (this.state === 'slamWind') {
      if (this.stateT > 0.7) {
        this.state = 'idle'; this.stateT = 0;
        game.fx.ring(this.x, this.y, 120, '#ff8a5c', 40);
        game.fx.addShake(14);
        const bursts = this.phase === 3 ? 20 : 12;
        for (let i = 0; i < bursts; i++) {
          this.shoot(game, (i / bursts) * Math.PI * 2 + this.stateT, { damage: 12, speed: 250, radius: 6, color: '#ff9a6a' });
        }
        // The slam is unblockable — get out of the circle.
        if (U.dist(this.x, this.y, game.player.x, game.player.y) < 150) {
          game.player.takeHit(22 * this.dmgScale, game, {
            x: this.x, y: this.y, kind: 'red', source: this,
          });
        }
      }
    } else if (this.state === 'chargeWind') {
      if (this.stateT > 0.55) { this.state = 'charging'; this.stateT = 0; this.chargeAngle = ang; }
    } else if (this.state === 'charging') {
      ax = Math.cos(this.chargeAngle) * this.speed * 6;
      ay = Math.sin(this.chargeAngle) * this.speed * 6;
      // Body-check on the way through: also unblockable, dodge it.
      if (this.hitCd <= 0 && U.dist(this.x, this.y, game.player.x, game.player.y) < this.radius + game.player.radius + 6) {
        game.player.takeHit(24 * this.dmgScale, game, { x: this.x, y: this.y, kind: 'red', source: this });
        this.hitCd = 0.8;
      }
      if (this.stateT > 0.7) { this.state = 'idle'; this.stateT = 0; }
    } else if (this.state === 'spiral') {
      this.spiralA = (this.spiralA || 0) + dt * 7;
      if (Math.random() < dt * 22) {
        for (let k = 0; k < 3; k++) {
          this.shoot(game, this.spiralA + (k * Math.PI * 2) / 3, { damage: 10, speed: 220, radius: 5, color: '#ffb27a' });
        }
      }
      if (this.stateT > 2.4) { this.state = 'idle'; this.stateT = 0; }
    } else {
      ax = Math.cos(ang) * this.speed;
      ay = Math.sin(ang) * this.speed;
      const gap = (this.phase === 3 ? 1.5 : this.phase === 2 ? 2.1 : 2.8) * (this.def.palette ? 0.85 : 1);
      if (this.stateT > gap) {
        this.stateT = 0;
        const moves = ['slamWind', 'chargeWind'];
        if (this.phase >= 2) moves.push('summon');
        if (this.phase >= 3) moves.push('spiral', 'spiral');
        /* Each Update 2.0 boss weights the shared pool differently, which is
           what makes them feel distinct without three separate brains:
             sun    — relentless ranged pressure, the "predicament"
             flora  — summons and area denial, slow and rooted
             fist   — almost nothing but charges. Pure devastation. */
        if (this.def.palette === 'sun') moves.push('spiral', 'slamWind');
        else if (this.def.palette === 'flora') moves.push('summon', 'summon', 'slamWind');
        else if (this.def.palette === 'fist') moves.push('chargeWind', 'chargeWind', 'chargeWind');
        const pickMove = d < 170 ? 'slamWind' : U.pick(moves);
        if (pickMove === 'summon') {
          for (let i = 0; i < (this.phase === 3 ? 4 : 3); i++) {
            const a = U.rand(0, Math.PI * 2);
            game.spawnEnemy(U.pick(['bat', 'skeleton', 'slime']),
              this.x + Math.cos(a) * 90, this.y + Math.sin(a) * 90, this.tier, false);
          }
          game.fx.ring(this.x, this.y, 90, '#b58ad6', 30);
        } else {
          this.state = pickMove;
        }
      }
    }
    return { ax, ay };
  }
}

/* ================================================================= */
/* PICKUPS                                                           */
/* ================================================================= */

const PICKUP_DEF = {
  gold: { color: '#e2b34a', size: 5, label: '◈' },
  heart: { color: '#e1553c', size: 7, label: '❤' },
  energy: { color: '#4fd0a8', size: 6, label: '◆' },
  shard: { color: '#b58ad6', size: 7, label: '✦' },
};

class Pickup {
  constructor(type, x, y, value = 1) {
    this.type = type;
    this.def = PICKUP_DEF[type];
    this.x = x; this.y = y;
    this.value = value;
    const a = U.rand(0, Math.PI * 2);
    const s = U.rand(40, 150);
    this.vx = Math.cos(a) * s;
    this.vy = Math.sin(a) * s;
    this.life = 0;
    this.dead = false;
    this.radius = 7;
  }

  update(dt, game) {
    this.life += dt;
    const p = game.player;
    const d = U.dist(this.x, this.y, p.x, p.y);

    if (this.life > 0.35 && d < 120) {
      const a = U.angle(this.x, this.y, p.x, p.y);
      const pull = 620 * (1 - d / 120) + 90;
      this.vx = U.damp(this.vx, Math.cos(a) * pull, 0.3, dt);
      this.vy = U.damp(this.vy, Math.sin(a) * pull, 0.3, dt);
    } else {
      this.vx *= Math.pow(0.9, dt * 60);
      this.vy *= Math.pow(0.9, dt * 60);
    }

    moveWithCollision(this, this.vx * dt, this.vy * dt, game.dungeon);

    if (d < p.radius + 8) {
      this.dead = true;
      game.collect(this);
    }
  }

  draw(ctx) {
    const y = this.y + Math.sin(this.life * 5) * 2.5;
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = this.def.color;
    ctx.fillStyle = this.def.color;
    ctx.beginPath();
    ctx.arc(this.x, y, this.def.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x - this.def.size * 0.3, y - this.def.size * 0.3, this.def.size * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
