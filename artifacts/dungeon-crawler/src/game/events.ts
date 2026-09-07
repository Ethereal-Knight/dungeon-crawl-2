/**
 * Typed contract for the Phaser <-> React bridge.
 *
 * Phaser owns the simulation. React owns the HUD and touch controls. The two
 * only talk through window CustomEvents so neither side needs a reference to
 * the other.
 */

/** Repeatable upgrade tracks sold by the merchant. */
export interface Upgrades {
  vitality: number; // max health
  focus: number; // mana regen
  reach: number; // spell distance
  luck: number; // coin drops
  strength: number; // damage
}

export interface RunState {
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  armor: number;
  maxArmor: number;
  coins: number;
  depth: number;
  kills: number;
  upgrades: Upgrades;
  /** Index into the weapon tier list in shop.ts */
  weapon: number;
  /** Index into the armor tier list in shop.ts */
  armorTier: number;
  /** Holding the key to this floor's exit door. Reset every floor. */
  hasKey: boolean;
}

/** Which shop is open and what it stocks. */
export interface ShopSession {
  kind: 'floor' | 'cave';
  /** Item ids on offer (see shop.ts). */
  offers: string[];
}

export interface ShopEvent {
  run: RunState;
  session: ShopSession;
}

export const createRunState = (): RunState => ({
  health: 100,
  maxHealth: 100,
  mana: 100,
  maxMana: 100,
  armor: 20,
  maxArmor: 20,
  coins: 0,
  depth: 1,
  kills: 0,
  upgrades: { vitality: 0, focus: 0, reach: 0, luck: 0, strength: 0 },
  weapon: 0,
  armorTier: 0,
  hasKey: false,
});

/** Phaser -> React */
export const GAME_INIT = 'game-init'; // detail: RunState
export const GAME_UPDATE = 'game-update'; // detail: RunState
export const GAME_LEVEL = 'game-level'; // detail: { depth }
export const GAME_OVER = 'game-over'; // detail: RunState
export const GAME_MESSAGE = 'game-message'; // detail: { text }
export const GAME_SHOP = 'game-shop'; // detail: ShopEvent — a shop opened or its stock changed

/** React -> Phaser */
export const GAME_ATTACK = 'game-attack';
export const GAME_SPELL = 'game-spell';
export const GAME_RESTART = 'game-restart';
export const GAME_JOYSTICK = 'game-joystick'; // detail: { x, y } in -1..1
export const GAME_BUY = 'game-buy'; // detail: { id: ShopItemId }
export const GAME_SHOP_LEAVE = 'game-shop-leave'; // continue to the next floor

export function emit<T>(name: string, detail?: T) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}
