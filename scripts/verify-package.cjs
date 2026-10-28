'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extractFile } = require('@electron/asar');

// Runs for every architecture before electron-builder creates installers/archives.
// Check the actual packaged bytes, so stale or omitted artwork cannot ship.
module.exports = function verifyPackage({ appOutDir, packager }) {
  const root = packager.projectDir;
  const archive = path.join(packager.getResourcesDir(appOutDir), 'app.asar');
  const expectedVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const packagedVersion = JSON.parse(extractFile(archive, 'package.json').toString('utf8')).version;
  assert.equal(packagedVersion, expectedVersion, 'Packaged version must match the release source');

  let checked = 0;
  function verifyDirectory(relative) {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const file = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        verifyDirectory(file);
      } else {
        const source = fs.readFileSync(path.join(root, file));
        assert.ok(source.equals(extractFile(archive, path.normalize(file))), `Packaged file differs from release source: ${file}`);
        checked++;
      }
    }
  }
  verifyDirectory('src');
  verifyDirectory('assets');
  console.log(`Verified packaged Miso ${expectedVersion}: ${checked} source and asset files match the release source.`);
};
