import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { RunState } from '../events';
import { armorAt, weaponAt, ARMORS, WEAPONS } from '../shop';

/**
 * A 3D Wren for the pause menu, modelled from smooth primitives (capsules,
 * spheres, lathes and bevelled blade profiles) with physically based
 * materials, an environment map and cast shadows, so it needs no asset files
 * yet reads as a figure rather than a pile of cubes.
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

// ---- Palette (matches the sprite sheet) -----------------------------------

const C = {
  hood: 0x2f9e8f,
  hoodDark: 0x1f6f66,
  hoodLight: 0x63cdbb,
  faceShadow: 0x1a1430,
  eye: 0x9ff8ff,
  skin: 0xe9b58c,
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
  trousers: 0x3a3e52,
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
  heart: 0xff3b5c,
  clover: 0x4ade80,
  amber: 0xfbbf24,
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

function track<T extends THREE.BufferGeometry>(g: T): T {
  geometries.push(g);
  return g;
}

/** Matte fabric with a little sheen, like wool or leather. */
function cloth(color: number, opts: Partial<THREE.MeshPhysicalMaterialParameters> = {}): Mat {
  const m = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.82,
    metalness: 0,
    sheen: 0.6,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.3),
    ...opts,
  });
  materials.push(m);
  return m;
}

function metal(color: number, roughness = 0.32, opts: Partial<THREE.MeshPhysicalMaterialParameters> = {}): Mat {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0.9, clearcoat: 0.25, clearcoatRoughness: 0.3, ...opts });
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

function torsoLayer(mat: Mat, scale = 1, from = 0, to = TORSO.length): THREE.Mesh {
  const pts = TORSO.slice(from, to).map(([r, y]) => [r * scale, y] as [number, number]);
  const m = lathe(pts, mat);
  m.scale.z = 0.74;
  return m;
}

function buildHero(run: RunState): HeroBuild {
  const group = new THREE.Group();
  const animated: Animated[] = [];
  const body = new THREE.Group();
  group.add(body);

  const armorTier = run.armorTier;
  const weaponTier = run.weapon;
  const u = run.upgrades;

  // ---- Legs and boots --------------------------------------------------------
  const trousers = cloth(C.trousers);
  const bootMat = cloth(C.boot, { roughness: 0.55, sheen: 0.2 });
  const bootDark = cloth(C.bootDark, { roughness: 0.6, sheen: 0 });
  for (const side of [-1, 1]) {
    body.add(capsule(0.105, 0.42, trousers, side * 0.15, 0.56, 0));
    body.add(cylinder(0.115, 0.125, 0.24, bootMat, side * 0.15, 0.26, 0.0));
    const foot = capsule(0.1, 0.16, bootMat, side * 0.15, 0.1, 0.08);
    foot.rotation.x = Math.PI / 2;
    body.add(foot);
    const sole = cylinder(0.11, 0.11, 0.04, bootDark, side * 0.15, 0.02, 0.06);
    sole.scale.z = 1.6;
    body.add(sole);
    if (armorTier >= 3) {
      const knee = sphere(0.09, armorTier >= 4 ? metal(C.mithril, 0.25) : metal(C.plate), side * 0.15, 0.6, 0.08);
      knee.scale.set(1.1, 1, 0.8);
      body.add(knee);
    }
  }

  // ---- Torso, belt and buckle ----------------------------------------------------
  const tunic = cloth(C.tunic);
  body.add(torsoLayer(tunic));
  const belt = ring(0.29, 0.035, cloth(C.belt, { roughness: 0.5, sheen: 0.1 }), 0, 0.9, 0);
  belt.scale.set(1, 0.74, 1);
  body.add(belt);
  body.add(slab(0.11, 0.08, 0.03, metal(C.buckle, 0.28), 0, 0.9, 0.235, 0.008));

  // ---- Arms: +x is the sword arm, -x the casting hand ---------------------------
  const skin = cloth(C.skin, { roughness: 0.6, sheen: 0.15 });
  const sleeve = cloth(C.tunicDark);
  for (const side of [-1, 1]) {
    body.add(sphere(0.1, tunic, side * 0.37, 1.5, 0));
    const upper = capsule(0.078, 0.26, tunic, side * 0.41, 1.3, 0);
    upper.rotation.z = side * 0.1;
    body.add(upper);
    const fore = capsule(0.068, 0.24, sleeve, side * 0.44, 0.98, 0.02);
    fore.rotation.z = side * 0.05;
    body.add(fore);
    body.add(sphere(0.075, skin, side * 0.45, 0.77, 0.03));
  }

  // Rune gauntlet on the casting hand; its rune burns brighter with Focus.
  const focusGlow = 0.8 + Math.min(u.focus, 6) * 0.35;
  const gauntlet = capsule(0.092, 0.2, metal(C.gauntlet, 0.35), -0.445, 0.86, 0.02);
  body.add(gauntlet);
  body.add(ring(0.096, 0.012, metal(C.gauntletLight, 0.3), -0.445, 0.97, 0.02));
  body.add(ring(0.096, 0.012, metal(C.gauntletLight, 0.3), -0.445, 0.78, 0.02));
  const runeMat = glow(C.rune, focusGlow);
  body.add(slab(0.04, 0.12, 0.02, runeMat, -0.545, 0.87, 0.02, 0.005));
  body.add(slab(0.03, 0.05, 0.02, runeMat, -0.5, 0.87, 0.105, 0.005));

  // Bronze pauldron over the sword shoulder.
  const pauldron = mesh(new THREE.SphereGeometry(0.17, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), metal(C.pauldron, 0.38), 0.42, 1.52, 0);
  pauldron.scale.set(1, 0.85, 1.1);
  body.add(pauldron);
  const pauldronRim = ring(0.17, 0.018, metal(C.pauldronLight, 0.3), 0.42, 1.52, 0);
  pauldronRim.scale.set(1, 1, 1.1);
  body.add(pauldronRim);
  body.add(slab(0.06, 0.06, 0.02, metal(C.pauldronLight, 0.3), 0.42, 1.6, 0.1, 0.006));

  // ---- Cloak: a half lathe behind the body with a rippled hem --------------------
  const hoodMat = cloth(C.hood, { side: THREE.DoubleSide });
  const hoodDark = cloth(C.hoodDark, { side: THREE.DoubleSide });
  const cloak = lathe(
    [
      [0.3, 1.6],
      [0.37, 1.5],
      [0.41, 1.25],
      [0.46, 0.95],
      [0.54, 0.62],
    ],
    hoodMat,
    Math.PI / 2,
    Math.PI,
    40,
  );
  rippleHem(cloak.geometry, 1.1, 0.045);
  cloak.position.z = -0.02;
  const cloakPivot = new THREE.Group();
  cloakPivot.position.y = 1.6;
  cloak.position.y = -1.6;
  cloakPivot.add(cloak);
  body.add(cloakPivot);
  // Lining shows at the hem where the cloak turns.
  const lining = lathe([[0.44, 0.95], [0.52, 0.62]], hoodDark, Math.PI / 2, Math.PI, 40);
  rippleHem(lining.geometry, 1.1, 0.045);
  lining.position.set(0, -1.6, -0.02);
  cloakPivot.add(lining);
  animated.push({
    update: (t) => {
      cloakPivot.rotation.x = -0.05 + Math.sin(t * 1.3) * 0.025;
    },
  });

  // ---- Scarf collar and a tail that flutters -------------------------------------
  const scarf = cloth(C.scarf);
  const scarfDark = cloth(C.scarfDark);
  const collar = ring(0.24, 0.075, scarf, 0, 1.63, 0);
  collar.scale.set(1, 0.85, 1);
  body.add(collar);
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

  // ---- Head in the hood's shadow, with glowing eyes ------------------------------
  body.add(cylinder(0.075, 0.09, 0.1, skin, 0, 1.68, 0.02));
  const head = sphere(0.22, skin, 0, 1.93, 0.02);
  head.scale.set(0.95, 1.08, 0.95);
  body.add(head);
  // The upper face lies in shadow under the hood; the chin catches the light.
  const shade = mesh(new THREE.SphereGeometry(0.227, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.6), cloth(C.faceShadow, { sheen: 0 }), 0, 1.93, 0.02);
  shade.scale.set(0.95, 1.08, 0.95);
  body.add(shade);
  const eyeMat = glow(C.eye, 1.8);
  for (const side of [-1, 1]) {
    const eye = sphere(0.028, eyeMat, side * 0.075, 1.955, 0.215, 16);
    eye.scale.set(1.4, 0.8, 0.6);
    body.add(eye);
  }
  animated.push({
    update: (t) => {
      const blink = (t * 0.9) % 4 > 3.85 ? 0.15 : 1;
      eyeMat.emissiveIntensity = 1.8 * blink;
    },
  });

  // ---- Hood: a sphere open at the front, with a lining and a peak -----------------
  const opening = 0.62;
  const hood = mesh(
    new THREE.SphereGeometry(0.31, 40, 28, Math.PI / 2 + opening, Math.PI * 2 - opening * 2, 0, Math.PI * 0.78),
    hoodMat,
    0,
    1.95,
    -0.02,
  );
  hood.scale.set(1, 1.12, 1.04);
  body.add(hood);
  const hoodLining = mesh(
    new THREE.SphereGeometry(0.295, 40, 28, Math.PI / 2 + opening, Math.PI * 2 - opening * 2, 0, Math.PI * 0.78),
    hoodDark,
    0,
    1.95,
    -0.02,
  );
  hoodLining.scale.set(1, 1.12, 1.04);
  body.add(hoodLining);
  // Rolled brim framing the face: an arc in the vertical plane, open at the chin.
  const brim = mesh(new THREE.TorusGeometry(0.29, 0.032, 12, 48, Math.PI * 1.25), cloth(C.hoodLight), 0, 1.96, 0.16);
  brim.rotation.z = -Math.PI * 0.125;
  brim.scale.set(1.02, 1.12, 1);
  body.add(brim);
  // A soft peak folding back off the crown.
  const peak = cone(0.12, 0.26, hoodMat, 0, 2.27, -0.2, 24);
  peak.rotation.x = -0.75;
  body.add(peak);

  addArmor(body, armorTier);
  addUpgrades(body, run, animated);

  // ---- The sword, held blade-up so it can be admired ----------------------------
  const sword = buildSword(weaponTier, animated);
  sword.position.set(0.45, 0.77, 0.1);
  sword.rotation.z = -0.3;
  sword.rotation.x = -0.12;
  body.add(sword);

  // Breathing bob for the whole body.
  animated.push({
    update: (t) => {
      body.position.y = Math.sin(t * 1.8) * 0.015;
    },
  });

  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return { group, animated };
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
    const f = 1 + Math.sin(phi * 7 + 0.4) * amount * strength;
    pos.setXYZ(i, x * f, y, z * f);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

// ---- Armour ------------------------------------------------------------------------

function addArmor(body: THREE.Group, tier: number) {
  if (tier <= 0) return;

  if (tier === 1) {
    // Leather: crossed chest straps and bracers.
    const leather = cloth(C.leather, { roughness: 0.55, sheen: 0.2 });
    for (const dir of [-1, 1]) {
      const strap = mesh(new THREE.TorusGeometry(0.31, 0.022, 10, 48, Math.PI * 0.95), leather, 0, 1.22, 0);
      strap.rotation.set(0, dir * 0.55, Math.PI * 0.05 * -dir);
      strap.scale.set(1, 1.3, 0.76);
      body.add(strap);
    }
    for (const side of [-1, 1]) {
      body.add(capsule(0.08, 0.16, leather, side * 0.44, 1.0, 0.02));
      body.add(ring(0.082, 0.01, metal(C.buckle, 0.3), side * 0.44, 1.06, 0.02));
    }
    return;
  }

  if (tier === 2) {
    // Chainmail: a ringed shirt over the tunic with mail sleeves and a collar.
    const mail = metal(C.mail, 0.55, { map: mailTexture(), metalness: 0.85 });
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
    ? metal(C.mithril, 0.22, { emissive: new THREE.Color(C.mithrilGlow), emissiveIntensity: 0.12 + enchant * 0.1 })
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
  const p2 = mesh(new THREE.SphereGeometry(0.17, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), plateMat, -0.42, 1.52, 0);
  p2.scale.set(1, 0.85, 1.1);
  body.add(p2);
  const rim2 = ring(0.17, 0.018, trim, -0.42, 1.52, 0);
  rim2.scale.set(1, 1, 1.1);
  body.add(rim2);
  if (mithril) {
    // Brow plate under the hood and rune lines across the chest.
    const brow = mesh(new THREE.TorusGeometry(0.24, 0.02, 10, 40, Math.PI * 0.8), plateMat, 0, 2.05, 0.05);
    brow.rotation.set(Math.PI / 2, 0, Math.PI * 0.6);
    body.add(brow);
    const rune = glow(C.mithrilGlow, 0.9 + enchant * 0.4);
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
    const heartMat = glow(C.heart, 0.6 + u.vitality * 0.1, C.heart);
    heart.add(sphere(0.045, heartMat, -0.032, 0.02, 0, 20));
    heart.add(sphere(0.045, heartMat, 0.032, 0.02, 0, 20));
    const point = cone(0.068, 0.09, heartMat, 0, -0.035, 0, 20);
    point.rotation.x = Math.PI;
    point.scale.z = 0.7;
    heart.add(point);
    heart.scale.setScalar(1 + Math.min(u.vitality, 8) * 0.12);
    body.add(heart);
    animated.push({
      update: (t) => {
        heart.rotation.y = Math.sin(t * 0.9) * 0.5;
        const pulse = 1 + Math.max(0, Math.sin(t * 3.4)) * 0.06;
        heart.scale.setScalar((1 + Math.min(u.vitality, 8) * 0.12) * pulse);
      },
    });
  }

  // Focus: mana crystals orbit the gauntlet.
  if (u.focus > 0) {
    const count = Math.min(u.focus, 6);
    const orbit = new THREE.Group();
    orbit.position.set(-0.445, 0.87, 0.02);
    body.add(orbit);
    const crystalMat = glow(C.rune, 1.4, C.rune);
    const crystals: THREE.Mesh[] = [];
    for (let i = 0; i < count; i++) {
      const c = gem(0.045, crystalMat);
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
    const circlet = ring(0.315, 0.016, metal(C.buckle, 0.25), 0, 2.07, -0.02);
    circlet.scale.set(1, 1, 1.04);
    body.add(circlet);
    const setting = sphere(0.045, metal(C.buckle, 0.25), 0, 2.07, 0.3, 16);
    setting.scale.z = 0.5;
    body.add(setting);
    const eye = sphere(0.03 + Math.min(u.reach, 6) * 0.005, glow(C.amber, 1 + u.reach * 0.15, C.amber), 0, 2.07, 0.325, 16);
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
    const leafMat = glow(C.clover, 0.35, C.clover);
    const stemMat = cloth(0x2f7a4a);
    const string = metal(C.buckle, 0.3);
    const charms: THREE.Group[] = [];
    for (let i = 0; i < count; i++) {
      const x = count > 1 ? -0.16 + (i / (count - 1)) * 0.32 : 0.12;
      const charm = new THREE.Group();
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
    const bandMat = cloth(C.scarfDark, { roughness: 0.7 });
    for (let i = 0; i < bands; i++) {
      body.add(ring(0.074, 0.016, bandMat, 0.445, 0.9 + i * 0.06, 0.02));
    }
    // Bulkier upper arm past the first level.
    const bulk = capsule(0.078 + Math.min(u.strength, 6) * 0.008, 0.22, cloth(C.tunic), 0.41, 1.31, 0);
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

  const gripMat = cloth(C.grip, { roughness: 0.6, sheen: 0.2 });
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
      const fangMat = metal(C.fang, 0.3, { emissive: new THREE.Color(C.ember), emissiveIntensity: 0.1 + enchant * 0.08 });
      const outline = new THREE.Shape();
      outline.moveTo(-0.07, 0);
      outline.quadraticCurveTo(-0.02, 0.85, 0.28, 1.42);
      outline.quadraticCurveTo(0.3, 0.7, 0.075, 0);
      outline.closePath();
      const fang = blade(outline, 0.04, fangMat, 0.01);
      fang.position.y = 0.1;
      sword.add(fang);
      // Ember edge along the outer curve.
      const edgeMat = glow(C.ember, 1.2 + enchant * 0.4);
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
          edgeMat.emissiveIntensity = 1.2 + enchant * 0.4 + Math.sin(t * 4) * 0.35;
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

  return {
    group,
    animated,
    dispose() {
      for (const x of own) x.dispose();
      for (const x of mats) x.dispose();
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
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.touchAction = 'none';
  canvas.setAttribute('aria-label', 'Wren, your hero, in 3D. Drag to turn.');
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.55, 6.3);
  camera.lookAt(0, 1.3, 0);

  // Image-based lighting gives the metals something to reflect.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const env = pmrem.fromScene(envScene, 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.4;
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0x6f8fb8, 0x14101c, 0.5));
  const key = new THREE.DirectionalLight(0xffe0b8, 2.0);
  key.position.set(2.5, 4.5, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 12;
  key.shadow.camera.left = -1.6;
  key.shadow.camera.right = 1.6;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -0.5;
  key.shadow.bias = -0.0015;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x67e8f9, 1.4);
  rim.position.set(-3, 2, -2.5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xc83a3a, 0.45);
  fill.position.set(-2, 1, 3);
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
    if (hero) rig.remove(hero.group);
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
    if (!dragging && now - idleSince > 1500) spin += 0.004;
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
      for (const g of geometries.splice(0)) g.dispose();
      for (const m of materials.splice(0)) m.dispose();
      for (const t of textures.splice(0)) t.dispose();
      env.dispose();
      stage.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
