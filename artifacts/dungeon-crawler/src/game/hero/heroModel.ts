import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { RunState } from '../events';
import { armorAt, weaponAt, ARMORS, WEAPONS } from '../shop';

/**
 * An asset-free portrait of Wren: sculpted anatomy, tailored clothing and
 * deterministic micro-surface maps, lit with a warm portrait key.
 *
 * Everything the merchant sells shows up on the model:
 *
 *   weapon tier   the sword in the right hand (rusty → iron → steel → runed
 *                 → Dragonfang, then enchanted embers past the named tiers)
 *   armor tier    garments over the tunic (leather straps → chainmail →
 *                 plate → mithril, then a rune glow past the named tiers)
 *   vitality      a heart amulet on the chest that grows with level
 *   focus         mana crystals orbiting the rune gauntlet (up to six)
 *   far sight     a gold circlet with an amber eye gem on the hood
 *   luck          clover charms hanging from the belt (up to five)
 *   strength      red bands wrapped around the sword arm (up to four)
 *
 * The model is loaded lazily by the pause menu, so three.js never ships with
 * the gameplay bundle.
 */

// ---- Weathered, natural counterparts of the sprite palette ----------------

const C = {
  hood: 0x405c53,
  hoodDark: 0x253b34,
  hoodLight: 0x6b7964,
  skin: 0xc3987c,
  scarf: 0x773d36,
  scarfDark: 0x522d29,
  tunic: 0x665b48,
  tunicDark: 0x474336,
  belt: 0x33200f,
  buckle: 0xab9160,
  pauldron: 0x8f7150,
  pauldronLight: 0xb09c77,
  gauntlet: 0x4b5a75,
  gauntletLight: 0x7a8db0,
  rune: 0x67e8f9,
  trousers: 0x383d3c,
  boot: 0x4b2f1e,
  bootDark: 0x2c1a0f,
  grip: 0x5a3a22,
  hilt: 0xe8bb4c,
  leather: 0x3f2a17,
  mail: 0x9aa3b2,
  mailDark: 0x4c5361,
  plate: 0xb5bdc9,
  plateDark: 0x7f8794,
  mithril: 0xe8eef8,
  mithrilGlow: 0x8fb8ff,
  heart: 0x983e43,
  clover: 0x5b8c69,
  amber: 0xba8a39,
  ember: 0xff6a00,
  fang: 0xd9a86a,
  rust: 0x8f8470,
  iron: 0xb8c0cc,
  steel: 0xdfe6ee,
} as const;

// ---- Small builders --------------------------------------------------------------

type Mat = THREE.MeshPhysicalMaterial;

const materials: THREE.Material[] = [];
const geometries: THREE.BufferGeometry[] = [];
const textures: THREE.Texture[] = [];
type Surface = 'cloth' | 'leather' | 'skin' | 'metal';
type SurfaceMaps = { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture };
const surfaceMaps = new Map<Surface, SurfaceMaps>();

/** Shared per build, never fetched. Albedo is sRGB; height/roughness remain linear. */
function surface(kind: Surface): SurfaceMaps {
  const cached = surfaceMaps.get(kind);
  if (cached) return cached;
  const size = 256;
  const canvases = Array.from({ length: 3 }, () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    return canvas;
  });
  const contexts = canvases.map(c => c.getContext('2d')!);
  const images = contexts.map(c => c.createImageData(size, size));
  let seed = 1129;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const noise = random();
      const grain = Math.sin(x * 0.23 + Math.sin(y * 0.17)) * Math.sin(y * 0.19);
      const warp = Math.sin(x * Math.PI / 2);
      const weft = Math.sin(y * Math.PI / 2);
      const weave = ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? warp : weft);
      const height = kind === 'cloth' ? 125 + weave * 32 + noise * 18
        : kind === 'skin' ? 135 + noise * 24 - (noise < 0.075 ? 40 : 0)
        : kind === 'leather' ? 135 + grain * 25 + noise * 30
        : 155 + noise * 15 + Math.sin(x * 2 + y * 0.04) * 7;
      const albedo = kind === 'cloth' ? 219 + weave * 9 + noise * 14
        : kind === 'skin' ? 232 + grain * 7 + noise * 9
        : kind === 'leather' ? 208 + grain * 13 + noise * 18 : 226 + noise * 18;
      const values = [albedo, height, kind === 'metal' ? 160 + noise * 50 : 207 + noise * 36];
      for (let layer = 0; layer < 3; layer++) {
        const i = (y * size + x) * 4;
        images[layer].data[i] = values[layer];
        images[layer].data[i + 1] = values[layer] - (kind === 'skin' && layer === 0 ? 5 : 0);
        images[layer].data[i + 2] = values[layer] - (kind === 'skin' && layer === 0 ? 9 : 0);
        images[layer].data[i + 3] = 255;
      }
    }
  }
  contexts.forEach((context, i) => context.putImageData(images[i], 0, 0));
  if (kind === 'metal' || kind === 'leather') {
    for (let i = 0; i < 95; i++) {
      const x = random() * size;
      const y = random() * size;
      const length = 2 + random() * 24;
      contexts.forEach((context, layer) => {
        context.strokeStyle = layer === 0 ? 'rgba(240,234,218,.16)' : 'rgba(35,35,35,.23)';
        context.lineWidth = 0.5;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + length * 0.2, y + length);
        context.stroke();
      });
    }
  }
  const maps = canvases.map((canvas, i) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(kind === 'skin' ? 2 : 4, kind === 'skin' ? 2 : 4);
    if (i === 0) texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    textures.push(texture);
    return texture;
  });
  const result = { map: maps[0], bumpMap: maps[1], roughnessMap: maps[2] };
  surfaceMaps.set(kind, result);
  return result;
}

/** Continuous, bounded enhancement even after the visible accessory count caps. */
function mastery(level: number, pace = 8): number {
  return Math.max(0, level) / (Math.max(0, level) + pace);
}

function track<T extends THREE.BufferGeometry>(g: T): T {
  geometries.push(g);
  return g;
}

/** Matte fabric with a little sheen, like wool or leather. */
function cloth(color: number, opts: Partial<THREE.MeshPhysicalMaterialParameters> = {}): Mat {
  const m = new THREE.MeshPhysicalMaterial({
    color,
    ...surface('cloth'),
    bumpScale: 0.003,
    roughness: 0.82,
    metalness: 0,
    sheen: 0.22,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.3),
    ...opts,
  });
  materials.push(m);
  return m;
}

function leather(color: number): Mat {
  return cloth(color, { ...surface('leather'), bumpScale: 0.005, roughness: 0.72, sheen: 0.08 });
}

function metal(color: number, roughness = 0.32, opts: Partial<THREE.MeshPhysicalMaterialParameters> = {}): Mat {
  const m = new THREE.MeshPhysicalMaterial({ color, ...surface('metal'), bumpScale: 0.0012, roughness, metalness: 0.9, clearcoat: 0.08, clearcoatRoughness: 0.45, ...opts });
  materials.push(m);
  return m;
}

function glow(color: number, intensity = 1.2, base = 0x000000): Mat {
  const m = new THREE.MeshPhysicalMaterial({
    color: base || color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.3,
    metalness: 0,
    transmission: 0,
  });
  materials.push(m);
  return m;
}

function mesh(g: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(track(g), mat);
  m.position.set(x, y, z);
  return m;
}

function sphere(r: number, mat: Mat, x = 0, y = 0, z = 0, seg = 32): THREE.Mesh {
  return mesh(new THREE.SphereGeometry(r, seg, Math.max(12, seg / 2)), mat, x, y, z);
}

/** Vertical capsule of total length `len` (excluding the caps). */
function capsule(r: number, len: number, mat: Mat, x = 0, y = 0, z = 0): THREE.Mesh {
  return mesh(new THREE.CapsuleGeometry(r, len, 8, 24), mat, x, y, z);
}

function cylinder(rTop: number, rBot: number, h: number, mat: Mat, x = 0, y = 0, z = 0, seg = 32): THREE.Mesh {
  return mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat, x, y, z);
}

function cone(r: number, h: number, mat: Mat, x = 0, y = 0, z = 0, seg = 24): THREE.Mesh {
  return mesh(new THREE.ConeGeometry(r, h, seg), mat, x, y, z);
}

/** Horizontal ring lying in the XZ plane. */
function ring(r: number, tube: number, mat: Mat, x = 0, y = 0, z = 0, arc = Math.PI * 2): THREE.Mesh {
  const m = mesh(new THREE.TorusGeometry(r, tube, 12, 48, arc), mat, x, y, z);
  m.rotation.x = Math.PI / 2;
  return m;
}

/** Surface of revolution around Y; `points` are [radius, height]. */
function lathe(points: Array<[number, number]>, mat: Mat, phiStart = 0, phiLength = Math.PI * 2, seg = 48): THREE.Mesh {
  const g = new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
    phiStart,
    phiLength,
  );
  return mesh(g, mat);
}

function gem(radius: number, mat: Mat, x = 0, y = 0, z = 0): THREE.Mesh {
  return mesh(new THREE.OctahedronGeometry(radius, 0), mat, x, y, z);
}

/** A bevelled slab: a rounded rectangle extruded along Z, centred. */
function slab(w: number, h: number, d: number, mat: Mat, x = 0, y = 0, z = 0, bevel = 0.012): THREE.Mesh {
  const r = Math.min(bevel * 2, w / 3, h / 3);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const depth = Math.max(0.002, d - bevel * 2);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return mesh(g, mat, x, y, z);
}

/** Extrudes a 2D outline (in the XY plane) with a bevelled edge, centred on Z. */
function blade(shape: THREE.Shape, thickness: number, mat: Mat, bevel = 0.01): THREE.Mesh {
  const depth = Math.max(0.002, thickness - bevel * 2);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 12 });
  g.translate(0, 0, -depth / 2);
  return mesh(g, mat);
}

/** Straight, tapering blade outline of length `len` and width `w`. */
function straightOutline(len: number, w: number, tip = 0.18): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w * 0.42, len - tip);
  s.lineTo(0, len);
  s.lineTo(-w * 0.42, len - tip);
  s.closePath();
  return s;
}

/** Procedural chain-mail texture: rows of interlocking rings. */
function mailTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#4c5361';
  g.fillRect(0, 0, size, size);
  const step = 16;
  for (let row = 0; row < size / (step * 0.75) + 1; row++) {
    const y = row * step * 0.75;
    const offset = row % 2 ? step / 2 : 0;
    for (let x = -step; x < size + step; x += step) {
      g.beginPath();
      g.arc(x + offset, y, step * 0.42, 0, Math.PI * 2);
      g.lineWidth = 3.2;
      g.strokeStyle = '#b7c0cf';
      g.stroke();
      g.beginPath();
      g.arc(x + offset - 1, y + 1, step * 0.42, 0, Math.PI * 2);
      g.lineWidth = 1.2;
      g.strokeStyle = '#2f3540';
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  textures.push(tex);
  return tex;
}

/** Parts that move on their own each frame. */
interface Animated {
  update(t: number): void;
}

// ---- The hero -------------------------------------------------------------------

interface HeroBuild {
  group: THREE.Group;
  animated: Animated[];
  dispose(): void;
}

/**
 * Gear signature: rebuilding the model is only needed when one of these
 * changes, not on every HUD tick.
 */
export function gearSignature(run: RunState): string {
  const u = run.upgrades;
  return [run.weapon, run.armorTier, u.vitality, u.focus, u.reach, u.luck, u.strength].join(':');
}

/** Torso profile shared by the tunic and the armour layers: [radius, height]. */
const TORSO: Array<[number, number]> = [
  [0.0, 0.66],
  [0.33, 0.66],
  [0.3, 0.8],
  [0.27, 0.9],
  [0.29, 1.0],
  [0.31, 1.22],
  [0.32, 1.42],
  [0.29, 1.55],
  [0.16, 1.62],
  [0.0, 1.63],
];

/** Dense, smoothly interpolated profiles avoid both faceted cones and pill limbs. */
function tailoredProfile(points: Array<[number, number]>, mat: Mat, folds = 0): THREE.Mesh {
  const curve = new THREE.SplineCurve(points.map(([r, y]) => new THREE.Vector2(r, y)));
  const profile = curve.getPoints(points.length * 6).map(p => [Math.max(0, p.x), p.y] as [number, number]);
  const result = lathe(profile, mat, 0, Math.PI * 2, 64);
  if (folds) {
    const position = result.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      const angle = Math.atan2(x, z);
      const radius = Math.hypot(x, z);
      const fold = folds * (0.55 * Math.sin(angle * 11 + y * 9) + 0.3 * Math.sin(angle * 19 - y * 17));
      const ratio = radius > 0.01 ? 1 + fold / radius : 1;
      position.setXYZ(i, x * ratio, y, z * ratio);
    }
    result.geometry.computeVertexNormals();
  }
  return result;
}

function torsoLayer(mat: Mat, scale = 1, from = 0, to = TORSO.length): THREE.Mesh {
  const pts = TORSO.slice(from, to).map(([r, y]) => [r * scale, y] as [number, number]);
  const m = tailoredProfile(pts, mat, mat.metalness < 0.5 ? 0.008 : 0);
  m.scale.z = 0.74;
  return m;
}

function seam(parent: THREE.Group, points: number[][], radius: number, mat: Mat) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  const result = mesh(new THREE.TubeGeometry(curve, 28, radius, 6, false), mat);
  parent.add(result);
  return result;
}

function ellipsoid(parent: THREE.Group, mat: Mat, position: number[], scale: number[]): THREE.Mesh {
  const result = sphere(1, mat, ...position as [number, number, number]);
  result.scale.set(...scale as [number, number, number]);
  parent.add(result);
  return result;
}

/** A continuous facial surface, with jaw/cheek planes and sculpted orbital sockets. */
function sculptHead(parent: THREE.Group, skin: Mat) {
  const head = new THREE.Group();
  head.position.set(0, 1.875, 0.015);
  parent.add(head);
  const profile = new THREE.SplineCurve([
    new THREE.Vector2(0, -0.175), new THREE.Vector2(0.056, -0.157),
    new THREE.Vector2(0.095, -0.12), new THREE.Vector2(0.112, -0.073),
    new THREE.Vector2(0.123, -0.015), new THREE.Vector2(0.12, 0.07),
    new THREE.Vector2(0.099, 0.135), new THREE.Vector2(0.053, 0.169),
    new THREE.Vector2(0, 0.18),
  ]);
  const points = profile.getPoints(88);
  const geometry = new THREE.LatheGeometry(points, 96);
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const gaussian = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) =>
    Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const radius = Math.hypot(x, z);
    const front = radius > 0 ? Math.max(0, z / radius) : 0;
    let depth = z * 0.94;
    if (front > 0) {
      depth = radius * Math.pow(front, 0.43) * 0.91;
      depth += 0.032 * gaussian(x, y, 0, -0.013, 0.017, 0.065);
      depth += 0.043 * gaussian(x, y, 0, -0.045, 0.023, 0.022);
      depth += 0.011 * gaussian(x, y, 0, -0.10, 0.045, 0.018);
      depth += 0.017 * gaussian(x, y, 0, -0.142, 0.05, 0.024);
      for (const side of [-1, 1]) {
        depth -= 0.020 * gaussian(x, y, side * 0.047, 0.017, 0.030, 0.020);
        depth += 0.012 * gaussian(x, y, side * 0.059, 0.047, 0.036, 0.013);
        depth += 0.013 * gaussian(x, y, side * 0.076, -0.034, 0.033, 0.025);
      }
    }
    positions.setXYZ(i, x, y, depth);
  }
  geometry.computeVertexNormals();
  head.add(mesh(geometry, skin));

  const lip = cloth(0x9b6960, { ...surface('skin'), sheen: 0, roughness: 0.62, bumpScale: 0.0006 });
  const crease = cloth(0x5c3d32, { sheen: 0, bumpScale: 0 });
  const brow = leather(0x453b31);
  const white = cloth(0xd2cec0, { map: null, bumpMap: null, roughnessMap: null, roughness: 0.27, sheen: 0, clearcoat: 0.4 });
  const iris = metal(0x657266, 0.48, { metalness: 0, bumpScale: 0.0003 });
  const pupil = cloth(0x151914, { map: null, bumpMap: null, sheen: 0, roughness: 0.18 });
  for (const side of [-1, 1]) {
    const x = side * 0.047;
    ellipsoid(head, white, [x, 0.016, 0.098], [0.024, 0.011, 0.011]);
    ellipsoid(head, iris, [x - side * 0.001, 0.016, 0.108], [0.009, 0.009, 0.0028]);
    ellipsoid(head, pupil, [x - side * 0.001, 0.016, 0.110], [0.0038, 0.0045, 0.0015]);
    seam(head, [[x - 0.025, 0.015, 0.098], [x, 0.028, 0.104], [x + 0.025, 0.015, 0.098]], 0.003, skin);
    seam(head, [[x - 0.024, 0.014, 0.097], [x, 0.006, 0.103], [x + 0.024, 0.014, 0.097]], 0.0024, lip);
    seam(head, [[x - 0.027, 0.043, 0.105], [x, 0.051, 0.117], [x + 0.027, 0.045, 0.105]], 0.004, brow);
    for (let hair = 0; hair < 9; hair++) {
      const hx = x - 0.022 + hair * 0.0055;
      seam(head, [[hx, 0.045, 0.116], [hx + side * 0.004, 0.053, 0.115]], 0.0007, brow);
    }
    ellipsoid(head, skin, [side * 0.119, -0.032, -0.003], [0.016, 0.036, 0.020]);
    ellipsoid(head, lip, [side * 0.129, -0.03, 0.010], [0.006, 0.021, 0.008]);
    ellipsoid(head, skin, [side * 0.014, -0.047, 0.149], [0.011, 0.009, 0.011]);
    ellipsoid(head, crease, [side * 0.012, -0.053, 0.154], [0.004, 0.0025, 0.003]);
  }
  seam(head, [[-0.033, -0.092, 0.117], [-0.012, -0.087, 0.126], [0, -0.090, 0.127], [0.012, -0.087, 0.126], [0.033, -0.092, 0.117]], 0.0036, lip);
  seam(head, [[-0.030, -0.095, 0.118], [0, -0.102, 0.127], [0.030, -0.095, 0.118]], 0.004, lip);
  seam(head, [[-0.033, -0.094, 0.119], [0, -0.094, 0.129], [0.033, -0.094, 0.119]], 0.0012, crease);
  // A few swept locks break up the hood edge without concealing the face.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      seam(head, [[side * (0.026 + i * 0.012), 0.145 - i * 0.002, 0.048],
        [side * (0.08 + i * 0.006), 0.11 - i * 0.003, 0.085],
        [side * (0.108 + i * 0.001), 0.03 - i * 0.008, 0.041]], 0.0045, brow);
    }
  }
}

function hand(parent: THREE.Group, side: number, skin: Mat) {
  const x = side * 0.45;
  ellipsoid(parent, skin, [x, 0.755, 0.04], [0.046, 0.066, 0.026]);
  const nail = cloth(0xbfa18b, { ...surface('skin'), roughness: 0.4, sheen: 0, bumpScale: 0.0004 });
  for (let finger = 0; finger < 4; finger++) {
    if (side > 0) {
      const y = 0.787 - finger * 0.023;
      seam(parent, [[x + 0.028, y, 0.044], [x + 0.025, y - 0.007, 0.099],
        [x - 0.011, y - 0.008, 0.11], [x - 0.030, y - 0.004, 0.081]], 0.011, skin);
      ellipsoid(parent, nail, [x - 0.024, y - 0.003, 0.10], [0.007, 0.008, 0.002]);
    } else {
      const fx = x - 0.031 + finger * 0.020;
      const length = finger === 0 || finger === 3 ? 0.067 : 0.088;
      seam(parent, [[fx, 0.719, 0.042], [fx - 0.006, 0.69, 0.059],
        [fx - 0.005, 0.715 - length, 0.078]], 0.009, skin);
      ellipsoid(parent, nail, [fx - 0.005, 0.722 - length, 0.086], [0.006, 0.010, 0.002]);
    }
  }
  seam(parent, [[x - side * 0.032, 0.784, 0.042], [x - side * 0.062, 0.752, 0.065],
    [x - side * 0.037, 0.720, 0.083]], 0.013, skin);
}

function buildHero(run: RunState): HeroBuild {
  surfaceMaps.clear();
  const resourceStart = [geometries.length, materials.length, textures.length];
  const group = new THREE.Group();
  const animated: Animated[] = [];
  const body = new THREE.Group();
  group.add(body);

  const armorTier = run.armorTier;
  const weaponTier = run.weapon;
  const u = run.upgrades;

  // ---- Legs and boots --------------------------------------------------------
  const trousers = cloth(C.trousers);
  const bootMat = leather(C.boot);
  const bootDark = leather(C.bootDark);
  for (const side of [-1, 1]) {
    const leg = tailoredProfile([[0.070, -0.04], [0.086, 0.14], [0.071, 0.30],
      [0.084, 0.41], [0.12, 0.67], [0.125, 0.84]], trousers, 0.006);
    leg.position.x = side * 0.15;
    leg.scale.z = 0.92;
    body.add(leg);
    const boot = tailoredProfile([[0.078, -0.24], [0.073, -0.15], [0.079, -0.06],
      [0.087, 0.10], [0.082, 0.19]], bootMat, 0.003);
    boot.position.x = side * 0.15;
    body.add(boot);
    ellipsoid(body, bootMat, [side * 0.15, -0.245, 0.06], [0.087, 0.062, 0.165]);
    const sole = cylinder(0.092, 0.094, 0.027, bootDark, side * 0.15, -0.299, 0.063);
    sole.scale.z = 1.75;
    body.add(sole);
    body.add(ring(0.084, 0.01, bootDark, side * 0.15, 0.18, 0));
    for (let stitch = 0; stitch < 7; stitch++) {
      const y = -0.08 + stitch * 0.031;
      seam(body, [[side * 0.15 - 0.026, y, 0.077], [side * 0.15 + 0.026, y + 0.014, 0.08]], 0.0025, bootDark);
    }
    if (armorTier >= 3) {
      const knee = sphere(0.09, armorTier >= 4 ? metal(C.mithril, 0.25) : metal(C.plate), side * 0.15, 0.32, 0.067);
      knee.scale.set(1.1, 1, 0.8);
      body.add(knee);
    }
  }

  // ---- Torso, belt and buckle ----------------------------------------------------
  const tunic = cloth(C.tunic);
  body.add(torsoLayer(tunic));
  const belt = ring(0.29, 0.026, leather(C.belt), 0, 0.9, 0);
  belt.scale.set(1, 0.74, 1);
  body.add(belt);
  body.add(slab(0.11, 0.08, 0.03, metal(C.buckle, 0.28), 0, 0.9, 0.235, 0.008));
  const stitching = cloth(0x9b8b6e);
  for (const side of [-1, 1]) {
    seam(body, [[side * 0.15, 1.55, 0.16], [side * 0.23, 1.35, 0.16],
      [side * 0.20, 1.08, 0.17], [side * 0.19, 0.93, 0.17]], 0.002, stitching);
  }
  for (let i = 0; i < 7; i++) {
    body.add(sphere(0.006, metal(C.buckle, 0.5), 0, 1.08 + i * 0.06, 0.232, 12));
  }

  // ---- Arms: +x is the sword arm, -x the casting hand ---------------------------
  const skin = cloth(C.skin, { ...surface('skin'), bumpScale: 0.0012, roughness: 0.65, sheen: 0, clearcoat: 0.04, clearcoatRoughness: 0.7 });
  const sleeve = cloth(C.tunicDark);
  for (const side of [-1, 1]) {
    ellipsoid(body, tunic, [side * 0.34, 1.48, 0], [0.12, 0.10, 0.10]);
    const upper = tailoredProfile([[0.061, -0.17], [0.075, -0.08], [0.094, 0.06],
      [0.09, 0.16], [0.064, 0.20]], tunic, 0.004);
    upper.position.set(side * 0.405, 1.3, 0);
    upper.rotation.z = side * 0.1;
    body.add(upper);
    const fore = tailoredProfile([[0.046, -0.17], [0.057, -0.08], [0.077, 0.08],
      [0.068, 0.17]], sleeve, 0.004);
    fore.position.set(side * 0.44, 0.98, 0.02);
    fore.rotation.z = side * 0.05;
    body.add(fore);
    hand(body, side, skin);
  }

  // Rune gauntlet on the casting hand; its rune burns brighter with Focus.
  const focusGlow = 0.25 + mastery(u.focus) * 1.1;
  const gauntlet = cylinder(0.087, 0.057, 0.20, metal(C.gauntlet, 0.45), -0.445, 0.91, 0.02);
  body.add(gauntlet);
  body.add(ring(0.096, 0.012, metal(C.gauntletLight, 0.3), -0.445, 0.97, 0.02));
  body.add(ring(0.060, 0.009, metal(C.gauntletLight, 0.3), -0.445, 0.81, 0.02));
  const runeMat = glow(C.rune, focusGlow);
  body.add(slab(0.04, 0.12, 0.02, runeMat, -0.545, 0.87, 0.02, 0.005));
  body.add(slab(0.03, 0.05, 0.02, runeMat, -0.5, 0.87, 0.105, 0.005));

  // Bronze pauldron over the sword shoulder.
  const pauldron = mesh(new THREE.SphereGeometry(0.135, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), metal(C.pauldron, 0.46), 0.40, 1.50, 0);
  pauldron.scale.set(1, 0.85, 1.1);
  body.add(pauldron);
  const pauldronRim = ring(0.135, 0.009, metal(C.pauldronLight, 0.38), 0.40, 1.50, 0);
  pauldronRim.scale.set(1, 1, 1.1);
  body.add(pauldronRim);
  body.add(slab(0.06, 0.06, 0.02, metal(C.pauldronLight, 0.3), 0.42, 1.6, 0.1, 0.006));

  // ---- Cloak: a half lathe behind the body with a rippled hem --------------------
  const hoodMat = cloth(C.hood, { side: THREE.DoubleSide });
  const hoodDark = cloth(C.hoodDark, { side: THREE.DoubleSide });
  const cloakPoints: Array<[number, number]> = Array.from({ length: 65 }, (_, i) => {
    const t = i / 64;
    return [0.26 + 0.29 * Math.pow(t, 0.65), 1.6 - t * 1.45];
  });
  const cloak = lathe(cloakPoints, hoodMat, Math.PI / 2, Math.PI, 96);
  rippleHem(cloak.geometry, 1.62, 0.14);
  cloak.position.z = -0.02;
  const cloakPivot = new THREE.Group();
  cloakPivot.position.y = 1.6;
  cloak.position.y = -1.6;
  cloakPivot.add(cloak);
  body.add(cloakPivot);
  // Lining shows at the hem where the cloak turns.
  const lining = lathe(cloakPoints.map(([r, y]) => [r - 0.007, y]), hoodDark, Math.PI / 2, Math.PI, 96);
  rippleHem(lining.geometry, 1.62, 0.14);
  lining.position.set(0, -1.6, -0.02);
  cloakPivot.add(lining);
  animated.push({
    update: (t) => {
      cloakPivot.rotation.x = -0.035 + Math.sin(t * 1.3) * 0.012;
    },
  });

  // ---- Scarf collar and a tail that flutters -------------------------------------
  const scarf = cloth(C.scarf);
  const scarfDark = cloth(C.scarfDark);
  const collar = ring(0.135, 0.035, scarf, 0, 1.64, 0);
  collar.scale.set(1, 0.85, 1);
  body.add(collar);
  for (let i = 0; i < 4; i++) {
    const fold = ring(0.133 + i * 0.005, 0.006, i % 2 ? scarfDark : scarf, 0, 1.619 + i * 0.012, 0);
    fold.scale.set(1, 0.85, 1);
    fold.rotation.z = i * 0.015;
    body.add(fold);
  }
  const knot = sphere(0.07, scarfDark, 0.14, 1.6, -0.2);
  body.add(knot);
  const tail = new THREE.Group();
  tail.position.set(0.14, 1.58, -0.24);
  const tail1 = capsule(0.045, 0.22, scarf, 0, -0.15, 0);
  tail1.scale.z = 0.5;
  tail.add(tail1);
  const tail2 = capsule(0.04, 0.2, scarfDark, 0.03, -0.42, -0.02);
  tail2.scale.z = 0.5;
  tail.add(tail2);
  body.add(tail);
  animated.push({
    update: (t) => {
      tail.rotation.z = -0.35 + Math.sin(t * 2.1) * 0.12;
      tail.rotation.x = -0.25 + Math.sin(t * 1.7 + 1) * 0.1;
    },
  });

  // ---- Adult face: a shaped jaw, cheekbones, sockets, nose and natural eyes ------
  body.add(cylinder(0.061, 0.083, 0.13, skin, 0, 1.688, 0.005));
  sculptHead(body, skin);

  // ---- Hood: a sphere open at the front, with a lining and a peak -----------------
  const opening = 0.86;
  const hood = mesh(
    new THREE.SphereGeometry(0.185, 64, 40, Math.PI / 2 + opening, Math.PI * 2 - opening * 2, 0, Math.PI * 0.83),
    hoodMat,
    0,
    1.88,
    -0.02,
  );
  rippleHem(hood.geometry, 0.24, 0.08);
  hood.scale.set(1, 1.23, 0.98);
  body.add(hood);
  const hoodLining = mesh(
    new THREE.SphereGeometry(0.179, 64, 40, Math.PI / 2 + opening, Math.PI * 2 - opening * 2, 0, Math.PI * 0.83),
    hoodDark,
    0,
    1.88,
    -0.02,
  );
  rippleHem(hoodLining.geometry, 0.24, 0.08);
  hoodLining.scale.set(1, 1.23, 0.98);
  body.add(hoodLining);
  // Rolled brim framing the face: an arc in the vertical plane, open at the chin.
  const brimMaterial = cloth(C.hoodLight);
  seam(body, [[-0.128, 1.716, 0.063], [-0.146, 1.835, 0.111], [-0.125, 1.98, 0.12],
    [0, 2.093, 0.056], [0.125, 1.98, 0.12], [0.146, 1.835, 0.111], [0.128, 1.716, 0.063]], 0.008, brimMaterial);
  for (const side of [-1, 1]) {
    seam(body, [[side * 0.15, 1.76, -0.10], [side * 0.16, 1.90, -0.10],
      [side * 0.10, 2.05, -0.11], [0, 2.10, -0.06]], 0.002, brimMaterial);
  }

  addArmor(body, armorTier);
  addUpgrades(body, run, animated);

  // ---- The sword, held blade-up so it can be admired ----------------------------
  const sword = buildSword(weaponTier, animated);
  sword.position.set(0.48, 0.87, 0.075);
  sword.rotation.z = -0.18;
  sword.rotation.x = -0.12;
  body.add(sword);

  // Longer legs and a seven-head adult silhouette; all equipment shares the rig.
  body.scale.x = 0.88;
  body.position.y = 0.315;
  animated.push({
    update: (t) => {
      body.position.y = 0.315 + Math.sin(t * 1.8) * 0.003;
    },
  });

  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  const ownedGeometry = geometries.splice(resourceStart[0]);
  const ownedMaterials = materials.splice(resourceStart[1]);
  const ownedTextures = textures.splice(resourceStart[2]);
  surfaceMaps.clear();
  return {
    group, animated,
    dispose() {
      ownedGeometry.forEach(g => g.dispose());
      ownedMaterials.forEach(m => m.dispose());
      ownedTextures.forEach(t => t.dispose());
    },
  };
}

/** Pushes lathe vertices in and out around the hem so cloth does not hang like a tube. */
function rippleHem(geometry: THREE.BufferGeometry, topY: number, amount: number) {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (y >= topY) continue;
    const phi = Math.atan2(x, z);
    const strength = (topY - y) / topY;
    const f = 1 + (Math.sin(phi * 9 + y * 1.7) + Math.sin(phi * 17 - y * 2.5) * 0.28) * amount * strength;
    pos.setXYZ(i, x * f, y + Math.sin(phi * 9) * amount * strength * 0.09, z * f);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

// ---- Armour ------------------------------------------------------------------------

function addArmor(body: THREE.Group, tier: number) {
  if (tier <= 0) return;

  if (tier === 1) {
    // Leather: crossed chest straps and bracers.
    const leatherMat = leather(C.leather);
    for (const dir of [-1, 1]) {
      const strap = mesh(new THREE.TorusGeometry(0.31, 0.022, 10, 48, Math.PI * 0.95), leatherMat, 0, 1.22, 0);
      strap.rotation.set(0, dir * 0.55, Math.PI * 0.05 * -dir);
      strap.scale.set(1, 1.3, 0.76);
      body.add(strap);
    }
    for (const side of [-1, 1]) {
      body.add(cylinder(0.079, 0.066, 0.16, leatherMat, side * 0.44, 1.0, 0.02));
      body.add(ring(0.082, 0.01, metal(C.buckle, 0.3), side * 0.44, 1.06, 0.02));
    }
    return;
  }

  if (tier === 2) {
    // Chainmail: a ringed shirt over the tunic with mail sleeves and a collar.
    const mailMap = mailTexture();
    const mail = metal(C.mail, 0.62, { map: mailMap, bumpMap: mailMap, bumpScale: 0.005, metalness: 0.85 });
    const shirt = torsoLayer(mail, 1.05, 2, 9);
    body.add(shirt);
    for (const side of [-1, 1]) {
      const sleeve = capsule(0.086, 0.22, mail, side * 0.41, 1.3, 0);
      sleeve.rotation.z = side * 0.1;
      body.add(sleeve);
    }
    body.add(ring(0.27, 0.045, metal(C.mailDark, 0.5), 0, 1.56, 0));
    return;
  }

  // Plate (tier 3) and mithril (tier 4+): breastplate, tassets, a second
  // pauldron and a gorget. Mithril is pale and faintly luminous, and
  // enchanted mithril glows harder with each +N.
  const mithril = tier >= 4;
  const enchant = Math.max(0, tier - (ARMORS.length - 1));
  const plateMat = mithril
    ? metal(C.mithril, 0.34 - mastery(enchant) * 0.15, { emissive: new THREE.Color(C.mithrilGlow), emissiveIntensity: 0.025 + mastery(enchant) * 0.28 })
    : metal(C.plate, 0.3);
  const trim = mithril ? metal(C.mithril, 0.2) : metal(C.plateDark, 0.35);

  const breast = torsoLayer(plateMat, 1.06, 3, 8);
  body.add(breast);
  const gorget = ring(0.26, 0.05, trim, 0, 1.56, 0);
  gorget.scale.set(1, 1, 0.8);
  body.add(gorget);
  // A raised centre ridge.
  const ridge = capsule(0.025, 0.36, trim, 0, 1.25, 0.245);
  ridge.scale.z = 0.5;
  body.add(ridge);
  for (const side of [-1, 1]) {
    const tasset = mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.22, 24, 1, true, side > 0 ? 0.2 : Math.PI - 1.0, 0.8), plateMat, 0, 0.78, 0);
    tasset.scale.z = 0.8;
    body.add(tasset);
    body.add(capsule(0.08, 0.16, plateMat, side * 0.44, 1.0, 0.02));
  }
  // The casting shoulder gets its own pauldron; the sword shoulder keeps bronze.
  const p2 = mesh(new THREE.SphereGeometry(0.135, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), plateMat, -0.40, 1.50, 0);
  p2.scale.set(1, 0.85, 1.1);
  body.add(p2);
  const rim2 = ring(0.135, 0.009, trim, -0.40, 1.50, 0);
  rim2.scale.set(1, 1, 1.1);
  body.add(rim2);
  if (mithril) {
    // Brow plate under the hood and rune lines across the chest.
    const brow = mesh(new THREE.TorusGeometry(0.155, 0.009, 10, 40, Math.PI * 0.8), plateMat, 0, 1.996, 0.005);
    brow.rotation.set(Math.PI / 2, 0, Math.PI * 0.6);
    body.add(brow);
    const rune = glow(C.mithrilGlow, 0.32 + mastery(enchant) * 1.0);
    const line = mesh(new THREE.TorusGeometry(0.325, 0.008, 8, 48, Math.PI * 0.7), rune, 0, 1.33, 0);
    line.rotation.set(Math.PI / 2, 0, Math.PI * 0.15);
    line.scale.set(1, 0.76, 1);
    body.add(line);
    body.add(capsule(0.008, 0.26, rune, 0, 1.2, 0.27));
  }
}

// ---- Upgrades ------------------------------------------------------------------------

function addUpgrades(body: THREE.Group, run: RunState, animated: Animated[]) {
  const u = run.upgrades;

  // Vitality: a heart amulet on a chain, bigger and brighter per level.
  if (u.vitality > 0) {
    const chain = mesh(new THREE.TorusGeometry(0.2, 0.006, 8, 40, Math.PI), metal(C.buckle, 0.3), 0, 1.6, 0.16);
    chain.rotation.set(0.5, 0, Math.PI);
    chain.scale.set(1, 1.1, 0.7);
    body.add(chain);
    const heart = new THREE.Group();
    heart.position.set(0, 1.4, 0.26);
    const heartMat = metal(C.heart, 0.3, { metalness: 0.2, clearcoat: 0.65,
      emissive: C.heart, emissiveIntensity: 0.15 + mastery(u.vitality) * 0.65 });
    heart.add(sphere(0.045, heartMat, -0.032, 0.02, 0, 20));
    heart.add(sphere(0.045, heartMat, 0.032, 0.02, 0, 20));
    const point = cone(0.068, 0.09, heartMat, 0, -0.035, 0, 20);
    point.rotation.x = Math.PI;
    point.scale.z = 0.7;
    heart.add(point);
    heart.scale.setScalar(0.55 + mastery(u.vitality) * 0.75);
    body.add(heart);
    animated.push({
      update: (t) => {
        heart.rotation.y = Math.sin(t * 0.9) * 0.12;
        const pulse = 1 + Math.max(0, Math.sin(t * 3.4)) * 0.06;
        heart.scale.setScalar((0.55 + mastery(u.vitality) * 0.75) * pulse);
      },
    });
  }

  // Focus: mana crystals orbit the gauntlet.
  if (u.focus > 0) {
    const count = Math.min(u.focus, 6);
    const orbit = new THREE.Group();
    orbit.position.set(-0.445, 0.87, 0.02);
    body.add(orbit);
    const crystalMat = glow(C.rune, 0.5 + mastery(u.focus) * 1.1, 0x537c85);
    const crystals: THREE.Mesh[] = [];
    for (let i = 0; i < count; i++) {
      const c = gem(0.023 + mastery(u.focus) * 0.023, crystalMat);
      c.scale.y = 1.6;
      crystals.push(c);
      orbit.add(c);
    }
    animated.push({
      update: (t) => {
        crystals.forEach((c, i) => {
          const a = t * 1.4 + (i / count) * Math.PI * 2;
          c.position.set(Math.cos(a) * 0.26, Math.sin(a * 1.3 + i) * 0.08, Math.sin(a) * 0.26);
          c.rotation.y = t * 2 + i;
        });
      },
    });
  }

  // Far Sight: a gold circlet round the hood with an amber eye gem.
  if (u.reach > 0) {
    const circlet = ring(0.184, 0.008 + mastery(u.reach) * 0.004, metal(C.buckle, 0.35 - mastery(u.reach) * 0.15), 0, 1.982, -0.02);
    circlet.scale.set(1, 1, 1.04);
    body.add(circlet);
    const setting = sphere(0.022 + mastery(u.reach) * 0.020, metal(C.buckle, 0.25), 0, 1.982, 0.175, 24);
    setting.scale.z = 0.5;
    body.add(setting);
    const eye = gem(0.017 + mastery(u.reach) * 0.019, glow(C.amber, 0.3 + mastery(u.reach) * 0.8, C.amber), 0, 1.982, 0.187);
    body.add(eye);
    animated.push({
      update: (t) => {
        eye.scale.setScalar(1 + Math.sin(t * 2.2) * 0.08);
      },
    });
  }

  // Luck: clover charms swinging from the belt.
  if (u.luck > 0) {
    const count = Math.min(u.luck, 5);
    const leafMat = metal(C.clover, 0.48 - mastery(u.luck) * 0.2, { emissive: C.clover, emissiveIntensity: 0.08 + mastery(u.luck) * 0.5, metalness: 0.5 });
    const stemMat = cloth(0x2f7a4a);
    const string = metal(C.buckle, 0.3);
    const charms: THREE.Group[] = [];
    for (let i = 0; i < count; i++) {
      const x = count > 1 ? -0.16 + (i / (count - 1)) * 0.32 : 0.12;
      const charm = new THREE.Group();
      charm.scale.setScalar(0.7 + mastery(u.luck) * 0.5);
      charm.position.set(x, 0.87, 0.27 - Math.abs(x) * 0.25);
      charm.add(cylinder(0.005, 0.005, 0.09, string, 0, -0.045, 0));
      charm.add(cylinder(0.006, 0.006, 0.05, stemMat, 0, -0.12, 0));
      const leafR = 0.022;
      for (const [lx, ly] of [
        [-leafR, 0],
        [leafR, 0],
        [0, leafR],
        [0, -leafR],
      ]) {
        const leaf = sphere(leafR, leafMat, lx, -0.12 + ly - leafR * 0.5, 0, 12);
        leaf.scale.z = 0.35;
        charm.add(leaf);
      }
      charms.push(charm);
      body.add(charm);
    }
    animated.push({
      update: (t) => {
        charms.forEach((c, i) => {
          c.rotation.z = Math.sin(t * 2.4 + i) * 0.25;
          c.rotation.x = Math.sin(t * 1.9 + i * 2) * 0.15;
        });
      },
    });
  }

  // Strength: red bands wrapped round the sword forearm, one per level.
  if (u.strength > 0) {
    const bands = Math.min(u.strength, 4);
    const bandMat = cloth(C.scarfDark, { roughness: 0.9 - mastery(u.strength) * 0.25,
      color: new THREE.Color(C.scarfDark).lerp(new THREE.Color(0xa87552), mastery(u.strength) * 0.65) });
    for (let i = 0; i < bands; i++) {
      body.add(ring(0.079, 0.010 + mastery(u.strength) * 0.008, bandMat, 0.445, 0.9 + i * 0.06, 0.02));
    }
    // Bulkier upper arm past the first level.
    const bulk = tailoredProfile([[0.06, -0.15], [0.078, -0.06],
      [0.085 + mastery(u.strength) * 0.035, 0.06], [0.085, 0.17]], cloth(C.tunic), 0.004);
    bulk.position.set(0.41, 1.31, 0);
    bulk.rotation.z = 0.1;
    body.add(bulk);
  }
}

// ---- Swords ------------------------------------------------------------------------------

/** Blade rises along +y from the hand; the grip hangs below it. */
function buildSword(tier: number, animated: Animated[]): THREE.Group {
  const sword = new THREE.Group();
  const named = Math.min(tier, WEAPONS.length - 1);
  const enchant = Math.max(0, tier - (WEAPONS.length - 1));

  const gripMat = leather(C.grip);
  const hiltMat = metal(C.hilt, 0.28);

  const addGrip = (length: number, pommel: Mat, wraps = 4) => {
    sword.add(cylinder(0.032, 0.03, length, gripMat, 0, -length / 2 - 0.02, 0, 20));
    for (let i = 0; i < wraps; i++) {
      sword.add(ring(0.033, 0.006, cloth(C.tunicDark, { roughness: 0.6 }), 0, -0.05 - (i + 0.5) * (length / wraps), 0));
    }
    sword.add(sphere(0.045, pommel, 0, -length - 0.05, 0, 20));
  };

  const straightBlade = (length: number, width: number, mat: Mat, fuller?: Mat) => {
    const b = blade(straightOutline(length, width), 0.036, mat, 0.008);
    b.position.y = 0.1;
    sword.add(b);
    if (fuller) {
      const f = capsule(width * 0.12, length * 0.55, fuller, 0, 0.1 + length * 0.4, 0);
      f.scale.z = 0.6;
      sword.add(f);
    }
  };

  switch (named) {
    case 0: {
      // Rusty: short, dull, pitted, with a plain iron cross-guard.
      addGrip(0.22, metal(C.rust, 0.7), 3);
      sword.add(slab(0.24, 0.05, 0.06, metal(0x6b6258, 0.75), 0, 0.07, 0));
      straightBlade(0.72, 0.1, metal(C.rust, 0.72, { metalness: 0.7 }));
      const pit = cloth(0x6a5540, { sheen: 0 });
      for (const [px, py] of [
        [0.02, 0.4],
        [-0.025, 0.62],
        [0.015, 0.25],
      ]) {
        const p = sphere(0.014, pit, px, py, 0.02, 10);
        p.scale.z = 0.3;
        sword.add(p);
      }
      break;
    }
    case 1: {
      // Iron: a proper blade with a plain guard.
      addGrip(0.24, metal(C.iron, 0.4));
      sword.add(slab(0.3, 0.05, 0.07, metal(0x7d8592, 0.4), 0, 0.07, 0));
      straightBlade(0.9, 0.11, metal(C.iron, 0.38));
      break;
    }
    case 2: {
      // Steel longsword: longer, brighter, gold guard and a fuller.
      addGrip(0.28, hiltMat);
      const guard = slab(0.38, 0.05, 0.08, hiltMat, 0, 0.07, 0);
      sword.add(guard);
      for (const side of [-1, 1]) sword.add(sphere(0.03, hiltMat, side * 0.19, 0.07, 0, 16));
      straightBlade(1.1, 0.12, metal(C.steel, 0.22), metal(0xaab4c2, 0.4));
      break;
    }
    case 3: {
      // Runed blade: steel with cyan runes down the blade and a rune gem in the guard.
      addGrip(0.28, hiltMat);
      const guard = slab(0.42, 0.06, 0.09, hiltMat, 0, 0.07, 0);
      sword.add(guard);
      for (const side of [-1, 1]) {
        const tip = cone(0.03, 0.08, hiltMat, side * 0.24, 0.07, 0, 16);
        tip.rotation.z = -side * Math.PI / 2;
        sword.add(tip);
      }
      straightBlade(1.18, 0.13, metal(C.steel, 0.2));
      const runeMat = glow(C.rune, 1.5);
      for (let i = 0; i < 5; i++) {
        for (const z of [-1, 1]) {
          const r = cylinder(0.02, 0.02, 0.006, runeMat, 0, 0.32 + i * 0.18, z * 0.02, 12);
          r.rotation.x = Math.PI / 2;
          r.scale.y = 1.6;
          sword.add(r);
        }
      }
      sword.add(gem(0.045, runeMat, 0, 0.07, 0.06));
      animated.push({
        update: (t) => {
          runeMat.emissiveIntensity = 1.2 + Math.sin(t * 3) * 0.5;
        },
      });
      break;
    }
    default: {
      // Dragonfang: a curved, ember-lit fang with a horned guard. Every
      // enchantment past it adds embers drifting off the edge.
      addGrip(0.3, metal(0x8d2323, 0.4));
      sword.add(sphere(0.05, glow(C.ember, 1.2, C.ember), 0, -0.4, 0, 16));
      const guardMat = metal(0x5a2d12, 0.45);
      sword.add(slab(0.2, 0.06, 0.09, guardMat, 0, 0.08, 0));
      for (const side of [-1, 1]) {
        const horn = cone(0.035, 0.26, guardMat, side * 0.2, 0.14, 0, 16);
        horn.rotation.z = -side * 0.9;
        sword.add(horn);
      }
      const fangMat = metal(C.fang, 0.4 - mastery(enchant) * 0.2, { emissive: new THREE.Color(C.ember), emissiveIntensity: 0.06 + mastery(enchant) * 0.4 });
      const outline = new THREE.Shape();
      outline.moveTo(-0.07, 0);
      outline.quadraticCurveTo(-0.02, 0.85, 0.28, 1.42);
      outline.quadraticCurveTo(0.3, 0.7, 0.075, 0);
      outline.closePath();
      const fang = blade(outline, 0.04, fangMat, 0.01);
      fang.position.y = 0.1;
      sword.add(fang);
      // Ember edge along the outer curve.
      const edgeMat = glow(C.ember, 0.65 + mastery(enchant) * 1.2);
      const edge = new THREE.Shape();
      edge.moveTo(0.075, 0);
      edge.quadraticCurveTo(0.31, 0.7, 0.28, 1.42);
      edge.quadraticCurveTo(0.27, 0.7, 0.045, 0);
      edge.closePath();
      const edgeMesh = blade(edge, 0.05, edgeMat, 0.004);
      edgeMesh.position.y = 0.1;
      sword.add(edgeMesh);
      animated.push({
        update: (t) => {
          edgeMat.emissiveIntensity = 0.65 + mastery(enchant) * 1.2 + Math.sin(t * 4) * 0.15;
        },
      });
      if (enchant > 0) {
        const embers: THREE.Mesh[] = [];
        const emberMat = glow(C.ember, 2, C.amber);
        for (let i = 0; i < Math.min(enchant, 8); i++) {
          const e = sphere(0.014, emberMat, 0, 0, 0, 8);
          embers.push(e);
          sword.add(e);
        }
        animated.push({
          update: (t) => {
            embers.forEach((e, i) => {
              const p = (t * 0.5 + i / embers.length) % 1;
              e.position.set(0.12 + Math.sin(t * 3 + i) * 0.06 + p * 0.28, 0.3 + p * 1.2, 0.05 + Math.cos(t * 2 + i) * 0.05);
              e.scale.setScalar(1 - p * 0.7);
            });
          },
        });
      }
      break;
    }
  }
  return sword;
}


// ---- Dungeon stage -----------------------------------------------------------------------

/** Wet cobblestones: dark rounded slabs with pale mortar. */
function cobbleTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#17161c';
  g.fillRect(0, 0, size, size);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const cell = 32;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const w = cell - 4 - rnd() * 6;
      const h = cell - 4 - rnd() * 6;
      const ox = x + 2 + rnd() * 3;
      const oy = y + 2 + rnd() * 3;
      const shade = 34 + rnd() * 22;
      g.fillStyle = `rgb(${shade + 2},${shade},${shade + 8})`;
      g.beginPath();
      g.roundRect(ox, oy, w, h, 6);
      g.fill();
      g.fillStyle = `rgba(255,255,255,${0.04 + rnd() * 0.05})`;
      g.beginPath();
      g.roundRect(ox + 2, oy + 2, w - 4, h * 0.35, 5);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  tex.colorSpace = THREE.SRGBColorSpace;
  textures.push(tex);
  return tex;
}

/** Rough stone bricks with staggered courses. */
function brickTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0f0e14';
  g.fillRect(0, 0, size, size);
  let seed = 3;
  const rnd = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  const bw = 64;
  const bh = 32;
  for (let row = 0; row < size / bh; row++) {
    const offset = row % 2 ? bw / 2 : 0;
    for (let x = -bw; x < size + bw; x += bw) {
      const shade = 30 + rnd() * 18;
      g.fillStyle = `rgb(${shade},${shade - 2},${shade + 6})`;
      g.beginPath();
      g.roundRect(x + offset + 2, row * bh + 2, bw - 4, bh - 4, 3);
      g.fill();
      g.fillStyle = `rgba(0,0,0,${0.15 + rnd() * 0.2})`;
      g.fillRect(x + offset + 2, row * bh + bh - 8, bw - 4, 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  textures.push(tex);
  return tex;
}

interface Stage {
  group: THREE.Group;
  animated: Animated[];
  dispose(): void;
}

/**
 * A torchlit stone corridor behind the hero: wet cobbles, brick walls, an
 * arch fading into the dark, two flickering torches and drifting dust.
 */
function buildDungeon(): Stage {
  const textureStart = textures.length;
  const group = new THREE.Group();
  const animated: Animated[] = [];
  const own: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const g = <T extends THREE.BufferGeometry>(x: T) => {
    own.push(x);
    return x;
  };
  const m = <T extends THREE.Material>(x: T) => {
    mats.push(x);
    return x;
  };

  // Floor: cobbles with a wet clearcoat.
  const floor = new THREE.Mesh(
    g(new THREE.PlaneGeometry(14, 14)),
    m(new THREE.MeshPhysicalMaterial({ map: cobbleTexture(), color: 0xb9b6c4, roughness: 0.55, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.35 })),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // Walls: a back wall with an arched opening, and two angled side walls.
  const brick = m(new THREE.MeshPhysicalMaterial({ map: brickTexture(), color: 0xb5b0c0, roughness: 0.9, metalness: 0 }));
  const back = new THREE.Mesh(g(new THREE.BoxGeometry(12, 6, 0.6)), brick);
  back.position.set(0, 3, -3.6);
  back.receiveShadow = true;
  group.add(back);
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(g(new THREE.BoxGeometry(0.6, 6, 8)), brick);
    wall.position.set(side * 3.4, 3, -0.2);
    wall.rotation.y = side * 0.12;
    wall.receiveShadow = true;
    group.add(wall);
  }
  // The arch: a dark passage with a stone ring and pillars.
  const dark = m(new THREE.MeshBasicMaterial({ color: 0x030308 }));
  const passage = new THREE.Mesh(g(new THREE.PlaneGeometry(2.4, 3.2)), dark);
  passage.position.set(0, 1.6, -3.29);
  group.add(passage);
  const passageTop = new THREE.Mesh(g(new THREE.CircleGeometry(1.2, 32, 0, Math.PI)), dark);
  passageTop.position.set(0, 3.2, -3.29);
  group.add(passageTop);
  const stone = m(new THREE.MeshPhysicalMaterial({ map: brickTexture(), color: 0x8d8894, roughness: 0.9 }));
  const arch = new THREE.Mesh(g(new THREE.TorusGeometry(1.32, 0.14, 12, 40, Math.PI)), stone);
  arch.position.set(0, 3.2, -3.25);
  group.add(arch);
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(g(new THREE.CylinderGeometry(0.15, 0.18, 3.3, 20)), stone);
    pillar.position.set(side * 1.32, 1.6, -3.25);
    group.add(pillar);
    const cap = new THREE.Mesh(g(new THREE.BoxGeometry(0.5, 0.16, 0.5)), stone);
    cap.position.set(side * 1.32, 3.2, -3.25);
    group.add(cap);
  }

  // Torches on the side walls.
  const flameMat = m(new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.95 }));
  const emberMat = m(new THREE.MeshBasicMaterial({ color: 0xff5a1f }));
  const wood = m(new THREE.MeshPhysicalMaterial({ color: 0x3b2a1a, roughness: 0.9 }));
  const iron = m(new THREE.MeshPhysicalMaterial({ color: 0x2a2a30, roughness: 0.5, metalness: 0.8 }));
  const torches: Array<{ light: THREE.PointLight; flame: THREE.Mesh; core: THREE.Mesh; phase: number }> = [];
  for (const side of [-1, 1]) {
    const x = side * 1.62;
    const z = -3.05;
    const bracket = new THREE.Mesh(g(new THREE.TorusGeometry(0.09, 0.02, 8, 20)), iron);
    bracket.position.set(x, 2.05, z);
    bracket.rotation.x = Math.PI / 2;
    group.add(bracket);
    const stick = new THREE.Mesh(g(new THREE.CylinderGeometry(0.035, 0.045, 0.5, 10)), wood);
    stick.position.set(x, 2.1, z + 0.05);
    stick.rotation.x = 0.3;
    group.add(stick);
    const flame = new THREE.Mesh(g(new THREE.ConeGeometry(0.1, 0.34, 12)), flameMat);
    flame.position.set(x, 2.5, z + 0.12);
    group.add(flame);
    const core = new THREE.Mesh(g(new THREE.SphereGeometry(0.065, 12, 8)), emberMat);
    core.position.set(x, 2.38, z + 0.12);
    group.add(core);
    const light = new THREE.PointLight(0xff8c3a, 9, 10, 2);
    light.position.set(x, 2.5, z + 0.5);
    group.add(light);
    torches.push({ light, flame, core, phase: side * 1.7 });
  }
  animated.push({
    update: (t) => {
      for (const torch of torches) {
        const f = 0.85 + Math.sin(t * 11 + torch.phase) * 0.08 + Math.sin(t * 23 + torch.phase * 2) * 0.05;
        torch.light.intensity = 9 * f;
        torch.flame.scale.set(1 + (f - 0.85) * 2, 0.9 + (f - 0.85) * 3, 1);
        torch.flame.rotation.z = Math.sin(t * 9 + torch.phase) * 0.12;
        torch.core.scale.setScalar(0.9 + (f - 0.85) * 2);
      }
    },
  });

  // Drifting dust motes.
  const count = 160;
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 6;
    positions[i * 3 + 1] = Math.random() * 3.5;
    positions[i * 3 + 2] = -3 + Math.random() * 5;
    speeds[i] = 0.05 + Math.random() * 0.1;
  }
  const dustGeo = g(new THREE.BufferGeometry());
  dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dust = new THREE.Points(
    dustGeo,
    m(new THREE.PointsMaterial({ color: 0xffd9a0, size: 0.035, transparent: true, opacity: 0.55, sizeAttenuation: true, depthWrite: false })),
  );
  group.add(dust);
  animated.push({
    update: (t) => {
      const p = dustGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < count; i++) {
        let y = p.getY(i) + speeds[i] * 0.016;
        if (y > 3.6) y = 0;
        p.setY(i, y);
        p.setX(i, p.getX(i) + Math.sin(t * 0.5 + i) * 0.0008);
      }
      p.needsUpdate = true;
    },
  });

  const ownTextures = textures.splice(textureStart);
  return {
    group,
    animated,
    dispose() {
      for (const x of own) x.dispose();
      for (const x of mats) x.dispose();
      for (const x of ownTextures) x.dispose();
    },
  };
}

// ---- Viewer ------------------------------------------------------------------------------

export interface HeroViewer {
  /** Swap in the current run; rebuilds only when gear changed. */
  setRun(run: RunState): void;
  dispose(): void;
}

/** Everything gameplay names, for the pause menu's gear line. */
export function describeGear(run: RunState) {
  return { weapon: weaponAt(run.weapon), armor: armorAt(run.armorTier) };
}

/**
 * Mounts a transparent WebGL canvas into `container` showing the hero, slowly
 * turning; drag to spin it. Throws if WebGL is unavailable.
 */
export function createHeroViewer(container: HTMLElement, run: RunState): HeroViewer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x07070c, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.touchAction = 'none';
  canvas.setAttribute('aria-label', 'Wren, your hero, in 3D. Drag to turn.');
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.55, 5.65);
  camera.lookAt(0, 1.36, 0);

  // Image-based lighting gives the metals something to reflect.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const env = pmrem.fromScene(envScene, 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.38;
  pmrem.dispose();
  envScene.dispose();

  scene.add(new THREE.HemisphereLight(0xb5c4cf, 0x30261f, 0.45));
  const key = new THREE.DirectionalLight(0xffe9d3, 2.7);
  key.position.set(-2.3, 3.8, 4);
  key.target.position.set(0, 1.5, 0);
  scene.add(key.target);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 12;
  key.shadow.camera.left = -1.6;
  key.shadow.camera.right = 1.6;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -0.5;
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.012;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xa7b8c6, 1.8);
  rim.position.set(-3, 2, -2.5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xd3deea, 0.85);
  fill.position.set(2, 2.2, 4);
  scene.add(fill);

  // The torchlit corridor the hero stands in.
  const stage = buildDungeon();
  scene.add(stage.group);
  scene.background = new THREE.Color(0x07070c);
  scene.fog = new THREE.Fog(0x07070c, 7, 15);

  let hero: HeroBuild | null = null;
  let signature = '';
  const rig = new THREE.Group();
  scene.add(rig);

  const rebuild = (next: RunState) => {
    const sig = gearSignature(next);
    if (hero && sig === signature) return;
    signature = sig;
    if (hero) {
      rig.remove(hero.group);
      hero.dispose();
    }
    hero = buildHero(next);
    rig.add(hero.group);
  };
  rebuild(run);

  // Drag to rotate; auto-spin resumes a moment after letting go.
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let idleSince = 0;
  let spin = -0.35;
  let tilt = 0;
  const onDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    spin += (e.clientX - lastX) * 0.012;
    tilt = THREE.MathUtils.clamp(tilt + (e.clientY - lastY) * 0.006, -0.35, 0.35);
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onUp = () => {
    dragging = false;
    idleSince = performance.now();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  const resize = () => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = Math.max(5.65, 3.7 / camera.aspect);
    camera.lookAt(0, 1.36, 0);
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  let frame = 0;
  const start = performance.now();
  const loop = () => {
    frame = requestAnimationFrame(loop);
    const now = performance.now();
    const t = (now - start) / 1000;
    if (!dragging && now - idleSince > 1500) spin += 0.0008;
    rig.rotation.y = spin;
    rig.rotation.x = tilt;
    if (hero) for (const a of hero.animated) a.update(t);
    for (const a of stage.animated) a.update(t);
    renderer.render(scene, camera);
  };
  loop();

  return {
    setRun: rebuild,
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      hero?.dispose();
      key.shadow.dispose();
      env.dispose();
      stage.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
