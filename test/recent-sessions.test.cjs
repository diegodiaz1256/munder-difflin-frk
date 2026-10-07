'use strict';
// Restore resumes the newest of an agent's OWN sessions that has a transcript
// (hive.recentSessions): an empty restart must not bury the real conversation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { HiveManager } = loadTs('src/main/hive.ts');

test('sessions come newest first, recorded one first, only this agent\'s', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-sessions-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  hive.ensureHive();
  const reg = { godId: null, agents: { 'kevin-1': { id: 'kevin-1', name: 'Kevin', cwd: home } } };
  fs.writeFileSync(path.join(hive.root(), 'registry.json'), JSON.stringify(reg));
  hive.recordSession('kevin-1', 'real-277');
  hive.recordSession('kevin-1', 'empty-0af');
  fs.appendFileSync(path.join(hive.root(), 'log.jsonl'), JSON.stringify({ kind: 'session', agentId: 'other', sessionId: 'not-kevins' }) + '\n');
  hive.recordSession('kevin-1', 'empty-82b');
  assert.deepEqual(hive.recentSessions('kevin-1'), ['empty-82b', 'empty-0af', 'real-277']);
  assert.ok(!hive.recentSessions('kevin-1').includes('not-kevins'));
});
