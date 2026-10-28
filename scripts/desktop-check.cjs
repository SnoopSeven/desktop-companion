'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = async function check(ctx) {
  async function until(predicate, label, timeout = 10000) {
    const start = Date.now();
    while (!(await predicate())) {
      if (Date.now() - start > timeout) throw new Error('Timed out: ' + label);
      await sleep(50);
    }
  }
  const { BrowserWindow, screen } = require('electron');
  const pet = ctx.getPet();
  const rendererErrors = [];
  for (const win of [pet]) {
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error') rendererErrors.push(event.message);
    });
    win.webContents.on('render-process-gone', (_event, details) => rendererErrors.push('Renderer exited: ' + details.reason));
  }
  const petJS = (code) => pet.webContents.executeJavaScript(code, true);
  await until(() => petJS('document.getElementById("sprite").complete && document.getElementById("sprite").naturalWidth > 0'), 'cat loaded');
  await until(() => pet.isVisible(), 'cat visible immediately');
  assert.equal(BrowserWindow.getAllWindows().length, 1, 'Only the companion opens');
  assert.equal(ctx.state().settings.hidden, false, 'Launching always shows the cat');

  if (process.env.MISO_TEST_RESTORE === '1') {
    assert.equal(ctx.state().settings.size, 1);
    assert.equal(ctx.state().settings.outfit, 'hat');
    assert.equal(ctx.state().settings.roaming, false);
    assert.equal(ctx.state().settings.firstRun, false);
    assert.equal(ctx.state().pose, 'hat-idle');
    console.log('PASS: Selected skin and sit-still choice survive a full restart.');
    return;
  }

  assert.equal(pet.isAlwaysOnTop(), true);
  assert.equal(pet.isResizable(), false);
  assert.equal(await petJS('getComputedStyle(document.body).backgroundColor'), 'rgba(0, 0, 0, 0)');
  assert.equal(await petJS('getComputedStyle(document.getElementById("sprite")).imageRendering'), 'pixelated');
  assert.equal((await pet.webContents.capturePage()).toBitmap()[3], 0);
  assert.equal(pet.webContents.getLastWebPreferences().contextIsolation, true);
  assert.equal(pet.webContents.getLastWebPreferences().nodeIntegration, false);
  assert.equal(await petJS('typeof require'), 'undefined');
  ctx.updateSettings({ roaming: false });
  console.log('PASS: Direct launch, one transparent native companion, isolated renderer.');

  const fixedSize = pet.getSize();
  const skins = ctx.menuItems().find((item) => item.label === 'Change skin').submenu;
  assert.equal(skins.length, 4);
  for (const [index, outfit] of ['none', 'hat', 'pumpkin', 'box'].entries()) {
    skins[index].click();
    assert.equal(ctx.state().settings.outfit, outfit);
    ctx.perform('pet');
    assert.equal(ctx.state().pose, `${outfit}-idle`);
    assert.equal(ctx.state().activity, 'interact');
    ctx.perform('play');
    assert.equal(ctx.state().pose, `${outfit}-idle`);
    ctx.perform('sleep');
    assert.equal(ctx.state().pose, `${outfit}-sleep`);
    ctx.perform('sleep');
    assert.equal(ctx.state().settings.outfit, outfit);
    assert.deepEqual(pet.getSize(), fixedSize);
  }
  ctx.updateSettings({ outfit: 'pumpkin', roaming: false });
  pet.webContents.sendInputEvent({ type: 'mouseDown', x: 115, y: 130, button: 'left', clickCount: 1 });
  pet.webContents.sendInputEvent({ type: 'mouseUp', x: 115, y: 130, button: 'left', clickCount: 1 });
  await until(() => ctx.state().activity === 'interact', 'real pointer reaction');
  await until(() => petJS('document.getElementById("sprite").src.endsWith("pumpkin-idle.png")'), 'skin retained by renderer');
  assert.deepEqual(pet.getSize(), fixedSize);
  console.log('PASS: Every skin stays on through petting, playing, napping and waking; no resizing.');

  ctx.updateSettings({ roaming: false });
  ctx.menuItems().find((item) => item.label === 'Wander around').click();
  assert.equal(ctx.state().settings.roaming, true);
  ctx.perform('recall');
  ctx.updateSettings({ clickThrough: true });
  const before = pet.getPosition();
  await until(() => pet.getPosition().some((value, index) => value !== before[index]), 'roaming', 12000);
  const start = pet.getPosition();
  await sleep(200);
  const end = pet.getPosition();
  if (end[0] !== start[0]) {
    assert.equal(ctx.state().facing, end[0] > start[0] ? 1 : -1);
    const transform = await petJS('getComputedStyle(document.getElementById("sprite")).transform');
    assert.equal(transform, ctx.state().facing < 0 ? 'matrix(-1, 0, 0, 1, 0, 0)' : 'none');
  }
  assert.match(ctx.state().pose, /^pumpkin-walk_[12]$/);
  ctx.menuItems().find((item) => item.label === 'Sit still').click();
  const stopped = pet.getPosition();
  await sleep(300);
  assert.deepEqual(pet.getPosition(), stopped);
  assert.equal(ctx.state().pose, 'pumpkin-idle');
  ctx.updateSettings({ clickThrough: false });
  const p = ctx.getPosition();
  assert.equal(ctx.hitTest({ x: p.x + 1, y: p.y + 1 }, 'pumpkin-idle'), false);
  assert.equal(ctx.hitTest({ x: p.x + 115, y: p.y + 140 }, 'pumpkin-idle'), true);
  console.log('PASS: Native roaming faces its travel direction; Sit still stops it; alpha hit testing works.');

  // Exercise the real renderer RAF -> preload -> main -> native window path.
  // Substitute only the OS cursor source so CI needs no global input permissions.
  const getCursor = screen.getCursorScreenPoint;
  const area = screen.getDisplayMatching(pet.getBounds()).workArea;
  const dragStart = { x: area.x + 20, y: area.y + 20 };
  pet.setPosition(dragStart.x, dragStart.y);
  let cursor = { x: dragStart.x + 115, y: dragStart.y + 140 };
  screen.getCursorScreenPoint = () => cursor;
  const originalSetPosition = pet.setPosition.bind(pet);
  let moves = 0;
  pet.setPosition = (...args) => { moves++; return originalSetPosition(...args); };
  try {
    pet.webContents.sendInputEvent({ type: 'mouseDown', x: 115, y: 140, button: 'left', clickCount: 1 });
    await sleep(100);
    const stoppedMoves = moves;
    await sleep(100);
    assert.equal(moves, stoppedMoves, 'Stationary cursor does not repeatedly move the window');
    const began = Date.now();
    const timer = setInterval(() => { cursor = { x: cursor.x + 2, y: cursor.y }; }, 4);
    try { await sleep(600); } finally { clearInterval(timer); }
    const elapsed = Date.now() - began;
    const rate = (moves - stoppedMoves) * 1000 / elapsed;
    assert.ok(moves > stoppedMoves, 'Display frames move the native companion while held');
    cursor = { x: dragStart.x + 115 + 75, y: dragStart.y + 140 + 45 };
    pet.webContents.sendInputEvent({ type: 'mouseUp', x: 115, y: 140, button: 'left', clickCount: 1 });
    await until(() => ctx.state().message === 'A new little corner.', 'drag release');
    assert.deepEqual(pet.getPosition(), [dragStart.x + 75, dragStart.y + 45], 'Release uses the latest cursor, not a stale frame');
    const released = pet.getPosition();
    cursor = { x: cursor.x + 100, y: cursor.y + 100 };
    await sleep(100);
    assert.deepEqual(pet.getPosition(), released, 'No queued movement after release');
    console.log(`PASS: Display-synced drag (${rate.toFixed(1)} native moves/sec), stationary deduplication, final release position.`);
  } finally {
    screen.getCursorScreenPoint = getCursor;
    pet.setPosition = originalSetPosition;
    ctx.perform('recall');
  }

  ctx.updateSettings({ outfit: 'hat', roaming: false });
  ctx.persist();
  await until(() => petJS('document.getElementById("sprite").src.endsWith("hat-idle.png") && document.getElementById("sprite").complete'), 'hat loaded');
  await sleep(150);
  fs.writeFileSync(path.join(process.env.MISO_TEST_RESULTS, 'companion.png'), (await pet.webContents.capturePage()).toPNG());
  for (const skin of ['none', 'hat', 'pumpkin', 'box']) {
    for (const pose of ['idle', 'walk_1', 'walk_2', 'sleep']) {
      ctx.updateSettings({ outfit: skin, sleeping: pose === 'sleep' });
      // Verify all pixel assets are valid fixed-size RGBA images, with a clear border.
      const img = require('electron').nativeImage.createFromPath(path.join(__dirname, '../assets/cat/pixel', `${skin}-${pose}.png`));
      assert.deepEqual(img.getSize(), { width: 50, height: 50 });
      await petJS(`(async () => {
        const sprite = document.getElementById('sprite');
        sprite.src = '../../assets/cat/pixel/${skin}-${pose}.png';
        await sprite.decode();
      })()`);
      if (pose === 'idle' || pose === 'sleep') {
        await sleep(50);
        fs.writeFileSync(path.join(process.env.MISO_TEST_RESULTS, `${skin}-${pose}.png`), (await pet.webContents.capturePage()).toPNG());
      }
      const data = img.toBitmap();
      const colors = new Set();
      for (let i = 0; i < 50 * 50; i++) {
        const alpha = data[i * 4 + 3];
        assert.ok(alpha === 0 || alpha === 255, 'No semitransparent edge fringes');
        if (alpha) colors.add(data.subarray(i * 4, i * 4 + 3).toString('hex'));
      }
      assert.ok(colors.size <= 12, 'Sprites use a clean, limited palette');
      if (skin === 'none') assert.ok(colors.size <= 4, 'Plain cats contain only ink, cream, shading and blush');
      for (let i = 0; i < 50; i++) {
        for (const offset of [i, 49 * 50 + i, i * 50, i * 50 + 49]) assert.equal(data[offset * 4 + 3], 0);
      }
    }
  }
  ctx.updateSettings({ outfit: 'hat', sleeping: false, roaming: false });
  // Deliberately save hidden to cover migration/relaunch from an older install.
  ctx.updateSettings({ hidden: true });
  ctx.persist();
  assert.deepEqual(rendererErrors, []);
  console.log('PASS: All 16 sprites load with clean transparent borders, consistent frames, saved skin.');
};
