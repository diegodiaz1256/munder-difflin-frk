'use strict';
// electron-updater turns allowPrerelease on for any version with a suffix
// (0.4.6-fork.37) and then offers only releases with the SAME suffix, so a plain
// 1.0.0 never reached a -fork.N install. The updater must follow
// /releases/latest instead, set before the first check.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'updater.ts'), 'utf8');

test('the updater follows the latest release, not the suffix channel', () => {
  const off = src.indexOf('autoUpdater.allowPrerelease = false;');
  assert.ok(off > 0, 'allowPrerelease must be turned off');
  const firstCheck = src.indexOf('checkForUpdates(', off);
  const listeners = src.indexOf("autoUpdater.on('update-available'");
  assert.ok(off < listeners, 'set while configuring, before the listeners and the first check');
  assert.ok(firstCheck === -1 || off < firstCheck);
});

test('electron-updater still picks a same-suffix release when prereleases are allowed', () => {
  // The behaviour the line above opts out of; if a future electron-updater
  // stops doing this, the bridge is no longer needed but stays harmless.
  const gh = fs.readFileSync(require.resolve('electron-updater/out/providers/GitHubProvider.js'), 'utf8');
  assert.match(gh, /isNextPreRelease = hrefChannel && hrefChannel === currentChannel/);
  assert.match(gh, /getLatestTagName\(cancellationToken\)/);
});
