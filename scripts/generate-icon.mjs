import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const SIZE = 256;

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function pointToSegmentDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function generateRgbaBuffer() {
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  const mSegments = [
    [64, 188, 64, 72],
    [64, 72, 128, 138],
    [128, 138, 192, 72],
    [192, 72, 192, 188],
  ];
  const switchSegments = [
    [88, 196, 168, 196],
    [152, 182, 170, 196],
    [152, 210, 170, 196],
  ];

  for (let y = 0; y < SIZE; y++) {
    const rowStart = y * (SIZE * 4 + 1);
    raw[rowStart] = 0; // PNG filter: None

    for (let x = 0; x < SIZE; x++) {
      const idx = rowStart + 1 + x * 4;
      const cx = x - 128;
      const cy = y - 128;

      // Rounded rect SDF
      const half = 112;
      const radius = 38;
      const qx = Math.abs(cx) - (half - radius);
      const qy = Math.abs(cy) - (half - radius);
      const distRect =
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
        Math.min(Math.max(qx, qy), 0) -
        radius;

      if (distRect > 1.5) {
        raw[idx] = 0;
        raw[idx + 1] = 0;
        raw[idx + 2] = 0;
        raw[idx + 3] = 0;
        continue;
      }

      const edgeAlpha = distRect > 0 ? Math.round((1 - distRect / 1.5) * 255) : 255;

      // Deep navy-graphite gradient background
      const gradT = (x + y) / (SIZE * 2);
      let r = Math.round(11 + gradT * 10);
      let g = Math.round(15 + gradT * 14);
      let b = Math.round(28 + gradT * 24);

      // Border glow
      if (distRect > -7) {
        const borderT = 1 - Math.abs(distRect + 3.5) / 3.5;
        if (borderT > 0) {
          const br = Math.round(14 + gradT * 125);
          const bg = Math.round(165 - gradT * 70);
          const bb = 233;
          r = Math.min(255, Math.round(r * (1 - borderT) + br * borderT));
          g = Math.min(255, Math.round(g * (1 - borderT) + bg * borderT));
          b = Math.min(255, Math.round(b * (1 - borderT) + bb * borderT));
        }
      }

      // Distance to 'M' glyph
      let minM = 999;
      for (const [ax, ay, bx, by] of mSegments) {
        minM = Math.min(minM, pointToSegmentDist(x, y, ax, ay, bx, by));
      }

      // Distance to switch accent bar
      let minS = 999;
      for (const [ax, ay, bx, by] of switchSegments) {
        minS = Math.min(minS, pointToSegmentDist(x, y, ax, ay, bx, by));
      }

      // Soft ambient glow around M
      if (minM < 28) {
        const glow = Math.pow(1 - minM / 28, 2) * 0.45;
        r = Math.min(255, Math.round(r + 14 * glow));
        g = Math.min(255, Math.round(g + 165 * glow));
        b = Math.min(255, Math.round(b + 233 * glow));
      }

      // Crisp M glyph stroke
      if (minM < 11.5) {
        const strokeT = minM < 10 ? 1 : 1 - (minM - 10) / 1.5;
        const gx = (x - 64) / 128;
        const mr = Math.round(56 + gx * 83);
        const mg = Math.round(189 - gx * 97);
        const mb = Math.round(248 - gx * 2);
        r = Math.round(r * (1 - strokeT) + mr * strokeT);
        g = Math.round(g * (1 - strokeT) + mg * strokeT);
        b = Math.round(b * (1 - strokeT) + mb * strokeT);
      }

      // Crisp switch arrow glyph
      if (minS < 6.5) {
        const strokeT = minS < 5 ? 1 : 1 - (minS - 5) / 1.5;
        r = Math.round(r * (1 - strokeT) + 168 * strokeT);
        g = Math.round(g * (1 - strokeT) + 85 * strokeT);
        b = Math.round(b * (1 - strokeT) + 247 * strokeT);
      }

      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = edgeAlpha;
    }
  }
  return raw;
}

function createPngBuffer() {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rawData = generateRgbaBuffer();
  const compressed = zlib.deflateSync(rawData, { level: 9 });

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createIcoFromPng(pngBuf) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // ICO type
  header.writeUInt16LE(1, 4); // 1 image

  const entry = Buffer.alloc(16);
  entry[0] = 0; // 256px width
  entry[1] = 0; // 256px height
  entry[2] = 0; // palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(22, 12); // offset (6 + 16)

  return Buffer.concat([header, entry, pngBuf]);
}

const buildDir = path.resolve('build');
fs.mkdirSync(buildDir, { recursive: true });
const pngBuffer = createPngBuffer();
const icoBuffer = createIcoFromPng(pngBuffer);

fs.writeFileSync(path.join(buildDir, 'icon.png'), pngBuffer);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer);
console.log('Generated build/icon.png and build/icon.ico successfully.');

