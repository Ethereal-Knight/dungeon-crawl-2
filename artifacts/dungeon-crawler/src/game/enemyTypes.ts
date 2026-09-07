/**
 * The bestiary. Pure data, shared by the generator (spawn tables) and the
 * Enemy class (behaviour). No Phaser dependency.
 */

export type EnemyKind =
  | 'slime'
  | 'bat'
  | 'skeleton'
  | 'spitter'
  | 'charger'
  | 'archer'
  | 'bomber'
  | 'wraith'
  | 'spider'
  | 'mage'
  | 'golem'
  | 'bigslime'
  | 'shieldbearer'
  | 'summoner';

/**
 * How an enemy fights.
 * - chase: walk straight at the hero.
 * - flutter: chase with a side-to-side weave (bats).
 * - stationary: rooted; shoots when the hero is in sight.
 * - charger: winds up, then rushes in a straight line; stunned by walls.
 * - kiter: keeps its distance and shoots.
 * - bomber: runs in, lights its fuse, and explodes.
 * - phase: drifts through walls, fading in and out.
 * - leaper: closes in, then pounces from mid range.
 * - teleporter: blinks away when threatened, fires spread shots.
 * - slam: slow and heavy; ground-pound shockwave up close.
 * - shield: blocks most damage from the front; flank it.
 * - summoner: rooted; calls minions while any are missing.
 */
export type Behavior =
  | 'chase'
  | 'flutter'
  | 'stationary'
  | 'charger'
  | 'kiter'
  | 'bomber'
  | 'phase'
  | 'leaper'
  | 'teleporter'
  | 'slam'
  | 'shield'
  | 'summoner';

export interface ShootSpec {
  /** ms between volleys */
  rate: number;
  speed: number;
  damage: number;
  texture: 'bullet' | 'arrow';
  /** projectiles per volley (spread fan) */
  count?: number;
  /** total fan angle in radians when count > 1 */
  spread?: number;
}

export interface AoeSpec {
  radius: number;
  damage: number;
  /** telegraph time before the blast, ms */
  windup: number;
  /** ms between blasts (bombers die, so this is moot for them) */
  rate: number;
  /** trigger distance */
  range: number;
}

export interface EnemyStats {
  name: string;
  texture: string;
  hp: number;
  speed: number;
  /** contact damage */
  damage: number;
  sight: number;
  /** ms between contact hits */
  attackRate: number;
  coins: [number, number];
  /** Body weight for knockback; heavier enemies budge less. */
  mass: number;
  behavior: Behavior;
  /** First depth at which this kind can spawn. */
  minDepth: number;
  /** Relative spawn weight once unlocked. */
  weight: number;
  shoot?: ShootSpec;
  aoe?: AoeSpec;
  /** Spawns these on death. */
  splitInto?: { kind: EnemyKind; count: number };
  /** Summoner minions. */
  summon?: { kind: EnemyKind; max: number; rate: number };
  /** Ignores walls. */
  phasing?: boolean;
  /** Never moves and cannot be knocked back. */
  stationary?: boolean;
}

export const ENEMY_TYPES: Record<EnemyKind, EnemyStats> = {
  slime: {
    name: 'Slime',
    texture: 'slime',
    hp: 30,
    speed: 55,
    damage: 8,
    sight: 150,
    attackRate: 900,
    coins: [1, 2],
    mass: 1,
    behavior: 'chase',
    minDepth: 1,
    weight: 30,
  },
  bat: {
    name: 'Bat',
    texture: 'bat',
    hp: 18,
    speed: 125,
    damage: 5,
    sight: 220,
    attackRate: 700,
    coins: [1, 1],
    mass: 0.6,
    behavior: 'flutter',
    minDepth: 1,
    weight: 22,
  },
  skeleton: {
    name: 'Skeleton',
    texture: 'skeleton',
    hp: 60,
    speed: 72,
    damage: 14,
    sight: 190,
    attackRate: 1100,
    coins: [2, 4],
    mass: 1.8,
    behavior: 'chase',
    minDepth: 1,
    weight: 14,
  },
  spitter: {
    name: 'Spitter',
    texture: 'spitter',
    hp: 40,
    speed: 0,
    damage: 6,
    sight: 240,
    attackRate: 1200,
    coins: [1, 3],
    mass: 100,
    behavior: 'stationary',
    stationary: true,
    minDepth: 1,
    weight: 12,
    shoot: { rate: 1700, speed: 150, damage: 9, texture: 'bullet' },
  },
  charger: {
    name: 'Tusker',
    texture: 'charger',
    hp: 55,
    speed: 60,
    damage: 16,
    sight: 230,
    attackRate: 1000,
    coins: [2, 3],
    mass: 2.2,
    behavior: 'charger',
    minDepth: 2,
    weight: 14,
  },
  archer: {
    name: 'Goblin Archer',
    texture: 'archer',
    hp: 35,
    speed: 85,
    damage: 6,
    sight: 260,
    attackRate: 1000,
    coins: [2, 3],
    mass: 0.9,
    behavior: 'kiter',
    minDepth: 3,
    weight: 12,
    shoot: { rate: 1500, speed: 260, damage: 10, texture: 'arrow' },
  },
  bomber: {
    name: 'Fusecap',
    texture: 'bomber',
    hp: 22,
    speed: 105,
    damage: 4,
    sight: 240,
    attackRate: 1000,
    coins: [1, 2],
    mass: 0.8,
    behavior: 'bomber',
    minDepth: 3,
    weight: 12,
    aoe: { radius: 58, damage: 22, windup: 550, rate: 0, range: 36 },
  },
  wraith: {
    name: 'Wraith',
    texture: 'wraith',
    hp: 45,
    speed: 48,
    damage: 11,
    sight: 300,
    attackRate: 1100,
    coins: [2, 4],
    mass: 0.7,
    behavior: 'phase',
    phasing: true,
    minDepth: 4,
    weight: 10,
  },
  spider: {
    name: 'Cave Spider',
    texture: 'spider',
    hp: 40,
    speed: 95,
    damage: 12,
    sight: 240,
    attackRate: 900,
    coins: [1, 3],
    mass: 1,
    behavior: 'leaper',
    minDepth: 4,
    weight: 12,
  },
  mage: {
    name: 'Cultist',
    texture: 'mage',
    hp: 50,
    speed: 60,
    damage: 8,
    sight: 280,
    attackRate: 1200,
    coins: [3, 5],
    mass: 1,
    behavior: 'teleporter',
    minDepth: 5,
    weight: 10,
    shoot: { rate: 2200, speed: 170, damage: 9, texture: 'bullet', count: 3, spread: 0.6 },
  },
  golem: {
    name: 'Stone Golem',
    texture: 'golem',
    hp: 180,
    speed: 38,
    damage: 18,
    sight: 200,
    attackRate: 1400,
    coins: [4, 7],
    mass: 6,
    behavior: 'slam',
    minDepth: 6,
    weight: 7,
    aoe: { radius: 72, damage: 24, windup: 500, rate: 2600, range: 54 },
  },
  bigslime: {
    name: 'Great Slime',
    texture: 'bigslime',
    hp: 75,
    speed: 45,
    damage: 12,
    sight: 170,
    attackRate: 1000,
    coins: [2, 4],
    mass: 2.5,
    behavior: 'chase',
    minDepth: 6,
    weight: 10,
    splitInto: { kind: 'slime', count: 2 },
  },
  shieldbearer: {
    name: 'Bone Warden',
    texture: 'shieldbearer',
    hp: 90,
    speed: 55,
    damage: 16,
    sight: 200,
    attackRate: 1100,
    coins: [3, 5],
    mass: 2.5,
    behavior: 'shield',
    minDepth: 7,
    weight: 9,
  },
  summoner: {
    name: 'Bone Totem',
    texture: 'summoner',
    hp: 70,
    speed: 0,
    damage: 5,
    sight: 260,
    attackRate: 1500,
    coins: [3, 6],
    mass: 100,
    behavior: 'summoner',
    stationary: true,
    minDepth: 8,
    weight: 7,
    summon: { kind: 'bat', max: 3, rate: 3800 },
  },
};

export const ENEMY_KINDS = Object.keys(ENEMY_TYPES) as EnemyKind[];

/** Kinds that can appear at the given depth. */
export function kindsForDepth(depth: number): EnemyKind[] {
  return ENEMY_KINDS.filter((k) => ENEMY_TYPES[k].minDepth <= depth);
}

/**
 * Weighted roll. Kinds unlocked within the last two floors get a boost so a
 * new face shows up as soon as it is introduced.
 */
export function rollEnemyKind(depth: number, random: () => number = Math.random): EnemyKind {
  const kinds = kindsForDepth(depth);
  const weights = kinds.map((k) => {
    const t = ENEMY_TYPES[k];
    const fresh = depth - t.minDepth <= 1 && t.minDepth > 1 ? 1.8 : 1;
    // Early kinds thin out a little as the roster grows.
    const fade = t.minDepth === 1 ? Math.max(0.45, 1 - (depth - 1) * 0.06) : 1;
    return t.weight * fresh * fade;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = random() * total;
  for (let i = 0; i < kinds.length; i++) {
    r -= weights[i];
    if (r <= 0) return kinds[i];
  }
  return kinds[kinds.length - 1];
}
