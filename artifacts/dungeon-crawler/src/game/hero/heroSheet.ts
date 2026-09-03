/**
 * Procedural pixel-art sprite sheet for the hero, "Wren".
 *
 * Wren is a hooded ranger-mage: a teal hood and cloak, glowing cyan eyes in
 * the hood's shadow, a crimson scarf whose tail flutters with movement, a
 * leather tunic with a gold buckle, a bronze pauldron over the sword arm, and
 * a steel-blue rune gauntlet on the casting hand that lights up for spells.
 *
 * This module has NO Phaser dependency. It renders every frame into one RGBA
 * buffer so it can run in the browser (fed to a canvas texture) and in Node
 * (exported to a PNG + JSON atlas for artists to replace).
 *
 * Every frame is 32x32. Directions are `down`, `up` and `side` (side faces
 * right; the game flips it for left). Animations:
 *
 *   idle (4)  walk (6)  sword (5)  cast (5)  hurt (3)  knockback (3)
 *   death (7, down only)
 */

export const FRAME = 32;
export type Dir = 'down' | 'up' | 'side';
export type Anim = 'idle' | 'walk' | 'sword' | 'cast' | 'hurt' | 'knockback' | 'death';

export const ANIMS: Record<Anim, { frames: number; fps: number; loop: boolean; dirs: Dir[] }> = {
  idle: { frames: 4, fps: 4, loop: true, dirs: ['down', 'up', 'side'] },
  walk: { frames: 6, fps: 10, loop: true, dirs: ['down', 'up', 'side'] },
  sword: { frames: 5, fps: 24, loop: false, dirs: ['down', 'up', 'side'] },
  cast: { frames: 5, fps: 16, loop: false, dirs: ['down', 'up', 'side'] },
  hurt: { frames: 3, fps: 24, loop: false, dirs: ['down', 'up', 'side'] },
  knockback: { frames: 3, fps: 16, loop: true, dirs: ['down', 'up', 'side'] },
  death: { frames: 7, fps: 8, loop: false, dirs: ['down'] },
};

export const frameName = (anim: Anim, dir: Dir, i: number) => `${anim}-${dir}-${i}`;

export interface SheetFrame {
  name: string;
  x: number;
  y: number;
}

export interface HeroSheet {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
  frames: SheetFrame[];
}

// ---- Palette -------------------------------------------------------------------

const P = {
  outline: 0x140f1c,
  hood: 0x2f9e8f,
  hoodDark: 0x1f6f66,
  hoodLight: 0x63cdbb,
  faceShadow: 0x1a1430,
  eye: 0x9ff8ff,
  eyeDim: 0x3fb8c9,
  skin: 0xe9b58c,
  skinDark: 0xc2865c,
  scarf: 0xc83a3a,
  scarfDark: 0x8d2323,
  tunic: 0x6d4a2d,
  tunicDark: 0x4a3220,
  belt: 0x33200f,
  buckle: 0xe8bb4c,
  pauldron: 0xb87333,
  pauldronLight: 0xe3a463,
  gauntlet: 0x4b5a75,
  gauntletLight: 0x7a8db0,
  rune: 0x67e8f9,
  runeGlow: 0xc6fbff,
  trousers: 0x3a3e52,
  trousersDark: 0x272a3a,
  boot: 0x4b2f1e,
  bootDark: 0x2c1a0f,
  blade: 0xd7dee8,
  bladeLight: 0xffffff,
  bladeDark: 0x8f9bab,
  hilt: 0xe8bb4c,
  grip: 0x5a3a22,
  dust: 0x8b8ba0,
} as const;

type Color = number;

// ---- Tiny raster ------------------------------------------------------------------

class Raster {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray<ArrayBuffer>;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  px(x: number, y: number, color: Color, alpha = 255) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = (color >> 16) & 0xff;
    this.data[i + 1] = (color >> 8) & 0xff;
    this.data[i + 2] = color & 0xff;
    this.data[i + 3] = alpha;
  }

  rect(x: number, y: number, w: number, h: number, color: Color) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.px(xx, yy, color);
  }

  /** Horizontal run: convenient for hand-drawn rows. */
  row(x0: number, x1: number, y: number, color: Color) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.px(x, y, color);
  }

  line(x0: number, y0: number, x1: number, y1: number, color: Color) {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      this.px(x, y, color);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  filled(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return this.data[(y * this.width + x) * 4 + 3] > 0;
  }

  /** Adds a 1px outline around every opaque pixel (4-neighbourhood). */
  outline(color: Color) {
    const add: Array<[number, number]> = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.filled(x, y)) continue;
        if (this.filled(x - 1, y) || this.filled(x + 1, y) || this.filled(x, y - 1) || this.filled(x, y + 1)) {
          add.push([x, y]);
        }
      }
    }
    for (const [x, y] of add) this.px(x, y, color);
  }

  /** Lightens every opaque pixel toward white (hit flash). */
  flash(amount: number) {
    for (let i = 0; i < this.data.length; i += 4) {
      if (this.data[i + 3] === 0) continue;
      this.data[i] += (255 - this.data[i]) * amount;
      this.data[i + 1] += (255 - this.data[i + 1]) * amount;
      this.data[i + 2] += (255 - this.data[i + 2]) * amount;
    }
  }

  blit(src: Raster, dx: number, dy: number) {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const si = (y * src.width + x) * 4;
        if (src.data[si + 3] === 0) continue;
        const di = ((dy + y) * this.width + (dx + x)) * 4;
        this.data[di] = src.data[si];
        this.data[di + 1] = src.data[si + 1];
        this.data[di + 2] = src.data[si + 2];
        this.data[di + 3] = src.data[si + 3];
      }
    }
  }
}

// ---- Pose model -----------------------------------------------------------------------

interface Pose {
  /** Vertical bob of the whole upper body (negative = up). */
  bob: number;
  /** Horizontal lean of the upper body (positive = toward facing/right). */
  lean: number;
  /** Leg offsets: dy > 0 lifts the foot (shorter leg), dx shifts it. */
  legL: { dx: number; dy: number };
  legR: { dx: number; dy: number };
  /** Arm offsets from their rest position. */
  armL: { dx: number; dy: number };
  armR: { dx: number; dy: number };
  /** Sword: angle in degrees (0 = right, 90 = down), or null to hide. */
  sword: { angle: number; behind?: boolean; reach?: number } | null;
  /** Spell glow on the gauntlet, 0..3. */
  glow: number;
  eyes: 'open' | 'squint' | 'shut';
  /** Scarf flutter frame 0..2, negative flips the tail forward. */
  scarf: number;
  /** Hit flash amount 0..1. */
  flash: number;
  /** Dust puffs at the feet, 0..2. */
  dust: number;
}

const rest = (): Pose => ({
  bob: 0,
  lean: 0,
  legL: { dx: 0, dy: 0 },
  legR: { dx: 0, dy: 0 },
  armL: { dx: 0, dy: 0 },
  armR: { dx: 0, dy: 0 },
  sword: null,
  glow: 0,
  eyes: 'open',
  scarf: 0,
  flash: 0,
  dust: 0,
});

// ---- Shared part painters ---------------------------------------------------------

/** Sword: `hx,hy` is the hand. Blade extends along `angle`. */
function drawSword(r: Raster, hx: number, hy: number, angle: number, reach = 9) {
  const a = (angle * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  // grip goes backwards from the hand, guard sits at the hand, blade forward.
  r.line(hx, hy, Math.round(hx - ux * 2), Math.round(hy - uy * 2), P.grip);
  const gx = -uy;
  const gy = ux;
  r.px(hx + gx, hy + gy, P.hilt);
  r.px(hx - gx, hy - gy, P.hilt);
  r.px(hx, hy, P.hilt);
  const tipX = Math.round(hx + ux * reach);
  const tipY = Math.round(hy + uy * reach);
  r.line(Math.round(hx + ux), Math.round(hy + uy), tipX, tipY, P.blade);
  // highlight along one edge for a bit of shine
  r.line(
    Math.round(hx + ux * 2 + gx * 0.6),
    Math.round(hy + uy * 2 + gy * 0.6),
    Math.round(hx + ux * (reach - 2) + gx * 0.6),
    Math.round(hy + uy * (reach - 2) + gy * 0.6),
    P.bladeLight,
  );
  r.px(tipX, tipY, P.bladeLight);
}

function drawGlow(r: Raster, x: number, y: number, level: number) {
  if (level <= 0) return;
  r.px(x, y, P.runeGlow);
  if (level >= 1) {
    r.px(x + 1, y, P.rune);
    r.px(x - 1, y, P.rune);
    r.px(x, y + 1, P.rune);
    r.px(x, y - 1, P.rune);
  }
  if (level >= 2) {
    r.px(x + 1, y + 1, P.rune);
    r.px(x - 1, y - 1, P.rune);
    r.px(x + 1, y - 1, P.rune);
    r.px(x - 1, y + 1, P.rune);
    r.px(x + 2, y, P.eyeDim);
    r.px(x - 2, y, P.eyeDim);
    r.px(x, y + 2, P.eyeDim);
    r.px(x, y - 2, P.eyeDim);
  }
  if (level >= 3) {
    // release: streaks flying outward
    r.px(x + 3, y - 1, P.runeGlow);
    r.px(x + 3, y + 1, P.runeGlow);
    r.px(x + 4, y, P.rune);
    r.px(x - 3, y, P.eyeDim);
    r.px(x, y - 3, P.eyeDim);
    r.px(x, y + 3, P.eyeDim);
  }
}

function drawDust(r: Raster, x: number, y: number, level: number, dir: 1 | -1) {
  if (level <= 0) return;
  r.px(x + dir * 2, y, P.dust);
  r.px(x + dir * 4, y - 1, P.dust);
  if (level >= 2) {
    r.px(x + dir * 6, y - 2, P.dust);
    r.px(x + dir * 3, y - 3, P.dust);
    r.px(x + dir * 7, y, P.dust);
  }
}

// ---- Down-facing --------------------------------------------------------------------

function drawDown(r: Raster, p: Pose) {
  const L = p.lean;
  const B = p.bob;

  // Legs & boots (rest: y 22..29). A lifted leg is shorter and pulled up.
  const leg = (x: number, o: { dx: number; dy: number }) => {
    const top = 22 + B;
    const bottom = 29 - o.dy;
    r.rect(x + o.dx, top, 3, Math.max(1, bottom - top - 1), P.trousers);
    r.px(x + o.dx + 2, top + 1, P.trousersDark);
    r.rect(x + o.dx, bottom - 2, 3, 2, P.boot);
    r.px(x + o.dx, bottom - 1, P.bootDark);
  };
  leg(12, p.legL);
  leg(17, p.legR);
  drawDust(r, 16, 29, p.dust, 1);

  // Sword behind the body when swung overhead.
  const handR = { x: 22 + L + p.armR.dx, y: 21 + B + p.armR.dy };
  if (p.sword && p.sword.behind) drawSword(r, handR.x, handR.y, p.sword.angle, p.sword.reach);

  // Cloak sides and torso.
  r.rect(10 + L, 13 + B, 2, 9, P.hoodDark);
  r.rect(20 + L, 13 + B, 2, 9, P.hoodDark);
  r.px(10 + L, 21 + B, P.hood);
  r.px(21 + L, 21 + B, P.hood);
  r.rect(12 + L, 13 + B, 8, 9, P.tunic);
  r.rect(12 + L, 13 + B, 1, 9, P.tunicDark);
  r.row(12 + L, 19 + L, 19 + B, P.belt);
  r.px(15 + L, 19 + B, P.buckle);
  r.px(16 + L, 19 + B, P.buckle);
  // tunic hem
  r.row(12 + L, 19 + L, 21 + B, P.tunicDark);

  // Arms. Left = viewer's left = gauntlet hand. Right = sword hand.
  const aL = p.armL;
  r.rect(9 + L + aL.dx, 15 + B + aL.dy, 2, 6, P.hoodDark); // sleeve
  r.rect(9 + L + aL.dx, 20 + B + aL.dy, 2, 2, P.gauntlet);
  r.px(10 + L + aL.dx, 20 + B + aL.dy, P.gauntletLight);
  r.px(9 + L + aL.dx, 21 + B + aL.dy, p.glow > 0 ? P.rune : P.gauntlet);
  const aR = p.armR;
  r.rect(21 + L + aR.dx, 15 + B + aR.dy, 2, 6, P.hoodDark);
  r.rect(21 + L + aR.dx, 20 + B + aR.dy, 2, 2, P.skin);
  r.px(22 + L + aR.dx, 21 + B + aR.dy, P.skinDark);

  // Pauldron over the sword shoulder.
  r.rect(19 + L, 12 + B, 3, 2, P.pauldron);
  r.px(20 + L, 12 + B, P.pauldronLight);
  r.px(21 + L, 14 + B, P.pauldron);

  // Scarf around the neck; tail hangs to the right and flutters.
  r.row(11 + L, 20 + L, 12 + B, P.scarf);
  r.row(12 + L, 18 + L, 13 + B, P.scarfDark);
  const s = p.scarf;
  const tailDir = s < 0 ? -1 : 1;
  const f = Math.abs(s);
  const tx = tailDir > 0 ? 21 + L : 10 + L;
  r.px(tx, 13 + B, P.scarf);
  r.px(tx + tailDir, 14 + B, P.scarf);
  r.px(tx + tailDir, 15 + B, P.scarfDark);
  r.px(tx + tailDir * (1 + (f === 1 ? 1 : 0)), 16 + B, P.scarf);
  r.px(tx + tailDir * (1 + (f === 2 ? 1 : 0)), 17 + B, P.scarfDark);
  if (f === 2) r.px(tx + tailDir * 2, 18 + B, P.scarf);

  // Hood.
  r.row(13 + L, 18 + L, 4 + B, P.hood);
  r.row(12 + L, 19 + L, 5 + B, P.hood);
  r.rect(11 + L, 6 + B, 10, 7, P.hood);
  r.rect(10 + L, 10 + B, 12, 3, P.hood);
  r.row(13 + L, 17 + L, 5 + B, P.hoodLight); // highlight on the crown
  r.px(12 + L, 6 + B, P.hoodLight);
  r.rect(11 + L, 9 + B, 1, 4, P.hoodDark);
  r.rect(20 + L, 9 + B, 1, 4, P.hoodDark);
  r.row(10 + L, 21 + L, 12 + B, P.hoodDark);
  r.row(11 + L, 20 + L, 12 + B, P.scarf); // scarf sits over the hood's hem

  // Face in shadow, glowing eyes, chin.
  r.rect(13 + L, 8 + B, 6, 4, P.faceShadow);
  r.row(14 + L, 17 + L, 11 + B, P.skin);
  r.px(14 + L, 11 + B, P.skinDark);
  if (p.eyes === 'open') {
    r.px(14 + L, 9 + B, P.eye);
    r.px(17 + L, 9 + B, P.eye);
    r.px(13 + L, 9 + B, P.eyeDim);
    r.px(18 + L, 9 + B, P.eyeDim);
  } else if (p.eyes === 'squint') {
    r.px(14 + L, 9 + B, P.eyeDim);
    r.px(17 + L, 9 + B, P.eyeDim);
  }

  // Sword in front.
  if (p.sword && !p.sword.behind) drawSword(r, handR.x, handR.y, p.sword.angle, p.sword.reach);

  // Spell glow around the gauntlet.
  drawGlow(r, 9 + L + aL.dx, 21 + B + aL.dy, p.glow);
}

// ---- Up-facing (we see the back of the hood and cloak) ----------------------

function drawUp(r: Raster, p: Pose) {
  const L = p.lean;
  const B = p.bob;

  const leg = (x: number, o: { dx: number; dy: number }) => {
    const top = 22 + B;
    const bottom = 29 - o.dy;
    r.rect(x + o.dx, top, 3, Math.max(1, bottom - top - 1), P.trousers);
    r.rect(x + o.dx, bottom - 2, 3, 2, P.boot);
    r.px(x + o.dx + 2, bottom - 1, P.bootDark);
  };
  leg(12, p.legL);
  leg(17, p.legR);
  drawDust(r, 16, 29, p.dust, -1);

  // From behind, the sword hand is on the viewer's left.
  const handS = { x: 9 + L + p.armR.dx, y: 21 + B + p.armR.dy };
  if (p.sword && p.sword.behind) drawSword(r, handS.x, handS.y, p.sword.angle, p.sword.reach);

  // Arms: sword arm (viewer's left), gauntlet arm (viewer's right).
  const aS = p.armR;
  r.rect(9 + L + aS.dx, 15 + B + aS.dy, 2, 6, P.hoodDark);
  r.rect(9 + L + aS.dx, 20 + B + aS.dy, 2, 2, P.skin);
  const aG = p.armL;
  r.rect(21 + L + aG.dx, 15 + B + aG.dy, 2, 6, P.hoodDark);
  r.rect(21 + L + aG.dx, 20 + B + aG.dy, 2, 2, P.gauntlet);
  r.px(22 + L + aG.dx, 21 + B + aG.dy, p.glow > 0 ? P.rune : P.gauntletLight);

  // Cloak covers the whole back.
  r.rect(10 + L, 13 + B, 12, 9, P.hood);
  r.rect(10 + L, 13 + B, 1, 9, P.hoodDark);
  r.rect(21 + L, 13 + B, 1, 9, P.hoodDark);
  r.row(11 + L, 20 + L, 21 + B, P.hoodDark);
  r.rect(15 + L, 14 + B, 1, 7, P.hoodDark); // seam
  r.px(13 + L, 15 + B, P.hoodLight);
  r.px(18 + L, 16 + B, P.hoodLight);

  // Pauldron on the sword shoulder (viewer's left).
  r.rect(10 + L, 12 + B, 3, 2, P.pauldron);
  r.px(11 + L, 12 + B, P.pauldronLight);

  // Scarf knot at the back of the neck, tail over the shoulder.
  r.row(12 + L, 19 + L, 12 + B, P.scarf);
  const s = p.scarf;
  const tailDir = s < 0 ? -1 : 1;
  const f = Math.abs(s);
  const tx = tailDir > 0 ? 20 + L : 11 + L;
  r.px(tx, 13 + B, P.scarf);
  r.px(tx + tailDir, 14 + B, P.scarfDark);
  r.px(tx + tailDir * (1 + (f === 1 ? 1 : 0)), 15 + B, P.scarf);
  r.px(tx + tailDir * (1 + (f === 2 ? 1 : 0)), 16 + B, P.scarf);
  if (f >= 1) r.px(tx + tailDir * 2, 17 + B, P.scarfDark);

  // Hood from behind: rounded, with a fold line.
  r.row(13 + L, 18 + L, 4 + B, P.hood);
  r.row(12 + L, 19 + L, 5 + B, P.hood);
  r.rect(11 + L, 6 + B, 10, 7, P.hood);
  r.rect(10 + L, 10 + B, 12, 3, P.hood);
  r.row(13 + L, 17 + L, 5 + B, P.hoodLight);
  r.rect(15 + L, 6 + B, 1, 6, P.hoodDark);
  r.rect(11 + L, 9 + B, 1, 4, P.hoodDark);
  r.rect(20 + L, 9 + B, 1, 4, P.hoodDark);

  if (p.sword && !p.sword.behind) drawSword(r, handS.x, handS.y, p.sword.angle, p.sword.reach);
  drawGlow(r, 22 + L + aG.dx, 21 + B + aG.dy, p.glow);
}

// ---- Side-facing (right) ------------------------------------------------------------

function drawSide(r: Raster, p: Pose) {
  const L = p.lean;
  const B = p.bob;

  // Legs stride front/back along x. Back leg first.
  const leg = (o: { dx: number; dy: number }, dark: boolean) => {
    const top = 22 + B;
    const bottom = 29 - o.dy;
    const x = 14 + o.dx;
    r.rect(x, top, 3, Math.max(1, bottom - top - 1), dark ? P.trousersDark : P.trousers);
    r.rect(x, bottom - 2, 4, 2, dark ? P.bootDark : P.boot);
  };
  leg(p.legL, true);
  leg(p.legR, false);
  drawDust(r, 15, 29, p.dust, -1);

  // Sword hand is the near arm, in front of the body.
  const hand = { x: 19 + L + p.armR.dx, y: 20 + B + p.armR.dy };
  if (p.sword && p.sword.behind) drawSword(r, hand.x, hand.y, p.sword.angle, p.sword.reach);

  // Scarf tail trails behind (left) unless flipped forward by knockback.
  const s = p.scarf;
  const tailDir = s < 0 ? 1 : -1;
  const f = Math.abs(s);
  const tx = tailDir < 0 ? 11 + L : 20 + L;
  r.px(tx, 13 + B, P.scarf);
  r.px(tx + tailDir, 13 + B + (f === 1 ? 0 : 1), P.scarf);
  r.px(tx + tailDir * 2, 14 + B + (f === 2 ? -1 : 0), P.scarfDark);
  r.px(tx + tailDir * 3, 14 + B + (f === 1 ? 1 : 0), P.scarf);
  if (f === 2) r.px(tx + tailDir * 4, 13 + B, P.scarfDark);

  // Far arm (gauntlet) peeks out behind the torso.
  const aL = p.armL;
  r.rect(12 + L + aL.dx, 15 + B + aL.dy, 2, 6, P.hoodDark);
  r.rect(12 + L + aL.dx, 20 + B + aL.dy, 2, 2, P.gauntlet);
  r.px(13 + L + aL.dx, 21 + B + aL.dy, p.glow > 0 ? P.rune : P.gauntlet);

  // Torso: cloak at the back, tunic at the front.
  r.rect(12 + L, 13 + B, 3, 9, P.hood);
  r.rect(12 + L, 13 + B, 1, 9, P.hoodDark);
  r.rect(15 + L, 13 + B, 5, 9, P.tunic);
  r.rect(19 + L, 13 + B, 1, 9, P.tunicDark);
  r.row(15 + L, 19 + L, 19 + B, P.belt);
  r.px(18 + L, 19 + B, P.buckle);
  r.row(12 + L, 19 + L, 21 + B, P.tunicDark);

  // Near arm (sword arm) and pauldron.
  const aR = p.armR;
  r.rect(18 + L + aR.dx, 15 + B + aR.dy, 2, 5, P.hoodDark);
  r.rect(18 + L + aR.dx, 19 + B + aR.dy, 2, 2, P.skin);
  r.rect(17 + L, 12 + B, 4, 2, P.pauldron);
  r.px(18 + L, 12 + B, P.pauldronLight);

  // Scarf wrap.
  r.row(13 + L, 19 + L, 12 + B, P.scarf);
  r.row(14 + L, 18 + L, 13 + B, P.scarfDark);

  // Hood in profile: peak swept back, opening at the front.
  r.row(12 + L, 17 + L, 4 + B, P.hood);
  r.row(11 + L, 18 + L, 5 + B, P.hood);
  r.rect(10 + L, 6 + B, 10, 7, P.hood);
  r.row(11 + L, 20 + L, 11 + B, P.hood);
  r.row(11 + L, 20 + L, 12 + B, P.hoodDark);
  r.row(12 + L, 16 + L, 5 + B, P.hoodLight);
  r.px(11 + L, 6 + B, P.hoodLight);
  r.rect(10 + L, 8 + B, 1, 4, P.hoodDark);
  // Face opening: shadow with one glowing eye and a hint of nose/chin.
  r.rect(16 + L, 8 + B, 4, 4, P.faceShadow);
  r.px(20 + L, 9 + B, P.faceShadow);
  r.px(19 + L, 11 + B, P.skin);
  r.px(20 + L, 10 + B, P.skin);
  if (p.eyes === 'open') {
    r.px(18 + L, 9 + B, P.eye);
    r.px(17 + L, 9 + B, P.eyeDim);
  } else if (p.eyes === 'squint') {
    r.px(18 + L, 9 + B, P.eyeDim);
  }

  if (p.sword && !p.sword.behind) drawSword(r, hand.x, hand.y, p.sword.angle, p.sword.reach);
  drawGlow(r, 13 + L + aL.dx, 21 + B + aL.dy, p.glow);
}

// ---- Death (down-facing only) -------------------------------------------------------

function drawDeath(r: Raster, i: number) {
  if (i <= 2) {
    // Stagger: clutch the wound, sink to the knees.
    const p = rest();
    p.eyes = i === 0 ? 'squint' : 'shut';
    p.bob = i; // sinking
    p.lean = i === 1 ? -1 : 0;
    p.legL = { dx: -1, dy: -i }; // legs fold: longer as the body drops
    p.legR = { dx: 1, dy: -i };
    p.armL = { dx: 3, dy: -3 }; // hands to the chest
    p.armR = { dx: -3, dy: -3 };
    p.scarf = i;
    p.sword = i === 0 ? { angle: 100 } : null;
    drawDown(r, p);
    if (i >= 1) {
      // dropped sword on the ground
      drawSword(r, 24, 27, 15, 7);
    }
    // legs knelt: draw kneecaps over
    if (i === 2) {
      r.rect(11, 26, 4, 3, P.trousers);
      r.rect(17, 26, 4, 3, P.trousers);
      r.rect(10, 28, 3, 2, P.boot);
      r.rect(19, 28, 3, 2, P.boot);
    }
    return;
  }

  if (i === 3) {
    // Toppling forward: body squashed, head low.
    r.rect(12, 18, 8, 6, P.tunic);
    r.rect(10, 18, 2, 6, P.hoodDark);
    r.rect(20, 18, 2, 6, P.hoodDark);
    r.row(12, 19, 22, P.belt);
    r.rect(11, 24, 4, 4, P.trousers);
    r.rect(17, 24, 4, 4, P.trousers);
    r.rect(10, 27, 4, 2, P.boot);
    r.rect(18, 27, 4, 2, P.boot);
    r.rect(11, 11, 10, 8, P.hood);
    r.rect(10, 15, 12, 3, P.hood);
    r.row(13, 18, 10, P.hood);
    r.row(12, 19, 11, P.hoodLight);
    r.rect(13, 15, 6, 3, P.faceShadow);
    r.row(11, 20, 18, P.scarf);
    r.px(21, 19, P.scarf);
    r.px(22, 20, P.scarfDark);
    r.rect(8, 19, 2, 5, P.hoodDark);
    r.rect(22, 19, 2, 5, P.hoodDark);
    r.rect(8, 23, 2, 2, P.gauntlet);
    r.rect(22, 23, 2, 2, P.skin);
    drawSword(r, 25, 27, 15, 7);
    return;
  }

  // Lying face down on the cave floor, cloak spread, sword beside.
  r.rect(9, 22, 14, 5, P.hood); // cloak spread
  r.rect(9, 22, 14, 1, P.hoodLight);
  r.rect(9, 26, 14, 1, P.hoodDark);
  r.rect(11, 23, 10, 3, P.tunic);
  r.row(11, 20, 25, P.tunicDark);
  r.rect(15, 23, 1, 3, P.belt);
  r.px(15, 24, P.buckle);
  // hood (head) to the left
  r.rect(4, 21, 7, 6, P.hood);
  r.rect(4, 21, 7, 1, P.hoodLight);
  r.px(4, 26, P.hoodDark);
  r.rect(6, 23, 3, 3, P.faceShadow);
  if (i === 4) r.px(7, 24, P.eyeDim); // last flicker of the eyes
  // scarf spilling
  r.row(9, 11, 21, P.scarf);
  r.px(12, 20, P.scarf);
  r.px(13, 20, P.scarfDark);
  // arms out
  r.rect(11, 20, 2, 2, P.gauntlet);
  r.rect(14, 19, 4, 2, P.hoodDark);
  r.rect(19, 27, 2, 2, P.skin);
  r.rect(17, 26, 3, 2, P.hoodDark);
  // legs to the right
  r.rect(23, 23, 5, 2, P.trousers);
  r.rect(23, 25, 5, 2, P.trousersDark);
  r.rect(27, 22, 3, 2, P.boot);
  r.rect(27, 25, 3, 2, P.bootDark);
  // dropped sword above
  drawSword(r, 20, 16, 10, 8);
  // pauldron
  r.rect(12, 22, 3, 1, P.pauldron);
  if (i === 6) {
    // faint dust settling
    r.px(2, 20, P.dust);
    r.px(31, 21, P.dust);
    r.px(16, 17, P.dust);
  }
}

// ---- Poses per animation ---------------------------------------------------------

function pose(anim: Anim, dir: Dir, i: number): Pose {
  const p = rest();
  switch (anim) {
    case 'idle': {
      // Slow breath: body settles on frames 1-2, scarf drifts.
      p.bob = i === 1 || i === 2 ? 1 : 0;
      p.scarf = [0, 1, 2, 1][i];
      p.sword = dir === 'up' ? { angle: 100, behind: true } : { angle: 95 };
      if (i === 3) p.eyes = 'squint'; // blink
      break;
    }
    case 'walk': {
      // 6-frame stride: contact, recoil, passing, contact, recoil, passing.
      const cycle = [0, 1, 2, 3, 4, 5][i];
      const phase = (cycle / 6) * Math.PI * 2;
      const swing = Math.round(Math.sin(phase) * 2); // -2..2
      const lift = Math.abs(swing) === 2 ? 0 : 1;
      p.bob = cycle % 3 === 1 ? -1 : 0;
      if (dir === 'side') {
        p.legL = { dx: -swing, dy: swing < 0 ? lift : 0 };
        p.legR = { dx: swing, dy: swing > 0 ? lift : 0 };
      } else {
        p.legL = { dx: 0, dy: swing > 0 ? Math.abs(swing) : 0 };
        p.legR = { dx: 0, dy: swing < 0 ? Math.abs(swing) : 0 };
      }
      p.armL = { dx: 0, dy: swing > 0 ? -Math.abs(swing) : 0 };
      p.armR = { dx: 0, dy: swing < 0 ? -Math.abs(swing) : 0 };
      p.scarf = [1, 2, 1, 0, 1, 2][i];
      p.sword = dir === 'up' ? { angle: 105, behind: true } : { angle: 100 + swing * 5 };
      break;
    }
    case 'sword': {
      // Wind-up high and behind, sweep across the front of the body, recover.
      const reach = [8, 9, 11, 10, 8][i];
      p.lean = [-1, 0, 1, 1, 0][i];
      p.bob = i === 2 ? 1 : 0;
      p.legL = { dx: -1, dy: 0 };
      p.legR = { dx: dir === 'side' ? 2 : 1, dy: 0 };
      p.scarf = [-1, -2, 2, 1, 0][i];
      p.eyes = i === 2 ? 'squint' : 'open';
      if (dir === 'down') {
        // Hand starts raised at the right shoulder and crosses to the left hip.
        p.armR = { dx: [1, 1, -6, -11, -4][i], dy: [-6, -4, -3, 0, 0][i] };
        p.sword = { angle: [-70, 0, 125, 160, 110][i], behind: i === 0, reach };
      } else if (dir === 'side') {
        p.armR = { dx: [-1, 0, 3, 3, 1][i], dy: [-5, -5, -2, 0, 0][i] };
        p.sword = { angle: [-110, -70, -5, 35, 75][i], behind: i <= 1, reach };
      } else {
        // Seen from behind: the sword hand is on the viewer's left and
        // sweeps across to the right; the blade passes behind the body.
        p.armR = { dx: [-1, -1, 6, 11, 4][i], dy: [-6, -4, -3, 0, 0][i] };
        p.sword = { angle: [250, 180, 55, 20, 70][i], behind: true, reach };
      }
      break;
    }
    case 'cast': {
      // Raise the gauntlet, gather light, release, recover.
      p.glow = [0, 1, 2, 3, 1][i];
      p.lean = [0, 0, 1, 1, 0][i];
      p.eyes = i === 3 ? 'squint' : 'open';
      p.scarf = [0, 1, 2, -1, 0][i];
      if (dir === 'down') {
        // Thrust the gauntlet toward the viewer: low and centred.
        p.armL = { dx: [1, 3, 5, 6, 3][i], dy: [1, 3, 5, 6, 3][i] };
        p.sword = { angle: 100 };
      } else if (dir === 'side') {
        p.armL = { dx: [2, 5, 8, 10, 5][i], dy: [-2, -3, -3, -3, -2][i] };
        p.sword = { angle: 110 };
      } else {
        // Raise it above the hood so the glow shows over the head.
        p.armL = { dx: [-1, -3, -5, -6, -3][i], dy: [-3, -7, -10, -11, -6][i] };
        p.sword = { angle: 100, behind: true };
      }
      break;
    }
    case 'hurt': {
      // Flinch: recoil away from the hit, eyes shut, white flash.
      p.flash = [0.75, 0.35, 0][i];
      p.lean = [-1, -1, 0][i];
      p.bob = [0, 1, 0][i];
      p.eyes = i < 2 ? 'shut' : 'squint';
      p.scarf = [-2, -1, 0][i];
      p.armL = { dx: 1, dy: -1 };
      p.armR = { dx: -1, dy: -1 };
      p.sword = dir === 'up' ? { angle: 120, behind: true } : { angle: 120 };
      break;
    }
    case 'knockback': {
      // Sliding backwards: lean hard back, feet braced forward, dust.
      p.lean = -2;
      p.bob = 1;
      p.eyes = 'squint';
      p.scarf = -2;
      p.dust = [1, 2, 1][i];
      p.legL = { dx: dir === 'side' ? 2 : 1, dy: 0 };
      p.legR = { dx: dir === 'side' ? 4 : -1, dy: [0, 1, 0][i] };
      p.armL = { dx: -1, dy: [-3, -2, -3][i] };
      p.armR = { dx: 1, dy: [-3, -2, -3][i] };
      p.sword = dir === 'up' ? { angle: 60, behind: true } : { angle: 130 };
      break;
    }
    case 'death':
      break;
  }
  return p;
}

// ---- Sheet assembly --------------------------------------------------------------

export function renderHeroFrame(anim: Anim, dir: Dir, i: number): Raster {
  const r = new Raster(FRAME, FRAME);
  if (anim === 'death') {
    drawDeath(r, i);
  } else {
    const p = pose(anim, dir, i);
    if (dir === 'down') drawDown(r, p);
    else if (dir === 'up') drawUp(r, p);
    else drawSide(r, p);
    if (p.flash > 0) r.flash(p.flash);
  }
  r.outline(P.outline);
  return r;
}

/** Column count of the sheet: the longest animation. */
export const SHEET_COLUMNS = Math.max(...Object.values(ANIMS).map((a) => a.frames));

/** Row order of the sheet, one row per (anim, dir). */
export function sheetRows(): Array<{ anim: Anim; dir: Dir }> {
  const rows: Array<{ anim: Anim; dir: Dir }> = [];
  for (const anim of Object.keys(ANIMS) as Anim[]) {
    for (const dir of ANIMS[anim].dirs) rows.push({ anim, dir });
  }
  return rows;
}

export function renderHeroSheet(): HeroSheet {
  const rows = sheetRows();
  const width = SHEET_COLUMNS * FRAME;
  const height = rows.length * FRAME;
  const sheet = new Raster(width, height);
  const frames: SheetFrame[] = [];

  rows.forEach(({ anim, dir }, row) => {
    for (let i = 0; i < ANIMS[anim].frames; i++) {
      const frame = renderHeroFrame(anim, dir, i);
      const x = i * FRAME;
      const y = row * FRAME;
      sheet.blit(frame, x, y);
      frames.push({ name: frameName(anim, dir, i), x, y });
    }
  });

  return { width, height, data: sheet.data, frames };
}
