'use strict';
// Memory status is polled every few seconds. A found mempalace path is kept
// (no `where` process per poll), a missing one is looked for again at most
// every 30 s, and a found one that disappears is looked for at once.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { app: { getPath: () => os.tmpdir() } } };
const { MemoryManager } = loadTs('src/main/memory.ts');

function manager() {
  const m = new MemoryManager(() => null, () => ({ enabled: false, model: 'minilm' }));
  let resets = 0;
  const reset = m.resetBinCache.bind(m);
  m.resetBinCache = () => { resets++; reset(); m.binCache = m.__next; m.binCheckedAt = Date.now(); };
  return { m, resets: () => resets };
}

test('a found path that still exists is kept across polls', () => {
  const { m, resets } = manager();
  m.binCache = process.execPath; m.binCheckedAt = Date.now(); m.__next = process.execPath;
  for (let i = 0; i < 5; i++) m.refresh();
  assert.equal(resets(), 0);
});

test('a found path that disappeared is looked for again at once', () => {
  const { m, resets } = manager();
  m.binCache = 'C:/nowhere/mempalace.exe'; m.binCheckedAt = Date.now(); m.__next = null;
  m.refresh();
  assert.equal(resets(), 1);
});

test('a missing mempalace is looked for again only after 30 s', () => {
  const { m, resets } = manager();
  m.binCache = null; m.binCheckedAt = Date.now(); m.__next = null;
  m.refresh(); m.refresh();
  assert.equal(resets(), 0, 'not on every poll');
  m.binCheckedAt = Date.now() - 31_000;
  m.refresh();
  assert.equal(resets(), 1);
});
