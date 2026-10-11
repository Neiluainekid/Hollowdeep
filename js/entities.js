/* Player, enemies, projectiles, pickups. */
'use strict';

/* ---------------- shared tile collision ---------------- */

/* Update 3.0 fix: only tiles on the *leading* side of the body can stop it.
   The old loop resolved against every solid tile in the bounding box, so a
   body that started overlapping a wall behind it (a shrine guardian dropped
   against the rock, say) was "pushed out" to the far side of that wall on its
   first step — which is exactly the no-clip players saw on red-shrine spawns. */
function resolveAxis(e, dun, axis, delta) {
  if (delta === 0) return;
  const r = e.radius;
  const minTx = Math.floor((e.x - r) / TILE), maxTx = Math.floor((e.x + r) / TILE);
  const minTy = Math.floor((e.y - r) / TILE), maxTy = Math.floor((e.y + r) / TILE);
  // Judge "ahead" from where the centre was before this step, so a fast dash
  // that carries the centre into a thin wall is still caught by it.
  const px = axis === 'x' ? e.x - delta : e.x;
  const py = axis === 'y' ? e.y - delta : e.y;
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!dun.isSolidTile(tx, ty)) continue;
      if (axis === 'x') {
        // A tile whose near face was behind our centre is not in our way.
        if (delta > 0 ? tx * TILE < px : (tx + 1) * TILE > px) continue;
        e.x = delta > 0 ? tx * TILE - r - 0.01 : (tx + 1) * TILE + r + 0.01;
      } else {
        if (delta > 0 ? ty * TILE < py : (ty + 1) * TILE > py) continue;
        e.y = delta > 0 ? ty * TILE - r - 0.01 : (ty + 1) * TILE + r + 0.01;
      }
    }
  }
}

/* True when a body of radius `r` centred at (x, y) overlaps no solid tile. */
function bodyFits(dun, x, y, r) {
  const minTx = Math.floor((x - r) / TILE), maxTx = Math.floor((x + r) / TILE);
  const minTy = Math.floor((y - r) / TILE), maxTy = Math.floor((y + r) / TILE);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) if (dun.isSolidTile(tx, ty)) return false;
  }
  return true;
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
    this.dashStrikeDmg = 0;
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

    /* ---- Update 3.0: gear ----
       Accessories write into these; the getters below fold them in. */
    this.bag = [];                       // accessory ids, unequipped
    this.equip = Gear.blankEquip();
    this.equipDef = 0;
    this.equipSpeed = 0;
    this.equipDmg = 0;
    this.critBonus = 0;
    this.hpRegen = 0;
    this.xpMul = 1;
    this.parryMul = 1;
    this.thorns = 0;
    this.luck = 0;
    this.jaronaNecklace = false;
    this.curse = null;                   // Cursed Totem state
    this.manaLockT = 0;                  // mana pinned at zero (Bloat, Earthquake)
    this.hpCap = null;                   // Bloat: health held at 65% for 5s
    this.dashLockT = 0;                  // Double Sword slice: dash disabled
    this.roll = null;                    // Tanker ricochet roll
    this.dashStrikeDmg = 0;              // heavy dashes that cut a lane

    /* ---- Update 4.0 ---- */
    this.hidden = false;                 // Ninja: unseen in Ambush Mode
    this.hideT = 0;                      // seconds since the last attack
    this.rehideMul = 1;
    this.ambushMul = 1;
    this.smokeMul = 1;
    this.rootT = 0;                      // held in place by Flowery's vines
    this.prejudgedT = 0;                 // Judgement's mark: +30% damage taken
    this.ward = 0;                       // the Glass Saint's ward: hits absorbed
    this.energyDebt = null;              // a missed ricochet: 100 stamina, back in 1s
    this.bossDmg = 0;                    // ring: extra damage to bosses/minibosses
    this.phoenix = false;                // ring: survive one killing blow per map
    this.phoenixUsed = false;
    this.minionCap = 0;
    this.mashMul = 1;

    this._q = [];   // reusable scratch buffer for spatial queries
  }

  /* ---------------- Update 3.0: timed debuffs ---------------- */

  // The Cursed Totem: half your HP, mana and stamina, for as long as you wear
  // it and four seconds after.
  applyCurse() {
    if (this.curse) { this.curse.linger = -1; return; }   // re-worn mid-linger
    const c = {
      hp: Math.round(this.maxHp * 0.5), mana: this.maxMana * 0.5,
      en: this.maxEnergy * 0.5, linger: -1,
    };
    this.maxHp -= c.hp; this.maxMana -= c.mana; this.maxEnergy -= c.en;
    this.hp = Math.min(this.hp, this.maxHp);
    this.mana = Math.min(this.mana, this.maxMana);
    this.energy = Math.min(this.energy, this.maxEnergy);
    this.curse = c;
  }

  liftCurse() { if (this.curse) this.curse.linger = 4; }

  // Health pinned to a fraction of max; whatever was trimmed comes back after.
  capHp(frac, secs) {
    if (this.hpCap) { this.hpCap.t = Math.max(this.hpCap.t, secs); return; }
    const cap = this.maxHp * frac;
    const bank = Math.max(0, this.hp - cap);
    this.hp -= bank;
    this.hpCap = { t: secs, frac, bank };
  }

  lockMana(secs) {
    if (!this.usesMana) return;
    this.mana = 0;
    this.manaLockT = Math.max(this.manaLockT, secs);
  }

  updateTimedEffects(dt, game) {
    if (this.curse && this.curse.linger > 0) {
      this.curse.linger -= dt;
      if (this.curse.linger <= 0) {
        const c = this.curse;
        this.maxHp += c.hp; this.maxMana += c.mana; this.maxEnergy += c.en;
        this.curse = null;
        game.fx.text(this.x, this.y - 40, 'the curse lifts', '#ffd479', 15);
      }
    }
    if (this.hpCap) {
      this.hpCap.t -= dt;
      this.hp = Math.min(this.hp, this.maxHp * this.hpCap.frac);
      if (this.hpCap.t <= 0) {
        const back = this.heal(this.hpCap.bank);
        this.hpCap = null;
        if (back > 0) game.fx.text(this.x, this.y - 34, `+${Math.round(back)}`, '#6fbf73', 14);
      }
    }
    if (this.manaLockT > 0) { this.manaLockT -= dt; this.mana = 0; }
    this.dashLockT = Math.max(0, this.dashLockT - dt);
    if (this.hpRegen > 0) this.heal(this.hpRegen * dt);
    this.rootT = Math.max(0, this.rootT - dt);
    this.prejudgedT = Math.max(0, this.prejudgedT - dt);
    // A missed ricochet takes 100 stamina for one second, then gives it back.
    if (this.energyDebt) {
      this.energyDebt.t -= dt;
      if (this.energyDebt.t <= 0) {
        this.energy = Math.min(this.maxEnergy, this.energy + this.energyDebt.amount);
        this.energyDebt = null;
      }
    }
  }

  /* ---------------- Update 4.0: the Ninja's Ambush Mode ----------------
     In Ambush Mode you are unseen: enemies lose track of you and wander.
     Attacking gives you away; a few quiet seconds later you vanish again. */

  isUnseen() { return !!this.hidden; }

  updateStealth(dt, game) {
    if (!this.cls.ambush) return;
    if (!this.slotDef || this.slotDef.id !== 'ambush') {
      this.hidden = false;
      this.hideT = 0;
      return;
    }
    if (this.hidden) return;
    this.hideT += dt;
    if (this.hideT >= this.cls.ambush.rehide * this.rehideMul) this.vanish(game);
  }

  vanish(game) {
    this.hidden = true;
    for (const e of game.enemies) {
      if (e.dead || e.isHeavyweight || e.neutral) continue;
      if (U.dist2(e.x, e.y, this.x, this.y) < 64 * 64) continue;
      e.aggro = false;
      e.lastSeen = null;
      // A swing still winding up at you loses its target.
      if (e.atk && e.atk.target === this && !e.atk.fired) e.atk = null;
    }
    game.fx.spark(this.x, this.y, { count: 14, color: ['#9b8cff', '#4a4060'], speedMax: 110, lifeMax: 0.5, glow: false });
    game.fx.text(this.x, this.y - 40, 'UNSEEN', '#9b8cff', 14);
    game.audio.vanish();
  }

  reveal() {
    this.hidden = false;
    this.hideT = 0;
  }

  // The bomb: a cloud that leaves everything in it dizzy enough to attack
  // its own side. Ten seconds between bombs.
  throwSmoke(game) {
    const sm = this.cls.smoke;
    const cd = this.minionCds.smoke || 0;
    if (cd > 0) {
      game.fx.text(this.x, this.y - 30, `smoke in ${Math.ceil(cd)}s`, '#8fa0b8', 12);
      return;
    }
    this.minionCds.smoke = Math.max(3, sm.cooldown - (this.smokeCdCut || 0));
    const range = Math.min(U.dist(this.x, this.y, game.mouseWorld.x, game.mouseWorld.y), 360);
    let tx = this.x + Math.cos(this.aim) * range, ty = this.y + Math.sin(this.aim) * range;
    // Never inside the rock: walk it back toward you until it lands on floor.
    for (let k = 0; k < 12 && game.dungeon.isSolidAt(tx, ty); k++) {
      tx = U.lerp(tx, this.x, 0.25); ty = U.lerp(ty, this.y, 0.25);
    }
    game.zones.push(new Zone('smoke', tx, ty, {
      radius: sm.radius * this.smokeMul, life: sm.life + (this.smokeLife || 0),
      tickEvery: 0.5, damage: sm.poison * 0.5, power: this.power, dizzy: sm.dizzy,
    }));
    game.fx.spark(tx, ty, { count: 30, color: ['#7a7090', '#b8b0cc', '#9b8cff'], speedMax: 220, lifeMax: 0.9, sizeMax: 6, glow: false });
    game.fx.text(tx, ty - 30, 'SMOKE BOMB', '#b8b0cc', 15);
    game.audio.smokeBomb();
  }

  get speedMul() {
    const mode = this.slotDef && this.slotDef.speedMul ? this.slotDef.speedMul : 1;
    return this.moveMul * (1 + this.equipSpeed) * mode;
  }

  // Loadout modes can carry a flat health bonus (the Double Sword's +10).
  applySlotBonus(def, sign) {
    if (!def || !def.hpBonus) return;
    this.maxHp += def.hpBonus * sign;
    if (sign > 0) this.hp += def.hpBonus;
    this.hp = Math.min(this.hp, this.maxHp);
  }

  isParrying() { return this.parryT > 0; }

  // Bracing (charging the heavy) is what raises the Tanker's shield.
  isBlocking() { return !!this.cls.blocksWhileCharging && this.charging; }

  /* ---------------- caster support ---------------- */

  spendMana(n) {
    if (this.mana < n || this.manaLockT > 0) {
      this._noMana = 0.5;
      return false;
    }
    this.mana -= n;
    return true;
  }

  get loadout() { return this.cls.loadout || null; }
  // The Modifier slot's effect, or null (Update 4.0).
  get modifier() {
    const id = this.equip.modifier;
    const item = id ? Gear.get(id) : null;
    return item ? item.mod : null;
  }
  get slotDef() { return this.loadout ? Seq.get(this.loadout.options, this.slot) : null; }

  cycleSlot(dir = 1) {
    if (!this.loadout) return null;
    return this.setSlot(Seq.wrapTo(this.loadout.options, this.slot + dir));
  }

  setSlot(n) {
    if (!this.loadout) return null;
    const before = this.slotDef;
    this.slot = Seq.clampTo(this.loadout.options, n);
    if (this.slotDef !== before) {
      this.applySlotBonus(before, -1);
      this.applySlotBonus(this.slotDef, +1);
      this.roll = null;
      // Into Ambush Mode: vanish on the next step, not after the usual wait.
      if (this.slotDef.id === 'ambush') this.hideT = 99;
    }
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
      fromPlayer: true,
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
    const cap = this.cls.maxMinions + this.minionCap;
    if (live.length >= cap) {
      game.fx.text(this.x, this.y - 30, `${cap} is the limit`, '#8fa0b8', 12);
      return;
    }
    // The brute is a wall, not a swarm: only one may stand at a time.
    if (def.id === 'brute' && live.some(m => m.kind === 'brute')) {
      game.fx.text(this.x, this.y - 30, 'one brute at a time', '#8fa0b8', 12);
      return;
    }
    if (!this.spendMana(def.cost * this.costMul)) return;

    /* Update 3.0: the Bloat's blast is huge now, and it costs you for it —
       every drop of mana gone for 5 seconds, and your health held at 65%. */
    if (def.id === 'bomber') {
      this.lockMana(5);
      this.capHp(0.65, 5);
      game.fx.text(this.x, this.y - 44, 'THE BLOAT FEEDS ON YOU', '#c4e86b', 14);
      game.fx.addFlash('#5c6b2a', 0.25);
    }

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
    // A thumb on glass is less precise than a key: touch gets a 25% wider window.
    const touchBonus = game.touch && game.touch.active ? 1.25 : 1;
    // Hard mode shaves the window down: hell does not wait for you.
    this.parryT = PARRY.window * this.parryMul * touchBonus * (game.hard ? 0.85 : 1);
    this.parryCd = PARRY.cdWhiff + this.parryT;
    this.deflectPebbles(game);
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
    // A hexed attacker hits softer (the Hex modifier).
    if (opts.source && opts.source.hexT > 0) amount *= 1 - (opts.source.hexAmt || 0);

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

    /* Update 3.0: against a boss (and John Space's trial) only HEAVY attacks
       can be parried. Their light attacks pass straight through a parry —
       you dodge those, and save the parry for the gold telegraph. */
    const src = opts.source;
    const heavyOnly = !!(src && src.def && (src.def.boss || src.def.big || src.trial));

    if (this.isParrying()) {
      const parryable = kind === 'heavy' || (kind === 'blue' && !heavyOnly);
      if (parryable) {
        game.onParry(this, opts);
        return 'parry';
      }
      this.parryT = 0;
      if (kind === 'blue') {
        // A light attack from a boss: the parry simply does not catch it.
        this.parryCd = PARRY.cdWhiff;
        game.fx.text(this.x, this.y - 46, 'TOO LIGHT — PARRY HEAVIES', '#ffd479', 13);
      } else {
        // Red is unblockable. Reading it wrong costs you the window and the hit.
        this.parryCd = PARRY.cdRedFail;
        game.fx.text(this.x, this.y - 46, 'UNBLOCKABLE', '#ff6b52', 15);
      }
    }

    // The Glass Saint's mirror ward swallows one hit whole and throws some back.
    if (this.ward > 0) {
      this.ward--;
      this.iframes = Math.max(this.iframes, 0.3);
      game.fx.ring(this.x, this.y, 30, '#cfe8ff', 26);
      game.fx.text(this.x, this.y - 46, 'WARDED', '#cfe8ff', 15);
      game.audio.ward();
      if (src && src.takeDamage && !src.dead && !src.neutral && !src.trial) {
        src.takeDamage(40, game, this.x, this.y, 200, false);
      }
      return 'dodge';
    }

    this.takeDamage(amount, game, opts.x, opts.y);

    // Thornwreath. Never on John Space while he is still deciding about you —
    // thorns are you hitting him back, and that ends the arrangement.
    if (this.thorns > 0 && src && src.takeDamage && !src.dead && !src.neutral && !src.trial) {
      src.takeDamage(this.thorns, game, this.x, this.y, 0, false);
    }
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
      bag: this.bag.slice(),
      equip: { ...this.equip },
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

    // Gear is replayed exactly like perks: by id, through the same apply.
    p.bag = (data.bag || []).filter(id => Gear.get(id));
    for (const [slot, id] of Object.entries(data.equip || {})) {
      if (!id || !Gear.get(id) || Gear.slotOf(id) !== slot) continue;
      p.bag.push(id);
      Gear.equip(p, p, id);
    }
    if (p.loadout) p.setSlot(data.slot || Seq.FIRST);

    p.xp = data.xp || 0;
    p.xpNext = xpNeeded(p.level);
    p.hp = U.clamp(data.hp ?? p.maxHp, 1, p.maxHp);
    p.energy = U.clamp(data.energy ?? p.maxEnergy, 0, p.maxEnergy);
    p.mana = U.clamp(data.mana ?? p.maxMana, 0, p.maxMana);
    return p;
  }

  get tier() { return Seq.get(this.cls.tiers, Seq.clampTo(this.cls.tiers, this.weaponTier)); }
  get weaponName() { return this.tier.weapon; }
  get power() {
    return this.dmgMul * (1 + (this.weaponLevel - 1) * 0.16) * this.tier.dmgMul * (1 + this.equipDmg);
  }
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
    this.xp += n * this.xpMul;
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
    if (this.prejudgedT > 0) n *= 1.3;       // Judgement's Prejudice
    if (this.hidden) this.reveal();          // getting hit gives a Ninja away
    let dr = this.dr;
    if (this.wardedByMinions && game.minions.some(m => !m.dead)) dr = 1 - (1 - dr) * 0.86;
    const stanceDr = this.slotDef && this.slotDef.dr ? this.slotDef.dr : 0;
    if (stanceDr) dr = 1 - (1 - dr) * (1 - stanceDr);
    if (this.equipDef) dr = 1 - (1 - dr) * (1 - U.clamp(this.equipDef, 0, 0.6));
    const dmg = Math.max(1, Math.round(n * (1 - dr)));
    this.hp -= dmg;
    // Getting hit knocks a Tanker out of a ricochet roll.
    if (this.roll) this.endRoll(game, 'interrupted');
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
    if (this.hp <= 0) {
      // The Phoenix Feather: once per map, a killing blow leaves you standing.
      if (this.phoenix && !this.phoenixUsed) {
        this.phoenixUsed = true;
        this.hp = Math.max(1, Math.round(this.maxHp * 0.3));
        this.iframes = 1.2;
        game.fx.ring(this.x, this.y, 60, '#ffb347', 44);
        game.fx.text(this.x, this.y - 50, 'PHOENIX', '#ffb347', 22);
        game.fx.addFlash('#ffb347', 0.5);
        game.audio.freeze();
        return;
      }
      this.hp = 0; this.dead = true; game.onPlayerDeath();
    }
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
    this.updateTimedEffects(dt, game);
    this.updateStealth(dt, game);
    if (this.usesMana && this.manaLockT <= 0) {
      this.mana = Math.min(this.maxMana, this.mana + this.cls.manaRegen * this.regenMul * dt);
    }
    for (const k in this.minionCds) this.minionCds[k] = Math.max(0, this.minionCds[k] - dt);
    // Stamina owed to a missed ricochet does not regenerate back early.
    if (!this.energyDebt) this.energy = Math.min(this.maxEnergy, this.energy + this.cls.energyRegen * this.regenMul * dt);

    this.aim = U.angle(this.x, this.y, game.mouseWorld.x, game.mouseWorld.y);

    // --- movement ---
    let ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let iy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const len = Math.hypot(ix, iy);
    if (len > 0) { ix /= len; iy /= len; this.facing = Math.atan2(iy, ix); }

    if (this.roll) {
      this.updateRoll(dt, game);
    } else if (this.dashT > 0) {
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
      if (this.dashDamage > 0 || this.dashStrikeDmg > 0) this.dashStrike(game);
      if (this.cls.id === 'ranger') this.deflectPebbles(game);
    } else {
      let speed = this.cls.speed * this.speedMul;
      if (game.dungeon.isWaterAt(this.x, this.y)) speed *= 0.62;
      if (this.rootT > 0) speed = 0;
      if (this.charging) speed *= 0.5;
      if (this.swing && this.swing.t < this.swing.wind + 0.06) speed *= 0.45;
      const target = { x: ix * speed, y: iy * speed };
      this.vx = U.damp(this.vx, target.x, 0.35, dt);
      this.vy = U.damp(this.vy, target.y, 0.35, dt);
    }

    if (!this.roll) moveWithCollision(this, this.vx * dt, this.vy * dt, game.dungeon);
    if (len > 0 || this.dashT > 0 || this.roll) this.bob += dt * (this.dashT > 0 || this.roll ? 22 : 11);

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
      if (this.dashLockT > 0) {
        game.fx.text(this.x, this.y - 30, `dash locked ${this.dashLockT.toFixed(1)}s`, '#8fa0b8', 12);
      } else if (this.mobCd <= 0 && this.dashT <= 0 && !this.roll && this.energy >= cost) {
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
    // Mid-roll, M1 is the ricochet timing button, not an attack.
    if (this.roll) {
      if (input.lPressed) this.rollPress(game);
      input.lPressed = false;
      input.rPressed = false;
      if (this.swing) { this.swing.t += dt; if (this.swing.t >= this.swing.dur) this.swing = null; }
      return;
    }
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
    if (this.cls.ambush) this.reveal();     // striking gives you away
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
    if (this.cls.ambush) this.reveal();
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
      let crit = U.chance(0.12 + this.critBonus);
      if (s.ambush) {
        // Struck from hiding: a guaranteed critical of 100.
        dmg = Math.max(dmg, this.cls.ambush.damage * this.power * this.ambushMul);
        crit = true;
        game.fx.text(e.x, e.y - e.radius - 30, 'AMBUSH!', '#b8a8ff', 20);
        game.audio.ambush();
        game.impactFreeze(0.05);
      } else if (crit) dmg *= 1.7;
      e.takeDamage(dmg, game, this.x, this.y, s.knock, crit, 'player');
      if (s.stun > 0) e.stun = Math.max(e.stun, s.stun);
      if (s.fist && this.fistPoison && !e.dead) {
        e.poisonT = 3;
        e.poisonStacks = Math.max(1, e.poisonStacks || 0);
        e.poisonDps = Math.max(e.poisonDps || 0, this.fistPoison);
      }
      game.fx.addShake(s.heavy ? 5 : 2);
      game.audio.impact(s.heavy);
      if (s.impact) game.impactFreeze(0.05);   // heavy hits hold for a beat
    }
  }

  dashStrike(game) {
    // A Tanker's Heavy Dash trades on the shield, not on a perk.
    const shield = this.dashStrikeDmg || 0;
    const dmg = shield > 0 ? shield : this.dashDamage * this.power;
    for (const e of game.enemyHash.query(this.x, this.y, this.radius + 48, this._q)) {
      if (e.dead || this.dashHit.has(e)) continue;
      if (U.dist(this.x, this.y, e.x, e.y) > this.radius + e.radius + 6) continue;
      this.dashHit.add(e);
      e.takeDamage(dmg, game, this.x, this.y, shield > 0 ? 720 : 420, false, 'player');
      e.stun = Math.max(e.stun, shield > 0 ? 0.7 : 0.4);
      if (shield > 0) { game.impactFreeze(0.05); game.fx.addShake(8); }
      else game.fx.addShake(4);
    }
    if (shield > 0 && this.dashT <= 0) this.dashStrikeDmg = 0;
  }

  /* ---------------- Tanker ricochet roll — reworked in Update 4.0 ----------------
     The heavy launches a rolling dash. While you roll, MASH M1: every click
     fills the bounce bar, and the bar drains on its own. With the bar full,
     the next wall or enemy you meet throws you off in a blue shockwave and
     you keep rolling — the bar empties, so you mash again for the next one.
     Meet something with the bar short and the ricochet is missed: you lose
     100 stamina for one second. Roll into open air and it simply ends. */

  startRoll(game, power) {
    this.roll = {
      dir: this.aim, speed: 520, seg: 0, chain: 0,
      meter: 0, charged: false, flash: 0,
      dmg: 34 * power * this.power * this.heavyMul,
      wave: 46 * power * this.power * this.heavyMul,
    };
    this.charging = false;
    game.fx.ring(this.x, this.y, 22, '#4fd0a8', 18);
    game.fx.text(this.x, this.y - 40, 'MASH M1!', '#3dff7a', 14);
    game.audio.swordSwing(true);
  }

  endRoll(game, why) {
    if (!this.roll) return;
    if (why === 'interrupted') game.fx.text(this.x, this.y - 34, 'ROLL BROKEN', '#8fa0b8', 13);
    this.roll = null;
    this.vx *= 0.3; this.vy *= 0.3;
  }

  rollPress(game) {
    const r = this.roll;
    if (!r || r.charged) return;
    r.meter = Math.min(1, r.meter + 0.17 * this.mashMul);
    game.audio.mash(r.meter);
    if (r.meter >= 1) {
      r.charged = true;
      game.fx.ring(this.x, this.y, 20, '#3dff7a', 14);
      game.fx.text(this.x, this.y - 40, 'BOUNCE READY', '#3dff7a', 13);
    }
  }

  missRicochet(game) {
    const amount = Math.min(100, this.energy);
    this.energy -= amount;
    this.energyDebt = { amount, t: 1 };
    game.fx.text(this.x, this.y - 36, 'RICOCHET MISSED  -100', '#ffd479', 14);
    game.audio.bounceFail();
  }

  updateRoll(dt, game) {
    const r = this.roll;
    const dun = game.dungeon;
    r.seg += dt;
    r.flash = Math.max(0, r.flash - dt);
    if (!r.charged) r.meter = Math.max(0, r.meter - dt * 0.45);
    const cos = Math.cos(r.dir), sin = Math.sin(r.dir);

    // Roll.
    const want = r.speed * dt;
    const ox = this.x, oy = this.y;
    this.vx = cos * r.speed; this.vy = sin * r.speed;
    moveWithCollision(this, cos * want, sin * want, dun);
    const blockedX = Math.abs((this.x - ox) - cos * want) > 0.5;
    const blockedY = Math.abs((this.y - oy) - sin * want) > 0.5;
    if (Math.random() < dt * 30) {
      game.fx.spark(this.x, this.y, {
        count: 2, color: r.charged ? ['#3dff7a', '#dfe9f5'] : ['#8fa8c8', '#dfe9f5'],
        speedMax: 60, lifeMax: 0.3, sizeMax: 3,
      });
    }

    // Anything we are running into, in front of us.
    let touching = null, best = Infinity;
    for (const e of game.enemyHash.query(this.x, this.y, this.radius + 70, this._q)) {
      if (e.dead) continue;
      const gap = U.dist(this.x, this.y, e.x, e.y) - e.radius - this.radius;
      if (gap > 3 || gap >= best) continue;
      if (Math.abs(U.angleDiff(r.dir, U.angle(this.x, this.y, e.x, e.y))) > 1.2) continue;
      touching = e; best = gap;
    }

    if (!touching && !blockedX && !blockedY) {
      if (r.seg > 1.7) this.endRoll(game, 'spent');   // rolled into open air
      return;
    }

    // Contact. Whatever we hit takes the roll either way.
    if (touching) {
      touching.takeDamage(r.dmg, game, this.x, this.y, 420, false, 'player');
      touching.stun = Math.max(touching.stun, 0.5);
    }

    if (!r.charged) {
      game.fx.addShake(6);
      game.audio.impact(true);
      this.missRicochet(game);
      this.endRoll(game, 'bump');
      return;
    }

    // Full bar: a blue shockwave, and off we go again.
    r.chain++;
    r.charged = false;
    r.meter = 0;
    r.seg = 0;
    r.flash = 0.3;
    r.speed = Math.min(860, r.speed * 1.07);
    for (const e of game.enemyHash.query(this.x, this.y, 96, [])) {
      if (e.dead || U.dist(this.x, this.y, e.x, e.y) > 96 + e.radius) continue;
      e.takeDamage(r.wave, game, this.x, this.y, 520, false, 'player');
      e.stun = Math.max(e.stun, 0.6);
    }
    game.fx.ring(this.x, this.y, 52, '#4fa8ff', 30);
    game.fx.spark(this.x, this.y, {
      count: 22, color: ['#8fd4ff', '#ffffff', '#4fa8ff'], speedMax: 320, lifeMax: 0.5, sizeMax: 4,
    });
    game.fx.text(this.x, this.y - 40, r.chain > 1 ? `RICOCHET x${r.chain}` : 'RICOCHET', '#8fd4ff', 16);
    game.fx.addShake(9);
    game.impactFreeze(0.05);
    game.audio.parryHit();
    this.iframes = Math.max(this.iframes, 0.18);

    if (touching) {
      // Off the body, and toward the next victim if there is one.
      const next = game.enemyHash.nearest(this.x, this.y, 320,
        o => !o.dead && o !== touching && game.dungeon.lineOfSight(this.x, this.y, o.x, o.y));
      r.dir = next ? U.angle(this.x, this.y, next.x, next.y)
        : U.angle(touching.x, touching.y, this.x, this.y);
    } else {
      // Off the wall: reflect across whichever face stopped us.
      if (blockedX) r.dir = Math.PI - r.dir;
      if (blockedY) r.dir = -r.dir;
    }
  }

  /* ---------------- Update 3.0: slingshot deflect ----------------
     A pebble carrying the Ricochet buff can be caught again: dash into it
     (or open a parry next to it) and it is sent back out along your aim,
     much faster and harder. One deflect per pebble. */
  deflectPebbles(game) {
    if (this.cls.id !== 'ranger') return;
    for (const pr of game.projectiles) {
      if (pr.dead || pr.owner !== 'player' || !pr.sling || pr.deflected) continue;
      if (pr.ricochet <= 0 && !pr.bounced) continue;
      if (pr.age < 0.12) continue;
      if (U.dist(this.x, this.y, pr.x, pr.y) > this.radius + pr.radius + 26) continue;
      const sp = Math.hypot(pr.vx, pr.vy) * 1.9;
      pr.vx = Math.cos(this.aim) * sp;
      pr.vy = Math.sin(this.aim) * sp;
      pr.damage *= 1.6;
      pr.radius += 2;
      pr.life = Math.max(pr.life, 1.1);
      pr.hits.clear();
      pr.deflected = true;
      pr.color = '#ffd479';
      game.fx.ring(pr.x, pr.y, 18, '#ffd479', 14);
      game.fx.text(pr.x, pr.y - 18, 'DEFLECT', '#ffd479', 14);
      game.audio.parryHit();
    }
  }

  // Double Sword heavy: carve straight through a line of enemies.
  sliceThrough(game, power) {
    this.dashT = 0.3;
    this.dashDir = this.aim;
    this.iframes = Math.max(this.iframes, 0.32);
    this.dashHit.clear();
    this.dashStrikeDmg = 58 * power * this.power * this.heavyMul;
    this.dashLockT = 3;
    game.fx.ring(this.x, this.y, 26, '#ffe6b0', 20);
    game.fx.addShake(7);
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
      sling: !!cfg.sling,
      ricochet: cfg.pierce ? 0 : this.ricochet,
      owner: 'player',
      fromPlayer: true,
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
    this.age = (this.age || 0) + dt;
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
      /* Update 3.0: a Ricochet pebble also kicks off walls, spending one
         bounce — which is what brings it back within reach of a deflect. */
      if (this.sling && this.owner === 'player' && this.ricochet > 0) {
        const ox = this.x - this.vx * dt, oy = this.y - this.vy * dt;
        if (game.dungeon.isSolidAt(this.x, oy)) this.vx = -this.vx;
        if (game.dungeon.isSolidAt(ox, this.y)) this.vy = -this.vy;
        if (!game.dungeon.isSolidAt(this.x, oy) && !game.dungeon.isSolidAt(ox, this.y)) {
          this.vx = -this.vx; this.vy = -this.vy;
        }
        this.x = ox; this.y = oy;
        this.ricochet--;
        this.bounced = true;
        this.hits.clear();
        this.life = Math.max(this.life, 0.7);
        game.fx.spark(this.x, this.y, { count: 5, color: '#a9c6ff', speedMax: 110, lifeMax: 0.22 });
        return;
      }
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
        const crit = U.chance(0.1 + game.player.critBonus);
        if (crit) dmg *= 1.7;
        if (this.creditTo) e.lastHitBy = this.creditTo;   // companion shots
        e.takeDamage(dmg, game, this.x, this.y, this.knock, crit, this.fromPlayer ? 'player' : null);
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
            this.bounced = true;
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
          this.fromPlayer = true;
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
      if (!e.noExecute && U.chance(0.01)) {
        game.fx.text(e.x, e.y - 40, 'BRAIN-FREEZE', '#a9dcff', 20);
        game.fx.ring(e.x, e.y, 40, '#a9dcff', 30);
        game.fx.addShake(8);
        game.audio.freeze();
        e.takeDamage(e.hp + 9999, game, this.x, this.y, 0, false);
      }
    } else if (this.effect === 'fling') {
      const weak = e.hp / e.maxHp < 0.35;
      const liftable = weak && !e.elite && !e.isHeavyweight;
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
    if (this.style) { this.drawStyled(ctx); return; }
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

  /* Update 4.0: shots that are not just glowing balls. */
  drawStyled(ctx) {
    const r = this.radius;
    const age = this.age || 0;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(Math.atan2(this.vy, this.vx));
    ctx.shadowBlur = 14; ctx.shadowColor = this.color;
    switch (this.style) {
      case 'beam':
        // A laser bolt: a hot white core inside a coloured streak.
        ctx.fillStyle = this.color;
        ctx.fillRect(-r * 5, -r * 0.7, r * 6, r * 1.4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-r * 4, -r * 0.3, r * 5, r * 0.6);
        break;
      case 'petal':
        ctx.rotate(age * 9);
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.ellipse(0, 0, r * 1.3, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff3a8';
        ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill();
        break;
      case 'hammer':
        ctx.rotate(age * 14);
        ctx.fillStyle = '#6b5a48';
        ctx.fillRect(-r * 1.1, -r * 0.18, r * 2.2, r * 0.36);
        ctx.fillStyle = this.color;
        ctx.fillRect(r * 0.6, -r * 0.6, r * 0.7, r * 1.2);
        break;
      case 'missile':
        ctx.fillStyle = '#c9ccd2';
        ctx.fillRect(-r * 1.4, -r * 0.4, r * 2.4, r * 0.8);
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.moveTo(r * 1.0, -r * 0.4); ctx.lineTo(r * 1.6, 0); ctx.lineTo(r * 1.0, r * 0.4); ctx.fill();
        ctx.fillStyle = '#ffd27a';
        ctx.beginPath(); ctx.arc(-r * 1.6, 0, r * (0.4 + Math.random() * 0.3), 0, Math.PI * 2); ctx.fill();
        break;
      case 'shell':
        ctx.fillStyle = '#2a2a2e';
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = this.color; ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.4)';
        ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.fill();
        break;
      default:
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    }
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

  /* ---------------- Update 3.0 bestiary ---------------- */

  /* Officer on patrol. Revs, lines up a lane, and floors it — the headlight
     lane is drawn for the whole long wind-up and the car cannot steer once
     it commits, so a single sidestep beats it. Hit a wall and it crashes. */
  cop: {
    name: 'Cop Cruiser', hp: 96, speed: 84, radius: 20, xp: 22, gold: 16,
    ai: 'cop', color: '#2e4f9a', dark: '#121a33', vehicle: true,
    attacks: [
      { id: 'runover', kind: 'red', shape: 'charge', range: 560, minRange: 110,
        wind: 1.25, active: 0.9, recover: 1.0, damage: 30, cd: 3.6,
        chargeSpeed: 660, lockAim: true, lane: true, reach: 594 },
    ],
  },
  hound: {
    name: 'Grave Hound', hp: 30, speed: 150, radius: 11, xp: 9, gold: 4,
    ai: 'chase', color: '#8a7f74', dark: '#3a332c',
    attacks: [
      { id: 'bite', kind: 'blue', shape: 'melee', range: 70, reach: 44, arc: 1.6,
        wind: 0.32, active: 0.1, recover: 0.32, damage: 8, cd: 1.0, lunge: 360 },
      { id: 'pounce', kind: 'blue', shape: 'melee', range: 150, minRange: 70, reach: 46, arc: 1.4,
        wind: 0.5, active: 0.22, recover: 0.5, damage: 11, cd: 3.4, lunge: 560 },
    ],
  },
  imp: {
    name: 'Ember Imp', hp: 34, speed: 108, radius: 10, xp: 13, gold: 7,
    ai: 'ranged', color: '#ff7a3c', dark: '#5c200c', flying: true,
    attacks: [
      // A fan of three: parry the one coming at you, ignore the outriders.
      { id: 'embers', kind: 'blue', shape: 'shot', range: 430,
        wind: 0.5, active: 0.06, recover: 0.45, damage: 9, cd: 2.1, count: 3, spread: 0.32,
        shot: { speed: 330, radius: 5, color: '#ffb347' } },
    ],
  },
  shroom: {
    name: 'Spore Puffer', hp: 64, speed: 30, radius: 15, xp: 16, gold: 8,
    ai: 'chase', color: '#c86fae', dark: '#4f2344',
    attacks: [
      // A ring of spores around itself, and the floor stays poisoned.
      { id: 'puff', kind: 'red', shape: 'nova', range: 104, reach: 96, arc: Math.PI * 2,
        wind: 0.85, active: 0.1, recover: 0.8, damage: 15, cd: 3.2, leaves: 'spores' },
    ],
  },
  mimic: {
    name: 'Chest Mimic', hp: 112, speed: 100, radius: 16, xp: 30, gold: 40,
    ai: 'ambush', color: '#8a6238', dark: '#3c2a17',
    attacks: [
      { id: 'chomp', kind: 'blue', shape: 'melee', range: 80, reach: 56, arc: 1.7,
        wind: 0.4, active: 0.12, recover: 0.35, damage: 16, cd: 1.2, lunge: 380 },
      { id: 'gulp', kind: 'red', shape: 'melee', range: 90, reach: 64, arc: 2.0,
        wind: 0.72, active: 0.18, recover: 0.8, damage: 28, cd: 5.5, lunge: 300 },
    ],
  },
  lancer: {
    name: 'Phantom Lancer', hp: 72, speed: 74, radius: 13, xp: 24, gold: 12,
    ai: 'blink', color: '#9fe0d0', dark: '#24524a',
    attacks: [
      { id: 'jab', kind: 'blue', shape: 'melee', range: 92, reach: 70, arc: 0.9,
        wind: 0.38, active: 0.1, recover: 0.36, damage: 12, cd: 1.4, lunge: 300 },
      // Long, narrow and unblockable: step to the side, not backwards.
      { id: 'thrust', kind: 'red', shape: 'melee', range: 120, reach: 104, arc: 0.55,
        wind: 0.62, active: 0.14, recover: 0.7, damage: 24, cd: 4.2, lunge: 520 },
    ],
  },

  /* A companion who put on the Cursed Totem. Name and colours are overridden
     per instance from the companion it used to be (Game.companionTurns). */
  turncoat: {
    name: 'Turncoat', hp: 180, speed: 132, radius: 13, xp: 60, gold: 40,
    ai: 'chase', color: '#b03a2f', dark: '#3a1410',
    attacks: [
      { id: 'slash', kind: 'blue', shape: 'melee', range: 80, reach: 56, arc: 1.7,
        wind: 0.34, active: 0.12, recover: 0.3, damage: 14, cd: 1.0, lunge: 380 },
      { id: 'betrayal', kind: 'red', shape: 'melee', range: 90, reach: 66, arc: 1.8,
        wind: 0.62, active: 0.16, recover: 0.7, damage: 28, cd: 4.6, lunge: 320 },
    ],
  },

  /* John Space stands in the deep regions and does nothing. He is neutral,
     carries a bar so you know he is Someone, and what he becomes is decided
     entirely by whether you leave him alone.

     Update 3.0: press E on him and he fights you — a trial. Survive two
     minutes without striking back and he joins you. His light attacks cannot
     be parried; his HEAVY attacks can, and parrying one starts a chain of
     faster and faster follow-up heavies that all have to be parried. */
  johnspace: {
    name: 'John Space', hp: 500, speed: 96, radius: 16, xp: 260, gold: 200,
    ai: 'neutral', color: '#8fd4ff', dark: '#2b3c66',
    // Fixed numbers, not region-scaled: the spec's 1000 HP / 2x on provoking
    // has to be an escalation, and tier scaling was pushing his neutral form
    // above his hostile one.
    neutral: true, showBar: true, noScale: true,
    peaceRequired: 120,        // seconds of being left alone
    trialRequired: 120,        // seconds survived in the trial
    enragedHp: 1000, enragedDmgMul: 2,
    attacks: [
      { id: 'jab', kind: 'blue', shape: 'melee', range: 84, reach: 60, arc: 1.8,
        wind: 0.34, active: 0.13, recover: 0.3, damage: 20, cd: 1.1, lunge: 400 },
      { id: 'haymaker', kind: 'red', shape: 'melee', range: 92, reach: 70, arc: 1.7,
        wind: 0.6, active: 0.17, recover: 0.7, damage: 34, cd: 4.5, lunge: 340 },
    ],
    trialAttacks: [
      { id: 'jab', kind: 'blue', shape: 'melee', range: 84, reach: 62, arc: 1.8,
        wind: 0.3, active: 0.12, recover: 0.22, damage: 16, cd: 0.9, lunge: 420 },
      { id: 'cross', kind: 'blue', shape: 'melee', range: 96, reach: 66, arc: 1.5,
        wind: 0.42, active: 0.12, recover: 0.3, damage: 22, cd: 1.6, lunge: 520 },
      { id: 'comet', kind: 'red', shape: 'charge', range: 360, minRange: 120,
        wind: 0.7, active: 0.42, recover: 0.6, damage: 30, cd: 5.5, chargeSpeed: 720 },
      { id: 'spaceHammer', kind: 'heavy', shape: 'melee', range: 100, reach: 78, arc: 2.2,
        wind: 0.9, active: 0.16, recover: 0.7, damage: 44, cd: 4.2, lunge: 280,
        parryChain: [2, 4] },
    ],
  },

  warden: {
    name: 'The Hollow Warden', hp: 900, speed: 58, radius: 34, xp: 400, gold: 300,
    ai: 'boss', color: '#c8452f', dark: '#3d1712', boss: true,
  },

  /* ---------------- bosses ----------------
     Update 3.0: 100,000 HP in Tripolisis and 200,000 in Sarapolis (the map
     table is authoritative; these mirror it), a 1.5x damage multiplier, and
     combos that end in a parryable HEAVY. Chip damage barely marks them —
     the rhythm break that a parried heavy opens is how they come down. */
  sungod: {
    name: 'The Sun God', hp: 200000, speed: 52, radius: 36, xp: 700, gold: 500,
    ai: 'boss', color: '#ffc24d', dark: '#6b3a08', boss: true,
    bossDmgMul: 1.5, palette: 'sun',
    title: 'Predicament King',
  },
  flowery: {
    name: 'Flowery', hp: 100000, speed: 40, radius: 40, xp: 700, gold: 500,
    ai: 'boss', color: '#7fd66a', dark: '#264a1c', boss: true,
    bossDmgMul: 1.5, palette: 'flora',
    title: 'The Bloom That Watches',
  },
  judgement: {
    name: 'Judgement', hp: 200000, speed: 74, radius: 34, xp: 700, gold: 500,
    ai: 'boss', color: '#e8e2d4', dark: '#3a3630', boss: true,
    bossDmgMul: 1.5, palette: 'fist',
    title: 'Pure Devastation',
  },
};

/* Update 3.0 boss moveset. Bosses now fight in combos — strings of light
   attacks that end in a HEAVY. Light attacks (blue) cannot be parried on a
   boss any more; only the gold HEAVY telegraph can, and parrying it is what
   opens the rhythm break. Damage is still multiplied by the boss's scale. */
const BOSS_MOVES = {
  swipe: { id: 'b_swipe', kind: 'blue', shape: 'melee', range: 120, reach: 96, arc: 2.0,
    wind: 0.42, active: 0.14, recover: 0.26, damage: 11, cd: 0, lunge: 300 },
  lash: { id: 'b_lash', kind: 'blue', shape: 'melee', range: 175, reach: 150, arc: 0.9,
    wind: 0.5, active: 0.14, recover: 0.3, damage: 12, cd: 0, lunge: 140 },
  volley: { id: 'b_volley', kind: 'blue', shape: 'shot', range: 650,
    wind: 0.5, active: 0.06, recover: 0.32, damage: 10, cd: 0, count: 5, spread: 0.42,
    shot: { speed: 300, radius: 7 } },
  heavySmash: { id: 'b_heavy', kind: 'heavy', shape: 'melee', range: 135, reach: 112, arc: 2.6,
    wind: 1.0, active: 0.18, recover: 0.75, damage: 26, cd: 0, lunge: 240 },
  heavyRush: { id: 'b_rush', kind: 'heavy', shape: 'charge', range: 650, reach: 150,
    wind: 0.95, active: 0.5, recover: 0.8, damage: 24, cd: 0, chargeSpeed: 700 },
};

const BOSS_COMBOS = {
  flora: [['lash', 'lash', 'heavySmash'], ['volley', 'swipe', 'heavySmash'], ['swipe', 'lash', 'volley', 'heavySmash']],
  sun: [['volley', 'volley', 'heavySmash'], ['swipe', 'volley', 'heavyRush'], ['volley', 'swipe', 'swipe', 'heavySmash']],
  fist: [['swipe', 'swipe', 'swipe', 'heavyRush'], ['heavyRush', 'heavySmash'], ['swipe', 'heavySmash', 'heavyRush']],
};

const BOSS_SHOT_COLOR = { sun: '#ffd27a', flora: '#a8e063', fist: '#e8e2d4' };

/* What the bosses say: on their intro, on each phase change, sometimes as a
   heavy winds up, and as they fall. */
const BOSS_LINES = {
  flowery: {
    intro: [
      'Oh. A visitor. Nobody visits the garden any more.',
      'Stand still. I only want to plant you.',
    ],
    phase2: ['You are trampling my beds!', 'Roots, wake up. We have company.'],
    phase3: ['If I wilt, I take the whole garden with me!', 'Bloom. BLOOM!'],
    heavy: ['Prune!', 'Hold still...', 'Into the soil!'],
    death: ['...it was such a nice garden.'],
  },
  sungod: {
    intro: [
      'Kneel. Every shadow down here is one I allowed.',
      'You stand in a predicament, little thing. I AM the predicament.',
    ],
    phase2: ['You squint at the sun? Then burn.', 'Noon comes for you.'],
    phase3: ['I have set on empires. I will not set on YOU.', 'ECLIPSE!'],
    heavy: ['Bow!', 'Solar judgement!', 'Feel the noon!'],
    death: ['The sun... goes down...', 'Dusk. Already?'],
  },
  judgement: {
    intro: [
      'The Sun God was a warning. I am the sentence.',
      'No appeals. No mercy. Only Judgement.',
    ],
    phase2: ['Guilty.', 'Your defence is noted. And denied.'],
    phase3: ['PURE. DEVASTATION.', 'The court is now in session!'],
    heavy: ['Sentenced!', 'Order!', 'GUILTY!'],
    death: ['...case... dismissed.'],
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
    this.trial = false;    // John Space, provoked with E: the two-minute trial
    this.trialT = 0;
    this.chain = null;     // John's parry chain in progress
    this.awake = t.ai !== 'ambush';   // mimics sit still until you are close
    this.blinkCd = U.rand(1.5, 3);
    this.combo = null;     // boss combo queue
    this.lastHitBy = null; // companion credit for kills
    // Update 4.0 statuses — most of them come from modifiers.
    this.dizzy = 0;        // smoke bomb / chaos: attacks its own side
    this.burnT = 0; this.burnDps = 0;
    this.poisonT = 0; this.poisonStacks = 0; this.poisonDps = 0;
    this.bleedT = 0; this.bleedDps = 0;
    this.hexT = 0; this.hexAmt = 0;
    this.dotT = 0;
    this.tempo = 1;        // hard mode and Judgement 2.0 attack faster
    this.summoner = null;  // who called it, for summon caps
    this._q = [];
  }

  canAct() { return this.stun <= 0 && this.stagger <= 0; }

  // Bosses and minibosses: too heavy to throw around, root, fling or swap.
  get isHeavyweight() { return !!(this.def.boss || this.def.big); }
  // ...and never ended by a lucky proc (Sun Minions join them here).
  get noExecute() { return this.isHeavyweight || !!this.def.noExecute; }

  /* A dizzy enemy's blows land on another enemy through this — the same
     signature as Player.takeHit, so attack code needs no branching. Friendly
     fire hits hard: that is the point of the smoke. */
  takeHit(amount, game, opts = {}) {
    if (this.dead) return 'none';
    this.takeDamage(amount * 1.5, game, opts.x, opts.y, 160, false);
    return 'hit';
  }

  /* Damage over time from burns, poison and bleeding, in half-second ticks. */
  updateStatus(dt, game) {
    this.dizzy = Math.max(0, this.dizzy - dt);
    this.hexT = Math.max(0, this.hexT - dt);
    if (this.burnT <= 0 && this.poisonT <= 0 && this.bleedT <= 0) { this.dotT = 0; return; }
    this.dotT += dt;
    if (this.dotT >= 0.5) {
      this.dotT -= 0.5;
      let dmg = 0;
      if (this.burnT > 0) dmg += this.burnDps * 0.5;
      if (this.poisonT > 0) dmg += this.poisonDps * this.poisonStacks * 0.5;
      if (this.bleedT > 0) dmg += this.bleedDps * 0.5;
      if (dmg > 0) this.takeDamage(dmg, game, this.x, this.y - 1, 0, false, 'dot');
    }
    this.burnT = Math.max(0, this.burnT - dt);
    this.bleedT = Math.max(0, this.bleedT - dt);
    this.poisonT = Math.max(0, this.poisonT - dt);
    if (this.poisonT <= 0) this.poisonStacks = 0;
  }

  // Companions and minions leave John Space alone while he is deciding about
  // you — hitting him is your call, not theirs.
  get targetable() { return !this.dead && !this.neutral && !this.trial; }

  /* E on John Space: he fights you, and you are not allowed to fight back. */
  startTrial(game) {
    if (this.enraged || this.trial) return;
    this.trial = true;
    this.neutral = false;
    this.aggro = true;
    this.trialT = 0;
    this.def_ai_override = 'chase';
    this.speed = this.def.speed * 1.4;
    this.stateT = 0;
    game.fx.ring(this.x, this.y, 60, '#ffd479', 40);
    game.fx.addShake(12);
    game.fx.text(this.x, this.y - 46, '"FINE. SHOW ME."', '#ffd479', 18);
    game.toast('John Space wants a fight. Survive two minutes — and do NOT hit him back.', 6);
    game.audio.blip(90, 0.6, 0.2, 'sawtooth');
  }

  /* Parrying one of John's heavies does not stagger him: he answers with a
     faster heavy, and another, and you have to parry every one. */
  chainParried(game) {
    const base = this.def.trialAttacks.find(a => a.parryChain);
    if (!this.chain) this.chain = { left: U.randi(base.parryChain[0], base.parryChain[1] + 1), count: 0 };
    const c = this.chain;
    c.count++;
    c.left--;
    game.fx.text(this.x, this.y - this.radius - 26, `PARRY x${c.count}`, '#ffd479', 17 + c.count * 2);
    if (c.left <= 0) {
      // Chain broken: he reels, and the clock jumps forward as a reward.
      this.chain = null;
      this.atk = null;
      this.stun = Math.max(this.stun, 2.6);
      this.stagger = Math.max(this.stagger, 0.01);
      this.trialT += 15;
      game.fx.ring(this.x, this.y, 70, '#ffd479', 44);
      game.fx.addShake(14);
      game.impactFreeze(0.12);
      game.fx.text(this.x, this.y - 54, 'CHAIN BROKEN  -15s', '#ffffff', 20);
      game.audio.freeze();
      return;
    }
    // The next one comes faster.
    const def = { ...base, id: 'chain', wind: Math.max(0.3, 0.55 - c.count * 0.07), cd: 0 };
    this.atk = {
      def, t: 0, phase: 'wind', angle: U.angle(this.x, this.y, game.player.x, game.player.y),
      fired: false, hit: false, target: game.player,
    };
    this.vx = 0; this.vy = 0;
    game.impactFreeze(0.06);
    game.audio.telegraph('red');
  }

  /* You attacked him. He is now a 1000 HP problem that does double damage
     and does not stop following you. */
  enrage(game) {
    this.enraged = true;
    this.neutral = false;
    this.trial = false;
    this.chain = null;
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
    if (this.trial) { this.chainParried(game); return; }
    if (this.isHeavyweight) { this.combo = null; this.state = 'idle'; this.stateT = 0; }
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

  /* `src` is 'player' for hits from your own weapon (modifiers and boss-
     damage rings key off it), 'dot' for damage-over-time ticks. */
  takeDamage(n, game, srcX, srcY, knock = 0, crit = false, src = null) {
    if (this.dead) return;
    if (this.hexT > 0) n *= 1 + this.hexAmt;
    if (src === 'player' && this.isHeavyweight && game.player.bossDmg) n *= 1 + game.player.bossDmg;
    // Hit John Space once — neutral or mid-trial — and the arrangement is over.
    if ((this.neutral || this.trial) && !this.enraged) this.enrage(game);
    if (!this.awake) this.wake(game);
    if (this.stagger > 0) n *= PARRY.vuln;

    /* Ironclads eat frontal damage until you open them. Parrying strips the
       shield (they stagger), and so does getting behind them — which is what
       makes them a puzzle rather than a health sponge. */
    let blocked = false;
    if (this.def.shielded && this.stagger <= 0 && srcX !== undefined && src !== 'dot') {
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
      crit ? '#ffd479' : src === 'dot' ? '#b8e07a' : '#ffffff', crit ? 19 : src === 'dot' ? 12 : 14);
    if (src === 'player') {
      const mod = game.player.modifier;
      if (mod) Mods.onHit(this, game, mod, dmg);
    }
    const a = U.angle(srcX, srcY, this.x, this.y);
    game.fx.spark(this.x, this.y, {
      count: crit ? 12 : 7, color: [this.def.color, '#ffffff'],
      dir: a, spread: 0.9, speedMax: 210, lifeMax: 0.4, sizeMax: 3.5,
    });
    if (knock > 0 && !this.isHeavyweight) {
      const k = knock / (this.elite ? 2.2 : 1);
      this.vx += Math.cos(a) * k;
      this.vy += Math.sin(a) * k;
    }
    if (this.hp <= 0) this.die(game);
  }

  // A mimic's lid comes up.
  wake(game) {
    this.awake = true;
    this.aggro = true;
    game.fx.text(this.x, this.y - this.radius - 22, "IT'S A MIMIC!", '#e2b34a', 16);
    game.fx.spark(this.x, this.y, { count: 14, color: ['#e2b34a', '#8a6238'], speedMax: 200, lifeMax: 0.5 });
    game.audio.telegraph('red');
  }

  die(game) {
    if (this.dead) return;
    this.dead = true;
    // Companions grow on kills: the one that landed the blow takes it all,
    // the rest share a slice of every kill made near them.
    if (game.companions) {
      for (const c of game.companions) {
        if (c.dead || !c.gainXp) continue;
        const own = this.lastHitBy === c;
        if (own || U.dist(c.x, c.y, this.x, this.y) < 700) c.gainXp(this.xpValue * (own ? 1 : 0.35), game);
      }
    }
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
    const big = this.isHeavyweight;
    game.fx.spark(this.x, this.y, {
      count: big ? 90 : 20, color: [this.def.color, this.def.dark, '#ffffff'],
      speedMax: big ? 420 : 240, lifeMax: 0.85, sizeMax: big ? 7 : 4.5,
    });
    game.fx.ring(this.x, this.y, this.radius, this.def.color, big ? 40 : 14);
    game.fx.addShake(big ? 22 : 3 + this.radius * 0.12);
    game.audio.blip(big ? 60 : 140, 0.22, 0.16);
    if (big) game.audio.explode();

    game.player.addXp(this.xpValue, game);
    game.player.onKill(game, this);

    const coins = U.clamp(Math.round(this.goldValue / 4), 1, 9);
    for (let i = 0; i < coins; i++) game.pickups.push(new Pickup('gold', this.x, this.y, Math.ceil(this.goldValue / coins)));
    if (U.chance(this.def.boss ? 1 : 0.11 * (1 + (game.player.luck || 0)))) {
      const n = this.def.boss ? 5 : 1;
      for (let i = 0; i < n; i++) game.pickups.push(new Pickup('heart', this.x, this.y, 20));
    }
    if (this.elite || big) game.pickups.push(new Pickup('shard', this.x, this.y, 1));
    if (this.def.big) {
      // A miniboss pays like one.
      for (let i = 0; i < 2; i++) game.pickups.push(new Pickup('shard', this.x, this.y, 1));
      for (let i = 0; i < 4; i++) game.pickups.push(new Pickup('heart', this.x, this.y, 25));
      game.onMinibossDefeated(this);
    }
    if (this.dropsTotem) {
      game.player.bag.push('cursed-totem');
      game.toast('The Cursed Totem drops back into your bag. Keep it off your friends.', 4);
    }

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
    for (const k in this.atkCds) this.atkCds[k] = Math.max(0, this.atkCds[k] - dt * this.tempo);
    this.stateT += dt;
    this.bob += dt * 6;
    this.updateStatus(dt, game);
    if (this.dead) return;

    const seeP = U.dist(this.x, this.y, p.x, p.y);
    // The dead of Day-ZEE are not quiet about it.
    if (this.def.zombie && this.aggro && seeP < 520 && Math.random() < dt * 0.12) game.audio.groan();

    // A mimic is furniture until you are within arm's reach.
    if (!this.awake) {
      if (seeP < 105) this.wake(game);
      else { this.vx = this.vy = 0; return; }
    }

    // John's trial runs on a clock: last it out and he is yours.
    if (this.trial) {
      this.trialT += dt;
      if (this.trialT >= this.def.trialRequired) { game.johnBefriended(this); return; }
    }

    // A Ninja in Ambush Mode cannot be seen beyond arm's reach — except by
    // bosses and minibosses, who are not so easily fooled.
    const unseen = p.isUnseen && p.isUnseen() && !this.isHeavyweight;
    const canSee = seeP < 620 && (!unseen || seeP < 64)
      && (this.def.ghost || dun.lineOfSight(this.x, this.y, p.x, p.y));
    if (canSee && seeP < (this.def.aggroRange || 480)) { this.aggro = true; this.lastSeen = { x: p.x, y: p.y }; }

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

    const lost = unseen && !canSee && focus === p;
    if (this.stun > 0 || this.stagger > 0) {
      // staggered: no steering, just slide
    } else if (this.dizzy > 0 && focus === p && !this.isHeavyweight) {
      // Dizzy with nobody else to hit: it staggers about, harmless.
      this.wobble += dt * 5;
      ax = Math.cos(this.wobble) * this.speed * 0.5;
      ay = Math.sin(this.wobble * 1.3) * this.speed * 0.5;
    } else if (!this.aggro || lost) {
      // Idle drift keeps rooms feeling alive before you're noticed.
      if (this.stateT > 1.6) { this.moveAngle = U.rand(0, Math.PI * 2); this.stateT = 0; }
      ax = Math.cos(this.moveAngle) * this.speed * 0.22;
      ay = Math.sin(this.moveAngle) * this.speed * 0.22;
    } else {
      const target = (focus !== p) ? focus : (canSee ? p : (this.lastSeen || p));
      const ang = U.angle(this.x, this.y, target.x, target.y);

      // A dizzy enemy just runs at whoever it has decided is the enemy.
      const mode = this.dizzy > 0 && focus !== p ? 'chase' : (this.def_ai_override || this.def.ai);
      switch (mode) {
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
          const want = this.def.keepAt || 250;
          const drift = d < want - 60 ? -1 : d > want + 60 ? 1 : 0;
          const strafe = ang + Math.PI / 2 * (Math.sin(this.wobble += dt * 1.4) > 0 ? 1 : -1);
          ax = Math.cos(ang) * this.speed * drift + Math.cos(strafe) * this.speed * 0.55;
          ay = Math.sin(ang) * this.speed * drift + Math.sin(strafe) * this.speed * 0.55;
          break;
        }
        case 'charger':
        case 'phase':
        case 'ambush': {
          ax = Math.cos(ang) * this.speed;
          ay = Math.sin(ang) * this.speed;
          break;
        }
        case 'cop': {
          // Cruises at a distance and circles, lining up the next run.
          const want = 300;
          const drift = d < want - 80 ? -1 : d > want + 80 ? 1 : 0;
          const strafe = ang + Math.PI / 2;
          ax = Math.cos(ang) * this.speed * drift + Math.cos(strafe) * this.speed * 0.6;
          ay = Math.sin(ang) * this.speed * drift + Math.sin(strafe) * this.speed * 0.6;
          break;
        }
        case 'blink': {
          // Stalks slowly, and every few seconds simply steps out beside you.
          ax = Math.cos(ang) * this.speed * 0.6;
          ay = Math.sin(ang) * this.speed * 0.6;
          this.blinkCd -= dt;
          if (this.blinkCd <= 0 && d > 150 && d < 520 && focus === p) {
            this.blinkCd = U.rand(3.5, 5.5);
            const side = ang + Math.PI / 2 * (U.chance(0.5) ? 1 : -1) + Math.PI;
            const tx = p.x + Math.cos(side) * 95, ty = p.y + Math.sin(side) * 95;
            if (bodyFits(dun, tx, ty, this.radius) && dun.lineOfSight(p.x, p.y, tx, ty)) {
              game.fx.spark(this.x, this.y, { count: 14, color: [this.def.color, '#ffffff'], speedMax: 160, lifeMax: 0.4 });
              this.x = tx; this.y = ty; this.vx = this.vy = 0;
              game.fx.ring(tx, ty, 22, this.def.color, 16);
              game.audio.blip(1200, 0.08, 0.06, 'sine');
            }
          }
          break;
        }
        case 'boss': {
          const r = this.bossUpdate(dt, game, ang, d);
          ax = r.ax; ay = r.ay;
          break;
        }
        case 'miniboss': {
          const r = this.minibossUpdate(dt, game, ang, d);
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
    // Dizzy: whoever is nearest is the enemy now — so long as it is not you.
    if (this.dizzy > 0 && !this.isHeavyweight) {
      const other = game.enemyHash.nearest(this.x, this.y, 360, o => o !== this && o.targetable);
      if (other) return other;
    }
    if (this.trial || !game.minions || !game.minions.length) return p;
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
    let list = this.trial && this.def.trialAttacks ? this.def.trialAttacks : this.def.attacks;
    // On trial John fights only you — never the Bone Brute standing nearby.
    if (this.trial) focus = game.player;
    // Dizzy and swinging at a friend: hands only, no guns.
    if (this.dizzy > 0 && focus && focus !== game.player) {
      list = list.filter(a => a.shape === 'melee' || a.shape === 'charge' || a.shape === 'nova');
    }
    const ready = list.filter(a =>
      (this.atkCds[a.id] || 0) <= 0 &&
      d <= a.range + this.radius &&
      d >= (a.minRange || 0));
    if (!ready.length) return;
    // Prefer the unblockable when it is available: it should feel like a
    // punish for standing still, not a coin flip.
    const red = ready.filter(a => a.kind === 'red' || a.kind === 'heavy');
    const def = red.length && U.chance(0.55) ? U.pick(red) : U.pick(ready);
    this.atk = { def, t: 0, phase: 'wind', angle: ang, fired: false, hit: false, target: focus || game.player };
    game.audio.telegraph(def.kind);
  }

  updateAttack(dt, game, p) {
    const a = this.atk;
    const def = a.def;
    a.t += dt * this.tempo;
    let ax = 0, ay = 0;

    if (a.t < def.wind) {
      a.phase = 'wind';
      // Track the player during the wind-up, but sluggishly, so committing
      // to a direction is still a mistake the player can exploit.
      // A locked aim (the cop car) commits to its lane the moment it revs.
      if (!def.lockAim) {
        const want = U.angle(this.x, this.y, p.x, p.y);
        a.angle += U.clamp(U.angleDiff(a.angle, want), -2.2 * dt, 2.2 * dt);
        ax = Math.cos(a.angle) * this.speed * 0.15;
        ay = Math.sin(a.angle) * this.speed * 0.15;
      }
    } else if (a.t < def.wind + def.active) {
      a.phase = 'active';
      if (!a.fired) { a.fired = true; this.fireAttack(game, a, p); }
      if (def.spray) {
        // A stream of shots across the whole active window, tracking you.
        const want = U.angle(this.x, this.y, p.x, p.y);
        a.angle += U.clamp(U.angleDiff(a.angle, want), -def.spray.track * dt, def.spray.track * dt);
        a.sprayT = (a.sprayT || 0) - dt * this.tempo;
        while (a.sprayT <= 0) {
          a.sprayT += def.spray.every;
          this.shoot(game, a.angle + U.rand(-def.spray.jitter, def.spray.jitter),
            { damage: def.damage, ...def.shot }, 1, def.kind);
          if (def.sfx && game.audio[def.sfx]) game.audio[def.sfx]();
        }
      }
      if (def.shape === 'charge') {
        ax = Math.cos(a.angle) * def.chargeSpeed;
        ay = Math.sin(a.angle) * def.chargeSpeed;
        // A car that drives into a wall crashes, and sits there dazed.
        if (this.def.vehicle && game.dungeon.isSolidAt(
          this.x + Math.cos(a.angle) * (this.radius + 6), this.y + Math.sin(a.angle) * (this.radius + 6))) {
          this.atkCds[def.id] = def.cd;
          this.atk = null;
          this.stun = Math.max(this.stun, 1.6);
          this.vx = this.vy = 0;
          game.fx.text(this.x, this.y - this.radius - 18, 'CRASH!', '#ffd479', 17);
          game.fx.spark(this.x, this.y, { count: 20, color: ['#ffd479', '#8fa0b8', '#ffffff'], speedMax: 260, lifeMax: 0.5 });
          game.fx.addShake(7);
          game.audio.explode();
          return { ax: 0, ay: 0 };
        }
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
      if (def.id === 'chain') this.chain = null;   // whiffed or dodged: chain over
    }
    return { ax, ay };
  }

  fireAttack(game, a, p) {
    const def = a.def;
    if (def.sfx && def.shape !== 'spray' && game.audio[def.sfx]) game.audio[def.sfx]();
    if (def.shape === 'spray') return;              // streamed by updateAttack
    if (def.shape === 'barrage') { this.fireBarrage(game, def, p); return; }
    if (def.shape === 'beams') { this.fireBeams(game, def, p); return; }
    if (def.shape === 'summon') { this.summonHelp(game, def.summon); return; }
    if (def.shape === 'shot') {
      const n = def.count || 1;
      const color = def.shot.color || BOSS_SHOT_COLOR[this.def.palette] || '#ffffff';
      for (let i = 0; i < n; i++) {
        const off = n > 1 ? (i - (n - 1) / 2) * (def.spread || 0.3) : 0;
        this.shoot(game, a.angle + off, { damage: def.damage, ...def.shot, color }, 1, def.kind);
      }
      return;
    }
    if (def.shape === 'nova') {
      // A burst all the way round: distance is the only answer.
      const col = def.color || this.def.color;
      game.fx.ring(this.x, this.y, def.reach * 0.6, col, 34);
      game.fx.spark(this.x, this.y, { count: 30, color: [col, '#ffffff'], speedMax: 260, lifeMax: 0.6 });
      game.fx.addShake(this.isHeavyweight ? 9 : 3);
      if (U.dist(this.x, this.y, p.x, p.y) < def.reach + p.radius) this.landHit(game, p, def);
      if (def.leaves === 'spores') {
        game.zones.push(new Zone('goo', this.x, this.y, {
          radius: 74, life: 4.5, tickEvery: 0.7, damage: 4 * this.dmgScale, power: 1, hostile: true, tint: 'spore',
        }));
      }
      game.audio.cast('earth', true);
      return;
    }
    if (def.shape === 'impact') {
      // Lobbed where the target stands now — walking is the answer.
      game.impacts.push({
        x: p.x, y: p.y, t: 0, delay: def.impactDelay,
        radius: def.impactRadius, color: def.impactColor || '#c48ade',
        style: def.impactStyle || null, leaves: def.leaves || null, effect: def.effect || null,
        fromX: this.x, fromY: this.y,
        aoeDamage: def.damage * this.dmgScale, hostile: true, source: this,
      });
      if (!def.sfx) game.audio.cast('earth', false);
      return;
    }
    if (def.shape === 'melee') {
      if (def.slam) {
        // A slam: the shockwave is the hitbox, and you can see all of it.
        game.fx.ring(this.x, this.y, def.reach * 0.6, '#ffd479', 40);
        game.fx.spark(this.x, this.y, { count: 30, color: ['#ffd479', this.def.color, '#ffffff'], speedMax: 340, lifeMax: 0.6, sizeMax: 5 });
        game.fx.addShake(12);
        game.audio.explode();
      }
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
    if (result !== 'parry' && def.id === 'chain') this.chain = null;
    game.fx.spark(this.x + Math.cos(angle) * this.radius,
      this.y + Math.sin(angle) * this.radius, {
      count: 8, color: def.kind === 'red' ? ['#ff6b52', '#ffb27a'] : ['#cfe4ff', '#ffffff'],
      dir: angle, spread: 0.8, speedMax: 190, lifeMax: 0.35,
    });
    return result;   // game.onParry already staggered us; don't do it twice
  }

  shoot(game, angle, shot, speedMul = 1, kind = 'blue') {
    // Fixed-number enemies (minibosses, Sun Minions) scale by their own
    // damage multiplier instead of by region tier.
    const scale = this.def.noScale ? this.dmgScale : (1 + this.tier * 0.22);
    game.projectiles.push(new Projectile({
      x: this.x + Math.cos(angle) * (this.radius + 4),
      y: this.y + Math.sin(angle) * (this.radius + 4),
      vx: Math.cos(angle) * shot.speed * speedMul,
      vy: Math.sin(angle) * shot.speed * speedMul,
      damage: shot.damage * scale * (this.shotMul || 1),
      life: 3, radius: shot.radius, color: shot.color,
      homing: shot.homing || 0, owner: 'enemy',
      pierce: !!shot.pierce, leaves: shot.leaves || null,
      style: shot.style || null,
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
      this.combo = null;
      game.fx.ring(this.x, this.y, this.radius * 1.4, '#ff8a5c', 46);
      game.fx.addShake(16);
      game.bossSay(this, newPhase === 2 ? 'phase2' : 'phase3');
      game.audio.roar();
    }

    // Update 4.0: every named boss now runs its own kit (js/bosses.js).
    const kit = BOSS_KITS[this.def.palette];
    if (kit) return this.kitUpdate(dt, game, ang, d, kit);

    let ax = 0, ay = 0;

    if (this.state === 'combo') {
      /* Run the queued combo one attack at a time. Each attack is a normal
         telegraphed `atk`, so it gets the same rings, poses and parry rules
         as everything else; this just walks the boss into range first. */
      if (!this.combo || !this.combo.length) {
        this.combo = null; this.state = 'idle'; this.stateT = 0;
      } else {
        const def = BOSS_MOVES[this.combo[0]];
        const inRange = d <= def.range + this.radius;
        this.comboWait = (this.comboWait || 0) + dt;
        if (inRange || this.comboWait > 2.2) {
          this.combo.shift();
          this.comboWait = 0;
          if (inRange) {
            this.atk = { def, t: 0, phase: 'wind', angle: ang, fired: false, hit: false, target: game.player };
            game.audio.telegraph(def.kind);
            if (def.kind === 'heavy' && U.chance(0.35)) game.bossSay(this, 'heavy');
          }
        } else {
          ax = Math.cos(ang) * this.speed * 1.5;
          ay = Math.sin(ang) * this.speed * 1.5;
        }
      }
    } else if (this.state === 'slamWind') {
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
        // Update 3.0: combos are now the backbone of every named boss.
        const combos = BOSS_COMBOS[this.def.palette];
        if (combos) moves.push('combo', 'combo', 'combo', 'combo');
        const pickMove = d < 170 && !combos ? 'slamWind'
          : d < 170 && U.chance(0.35) ? 'slamWind' : U.pick(moves);
        if (pickMove === 'combo') {
          this.combo = U.pick(combos).slice();
          // Later phases tack an extra light hit onto the front.
          if (this.phase >= 2) this.combo.unshift(U.pick(['swipe', 'volley']));
          this.comboWait = 0;
          this.state = 'combo';
        } else if (pickMove === 'summon') {
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

  /* ---------------- Update 4.0: kits for bosses and minibosses ---------------- */

  minibossUpdate(dt, game, ang, d) {
    const frac = this.hp / this.maxHp;
    const ph = frac > 0.62 ? 1 : frac > 0.3 ? 2 : 3;
    if (ph !== this.phase) {
      this.phase = ph;
      this.combo = null; this.state = 'idle'; this.stateT = 0;
      game.fx.ring(this.x, this.y, this.radius * 1.4, '#ff8a5c', 40);
      game.fx.addShake(12);
      game.fx.text(this.x, this.y - this.radius - 34, ph === 3 ? 'ENRAGED' : 'ESCALATING', '#ff6b52', 18);
      game.audio.roar();
    }
    if (this.def.vehicle && Math.random() < dt * 0.6) game.audio.engine();
    return this.kitUpdate(dt, game, ang, d, this.def);
  }

  /* Walk into range, string a combo together one telegraphed attack at a
     time, reach for a special now and then, repeat. Every move is a normal
     `atk`, so it reads, poses and parries like everything else. */
  kitUpdate(dt, game, ang, d, kit) {
    let ax = 0, ay = 0;
    const style = this.def.moveStyle || 'chase';
    if (kit.tempo && !this._kitTempo) { this._kitTempo = true; this.tempo *= kit.tempo; }

    if (this.state === 'combo') {
      if (!this.combo || !this.combo.length) {
        this.combo = null; this.state = 'idle'; this.stateT = 0;
      } else {
        const def = kit.moves[this.combo[0]];
        const inRange = d <= def.range + this.radius;
        this.comboWait = (this.comboWait || 0) + dt;
        if (inRange || this.comboWait > 2.2) {
          this.combo.shift();
          this.comboWait = 0;
          if (inRange) {
            this.atk = { def, t: 0, phase: 'wind', angle: ang, fired: false, hit: false, target: game.player };
            game.audio.telegraph(def.kind);
            if (def.kind === 'heavy' && this.def.boss && U.chance(0.35)) game.bossSay(this, 'heavy');
          }
        } else if (style !== 'anchored') {
          ax = Math.cos(ang) * this.speed * 1.5;
          ay = Math.sin(ang) * this.speed * 1.5;
        }
      }
      return { ax, ay };
    }

    // Between combos: close in (or hold position, if you are a ship).
    if (style !== 'anchored' && d > this.radius + 50) {
      const sp = this.speed * (style === 'slow' ? 0.85 : 1);
      ax = Math.cos(ang) * sp;
      ay = Math.sin(ang) * sp;
    }
    if (style === 'blink') {
      this.blinkCd -= dt;
      if (this.blinkCd <= 0 && d > 160 && d < 600) {
        this.blinkCd = U.rand(3.5, 5.5);
        const p = game.player;
        const side = ang + Math.PI + U.rand(-1, 1);
        const tx = p.x + Math.cos(side) * 110, ty = p.y + Math.sin(side) * 110;
        if (bodyFits(game.dungeon, tx, ty, this.radius) && game.dungeon.lineOfSight(p.x, p.y, tx, ty)) {
          game.fx.spark(this.x, this.y, { count: 18, color: [this.def.color, '#ffffff'], speedMax: 180, lifeMax: 0.4 });
          this.x = tx; this.y = ty; this.vx = this.vy = 0;
          game.fx.ring(tx, ty, 26, this.def.color, 18);
          game.audio.blip(1200, 0.08, 0.06, 'sine');
        }
      }
    }

    const gaps = kit.gap || [2.4, 1.9, 1.4];
    if (this.stateT > gaps[this.phase - 1] / this.tempo) {
      this.stateT = 0;
      for (const sp of kit.specials || []) {
        if (this.phase >= (sp.minPhase || 1) && U.chance(sp.chance) && this.doSpecial(sp.id, game)) return { ax, ay };
      }
      if (kit.closeMove && d < 170 && U.chance(0.55)) {
        this.combo = [kit.closeMove];
      } else {
        const pool = kit.combos
          .concat(this.phase >= 2 && kit.phase2 ? kit.phase2 : [])
          .concat(this.phase >= 3 && kit.phase3 ? kit.phase3 : []);
        this.combo = U.pick(pool).slice();
        // Later phases tack an extra light hit onto the front.
        if (this.phase >= 2 && kit.opener) this.combo.unshift(U.pick(kit.opener));
      }
      this.comboWait = 0;
      this.state = 'combo';
    }
    return { ax, ay };
  }

  doSpecial(id, game) {
    const mine = () => game.enemies.filter(e => !e.dead && e.summoner === this);
    if (id === 'sunMinions') {
      // Never more than two Sun Minions at once.
      const alive = mine().filter(e => e.type === 'sunminion').length;
      if (alive >= 2) return false;
      for (let i = alive; i < 2; i++) {
        const a = U.rand(0, Math.PI * 2);
        const spot = game.safeSpawnNear(this.x + Math.cos(a) * 120, this.y + Math.sin(a) * 120, 20, a, 20);
        const m = game.spawnEnemy('sunminion', spot.x, spot.y, this.tier, false);
        m.summoner = this;
        m.aggro = true;
        m.dmgScale = this.dmgScale * 0.45;
        game.fx.ring(m.x, m.y, 30, '#ffd27a', 24);
      }
      game.fx.text(this.x, this.y - this.radius - 40, 'RISE, LITTLE SUNS', '#ffd27a', 18);
      game.audio.laserCharge();
      return true;
    }
    if (id === 'reinforce') {
      if (mine().length >= 8) return false;
      this.summonHelp(game, { types: ['shambler', 'sprinter', 'grunt', 'k9'], count: 3, max: 8 });
      game.fx.text(this.x, this.y - this.radius - 40, 'REINFORCEMENTS!', '#c4e86b', 18);
      game.audio.groan();
      return true;
    }
    return false;
  }

  summonHelp(game, s) {
    const alive = game.enemies.filter(e => !e.dead && e.summoner === this).length;
    const n = Math.min(s.count, (s.max || 6) - alive);
    for (let i = 0; i < n; i++) {
      const a = U.rand(0, Math.PI * 2);
      const spot = game.safeSpawnNear(this.x + Math.cos(a) * 90, this.y + Math.sin(a) * 90, 20, a, 16);
      const e = game.spawnEnemy(U.pick(s.types), spot.x, spot.y, this.tier, false);
      e.summoner = this;
      e.aggro = true;
    }
    game.fx.ring(this.x, this.y, 90, this.def.color, 30);
  }

  /* Several ground impacts at once. Patterns:
       scatter   one on you, the rest around you
       line      a row from the attacker toward you (vines)
       carpet    a row walking along the line through you (airstrike)
       circle    a ring around you — the middle is safe
       ringSelf  a ring around the attacker */
  fireBarrage(game, def, p) {
    const b = def.barrage;
    const n = b.count;
    const ang = U.angle(this.x, this.y, p.x, p.y);
    for (let i = 0; i < n; i++) {
      let x, y;
      if (b.pattern === 'line') {
        const dist = (b.start || 60) + i * b.step;
        x = this.x + Math.cos(ang) * dist; y = this.y + Math.sin(ang) * dist;
      } else if (b.pattern === 'carpet') {
        const off = (i - (n - 1) / 2) * b.step;
        x = p.x + Math.cos(ang) * off; y = p.y + Math.sin(ang) * off;
      } else if (b.pattern === 'circle') {
        const a2 = (i / n) * Math.PI * 2;
        x = p.x + Math.cos(a2) * b.spread; y = p.y + Math.sin(a2) * b.spread;
      } else if (b.pattern === 'ringSelf') {
        const a2 = (i / n) * Math.PI * 2 + this.stateT;
        x = this.x + Math.cos(a2) * b.spread; y = this.y + Math.sin(a2) * b.spread;
      } else if (i === 0) {
        x = p.x; y = p.y;
      } else {
        const a2 = U.rand(0, Math.PI * 2), r = U.rand(50, b.spread);
        x = p.x + Math.cos(a2) * r; y = p.y + Math.sin(a2) * r;
      }
      if (game.dungeon.isSolidAt(x, y)) continue;
      game.impacts.push({
        x, y, t: 0, delay: b.delay[0] + i * b.delay[1], radius: b.radius, color: b.color,
        style: b.style || null, effect: b.effect || null, leaves: b.leaves || null,
        fromX: this.x, fromY: this.y,
        aoeDamage: def.damage * this.dmgScale, hostile: true, source: this,
      });
    }
  }

  /* Beams: cross / x (centred on you), fan (from the attacker toward you),
     sweep (from the attacker, rotating through you). */
  fireBeams(game, def, p) {
    const B = def.beams;
    const base = {
      wind: B.wind, active: B.active, width: B.width, len: B.len, color: B.color,
      damage: def.damage * this.dmgScale, effect: B.effect || null, source: this,
    };
    const ang = U.angle(this.x, this.y, p.x, p.y);
    const centred = (a) => new Beam({
      ...base, angle: a, x: p.x - Math.cos(a) * B.len / 2, y: p.y - Math.sin(a) * B.len / 2,
    });
    if (B.pattern === 'cross') game.beams.push(centred(0), centred(Math.PI / 2));
    else if (B.pattern === 'x') game.beams.push(centred(Math.PI / 4), centred(-Math.PI / 4));
    else if (B.pattern === 'fan') {
      const n = B.count || 3;
      for (let i = 0; i < n; i++) {
        game.beams.push(new Beam({ ...base, x: this.x, y: this.y, follow: this, angle: ang + (i - (n - 1) / 2) * B.gap }));
      }
    } else if (B.pattern === 'sweep') {
      const dir = U.chance(0.5) ? 1 : -1;
      game.beams.push(new Beam({
        ...base, x: this.x, y: this.y, follow: this,
        angle: ang - dir * B.arc / 2, angVel: dir * B.arc / B.active,
      }));
    }
    game.audio.laserCharge();
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
