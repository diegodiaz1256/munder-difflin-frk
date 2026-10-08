'use strict';
// A deliverable's history said "App" instead of the agent that wrote it: the
// app's batched commit swept the file in before the agent's own commit (3 s
// later). Held files now wait for their author; each version has a diff.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: {} };
const { HiveManager } = loadTs('src/main/hive.ts');

test('the batched commit leaves a held deliverable to its author; each version has a diff', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-dlv-author-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'jim', name: 'Jim', provider: 'claude', cwd: home }, {});
  const root = hive.root();
  fs.mkdirSync(path.join(root, 'research'), { recursive: true });
  fs.writeFileSync(path.join(root, 'research', 'plan.md'), '# Plan\nstep one\n');
  hive.holdDeliverables(['research/plan.md']);
  hive.commit('hive: batch');
  assert.deepEqual(hive.fileHistory('research/plan.md'), [], 'not swept into the app commit');
  hive.commitDeliverables(['research/plan.md'], { id: 'jim', name: 'Jim' });
  fs.writeFileSync(path.join(root, 'research', 'plan.md'), '# Plan\nstep one\nstep two\n');
  hive.holdDeliverables(['research/plan.md']);
  hive.commit('hive: batch');
  hive.commitDeliverables(['research/plan.md'], { id: 'jim', name: 'Jim' });
  const h = hive.fileHistory('research/plan.md');
  assert.deepEqual(h.map((v) => v.author), ['Jim', 'Jim']);
  const diff = hive.fileDiff('research/plan.md', h[0].hash);
  assert.match(diff, /^\+step two$/m);
  assert.doesNotMatch(diff, /^-step one$/m);
  assert.equal(hive.fileDiff('research/plan.md', 'not-a-hash'), null);
});
