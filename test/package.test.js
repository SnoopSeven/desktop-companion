'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPackage, uncache } = require('@electron/asar');
const verifyPackage = require('../scripts/verify-package.cjs');

for (const scenario of ['matching', 'stale sprite', 'missing sprite', 'stale renderer', 'wrong version']) {
  test(`packaged app verification: ${scenario}`, async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'miso-package-'));
    const source = path.join(directory, 'source');
    const staged = path.join(directory, 'staged');
    const archive = path.join(directory, 'app.asar');
    t.after(() => { uncache(archive); fs.rmSync(directory, { recursive: true, force: true }); });
    const sprite = 'assets/cat/pixel/none-idle.png';
    const renderer = 'src/renderer/pet.js';
    for (const root of [source, staged]) {
      fs.mkdirSync(path.join(root, 'assets/cat/pixel'), { recursive: true });
      fs.mkdirSync(path.join(root, 'src/renderer'), { recursive: true });
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.0.2' }));
      fs.copyFileSync(path.join(__dirname, '..', sprite), path.join(root, sprite));
      fs.writeFileSync(path.join(root, renderer), 'const artwork = "pixel";');
    }
    if (scenario === 'stale sprite') fs.writeFileSync(path.join(staged, sprite), 'old artwork');
    if (scenario === 'missing sprite') fs.unlinkSync(path.join(staged, sprite));
    if (scenario === 'stale renderer') fs.writeFileSync(path.join(staged, renderer), 'const artwork = "hd";');
    if (scenario === 'wrong version') fs.writeFileSync(path.join(staged, 'package.json'), '{"version":"1.0.1"}');
    await createPackage(staged, archive);
    const verify = () => verifyPackage({
      appOutDir: directory,
      packager: { projectDir: source, getResourcesDir: () => directory },
    });
    if (scenario === 'matching') assert.doesNotThrow(verify);
    else if (scenario === 'wrong version') assert.throws(verify, /Packaged version must match/);
    else assert.throws(verify, (error) => error.message.replaceAll('\\', '/').includes(scenario === 'stale renderer' ? renderer : sprite));
  });
}
