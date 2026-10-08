'use strict';
// The app's hive commits no longer block Electron's main thread: they are
// queued, coalesced and run as async git children. Deliverables still commit
// as their authors, and a quit commits whatever is still queued.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: {} };
const { HiveManager } = loadTs('src/main/hive.ts');

async function office(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-async-commit-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'jim', name: 'Jim', provider: 'claude', cwd: home }, {});
  const root = hive.root();
  const log = () => execFileSync('git', ['-C', root, 'log', '--format=%an|%s'], { encoding: 'utf8' }).trim().split('\n');
  return { hive, root, log };
}

test('commit() returns at once; changes in a burst become one async commit', async (t) => {
  const { hive, root, log } = await office(t);
  hive.setAsyncCommits(true);
  const before = log().length;
  const started = Date.now();
  for (let i = 0; i < 5; i++) {
    fs.writeFileSync(path.join(root, `note-${i}.md`), `n${i}`);
    hive.commit(`hive: note ${i}`);
  }
  assert.ok(Date.now() - started < 100, 'nothing waited on git');
  assert.equal(log().length, before, 'not committed yet');
  await hive.flushCommits();
  const after = log();
  assert.equal(after.length, before + 1, 'one commit for the burst');
  assert.match(after[0], /^Hive\|hive: 5 changes: hive: note 0; hive: note 1/);
});

test('a deliverable commits as its author before the batch, and quit flushes the queue', async (t) => {
  const { hive, root, log } = await office(t);
  hive.setAsyncCommits(true);
  fs.mkdirSync(path.join(root, 'research'), { recursive: true });
  fs.writeFileSync(path.join(root, 'research', 'r.md'), '# r');
  hive.holdDeliverables(['research/r.md']);
  fs.writeFileSync(path.join(root, 'board.md'), 'x');
  hive.commit('hive: board');
  hive.commitDeliverables(['research/r.md'], { id: 'jim', name: 'Jim' });
  await hive.flushCommits();
  assert.deepEqual(hive.fileHistory('research/r.md').map((v) => v.author), ['Jim']);
  fs.writeFileSync(path.join(root, 'board.md'), 'y');
  hive.commit('hive: board again');
  hive.flushCommitsSync();
  assert.match(log()[0], /^Hive\|hive: 1 change\(s\) at quit/);
});

test('registry() is cached until the hive writes it, and hands out copies', async (t) => {
  const { hive } = await office(t);
  const a = hive.registry();
  a.agents.jim.name = 'changed by a caller';
  assert.equal(hive.registry().agents.jim.name, 'Jim', 'a caller cannot edit the cache');
  hive.renameAgent('jim', 'James');
  assert.equal(hive.registry().agents.jim.name, 'James', 'the hive write is seen at once');
});
