import Phaser from 'phaser';

export const TILE = 32;

/**
 * One palette for every environment tile so variants read as the same cave.
 * Cool slate greys with a hint of indigo; moss and damp accents are muted so
 * they never compete with pickups or enemies.
 */
export const PALETTE = {
  deep: 0x0d0d15, // rock far from any floor
  deepBlotch: 0x12121c,
  wall: 0x1a1a27, // rock bordering the floor
  wallLight: 0x272738,
  wallDark: 0x111119,
  wallLip: 0x33334a, // top edge highlight
  mortar: 0x0f0f18,
  brick: 0x1f1f2d,
  brickLight: 0x292a3c,
  floor: 0x2b2b38,
  floorLight: 0x333343,
  floorDark: 0x232330,
  crack: 0x1b1b26,
  pebble: 0x3a3a4c,
  moss: 0x2f4a3c,
  mossLight: 0x3c5f4a,
  damp: 0x222b3d,
  dampLight: 0x2c3852,
  crystal: 0x5b6cd6,
  crystalLight: 0x9aa7ff,
  // Grotto (depth 4+)
  water: 0x1f3a5a,
  waterLight: 0x3a6a9a,
  mushroom: 0x7c5cd6,
  mushroomDark: 0x4c3a8a,
  vine: 0x3f7a4a,
  vineLight: 0x5ea36a,
  // Ember depths (depth 7+)
  ash: 0x34333a,
  ashLight: 0x4b4a52,
  ember: 0xf97316,
  emberDark: 0x9a3412,
  obsidian: 0x0b0a12,
  obsidianLight: 0x1c1a28,
  bone: 0xe7e0c8,
  boneDark: 0xa89f84,
  // Ancient ruins (depth 10+)
  rune: 0x22d3ee,
  runeDim: 0x0e7490,
  carved: 0x2d2d3f,
  carvedLight: 0x3b3b52,
  mosaicA: 0x7f1d1d,
  mosaicB: 0x1e3a8a,
  mosaicC: 0xa16207,
} as const;

/** Number of floor variants packed into the `floors` tileset. */
export const FLOOR_TILES = 18;
/** Number of wall variants packed into the `walls` tileset. */
export const WALL_TILES = 18;

/**
 * Every three floors the cave changes character. Era 0 (depths 1-3) is the
 * base slate cave; era 1 (4-6) adds the damp grotto set; era 2 (7-9) the
 * ember depths; era 3 (10+) the ancient ruins. Each era mixes its own tiles
 * with a little of the previous one so the transition reads as a descent.
 */
export function tileEra(depth: number) {
  return Math.min(3, Math.floor((depth - 1) / 3));
}

// Repeated entries weight a tile up; the loud ones (water, mosaic, glowing
// cracks) appear once so the floor stays readable.
const FLOOR_SETS: number[][] = [
  [], // era 0: base tiles only
  [8, 8, 9, 10, 10, 11, 11], // grotto: mushrooms, shallow water, vines, wet pebbles
  [12, 12, 12, 13, 14, 14], // ember: ash, glowing crack, scorched slab
  [15, 15, 16, 16, 16, 17], // ruins: rune slab, carved tile, broken mosaic
];
const WALL_EDGE_SETS: number[][] = [[], [8, 9, 10], [12, 14], [16, 17]];
const WALL_FACE_SETS: number[][] = [[], [11], [13], [15]];

const pickFrom = (list: number[]) => list[Math.floor(Math.random() * list.length)];

/** Era-flavoured pick: mostly the current set, sometimes the previous one. */
function eraPick(sets: number[][], era: number, chance: number): number | null {
  if (era <= 0 || Math.random() >= chance) return null;
  const usePrev = era >= 2 && Math.random() < 0.3;
  const set = sets[usePrev ? era - 1 : era];
  return set.length ? pickFrom(set) : null;
}

/** Weighted pick of a floor tile index: mostly plain, occasional detail. */
export function pickFloorTile(depth = 1): number {
  const era = eraPick(FLOOR_SETS, tileEra(depth), 0.2);
  if (era !== null) return era;
  const r = Math.random();
  if (r < 0.5) return 0; // plain
  if (r < 0.66) return 1; // speckled
  if (r < 0.76) return 2; // cracked
  if (r < 0.86) return 3; // pebbles
  if (r < 0.9) return 4; // moss
  if (r < 0.96) return 5; // worn
  if (r < 0.99) return 6; // damp
  return 7; // slab
}

export type WallContext = 'deep' | 'edge' | 'face';

/**
 * Picks a wall tile index for a wall with the given surroundings.
 * - `face`: floor directly below, so we see the front of the wall (bricks).
 * - `edge`: touches floor somewhere else (rough rock rim).
 * - `deep`: buried rock with no floor nearby.
 */
export function pickWallTile(context: WallContext, depth = 1): number {
  const era = tileEra(depth);
  const r = Math.random();
  switch (context) {
    case 'face': {
      const e = eraPick(WALL_FACE_SETS, era, 0.45);
      if (e !== null) return e;
      return r < 0.75 ? 6 : 7;
    }
    case 'edge': {
      const e = eraPick(WALL_EDGE_SETS, era, 0.4);
      if (e !== null) return e;
      if (r < 0.6) return 2;
      if (r < 0.8) return 3;
      if (r < 0.95) return 4;
      return 5;
    }
    case 'deep':
    default:
      return r < 0.7 ? 0 : 1;
  }
}

/**
 * Builds every placeholder texture the prototype uses. All art is drawn with
 * the Graphics API so it can be swapped for real sprites later without
 * touching gameplay code: keep the texture keys and roughly the same sizes.
 *
 * Every directional texture "faces right" (angle 0). Sprites are rotated to
 * their facing angle at runtime.
 */
export function createPlaceholderTextures(scene: Phaser.Scene) {
  const g = scene.add.graphics();
  g.setVisible(false);

  const gen = (key: string, w: number, h: number) => {
    g.generateTexture(key, w, h);
    g.clear();
  };

  // ---- Environment -------------------------------------------------------
  // Floor and wall variants live in their own tileset images; see
  // `drawFloorTiles` / `drawWallTiles` below. Everything here shares PALETTE.
  drawFloorTiles(g);
  gen('floors', TILE * FLOOR_TILES, TILE);
  drawWallTiles(g);
  gen('walls', TILE * WALL_TILES, TILE);

  // Exit stairs: descending stripes framed in gold.
  g.fillStyle(PALETTE.deep, 1);
  g.fillRect(0, 0, TILE, TILE);
  const steps = [PALETTE.floorLight, PALETTE.floor, PALETTE.floorDark, PALETTE.wall];
  steps.forEach((shade, i) => {
    g.fillStyle(shade, 1);
    g.fillRect(4, 4 + i * 6, TILE - 8, 5);
  });
  g.lineStyle(2, 0xfbbf24, 1);
  g.strokeRect(1, 1, TILE - 2, TILE - 2);
  gen('stairs', TILE, TILE);

  // ---- Player ------------------------------------------------------------

  // Soft shadow shared by all characters.
  g.fillStyle(0x000000, 0.35);
  g.fillEllipse(14, 7, 26, 12);
  gen('shadow', 28, 14);

  // The hero itself is a pixel-art sprite sheet; see ./hero/heroSheet.ts.

  // Slash arc: a translucent wedge, centered on the hero, opening to the right.
  g.fillStyle(0xffffff, 0.55);
  g.slice(28, 28, 26, -1.15, 1.15, false);
  g.fillPath();
  g.fillStyle(0xbfdbfe, 0.7);
  g.slice(28, 28, 26, -0.45, 0.45, false);
  g.fillPath();
  gen('slash', 56, 56);

  // ---- Enemies -----------------------------------------------------------

  // Slime: green blob with eyes.
  g.fillStyle(0x15803d, 1);
  g.fillEllipse(14, 16, 26, 20);
  g.fillStyle(0x22c55e, 1);
  g.fillEllipse(14, 15, 22, 17);
  g.fillStyle(0x86efac, 1);
  g.fillEllipse(10, 10, 8, 5);
  g.fillStyle(0x052e16, 1);
  g.fillCircle(11, 17, 2);
  g.fillCircle(18, 17, 2);
  gen('slime', 28, 28);

  // Bat: purple body with two swept wings, facing right.
  g.fillStyle(0x6b21a8, 1);
  g.beginPath();
  g.moveTo(14, 12);
  g.lineTo(2, 2);
  g.lineTo(6, 12);
  g.lineTo(2, 22);
  g.closePath();
  g.fillPath();
  g.fillStyle(0x7e22ce, 1);
  g.beginPath();
  g.moveTo(14, 12);
  g.lineTo(26, 2);
  g.lineTo(22, 12);
  g.lineTo(26, 22);
  g.closePath();
  g.fillPath();
  g.fillStyle(0xa855f7, 1);
  g.fillCircle(14, 12, 6);
  g.fillStyle(0xfef08a, 1);
  g.fillCircle(16, 10, 1.5);
  g.fillCircle(16, 14, 1.5);
  gen('bat', 28, 24);

  // Skeleton: bone-white block, dark eye sockets, a little rusted blade.
  g.fillStyle(0x9ca3af, 1);
  g.fillRoundedRect(3, 3, 22, 22, 5);
  g.fillStyle(0xe5e7eb, 1);
  g.fillRoundedRect(5, 5, 18, 18, 4);
  g.fillStyle(0x111827, 1);
  g.fillCircle(15, 11, 2.5);
  g.fillCircle(15, 18, 2.5);
  g.fillRect(12, 20, 8, 1.5);
  g.fillStyle(0x9a3412, 1);
  g.fillRect(22, 13, 8, 3);
  gen('skeleton', 30, 28);

  // Spitter: a rooted eye-bulb that never moves but spits bolts. Faces right.
  g.fillStyle(0x2e1065, 1);
  g.fillRect(6, 22, 3, 5);
  g.fillRect(12, 23, 3, 4);
  g.fillRect(19, 22, 3, 5);
  g.fillStyle(0x4c1d95, 1);
  g.fillEllipse(14, 14, 24, 20);
  g.fillStyle(0x6d28d9, 1);
  g.fillEllipse(12, 9, 10, 6);
  g.fillStyle(0xf5f3ff, 1);
  g.fillEllipse(16, 14, 13, 10);
  g.fillStyle(0xd946ef, 1);
  g.fillCircle(18, 14, 4);
  g.fillStyle(0x1e1b4b, 1);
  g.fillCircle(19, 14, 2);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(17, 12, 1);
  gen('spitter', 28, 28);

  // Spitter bolt.
  g.fillStyle(0xa21caf, 1);
  g.fillCircle(5, 5, 5);
  g.fillStyle(0xe879f9, 1);
  g.fillCircle(5, 5, 3.2);
  g.fillStyle(0xfae8ff, 1);
  g.fillCircle(5, 5, 1.4);
  gen('bullet', 10, 10);

  // Tusker: a low, broad boar-beetle with tusks. Faces right.
  g.fillStyle(0x3f2a1a, 1);
  g.fillEllipse(14, 16, 26, 16);
  g.fillStyle(0x6b4423, 1);
  g.fillEllipse(13, 15, 22, 12);
  g.fillStyle(0x8b5a2b, 1);
  g.fillEllipse(10, 12, 10, 5);
  g.fillStyle(0xf5f5f4, 1);
  g.fillRect(23, 17, 5, 2);
  g.fillRect(24, 13, 4, 2);
  g.fillStyle(0xef4444, 1);
  g.fillCircle(20, 13, 1.5);
  g.fillStyle(0x2a1a0f, 1);
  g.fillRect(6, 22, 3, 4);
  g.fillRect(12, 23, 3, 4);
  g.fillRect(18, 22, 3, 4);
  gen('charger', 30, 28);

  // Goblin archer: green, hunched, bow held forward.
  g.fillStyle(0x3f6212, 1);
  g.fillEllipse(12, 10, 12, 11);
  g.fillStyle(0x65a30d, 1);
  g.fillEllipse(12, 9, 10, 9);
  g.fillStyle(0x4d7c0f, 1);
  g.fillRect(8, 15, 9, 9);
  g.fillStyle(0x78350f, 1);
  g.fillRect(8, 19, 9, 2);
  g.fillStyle(0xfef08a, 1);
  g.fillCircle(14, 9, 1.5);
  g.fillStyle(0x14532d, 1);
  g.fillRect(6, 7, 3, 2); // ear
  g.lineStyle(2, 0x92400e, 1);
  g.beginPath();
  g.arc(21, 16, 8, -1.3, 1.3, false);
  g.strokePath();
  g.lineStyle(1, 0xe5e7eb, 1);
  g.beginPath();
  g.moveTo(23, 8);
  g.lineTo(23, 24);
  g.strokePath();
  g.fillStyle(0x3a2a1a, 1);
  g.fillRect(8, 24, 3, 3);
  g.fillRect(13, 24, 3, 3);
  gen('archer', 28, 28);

  // Fusecap: red mushroom with a lit fuse.
  g.fillStyle(0x7f1d1d, 1);
  g.fillEllipse(14, 14, 24, 14);
  g.fillStyle(0xdc2626, 1);
  g.fillEllipse(14, 13, 20, 11);
  g.fillStyle(0xfef2f2, 1);
  g.fillCircle(9, 12, 2);
  g.fillCircle(17, 10, 2);
  g.fillCircle(20, 15, 1.5);
  g.fillStyle(0xf5e6c8, 1);
  g.fillRect(10, 19, 8, 7);
  g.fillStyle(0x1f1f2e, 1);
  g.fillCircle(12, 22, 1);
  g.fillCircle(16, 22, 1);
  g.fillStyle(0x4a3220, 1);
  g.fillRect(14, 2, 1, 6);
  g.fillStyle(0xf97316, 1);
  g.fillCircle(14, 2, 2);
  g.fillStyle(0xfde047, 1);
  g.fillCircle(14, 2, 1);
  gen('bomber', 28, 28);

  // Wraith: a pale tattered spirit with hollow eyes.
  g.fillStyle(0x7dd3fc, 0.55);
  g.fillEllipse(14, 11, 18, 18);
  g.fillRect(5, 11, 18, 10);
  g.beginPath();
  g.moveTo(5, 21);
  g.lineTo(8, 27);
  g.lineTo(11, 21);
  g.lineTo(14, 27);
  g.lineTo(17, 21);
  g.lineTo(20, 27);
  g.lineTo(23, 21);
  g.closePath();
  g.fillPath();
  g.fillStyle(0xe0f2fe, 0.8);
  g.fillEllipse(14, 10, 12, 12);
  g.fillStyle(0x0f172a, 1);
  g.fillEllipse(11, 10, 3, 4);
  g.fillEllipse(17, 10, 3, 4);
  g.fillEllipse(14, 15, 2, 3);
  gen('wraith', 28, 28);

  // Cave spider: two dark segments, eight legs, red eyes. Faces right.
  g.lineStyle(2, 0x111827, 1);
  for (const [x1, y1, x2, y2] of [
    [10, 14, 2, 6],
    [10, 16, 1, 16],
    [10, 18, 3, 26],
    [12, 19, 8, 27],
    [18, 14, 26, 6],
    [18, 16, 27, 16],
    [18, 18, 25, 26],
    [16, 19, 20, 27],
  ]) {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.strokePath();
  }
  g.fillStyle(0x1f2937, 1);
  g.fillEllipse(12, 16, 12, 10);
  g.fillStyle(0x111827, 1);
  g.fillCircle(19, 15, 4.5);
  g.fillStyle(0x374151, 1);
  g.fillEllipse(11, 14, 6, 3);
  g.fillStyle(0xef4444, 1);
  g.fillCircle(21, 14, 1.2);
  g.fillCircle(20, 16.5, 1);
  g.fillCircle(22, 16.5, 1);
  gen('spider', 28, 28);

  // Cultist: dark robe, deep hood, purple eyes, staff.
  g.fillStyle(0x1e1b4b, 1);
  g.beginPath();
  g.moveTo(14, 2);
  g.lineTo(22, 12);
  g.lineTo(23, 27);
  g.lineTo(5, 27);
  g.lineTo(6, 12);
  g.closePath();
  g.fillPath();
  g.fillStyle(0x312e81, 1);
  g.fillRect(9, 13, 10, 12);
  g.fillStyle(0x0b0a1a, 1);
  g.fillEllipse(14, 10, 8, 6);
  g.fillStyle(0xc084fc, 1);
  g.fillRect(11, 9, 2, 1);
  g.fillRect(15, 9, 2, 1);
  g.fillStyle(0x6b4423, 1);
  g.fillRect(24, 4, 2, 22);
  g.fillStyle(0xa855f7, 1);
  g.fillCircle(25, 4, 3);
  g.fillStyle(0xf3e8ff, 1);
  g.fillCircle(25, 4, 1.2);
  gen('mage', 28, 28);

  // Stone golem: stacked slabs with a molten core.
  g.fillStyle(0x3f3f46, 1);
  g.fillRoundedRect(4, 2, 24, 12, 3);
  g.fillRect(2, 12, 28, 14);
  g.fillRect(4, 26, 9, 5);
  g.fillRect(19, 26, 9, 5);
  g.fillStyle(0x52525b, 1);
  g.fillRoundedRect(6, 3, 20, 9, 3);
  g.fillRect(4, 13, 24, 11);
  g.fillStyle(0x27272a, 1);
  g.fillRect(2, 14, 4, 12); // arms
  g.fillRect(26, 14, 4, 12);
  g.fillRect(12, 6, 3, 2);
  g.fillRect(19, 6, 3, 2);
  g.fillStyle(0xf97316, 1);
  g.fillRect(12, 6, 2, 2);
  g.fillRect(19, 6, 2, 2);
  g.fillCircle(16, 18, 3.5);
  g.fillStyle(0xfde047, 1);
  g.fillCircle(16, 18, 1.5);
  gen('golem', 32, 32);

  // Great slime: a much bigger slime with a crown of bumps.
  g.fillStyle(0x15803d, 1);
  g.fillEllipse(18, 18, 34, 24);
  g.fillStyle(0x22c55e, 1);
  g.fillEllipse(18, 17, 30, 20);
  g.fillStyle(0x16a34a, 1);
  g.fillCircle(8, 9, 3);
  g.fillCircle(18, 5, 3.5);
  g.fillCircle(28, 9, 3);
  g.fillStyle(0x86efac, 1);
  g.fillEllipse(12, 12, 10, 5);
  g.fillStyle(0x052e16, 1);
  g.fillCircle(14, 19, 2.5);
  g.fillCircle(23, 19, 2.5);
  g.fillRect(16, 24, 6, 1.5);
  gen('bigslime', 36, 30);

  // Bone Warden: skeleton with a round shield held forward (right).
  g.fillStyle(0x9ca3af, 1);
  g.fillRoundedRect(2, 3, 18, 22, 5);
  g.fillStyle(0xe5e7eb, 1);
  g.fillRoundedRect(4, 5, 14, 18, 4);
  g.fillStyle(0x111827, 1);
  g.fillCircle(12, 10, 2.2);
  g.fillCircle(12, 16, 2.2);
  g.fillStyle(0x7c2d12, 1);
  g.fillRect(6, 24, 4, 4);
  g.fillRect(12, 24, 4, 4);
  g.fillStyle(0x4b5563, 1);
  g.fillCircle(24, 14, 8);
  g.fillStyle(0x9ca3af, 1);
  g.fillCircle(24, 14, 6.5);
  g.fillStyle(0xe8bb4c, 1);
  g.fillCircle(24, 14, 2.2);
  g.lineStyle(1, 0x374151, 1);
  g.strokeCircle(24, 14, 4.5);
  gen('shieldbearer', 32, 28);

  // Bone Totem: a stack of skulls on a dark pillar, humming with power.
  g.fillStyle(0x1f1b2e, 1);
  g.fillRect(9, 4, 10, 24);
  g.fillRect(6, 26, 16, 4);
  g.fillStyle(0x2d2842, 1);
  g.fillRect(11, 4, 3, 22);
  g.fillStyle(0xe7e0c8, 1);
  g.fillRoundedRect(8, 2, 12, 9, 4);
  g.fillRoundedRect(9, 12, 10, 8, 3);
  g.fillStyle(0xa855f7, 1);
  g.fillRect(11, 5, 2, 2);
  g.fillRect(15, 5, 2, 2);
  g.fillStyle(0x0b0a1a, 1);
  g.fillRect(11, 15, 2, 2);
  g.fillRect(15, 15, 2, 2);
  g.fillStyle(0xc084fc, 1);
  g.fillCircle(14, 24, 2);
  g.fillStyle(0x7e22ce, 1);
  g.fillCircle(4, 10, 1.5);
  g.fillCircle(24, 8, 1.5);
  gen('summoner', 28, 30);

  // Arrow projectile, pointing right.
  g.fillStyle(0x92400e, 1);
  g.fillRect(0, 1, 10, 2);
  g.fillStyle(0xd1d5db, 1);
  g.beginPath();
  g.moveTo(10, 0);
  g.lineTo(14, 2);
  g.lineTo(10, 4);
  g.closePath();
  g.fillPath();
  g.fillStyle(0xf5f5f4, 1);
  g.fillRect(0, 0, 3, 1);
  g.fillRect(0, 3, 3, 1);
  gen('arrow', 14, 4);

  // Shockwave ring for ground slams and explosions.
  g.lineStyle(4, 0xffffff, 1);
  g.strokeCircle(32, 32, 28);
  gen('ring', 64, 64);

  // Key to the exit door.
  g.fillStyle(0xb45309, 1);
  g.fillCircle(5, 6, 4.5);
  g.fillRect(8, 5, 8, 3);
  g.fillRect(12, 8, 2, 2);
  g.fillRect(15, 8, 1, 3);
  g.fillStyle(0xfbbf24, 1);
  g.fillCircle(5, 6, 3.2);
  g.fillRect(8, 5, 8, 1.5);
  g.fillStyle(0x1a0e05, 1);
  g.fillCircle(5, 6, 1.4);
  gen('key', 16, 16);

  // Locked door: iron gate over the stairs, gold padlock.
  g.fillStyle(0x1a1a27, 1);
  g.fillRect(0, 0, TILE, TILE);
  g.fillStyle(0x4b5563, 1);
  g.fillRect(0, 0, TILE, 3);
  g.fillRect(0, TILE - 3, TILE, 3);
  g.fillRect(0, 0, 3, TILE);
  g.fillRect(TILE - 3, 0, 3, TILE);
  for (let x = 7; x < TILE - 3; x += 6) g.fillRect(x, 3, 2, TILE - 6);
  g.fillRect(3, 14, TILE - 6, 3);
  g.fillStyle(0x9ca3af, 1);
  g.fillRect(0, 0, TILE, 1);
  g.fillStyle(0xb45309, 1);
  g.fillRoundedRect(11, 12, 10, 9, 2);
  g.fillStyle(0xfbbf24, 1);
  g.fillRoundedRect(12, 13, 8, 7, 2);
  g.lineStyle(2, 0xfbbf24, 1);
  g.beginPath();
  g.arc(16, 12, 3, Math.PI, 0, false);
  g.strokePath();
  g.fillStyle(0x1a0e05, 1);
  g.fillRect(15, 15, 2, 3);
  gen('door', TILE, TILE);

  // Wandering merchant: plum robe, wide hat, lantern.
  g.fillStyle(0x3b0764, 1);
  g.beginPath();
  g.moveTo(14, 8);
  g.lineTo(22, 14);
  g.lineTo(24, 30);
  g.lineTo(4, 30);
  g.lineTo(6, 14);
  g.closePath();
  g.fillPath();
  g.fillStyle(0x581c87, 1);
  g.fillRect(9, 16, 10, 12);
  g.fillStyle(0xe8bb4c, 1);
  g.fillRect(9, 22, 10, 1);
  g.fillStyle(0xe9b58c, 1);
  g.fillEllipse(14, 11, 8, 6);
  g.fillStyle(0x1f1b2e, 1);
  g.fillRect(12, 10, 1.5, 1.5);
  g.fillRect(15, 10, 1.5, 1.5);
  g.fillStyle(0x27114a, 1);
  g.fillEllipse(14, 7, 20, 5);
  g.fillRect(9, 2, 10, 5);
  g.fillStyle(0x6b4423, 1);
  g.fillRect(25, 12, 1, 8);
  g.fillStyle(0xfbbf24, 1);
  g.fillRoundedRect(23, 19, 5, 6, 1);
  g.fillStyle(0xfff7cc, 1);
  g.fillRect(24, 20, 3, 4);
  gen('merchant', 30, 32);

  // Treasure chest, intact and cracked. Takes three hits to break open.
  const chest = (cracked: boolean) => {
    g.fillStyle(0x4a2a10, 1);
    g.fillRoundedRect(1, 3, 26, 20, 3);
    g.fillStyle(0x7c4a1e, 1);
    g.fillRect(3, 5, 22, 16);
    g.fillStyle(0xa0642c, 1);
    g.fillRect(3, 5, 22, 3);
    g.fillStyle(0x4a2a10, 1);
    g.fillRect(3, 11, 22, 2);
    g.fillRect(8, 5, 2, 16);
    g.fillRect(18, 5, 2, 16);
    g.fillStyle(0xe8bb4c, 1);
    g.fillRect(12, 9, 4, 6);
    g.fillStyle(0x92400e, 1);
    g.fillRect(13, 12, 2, 2);
    if (cracked) {
      g.lineStyle(1, 0x1a0e05, 1);
      g.beginPath();
      g.moveTo(5, 6);
      g.lineTo(9, 12);
      g.lineTo(7, 19);
      g.strokePath();
      g.beginPath();
      g.moveTo(22, 7);
      g.lineTo(19, 14);
      g.lineTo(23, 20);
      g.strokePath();
      g.fillStyle(0x1a0e05, 1);
      g.fillRect(3, 8, 22, 1); // lid knocked ajar
    }
  };
  chest(false);
  gen('chest', 28, 24);
  chest(true);
  gen('chest-cracked', 28, 24);

  // ---- Pickups -----------------------------------------------------------

  g.fillStyle(0xb45309, 1);
  g.fillCircle(8, 8, 7);
  g.fillStyle(0xfbbf24, 1);
  g.fillCircle(8, 8, 5.5);
  g.fillStyle(0xfde68a, 1);
  g.fillRect(7, 4, 2, 8);
  gen('coin', 16, 16);

  // Silver coin: worth 1, the everyday drop.
  g.fillStyle(0x6b7280, 1);
  g.fillCircle(7, 7, 6);
  g.fillStyle(0xd1d5db, 1);
  g.fillCircle(7, 7, 4.5);
  g.fillStyle(0xf3f4f6, 1);
  g.fillRect(6, 4, 2, 6);
  gen('silver', 14, 14);

  g.fillStyle(0x0e7490, 1);
  g.beginPath();
  g.moveTo(8, 1);
  g.lineTo(15, 8);
  g.lineTo(8, 15);
  g.lineTo(1, 8);
  g.closePath();
  g.fillPath();
  g.fillStyle(0x67e8f9, 1);
  g.beginPath();
  g.moveTo(8, 3);
  g.lineTo(12, 8);
  g.lineTo(8, 12);
  g.lineTo(4, 8);
  g.closePath();
  g.fillPath();
  gen('gem', 16, 16);

  // Food: a roast drumstick. Eating restores health.
  g.fillStyle(0xf5f5f4, 1);
  g.fillRect(2, 11, 6, 3);
  g.fillCircle(2, 11, 2);
  g.fillCircle(2, 15, 2);
  g.fillStyle(0xb45309, 1);
  g.fillEllipse(11, 8, 11, 12);
  g.fillStyle(0xd97706, 1);
  g.fillEllipse(12, 7, 6, 6);
  gen('food', 16, 16);

  // ---- Effects -----------------------------------------------------------

  g.fillStyle(0xf97316, 1);
  g.fillCircle(8, 8, 7);
  g.fillStyle(0xfde047, 1);
  g.fillCircle(8, 8, 4);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(8, 8, 1.8);
  gen('fireball', 16, 16);

  g.fillStyle(0xffffff, 1);
  g.fillCircle(4, 4, 4);
  gen('spark', 8, 8);

  g.destroy();

  // Vignette: radial gradient drawn with a canvas texture, stretched over
  // the camera to darken the edges of the cave.
  if (!scene.textures.exists('vignette')) {
    const size = 256;
    const canvas = scene.textures.createCanvas('vignette', size, size);
    if (canvas) {
      const ctx = canvas.getContext();
      const grad = ctx.createRadialGradient(
        size / 2,
        size / 2,
        size * 0.25,
        size / 2,
        size / 2,
        size * 0.7,
      );
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.85)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      canvas.refresh();
    }
  }
}

// ---- Tileset drawing ---------------------------------------------------------

/** Deterministic pseudo-random so a tile variant looks identical everywhere. */
function seeded(seed: number) {
  let t = seed;
  return () => {
    t = (t * 1664525 + 1013904223) % 4294967296;
    return t / 4294967296;
  };
}

function drawFloorTiles(g: Phaser.GameObjects.Graphics) {
  const base = (i: number, color: number = PALETTE.floor) => {
    g.fillStyle(color, 1);
    g.fillRect(i * TILE, 0, TILE, TILE);
  };
  const dot = (i: number, x: number, y: number, size: number, color: number) => {
    g.fillStyle(color, 1);
    g.fillRect(i * TILE + x, y, size, size);
  };

  // 0: plain
  base(0);
  dot(0, 9, 21, 1, PALETTE.floorDark);

  // 1: speckled
  base(1);
  const rnd1 = seeded(11);
  for (let n = 0; n < 9; n++) {
    const x = 2 + Math.floor(rnd1() * 28);
    const y = 2 + Math.floor(rnd1() * 28);
    dot(1, x, y, n % 3 === 0 ? 2 : 1, n % 2 ? PALETTE.pebble : PALETTE.floorDark);
  }

  // 2: cracked
  base(2);
  g.lineStyle(1, PALETTE.crack, 1);
  g.beginPath();
  g.moveTo(2 * TILE + 6, 4);
  g.lineTo(2 * TILE + 12, 12);
  g.lineTo(2 * TILE + 10, 19);
  g.lineTo(2 * TILE + 18, 27);
  g.strokePath();
  g.beginPath();
  g.moveTo(2 * TILE + 12, 12);
  g.lineTo(2 * TILE + 20, 10);
  g.strokePath();

  // 3: pebbles
  base(3);
  const pebbles: Array<[number, number, number]> = [
    [7, 8, 3],
    [20, 6, 2],
    [14, 18, 4],
    [25, 22, 3],
    [6, 25, 2],
  ];
  for (const [x, y, r] of pebbles) {
    g.fillStyle(PALETTE.floorDark, 1);
    g.fillCircle(3 * TILE + x + 1, y + 1, r);
    g.fillStyle(PALETTE.pebble, 1);
    g.fillCircle(3 * TILE + x, y, r);
  }

  // 4: moss patch
  base(4);
  g.fillStyle(PALETTE.moss, 1);
  g.fillEllipse(4 * TILE + 18, 19, 20, 14);
  g.fillEllipse(4 * TILE + 9, 11, 10, 8);
  g.fillStyle(PALETTE.mossLight, 1);
  g.fillEllipse(4 * TILE + 20, 17, 8, 5);
  dot(4, 26, 8, 2, PALETTE.moss);

  // 5: worn / scuffed patch
  base(5);
  g.fillStyle(PALETTE.floorDark, 1);
  g.fillEllipse(5 * TILE + 13, 17, 18, 11);
  g.fillEllipse(5 * TILE + 21, 12, 12, 8);
  dot(5, 8, 24, 1, PALETTE.crack);
  dot(5, 24, 22, 1, PALETTE.crack);

  // 6: damp puddle
  base(6);
  g.fillStyle(PALETTE.damp, 1);
  g.fillEllipse(6 * TILE + 15, 17, 22, 14);
  g.fillStyle(PALETTE.dampLight, 1);
  g.fillEllipse(6 * TILE + 12, 14, 8, 3);
  dot(6, 22, 20, 2, PALETTE.dampLight);

  // 7: slab (an old paved stone poking through the cave floor)
  base(7);
  g.fillStyle(PALETTE.floorLight, 1);
  g.fillRect(7 * TILE + 3, 3, TILE - 6, TILE - 6);
  g.lineStyle(1, PALETTE.floorDark, 1);
  g.strokeRect(7 * TILE + 3.5, 3.5, TILE - 7, TILE - 7);
  g.beginPath();
  g.moveTo(7 * TILE + 3, 16);
  g.lineTo(7 * TILE + 12, 16);
  g.strokePath();
  dot(7, 22, 10, 2, PALETTE.floor);

  // ---- Grotto set (8-11) ----
  // 8: mushroom cluster
  base(8);
  const caps: Array<[number, number, number]> = [
    [10, 20, 4],
    [17, 14, 3],
    [22, 22, 3],
  ];
  for (const [x, y, r] of caps) {
    g.fillStyle(PALETTE.boneDark, 1);
    g.fillRect(8 * TILE + x - 1, y, 2, r + 2);
    g.fillStyle(PALETTE.mushroomDark, 1);
    g.fillEllipse(8 * TILE + x, y, r * 2 + 2, r + 2);
    g.fillStyle(PALETTE.mushroom, 1);
    g.fillEllipse(8 * TILE + x, y - 1, r * 2 - 1, r);
    dot(8, x - 1, y - 2, 1, PALETTE.floorLight);
  }
  // 9: shallow water
  base(9, PALETTE.water);
  g.fillStyle(PALETTE.waterLight, 1);
  g.fillRect(9 * TILE + 4, 8, 9, 1);
  g.fillRect(9 * TILE + 18, 14, 8, 1);
  g.fillRect(9 * TILE + 7, 22, 11, 1);
  g.fillStyle(PALETTE.floorDark, 1);
  g.fillRect(9 * TILE, 0, TILE, 2);
  g.fillRect(9 * TILE, 0, 2, TILE);
  // 10: vine-covered floor
  base(10);
  g.lineStyle(2, PALETTE.vine, 1);
  g.beginPath();
  g.moveTo(10 * TILE + 2, 6);
  g.lineTo(10 * TILE + 12, 12);
  g.lineTo(10 * TILE + 18, 24);
  g.lineTo(10 * TILE + 30, 28);
  g.strokePath();
  g.beginPath();
  g.moveTo(10 * TILE + 12, 12);
  g.lineTo(10 * TILE + 24, 8);
  g.strokePath();
  g.fillStyle(PALETTE.vineLight, 1);
  g.fillEllipse(10 * TILE + 14, 13, 5, 3);
  g.fillEllipse(10 * TILE + 22, 9, 5, 3);
  g.fillEllipse(10 * TILE + 19, 23, 5, 3);
  // 11: wet pebbles
  base(11);
  g.fillStyle(PALETTE.damp, 1);
  g.fillEllipse(11 * TILE + 16, 16, 26, 20);
  for (const [x, y, r] of pebbles) {
    g.fillStyle(PALETTE.floorDark, 1);
    g.fillCircle(11 * TILE + x + 1, y + 1, r);
    g.fillStyle(PALETTE.pebble, 1);
    g.fillCircle(11 * TILE + x, y, r);
    dot(11, x - 1, y - 1, 1, PALETTE.dampLight);
  }

  // ---- Ember set (12-14) ----
  // 12: ash floor
  base(12, PALETTE.ash);
  const rnd12 = seeded(77);
  for (let n = 0; n < 12; n++) {
    dot(12, 1 + Math.floor(rnd12() * 30), 1 + Math.floor(rnd12() * 30), 1, n % 3 ? PALETTE.ashLight : PALETTE.floorDark);
  }
  // 13: ember crack (glowing)
  base(13, PALETTE.ash);
  g.lineStyle(3, PALETTE.emberDark, 1);
  g.beginPath();
  g.moveTo(13 * TILE + 4, 26);
  g.lineTo(13 * TILE + 12, 16);
  g.lineTo(13 * TILE + 20, 14);
  g.lineTo(13 * TILE + 28, 4);
  g.strokePath();
  g.lineStyle(1, PALETTE.ember, 1);
  g.beginPath();
  g.moveTo(13 * TILE + 4, 26);
  g.lineTo(13 * TILE + 12, 16);
  g.lineTo(13 * TILE + 20, 14);
  g.lineTo(13 * TILE + 28, 4);
  g.strokePath();
  dot(13, 14, 15, 1, 0xfde047);
  // 14: scorched slab
  base(14, PALETTE.ash);
  g.fillStyle(PALETTE.obsidianLight, 1);
  g.fillRect(14 * TILE + 3, 3, TILE - 6, TILE - 6);
  g.fillStyle(PALETTE.obsidian, 1);
  g.fillRect(14 * TILE + 3, 3, 8, 6);
  g.fillRect(14 * TILE + 20, 20, 9, 9);
  g.lineStyle(1, PALETTE.emberDark, 1);
  g.strokeRect(14 * TILE + 3.5, 3.5, TILE - 7, TILE - 7);

  // ---- Ruins set (15-17) ----
  // 15: rune slab
  base(15, PALETTE.carved);
  g.fillStyle(PALETTE.carvedLight, 1);
  g.fillRect(15 * TILE + 2, 2, TILE - 4, TILE - 4);
  g.lineStyle(1, PALETTE.rune, 1);
  g.beginPath();
  g.moveTo(15 * TILE + 16, 7);
  g.lineTo(15 * TILE + 16, 25);
  g.moveTo(15 * TILE + 10, 12);
  g.lineTo(15 * TILE + 22, 12);
  g.moveTo(15 * TILE + 11, 21);
  g.lineTo(15 * TILE + 16, 16);
  g.lineTo(15 * TILE + 21, 21);
  g.strokePath();
  dot(15, 15, 6, 2, PALETTE.runeDim);
  // 16: carved tile
  base(16, PALETTE.carved);
  g.fillStyle(PALETTE.carvedLight, 1);
  g.fillRect(16 * TILE + 2, 2, 12, 12);
  g.fillRect(16 * TILE + 18, 2, 12, 12);
  g.fillRect(16 * TILE + 2, 18, 12, 12);
  g.fillRect(16 * TILE + 18, 18, 12, 12);
  g.fillStyle(PALETTE.floorDark, 1);
  g.fillRect(16 * TILE + 6, 6, 4, 4);
  g.fillRect(16 * TILE + 22, 22, 4, 4);
  // 17: broken mosaic
  base(17, PALETTE.carved);
  const mosaic: Array<[number, number, number]> = [
    [3, 3, PALETTE.mosaicA],
    [11, 3, PALETTE.mosaicB],
    [19, 3, PALETTE.mosaicC],
    [3, 11, PALETTE.mosaicB],
    [11, 11, PALETTE.mosaicC],
    [27, 11, PALETTE.mosaicA],
    [3, 19, PALETTE.mosaicC],
    [19, 19, PALETTE.mosaicA],
    [27, 19, PALETTE.mosaicB],
    [11, 27, PALETTE.mosaicA],
    [19, 27, PALETTE.mosaicB],
  ];
  for (const [x, y, c] of mosaic) {
    g.fillStyle(c, 1);
    g.fillRect(17 * TILE + x, y, 6, 6);
  }
  g.fillStyle(PALETTE.floorDark, 1);
  g.fillRect(17 * TILE + 19, 11, 8, 8); // missing tiles
  g.fillRect(17 * TILE + 3, 27, 8, 4);
}

function drawWallTiles(g: Phaser.GameObjects.Graphics) {
  const base = (i: number, color: number) => {
    g.fillStyle(color, 1);
    g.fillRect(i * TILE, 0, TILE, TILE);
  };
  const blotches = (i: number, color: number, seed: number, count: number) => {
    const rnd = seeded(seed);
    g.fillStyle(color, 1);
    for (let n = 0; n < count; n++) {
      const x = Math.floor(rnd() * 26);
      const y = Math.floor(rnd() * 26);
      const w = 3 + Math.floor(rnd() * 8);
      const h = 2 + Math.floor(rnd() * 5);
      g.fillRect(i * TILE + x, y, w, h);
    }
  };
  const edgeRock = (i: number, seed: number) => {
    base(i, PALETTE.wall);
    blotches(i, PALETTE.wallLight, seed, 5);
    blotches(i, PALETTE.wallDark, seed + 7, 3);
    // Rough lip along the top and a shadow along the bottom.
    g.fillStyle(PALETTE.wallLip, 1);
    g.fillRect(i * TILE, 0, TILE, 3);
    g.fillRect(i * TILE + 4, 3, 9, 2);
    g.fillRect(i * TILE + 19, 3, 7, 2);
    g.fillStyle(PALETTE.wallDark, 1);
    g.fillRect(i * TILE, TILE - 2, TILE, 2);
  };

  // 0, 1: deep rock — almost featureless so the eye stays on the floor.
  base(0, PALETTE.deep);
  blotches(0, PALETTE.deepBlotch, 3, 4);
  base(1, PALETTE.deep);
  blotches(1, PALETTE.deepBlotch, 9, 6);

  // 2: edge rock, plain
  edgeRock(2, 21);

  // 3: edge rock, cracked
  edgeRock(3, 33);
  g.lineStyle(1, PALETTE.wallDark, 1);
  g.beginPath();
  g.moveTo(3 * TILE + 8, 6);
  g.lineTo(3 * TILE + 14, 14);
  g.lineTo(3 * TILE + 12, 22);
  g.lineTo(3 * TILE + 19, 29);
  g.strokePath();

  // 4: edge rock, mossy
  edgeRock(4, 45);
  g.fillStyle(PALETTE.moss, 1);
  g.fillEllipse(4 * TILE + 10, 22, 14, 9);
  g.fillEllipse(4 * TILE + 24, 12, 8, 6);
  g.fillStyle(PALETTE.mossLight, 1);
  g.fillEllipse(4 * TILE + 9, 21, 5, 3);

  // 5: edge rock with crystal glints (rare)
  edgeRock(5, 57);
  const gem = (x: number, y: number, r: number) => {
    g.fillStyle(PALETTE.crystal, 1);
    g.beginPath();
    g.moveTo(5 * TILE + x, y - r);
    g.lineTo(5 * TILE + x + r, y);
    g.lineTo(5 * TILE + x, y + r);
    g.lineTo(5 * TILE + x - r, y);
    g.closePath();
    g.fillPath();
    g.fillStyle(PALETTE.crystalLight, 1);
    g.fillRect(5 * TILE + x - 1, y - r + 1, 1, r);
  };
  gem(10, 14, 4);
  gem(21, 21, 3);
  gem(24, 9, 2);

  // 6, 7: wall face — stacked bricks seen from the front, lip on top.
  const face = (i: number, missing: boolean) => {
    base(i, PALETTE.mortar);
    const rows: Array<[number, number]> = [
      [6, 7],
      [14, 7],
      [22, 7],
    ];
    rows.forEach(([y, h], row) => {
      const offset = row % 2 ? 8 : 0;
      for (let x = -8 + offset; x < TILE; x += 16) {
        const bx = Math.max(0, x);
        const bw = Math.min(TILE, x + 15) - bx;
        if (bw <= 0) continue;
        if (missing && row === 1 && x === 8) continue;
        g.fillStyle(row === 2 ? PALETTE.brick : PALETTE.brickLight, 1);
        g.fillRect(i * TILE + bx, y, bw, h);
        g.fillStyle(PALETTE.brick, 1);
        g.fillRect(i * TILE + bx, y + h - 2, bw, 2);
      }
    });
    g.fillStyle(PALETTE.wallLip, 1);
    g.fillRect(i * TILE, 0, TILE, 4);
    g.fillStyle(PALETTE.wallLight, 1);
    g.fillRect(i * TILE, 4, TILE, 1);
    g.fillStyle(PALETTE.wallDark, 1);
    g.fillRect(i * TILE, TILE - 2, TILE, 2);
  };
  face(6, false);
  face(7, true);

  // ---- Grotto set (8-11) ----
  // 8: vine-draped edge
  edgeRock(8, 81);
  g.lineStyle(2, PALETTE.vine, 1);
  g.beginPath();
  g.moveTo(8 * TILE + 6, 0);
  g.lineTo(8 * TILE + 8, 14);
  g.lineTo(8 * TILE + 6, 26);
  g.moveTo(8 * TILE + 20, 0);
  g.lineTo(8 * TILE + 18, 12);
  g.lineTo(8 * TILE + 22, 22);
  g.strokePath();
  g.fillStyle(PALETTE.vineLight, 1);
  g.fillEllipse(8 * TILE + 9, 15, 5, 3);
  g.fillEllipse(8 * TILE + 17, 11, 5, 3);
  g.fillEllipse(8 * TILE + 21, 21, 5, 3);
  // 9: dripping edge
  edgeRock(9, 93);
  g.fillStyle(PALETTE.waterLight, 1);
  g.fillRect(9 * TILE + 10, 4, 1, 14);
  g.fillRect(9 * TILE + 23, 4, 1, 20);
  g.fillStyle(PALETTE.water, 1);
  g.fillRect(9 * TILE + 9, 4, 3, 2);
  g.fillRect(9 * TILE + 22, 4, 3, 2);
  g.fillStyle(PALETTE.waterLight, 1);
  g.fillCircle(9 * TILE + 10.5, 20, 1.5);
  g.fillCircle(9 * TILE + 23.5, 26, 1.5);
  // 10: blue crystal cluster edge
  edgeRock(10, 105);
  const bigGem = (i: number, x: number, y: number, r: number, color: number, light: number) => {
    g.fillStyle(color, 1);
    g.beginPath();
    g.moveTo(i * TILE + x, y - r);
    g.lineTo(i * TILE + x + r, y);
    g.lineTo(i * TILE + x, y + r);
    g.lineTo(i * TILE + x - r, y);
    g.closePath();
    g.fillPath();
    g.fillStyle(light, 1);
    g.fillRect(i * TILE + x - 1, y - r + 1, 1, r);
  };
  bigGem(10, 12, 18, 6, PALETTE.waterLight, PALETTE.runeDim);
  bigGem(10, 21, 12, 4, PALETTE.crystal, PALETTE.crystalLight);
  bigGem(10, 24, 22, 3, PALETTE.waterLight, PALETTE.crystalLight);
  // 11: mossy brick face
  face(11, false);
  g.fillStyle(PALETTE.moss, 1);
  g.fillEllipse(11 * TILE + 8, 10, 12, 6);
  g.fillEllipse(11 * TILE + 24, 20, 10, 6);
  g.fillStyle(PALETTE.mossLight, 1);
  g.fillEllipse(11 * TILE + 7, 9, 5, 3);

  // ---- Ember set (12-14) ----
  // 12: obsidian edge with embers
  base(12, PALETTE.obsidian);
  blotches(12, PALETTE.obsidianLight, 121, 5);
  g.fillStyle(PALETTE.wallLip, 1);
  g.fillRect(12 * TILE, 0, TILE, 2);
  g.fillStyle(PALETTE.emberDark, 1);
  g.fillRect(12 * TILE + 6, 12, 3, 1);
  g.fillRect(12 * TILE + 20, 22, 4, 1);
  g.fillRect(12 * TILE + 14, 27, 2, 1);
  g.fillStyle(PALETTE.ember, 1);
  g.fillRect(12 * TILE + 7, 12, 1, 1);
  g.fillRect(12 * TILE + 22, 22, 1, 1);
  // 13: charred brick face with glowing mortar
  base(13, PALETTE.emberDark);
  [6, 14, 22].forEach((y, row) => {
    const offset = row % 2 ? 8 : 0;
    for (let x = -8 + offset; x < TILE; x += 16) {
      const bx = Math.max(0, x);
      const bw = Math.min(TILE, x + 15) - bx;
      if (bw <= 0) continue;
      g.fillStyle(PALETTE.obsidianLight, 1);
      g.fillRect(13 * TILE + bx, y, bw, 7);
      g.fillStyle(PALETTE.obsidian, 1);
      g.fillRect(13 * TILE + bx, y + 5, bw, 2);
    }
  });
  g.fillStyle(PALETTE.ember, 1);
  g.fillRect(13 * TILE + 3, 13, 6, 1);
  g.fillRect(13 * TILE + 19, 21, 5, 1);
  g.fillStyle(PALETTE.wallLip, 1);
  g.fillRect(13 * TILE, 0, TILE, 4);
  // 14: bone-embedded edge
  edgeRock(14, 141);
  g.fillStyle(PALETTE.bone, 1);
  g.fillRect(14 * TILE + 6, 10, 12, 2);
  g.fillCircle(14 * TILE + 6, 11, 2);
  g.fillCircle(14 * TILE + 18, 11, 2);
  g.fillRoundedRect(14 * TILE + 19, 17, 8, 8, 3);
  g.fillStyle(PALETTE.boneDark, 1);
  g.fillRect(14 * TILE + 21, 20, 2, 2);
  g.fillRect(14 * TILE + 24, 20, 2, 2);
  g.fillRect(14 * TILE + 8, 24, 10, 2);

  // ---- Ruins set (15-17) ----
  // 15: rune brick face
  face(15, false);
  g.lineStyle(1, PALETTE.rune, 1);
  g.beginPath();
  g.moveTo(15 * TILE + 11, 8);
  g.lineTo(15 * TILE + 11, 12);
  g.moveTo(15 * TILE + 9, 10);
  g.lineTo(15 * TILE + 13, 10);
  g.moveTo(15 * TILE + 22, 16);
  g.lineTo(15 * TILE + 26, 20);
  g.moveTo(15 * TILE + 26, 16);
  g.lineTo(15 * TILE + 22, 20);
  g.strokePath();
  g.fillStyle(PALETTE.runeDim, 1);
  g.fillRect(15 * TILE + 4, 24, 6, 1);
  // 16: carved pillar edge
  base(16, PALETTE.carved);
  g.fillStyle(PALETTE.carvedLight, 1);
  g.fillRect(16 * TILE + 8, 0, 16, TILE);
  g.fillStyle(PALETTE.carved, 1);
  g.fillRect(16 * TILE + 12, 6, 2, 22);
  g.fillRect(16 * TILE + 18, 6, 2, 22);
  g.fillStyle(PALETTE.wallLip, 1);
  g.fillRect(16 * TILE + 6, 0, 20, 4);
  g.fillRect(16 * TILE + 6, 28, 20, 3);
  g.fillStyle(PALETTE.wallDark, 1);
  g.fillRect(16 * TILE, 0, 8, TILE);
  g.fillRect(16 * TILE + 24, 0, 8, TILE);
  // 17: skull niche edge
  edgeRock(17, 173);
  g.fillStyle(PALETTE.wallDark, 1);
  g.fillRoundedRect(17 * TILE + 9, 8, 14, 18, 4);
  g.fillStyle(PALETTE.bone, 1);
  g.fillRoundedRect(17 * TILE + 12, 12, 8, 8, 3);
  g.fillRect(17 * TILE + 13, 20, 6, 3);
  g.fillStyle(PALETTE.wallDark, 1);
  g.fillRect(17 * TILE + 13, 15, 2, 2);
  g.fillRect(17 * TILE + 17, 15, 2, 2);
  g.fillRect(17 * TILE + 14, 21, 1, 2);
  g.fillRect(17 * TILE + 17, 21, 1, 2);
}
