/* Accessories, inventory and the shop — Update 3.0.

   Four equipment slots, the same four on the player and on every companion:

     Armor      defense   (a damage-reduction layer on top of class armour)
     Boots      speed
     Ring       one specific buff — every ring does something different
     Gauntlets  damage

   There are exactly 100 accessories: 25 per slot. 24 of each slot climb a
   material ladder (rag to starforged); rings are hand-written, and one of
   them is the Cursed Totem. Wear it yourself and you lose half your HP, mana
   and stamina until 4 seconds after you take it off. Put it on a companion
   and the companion turns on you.

   Items are stored by id everywhere (bag, equipment, shop stock, saves) so a
   retune here fixes old saves instead of stranding stale numbers in them.

   Update 4.0 adds 100 more, and a fifth slot:

     Modifier   changes what your weapon does to whatever it hits — burns,
                frost, chain lightning, poison, bleeding, hexes that weaken
                or expose, and chaos that makes enemies attack each other.
                1000 to 5000 coins each.

   The rest of the 100 are a military line for Day-ZEE (16 armor, 16 boots,
   16 gauntlets, all above the old Starforged ceiling) and 24 new rings. Two
   more pieces are never sold anywhere: the Battle Tank and the Battleship
   each drop one, once. */
'use strict';

const ITEM_SLOTS = [
  { id: 'armor', name: 'Armor', icon: '⛨', stat: 'Defense' },
  { id: 'boots', name: 'Boots', icon: '⇲', stat: 'Speed' },
  { id: 'ring', name: 'Ring', icon: '◯', stat: 'Buff' },
  { id: 'gauntlets', name: 'Gauntlets', icon: '✊', stat: 'Damage' },
  { id: 'modifier', name: 'Modifier', icon: '✺', stat: 'On hit' },
];

const RARITY = [
  { id: 'common', name: 'Common', color: '#c9c2b2' },
  { id: 'rare', name: 'Rare', color: '#7ea8ff' },
  { id: 'epic', name: 'Epic', color: '#c07bff' },
  { id: 'legendary', name: 'Legendary', color: '#ffb347' },
  { id: 'cursed', name: 'Cursed', color: '#ff3b1f' },
  { id: 'unique', name: 'Unique', color: '#4fffd0' },
];

/* The ladder every non-ring slot climbs. Index is power. */
const MATERIALS = [
  'Rag', 'Leather', 'Hide', 'Studded', 'Bone', 'Chain', 'Scale', 'Bronze',
  'Iron', 'Steel', 'Silver', 'Moss', 'Grave', 'Obsidian', 'Frost', 'Ember',
  'Mithril', 'Sun', 'Void', 'Dragon', 'Saint', 'Warden', 'Abyssal', 'Starforged',
];
const SLOT_NOUNS = {
  armor: ['Vest', 'Jerkin', 'Cuirass', 'Hauberk', 'Plate', 'Mail'],
  boots: ['Wraps', 'Boots', 'Treads', 'Greaves', 'Striders', 'Sabatons'],
  gauntlets: ['Gloves', 'Bracers', 'Grips', 'Gauntlets', 'Knuckles', 'Fists'],
};

/* Rings: 25 of them, each a different rule. `kind` names the effect; the
   numbers live in `value`. Companions honour the generic kinds (maxHp,
   regen, dmgPct, crit, speedPct, defPct); player-only kinds say so. */
const RING_DEFS = [
  { name: 'Copper Band', kind: 'maxHp', value: 15, desc: '+15 maximum health.' },
  { name: 'Ring of Vigour', kind: 'maxHp', value: 35, desc: '+35 maximum health.' },
  { name: 'Heartstone Ring', kind: 'maxHp', value: 70, desc: '+70 maximum health.' },
  { name: 'Mending Loop', kind: 'regen', value: 1, desc: 'Regenerate 1 health a second.' },
  { name: 'Troll-Blood Ring', kind: 'regen', value: 3, desc: 'Regenerate 3 health a second.' },
  { name: 'Butcher\'s Signet', kind: 'killHeal', value: 4, desc: 'Every kill heals 4.', player: true },
  { name: 'Vampire Seal', kind: 'killHeal', value: 10, desc: 'Every kill heals 10.', player: true },
  { name: 'Keen Eye Ring', kind: 'crit', value: 0.08, desc: '+8% critical chance.' },
  { name: 'Assassin\'s Coil', kind: 'crit', value: 0.18, desc: '+18% critical chance.' },
  { name: 'Ring of Haste', kind: 'speedPct', value: 0.1, desc: '+10% movement speed.' },
  { name: 'Iron Will Ring', kind: 'defPct', value: 0.1, desc: 'Take 10% less damage.' },
  { name: 'Brawler\'s Ring', kind: 'dmgPct', value: 0.12, desc: '+12% damage.' },
  { name: 'Ring of Ruin', kind: 'dmgPct', value: 0.25, desc: '+25% damage.' },
  { name: 'Miser\'s Band', kind: 'gold', value: 0.35, desc: '+35% coins.', player: true },
  { name: 'Dragon Hoard Ring', kind: 'gold', value: 0.8, desc: '+80% coins.', player: true },
  { name: 'Scholar\'s Ring', kind: 'xp', value: 0.25, desc: '+25% experience.', player: true },
  { name: 'Sage\'s Loop', kind: 'xp', value: 0.5, desc: '+50% experience.', player: true },
  { name: 'Quickdraw Ring', kind: 'cooldown', value: 0.12, desc: 'Attacks recover 12% faster.', player: true },
  { name: 'Wellspring Ring', kind: 'regenPct', value: 0.35, desc: '+35% stamina and mana regeneration.', player: true },
  { name: 'Duelist\'s Ring', kind: 'parry', value: 0.5, desc: 'Your parry window is 50% longer.', player: true },
  { name: 'Featherstep Ring', kind: 'dash', value: 0.35, desc: 'Dashing costs 35% less.', player: true },
  { name: 'Thornwreath', kind: 'thorns', value: 12, desc: 'Anything that hits you takes 12 back.', player: true },
  { name: 'Lucky Clover Ring', kind: 'luck', value: 0.2, desc: '+20% chance of hearts from kills.', player: true },
  // The two named rings. Their numbers are not on a ladder.
  {
    name: 'Jarona Necklace', kind: 'jarona', value: 1, rarity: 'legendary', price: 900,
    desc: 'Necromancer only: Jarona super-dashes, 100–200 damage a dash.', player: true,
  },
  {
    name: 'Cursed Totem', kind: 'cursed', value: 0.5, rarity: 'cursed', price: 60, cursed: true,
    desc: 'Halves your HP, mana and stamina until 4s after removal. A companion who wears it turns on you.',
  },
];

/* ---------------- Update 4.0: the military line ---------------- */

const MIL_MATERIALS = [
  'Kevlar', 'Ballistic', 'Ceramic', 'Riot', 'Titanium', 'Composite', 'Hazmat', 'Graphene',
  'Recon', 'Spec-Ops', 'Nanoweave', 'Reactive', 'Exo', 'Railplate', 'Juggernaut', 'Doomsday',
];
const MIL_NOUNS = {
  armor: ['Vest', 'Rig', 'Plate Carrier', 'Exosuit'],
  boots: ['Combat Boots', 'Jump Boots', 'Treads', 'Servo Boots'],
  gauntlets: ['Tactical Gloves', 'Knuckles', 'Breachers', 'Power Fists'],
};

const RING_DEFS_4 = [
  { name: 'Soldier\'s Dog Tag', kind: 'stamina', value: 30, price: 700, desc: '+30 maximum stamina.', player: true },
  { name: 'Ammo Belt Loop', kind: 'stamina', value: 60, price: 1500, desc: '+60 maximum stamina.', player: true },
  { name: 'Arcane Battery', kind: 'mana', value: 40, price: 900, desc: 'Casters: +40 maximum mana.', player: true },
  { name: 'Overcharged Cell', kind: 'mana', value: 80, price: 1900, desc: 'Casters: +80 maximum mana.', player: true },
  { name: 'Breacher\'s Band', kind: 'heavy', value: 0.25, price: 1100, desc: 'Heavy attacks hit 25% harder.', player: true },
  { name: 'Demolition Ring', kind: 'heavy', value: 0.5, price: 2400, desc: 'Heavy attacks hit 50% harder.', player: true },
  { name: 'Giant-Slayer Signet', kind: 'bossDmg', value: 0.25, price: 1600, desc: '+25% damage to bosses and minibosses.', player: true },
  { name: 'Kingbreaker', kind: 'bossDmg', value: 0.5, price: 3200, desc: '+50% damage to bosses and minibosses.', player: true },
  { name: 'Phoenix Feather', kind: 'phoenix', value: 1, price: 3000, desc: 'Once per map, a killing blow leaves you at 30% health instead.', player: true },
  { name: 'Shockwave Loop', kind: 'knock', value: 0.6, price: 650, desc: 'Knock enemies 60% further.', player: true },
  { name: 'Long Arm Ring', kind: 'reach', value: 0.15, price: 1200, desc: 'Melee reaches 15% further.', player: true },
  { name: 'Headsman\'s Ring', kind: 'execute', value: 0.5, price: 1400, desc: '+50% damage to enemies below a third of their health.', player: true },
  { name: 'Medic\'s Band', kind: 'regen', value: 6, price: 2600, desc: 'Regenerate 6 health a second.' },
  { name: 'Titan\'s Heart', kind: 'maxHp', value: 120, price: 2200, desc: '+120 maximum health.' },
  { name: 'Field Surgeon\'s Seal', kind: 'killHeal', value: 18, price: 1700, desc: 'Every kill heals 18.', player: true },
  { name: 'Marksman\'s Coil', kind: 'crit', value: 0.28, price: 2500, desc: '+28% critical chance.' },
  { name: 'Ring of Atrocity', kind: 'dmgPct', value: 0.4, price: 2800, desc: '+40% damage.' },
  { name: 'Bunker Ring', kind: 'defPct', value: 0.2, price: 2300, desc: 'Take 20% less damage.' },
  { name: 'Sprinter\'s Band', kind: 'speedPct', value: 0.2, price: 1500, desc: '+20% movement speed.' },
  { name: 'Quartermaster\'s Ring', kind: 'gold', value: 1.5, price: 1800, desc: '+150% coins.', player: true },
  { name: 'Veteran\'s Ring', kind: 'xp', value: 1, price: 1800, desc: 'Double experience.', player: true },
  { name: 'Trigger Discipline', kind: 'cooldown', value: 0.2, price: 2100, desc: 'Attacks recover 20% faster.', player: true },
  { name: 'Riposte Ring', kind: 'parry', value: 1, price: 2000, desc: 'Your parry window is twice as long.', player: true },
  { name: 'Razorwire Ring', kind: 'thorns', value: 40, price: 1300, desc: 'Anything that hits you takes 40 back.', player: true },
];

/* Modifiers: seven families, four strengths each. Every hit you land with
   your own weapon applies the family's effect (companions and minions do
   not carry your modifier). Numbers climb with the price. */
const MODIFIER_FAMILIES = [
  {
    kind: 'burn', names: ['Ember Rune', 'Blaze Rune', 'Inferno Rune', 'Hellfire Sigil'],
    color: '#ff8a3c', values: [12, 22, 36, 55],
    desc: v => `Fire: hits set enemies burning for ${v} a second over 3 seconds.`,
  },
  {
    kind: 'frost', names: ['Frost Rune', 'Rime Rune', 'Glacier Rune', 'Absolute Zero'],
    color: '#a9dcff', values: [1.5, 2.5, 3.5, 5],
    desc: v => `Ice: hits slow enemies to a crawl for ${v}s${v >= 5 ? ', and 1 in 25 freezes them solid' : ''}.`,
  },
  {
    kind: 'shock', names: ['Spark Coil', 'Storm Coil', 'Tempest Coil', 'Thunder God\'s Coil'],
    color: '#ffe066', values: [20, 35, 55, 85],
    desc: v => `Lightning: hits arc to up to 3 nearby enemies for ${v}.`,
  },
  {
    kind: 'poison', names: ['Venom Vial', 'Toxin Vial', 'Plague Vial', 'Blight Heart'],
    color: '#8fd14a', values: [8, 14, 22, 34],
    desc: v => `Poison: each hit adds a stack — ${v} a second per stack, up to 5, for 4 seconds.`,
  },
  {
    kind: 'bleed', names: ['Serrated Edge', 'Barbed Edge', 'Hemorrhage', 'Exsanguinator'],
    color: '#ff5a5a', values: [0.06, 0.1, 0.15, 0.22],
    desc: v => `Bleed: hits open a wound that drains ${Math.round(v * 100)}% of the hit every 0.5s for 3 seconds.`,
  },
  {
    kind: 'hex', names: ['Hex of Frailty', 'Curse of Ruin', 'Doom Mark', 'Death Sentence'],
    color: '#c07bff', values: [0.15, 0.22, 0.3, 0.4],
    desc: v => `Hex: hit enemies deal ${Math.round(v * 100)}% less damage and take ${Math.round(v * 100)}% more, for 4 seconds.`,
  },
  {
    kind: 'chaos', names: ['Daze Charm', 'Vertigo Charm', 'Madness Charm', 'Chaos Engine'],
    color: '#ff7ad6', values: [0.1, 0.16, 0.24, 0.35],
    desc: v => `Chaos: ${Math.round(v * 100)}% of hits leave the enemy dizzy — it attacks its friends for 3 seconds.`,
  },
];

const UNIQUE_ITEMS = [
  {
    id: 'tank-treads', slot: 'boots', name: 'Tank Commander\'s Treads', rarity: 'unique', unique: true,
    price: 0, speed: 0.3, def: 0.12,
    desc: 'Dropped by the Battle Tank. +30% movement speed and take 12% less damage. Never sold.',
  },
  {
    id: 'broadside-gauntlets', slot: 'gauntlets', name: 'Broadside Gauntlets', rarity: 'unique', unique: true,
    price: 0, dmg: 0.55, critBonus: 0.1,
    desc: 'Dropped by the Battleship. +55% damage and +10% critical chance. Never sold.',
  },
];

function buildAccessories() {
  const out = [];
  for (const slot of ['armor', 'boots', 'gauntlets']) {
    MATERIALS.forEach((mat, i) => {
      const nouns = SLOT_NOUNS[slot];
      const noun = nouns[Math.floor(i / (MATERIALS.length / nouns.length))] || nouns[nouns.length - 1];
      const item = {
        id: `${slot}-${i + 1}`, slot, name: `${mat} ${noun}`, tierIndex: i,
        rarity: i < 8 ? 'common' : i < 16 ? 'rare' : i < 21 ? 'epic' : 'legendary',
        price: Math.round(30 + i * 22 + i * i * 3.4),
      };
      if (slot === 'armor') { item.def = 0.02 + i * 0.0065; item.desc = `Take ${Math.round(item.def * 100)}% less damage.`; }
      if (slot === 'boots') { item.speed = 0.03 + i * 0.006; item.desc = `+${Math.round(item.speed * 100)}% movement speed.`; }
      if (slot === 'gauntlets') { item.dmg = 0.04 + i * 0.011; item.desc = `+${Math.round(item.dmg * 100)}% damage.`; }
      out.push(item);
    });
    // The 25th of each slot is a one-off with a twist.
    if (slot === 'armor') out.push({ id: 'armor-25', slot, name: 'Hollow Warden\'s Shell', rarity: 'legendary', price: 1400, def: 0.2, desc: 'Take 20% less damage, and +40 maximum health.', bonusHp: 40 });
    if (slot === 'boots') out.push({ id: 'boots-25', slot, name: 'Boots of the Long Road', rarity: 'legendary', price: 1200, speed: 0.22, desc: '+22% movement speed and dashing costs 20% less.', dashCut: 0.2 });
    if (slot === 'gauntlets') out.push({ id: 'gauntlets-25', slot, name: 'Judgement\'s Knuckles', rarity: 'legendary', price: 1500, dmg: 0.35, desc: '+35% damage and +6% critical chance.', critBonus: 0.06 });
  }
  RING_DEFS.forEach((r, i) => {
    out.push({
      id: r.kind === 'cursed' ? 'cursed-totem' : r.kind === 'jarona' ? 'jarona-necklace' : `ring-${i + 1}`,
      slot: 'ring', name: r.name, ring: { kind: r.kind, value: r.value },
      rarity: r.rarity || (i % 3 === 2 ? 'epic' : i % 3 === 1 ? 'rare' : 'common'),
      price: r.price || Math.round(80 + r.value * (r.value < 1 ? 900 : 9) + i * 12),
      desc: r.desc, playerOnly: !!r.player, cursed: !!r.cursed,
    });
  });

  /* ---- Update 4.0: one hundred more ---- */
  for (const slot of ['armor', 'boots', 'gauntlets']) {
    MIL_MATERIALS.forEach((mat, i) => {
      const nouns = MIL_NOUNS[slot];
      const item = {
        id: `${slot}-m${i + 1}`, slot, name: `${mat} ${nouns[Math.floor(i / 4)]}`,
        rarity: i < 6 ? 'rare' : i < 12 ? 'epic' : 'legendary',
        price: Math.round(1000 + i * 150 + i * i * 6), mil: true,
      };
      if (slot === 'armor') { item.def = 0.18 + i * 0.009; item.desc = `Take ${Math.round(item.def * 100)}% less damage.`; }
      if (slot === 'boots') { item.speed = 0.18 + i * 0.011; item.desc = `+${Math.round(item.speed * 100)}% movement speed.`; }
      if (slot === 'gauntlets') { item.dmg = 0.31 + i * 0.02; item.desc = `+${Math.round(item.dmg * 100)}% damage.`; }
      out.push(item);
    });
  }
  RING_DEFS_4.forEach((r, i) => {
    out.push({
      id: `ring-m${i + 1}`, slot: 'ring', name: r.name, ring: { kind: r.kind, value: r.value },
      rarity: r.price >= 2500 ? 'legendary' : r.price >= 1500 ? 'epic' : 'rare',
      price: r.price, desc: r.desc, playerOnly: !!r.player, mil: true,
    });
  });
  MODIFIER_FAMILIES.forEach((fam, fi) => {
    fam.names.forEach((name, tier) => {
      const value = fam.values[tier];
      out.push({
        id: `mod-${fam.kind}-${tier + 1}`, slot: 'modifier', name,
        mod: { kind: fam.kind, value, tier: tier + 1, color: fam.color },
        rarity: ['rare', 'epic', 'legendary', 'legendary'][tier],
        // 1000 at the bottom of the cheapest family, 5000 at the top.
        price: Math.round(1000 + tier * 1250 + fi * 40),
        desc: fam.desc(value), playerOnly: true,
      });
    });
  });
  for (const u of UNIQUE_ITEMS) out.push({ ...u });
  return out;
}

const ACCESSORIES = buildAccessories();
const ACCESSORY_BY_ID = Object.fromEntries(ACCESSORIES.map(a => [a.id, a]));

/* ------------------------------------------------------------------ */
/* Applying gear. Everything is applied and removed symmetrically with  */
/* a sign, so equip/unequip can never drift a stat.                     */
/* ------------------------------------------------------------------ */

const Gear = {
  get(id) { return ACCESSORY_BY_ID[id] || null; },
  slotOf(id) { const a = this.get(id); return a ? a.slot : null; },
  rarity(item) { return RARITY.find(r => r.id === item.rarity) || RARITY[0]; },
  blankEquip() { return { armor: null, boots: null, ring: null, gauntlets: null, modifier: null }; },

  // Player: fields the rest of the game reads (see Player.equip* getters).
  applyToPlayer(p, item, sign) {
    if (item.def) p.equipDef += item.def * sign;
    if (item.speed) p.equipSpeed += item.speed * sign;
    if (item.dmg) p.equipDmg += item.dmg * sign;
    if (item.bonusHp) { p.maxHp += item.bonusHp * sign; p.hp = Math.min(p.hp, p.maxHp); }
    if (item.dashCut) p.mobCostMul *= sign > 0 ? (1 - item.dashCut) : 1 / (1 - item.dashCut);
    if (item.critBonus) p.critBonus += item.critBonus * sign;
    if (!item.ring) return;
    const { kind, value } = item.ring;
    switch (kind) {
      case 'maxHp': p.maxHp += value * sign; if (sign > 0) p.hp += value; p.hp = Math.min(p.hp, p.maxHp); break;
      case 'regen': p.hpRegen += value * sign; break;
      case 'killHeal': p.lifeOnKill += value * sign; break;
      case 'crit': p.critBonus += value * sign; break;
      case 'speedPct': p.equipSpeed += value * sign; break;
      case 'defPct': p.equipDef += value * sign; break;
      case 'dmgPct': p.equipDmg += value * sign; break;
      case 'gold': p.goldMul += value * sign; break;
      case 'xp': p.xpMul += value * sign; break;
      case 'cooldown': p.cdMul *= sign > 0 ? (1 - value) : 1 / (1 - value); break;
      case 'regenPct': p.regenMul += value * sign; break;
      case 'parry': p.parryMul += value * sign; break;
      case 'dash': p.mobCostMul *= sign > 0 ? (1 - value) : 1 / (1 - value); break;
      case 'thorns': p.thorns += value * sign; break;
      case 'luck': p.luck += value * sign; break;
      case 'jarona': p.jaronaNecklace = sign > 0; break;
      case 'cursed': if (sign > 0) p.applyCurse(); else p.liftCurse(); break;
      // Update 4.0 ring kinds.
      case 'stamina': p.maxEnergy += value * sign; p.energy = Math.min(p.energy, p.maxEnergy); break;
      case 'mana':
        if (!p.usesMana) break;
        p.maxMana += value * sign; p.mana = Math.min(p.mana, p.maxMana); break;
      case 'heavy': p.heavyMul += value * sign; break;
      case 'bossDmg': p.bossDmg += value * sign; break;
      case 'phoenix': p.phoenix = sign > 0; break;
      case 'knock': p.knockMul += value * sign; break;
      case 'reach': p.rangeMul += value * sign; break;
      case 'execute': p.executioner += value * sign; break;
    }
  },

  // Companions: a smaller set, all expressed as multipliers on the companion.
  applyToCompanion(c, item, sign) {
    if (item.def) c.gearDef += item.def * sign;
    if (item.speed) c.gearSpeed += item.speed * sign;
    if (item.dmg) c.gearDmg += item.dmg * sign;
    if (item.bonusHp) { c.maxHp += item.bonusHp * sign; c.hp = Math.min(c.hp, c.maxHp); }
    if (item.critBonus) c.gearCrit += item.critBonus * sign;
    if (!item.ring) return;
    const { kind, value } = item.ring;
    switch (kind) {
      case 'maxHp': c.maxHp += value * sign; if (sign > 0) c.hp += value; c.hp = Math.min(c.hp, c.maxHp); break;
      case 'regen': c.gearRegen += value * sign; break;
      case 'crit': c.gearCrit += value * sign; break;
      case 'speedPct': c.gearSpeed += value * sign; break;
      case 'defPct': c.gearDef += value * sign; break;
      case 'dmgPct': c.gearDmg += value * sign; break;
      // Everything else is a player-only ring; it simply does nothing here.
      // The totem is handled by the inventory, because it ends the companion.
    }
  },

  /* Equip `id` from the player's bag onto `who` (the player or one of their
     companions). Whatever was in that slot goes back to the bag. Returns the
     id displaced, if any. */
  equip(p, who, id) {
    const item = this.get(id);
    if (!item) return null;
    const bagAt = p.bag.indexOf(id);
    if (bagAt < 0) return null;
    p.bag.splice(bagAt, 1);
    const prev = who.equip[item.slot];
    if (prev) this.unequip(p, who, item.slot);
    who.equip[item.slot] = id;
    if (who === p) this.applyToPlayer(p, item, +1);
    else this.applyToCompanion(who, item, +1);
    return prev;
  },

  unequip(p, who, slot) {
    const id = who.equip[slot];
    if (!id) return null;
    const item = this.get(id);
    who.equip[slot] = null;
    if (item) {
      if (who === p) this.applyToPlayer(p, item, -1);
      else this.applyToCompanion(who, item, -1);
    }
    p.bag.push(id);
    return id;
  },
};

/* ------------------------------------------------------------------ */
/* Shop stock. Seeded per merchant so a world always offers the same     */
/* wares; deeper maps lean toward the top of the ladder.                 */
/* ------------------------------------------------------------------ */

const Shop = {
  rollStock(seed, mapNumber, count = 9) {
    const r = U.rng(seed);
    // Modifiers get their own shelf below; unique drops are never for sale.
    const pool = ACCESSORIES.filter(a => a.id !== 'cursed-totem' && !a.unique && a.slot !== 'modifier'
      // The military line is Day-ZEE kit: it only turns up from Sarapolis on.
      && (mapNumber > Maps.FIRST || !a.mil));
    const stock = [];
    const bias = mapNumber >= 3 ? 0.62 : mapNumber > Maps.FIRST ? 0.45 : 0;
    while (stock.length < count && pool.length) {
      // Skew toward cheaper items on map 1, pricier on map 2.
      const k = Math.pow(r(), mapNumber > Maps.FIRST ? 0.7 : 1.6);
      const i = U.clamp(Math.floor((k * (1 - bias) + bias * r()) * pool.length), 0, pool.length - 1);
      const sorted = pool.slice().sort((a, b) => a.price - b.price);
      const pick = sorted[i];
      stock.push(pick.id);
      pool.splice(pool.indexOf(pick), 1);
    }
    // One merchant in three is willing to part with the totem, cheaply.
    if (r.chance(0.34)) stock.push('cursed-totem');
    // And the necklace shows up often enough to plan a Necromancer around.
    if (!stock.includes('jarona-necklace') && r.chance(0.4)) stock.push('jarona-necklace');
    // Update 4.0: every peddler keeps a couple of modifiers behind the counter,
    // pricier ones the deeper you go.
    const mods = ACCESSORIES.filter(a => a.slot === 'modifier' && a.mod.tier <= mapNumber + 1);
    for (let i = 0; i < 2 + (mapNumber > Maps.FIRST ? 1 : 0) && mods.length; i++) {
      stock.push(mods.splice(r.int(0, mods.length), 1)[0].id);
    }
    return stock;
  },
};

/* ------------------------------------------------------------------ */
/* Update 4.0: modifier effects. Called from Enemy.takeDamage for every  */
/* hit the player lands with their own weapon. Damage dealt from in here */
/* is never itself a "player hit", so effects cannot chain into loops.   */
/* ------------------------------------------------------------------ */

const Mods = {
  onHit(e, game, mod, dealt) {
    const big = e.isHeavyweight;
    const v = mod.value;
    switch (mod.kind) {
      case 'burn':
        e.burnT = 3; e.burnDps = Math.max(e.burnDps || 0, v);
        break;
      case 'frost':
        e.chill = Math.max(e.chill, v);
        if (v >= 5 && !big && U.chance(0.04)) e.stun = Math.max(e.stun, 1.6);
        break;
      case 'shock': {
        let n = 0;
        for (const o of game.enemyHash.query(e.x, e.y, 200, [])) {
          if (o === e || !o.targetable || U.dist(e.x, e.y, o.x, o.y) > 200) continue;
          game.zap(e.x, e.y, o.x, o.y, mod.color);
          o.takeDamage(v, game, e.x, e.y, 60, false);
          if (++n >= 3) break;
        }
        break;
      }
      case 'poison':
        e.poisonStacks = Math.min(5, (e.poisonStacks || 0) + 1);
        e.poisonDps = v; e.poisonT = 4;
        break;
      case 'bleed':
        e.bleedT = 3; e.bleedDps = Math.max(e.bleedDps || 0, dealt * v * 2);
        break;
      case 'hex':
        e.hexT = 4; e.hexAmt = v;
        break;
      case 'chaos':
        if (!big && U.chance(v)) {
          e.dizzy = Math.max(e.dizzy || 0, 3);
          game.fx.text(e.x, e.y - e.radius - 24, 'DIZZY', mod.color, 13);
        }
        break;
    }
  },
};
