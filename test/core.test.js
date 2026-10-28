'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, sanitizeSettings, clampPosition, randomTarget, stepTowards, choosePose, petSize } = require('../src/core');

test('untrusted preferences cannot change types or inject unrecognized settings', () => {
  const result = sanitizeSettings({ roaming: 'false', size: 1000, outfit: '../../secret', speed: '__proto__', clickThrough: true, extra: true });
  assert.deepEqual(result, { ...DEFAULTS, clickThrough: true });
  assert.deepEqual(sanitizeSettings(null), DEFAULTS);
});
test('valid preferences and negative monitor coordinates survive a restart', () => {
  const settings = sanitizeSettings({ sleeping: true, size: 1.35, outfit: 'hat', speed: 'lively', position: { x: -1700, y: -300 } });
  assert.equal(settings.size, 1.35);
  assert.equal(settings.outfit, 'hat');
  assert.equal(settings.speed, 'lively');
  assert.deepEqual(sanitizeSettings(JSON.parse(JSON.stringify(settings))), settings);
});
test('invalid positions are rejected', () => {
  assert.equal(sanitizeSettings({ position: { x: Infinity, y: 5 } }).position, null);
  assert.equal(sanitizeSettings({ position: { x: '2', y: 5 } }).position, null);
});
test('off-screen positions clamp inside the work area, including monitors left and above primary', () => {
  const area = { x: -1920, y: -1080, width: 1920, height: 1040 };
  assert.deepEqual(clampPosition({ x: 50, y: 100 }, area, { width: 230, height: 222 }), { x: -230, y: -262 });
  assert.deepEqual(clampPosition({ x: -3000, y: -2000 }, area, petSize(1)), { x: -1920, y: -1080 });
});
test('tiny screens do not generate inverted bounds', () => {
  assert.deepEqual(clampPosition({ x: 4, y: 4 }, { x: 10, y: 20, width: 80, height: 80 }, petSize(1)), { x: 10, y: 20 });
});
test('random targets keep the whole window clear of the dock and taskbar', () => {
  const area = { x: 100, y: 50, width: 1000, height: 700 };
  assert.deepEqual(randomTarget(area, petSize(1), () => 1), { x: 870, y: 528 });
  assert.deepEqual(randomTarget(area, petSize(1), () => 0), { x: 100, y: 50 });
});
test('movement speed is independent of frame rate', () => {
  const from = { x: 0, y: 0 }, to = { x: 200, y: 0 };
  assert.equal(stepTowards(from, to, 60, 1 / 30).x, 2);
  assert.equal(stepTowards(from, to, 60, 1 / 60).x, 1);
});
test('waking a suspended computer does not teleport the cat', () => {
  const step = stepTowards({ x: 0, y: 0 }, { x: 1000, y: 0 }, 60, 600);
  assert.equal(step.x, 6);
  assert.equal(step.arrived, false);
});
test('motion arrives without overshooting or dividing by zero', () => {
  assert.deepEqual(stepTowards({ x: 0, y: 0 }, { x: 1, y: 0 }, 60, .1), { x: 1, y: 0, arrived: true });
  assert.deepEqual(stepTowards({ x: 3, y: 4 }, { x: 3, y: 4 }, 60, .1), { x: 3, y: 4, arrived: true });
});
test('sleep takes priority over reactions and movement while preserving the skin', () => {
  assert.equal(choosePose({ ...DEFAULTS, sleeping: true, outfit: 'hat' }, 'play', true, 0), 'hat-sleep');
});
test('petting, playing, walking, and napping never remove the selected skin', () => {
  for (const outfit of ['none', 'hat', 'pumpkin', 'box']) {
    const settings = { ...DEFAULTS, outfit };
    assert.equal(choosePose(settings, 'interact', true, 0), `${outfit}-idle`);
    assert.equal(choosePose(settings, 'play', false, 0), `${outfit}-idle`);
    assert.equal(choosePose(settings, null, true, 0), `${outfit}-walk_1`);
    assert.equal(choosePose({ ...settings, sleeping: true }, null, false, 0), `${outfit}-sleep`);
  }
});
test('walking alternates frames; pausing always settles in the same stable idle', () => {
  assert.equal(choosePose(DEFAULTS, null, true, 0), 'none-walk_1');
  assert.equal(choosePose(DEFAULTS, null, true, 1), 'none-walk_2');
  assert.equal(choosePose(DEFAULTS, null, false, 0), 'none-idle');
  assert.equal(choosePose({ ...DEFAULTS, roaming: false }, null, false, 0), 'none-idle');
});
