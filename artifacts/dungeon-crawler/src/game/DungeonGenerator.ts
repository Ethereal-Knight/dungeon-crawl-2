export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

import { rollEnemyKind, type EnemyKind } from './enemyTypes.ts';

export type { EnemyKind } from './enemyTypes.ts';
/** `silver` is worth 1, `coin` (gold) 5, `gem` 25. */
export type ItemKind = 'silver' | 'coin' | 'gem' | 'food' | 'key';

export interface EnemySpawn extends Point {
  kind: EnemyKind;
  /** This enemy carries the key to the exit door. */
  hasKey?: boolean;
}

export interface ItemSpawn extends Point {
  kind: ItemKind;
}

export const WALL = 0;
export const FLOOR = 1;

/**
 * Procedural cave generator.
 *
 * 1. Scatter non-overlapping rectangular rooms.
 * 2. Join each new room to its nearest existing room with a 2-wide L tunnel,
 *    then add a couple of extra loops so the layout is not a single chain.
 * 3. Erode the walls so rooms and tunnels read as a cave rather than a grid.
 * 4. Flood fill from the start room; anything unreachable is filled back in,
 *    so every floor tile is guaranteed to be walkable.
 * 5. The exit goes in the room farthest (by walking distance) from the start.
 * 6. Enemies and pickups are seeded per room, scaled by dungeon depth.
 */
export class DungeonGenerator {
  public width: number;
  public height: number;
  public map: number[][] = [];
  public rooms: Rect[] = [];
  public startPos: Point = { x: 0, y: 0 };
  public endPos: Point = { x: 0, y: 0 };
  public items: ItemSpawn[] = [];
  public enemies: EnemySpawn[] = [];
  /** Breakable treasure chests. */
  public chests: Point[] = [];
  /** Wandering merchant, present from depth 5. */
  public merchant: Point | null = null;
  /** Walking distance (in tiles) from startPos, -1 where unreachable. */
  public distance: number[][] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  public generate(depth = 1) {
    this.map = this.blank(WALL);
    this.rooms = [];
    this.items = [];
    this.enemies = [];
    this.chests = [];
    this.merchant = null;

    this.placeRooms(depth);
    this.connectRooms();
    this.erodeWalls();
    this.startPos = this.center(this.rooms[0]);
    this.map[this.startPos.y][this.startPos.x] = FLOOR;
    this.floodFill();
    this.pickExit();
    this.populate(depth);
  }

  public isFloor(x: number, y: number) {
    return (
      y >= 0 &&
      y < this.height &&
      x >= 0 &&
      x < this.width &&
      this.map[y][x] === FLOOR
    );
  }

  // ---- Layout ------------------------------------------------------------

  private placeRooms(depth: number) {
    // Bigger boards deeper down; the grid itself is sized by the scene.
    const target = Math.min(12 + depth, Math.floor((this.width * this.height) / 220));
    const attempts = 260;
    const minSize = 5;
    const maxSize = 11;

    for (let i = 0; i < attempts && this.rooms.length < target; i++) {
      const w = rand(minSize, maxSize);
      const h = rand(minSize, maxSize);
      const x = rand(2, this.width - w - 3);
      const y = rand(2, this.height - h - 3);
      const room: Rect = { x, y, w, h };

      if (this.rooms.some((other) => this.intersects(room, other, 2))) continue;

      this.carveRoom(room);
      this.rooms.push(room);
    }
  }

  private connectRooms() {
    // Connect each room to the nearest room placed before it.
    for (let i = 1; i < this.rooms.length; i++) {
      const room = this.rooms[i];
      let best = this.rooms[0];
      let bestDist = Infinity;
      for (let j = 0; j < i; j++) {
        const d = distanceSq(this.center(room), this.center(this.rooms[j]));
        if (d < bestDist) {
          bestDist = d;
          best = this.rooms[j];
        }
      }
      this.carveTunnel(this.center(best), this.center(room));
    }

    // A few extra links create loops, which make exploring and fleeing more fun.
    const extra = Math.max(1, Math.floor(this.rooms.length / 4));
    for (let i = 0; i < extra && this.rooms.length > 2; i++) {
      const a = this.rooms[rand(0, this.rooms.length - 1)];
      const b = this.rooms[rand(0, this.rooms.length - 1)];
      if (a !== b) this.carveTunnel(this.center(a), this.center(b));
    }
  }

  private carveRoom(room: Rect) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        this.map[y][x] = FLOOR;
      }
    }
  }

  private carveTunnel(a: Point, b: Point) {
    if (Math.random() < 0.5) {
      this.carveLine(a.x, b.x, a.y, true);
      this.carveLine(a.y, b.y, b.x, false);
    } else {
      this.carveLine(a.y, b.y, a.x, false);
      this.carveLine(a.x, b.x, b.y, true);
    }
  }

  /** Carves a 2-tile-wide straight line, horizontal or vertical. */
  private carveLine(from: number, to: number, fixed: number, horizontal: boolean) {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    for (let i = lo; i <= hi; i++) {
      for (let t = 0; t < 2; t++) {
        const x = horizontal ? i : fixed + t;
        const y = horizontal ? fixed + t : i;
        this.setFloor(x, y);
      }
    }
  }

  /** Roughens edges: walls with many floor neighbours crumble into floor. */
  private erodeWalls() {
    for (let pass = 0; pass < 2; pass++) {
      const next = this.map.map((row) => row.slice());
      for (let y = 1; y < this.height - 1; y++) {
        for (let x = 1; x < this.width - 1; x++) {
          if (this.map[y][x] !== WALL) continue;
          const n = this.floorNeighbours(x, y);
          if (n >= 5 || (n >= 3 && Math.random() < 0.18)) {
            next[y][x] = FLOOR;
          }
        }
      }
      this.map = next;
    }
  }

  private floorNeighbours(cx: number, cy: number) {
    let count = 0;
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        if ((x !== cx || y !== cy) && this.isFloor(x, y)) count++;
      }
    }
    return count;
  }

  /** BFS from the start; unreachable floor becomes wall again. */
  private floodFill() {
    this.distance = this.blank(-1);
    const queue: Point[] = [this.startPos];
    this.distance[this.startPos.y][this.startPos.x] = 0;

    while (queue.length) {
      const p = queue.shift()!;
      const d = this.distance[p.y][p.x];
      for (const [dx, dy] of DIRS) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (this.isFloor(nx, ny) && this.distance[ny][nx] === -1) {
          this.distance[ny][nx] = d + 1;
          queue.push({ x: nx, y: ny });
        }
      }
    }

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.map[y][x] === FLOOR && this.distance[y][x] === -1) {
          this.map[y][x] = WALL;
        }
      }
    }
  }

  private pickExit() {
    let best = this.startPos;
    let bestDist = -1;
    for (let i = 1; i < this.rooms.length; i++) {
      const c = this.nearestReachable(this.center(this.rooms[i]), this.rooms[i]);
      if (!c) continue;
      const d = this.distance[c.y][c.x];
      if (d > bestDist) {
        bestDist = d;
        best = c;
      }
    }
    // Tiny dungeons fall back to the farthest reachable tile anywhere.
    if (bestDist < 0) {
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          if (this.distance[y][x] > bestDist) {
            bestDist = this.distance[y][x];
            best = { x, y };
          }
        }
      }
    }
    this.endPos = best;
  }

  // ---- Population --------------------------------------------------------

  private populate(depth: number) {
    const taken = new Set<string>([key(this.startPos), key(this.endPos)]);
    const claim = (p: Point) => taken.add(key(p));
    const free = (p: Point) =>
      !taken.has(key(p)) &&
      this.distance[p.y][p.x] > 4 && // never spawn on top of the player
      this.isFloor(p.x, p.y);

    const pick = (room: Rect): Point | null => {
      for (let i = 0; i < 20; i++) {
        const p = {
          x: rand(room.x, room.x + room.w - 1),
          y: rand(room.y, room.y + room.h - 1),
        };
        if (free(p)) return p;
      }
      return null;
    };

    for (let i = 1; i < this.rooms.length; i++) {
      const room = this.rooms[i];
      const roomDist = this.distance[this.center(room).y]?.[this.center(room).x] ?? 0;
      const isExitRoom = contains(room, this.endPos);

      // Enemies: more of them deeper down and farther from the start.
      let count = rand(1, 2) + Math.floor((depth - 1) / 2);
      if (roomDist > 30 && depth > 1) count += 1;
      if (isExitRoom) count += 1;
      count = Math.min(count, 5);
      for (let e = 0; e < count; e++) {
        const p = pick(room);
        if (!p) break;
        claim(p);
        this.enemies.push({ ...p, kind: this.rollEnemy(depth) });
      }

      // Loot: silver is common, gold less so, gems are the valuables, and a
      // little food keeps you alive.
      const coins = Math.random() < 0.8 ? rand(1, 3) : 0;
      for (let c = 0; c < coins; c++) {
        const p = pick(room);
        if (!p) break;
        claim(p);
        this.items.push({ ...p, kind: Math.random() < 0.25 ? 'coin' : 'silver' });
      }
      if (Math.random() < 0.25 + depth * 0.03) {
        const p = pick(room);
        if (p) {
          claim(p);
          this.items.push({ ...p, kind: 'gem' });
        }
      }
      if (Math.random() < 0.15) {
        const p = pick(room);
        if (p) {
          claim(p);
          this.items.push({ ...p, kind: 'food' });
        }
      }
    }

    // Treasure chests: a few per floor, never in the start room.
    const chestCount = 1 + Math.floor(this.rooms.length / 6);
    for (let c = 0; c < chestCount && this.rooms.length > 1; c++) {
      const room = this.rooms[rand(1, this.rooms.length - 1)];
      const p = pick(room);
      if (p) {
        claim(p);
        this.chests.push(p);
      }
    }

    // The exit is locked. The enemy farthest from the start carries the key,
    // so the whole floor has to be crossed at least once.
    if (this.enemies.length > 0) {
      let best = 0;
      let bestDist = -1;
      this.enemies.forEach((e, i) => {
        const d = this.distance[e.y][e.x];
        if (d > bestDist) {
          bestDist = d;
          best = i;
        }
      });
      this.enemies[best].hasKey = true;
    }

    // A wandering merchant sets up shop somewhere away from start and exit.
    if (depth >= 5 && this.rooms.length > 2) {
      for (let tries = 0; tries < 12 && !this.merchant; tries++) {
        const room = this.rooms[rand(1, this.rooms.length - 1)];
        if (contains(room, this.endPos)) continue;
        const p = pick(room);
        if (p) {
          claim(p);
          this.merchant = p;
        }
      }
    }

    // Guarantee at least one meal per floor so a bad roll is never fatal.
    if (!this.items.some((i) => i.kind === 'food') && this.rooms.length > 1) {
      const p = pick(this.rooms[rand(1, this.rooms.length - 1)]);
      if (p) this.items.push({ ...p, kind: 'food' });
    }
  }

  private rollEnemy(depth: number): EnemyKind {
    return rollEnemyKind(depth);
  }

  // ---- Helpers -----------------------------------------------------------

  private nearestReachable(p: Point, within: Rect): Point | null {
    if (this.isFloor(p.x, p.y) && this.distance[p.y][p.x] >= 0) return p;
    let best: Point | null = null;
    let bestD = Infinity;
    for (let y = within.y; y < within.y + within.h; y++) {
      for (let x = within.x; x < within.x + within.w; x++) {
        if (this.isFloor(x, y) && this.distance[y][x] >= 0) {
          const d = distanceSq(p, { x, y });
          if (d < bestD) {
            bestD = d;
            best = { x, y };
          }
        }
      }
    }
    return best;
  }

  private center(r: Rect): Point {
    return { x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) };
  }

  private intersects(a: Rect, b: Rect, pad: number): boolean {
    return (
      a.x - pad < b.x + b.w &&
      a.x + a.w + pad > b.x &&
      a.y - pad < b.y + b.h &&
      a.y + a.h + pad > b.y
    );
  }

  private setFloor(x: number, y: number) {
    if (x > 0 && x < this.width - 1 && y > 0 && y < this.height - 1) {
      this.map[y][x] = FLOOR;
    }
  }

  private blank(value: number): number[][] {
    return Array.from({ length: this.height }, () => Array(this.width).fill(value));
  }
}

const DIRS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const rand = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const distanceSq = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

const key = (p: Point) => `${p.x},${p.y}`;

const contains = (r: Rect, p: Point) =>
  p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
