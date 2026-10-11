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
   retune here fixes old saves instead of stranding stale numbers in them. */
'use strict';

const ITEM_SLOTS = [
  { id: 'armor', name: 'Armor', icon: '⛨', stat: 'Defense' },
  { id: 'boots', name: 'Boots', icon: '⇲', stat: 'Speed' },
  { id: 'ring', name: 'Ring', icon: '◯', stat: 'Buff' },
  { id: 'gauntlets', name: 'Gauntlets', icon: '✊', stat: 'Damage' },
];

const RARITY = [
  { id: 'common', name: 'Common', color: '#c9c2b2' },
  { id: 'rare', name: 'Rare', color: '#7ea8ff' },
  { id: 'epic', name: 'Epic', color: '#c07bff' },
  { id: 'legendary', name: 'Legendary', color: '#ffb347' },
  { id: 'cursed', name: 'Cursed', color: '#ff3b1f' },
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
  blankEquip() { return { armor: null, boots: null, ring: null, gauntlets: null }; },

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
    const pool = ACCESSORIES.filter(a => a.id !== 'cursed-totem');
    const stock = [];
    const bias = mapNumber > Maps.FIRST ? 0.45 : 0;
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
    return stock;
  },
};
