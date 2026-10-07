'use strict';
// Deliverables keep a history with an author (hive.commitDeliverables): what an
// agent writes in research/ is committed as that agent, so the app can say who
// changed each file, list its versions and show an old one.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { HiveManager } = loadTs('src/main/hive.ts');

test('deliverable commits carry the agent as author; history and old versions come back', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-dlv-hist-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  hive.ensureHive();
  const root = hive.root();
  fs.mkdirSync(path.join(root, 'research', 'reports'), { recursive: true });
  const file = path.join(root, 'research', 'reports', 'plan.md');
  const rel = 'research/reports/plan.md';

  fs.writeFileSync(file, 'v1');
  hive.commitDeliverables([rel], { id: 'jim-1', name: 'Jim' });
  fs.writeFileSync(file, 'v2');
  fs.writeFileSync(path.join(root, 'board.md'), 'unrelated change');
  hive.commitDeliverables([rel], { id: 'pam-2', name: 'Pam <evil>' });

  const versions = hive.fileHistory(rel);
  assert.deepEqual(versions.map((v) => v.author), ['Pam evil', 'Jim'], 'newest first, angle brackets stripped');
  assert.equal(hive.fileAt(rel, versions[1].hash), 'v1');
  assert.equal(hive.fileAt(rel, versions[0].hash), 'v2');
  assert.equal(hive.fileAt(rel, 'not-a-hash'), null);
  assert.equal(hive.fileAt('../outside', versions[0].hash), null);

  const authors = hive.fileAuthors('research');
  assert.deepEqual(authors[rel].authors, ['Pam evil', 'Jim']);
  assert.equal(authors[rel].last, 'Pam evil');

  // Only the deliverable was committed: other pending hive changes wait.
  assert.ok(!hive.fileHistory('board.md').some((v) => v.author === 'Pam evil'));
});
