'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function renderer() {
  const handlers = {}, phases = [], frames = new Map();
  let id = 0, calls = 0, resolveFrame, captured = false;
  const cat = {
    addEventListener: (type, handler) => { handlers[type] = handler; },
    setPointerCapture: () => { captured = true; },
    hasPointerCapture: () => captured,
    releasePointerCapture: () => { captured = false; handlers.lostpointercapture(); },
  };
  const context = {
    document: { getElementById: () => cat, addEventListener: () => {} },
    Image: class {},
    requestAnimationFrame: (callback) => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: (frame) => frames.delete(frame),
    window: {
      addEventListener: () => {},
      miso: {
        onState: () => {}, getState: async () => null,
        drag: (phase) => phases.push(phase),
        dragFrame: () => { calls++; return new Promise((resolve) => { resolveFrame = resolve; }); },
      },
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/pet.js'), 'utf8'), context);
  return {
    phases, get calls() { return calls; }, get scheduled() { return frames.size; },
    down: (pointerId = 1) => handlers.pointerdown({ pointerId, button: 0, preventDefault() {} }),
    up: (pointerId = 1) => handlers.pointerup({ pointerId, button: 0 }),
    cancel: () => handlers.pointercancel(),
    frame: () => { const ready = [...frames.values()]; frames.clear(); ready.forEach((callback) => callback()); },
    settle: async (active = true) => { resolveFrame(active); await new Promise(setImmediate); },
  };
}

test('drag follows every display frame at both 60 Hz and 144 Hz', async () => {
  for (const hz of [60, 144]) {
    const pet = renderer();
    pet.down();
    for (let i = 0; i < hz; i++) { pet.frame(); await pet.settle(); }
    assert.equal(pet.calls, hz);
    assert.equal(pet.scheduled, 1);
    pet.up();
    assert.deepEqual(pet.phases, ['start', 'end']);
    assert.equal(pet.scheduled, 0);
  }
});

test('slow native movement never queues more than one outstanding IPC request', async () => {
  const pet = renderer();
  pet.down();
  for (let i = 0; i < 100; i++) pet.frame();
  assert.equal(pet.calls, 1);
  await pet.settle();
  pet.frame();
  assert.equal(pet.calls, 2);
  pet.up();
  await pet.settle();
  pet.frame();
  assert.equal(pet.calls, 2);
  assert.deepEqual(pet.phases, ['start', 'end']);
});

test('release/cancel finish once despite lost pointer capture; other pointers cannot end a drag', () => {
  const pet = renderer();
  pet.down(1);
  pet.down(2);
  pet.up(2);
  assert.deepEqual(pet.phases, ['start']);
  pet.up(1);
  pet.cancel();
  assert.deepEqual(pet.phases, ['start', 'end']);
  pet.down(3);
  pet.cancel();
  assert.deepEqual(pet.phases, ['start', 'end', 'start', 'cancel']);
  assert.equal(pet.scheduled, 0);
});

test('main-process cancellation stops rendering drag frames', async () => {
  const pet = renderer();
  pet.down();
  pet.frame();
  await pet.settle(false);
  assert.deepEqual(pet.phases, ['start', 'cancel']);
  assert.equal(pet.scheduled, 0);
});
