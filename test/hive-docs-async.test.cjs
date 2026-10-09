'use strict';
// At boot the protocol docs are refreshed off the main thread, writing only
// the ones whose text changed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { HiveManager } = loadTs('src/main/hive.ts');

test('refreshGeneratedDocsAsync restores changed or missing docs and leaves the rest alone', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-docs-async-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  hive.ensureHive();
  const root = path.join(home, 'hive');
  const index = path.join(root, 'PROTOCOL.md');
  const want = fs.readFileSync(index, 'utf8');
  fs.writeFileSync(index, 'stale');
  const topic = fs.readdirSync(path.join(root, 'protocol'))[0];
  fs.rmSync(path.join(root, 'protocol', topic));
  const untouched = path.join(root, 'COMMANDS.md');
  const before = fs.statSync(untouched).mtimeMs;
  await new Promise((r) => setTimeout(r, 20));
  await hive.refreshGeneratedDocsAsync();
  assert.equal(fs.readFileSync(index, 'utf8'), want, 'a changed doc is rewritten');
  assert.ok(fs.existsSync(path.join(root, 'protocol', topic)), 'a missing doc is written');
  assert.equal(fs.statSync(untouched).mtimeMs, before, 'an unchanged doc is not rewritten');
});
