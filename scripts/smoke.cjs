'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'miso-smoke-'));
const resultDir = path.resolve('test-results');
fs.mkdirSync(resultDir, { recursive: true });
function run(restore) {
  return new Promise((resolve, reject) => {
    const args = ['.', '--smoke-test'];
    // For isolated Linux containers without a usable Chromium sandbox only.
    if (process.env.MISO_TEST_NO_SANDBOX === '1') args.push('--no-sandbox');
    const env = { ...process.env, MISO_TEST_DATA_DIR: directory, MISO_TEST_RESULTS: resultDir, MISO_TEST_RESTORE: restore ? '1' : '0' };
    // Editor/agent hosts can set this for their own helpers; this is a GUI test.
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), args, {
      stdio: 'inherit',
      env,
    });
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Desktop smoke test timed out')); }, 45000);
    child.on('error', (error) => { clearTimeout(timeout); reject(error); });
    child.on('close', (code) => { clearTimeout(timeout); if (code === 0) resolve(); else reject(new Error(`Desktop smoke test exited ${code}`)); });
  });
}
(async () => {
  try { await run(false); await run(true); }
  finally { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
