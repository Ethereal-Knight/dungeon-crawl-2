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

export class DungeonGenerator {
  public width: number;
  public height: number;
  public map: number[][]; // 0 = wall, 1 = floor
  public rooms: Rect[] = [];
  public startPos: Point = { x: 0, y: 0 };
  public endPos: Point = { x: 0, y: 0 };
  public items: Point[] = [];
  public enemies: Point[] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.map = Array.from({ length: height }, () => Array(width).fill(0));
  }

  public generate() {
    // Reset
    this.map = Array.from({ length: this.height }, () => Array(this.width).fill(0));
    this.rooms = [];
    this.items = [];
    this.enemies = [];

    const numRooms = 15;
    const minRoomSize = 5;
    const maxRoomSize = 10;

    for (let i = 0; i < numRooms; i++) {
      const w = Math.floor(Math.random() * (maxRoomSize - minRoomSize + 1)) + minRoomSize;
      const h = Math.floor(Math.random() * (maxRoomSize - minRoomSize + 1)) + minRoomSize;
      const x = Math.floor(Math.random() * (this.width - w - 2)) + 1;
      const y = Math.floor(Math.random() * (this.height - h - 2)) + 1;

      const newRoom: Rect = { x, y, w, h };
      let failed = false;

      for (const otherRoom of this.rooms) {
        if (this.intersects(newRoom, otherRoom)) {
          failed = true;
          break;
        }
      }

      if (!failed) {
        this.createRoom(newRoom);
        
        if (this.rooms.length > 0) {
          const prevRoom = this.rooms[this.rooms.length - 1];
          this.connectRooms(prevRoom, newRoom);
        }

        this.rooms.push(newRoom);
      }
    }

    if (this.rooms.length > 0) {
      this.startPos = {
        x: Math.floor(this.rooms[0].x + this.rooms[0].w / 2),
        y: Math.floor(this.rooms[0].y + this.rooms[0].h / 2),
      };
      
      const lastRoom = this.rooms[this.rooms.length - 1];
      this.endPos = {
        x: Math.floor(lastRoom.x + lastRoom.w / 2),
        y: Math.floor(lastRoom.y + lastRoom.h / 2),
      };

      // Populate items and enemies
      for (let i = 1; i < this.rooms.length; i++) {
        const room = this.rooms[i];
        const cx = Math.floor(room.x + room.w / 2);
        const cy = Math.floor(room.y + room.h / 2);

        // 30% chance for an enemy in center
        if (Math.random() < 0.3) {
          this.enemies.push({ x: cx, y: cy });
        }
        
        // 50% chance for an item
        if (Math.random() < 0.5) {
          const ix = room.x + Math.floor(Math.random() * (room.w - 2)) + 1;
          const iy = room.y + Math.floor(Math.random() * (room.h - 2)) + 1;
          this.items.push({ x: ix, y: iy });
        }
      }
    }
  }

  private intersects(r1: Rect, r2: Rect): boolean {
    return r1.x <= r2.x + r2.w && r1.x + r1.w >= r2.x &&
           r1.y <= r2.y + r2.h && r1.y + r1.h >= r2.y;
  }

  private createRoom(room: Rect) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        this.map[y][x] = 1;
      }
    }
  }

  private connectRooms(r1: Rect, r2: Rect) {
    const p1 = { x: Math.floor(r1.x + r1.w / 2), y: Math.floor(r1.y + r1.h / 2) };
    const p2 = { x: Math.floor(r2.x + r2.w / 2), y: Math.floor(r2.y + r2.h / 2) };

    if (Math.random() < 0.5) {
      this.createHorTunnel(p1.x, p2.x, p1.y);
      this.createVerTunnel(p1.y, p2.y, p2.x);
    } else {
      this.createVerTunnel(p1.y, p2.y, p1.x);
      this.createHorTunnel(p1.x, p2.x, p2.y);
    }
  }

  private createHorTunnel(x1: number, x2: number, y: number) {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      if (y > 0 && y < this.height && x > 0 && x < this.width) {
        this.map[y][x] = 1;
        // Make corridors a bit wider
        if (y + 1 < this.height) this.map[y + 1][x] = 1;
      }
    }
  }

  private createVerTunnel(y1: number, y2: number, x: number) {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      if (y > 0 && y < this.height && x > 0 && x < this.width) {
        this.map[y][x] = 1;
        // Make corridors a bit wider
        if (x + 1 < this.width) this.map[y][x + 1] = 1;
      }
    }
  }
}
