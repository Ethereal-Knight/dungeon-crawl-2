import type { RunState, Upgrades } from './events';

/**
 * The merchant's catalogue and the pure rules for buying from it.
 *
 * Everything here is plain data + functions so React can render offers and
 * Phaser can apply purchases from the same source of truth.
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

interface UpgradeDef {
  name: string;
  description: string;
  max: number;
  /** Price for level n (0-based) */
  price: (level: number) => number;
  /** Text for the per-level effect, e.g. "+20 max health" */
  perLevel: string;
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  vitality: {
    name: 'Vitality',
    description: 'Hardier constitution.',
    perLevel: '+20 max health (and heals 20)',
    max: 6,
    price: (l) => 45 + l * 35,
  },
  focus: {
    name: 'Focus',
    description: 'Mana returns faster.',
    perLevel: '+2 mana per second',
    max: 5,
    price: (l) => 40 + l * 30,
  },
  reach: {
    name: 'Far Sight',
    description: 'Fireballs fly farther.',
    perLevel: '+1.5 tiles of spell range',
    max: 4,
    price: (l) => 40 + l * 35,
  },
  luck: {
    name: 'Luck',
    description: 'Enemies drop more loot.',
    perLevel: '+1 coin per kill, more gems',
    max: 5,
    price: (l) => 55 + l * 40,
  },
  strength: {
    name: 'Strength',
    description: 'Every hit lands harder.',
    perLevel: '+15% sword and spell damage',
    max: 6,
    price: (l) => 60 + l * 45,
  },
};

export interface Offer {
  id: ShopItemId;
  name: string;
  description: string;
  /** What the next purchase does. */
  effect: string;
  price: number;
  level: number;
  max: number;
  maxed: boolean;
  affordable: boolean;
}

export const UPGRADE_IDS: UpgradeId[] = ['vitality', 'focus', 'reach', 'luck', 'strength'];
export const SHOP_ORDER: ShopItemId[] = ['weapon', 'armor', 'repair', ...UPGRADE_IDS];

export function getOffer(run: RunState, id: ShopItemId): Offer {
  switch (id) {
    case 'weapon': {
      const level = run.weapon;
      const next = WEAPONS[level + 1];
      const current = WEAPONS[level];
      return {
        id,
        name: next ? next.name : current.name,
        description: `Wielding ${current.name} (${current.damage} dmg).`,
        effect: next ? `${next.damage} damage, longer reach, faster swing` : 'Best blade in the cave',
        price: next?.price ?? 0,
        level,
        max: WEAPONS.length - 1,
        maxed: !next,
        affordable: !!next && run.coins >= next.price,
      };
    }
    case 'armor': {
      const level = run.armorTier;
      const next = ARMORS[level + 1];
      const current = ARMORS[level];
      return {
        id,
        name: next ? next.name : current.name,
        description: `Wearing ${current.name} (${current.maxArmor} armor).`,
        effect: next ? `${next.maxArmor} max armor, fully repaired` : 'Nothing sturdier exists',
        price: next?.price ?? 0,
        level,
        max: ARMORS.length - 1,
        maxed: !next,
        affordable: !!next && run.coins >= next.price,
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
        max: 0,
        maxed: missing <= 0,
        affordable: missing > 0 && run.coins >= price,
      };
    }
    default: {
      const def = UPGRADES[id];
      const level = run.upgrades[id];
      const maxed = level >= def.max;
      const price = maxed ? 0 : def.price(level);
      return {
        id,
        name: def.name,
        description: def.description,
        effect: def.perLevel,
        price,
        level,
        max: def.max,
        maxed,
        affordable: !maxed && run.coins >= price,
      };
    }
  }
}

export function getOffers(run: RunState): Offer[] {
  return SHOP_ORDER.map((id) => getOffer(run, id));
}

/**
 * Applies a purchase in place. Returns false (and changes nothing) when the
 * item is maxed or unaffordable.
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
      run.maxArmor = ARMORS[run.armorTier].maxArmor;
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
  /** Extra coins per kill. */
  bonusCoins: number;
  /** Added probability of a gem drop. */
  gemChance: number;
}

const BASE_SPELL_LIFETIME = 650; // ms => roughly 6.5 tiles
const BASE_SPELL_DAMAGE = 25;
const BASE_SWORD_RANGE = 48;

/** Everything gameplay reads about the hero, computed from the run state. */
export function derive(run: RunState): DerivedStats {
  const u = run.upgrades;
  const weapon = WEAPONS[run.weapon] ?? WEAPONS[0];
  const power = 1 + u.strength * 0.15;
  return {
    maxHealth: 100 + u.vitality * 20,
    manaRegen: 4 + u.focus * 2,
    spellLifetime: BASE_SPELL_LIFETIME + u.reach * 150,
    swordDamage: Math.round(weapon.damage * power),
    swordRange: BASE_SWORD_RANGE + weapon.reach,
    swordCooldown: weapon.cooldown,
    spellDamage: Math.round(BASE_SPELL_DAMAGE * power),
    bonusCoins: u.luck,
    gemChance: u.luck * 0.06,
  };
}
