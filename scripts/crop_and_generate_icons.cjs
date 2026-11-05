const { nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const wbPath = path.resolve('MaSwicth Logo/MaSwitch_Logo_WB.png');
const img = nativeImage.createFromPath(wbPath);
const size = img.getSize();
const bmp = img.toBitmap();

// Find bbox
let minX = size.width, maxX = 0, minY = size.height, maxY = 0;
for (let y = 0; y < size.height; y++) {
  for (let x = 0; x < size.width; x++) {
    const idx = (y * size.width + x) * 4;
    const a = bmp[idx + 3];
    if (a > 5) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

const bboxW = maxX - minX + 1;
const bboxH = maxY - minY + 1;
const maxDim = Math.max(bboxW, bboxH);
const pad = Math.round(maxDim * 0.05); // 5% padding around emblem
const squareSize = maxDim + pad * 2;

const centerX = Math.round((minX + maxX) / 2);
const centerY = Math.round((minY + maxY) / 2);
const startX = Math.round(centerX - squareSize / 2);
const startY = Math.round(centerY - squareSize / 2);

console.log('Square size:', squareSize, 'startX:', startX, 'startY:', startY);

const outBmp = Buffer.alloc(squareSize * squareSize * 4);

for (let dy = 0; dy < squareSize; dy++) {
  const srcY = startY + dy;
  for (let dx = 0; dx < squareSize; dx++) {
    const srcX = startX + dx;
    const outIdx = (dy * squareSize + dx) * 4;

    if (srcX >= 0 && srcX < size.width && srcY >= 0 && srcY < size.height) {
      const srcIdx = (srcY * size.width + srcX) * 4;
      outBmp[outIdx + 0] = bmp[srcIdx + 0]; // B
      outBmp[outIdx + 1] = bmp[srcIdx + 1]; // G
      outBmp[outIdx + 2] = bmp[srcIdx + 2]; // R
      outBmp[outIdx + 3] = bmp[srcIdx + 3]; // A
    } else {
      outBmp[outIdx + 0] = 0;
      outBmp[outIdx + 1] = 0;
      outBmp[outIdx + 2] = 0;
      outBmp[outIdx + 3] = 0; // transparent
    }
  }
}

const squareImg = nativeImage.createFromBitmap(outBmp, {
  width: squareSize,
  height: squareSize
});

console.log('Created square transparent nativeImage:', squareImg.getSize());

// Save to branding
fs.writeFileSync(path.resolve('src/assets/branding/maswitch-mark.png'), squareImg.toPNG());
fs.writeFileSync(path.resolve('src/assets/branding/maswitch-logo.png'), squareImg.toPNG());

// Generate build/icon.png at 256x256
const icon256 = squareImg.resize({ width: 256, height: 256, quality: 'best' });
fs.writeFileSync(path.resolve('build/icon.png'), icon256.toPNG());
console.log('Wrote build/icon.png');

// Generate build/icon.ico with multiple sizes: 256, 128, 64, 48, 32, 16
const sizes = [256, 128, 64, 48, 32, 16];
const pngBuffers = sizes.map(s => ({
  size: s,
  buffer: squareImg.resize({ width: s, height: s, quality: 'best' }).toPNG()
}));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // Reserved
header.writeUInt16LE(1, 2); // Type 1 = Icon
header.writeUInt16LE(sizes.length, 4);

let offset = 6 + (16 * sizes.length);
const dirEntries = [];

for (const item of pngBuffers) {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(item.size === 256 ? 0 : item.size, 0);
  entry.writeUInt8(item.size === 256 ? 0 : item.size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(item.buffer.length, 8);
  entry.writeUInt32LE(offset, 12);
  dirEntries.push(entry);
  offset += item.buffer.length;
}

const icoBuffer = Buffer.concat([
  header,
  ...dirEntries,
  ...pngBuffers.map(p => p.buffer)
]);

fs.writeFileSync(path.resolve('build/icon.ico'), icoBuffer);
console.log('Wrote transparent multi-resolution build/icon.ico (' + icoBuffer.length + ' bytes)');

process.exit(0);

