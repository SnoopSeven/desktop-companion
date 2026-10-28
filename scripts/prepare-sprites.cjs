'use strict';
// Mechanical sprite-sheet slicing only. Artwork is generated, never redrawn here.
// Run with: node_modules/.bin/electron scripts/prepare-sprites.cjs
const { nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const directory = path.resolve(__dirname, '../assets/cat/hd');
const sheet = nativeImage.createFromPath(path.join(directory, 'source-sheet.png'));
const { width, height } = sheet.getSize();
const bitmap = sheet.toBitmap();
const alpha = (x, y) => bitmap[(y * width + x) * 4 + 3];
const rowPixels = Array.from({ length: height }, (_, y) => {
  let n = 0;
  for (let x = 0; x < width; x++) if (alpha(x, y) > 24) n++;
  return n;
});
const occupied = [];
for (let y = 0; y < height; y++) {
  if (rowPixels[y] > 4 && (!y || rowPixels[y - 1] <= 4)) occupied.push([y]);
  if (rowPixels[y] > 4 && (y === height - 1 || rowPixels[y + 1] <= 4)) occupied.at(-1).push(y + 1);
}
console.log({ width, height, occupied });
if (occupied.length !== 4) throw new Error('Expected four separated pose rows');
const columns = [0, 347, 640, 934, width];
const skins = ['none', 'hat', 'pumpkin', 'box'];
const poses = ['idle', 'walk_1', 'walk_2', 'sleep'];
const frames = [];
for (let row = 0; row < 4; row++) {
  for (let col = 0; col < 4; col++) {
    let left = width, right = 0, top = height, bottom = 0;
    for (let y = occupied[row][0]; y < occupied[row][1]; y++) {
      for (let x = columns[col]; x < columns[col + 1]; x++) {
        if (alpha(x, y) > 24) {
          left = Math.min(left, x); right = Math.max(right, x + 1);
          top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
        }
      }
    }
    left = Math.max(columns[col], left - 2); right = Math.min(columns[col + 1], right + 2);
    top = Math.max(0, top - 2); bottom = Math.min(height, bottom + 2);
    const w = right - left, h = bottom - top;
    const frameSize = 320;
    if (w > frameSize - 12 || h > frameSize - 12) throw new Error('Sprite exceeds frame padding');
    const dx = Math.floor((frameSize - w) / 2), dy = frameSize - 10 - h;
    const output = Buffer.alloc(frameSize * frameSize * 4);
    for (let y = 0; y < h; y++) {
      bitmap.copy(output, ((dy + y) * frameSize + dx) * 4, ((top + y) * width + left) * 4, ((top + y) * width + right) * 4);
    }
    const name = `${skins[col]}-${poses[row]}.png`;
    fs.writeFileSync(path.join(directory, name), nativeImage.createFromBitmap(output, { width: frameSize, height: frameSize }).toPNG());
    frames.push({ name, sourceBounds: { x: left, y: top, width: w, height: h }, frameSize });
  }
}
fs.writeFileSync(path.join(directory, 'frames.json'), JSON.stringify(frames, null, 2) + '\n');
require('electron').app.exit(0);
