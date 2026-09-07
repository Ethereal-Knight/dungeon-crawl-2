import type { RunState, Upgrades } from './events';

/**
 * The merchant's catalogue and the pure rules for buying from it.
 *
 * Everything here is plain data + functions so React can render offers and
 * Phaser can apply purchases from the same source of truth.
 *
 * Nothing ever maxes out: named weapon and armor tiers continue as "+N"
 * enchantments, and repeatable upgrades keep climbing with rising prices.
 */

export type UpgradeId = keyof Upgrades;
export type ShopItemId = UpgradeId | 'weapon' | 'armor' | 'repair';

export interface WeaponTier {
  name: string;
  damage: number;
  /** Extra reach in px added to the base sword range. */
  reach: number;
  /** Swing cooldown in ms. */
  cooldown: number;
  price: number;
}

export interface ArmorTier {
  name: string;
  maxArmor: number;
  price: number;
}

export const WEAPONS: WeaponTier[] = [
  { name: 'Rusty Sword', damage: 15, reach: 0, cooldown: 280, price: 0 },
  { name: 'Iron Sword', damage: 22, reach: 4, cooldown: 270, price: 90 },
  { name: 'Steel Longsword', damage: 30, reach: 10, cooldown: 260, price: 200 },
  { name: 'Runed Blade', damage: 40, reach: 16, cooldown: 240, price: 380 },
  { name: 'Dragonfang', damage: 55, reach: 22, cooldown: 220, price: 650 },
];

export const ARMORS: ArmorTier[] = [
  { name: 'Padded Tunic', maxArmor: 20, price: 0 },
  { name: 'Leather Armor', maxArmor: 35, price: 70 },
  { name: 'Chainmail', maxArmor: 55, price: 160 },
  { name: 'Plate Armor', maxArmor: 80, price: 300 },
  { name: 'Mithril Plate', maxArmor: 110, price: 520 },
];

/** Growth factor applied per level once the named tiers run out. */
const ENCHANT_PRICE_GROWTH = 1.3;

/** Weapon stats for any level; beyond the named tiers they keep improving. */
export function weaponAt(level: number): WeaponTier {
  if (level < WEAPONS.length) return WEAPONS[level];
  const last = WEAPONS[WEAPONS.length - 1];
  const n = level - (WEAPONS.length - 1);
  return {
    name: `${last.name} +${n}`,
    damage: last.damage + n * 7,
    reach: Math.min(last.reach + n, 32),
    cooldown: Math.max(180, last.cooldown - n * 5),
    price: roundTo(last.price * ENCHANT_PRICE_GROWTH ** n, 10),
  };
}

/** Armor stats for any level; beyond the named tiers they keep improving. */
export function armorAt(level: number): ArmorTier {
  if (level < ARMORS.length) return ARMORS[level];
  const last = ARMORS[ARMORS.length - 1];
  const n = level - (ARMORS.length - 1);
  return {
    name: `${last.name} +${n}`,
    maxArmor: last.maxArmor + n * 25,
    price: roundTo(last.price * ENCHANT_PRICE_GROWTH ** n, 10),
  };
}

interface UpgradeDef {
  name: string;
  description: string;
  /** Price for level n (0-based); grows without bound. */
  price: (level: number) => number;
  /** Text for the per-level effect, e.g. "+20 max health" */
  perLevel: string;
}

/** Linear base cost with a gentle compounding tail so late levels stay meaningful. */
const scaling = (base: number, step: number) => (level: number) =>
  roundTo((base + level * step) * 1.1 ** level, 5);

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  vitality: {
    name: 'Vitality',
    description: 'Hardier constitution.',
    perLevel: '+20 max health (and heals 20)',
    price: scaling(45, 30),
  },
  focus: {
    name: 'Focus',
    description: 'Mana returns faster.',
    perLevel: '+2 mana per second',
    price: scaling(40, 25),
  },
  reach: {
    name: 'Far Sight',
    description: 'Fireballs fly farther.',
    perLevel: '+1.5 tiles of spell range',
    price: scaling(40, 30),
  },
  luck: {
    name: 'Luck',
    description: 'Fortune favours you, a little.',
    perLevel: 'Slightly better odds of gold, gems and extra drops',
    price: scaling(55, 35),
  },
  strength: {
    name: 'Strength',
    description: 'Every hit lands harder.',
    perLevel: '+15% sword and spell damage',
    price: scaling(60, 40),
  },
};

export interface Offer {
  id: ShopItemId;
  name: string;
  description: string;
  /** What the next purchase does. */
  effect: string;
  price: number;
  /** Current level (0-based for upgrades; tier index for gear). */
  level: number;
  /** Only `repair` can be unavailable (armor already full). */
  maxed: boolean;
  affordable: boolean;
}

export const UPGRADE_IDS: UpgradeId[] = ['vitality', 'focus', 'reach', 'luck', 'strength'];
export const SHOP_ORDER: ShopItemId[] = ['weapon', 'armor', 'repair', ...UPGRADE_IDS];

export function getOffer(run: RunState, id: ShopItemId): Offer {
  switch (id) {
    case 'weapon': {
      const level = run.weapon;
      const current = weaponAt(level);
      const next = weaponAt(level + 1);
      return {
        id,
        name: next.name,
        description: `Wielding ${current.name} (${current.damage} dmg).`,
        effect: `${next.damage} damage, ${next.reach > current.reach ? 'longer reach, ' : ''}${
          next.cooldown < current.cooldown ? 'faster swing' : 'same swing speed'
        }`,
        price: next.price,
        level,
        maxed: false,
        affordable: run.coins >= next.price,
      };
    }
    case 'armor': {
      const level = run.armorTier;
      const current = armorAt(level);
      const next = armorAt(level + 1);
      return {
        id,
        name: next.name,
        description: `Wearing ${current.name} (${current.maxArmor} armor).`,
        effect: `${next.maxArmor} max armor, fully repaired`,
        price: next.price,
        level,
        maxed: false,
        affordable: run.coins >= next.price,
      };
    }
    case 'repair': {
      const missing = run.maxArmor - run.armor;
      const price = missing > 0 ? Math.max(5, Math.ceil(missing * 1.5)) : 0;
      return {
        id,
        name: 'Repair Armor',
        description: `Armor ${run.armor}/${run.maxArmor}.`,
        effect: missing > 0 ? `Restore ${missing} armor` : 'Already in perfect shape',
        price,
        level: 0,
        maxed: missing <= 0,
        affordable: missing > 0 && run.coins >= price,
      };
    }
    default: {
      const def = UPGRADES[id];
      const level = run.upgrades[id];
      const price = def.price(level);
      return {
        id,
        name: def.name,
        description: def.description,
        effect: def.perLevel,
        price,
        level,
        maxed: false,
        affordable: run.coins >= price,
      };
    }
  }
}

export function getOffers(run: RunState, ids: readonly ShopItemId[] = SHOP_ORDER): Offer[] {
  return ids.map((id) => getOffer(run, id));
}

/**
 * Randomly stocks a shop with `count` distinct items. Repair is only stocked
 * when armor is actually damaged.
 */
export function rollOffers(run: RunState, count: number, random: () => number = Math.random): ShopItemId[] {
  const pool = SHOP_ORDER.filter((id) => id !== 'repair' || run.armor < run.maxArmor);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

export function isShopItemId(id: string): id is ShopItemId {
  return (SHOP_ORDER as string[]).includes(id);
}

/**
 * Applies a purchase in place. Returns false (and changes nothing) when the
 * item is unavailable or unaffordable.
 */
export function buy(run: RunState, id: ShopItemId): boolean {
  const offer = getOffer(run, id);
  if (offer.maxed || !offer.affordable) return false;
  run.coins -= offer.price;

  switch (id) {
    case 'weapon':
      run.weapon += 1;
      break;
    case 'armor':
      run.armorTier += 1;
      run.maxArmor = armorAt(run.armorTier).maxArmor;
      run.armor = run.maxArmor;
      break;
    case 'repair':
      run.armor = run.maxArmor;
      break;
    case 'vitality':
      run.upgrades.vitality += 1;
      run.maxHealth = derive(run).maxHealth;
      run.health = Math.min(run.maxHealth, run.health + 20);
      break;
    default:
      run.upgrades[id] += 1;
  }
  return true;
}

// ---- Derived stats -----------------------------------------------------------

export interface DerivedStats {
  maxHealth: number;
  manaRegen: number; // per second
  spellLifetime: number; // ms
  swordDamage: number;
  swordRange: number;
  swordCooldown: number;
  spellDamage: number;
  /** Probability that a dropped coin is gold (5) rather than silver (1). */
  goldChance: number;
  /** Added probability of a gem drop. */
  gemChance: number;
  /** Probability of one extra coin dropping per kill. */
  extraDropChance: number;
}

const BASE_SPELL_LIFETIME = 650; // ms => roughly 6.5 tiles
const BASE_SPELL_DAMAGE = 25;
const BASE_SWORD_RANGE = 48;

/** Everything gameplay reads about the hero, computed from the run state. */
export function derive(run: RunState): DerivedStats {
  const u = run.upgrades;
  const weapon = weaponAt(run.weapon);
  const power = 1 + u.strength * 0.15;
  return {
    maxHealth: 100 + u.vitality * 20,
    manaRegen: 4 + u.focus * 2,
    spellLifetime: BASE_SPELL_LIFETIME + u.reach * 150,
    swordDamage: Math.round(weapon.damage * power),
    swordRange: BASE_SWORD_RANGE + weapon.reach,
    swordCooldown: weapon.cooldown,
    spellDamage: Math.round(BASE_SPELL_DAMAGE * power),
    // Luck only nudges the odds; it never hands out coins directly.
    goldChance: Math.min(0.6, 0.15 + u.luck * 0.04),
    gemChance: Math.min(0.4, u.luck * 0.03),
    extraDropChance: Math.min(0.75, u.luck * 0.06),
  };
}

const roundTo = (value: number, step: number) => Math.round(value / step) * step;
