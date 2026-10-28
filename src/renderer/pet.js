'use strict';
const cat = document.getElementById('cat');
const sprite = document.getElementById('sprite');
const bubble = document.getElementById('bubble');
let currentPose;
// Warm the small local sprite set so the first step/skin change cannot flash blank.
const sprites = [];
for (const skin of ['none', 'hat', 'pumpkin', 'box']) {
  for (const pose of ['idle', 'walk_1', 'walk_2', 'sleep']) {
    const asset = new Image();
    asset.src = `../../assets/cat/pixel/${skin}-${pose}.png`;
    sprites.push(asset);
  }
}

function render(state) {
  if (!state) return;
  if (state.pose !== currentPose) { sprite.src = `../../assets/cat/pixel/${state.pose}.png`; currentPose = state.pose; }
  sprite.style.transform = state.facing < 0 ? 'scaleX(-1)' : '';
  cat.dataset.activity = state.activity || '';
  cat.classList.toggle('reduced-motion', state.settings.reducedMotion);
  bubble.textContent = state.message;
  bubble.classList.toggle('visible', !!state.message);
}
window.miso.onState(render);
window.miso.getState().then(render);

let dragPointer = null, dragFrame = null, framePending = false;
function followPointer() {
  if (dragPointer === null) return;
  dragFrame = requestAnimationFrame(followPointer);
  // Never queue stale moves if native window movement takes longer than a frame.
  // Main samples the OS cursor to avoid coordinate drift across scaled displays.
  if (framePending) return;
  framePending = true;
  window.miso.dragFrame().then((active) => {
    if (!active) stopDrag('cancel');
  }).catch(() => stopDrag('cancel')).finally(() => { framePending = false; });
}
function stopDrag(phase = 'end') {
  if (dragPointer === null) return;
  const pointer = dragPointer;
  dragPointer = null;
  cancelAnimationFrame(dragFrame);
  if (cat.hasPointerCapture(pointer)) cat.releasePointerCapture(pointer);
  window.miso.drag(phase);
}
cat.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || dragPointer !== null) return;
  event.preventDefault();
  dragPointer = event.pointerId;
  cat.setPointerCapture(event.pointerId);
  window.miso.drag('start');
  dragFrame = requestAnimationFrame(followPointer);
});
cat.addEventListener('pointerup', (event) => {
  if (event.button === 0 && event.pointerId === dragPointer) stopDrag();
});
cat.addEventListener('lostpointercapture', () => stopDrag('cancel'));
cat.addEventListener('pointercancel', () => stopDrag('cancel'));
window.addEventListener('pagehide', () => stopDrag('cancel'));
cat.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); window.miso.action('pet'); } });
document.addEventListener('contextmenu', (event) => { event.preventDefault(); window.miso.menu(); });
