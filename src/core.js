'use strict';

const DEFAULTS = Object.freeze({
  roaming: true, speed: 'gentle', size: 1, outfit: 'none',
  clickThrough: false, reducedMotion: false, sleeping: false, hidden: false,
  launchAtLogin: false, firstRun: true, position: null,
});
const OUTFITS = ['none', 'hat', 'pumpkin', 'box'];
const SPEEDS = { gentle: 38, normal: 65, lively: 105 };

function sanitizeSettings(input = {}) {
  const result = { ...DEFAULTS };
  if (!input || typeof input !== 'object') return result;
  for (const key of Object.keys(DEFAULTS)) {
    if (typeof DEFAULTS[key] === 'boolean' && typeof input[key] === 'boolean') result[key] = input[key];
  }
  if (Object.hasOwn(SPEEDS, input.speed)) result.speed = input.speed;
  if ([0.75, 1, 1.35].includes(input.size)) result.size = input.size;
  if (OUTFITS.includes(input.outfit)) result.outfit = input.outfit;
  if (input.position && Number.isFinite(input.position.x) && Number.isFinite(input.position.y)) {
    result.position = { x: Math.round(input.position.x), y: Math.round(input.position.y) };
  }
  return result;
}

function petSize(scale) { return { width: Math.round(230 * scale), height: Math.round(222 * scale) }; }

function clampPosition(point, area, size) {
  return {
    x: Math.round(Math.max(area.x, Math.min(point.x, area.x + Math.max(0, area.width - size.width)))),
    y: Math.round(Math.max(area.y, Math.min(point.y, area.y + Math.max(0, area.height - size.height)))),
  };
}

function randomTarget(area, size, random = Math.random) {
  return clampPosition({ x: area.x + random() * Math.max(0, area.width - size.width), y: area.y + random() * Math.max(0, area.height - size.height) }, area, size);
}

function stepTowards(from, to, speed, deltaSeconds) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const step = speed * Math.min(Math.max(deltaSeconds, 0), 0.1);
  if (distance <= step || distance < 1) return { ...to, arrived: true };
  return { x: from.x + dx / distance * step, y: from.y + dy / distance * step, arrived: false };
}

function choosePose(settings, activity, moving, tick) {
  // Skin and behavior are independent: petting never swaps in a bare cat.
  const skin = OUTFITS.includes(settings.outfit) ? settings.outfit : 'none';
  const pose = settings.sleeping ? 'sleep' : moving && !activity ? (tick % 2 === 0 ? 'walk_1' : 'walk_2') : 'idle';
  return `${skin}-${pose}`;
}

module.exports = { DEFAULTS, OUTFITS, SPEEDS, sanitizeSettings, petSize, clampPosition, randomTarget, stepTowards, choosePose };
