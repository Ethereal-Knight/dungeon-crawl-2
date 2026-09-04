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
} as const;

/** Number of floor variants packed into the `floors` tileset. */
export const FLOOR_TILES = 8;
/** Number of wall variants packed into the `walls` tileset. */
export const WALL_TILES = 8;

/** Weighted pick of a floor tile index: mostly plain, occasional detail. */
export function pickFloorTile(): number {
  const r = Math.random();
  if (r < 0.5) return 0; // plain
  if (r < 0.66) return 1; // speckled
  if (r < 0.76) return 2; // cracked
  if (r < 0.86) return 3; // pebbles
  if (r < 0.90) return 4; // moss
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
export function pickWallTile(context: WallContext): number {
  const r = Math.random();
  switch (context) {
    case 'face':
      return r < 0.75 ? 6 : 7;
    case 'edge':
      if (r < 0.6) return 2;
      if (r < 0.8) return 3;
      if (r < 0.95) return 4;
      return 5;
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
}
