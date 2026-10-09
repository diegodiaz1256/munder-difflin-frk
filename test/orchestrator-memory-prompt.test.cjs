'use strict';
// The orchestrator's memory is the office's record of delegated work. With the
// worker wording ("at the END of a task, append what you learned") a live
// research job left it empty: its work never ends and it learns little itself.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { HiveManager } = loadTs('src/main/hive.ts');

async function identityOf(t, meta) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-god-mem-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  hive.ensureHive();
  const inj = await hive.ensureAgent({ cwd: home, ...meta }, {});
  const args = inj.args ?? [];
  return args[args.indexOf('--append-system-prompt') + 1] ?? '';
}

test('the orchestrator records each delegated job in its memory', async (t) => {
  const text = await identityOf(t, { id: 'god', name: 'Michael', provider: 'claude', isGod: true });
  assert.match(text, /Whenever a job you delegated finishes, fails or is dropped, append ONE dated bullet under Decisions/);
  assert.match(text, /crashed temp/);
  assert.doesNotMatch(text, /At the END of a task, append what you learned/);
});

test('workers keep the learn-at-the-end rule', async (t) => {
  const text = await identityOf(t, { id: 'jim', name: 'Jim', provider: 'claude' });
  assert.match(text, /At the END of a task, append what you learned to memory\.md/);
  assert.doesNotMatch(text, /job you delegated/);
});
