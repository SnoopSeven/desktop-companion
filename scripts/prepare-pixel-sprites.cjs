'use strict';
// Slice the redrawn atlas into real 50px sprites, with binary alpha and a fixed palette.
// Run with: node_modules/.bin/electron scripts/prepare-pixel-sprites.cjs
const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const destination = path.resolve(__dirname, '../assets/cat/pixel');
const sheet = nativeImage.createFromPath(path.join(destination, 'source-sheet.png'));
if (sheet.isEmpty()) throw new Error('Missing generated pixel sprite sheet');
const { width, height } = sheet.getSize();
const source = sheet.toBitmap();
const size = 50;
const palette = [
  '#292333', '#fff8e9', '#e5dfd5', '#f6a4ad',
  '#58386f', '#80559c', '#f2c55b',
  '#ee922f', '#bc6128', '#587043',
  '#c59361', '#906443',
].map((hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)));
const skins = ['none', 'hat', 'pumpkin', 'box'];
const poses = ['idle', 'walk_1', 'walk_2', 'sleep'];
// The generated sheet has uneven row gutters; do not divide it into equal rows.
const rows = [0, 383, 685, 990, height];
const frames = poses.flatMap((pose, row) => skins.map((skin, column) => {
  let left = width, top = height, right = 0, bottom = 0;
  for (let y = rows[row]; y < rows[row + 1]; y++) {
    for (let x = Math.floor(column * width / 4); x < Math.floor((column + 1) * width / 4); x++) {
      if (source[(y * width + x) * 4 + 3] < 192) continue;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
    }
  }
  return { skin, pose, left, top, width: right - left, height: bottom - top };
}));
const fit = 44 / Math.max(...frames.flatMap((frame) => [frame.width, frame.height]));

for (const frame of frames) {
    const { skin, pose } = frame;
    const allowed = [0, 1, 2, 3, ...({ none: [], hat: [4, 5, 6], pumpkin: [7, 8, 9], box: [10, 11] }[skin])].map((index) => palette[index]);
    const output = Buffer.alloc(size * size * 4);
    const left = (size - frame.width * fit) / 2;
    const top = 47 - frame.height * fit;
    // Two transparent pixels protect hat tips, box flaps, shadows and sleep marks.
    for (let y = 2; y < size - 2; y++) {
      for (let x = 2; x < size - 2; x++) {
        const sx = frame.left + Math.floor((x + 0.5 - left) / fit);
        const sy = frame.top + Math.floor((y + 0.5 - top) / fit);
        if (sx < frame.left || sx >= frame.left + frame.width || sy < frame.top || sy >= frame.top + frame.height) continue;
        const input = (sy * width + sx) * 4;
        if (source[input + 3] < 192) continue;
        const rgb = [source[input + 2], source[input + 1], source[input]];
        // Neutral antialias remnants must never become a costume color.
        const candidates = Math.max(...rgb) - Math.min(...rgb) < 40 ? palette.slice(0, 3) : allowed;
        let chosen, nearest = Infinity;
        for (const color of candidates) {
          const distance = color.reduce((sum, value, index) => sum + (value - rgb[index]) ** 2, 0);
          if (distance < nearest) { nearest = distance; chosen = color; }
        }
        const offset = (y * size + x) * 4;
        output[offset] = chosen[2];
        output[offset + 1] = chosen[1];
        output[offset + 2] = chosen[0];
        output[offset + 3] = 255;
      }
    }
    // Drop tiny isolated color flecks while keeping deliberate cheek/ear clusters.
    const visited = new Set();
    const colorAt = (pixel) => output.subarray(pixel * 4, pixel * 4 + 3).toString('hex');
    const neutral = new Set(palette.slice(0, 3).map(([r, g, b]) => Buffer.from([b, g, r]).toString('hex')));
    for (let pixel = 0; pixel < size * size; pixel++) {
      if (visited.has(pixel) || !output[pixel * 4 + 3] || neutral.has(colorAt(pixel))) continue;
      const color = colorAt(pixel), cluster = [], pending = [pixel];
      visited.add(pixel);
      while (pending.length) {
        const current = pending.pop();
        cluster.push(current);
        const x = current % size, y = Math.floor(current / size);
        for (const neighbor of [x > 0 ? current - 1 : -1, x < size - 1 ? current + 1 : -1, y > 0 ? current - size : -1, y < size - 1 ? current + size : -1]) {
          if (neighbor < 0 || visited.has(neighbor) || !output[neighbor * 4 + 3] || colorAt(neighbor) !== color) continue;
          visited.add(neighbor); pending.push(neighbor);
        }
      }
      if (cluster.length < 3) {
        const brightness = (output[pixel * 4] + output[pixel * 4 + 1] + output[pixel * 4 + 2]) / 3;
        const replacement = palette[brightness < 120 ? 0 : 1];
        for (const member of cluster) {
          output[member * 4] = replacement[2]; output[member * 4 + 1] = replacement[1]; output[member * 4 + 2] = replacement[0];
        }
      }
    }
    // Give every exposed edge the same ink color. This removes colored matte
    // contamination without expanding or cropping the generated silhouette.
    const silhouette = Buffer.from(output);
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const pixel = y * size + x;
        if (!silhouette[pixel * 4 + 3]) continue;
        if ([pixel - 1, pixel + 1, pixel - size, pixel + size].some((neighbor) => !silhouette[neighbor * 4 + 3])) {
          output[pixel * 4] = palette[0][2];
          output[pixel * 4 + 1] = palette[0][1];
          output[pixel * 4 + 2] = palette[0][0];
        }
      }
    }
    fs.writeFileSync(path.join(destination, `${skin}-${pose}.png`), nativeImage.createFromBitmap(output, { width: size, height: size }).toPNG());
}
app.exit(0);
