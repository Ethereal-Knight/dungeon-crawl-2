/**
 * Typed contract for the Phaser <-> React bridge.
 *
 * Phaser owns the simulation. React owns the HUD and touch controls. The two
 * only talk through window CustomEvents so neither side needs a reference to
 * the other.
 */

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
}

export const createRunState = (): RunState => ({
  health: 100,
  maxHealth: 100,
  mana: 100,
  maxMana: 100,
  armor: 20,
  maxArmor: 50,
  coins: 0,
  depth: 1,
  kills: 0,
});

/** Phaser -> React */
export const GAME_INIT = 'game-init'; // detail: RunState
export const GAME_UPDATE = 'game-update'; // detail: RunState
export const GAME_LEVEL = 'game-level'; // detail: { depth }
export const GAME_OVER = 'game-over'; // detail: RunState
export const GAME_MESSAGE = 'game-message'; // detail: { text }

/** React -> Phaser */
export const GAME_ATTACK = 'game-attack';
export const GAME_SPELL = 'game-spell';
export const GAME_RESTART = 'game-restart';
export const GAME_JOYSTICK = 'game-joystick'; // detail: { x, y } in -1..1

export function emit<T>(name: string, detail?: T) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}
