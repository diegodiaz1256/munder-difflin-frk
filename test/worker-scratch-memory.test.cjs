'use strict';
// A finished temp's hive folder is cleared, but what it learned stays: Memory
// reads agents/<id>/memory.md for archived temps too.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { clearWorkerScratch } = loadTs('src/main/workerScratch.ts');

function scratch(t, memory) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-scratch-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'inbox'));
  fs.writeFileSync(path.join(dir, 'inbox', 'm1.json'), '{}');
  fs.writeFileSync(path.join(dir, 'settings.json'), '{}');
  if (memory !== undefined) fs.writeFileSync(path.join(dir, 'memory.md'), memory);
  return dir;
}

test('a temp that wrote notes keeps only its memory', (t) => {
  const dir = scratch(t, '# Memory\n\n## Findings\n\n- ETag gives strong validation\n');
  clearWorkerScratch(dir);
  assert.deepEqual(fs.readdirSync(dir), ['memory.md']);
});

test('an empty memory template goes with the folder', (t) => {
  const dir = scratch(t, '# Memory\n\n_One dated bullet each._\n\n## Findings\n\n## Log\n');
  clearWorkerScratch(dir);
  assert.equal(fs.existsSync(dir), false);
});

test('no memory at all: the folder goes', (t) => {
  const dir = scratch(t);
  clearWorkerScratch(dir);
  assert.equal(fs.existsSync(dir), false);
});
