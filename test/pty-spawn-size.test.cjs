'use strict';
/**
 * A new process under a PTY id starts at the size its terminal was last
 * fitted to. After the missing-CLI installer, Claude was relaunched at the
 * 100x30 default while the terminal showed about 20 rows: its first-run theme
 * menu, drawn on rows 23-29, piled onto the last visible row.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { spawnSize, DEFAULT_PTY_SIZE } = loadTs('src/shared/ptySize.ts');

test('a fitted terminal wins over the spawn default', () => {
  assert.deepEqual(spawnSize({ cols: 100, rows: 30 }, { cols: 84, rows: 21 }), { cols: 84, rows: 21 });
});

test('first spawn of an id uses what was asked, else the default', () => {
  assert.deepEqual(spawnSize({ cols: 120, rows: 32 }, undefined), { cols: 120, rows: 32 });
  assert.deepEqual(spawnSize({}, undefined), DEFAULT_PTY_SIZE);
  assert.deepEqual(spawnSize({ cols: 120, rows: 32 }, { cols: 0, rows: 0 }), { cols: 120, rows: 32 });
});

test('PtyManager remembers each resize and spawns with it', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/main/pty.ts'), 'utf8');
  assert.match(src, /spawnSize\(\{ cols: opts\.cols, rows: opts\.rows \}, this\.fitted\.get\(opts\.id\)\)/);
  assert.match(src, /resize\(id: string, cols: number, rows: number\)[^]*?this\.fitted\.set\(id, \{ cols, rows \}\);[^]*?this\.sessions\.get\(id\)/, 'stored before the no-session early return');
});
