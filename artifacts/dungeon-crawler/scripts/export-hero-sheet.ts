/**
 * Writes the procedurally generated hero sprite sheet to
 * public/sprites/hero.png + hero.json (Phaser JSON-hash atlas) and a 4x
 * zoomed preview PNG for eyeballing.
 *
 *   pnpm --filter @workspace/dungeon-crawler run hero:export
 *
 * The PNG/JSON are the template an artist can repaint: keep the frame names,
 * positions and 32x32 size and the game will pick the art up unchanged.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAME, renderHeroSheet } from '../src/game/hero/heroSheet.ts';

function main() {
const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../public/sprites');
mkdirSync(outDir, { recursive: true });

const sheet = renderHeroSheet();

writeFileSync(resolve(outDir, 'hero.png'), encodePng(sheet.width, sheet.height, sheet.data));
writeFileSync(resolve(outDir, 'hero-preview.png'), encodePng(...scale(sheet.width, sheet.height, sheet.data, 4)));

const atlas = {
  frames: Object.fromEntries(
    sheet.frames.map((f) => [
      f.name,
      {
        frame: { x: f.x, y: f.y, w: FRAME, h: FRAME },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: FRAME, h: FRAME },
        sourceSize: { w: FRAME, h: FRAME },
      },
    ]),
  ),
  meta: {
    app: 'phaser-dungeon-crawler hero:export',
    image: 'hero.png',
    format: 'RGBA8888',
    size: { w: sheet.width, h: sheet.height },
    scale: '1',
  },
};
writeFileSync(resolve(outDir, 'hero.json'), JSON.stringify(atlas, null, 2));
console.log(`wrote ${sheet.frames.length} frames (${sheet.width}x${sheet.height}) to ${outDir}`);
}

// ---- helpers -----------------------------------------------------------------------

function scale(w: number, h: number, data: Uint8ClampedArray, k: number): [number, number, Uint8ClampedArray] {
  const out = new Uint8ClampedArray(w * k * h * k * 4);
  for (let y = 0; y < h * k; y++) {
    for (let x = 0; x < w * k; x++) {
      const si = ((Math.floor(y / k) * w) + Math.floor(x / k)) * 4;
      const di = (y * w * k + x) * 4;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = data[si + 3];
    }
  }
  return [w * k, h * k, out];
}

function encodePng(width: number, height: number, rgba: Uint8ClampedArray): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

main();
