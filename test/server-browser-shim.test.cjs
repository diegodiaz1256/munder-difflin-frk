'use strict';
// The server edition has no Chromium: building it failed once the office
// browser imported electron's `session` ("No matching export … for import
// session"), which stopped the fork.31 release. The shim now has one that
// says why the browser is unavailable.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('the server shim exports session, and it explains there is no browser', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/server/electronShim.ts'), 'utf8');
  assert.match(src, /export const session = \{/);
  assert.match(src, /the server edition has no Chromium/);
  assert.match(src, /webUtils, session, get ipcRenderer/);
});
