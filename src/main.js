'use strict';

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, globalShortcut, powerMonitor } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { DEFAULTS, SPEEDS, sanitizeSettings, petSize, clampPosition, randomTarget, stepTowards, choosePose } = require('./core');

const ROOT = path.join(__dirname, '..');
const SMOKE = !app.isPackaged && process.argv.includes('--smoke-test');
if (SMOKE && process.env.MISO_TEST_DATA_DIR) app.setPath('userData', process.env.MISO_TEST_DATA_DIR);
app.setName('Miso');
const ownsLock = app.requestSingleInstanceLock();
if (!ownsLock) app.quit();

let pet, tray, settings = { ...DEFAULTS }, notice = '';
let target = null, position, activity = null, activityUntil = 0, message = '', nextWander = 0;
let dragging = null, hovered = false, moving = false, paused = false, facing = 1;
let lastPose, lastMessage, lastFacing, tick = 0, lastTick = Date.now(), saveTimer, loop;
let ignoreMouse = true, quitting = false, recovering = false;
const masks = new Map();
const fileURL = (name) => pathToFileURL(path.join(__dirname, 'renderer', name)).href;
const alive = (window) => window && !window.isDestroyed();

function persist() {
  clearTimeout(saveTimer);
  try {
    const directory = app.getPath('userData');
    fs.mkdirSync(directory, { recursive: true });
    const destination = path.join(directory, 'settings.json');
    fs.writeFileSync(destination + '.tmp', JSON.stringify({ ...settings, position }, null, 2));
    fs.renameSync(destination + '.tmp', destination);
  } catch (error) {
    notice = 'Your preferences could not be saved. Check that your user data folder is writable.';
    console.error('Settings save failed:', error.code);
  }
}
function queueSave() { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 350); }

function state() {
  return {
    settings: { ...settings },
    pose: choosePose(settings, activity, moving, Math.floor(tick / 9)),
    moving, facing, activity, message, notice,
    capabilities: { login: app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE && ['win32', 'darwin'].includes(process.platform) },
    version: app.getVersion(),
  };
}
function broadcast() {
  const data = state();
  if (alive(pet)) pet.webContents.send('state', data);
}

function secureWindow(window, page) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('did-finish-load', broadcast);
  window.loadURL(fileURL(page));
}
function webPreferences() {
  return { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false };
}

function createPet() {
  const size = petSize(settings.size);
  const area = screen.getPrimaryDisplay().workArea;
  const wanted = settings.position || { x: area.x + area.width - size.width - 50, y: area.y + area.height - size.height - 45 };
  const display = screen.getDisplayNearestPoint(wanted);
  position = clampPosition(wanted, display.workArea, size);
  pet = new BrowserWindow({
    ...size, x: position.x, y: position.y, title: 'Miso companion',
    transparent: true, backgroundColor: '#00000000', frame: false, resizable: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false,
    show: false, webPreferences: webPreferences(),
  });
  pet.setAlwaysOnTop(true, 'floating');
  pet.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pet.setIgnoreMouseEvents(true, { forward: true });
  ignoreMouse = true;
  secureWindow(pet, 'pet.html');
  pet.once('ready-to-show', () => { if (!settings.hidden) pet.showInactive(); });
  pet.on('closed', () => { pet = null; });
  pet.webContents.on('render-process-gone', () => {
    if (quitting || recovering) return;
    recovering = true;
    if (alive(pet)) pet.destroy();
    createPet();
    recovering = false;
  });
}

function makeTray() {
  const icon = process.platform === 'darwin'
    ? nativeImage.createFromPath(path.join(ROOT, 'assets/trayTemplate.png'))
    : nativeImage.createFromPath(path.join(ROOT, 'assets/cat/pixel/none-idle.png')).resize({ width: 24, height: 24 });
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Miso · Your ghost cat companion');
  tray.on('click', () => perform('open'));
  tray.on('double-click', () => perform('open'));
  refreshMenu();
}
function menuItems() {
  return [
    { label: settings.roaming ? 'Sit still' : 'Wander around', click: () => updateSettings({ roaming: !settings.roaming, reducedMotion: false }) },
    { label: 'Change skin', submenu: [
      ['none', 'Just Miso'], ['hat', 'Witch hat'], ['pumpkin', 'Pumpkin'], ['box', 'Cardboard box'],
    ].map(([outfit, label]) => ({ label, type: 'radio', checked: settings.outfit === outfit, click: () => updateSettings({ outfit }) })) },
    { type: 'separator' },
    { label: 'Play', click: () => perform('play') },
    { label: settings.sleeping ? 'Wake up' : 'Take a nap', click: () => perform('sleep') },
    { type: 'separator' },
    { label: 'Bring Miso here', click: () => perform('recall') },
    { label: settings.hidden ? 'Show Miso' : 'Hide Miso', click: () => updateSettings({ hidden: !settings.hidden }) },
    { label: 'Quit Miso', accelerator: 'CommandOrControl+Q', click: () => app.quit() },
  ];
}
function refreshMenu() { if (tray) tray.setContextMenu(Menu.buildFromTemplate(menuItems())); }

function updateSettings(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return state();
  const safe = {};
  for (const key of ['roaming', 'speed', 'size', 'outfit', 'clickThrough', 'reducedMotion', 'sleeping', 'hidden', 'launchAtLogin']) {
    if (Object.hasOwn(patch, key)) safe[key] = patch[key];
  }
  const next = sanitizeSettings({ ...settings, ...safe });
  if (dragging) endDrag(false);
  if (next.launchAtLogin !== settings.launchAtLogin) {
    if (!state().capabilities.login) {
      next.launchAtLogin = false;
      notice = 'Launch at login is available in the installed Windows and macOS app.';
    } else {
      try {
        app.setLoginItemSettings({ openAtLogin: next.launchAtLogin, args: ['--background'] });
        next.launchAtLogin = app.getLoginItemSettings().openAtLogin;
        notice = '';
      } catch { next.launchAtLogin = settings.launchAtLogin; notice = 'Could not update login settings. Please try again.'; }
    }
  }
  const resized = next.size !== settings.size;
  if (next.sleeping !== settings.sleeping || next.outfit !== settings.outfit) { activity = null; message = ''; }
  settings = next;
  target = null;
  moving = false;
  nextWander = Date.now() + 2000;
  if (alive(pet)) {
    if (resized) {
      const size = petSize(settings.size);
      position = clampPosition(position, screen.getDisplayNearestPoint(position).workArea, size);
      pet.setBounds({ ...position, ...size });
    }
    if (settings.hidden) pet.hide(); else pet.showInactive();
  }
  queueSave(); refreshMenu(); broadcast();
  return state();
}

function react(pose, text, duration = 2600) {
  activity = pose; message = text; activityUntil = Date.now() + duration;
  moving = false; target = null; nextWander = activityUntil + 1800;
  broadcast();
}
function perform(action) {
  switch (action) {
    case 'open': updateSettings({ hidden: false, clickThrough: false }); break;
    case 'pet':
      if (settings.sleeping) { updateSettings({ sleeping: false }); react('wake', 'Oh, hello there.'); }
      else react('interact', ['You make my day.', 'A little love. ♡', 'Right here with you.'][Math.floor(Math.random() * 3)]);
      break;
    case 'play': updateSettings({ sleeping: false, hidden: false }); react('play', 'My favorite little thing!', 6500); break;
    case 'sleep': updateSettings({ sleeping: !settings.sleeping }); if (!settings.sleeping) react('wake', 'Ready for a new adventure.'); break;
    case 'recall': {
      updateSettings({ hidden: false, clickThrough: false });
      const cursor = screen.getCursorScreenPoint();
      const area = screen.getDisplayNearestPoint(cursor).workArea;
      position = clampPosition({ x: cursor.x - petSize(settings.size).width / 2, y: cursor.y + 32 }, area, petSize(settings.size));
      pet.setPosition(position.x, position.y);
      queueSave(); react(settings.sleeping ? 'sleep' : 'happy', 'Here I am.');
      break;
    }
    case 'next-display': {
      const displays = screen.getAllDisplays();
      const current = screen.getDisplayMatching(pet.getBounds());
      const next = displays[(displays.findIndex((d) => d.id === current.id) + 1) % displays.length];
      position = clampPosition({ x: next.workArea.x + next.workArea.width / 2, y: next.workArea.y + next.workArea.height / 2 }, next.workArea, petSize(settings.size));
      pet.setPosition(position.x, position.y);
      updateSettings({ hidden: false });
      break;
    }
    case 'quit': app.quit(); break;
    default: break;
  }
  return state();
}

// Hit-test the original sprite alpha, so even holes inside the sprite let clicks through.
function onVisiblePixel(cursor, pose) {
  if (!masks.has(pose)) {
    const image = nativeImage.createFromPath(path.join(ROOT, 'assets', 'cat', 'pixel', pose + '.png'));
    masks.set(pose, { ...image.getSize(), data: image.toBitmap() });
  }
  const mask = masks.get(pose), scale = settings.size;
  const fit = Math.min(218 * scale / mask.width, 194 * scale / mask.height);
  const width = mask.width * fit, height = mask.height * fit;
  const left = position.x + 6 * scale + (218 * scale - width) / 2;
  const top = position.y + 222 * scale - 16 * scale - height;
  let x = Math.floor((cursor.x - left) / fit);
  const y = Math.floor((cursor.y - top) / fit);
  if (facing < 0) x = mask.width - x - 1;
  return x >= 0 && y >= 0 && x < mask.width && y < mask.height && mask.data[(y * mask.width + x) * 4 + 3] > 24;
}

function frame() {
  if (!alive(pet) || paused) return;
  const now = Date.now(), dt = (now - lastTick) / 1000;
  lastTick = now; tick++;
  if (activity && now >= activityUntil) { activity = null; message = ''; }
  if (!settings.hidden) {
    const cursor = screen.getCursorScreenPoint();
    // Drag movement runs on display frames, independently of this behavior loop.
    hovered = !!dragging || (!settings.clickThrough && onVisiblePixel(cursor, state().pose));
    const ignore = settings.clickThrough || (!hovered && !dragging);
    if (ignore !== ignoreMouse) { pet.setIgnoreMouseEvents(ignore, { forward: true }); ignoreMouse = ignore; }
    if (dragging) {
      if (now - dragging.lastFrame > 2000) endDrag(false);
    } else if (settings.roaming && !settings.sleeping && !settings.reducedMotion && !activity && !hovered) {
      if (!target && now >= nextWander) {
        const displays = screen.getAllDisplays();
        // Occasionally visit another connected display; coordinates can be negative.
        const display = Math.random() < 0.2 ? displays[Math.floor(Math.random() * displays.length)] : screen.getDisplayMatching(pet.getBounds());
        target = randomTarget(display.workArea, petSize(settings.size));
      }
      moving = !!target;
      if (target) {
        facing = target.x < position.x ? -1 : 1;
        const next = stepTowards(position, target, SPEEDS[settings.speed], dt);
        position = { x: next.x, y: next.y };
        pet.setPosition(Math.round(position.x), Math.round(position.y));
        if (next.arrived) { target = null; moving = false; nextWander = now + 4000 + Math.random() * 5000; queueSave(); }
      }
    } else { moving = false; }
  } else { moving = false; }
  const pose = state().pose;
  if (pose !== lastPose || message !== lastMessage || facing !== lastFacing) {
    lastPose = pose; lastMessage = message; lastFacing = facing; broadcast();
  }
}

function moveDrag() {
  if (!dragging || !alive(pet) || paused) return false;
  dragging.lastFrame = Date.now();
  const cursor = screen.getCursorScreenPoint();
  const next = clampPosition({ x: cursor.x - dragging.offset.x, y: cursor.y - dragging.offset.y }, screen.getDisplayNearestPoint(cursor).workArea, petSize(settings.size));
  if (next.x !== position.x || next.y !== position.y) {
    position = next;
    pet.setPosition(position.x, position.y, false);
  }
  return true;
}
function endDrag(commit = true) {
  if (!dragging) return;
  // Include mouse-up even if it arrived before the next display frame.
  if (commit) moveDrag();
  const distance = Math.hypot(position.x - dragging.origin.x, position.y - dragging.origin.y);
  dragging = null;
  if (!commit) queueSave();
  else if (distance < 5) perform('pet'); else { react('happy', 'A new little corner.'); queueSave(); }
}
function validSender(event) {
  return alive(pet) && event.sender === pet.webContents && event.senderFrame === pet.webContents.mainFrame;
}
function registerIPC() {
  ipcMain.handle('state:get', (event) => validSender(event) ? state() : null);
  ipcMain.handle('settings:update', (event, patch) => validSender(event) ? updateSettings(patch) : null);
  ipcMain.handle('pet:action', (event, action) => validSender(event) ? perform(action) : null);
  ipcMain.on('pet:drag', (event, phase) => {
    if (!alive(pet) || event.sender !== pet.webContents || !validSender(event)) return;
    if (phase === 'start' && !settings.clickThrough && !dragging && !paused && !settings.hidden) {
      const cursor = screen.getCursorScreenPoint();
      const [x, y] = pet.getPosition();
      position = { x, y };
      dragging = { offset: { x: cursor.x - x, y: cursor.y - y }, origin: { ...position }, lastFrame: Date.now() };
      pet.setIgnoreMouseEvents(false);
      ignoreMouse = false;
      target = null; moving = false;
    } else if (phase === 'end') endDrag();
    else if (phase === 'cancel') endDrag(false);
  });
  ipcMain.handle('pet:drag-frame', (event) => validSender(event) && moveDrag());
  ipcMain.on('pet:menu', (event) => {
    if (!validSender(event)) return;
    // Native menus provide keyboard navigation and close on outside clicks.
    // Pause the cat for the entire menu interaction, including its skin submenu.
    endDrag(false);
    paused = true; moving = false;
    Menu.buildFromTemplate(menuItems()).popup({ callback: () => { paused = false; lastTick = Date.now(); } });
  });
}

function relocate() {
  if (!alive(pet)) return;
  endDrag(false);
  target = null;
  position = clampPosition(position, screen.getDisplayNearestPoint(position).workArea, petSize(settings.size));
  pet.setPosition(position.x, position.y); queueSave();
}

function activate() {
  if (alive(pet)) perform('open');
}
app.on('second-instance', activate);
app.on('activate', activate);
app.on('window-all-closed', () => {});
app.on('before-quit', () => { quitting = true; clearInterval(loop); clearTimeout(saveTimer); if (position) persist(); globalShortcut.unregisterAll(); });

if (ownsLock) app.whenReady().then(async () => {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  try { settings = sanitizeSettings(JSON.parse(fs.readFileSync(settingsPath, 'utf8'))); }
  catch (error) {
    if (error.code !== 'ENOENT') {
      notice = 'Your previous preferences could not be read. Miso is using the defaults.';
      try { fs.copyFileSync(settingsPath, settingsPath + '.backup-' + Date.now()); } catch { /* leave the original in place */ }
    }
  }
  if (state().capabilities.login) settings.launchAtLogin = app.getLoginItemSettings().openAtLogin;
  else settings.launchAtLogin = false;
  // Retire the old size/click-through preferences along with the dashboard.
  settings.size = 1;
  settings.clickThrough = false;
  // Every launch opens the companion, including older installs saved as hidden.
  settings.hidden = false;
  if (process.platform === 'darwin') app.dock.hide();
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([
    { label: 'Miso', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] },
  ]) : null);
  registerIPC(); createPet(); makeTray();
  const registered = globalShortcut.register('CommandOrControl+Shift+M', () => perform('recall'));
  if (!registered) notice = 'The recall shortcut is already in use. You can always bring Miso back from the tray menu.';
  powerMonitor.on('suspend', () => { endDrag(false); paused = true; });
  powerMonitor.on('resume', () => { paused = false; lastTick = Date.now(); relocate(); });
  screen.on('display-removed', relocate);
  screen.on('display-metrics-changed', relocate);
  loop = setInterval(frame, 33);
  settings.firstRun = false; queueSave();
  if (SMOKE) {
    try { await require('../scripts/desktop-check.cjs')({ app, getPet: () => pet, getPosition: () => position, hitTest: onVisiblePixel, state, perform, updateSettings, menuItems, persist }); app.exit(0); }
    catch (error) { console.error(error); app.exit(1); }
  }
}).catch((error) => { console.error(error); app.exit(1); });
