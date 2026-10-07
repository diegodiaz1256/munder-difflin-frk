'use strict';
// The Manager view said nothing while the office was starting (Michael showed
// as "idle"), and nothing when the orchestrator failed; the Floor view did both.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { officeStarting } = loadTs('src/renderer/src/pro/bootState.ts');

test('starting while the orchestrator spawns or its terminal has printed nothing', () => {
  assert.equal(officeStarting('booting', false), true);
  assert.equal(officeStarting('ready', false), true, 'spawned, but its terminal is still silent');
  assert.equal(officeStarting('ready', true), false);
  assert.equal(officeStarting('failed', false), false, 'a failure is its own alert');
});

test('every Manager page carries the banner', () => {
  const shell = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/src/pro/ProShell.tsx'), 'utf8');
  // The sidebar toggle may sit above it; the banner still leads every page.
  assert.match(shell, /<main className="pro-main">[\s\S]*?<BootBanner \/>\{page\}\s*<\/main>/);
  const banner = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/src/pro/BootBanner.tsx'), 'utf8');
  assert.match(banner, /godStatus === 'failed' && godError/, 'the failure is shown in Manager too');
});
