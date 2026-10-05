'use strict';
// The orchestrator delegates through the office: Claude Code's own sub-agent
// tool is switched off for it, so "put an agent on it" becomes a worker the
// office sees (src/main/hive.ts).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { HiveManager } = loadTs('src/main/hive.ts');

async function spawn(t, meta) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-nosub-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  return hive.ensureAgent({ provider: 'claude', cwd: home, ...meta }, {});
}

test('the orchestrator cannot start sub-agents inside its own session', async (t) => {
  const inj = await spawn(t, { id: 'god', name: 'Michael', isGod: true });
  const i = inj.args.indexOf('--disallowedTools');
  assert.ok(i >= 0, inj.args.join(' '));
  assert.deepEqual(inj.args.slice(i + 1, i + 3), ['Agent', 'Task']);
  assert.ok(inj.args[i + 3].startsWith('--'), 'the next option ends the tool list');
  const prompt = inj.args[inj.args.indexOf('--append-system-prompt') + 1];
  assert.match(prompt, /sub-agent tool is switched off/);
});

test('workers keep their tools', async (t) => {
  const inj = await spawn(t, { id: 'pam', name: 'Pam' });
  assert.equal(inj.args.includes('--disallowedTools'), false);
});
